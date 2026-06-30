/**
 * Broker activities — the market maker's side effects. The broker claims orders by
 * priority (demand), batch-locks the printer set it anticipated (supply), hands each
 * printer its job, and — once the printer reports — settles the order. The escalation
 * queue is the rendezvous bus for every handoff.
 *
 *   claimOrdersForCapacity   → anticipate free printers, claim that many orders by priority
 *   lockPrintersAndHandoff   → best-effort batch-claim printers, hand each its job
 *   settleOrder              → resolve an order's insoles and wake the order workflow
 */

import { createClient } from '@hotmeshio/long-tail';
import type { ClaimedGroup } from '@hotmeshio/long-tail';

import { composePriorityOrder, eligiblePrinterClasses } from '../policy';
import { signalOrder } from './signal';
import {
  ORDER_POND,
  PRINTER_POND,
  PRINT_ROUTING_QUEUE,
  PRINT_WORKFLOWS,
  PRINT_FACETS,
  PRINTER_FACETS,
  PRINTER_STATE,
  DEFAULT_BROKER_CLAIM_MINUTES,
  DEFAULT_MAX_ADVERTS,
  fleetKind,
} from '../types';
import type {
  BrokerData,
  BrokerPairing,
  ClaimPlan,
  ClaimedOrderBucket,
  PrinterJobPayload,
  PrintCallbackPayload,
  SizeClass,
} from '../types';

// ── Step 1: anticipate capacity, claim orders by priority ────────────────────

/**
 * Read the free printers (availability is a query, not a hash), bucket them by
 * capability, and claim that many complete orders per bucket in PRIORITY order —
 * the ordered, pluggable rule list the broker was handed, not a fixed sort.
 * Claiming demand sized to anticipated supply keeps priority the deciding factor
 * and stops the broker from over-claiming orders it cannot place.
 */
export async function claimOrdersForCapacity(input: BrokerData): Promise<ClaimPlan> {
  const kind = fleetKind(input.diabetic);
  const orderPond = ORDER_POND[kind];
  const printerPond = PRINTER_POND[kind];
  const orderBy = composePriorityOrder(input.priorityRules);
  const durationMinutes = input.claimMinutes ?? DEFAULT_BROKER_CLAIM_MINUTES;

  // The broker runs as its operator — a principal holding the printer + order pond
  // roles. Bind the auth once on the SDK client; every call goes through it.
  const lt = createClient({ auth: { userId: input.brokerId } });

  const ready = await lt.escalations.searchByFacets({
    role: printerPond,
    status: 'pending',
    available: true,
    facets: { [PRINTER_FACETS.STATE]: PRINTER_STATE.READY },
    limit: input.maxAdverts ?? DEFAULT_MAX_ADVERTS,
  });
  if (ready.status !== 200) throw new Error(`searchByFacets failed: ${ready.error}`);
  const { escalations } = ready.data;

  // Free printers per filament, split by size — xl is the scarce, larger machine.
  const capacity = new Map<string, { xl: number; std: number }>();
  for (const e of escalations) {
    const m = (e.metadata ?? {}) as Record<string, any>;
    const filament = m[PRINTER_FACETS.FILAMENT];
    const sizeClass = m[PRINTER_FACETS.SIZE_CLASS] as SizeClass;
    const slot = capacity.get(filament) ?? { xl: 0, std: 0 };
    if (sizeClass === 'xl') slot.xl += 1;
    else slot.std += 1;
    capacity.set(filament, slot);
  }

  const claim = async (filament: string, sizeClass: SizeClass, limit: number): Promise<ClaimedGroup[]> => {
    const res = await lt.escalations.claimGroups({
      query: {
        role: orderPond,
        available: true,
        facets: { [PRINT_FACETS.FILAMENT]: filament, [PRINT_FACETS.SIZE_CLASS]: sizeClass },
        orderBy,
      },
      limit,
      durationMinutes,
      sizeFacet: PRINT_FACETS.ORDER_SIZE,
    });
    if (res.status !== 200) throw new Error(`claimGroups failed: ${res.error}`);
    return res.data.groups;
  };

  const buckets: ClaimedOrderBucket[] = [];
  let matched = 0;
  for (const [filament, { xl, std }] of capacity) {
    // xl orders claim xl printers first (the scarce resource, a hard fit).
    const xlGroups = xl > 0 ? await claim(filament, 'xl', xl) : [];
    // standard orders fall to standard printers, with leftover xl printers as overflow.
    const stdCapacity = std + (xl - xlGroups.length);
    const stdGroups = stdCapacity > 0 ? await claim(filament, 'standard', stdCapacity) : [];
    // Push xl before standard so the lock step spends xl printers on xl orders first.
    if (xlGroups.length) { buckets.push({ filament, sizeClass: 'xl', groups: xlGroups }); matched += xlGroups.length; }
    if (stdGroups.length) { buckets.push({ filament, sizeClass: 'standard', groups: stdGroups }); matched += stdGroups.length; }
  }
  return { buckets, matched };
}

// ── Step 2: batch-lock the printer set, hand off the jobs ────────────────────

/**
 * For each claimed order, atomically lock exactly N printers — one per insole — then
 * hand each printer its individual job. Every insole of an order prints in parallel
 * on its own dedicated machine. `allOrNone: true` guarantees the full set is claimed
 * or the order is carried; partial printer sets never leave an order half-started.
 *
 * A standard order tries standard-class printers first; if unavailable it overflows
 * to xl. An xl order is xl-only. `phase` namespaces callback keys so multiple lock
 * passes in one tick stay unique.
 */
export async function lockPrintersAndHandoff(input: {
  diabetic: boolean;
  /** Broker operator — holds the printer pond role (resolves adverts via the public API). */
  brokerId: string;
  brokerWorkflowId: string;
  tick: number;
  phase: string;
  claimMinutes?: number;
  buckets: ClaimedOrderBucket[];
}): Promise<{ pairings: BrokerPairing[]; unplaced: ClaimedOrderBucket[] }> {
  const kind = fleetKind(input.diabetic);
  const printerPond = PRINTER_POND[kind];
  const durationMinutes = input.claimMinutes ?? DEFAULT_BROKER_CLAIM_MINUTES;
  const pairings: BrokerPairing[] = [];
  const unplaced: ClaimedOrderBucket[] = [];
  let seq = 0;

  // The broker runs as its operator (printer pond role) — auth bound once on the client.
  const lt = createClient({ auth: { userId: input.brokerId } });

  for (const bucket of input.buckets) {
    const bucketUnplaced: ClaimedGroup[] = [];

    for (const group of bucket.groups) {
      const needed = group.members.length;
      let placed = false;

      // Try each eligible printer class in order (standard first, xl as overflow).
      // allOrNone=true: either we claim all N printers or none — never a partial set.
      for (const printerClass of eligiblePrinterClasses(bucket.sizeClass)) {
        const locked = await lt.escalations.claimByFacets({
          query: {
            role: printerPond,
            facets: {
              [PRINTER_FACETS.STATE]: PRINTER_STATE.READY,
              [PRINTER_FACETS.FILAMENT]: bucket.filament,
              [PRINTER_FACETS.SIZE_CLASS]: printerClass,
            },
          },
          limit: needed,
          allOrNone: true,
          durationMinutes,
        });
        if (locked.status !== 200) throw new Error(`claimByFacets failed: ${locked.error}`);
        const printers = locked.data.claimed;

        if (printers.length === needed) {
          // Full set acquired — hand each printer exactly one insole job.
          for (let i = 0; i < needed; i++) {
            const advert = printers[i];
            const m = (advert.metadata ?? {}) as Record<string, any>;
            const printerId = m[PRINTER_FACETS.PRINTER_ID];
            const callbackKey = `cb-${input.brokerWorkflowId}-${printerId}-t${input.tick}-${input.phase}${seq++}`;
            const job: PrinterJobPayload = {
              orderId: group.originId,
              units: 1,
              callbackKey,
              brokerWorkflowId: input.brokerWorkflowId,
            };
            // Resolve as the broker operator — atomic: marks advert resolved AND wakes
            // the parked printer with its job in a single call.
            await lt.escalations.resolve({ id: advert.id, resolverPayload: job });
            pairings.push({ callbackKey, printerId, group });
          }
          placed = true;
          break;
        }
        // Fewer than needed available in this class — allOrNone rolled back; try overflow.
      }

      if (!placed) {
        bucketUnplaced.push(group);
      }
    }

    if (bucketUnplaced.length) {
      unplaced.push({ filament: bucket.filament, sizeClass: bucket.sizeClass, groups: bucketUnplaced });
    }
  }
  return { pairings, unplaced };
}

// ── Step 3: settle an order once its printer reports done ────────────────────

export async function settleOrder(input: {
  group: ClaimedGroup;
  printerId: string;
  done: PrintCallbackPayload;
  /** Broker operator — a principal holding the order pond role (RBAC). */
  brokerId: string;
}): Promise<void> {
  const { group, printerId, done, brokerId } = input;
  // One set-based resolve over the whole origin group — `WHERE id = ANY AND
  // status='pending'` in a single statement. Members are bookkeeping demand adverts
  // (no signal_key); the order is woken collectively by the signalOrder below, so no
  // per-row signal delivery is needed and the N+1 loop (partial-failure window) is gone.
  const lt = createClient({ auth: { userId: brokerId } });
  await lt.escalations.resolveByIds({ ids: group.members.map((m) => m.id), resolverPayload: { printerId } });
  const head = group.members[0];
  const meta = (head.metadata ?? {}) as Record<string, any>;
  await signalOrder({
    taskQueue: head.task_queue ?? PRINT_ROUTING_QUEUE,
    workflowType: head.workflow_type ?? PRINT_WORKFLOWS.ORDER,
    workflowId: head.workflow_id ?? '',
    signalId: meta[PRINT_FACETS.ORDER_SIGNAL],
    data: {
      orderId: group.originId,
      printerId,
      role: head.role,
      units: group.members.length,
      completedAt: done.completedAt,
    },
  });
}

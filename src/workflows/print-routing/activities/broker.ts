/**
 * Broker activities — the market maker's side effects.
 *
 *   dispatchBatch          → the hot loop: scan both ponds, match orders to printers,
 *                            hand off jobs. Runs N iterations internally so the workflow
 *                            only checkpoints once per batch, not once per iteration.
 *   settleOrder            → resolve an order's insoles and wake the order workflow.
 *
 * `claimOrdersForCapacity` and `lockPrintersAndHandoff` are internal helpers called
 * directly by `dispatchBatch` (no proxy overhead — plain async functions in the same
 * activity context).
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

// ── Internal: anticipate capacity, claim orders by priority ──────────────────

async function claimOrdersForCapacity(input: {
  diabetic: boolean;
  brokerId: string;
  priorityRules?: string[];
  claimMinutes?: number;
  maxAdverts?: number;
}): Promise<ClaimPlan> {
  const kind = fleetKind(input.diabetic);
  const orderPond = ORDER_POND[kind];
  const printerPond = PRINTER_POND[kind];
  const orderBy = composePriorityOrder(input.priorityRules);
  const durationMinutes = input.claimMinutes ?? DEFAULT_BROKER_CLAIM_MINUTES;

  const lt = createClient({ auth: { userId: input.brokerId } });

  const ready = await lt.escalations.searchByFacets({
    role: printerPond,
    status: 'pending',
    available: true,
    facets: { [PRINTER_FACETS.STATE]: PRINTER_STATE.READY },
    limit: input.maxAdverts ?? DEFAULT_MAX_ADVERTS,
  });
  if (ready.status !== 200) throw new Error(`searchByFacets failed: ${ready.error}`);

  const capacity = new Map<string, { xl: number; std: number }>();
  for (const e of ready.data.escalations) {
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
    const xlGroups = xl > 0 ? await claim(filament, 'xl', xl) : [];
    const stdCapacity = std + (xl - xlGroups.length);
    const stdGroups = stdCapacity > 0 ? await claim(filament, 'standard', stdCapacity) : [];
    if (xlGroups.length) { buckets.push({ filament, sizeClass: 'xl', groups: xlGroups, diabetic: input.diabetic }); matched += xlGroups.length; }
    if (stdGroups.length) { buckets.push({ filament, sizeClass: 'standard', groups: stdGroups, diabetic: input.diabetic }); matched += stdGroups.length; }
  }
  return { buckets, matched };
}

// ── Internal: batch-lock the printer set, hand off the jobs ──────────────────

async function lockPrintersAndHandoff(input: {
  diabetic: boolean;
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

  const lt = createClient({ auth: { userId: input.brokerId } });

  for (const bucket of input.buckets) {
    const bucketUnplaced: ClaimedGroup[] = [];

    for (const group of bucket.groups) {
      const needed = group.members.length;
      let placed = false;

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
          for (let i = 0; i < needed; i++) {
            const advert = printers[i];
            const m = (advert.metadata ?? {}) as Record<string, any>;
            const printerId = m[PRINTER_FACETS.PRINTER_ID];
            const callbackKey = `cb-${input.brokerWorkflowId}-${printerId}-t${input.tick}-${input.phase}${seq++}`;
            const job: PrinterJobPayload = { orderId: group.originId, units: 1, callbackKey, brokerWorkflowId: input.brokerWorkflowId };
            await lt.escalations.resolve({ id: advert.id, resolverPayload: job });
            pairings.push({ callbackKey, printerId, group, diabetic: input.diabetic });
          }
          placed = true;
          break;
        }
      }

      if (!placed) bucketUnplaced.push(group);
    }

    if (bucketUnplaced.length) {
      unplaced.push({ filament: bucket.filament, sizeClass: bucket.sizeClass, groups: bucketUnplaced, diabetic: input.diabetic });
    }
  }
  return { pairings, unplaced };
}

// ── dispatchBatch — the hot loop activity ─────────────────────────────────────

/**
 * The broker's hot path. Runs `maxIterations` iterations internally — no durable
 * checkpoint per iteration, only one when the activity returns. Each iteration:
 *   1. Serve both ponds (standard + diabetic) in sequence.
 *   2. Place any carried orders (already claimed, aging).
 *   3. If the backlog is clear, claim fresh demand sized to available printers.
 *   4. Sleep `activeSleepMs` if work was done, `idleSleepMs` if idle.
 *
 * Returns all pairings accumulated across iterations (the workflow opens their
 * callback conditions and settles once all printers report back).
 */
export async function dispatchBatch(input: {
  brokerId: string;
  brokerWorkflowId: string;
  tick: number;
  priorityRules?: string[];
  claimMinutes?: number;
  maxAdverts?: number;
  maxIterations: number;
  idleSleepMs: number;
  activeSleepMs: number;
  carried: ClaimedOrderBucket[];
}): Promise<{ pairings: BrokerPairing[]; unplaced: ClaimedOrderBucket[]; didWork: boolean }> {
  const allPairings: BrokerPairing[] = [];
  let carried = input.carried;
  let totalPlaced = 0;

  for (let i = 0; i < input.maxIterations; i++) {
    let iterationPlaced = 0;
    const newCarried: ClaimedOrderBucket[] = [];

    for (const diabetic of [false, true] as const) {
      try {
        const kindCarried = carried.filter(b => b.diabetic === diabetic);

        // Place carries for this pond first.
        if (kindCarried.length > 0) {
          const r = await lockPrintersAndHandoff({
            diabetic, brokerId: input.brokerId, brokerWorkflowId: input.brokerWorkflowId,
            tick: input.tick, phase: `i${i}k${diabetic ? 1 : 0}c`, claimMinutes: input.claimMinutes,
            buckets: kindCarried,
          });
          allPairings.push(...r.pairings);
          newCarried.push(...r.unplaced);
          iterationPlaced += r.pairings.length;
        }

        // Claim fresh demand only when the backlog for this pond is clear.
        const stillCarrying = newCarried.some(b => b.diabetic === diabetic);
        if (!stillCarrying) {
          const fresh = await claimOrdersForCapacity({
            diabetic, brokerId: input.brokerId,
            priorityRules: input.priorityRules, claimMinutes: input.claimMinutes, maxAdverts: input.maxAdverts,
          });
          if (fresh.matched > 0) {
            const r = await lockPrintersAndHandoff({
              diabetic, brokerId: input.brokerId, brokerWorkflowId: input.brokerWorkflowId,
              tick: input.tick, phase: `i${i}k${diabetic ? 1 : 0}f`, claimMinutes: input.claimMinutes,
              buckets: fresh.buckets,
            });
            allPairings.push(...r.pairings);
            newCarried.push(...r.unplaced);
            iterationPlaced += r.pairings.length;
          }
        }
      } catch (err: any) {
        // Skip ponds we don't have permission to access — this lets the broker
        // operator hold only a subset of pond roles without crashing the activity.
        if (err?.message?.includes('role with full') || err?.message?.includes('403')) continue;
        throw err;
      }
    }

    carried = newCarried;
    totalPlaced += iterationPlaced;

    const sleepMs = (iterationPlaced > 0 || carried.length > 0) ? input.activeSleepMs : input.idleSleepMs;
    await new Promise<void>(r => setTimeout(r, sleepMs));
  }

  return { pairings: allPairings, unplaced: carried, didWork: totalPlaced > 0 };
}

// ── settleOrder — resolve an order once its printer reports done ──────────────

export async function settleOrder(input: {
  group: ClaimedGroup;
  printerId: string;
  done: PrintCallbackPayload;
  brokerId: string;
}): Promise<void> {
  const { group, printerId, done, brokerId } = input;
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

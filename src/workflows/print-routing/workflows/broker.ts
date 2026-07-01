/**
 * printBroker — the singleton market maker. One per factory floor; idempotently
 * named so crash-and-restart is a no-op. Each outer tick:
 *
 *   1. dispatchBatch (activity)  — inner hot loop: scan both ponds, place carries,
 *                                  claim fresh demand, hand off. Runs maxIterations
 *                                  internally before returning so only ONE durable
 *                                  checkpoint fires per batch, not one per iteration.
 *   2. Promise.all(conditions)   — await every printer's callback (event-driven,
 *                                  not polling — resolves instantly for printers
 *                                  that finished during the activity loop).
 *   3. settleOrder × orders      — resolve insoles + signal the order workflow.
 *   4. continueAsNew             — checkpoint carries + cumulative totals.
 *
 * The broker self-terminates after `maxIdleRuns` consecutive dispatchBatch calls
 * that placed nothing and had no carries — useful for bounded test runs.
 * In production set `maxIdleRuns` to a very large number.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope, ClaimedGroup } from '@hotmeshio/long-tail';

import { dispatchBatch, settleOrder, LOOP_DEFAULTS } from './proxy';
import {
  fleetKind,
  PRINTER_POND,
  PRINT_WORKFLOWS,
  PRINTER_FACETS,
  PRINTER_STATE,
} from '../types';
import type {
  BrokerData,
  BrokerTotals,
  BrokerPairing,
  PrintCallbackPayload,
} from '../types';

export async function printBroker(envelope: LTEnvelope): Promise<any> {
  const d = envelope.data as BrokerData;
  const ctx = Durable.workflow.workflowInfo();
  const cumulative: BrokerTotals = d.cumulative ?? { ordersPrinted: 0, runs: 0 };
  const tick = cumulative.runs;

  // ── 1. Dispatch: one activity call, N iterations inside ────────────────────
  const { pairings, unplaced, didWork } = await dispatchBatch({
    brokerId: d.brokerId,
    brokerWorkflowId: ctx.workflowId,
    tick,
    priorityRules: d.priorityRules,
    claimMinutes: d.claimMinutes,
    maxAdverts: d.maxAdverts,
    maxIterations: d.maxIterations ?? LOOP_DEFAULTS.maxIterations,
    idleSleepMs: d.idleSleepMs ?? LOOP_DEFAULTS.idleSleepMs,
    activeSleepMs: d.activeSleepMs ?? LOOP_DEFAULTS.activeSleepMs,
    carried: d.carried ?? [],
  });

  // ── 2. Harvest: await printer callbacks in chunks ─────────────────────────
  // Open conditions in batches of CONDITION_CHUNK to avoid overwhelming the
  // NATS signal bus. Printers that completed during the activity resolve each
  // chunk immediately once their condition row is open — zero additional wait.
  const CONDITION_CHUNK = d.conditionChunkSize ?? 20;
  if (pairings.length) {
    const dones: PrintCallbackPayload[] = [];
    for (let ci = 0; ci < pairings.length; ci += CONDITION_CHUNK) {
      const chunk = pairings.slice(ci, ci + CONDITION_CHUNK);
      const chunkDones = await Promise.all(
        chunk.map((p: BrokerPairing) =>
          Durable.workflow.condition<PrintCallbackPayload>(p.callbackKey, {
            role: PRINTER_POND[fleetKind(p.diabetic)],
            type: PRINT_WORKFLOWS.PRINTER,
            subtype: PRINTER_STATE.PRINTING,
            priority: 2,
            description: `Printer ${p.printerId} printing insole for order ${p.group.originId}`,
            metadata: {
              [PRINTER_FACETS.PRINTER_ID]: p.printerId,
              [PRINTER_FACETS.STATE]: PRINTER_STATE.PRINTING,
              orderId: p.group.originId,
            },
          }),
        ),
      );
      dones.push(...(chunkDones as PrintCallbackPayload[]));
    }

    // ── 3. Settle: group by order, call settleOrder once per order ───────────
    const byOrder = new Map<string, { group: ClaimedGroup; printerIds: string[]; lastDone: PrintCallbackPayload }>();
    for (let i = 0; i < pairings.length; i++) {
      const p = pairings[i];
      const done = dones[i];
      const existing = byOrder.get(p.group.originId);
      if (existing) {
        existing.printerIds.push(done.printerId);
        existing.lastDone = done;
      } else {
        byOrder.set(p.group.originId, { group: p.group, printerIds: [done.printerId], lastDone: done });
      }
    }
    const orderEntries = [...byOrder.values()];
    for (let oi = 0; oi < orderEntries.length; oi += CONDITION_CHUNK) {
      await Promise.all(
        orderEntries.slice(oi, oi + CONDITION_CHUNK).map(({ group, printerIds, lastDone }) =>
          settleOrder({ group, printerId: printerIds[0], done: lastDone, brokerId: d.brokerId }),
        ),
      );
    }
    cumulative.ordersPrinted += byOrder.size;
  }
  cumulative.runs += 1;

  // ── 4. Idle check + continueAsNew ─────────────────────────────────────────
  const maxIdleRuns = d.maxIdleRuns ?? LOOP_DEFAULTS.maxIdleRuns;
  const idleRuns = didWork ? 0 : (d.idleRuns ?? 0) + 1;
  if (idleRuns >= maxIdleRuns) {
    return { type: 'return' as const, data: { ...cumulative, stopped: 'idle' } };
  }

  await Durable.workflow.continueAsNew({
    data: { ...d, cumulative, idleRuns, carried: unplaced },
    metadata: envelope.metadata ?? {},
  } as LTEnvelope);
}

/**
 * farmInspector — the farmer. Signs off completed orders: resolves each order-done
 * signoff escalation, which wakes the parked order (and triggers a reprint of any
 * rejected unit). A looping singleton (run one per fleet; resolution is idempotent
 * by query). The human stand-in; in production a dashboard operator signs off.
 *
 * The scan→resolve hot loop lives inside `inspectorBatch` (a proxy activity that
 * loops with plain-JS sleeps, zero durable cost per pass). The workflow calls it
 * ONCE per batch, then checkpoints via `continueAsNew` — the same efficient shape
 * as the broker's `printBroker`/`dispatchBatch`. No per-tick durable sleep.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';

import { inspectorBatch, LOOP_DEFAULTS } from './proxy';
import type { InspectorData } from '../types';

export async function farmInspector(envelope: LTEnvelope): Promise<any> {
  const d = envelope.data as InspectorData;
  const signedOffSoFar = d.cumulative ?? 0;

  const { resolved, didWork } = await inspectorBatch({
    diabetic: d.diabetic,
    inspectorId: d.inspectorId,
    maxIterations: d.maxIterations ?? LOOP_DEFAULTS.maxIterations,
    activeSleepMs: d.activeSleepMs ?? LOOP_DEFAULTS.activeSleepMs,
    idleSleepMs: d.idleSleepMs ?? LOOP_DEFAULTS.idleSleepMs,
    scanLimit: d.scanLimit ?? LOOP_DEFAULTS.crewScanLimit,
  });
  const total = signedOffSoFar + resolved;

  const maxIdleRuns = d.maxIdleRuns ?? LOOP_DEFAULTS.maxIdleRuns;
  const idleRuns = didWork ? 0 : (d.idleRuns ?? 0) + 1;
  if (idleRuns >= maxIdleRuns) {
    return { type: 'return' as const, data: { signoffs: total, stopped: 'idle' } };
  }

  const nextEnvelope: LTEnvelope = { data: { ...d, cumulative: total, idleRuns }, metadata: envelope.metadata ?? {} };
  await Durable.workflow.continueAsNew(nextEnvelope);
}

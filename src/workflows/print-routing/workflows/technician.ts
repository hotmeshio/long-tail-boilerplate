/**
 * farmTechnician — resolves printer needs-filament adverts ("added filament"). A
 * looping singleton (run one per fleet; resolution is idempotent by query). The
 * human stand-in; in production a dashboard operator claims these.
 *
 * The scan→resolve hot loop lives inside `technicianBatch` (a proxy activity that
 * loops with plain-JS sleeps, zero durable cost per pass). The workflow calls it
 * ONCE per batch, then checkpoints via `continueAsNew` — the same efficient shape
 * as the broker's `printBroker`/`dispatchBatch`. No per-tick durable sleep.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';

import { technicianBatch, LOOP_DEFAULTS } from './proxy';
import type { TechnicianData } from '../types';

export async function farmTechnician(envelope: LTEnvelope): Promise<any> {
  const d = envelope.data as TechnicianData;
  const refillsDone = d.cumulative ?? 0;

  const { resolved, didWork } = await technicianBatch({
    diabetic: d.diabetic,
    technicianId: d.technicianId,
    maxIterations: d.maxIterations ?? LOOP_DEFAULTS.maxIterations,
    activeSleepMs: d.activeSleepMs ?? LOOP_DEFAULTS.activeSleepMs,
    idleSleepMs: d.idleSleepMs ?? LOOP_DEFAULTS.idleSleepMs,
    scanLimit: d.scanLimit ?? LOOP_DEFAULTS.crewScanLimit,
  });
  const total = refillsDone + resolved;

  const maxIdleRuns = d.maxIdleRuns ?? LOOP_DEFAULTS.maxIdleRuns;
  const idleRuns = didWork ? 0 : (d.idleRuns ?? 0) + 1;
  if (idleRuns >= maxIdleRuns) {
    return { type: 'return' as const, data: { refills: total, stopped: 'idle' } };
  }

  const nextEnvelope: LTEnvelope = { data: { ...d, cumulative: total, idleRuns }, metadata: envelope.metadata ?? {} };
  await Durable.workflow.continueAsNew(nextEnvelope);
}

/**
 * Station (efficient) — the atomic-escalation variant of `station`.
 *
 * Legacy `station` is two steps:
 *   await createStationEscalation({...});   // proxyActivity: createEscalation + enrich (2 DB writes)
 *   const resolution = await Durable.workflow.condition(signalId);
 *
 * This collapses both into ONE atomic expression. `conditionLT(signalId, config)`
 * writes the escalation row inside the workflow's Leg1 checkpoint (one commit,
 * crash-safe — no create activity, no enrich) and suspends. `signal_key` is the
 * resume key, so the SAME dashboard resolve (POST /escalations/:id/resolve →
 * Path 0) and day-resolver work unchanged.
 *
 * Sits beside `station` — never replaces it — so the two can be compared on
 * identical work (ortho:pipeline vs ortho:efficient:pipeline).
 */

import { Durable } from '@hotmeshio/hotmesh';

import { conditionLT } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import type { PipelineStep, StepResult } from './types';

export async function stationEfficient(envelope: LTEnvelope): Promise<any> {
  const { stationName, role, instructions } = envelope.data as PipelineStep;

  const ctx = Durable.workflow.workflowInfo();
  const localSignalId = `station-done-${ctx.workflowId}`;

  const resolution = await conditionLT<Record<string, any>>(localSignalId, {
    role,
    type: 'orthoPipeline',
    subtype: stationName,
    priority: 2,
    description: instructions,
    workflowType: 'stationEfficient',
    metadata: { station: stationName },
    envelope: { station: stationName },
  });

  const result: StepResult = {
    stationName,
    resolution,
    completedAt: new Date().toISOString(),
  };

  return { type: 'return' as const, data: result };
}

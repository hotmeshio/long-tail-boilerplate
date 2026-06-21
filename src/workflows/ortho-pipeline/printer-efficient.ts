/**
 * Printer (efficient) — the atomic-escalation variant of `printer`.
 *
 * Same one-expression pattern as `stationEfficient`: the escalation row is
 * written in the workflow's Leg1 checkpoint via `conditionLT(signalId, config)`,
 * no separate create activity, no enrich. In production the printer webhook
 * resolves via POST /escalations/resolve-by-signal-key (it knows the
 * deterministic signal id) and the job resumes in place.
 */

import { Durable } from '@hotmeshio/hotmesh';

import { conditionLT } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import type { PipelineStep, StepResult } from './types';

export async function printerEfficient(envelope: LTEnvelope): Promise<any> {
  const { stationName, role, instructions } = envelope.data as PipelineStep;

  const ctx = Durable.workflow.workflowInfo();
  const localSignalId = `station-done-${ctx.workflowId}`;

  const resolution = await conditionLT<Record<string, any>>(localSignalId, {
    role,
    type: 'orthoPipeline',
    subtype: stationName,
    priority: 2,
    description: instructions,
    workflowType: 'printerEfficient',
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

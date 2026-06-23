/**
 * Station — generic child workflow for the ortho pipeline.
 *
 * Each station:
 *   1. Creates an escalation assigned to its role (via conditionLT Leg1 atomic write)
 *   2. Pauses until a human claims and resolves
 *   3. Returns the result — parent receives via executeChild
 */

import { Durable } from '@hotmeshio/hotmesh';

import { conditionLT } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import type { PipelineStep, StepResult } from './types';

export async function station(envelope: LTEnvelope): Promise<any> {
  const { stationName, role, instructions } = envelope.data as PipelineStep;

  const ctx = Durable.workflow.workflowInfo();
  const localSignalId = `station-done-${ctx.workflowId}`;

  const resolution = await conditionLT<Record<string, any>>(localSignalId, {
    role,
    type: 'orthoPipeline',
    subtype: stationName,
    priority: 2,
    description: instructions,
    workflowType: 'station',
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

/**
 * Station — generic child workflow for the ortho pipeline.
 *
 * Each station:
 *   1. Creates an escalation assigned to its role
 *   2. Pauses (condition) until a human claims and resolves
 *   3. Returns the result — parent receives via executeChild
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import type { PipelineStep, StepResult } from './types';
import * as activities from './activities';

type ActivitiesType = typeof activities;

const { createStationEscalation } =
  Durable.workflow.proxyActivities<ActivitiesType>({ activities });

export async function station(envelope: LTEnvelope): Promise<any> {
  const {
    stationName,
    role,
    instructions,
  } = envelope.data as PipelineStep;

  const ctx = Durable.workflow.workflowInfo();
  const localSignalId = `station-done-${ctx.workflowId}`;

  await createStationEscalation({
    role,
    stationName,
    instructions,
    workflowId: ctx.workflowId,
    workflowType: 'station',
    taskQueue: 'ortho-pipeline',
    signalId: localSignalId,
  });

  const resolution = await Durable.workflow.condition<Record<string, any>>(
    localSignalId,
  ) as Record<string, any>;

  const result: StepResult = {
    stationName,
    resolution,
    completedAt: new Date().toISOString(),
  };

  return { type: 'return' as const, data: result };
}

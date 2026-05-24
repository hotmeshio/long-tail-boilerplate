/**
 * Printer — child workflow for a single 3D printer.
 *
 * In testing: creates an escalation (claim = printer picks up job,
 * resolve = printer done). In production this would be an MQTT
 * publish to the printer's IoT queue + signalIn callback.
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import type { PipelineStep, StepResult } from './types';
import * as activities from './activities';

type ActivitiesType = typeof activities;

const { createStationEscalation } =
  Durable.workflow.proxyActivities<ActivitiesType>({ activities });

export async function printer(envelope: LTEnvelope): Promise<any> {
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
    workflowType: 'printer',
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

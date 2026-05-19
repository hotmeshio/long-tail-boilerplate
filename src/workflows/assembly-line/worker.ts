/**
 * Workstation — child workflow for the assembly line.
 *
 * Each workstation:
 *   1. Creates an escalation assigned to its role (grinder, gluer, etc.)
 *   2. Pauses (condition) until a human claims and resolves the escalation
 *   3. Returns the result — the parent uses executeChild so it gets
 *      the return value directly (no explicit signal needed)
 */

import { Durable } from '@hotmeshio/hotmesh';

import type { LTEnvelope } from '@hotmeshio/long-tail';
import type { StationEnvelopeData, StationResult } from './types';
import * as activities from './activities';

type ActivitiesType = typeof activities;

const { createStationEscalation } =
  Durable.workflow.proxyActivities<ActivitiesType>({ activities });

export async function workstation(envelope: LTEnvelope): Promise<any> {
  const {
    stationName,
    role,
    instructions,
  } = envelope.data as StationEnvelopeData;

  const ctx = Durable.workflow.workflowInfo();
  const localSignalId = `station-done-${ctx.workflowId}`;

  // 1. Create escalation — human sees this in their queue
  await createStationEscalation({
    role,
    stationName,
    instructions,
    workflowId: ctx.workflowId,
    workflowType: 'workstation',
    taskQueue: 'assembly-line',
    signalId: localSignalId,
  });

  // 2. Pause until the human resolves the escalation
  const resolution = await Durable.workflow.condition<Record<string, any>>(
    localSignalId,
  ) as Record<string, any>;

  // 3. Return result — parent receives this via executeChild
  const result: StationResult = {
    stationName,
    resolution,
    completedAt: new Date().toISOString(),
  };

  return { type: 'return' as const, data: result };
}

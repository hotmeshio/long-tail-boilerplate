/**
 * Assembly Line Activities
 *
 * Side-effect functions that run outside the deterministic workflow
 * sandbox. Each is wrapped via proxyActivities so results are
 * checkpointed and replayed on restart.
 *
 * Creates an escalation with signal routing so the resolve API
 * can wake the paused child workflow.
 */

import { EscalationService } from '@hotmeshio/long-tail';

// ── Create station escalation ──────────────────────────────────────

export async function createStationEscalation(input: {
  role: string;
  stationName: string;
  instructions: string;
  workflowId: string;
  workflowType: string;
  taskQueue: string;
  signalId: string;
}): Promise<string> {
  const escalation = await EscalationService.createEscalation({
    type: 'assemblyLine',
    subtype: input.stationName,
    description: input.instructions,
    priority: 2,
    role: input.role,
    envelope: JSON.stringify({ station: input.stationName }),
    workflow_id: input.workflowId,
    task_queue: input.taskQueue,
    workflow_type: input.workflowType,
  });

  await EscalationService.enrichEscalationRouting(
    escalation.id,
    {
      signal_routing: {
        engine: 'durable',
        taskQueue: input.taskQueue,
        workflowType: input.workflowType,
        workflowId: input.workflowId,
        signalId: input.signalId,
      },
    },
    {
      workflowType: input.workflowType,
      workflowId: input.workflowId,
      taskQueue: input.taskQueue,
    },
  );

  return escalation.id;
}


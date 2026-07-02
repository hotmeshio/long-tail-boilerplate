/**
 * taskWorkflow — one durable instance per task (`task-<taskId>`).
 *
 * ONE wait does everything: `conditionLT(signalId, { role, metadata, timeout })`
 * writes a role-gated escalation (the worklist row) AND arms the SLA timer in a
 * single Leg1 checkpoint. The wait settles three ways:
 *   - a resolver payload  → a human resolved it (by metadata: `taskId`)
 *   - `false`             → the SLA timer fired; the row transitions pending → expired
 *   - `null`              → the escalation was cancelled
 *
 * Omit `slaSeconds` for an open-ended wait — same escalation, timer unarmed.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditionLT } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { TASK_QUEUE } from './types';
import type { TaskInput, TaskResult } from './types';

export async function taskWorkflow(envelope: LTEnvelope): Promise<{ type: 'return'; data: TaskResult }> {
  const { taskId, role, slaSeconds, title } = envelope.data as TaskInput;
  const ctx = Durable.workflow.workflowInfo();

  const resolution = await conditionLT<Record<string, unknown>>(`task-${ctx.workflowId}`, {
    role,
    type: 'task',
    subtype: 'review',
    priority: 2,
    description: title ?? `Task ${taskId} needs action`,
    taskQueue: TASK_QUEUE,
    workflowType: 'taskWorkflow',
    metadata: { taskId },
    ...(slaSeconds ? { timeout: `${slaSeconds}s` } : {}),
  });

  if (resolution === false) return { type: 'return' as const, data: { taskId, outcome: 'sla-breach' } };
  if (resolution === null) return { type: 'return' as const, data: { taskId, outcome: 'cancelled' } };
  return { type: 'return' as const, data: { taskId, outcome: 'resolved', resolution } };
}

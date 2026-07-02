/**
 * Task Queue — the provable core of a task-queue runtime for any host application.
 *
 * One durable workflow instance per task (workflowId = `task-<taskId>`): it raises a
 * role-gated escalation (the worklist item), waits under an SLA deadline, and is
 * resolved by metadata (`taskId`). Queue config that a host app would resolve from its
 * own database is passed in the start data here so the example stays self-contained.
 */

/** The HotMesh task queue the worker registers on (an add-on queue for task workflows). */
export const TASK_QUEUE = 'task-addon';

export interface TaskInput {
  /** Business id — ALSO the workflow id (`task-<taskId>`): idempotent start + easy binding. */
  taskId: string;
  /** The role gated to claim/resolve the worklist item. */
  role: string;
  /**
   * SLA: how long a human has before the wait resumes with `false` and the
   * worklist row expires. Omit for an open-ended wait — same escalation,
   * timer unarmed.
   */
  slaSeconds?: number;
  title?: string;
}

export interface TaskResult {
  taskId: string;
  outcome: 'resolved' | 'sla-breach' | 'cancelled';
  /** The resolver payload, when a human resolved it. */
  resolution?: Record<string, unknown>;
}

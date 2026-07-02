# Task Queue — one durable workflow per task

A task is one durable workflow instance (`workflowId = task-<taskId>`) built around one wait:

```ts
const resolution = await conditionLT<Resolution>(signalId, {
  role,                               // who may claim it (the worklist gate)
  metadata: { taskId },               // the key you resolve by
  timeout: `${slaSeconds} seconds`,   // the SLA, durable, in the same commit
});
```

That single atomic write produces both artifacts a task queue needs: the claimable
escalation row (the worklist item, resolvable by `metadata.taskId` from anywhere) and the
durable SLA timer. The race between them settles atomically on both sides:

| settles first | workflow sees | the row becomes | a late actor gets |
|---|---|---|---|
| human resolves | the resolver payload | `resolved` | the timer fires inert |
| SLA timer | `false` | `expired` | `already-expired` on resolve |
| cancel | `null` | `cancelled` | — |

The third column is the auto-completion gate working in both directions: an operator can
never resolve into a workflow that already moved on, and the workflow can never time out a
task a human already handled. Omit `timeout` for an open-ended wait — same call, timer
unarmed.

## The workflow

[`workflow.ts`](./workflow.ts) is the whole runtime:

```ts
export async function taskWorkflow(envelope: LTEnvelope) {
  const { taskId, role, slaSeconds, title } = envelope.data as TaskInput;
  const ctx = Durable.workflow.workflowInfo();

  const resolution = await conditionLT<Record<string, unknown>>(`task-${ctx.workflowId}`, {
    role,
    type: 'task',
    description: title ?? `Task ${taskId} needs action`,
    metadata: { taskId },
    ...(slaSeconds ? { timeout: `${slaSeconds}s` } : {}),
  });

  if (resolution === false) return { type: 'return', data: { taskId, outcome: 'sla-breach' } };
  if (resolution === null)  return { type: 'return', data: { taskId, outcome: 'cancelled' } };
  return { type: 'return', data: { taskId, outcome: 'resolved', resolution } };
}
```

For a full deployment, the proposal's queue loop wraps this same wait: `loadQueue` /
`assign` / `attemptSystemWork` / `recordEvent` / `syncStatus` as `proxyActivities` (with
`retry: { maximumAttempts, backoffCoefficient }` for SYSTEM work), `conditionLT` as the
HUMAN branch, and `hops`/`maxHops` as plain variables in a `while` loop — replay
reconstructs them, so queue advancement and cycle-stopping are ordinary comparisons.
The read-model (`Queue` / `QueueMember` / `Task` / `TaskEvent`) stays untouched Postgres.

## Registered, deliberately unCERTIFIED

Register the worker with a lightweight config — description, invocation gate, schemas —
and **omit `roles`/`consumes`**:

```ts
const taskWorkflowConfig: LTWorkerConfig = {
  description: 'Task queue — one durable instance per task: role-gated wait with an SLA deadline, resolved by metadata (taskId).',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  resolverSchema: { approved: true, notes: '' },
  envelopeSchema: {
    data: { taskId: 'task-001', role: 'reviewer', slaSeconds: 3600, title: 'Review this task' },
  },
};

// start({ workers: [ ... ] })
{ taskQueue: 'task-addon', workflow: taskWorkflow, config: taskWorkflowConfig },
```

The workflow still appears everywhere — invocable, documented, resolvable from the
dashboard — but the interceptor stays a pure pass-through. The wait already carries its
own role gate, so certification (task tracking, config lookups, extra durable legs) adds
nothing here. The entire call history is the trigger, one waiter, and the return.

## Start it — the task id IS the workflow id

`createTask()` writes your Task row, then starts the workflow. The deterministic id makes
creation idempotent: a retried `createTask` collides on the id and no-ops — one task, one
durable instance, always findable by the id you already hold. `signalIn: false` skips the
generic signal-reentry hook this workflow never uses.

```ts
await durableClient.workflow.start({
  args: [{ data: { taskId, role, slaSeconds } }],
  taskQueue: 'task-addon',
  workflowName: 'taskWorkflow',
  workflowId: `task-${taskId}`,
  entity: 'taskWorkflow',
  expire: 86_400,
  signalIn: false,
});
```

(The HTTP invoke route — `POST /api/workflows/taskWorkflow/invoke` with
`{ data, workflowId }` — applies `signalIn: false` for you.)

## Resolve it — by the business key

No escalation id, no workflow handle — just the task id. `resolverPayload` wakes the
workflow; `metadata` merges an outcome patch into the row in the same guarded UPDATE:

```ts
await lt.escalations.resolveByMetadata({
  key: 'taskId',
  value: taskId,
  resolverPayload: { resolution, resolvedById },
  metadata: { resolvedAt: new Date().toISOString() },
});
```

`system.escalation.{id}.created` / `.resolved` / `.expired` fire from the engine on each
transition, so read-model syncing and dashboard refresh both have a push source.

## Run the proof

```bash
docker compose up -d --build   # boots the app + this worker
npm run seed                   # seed users
npm run task:demo              # tests/throughput/11-task.ts over the public HTTP API
```

The demo echoes each `workflowId` as it starts and proves three invariants end-to-end:

1. **Idempotent start** — invoking `task-<taskId>` twice yields one workflow and one
   escalation row.
2. **Resolve by metadata, timer inert** — a 10-minute-SLA task resolved by `taskId` alone
   returns the resolver payload; the armed timer touches nothing.
3. **SLA breach** — a 5-second-SLA task nobody answers: the worklist row is live and
   claimable while waiting, the timer resumes the workflow with `outcome: 'sla-breach'`,
   the row reads `status='expired'`, and a late resolve is refused.

## The proposal's five scenarios, mapped

- **VIP validation (MANUAL, specific users)** — the wait's `role` is the worklist gate;
  roster ∩ RBAC stays an API-layer rule. Add `timeout` where that queue has an SLA.
- **SYSTEM fax-retry** — `proxyActivities` retry config; each miss is a `FAILED`
  TaskEvent, the attempt counting is the engine's.
- **Attempts exhausted → human** — the throw exits the SYSTEM branch, `hops++`, the loop
  re-enters HUMAN with the same wait; an expired row is terminal, so the MOVED hop needs
  no cleanup.
- **Assignee OOO** — read-model release + reassign; the engine side is untouched.
- **All humans out → system first** — the same loop, direction reversed; `hops`/`maxHops`
  bounds any fallback cycle.

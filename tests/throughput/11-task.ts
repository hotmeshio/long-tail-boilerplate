/**
 * 11-task — proves the task-queue patterns a host application needs, over the public HTTP API
 * against a live docker-compose app. Throughput-only (NOT in the CI glob).
 *
 * Every task is ONE wait — conditionLT(signalId, { role, metadata, timeout }) — that
 * yields the role-gated worklist row AND the durable SLA timer in a single Leg1 write.
 * The workflow is registered but unCERTIFIED: the run is pure signal economics — a
 * trigger, one waiter, a return; zero task rows, zero interceptor legs. Three invariants:
 *
 *   1. idempotent start   — starting `task-<taskId>` twice yields ONE task/escalation.
 *   2. resolve by metadata — resolving by `taskId` (no escalation id) wakes the
 *      workflow before the SLA; the resolver payload comes back, the metadata patch
 *      lands on the row, and the armed timer is inert (signal-first semantics).
 *   3. SLA breach          — a short-SLA task nobody resolves: the worklist row is
 *      live and claimable while waiting, the durable timer resumes the workflow with
 *      outcome 'sla-breach', the row transitions to status='expired' engine-side,
 *      and a late resolve-by-metadata finds nothing pending (auto-completion gate).
 *
 * Run on a live app (startup auto-seeds users):
 *   docker compose up -d --build
 *   npm run task:demo
 */

import { login, api, sleep, ts } from './10-shared';

const RUN = process.env.RUN_ID || Math.floor(Date.now() / 1000).toString(36);
const WF = 'taskWorkflow';
const ROLE = 'reviewer';

let failures = 0;
function check(name: string, cond: boolean, detail: string) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name} — ${detail}`);
  if (!cond) failures++;
}

async function invoke(taskId: string, data: Record<string, any>, idempotent = false): Promise<void> {
  try {
    await api('POST', `/api/workflows/${WF}/invoke`, { data, workflowId: `task-${taskId}` });
    console.log(`  → started ${WF} workflowId=task-${taskId} (queue=task-addon)`);
  } catch (err: any) {
    if (!idempotent || !String(err?.message ?? '').includes('Duplicate')) throw err;
    console.log(`  → duplicate start of workflowId=task-${taskId} → no-op (idempotent)`);
  }
}

async function pendingByTask(taskId: string, status = 'pending'): Promise<any[]> {
  const r = await api('GET', `/api/escalations/by-metadata?key=taskId&value=${taskId}&status=${status}`);
  return r?.escalations ?? [];
}

/** Poll until the escalation exists for a task, or time out. */
async function awaitEscalation(taskId: string, timeoutMs = 20_000): Promise<any | null> {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const [e] = await pendingByTask(taskId);
    if (e) return e;
    await sleep(1000);
  }
  return null;
}

/** Poll the workflow result until it returns, or time out. */
async function awaitResult(taskId: string, timeoutMs = 30_000): Promise<any | null> {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    try {
      const r = await api('GET', `/api/workflows/task-${taskId}/result`);
      if (r?.result?.type === 'return') return r.result.data;
    } catch { /* not done */ }
    await sleep(1500);
  }
  return null;
}

// ── 1 + 2. idempotent start, resolve by metadata, metadata patch ────────────────
async function assertResolveByMetadata() {
  console.log('\n[task] 1+2. idempotent start → resolve by metadata → metadata patch');
  const taskId = `${RUN}-a`;

  await invoke(taskId, { taskId, role: ROLE, slaSeconds: 600, title: 'Review A' });
  await invoke(taskId, { taskId, role: ROLE, slaSeconds: 600, title: 'Review A' }, true); // duplicate → no-op

  const esc = await awaitEscalation(taskId);
  check('escalation raised', !!esc, `id=${esc?.id?.slice(0, 8)} role=${esc?.role}`);
  const pending = await pendingByTask(taskId);
  check('idempotent — exactly one', pending.length === 1, `${pending.length} pending for task ${taskId}`);

  // Resolve by the business key only. resolverPayload wakes the workflow; metadata patches the row.
  const resolvedAt = new Date().toISOString();
  await api('POST', '/api/escalations/resolve-by-metadata', {
    key: 'taskId',
    value: taskId,
    resolverPayload: { approved: true, notes: 'looks good' },
    metadata: { resolvedAt },
  });

  const res = await awaitResult(taskId);
  check('resolved by metadata', res?.outcome === 'resolved', `outcome=${res?.outcome}`);
  check('resolver payload delivered', res?.resolution?.approved === true, `approved=${res?.resolution?.approved}`);
}

// ── 3. SLA breach — worklist row + durable timer from ONE wait ─────────────────
async function assertSlaBreach() {
  console.log('\n[task] 3. SLA breach — one wait yields the worklist row AND the timer');
  const taskId = `${RUN}-b`;

  // Same call as scenario 1 — just a short SLA. The escalation is a real,
  // claimable worklist item while the durable timer counts down beside it.
  await invoke(taskId, { taskId, role: ROLE, slaSeconds: 5, title: 'SLA-gated B' });

  const esc = await awaitEscalation(taskId);
  check('worklist row live under the SLA', !!esc && esc.status === 'pending',
    `id=${esc?.id?.slice(0, 8)} role=${esc?.role} status=${esc?.status}`);

  // Nobody resolves. The timer fires: workflow resumes with false on its own.
  const res = await awaitResult(taskId, 40_000);
  check('timer resumes the workflow → sla-breach', res?.outcome === 'sla-breach',
    `outcome=${res?.outcome ?? 'STILL WAITING'}`);

  // The engine transitioned the row pending → expired atomically in the same race.
  const expired = await pendingByTask(taskId, 'expired');
  check('row transitioned to expired', expired.length === 1 && expired[0]?.id === esc?.id,
    `expired=${expired.length} status=${expired[0]?.status}`);
  const stillPending = await pendingByTask(taskId);
  check('nothing left pending', stillPending.length === 0, `${stillPending.length} pending`);

  // The auto-completion gate, reversed: a post-deadline resolve has nothing to
  // resolve — the operator learns the SLA fired instead of resolving into the void.
  let lateRefused = false;
  let lateDetail = '';
  try {
    await api('POST', '/api/escalations/resolve-by-metadata', {
      key: 'taskId', value: taskId, resolverPayload: { approved: true },
    });
    lateDetail = 'resolve unexpectedly succeeded';
  } catch (err: any) {
    lateRefused = true;
    lateDetail = String(err?.message ?? '').slice(0, 80);
  }
  check('late resolve refused', lateRefused, lateDetail);
}

async function main() {
  await login();
  console.log(`[task] ${ts()} RUN=${RUN}`);
  await assertResolveByMetadata();
  await assertSlaBreach();
  console.log(`\n[task] ${'='.repeat(48)}`);
  console.log(failures === 0 ? '[task] ✓ ALL CHECKS PASSED' : `[task] ✗ ${failures} CHECK(S) FAILED`);
  console.log(`[task] ${'='.repeat(48)}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('[task] failed:', err.message); process.exit(1); });

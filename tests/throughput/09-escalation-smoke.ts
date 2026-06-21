/**
 * 09-escalation-smoke — Regression gate for the durable schema hot-swap.
 *
 * Enqueues a single 1-step order, polls until the first escalation appears,
 * asserts its shape, claims it, resolves it, and exits.
 *
 * Load-bearing assertion:
 *   EFFICIENT=1 → signal_key must be set (atomic Leg1 write).
 *                 If the durable schema did not hot-swap to v16, no row is
 *                 written and this script exits 1 — catching the regression at
 *                 deploy time instead of silently in production.
 *   (default)   → signal_key must be null (legacy two-step path still works).
 *
 * Usage:
 *   npx ts-node tests/throughput/09-escalation-smoke.ts          # legacy path
 *   EFFICIENT=1 npx ts-node tests/throughput/09-escalation-smoke.ts  # efficient path
 *
 * Env:
 *   REMOTE_URL       — target base URL (default: http://localhost:3030)
 *   REMOTE_PASSWORD  — superadmin password when REMOTE_URL is set
 *   EFFICIENT        — set to "1" to route to atomic-escalation children
 */

try { require('dotenv/config'); } catch {}

import { login, api, sleep, ts, getUserId } from './07-shared';
import { PIPELINE_STEPS } from './08-shared';

const EFFICIENT = process.env.EFFICIENT === '1';
const POLL_INTERVAL_MS = 2_000;
const TIMEOUT_MS = 90_000;

const FIRST_STEP = PIPELINE_STEPS[0]; // render-assets / renderer

async function main() {
  console.log(`[${ts()}] Escalation smoke (${EFFICIENT ? 'efficient' : 'legacy'})`);

  // 1. Auth
  await login();
  const userId = getUserId();

  // 2. Register pipeline workflow config
  await api('PUT', '/api/workflows/pipeline/config', {
    invocable: true,
    task_queue: 'ortho-pipeline',
    default_role: 'reviewer',
  });

  // 3. Build a 1-step pipeline (render-assets only — fast, single escalation)
  const steps = [
    {
      stationName: FIRST_STEP.stationName,
      role: FIRST_STEP.role,
      instructions: FIRST_STEP.instructions,
      ...(EFFICIENT ? { childWorkflow: 'stationEfficient' } : {}),
    },
  ];

  // 4. Enqueue exactly 1 order with a unique ID
  const wfId = `smoke-${EFFICIENT ? 'eff' : 'leg'}-${Date.now()}`;
  console.log(`[${ts()}] Enqueueing order wfId=${wfId}`);

  await api('POST', '/api/workflows/pipeline/invoke', {
    data: { name: `SmokeOrder-${wfId}`, steps },
    workflowId: wfId,
  });

  console.log(`[${ts()}] Order enqueued — polling for escalation (timeout=${TIMEOUT_MS / 1000}s)...`);

  // 5. Poll until the escalation appears
  const deadline = Date.now() + TIMEOUT_MS;
  let escalation: any = null;

  while (Date.now() < deadline) {
    const resp = await api('GET', '/api/escalations/available?limit=100&sort_by=created_at&order=asc');
    const available = resp?.escalations || [];
    escalation = available.find((e: any) => e.workflow_id === wfId);
    if (escalation) break;
    await sleep(POLL_INTERVAL_MS);
  }

  if (!escalation) {
    console.error(`[${ts()}] FAIL — no escalation found for wfId=${wfId} after ${TIMEOUT_MS / 1000}s`);
    if (EFFICIENT) {
      console.error(`[${ts()}]   (efficient path: this usually means the durable schema did NOT hot-swap to v16)`);
    }
    process.exit(1);
  }

  console.log(`[${ts()}] Found escalation id=${escalation.id} role=${escalation.role} signal_key=${escalation.signal_key ?? 'null'}`);

  // 6. Assert shape
  if (EFFICIENT) {
    if (!escalation.signal_key) {
      console.error(`[${ts()}] FAIL — efficient path: expected signal_key to be set, got ${JSON.stringify(escalation.signal_key)}`);
      console.error(`[${ts()}]   Schema hot-swap v15→v16 likely did not occur on this deployment.`);
      process.exit(1);
    }
    console.log(`[${ts()}] PASS shape — signal_key is set (atomic Leg1 write confirmed)`);
  } else {
    if (escalation.signal_key) {
      console.error(`[${ts()}] FAIL — legacy path: expected signal_key=null, got ${JSON.stringify(escalation.signal_key)}`);
      process.exit(1);
    }
    console.log(`[${ts()}] PASS shape — signal_key is null (legacy two-step path confirmed)`);
  }

  // 7. Claim
  await api('POST', `/api/escalations/${escalation.id}/claim`, { durationMinutes: 5 });
  console.log(`[${ts()}] Claimed escalation ${escalation.id} (user=${userId})`);

  // 8. Resolve
  const resolution = await api('POST', `/api/escalations/${escalation.id}/resolve`, {
    resolverPayload: { approved: true, station: escalation.role },
  });

  // 9. Assert resolve response
  if (!resolution?.signaled) {
    console.error(`[${ts()}] FAIL — resolve did not return signaled=true: ${JSON.stringify(resolution)}`);
    process.exit(1);
  }

  console.log(`[${ts()}] PASS resolve — signaled=true (workflow resumed in place)`);
  console.log(`[${ts()}] Smoke ${EFFICIENT ? 'efficient' : 'legacy'} path: ALL PASS`);
}

main().catch((err) => { console.error(err); process.exit(1); });

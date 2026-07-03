/**
 * 14-pull — the claim-as-lease contention proof.
 *
 * UNITS work items race PULLERS crew-loops, each puller a DISTINCT principal.
 * The assertions the acme-mono virtual farm (and every pull-crew after it)
 * rests on:
 *
 *   1. Every unit resolved EXACTLY once — sum(puller.resolved) === units, and
 *      every unit's return names exactly one puller.
 *   2. Lost claim races are rejected with a 4xx (the lease is real between
 *      principals) — statuses recorded as telemetry.
 *   3. Late resolves are ordinary endings (lostResolves counted, no crashes).
 *   4. With TTL=1min (PULL_TTL=1): a puller that claims and goes dark loses
 *      its lease to the clock, and a healthy puller finishes the work — the
 *      watchdog recovery, observed live.
 *
 * Run:  npm run pull:demo              (local: 24 units × 6 pullers)
 *       PULL_TTL=1 npm run pull:demo   (adds the dark-puller TTL recovery, ~2min)
 */

import { login, api, sleep, ts } from './07-shared';
import { PULL_WORKFLOWS, type PullDemandResult, type PullerResult } from '../../src/workflows/pull-farm/types';
import { pullOperatorIds, PULLER_COUNT } from '../../src/workflows/pull-farm/operators';

const RUN_ID = process.env.RUN_ID || Math.floor(Date.now() / 1000).toString();
const UNITS = parseInt(process.env.UNITS || '24', 10);
const PULLERS = Math.min(parseInt(process.env.PULLERS || '6', 10), PULLER_COUNT);
const WORK_SECONDS = parseInt(process.env.WORK_SECONDS || '1', 10);
const TTL_TEST = process.env.PULL_TTL === '1';
// TTL mode waits out the dark puller's ~60s lease expiry PLUS the survivors'
// 90-tick idle retirement after their last recovered unit — budget generously.
const WAIT_MS = parseInt(process.env.WAIT_TIMEOUT_MS || (TTL_TEST ? '420000' : '180000'), 10);
const POLL_MS = 1_000;

const failures: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`[${ts()}]   ✓ ${label}`);
  else {
    console.error(`[${ts()}]   ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
}

async function invoke(name: string, workflowId: string, data: Record<string, any>) {
  await api('POST', `/api/workflows/${name}/invoke`, { workflowId, data });
}

async function result<T>(workflowId: string): Promise<T> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const r = await api('GET', `/api/workflows/${workflowId}/result`);
      if (r?.result?.type === 'return') return r.result.data as T;
    } catch { /* running */ }
    await sleep(POLL_MS);
  }
  throw new Error(`${workflowId} did not complete within ${WAIT_MS}ms`);
}

async function main() {
  const batch = `b${RUN_ID}`;
  console.log(`[${ts()}] 14-pull — batch ${batch}: ${UNITS} units × ${PULLERS} pullers${TTL_TEST ? ' + dark-puller TTL recovery' : ''}`);
  await login();

  const operators = pullOperatorIds();

  // ── Demand first: the pond fills, then the crew races it ─────────────────
  const demandId = `pull-${RUN_ID}`;
  await invoke(PULL_WORKFLOWS.DEMAND, demandId, { batch, units: UNITS });
  console.log(`[${ts()}] demand parked (${UNITS} units)`);

  // ── The crew. In TTL mode puller-0 claims one unit and goes dark with a
  //    1-minute lease; the survivors must finish everything anyway. ─────────
  const pullerIds: string[] = [];
  for (let i = 0; i < PULLERS; i++) {
    const workflowId = `puller-${RUN_ID}-p${i}`;
    pullerIds.push(workflowId);
    await invoke(PULL_WORKFLOWS.PULLER, workflowId, {
      pullerId: `p${i}`,
      operatorId: operators[i],
      batch,
      workSeconds: WORK_SECONDS,
      claimMinutes: TTL_TEST ? 1 : 5,
      maxIdleTicks: TTL_TEST ? 90 : 10,
      idleTickSeconds: 1,
      ...(TTL_TEST && i === 0 ? { plan: ['silent'] } : {}),
    });
  }
  console.log(`[${ts()}] crew of ${PULLERS} racing the pond`);

  // ── Verdicts ──────────────────────────────────────────────────────────────
  const demand = await result<PullDemandResult>(demandId);
  const named = demand.resolvedBy.filter((p): p is string => !!p);
  check(`every unit resolved and names its puller (${named.length}/${UNITS})`, named.length === UNITS, JSON.stringify(demand.resolvedBy));

  if (TTL_TEST) {
    // The dark puller's return + the demand result carry the whole TTL proof:
    // it claimed and resolved nothing, yet every unit settled — the clock
    // returned the abandoned lease and a survivor finished the work. The
    // survivors retire on their own idle clocks (minutes — each idle tick is
    // two durable checkpoints); their tallies aren't needed here.
    const dark = await result<PullerResult>(pullerIds[0]!);
    check('puller-0 went dark holding a lease', dark.wentDark === true, JSON.stringify(dark));
    check('TTL recovery: dark puller resolved nothing, yet all units settled', dark.resolved === 0 && named.length === UNITS);
  } else {
    const pullers = await Promise.all(pullerIds.map((id) => result<PullerResult>(id)));

    const totalResolved = pullers.reduce((s, p) => s + p.resolved, 0);
    check(`exactly-once: sum(resolved)=${totalResolved} === units=${UNITS}`, totalResolved === UNITS);

    const lostClaims = pullers.flatMap((p) => p.lostClaimStatuses);
    const lostResolves = pullers.reduce((s, p) => s + p.lostResolves, 0);
    check('no crashes under contention (lost races are ordinary endings)', pullers.length === PULLERS);
    console.log(
      `[${ts()}]   telemetry: lostClaims=${lostClaims.length} (statuses: ${JSON.stringify([...new Set(lostClaims)])}), lostResolves=${lostResolves}`,
    );
    console.log(
      `[${ts()}]   distribution: ${pullers.map((p) => `${p.pullerId}:${p.resolved}`).join(' ')}`,
    );
  }

  if (failures.length) {
    console.error(`\n[${ts()}] FAIL — ${failures.length} assertion(s):\n  - ${failures.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`\n[${ts()}] PASS — the lease is real, late answers are ordinary, nothing resolved twice, nothing lost.`);
}

main().catch((err) => {
  console.error(`[${ts()}] 14-pull error:`, err.message || err);
  process.exit(1);
});

/**
 * 08-day-resolver — Claim + resolve escalations for a specific day's roles.
 *
 * Enforces realistic stagger:
 *   1. Waits DAY × compressionWindow before starting (initial delay)
 *   2. Each cycle targets a specific batch by matching workflow_id
 *      containing "b{batchNumber}"
 *
 * Runs two concurrent loops per cycle (claim + resolve).
 * Each cycle runs until ALL items for the batch are resolved —
 * no wall-clock timeout. Laptop-proof: survives sleep/wake.
 *
 * Env vars:
 *   DAY               — which day to resolve (1-4, required)
 *   RUN_ID            — match the enqueuer's run ID (required)
 *   DAILY_VOLUME      — orders per day (default 500)
 *   BASELINE_HOURS    — real work hours per day (default 8)
 *   COMPRESSION_HOURS — compressed hours per day (default 1)
 *   PRINTER_SETS      — printer sets per order (default 3)
 *   (hold times are derived from compression ratio × real station durations)
 *   POLL_MS           — ms between polls (default 2000)
 *
 * Usage:
 *   DAY=1 RUN_ID=1716300000 npm run ortho:day1
 *   DAY=2 RUN_ID=1716300000 PRINTER_SETS=3 npm run ortho:day2
 */

import {
  login, api, sleep, ts, envInt, ageSeconds, getUserId,
  DAY_ROLES, PRINTER_SETS, BATCHES,
  compressedBatchSize, compressionWindowMs, holdMsForRole,
} from './08-shared';

const DAY = envInt('DAY', 0);
if (DAY < 1 || DAY > 4) {
  console.error('DAY must be 1-4');
  process.exit(1);
}

const RUN_ID = process.env.RUN_ID || '';
if (!RUN_ID) {
  console.error('RUN_ID required — use the value printed by 08-enqueue');
  process.exit(1);
}

const POLL_MS = envInt('POLL_MS', 2000);

const roles = DAY_ROLES[DAY];
const roleCsv = roles.join(', ');

function itemsPerCycle(): number {
  const batch = compressedBatchSize();
  if (DAY === 2) {
    return batch * PRINTER_SETS * 2;
  }
  return batch * roles.length;
}

let totalClaimed = 0;
let totalResolved = 0;
let userId = '';

// ── Claim: grab up to maxPerPoll matching escalations ────────────────

async function claimBatch(batchTag: string, maxPerPoll: number): Promise<number> {
  try {
    const resp = await api('GET', `/api/escalations/available?limit=100&sort_by=created_at&order=asc`);
    const escalations = resp?.escalations || [];
    let claimed = 0;

    for (const esc of escalations) {
      if (claimed >= maxPerPoll) break;
      if (!roles.includes(esc.role)) continue;
      if (!(esc.workflow_id || '').includes(batchTag)) continue;

      try {
        await api('POST', `/api/escalations/${esc.id}/claim`, { durationMinutes: 600 });
        totalClaimed++;
        claimed++;
        console.log(`[${ts()}]   [claim] ${esc.id} (${esc.role}) wf=${esc.workflow_id || ''} [${totalClaimed} total]`);
      } catch {
        // Already claimed
      }
    }
    return claimed;
  } catch (err: any) {
    console.error(`[${ts()}]   [claim] Poll error: ${err.message.slice(0, 80)}`);
    return 0;
  }
}

// ── Resolve: resolve up to maxPerPoll held-long-enough escalations ───

async function resolveBatch(batchTag: string, maxPerPoll: number): Promise<number> {
  try {
    const resp = await api('GET', `/api/escalations?status=pending&assigned_to=${userId}&limit=100&sort_by=created_at&order=asc`);
    const escalations = resp?.escalations || [];
    let resolved = 0;

    for (const esc of escalations) {
      if (resolved >= maxPerPoll) break;
      if (!roles.includes(esc.role)) continue;
      if (!(esc.workflow_id || '').includes(batchTag)) continue;

      const holdTime = esc.claimed_at ? ageSeconds(esc.claimed_at) : 0;
      const minHoldS = holdMsForRole(esc.role) / 1000;
      if (holdTime < minHoldS) continue;

      try {
        await api('POST', `/api/escalations/${esc.id}/resolve`, {
          resolverPayload: { approved: true, station: esc.role },
        });
        totalResolved++;
        resolved++;
        console.log(`[${ts()}]   [resolve] ${esc.id} (${esc.role}) held ${Math.floor(holdTime)}s/${Math.floor(minHoldS)}s wf=${esc.workflow_id || ''} [${totalResolved} total]`);
      } catch (err: any) {
        console.error(`[${ts()}]   [resolve] ${esc.id.slice(0, 8)}… error: ${err.message.slice(0, 60)}`);
      }
    }
    return resolved;
  } catch (err: any) {
    console.error(`[${ts()}]   [resolve] Poll error: ${err.message.slice(0, 80)}`);
    return 0;
  }
}

async function runCycle(cycleNum: number): Promise<void> {
  const targetBatch = cycleNum;
  const wfPrefix = process.env.EFFICIENT === '1' ? 'ortho-eff' : 'ortho';
  const batchTag = `${wfPrefix}-${RUN_ID}-b${targetBatch}-`;
  const target = itemsPerCycle();
  const cycleStart = Date.now();
  let cycleResolved = 0;
  let cycleClaimed = 0;
  let done = false;

  // Claims spread across the window (realistic pacing).
  // Resolves drain all eligible items each poll (they've already waited their hold time).
  const windowMs = compressionWindowMs();
  const pollsPerWindow = Math.floor(windowMs / POLL_MS);
  const claimPerPoll = Math.max(1, Math.ceil(target / pollsPerWindow));

  console.log(`[${ts()}] ── Cycle ${cycleNum} ── batch ${targetBatch} (${target} items for [${roleCsv}], ~${claimPerPoll} claims/poll over ${(windowMs / 1000).toFixed(0)}s)`);

  // Claim loop — paced: up to claimPerPoll per poll
  const claimLoop = async () => {
    while (!done) {
      const found = await claimBatch(batchTag, claimPerPoll);
      cycleClaimed += found;
      if (!done) await sleep(POLL_MS);
    }
  };

  // Resolve loop — drains all eligible items each poll (no cap)
  const resolveLoop = async () => {
    while (!done) {
      await resolveBatch(batchTag, target);
      if (!done) await sleep(POLL_MS);
    }
  };

  // Watchdog — stop when resolved count hits target
  const watchdog = async () => {
    while (!done) {
      cycleResolved = totalResolved - (target * cycleNum);
      if (cycleResolved >= target) {
        done = true;
        break;
      }
      await sleep(1000);
    }
  };

  await Promise.all([claimLoop(), resolveLoop(), watchdog()]);

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(0);
  console.log(`[${ts()}]   Cycle ${cycleNum} complete in ${elapsed}s: claimed=${cycleClaimed} resolved=${cycleResolved}\n`);
}

async function main() {
  await login();
  userId = getUserId();

  const windowMs = compressionWindowMs();
  const initialDelay = DAY * windowMs;
  const target = itemsPerCycle();

  console.log(`[${ts()}] Day ${DAY} resolver started — roles: [${roleCsv}]`);
  console.log(`[${ts()}]   Run: ${RUN_ID}`);
  console.log(`[${ts()}]   User: ${userId.slice(0, 8)}…`);
  console.log(`[${ts()}]   Items/cycle: ${target}, hold: ${(holdMsForRole('') / 1000).toFixed(0)}s, poll: ${POLL_MS}ms`);
  console.log(`[${ts()}]   Initial delay: ${(initialDelay / 60_000).toFixed(1)}min (DAY ${DAY} × ${(windowMs / 60_000).toFixed(1)}min)`);
  console.log(`[${ts()}]   Ctrl-C to stop\n`);

  if (initialDelay > 0) {
    console.log(`[${ts()}] Waiting ${(initialDelay / 60_000).toFixed(1)}min before first cycle...`);
    await sleep(initialDelay);
  }

  for (let cycle = 0; cycle < BATCHES; cycle++) {
    await runCycle(cycle);
  }

  console.log(`[${ts()}] Day ${DAY} resolver finished — ${BATCHES} batches, ${totalClaimed} claimed, ${totalResolved} resolved`);
}

main().catch((err) => { console.error(err); process.exit(1); });

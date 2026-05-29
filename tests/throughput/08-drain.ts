/**
 * 08-drain — Resume and complete all pending escalations.
 *
 * After a crash or interrupted run, this script claims and resolves
 * every available escalation regardless of batch or run ID. It drains
 * until nothing remains, then exits.
 *
 * Since everything is checkpointed, resolving an escalation signals
 * the paused workflow to continue. Downstream steps will create new
 * escalations, which this script picks up in subsequent polls.
 *
 * Env vars:
 *   HOLD_S     — seconds to hold before resolving (default 4)
 *   POLL_MS    — ms between polls (default 2000)
 *
 * Usage:
 *   npm run ortho:drain
 */

import { login, api, sleep, ts, envInt, ageSeconds, getUserId } from './07-shared';

const HOLD_S = parseFloat(process.env.HOLD_S || '4');
const POLL_MS = envInt('POLL_MS', 2000);

let totalClaimed = 0;
let totalResolved = 0;
let userId = '';

async function claimAll(): Promise<number> {
  try {
    const resp = await api('GET', `/api/escalations/available?limit=100&sort_by=created_at&order=asc`);
    const escalations = resp?.escalations || [];
    let claimed = 0;

    for (const esc of escalations) {
      try {
        await api('POST', `/api/escalations/${esc.id}/claim`, { durationMinutes: 600 });
        totalClaimed++;
        claimed++;
        console.log(`[${ts()}]   [claim] ${esc.id} (${esc.role}) wf=${esc.workflow_id} [${totalClaimed} total]`);
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

async function resolveAll(): Promise<number> {
  try {
    const resp = await api('GET', `/api/escalations?status=pending&assigned_to=${userId}&limit=100&sort_by=created_at&order=asc`);
    const escalations = resp?.escalations || [];
    let resolved = 0;

    for (const esc of escalations) {
      const holdTime = esc.claimed_at ? ageSeconds(esc.claimed_at) : 0;
      if (holdTime < HOLD_S) continue;

      try {
        await api('POST', `/api/escalations/${esc.id}/resolve`, {
          resolverPayload: { approved: true, station: esc.role },
        });
        totalResolved++;
        resolved++;
        console.log(`[${ts()}]   [resolve] ${esc.id} (${esc.role}) held ${Math.floor(holdTime)}s wf=${esc.workflow_id} [${totalResolved} total]`);
      } catch (err: any) {
        console.error(`[${ts()}]   [resolve] ${esc.id} error: ${err.message.slice(0, 60)}`);
      }
    }
    return resolved;
  } catch (err: any) {
    console.error(`[${ts()}]   [resolve] Poll error: ${err.message.slice(0, 80)}`);
    return 0;
  }
}

async function main() {
  await login();
  userId = getUserId();

  // Check initial state
  const initial = await api('GET', `/api/escalations/available?limit=1`);
  const pending = initial?.total || 0;

  console.log(`[${ts()}] Drain started — ${pending} escalations pending`);
  console.log(`[${ts()}]   User: ${userId}`);
  console.log(`[${ts()}]   Hold: ${HOLD_S}s, poll: ${POLL_MS}ms`);
  console.log(`[${ts()}]   Draining until empty...\n`);

  let consecutiveEmpty = 0;
  const MAX_EMPTY = 15; // 15 empty polls (~30s) = done

  while (consecutiveEmpty < MAX_EMPTY) {
    const claimed = await claimAll();
    const resolved = await resolveAll();

    if (claimed === 0 && resolved === 0) {
      consecutiveEmpty++;
    } else {
      consecutiveEmpty = 0;
    }

    await sleep(POLL_MS);
  }

  console.log(`\n[${ts()}] Drain complete — claimed=${totalClaimed} resolved=${totalResolved}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

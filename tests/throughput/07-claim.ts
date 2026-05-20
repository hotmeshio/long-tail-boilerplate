/**
 * 07-claim — Station workers pick up escalations.
 *
 * Polls for pending (unclaimed) escalations. Claims any that are
 * old enough (created_at + OLDER_THAN seconds ago). Runs forever
 * until killed — designed to be left running in a terminal.
 *
 * Sorted ascending by created_at so oldest come first. Once an
 * escalation is too young, the rest will be too — stop early.
 *
 * Env vars:
 *   CHECK_EVERY  — seconds between poll cycles (default 60)
 *   OLDER_THAN   — min age in seconds before claiming (default 60)
 *   LIMIT        — escalations per page (default 25)
 *
 * Usage:
 *   CHECK_EVERY=30 OLDER_THAN=10 npx ts-node tests/throughput/07-claim.ts
 */

import { login, api, sleep, envInt, ageSeconds, ts } from './07-shared';

const CHECK_EVERY = envInt('CHECK_EVERY', 60);
const OLDER_THAN = envInt('OLDER_THAN', 60);
const LIMIT = envInt('LIMIT', 25);
const API_LIMIT = Math.max(100, LIMIT);

let totalClaimed = 0;

async function claimCycle() {
  try {
    const resp = await api('GET', `/api/escalations/available?limit=${API_LIMIT}&sort_by=created_at&order=asc`);
    const escalations = (resp?.escalations || []).slice(0, LIMIT);
    console.log(`[${ts()}] ${escalations.length} pending (${resp?.total ?? '?'} total)`);
    if (escalations.length === 0) return;

    let claimed = 0;
    for (const esc of escalations) {
      const age = Math.floor(ageSeconds(esc.created_at));
      if (age < OLDER_THAN) {
        console.log(`[${ts()}]   ↳ ${esc.id.slice(0, 8)}… too young (${age}s < ${OLDER_THAN}s) — done`);
        break;
      }

      try {
        await api('POST', `/api/escalations/${esc.id}/claim`, { durationMinutes: 600 });
        totalClaimed++;
        claimed++;
        console.log(`[${ts()}]   ↳ ${esc.id.slice(0, 8)}… claimed ${esc.role} (age ${age}s) [total: ${totalClaimed}]`);
      } catch (err: any) {
        console.log(`[${ts()}]   ↳ ${esc.id.slice(0, 8)}… skip: ${err.message.slice(0, 80)}`);
      }
    }

    if (claimed > 0) console.log(`[${ts()}] Claimed ${claimed} this cycle`);
  } catch (err: any) {
    console.error(`[${ts()}] Claim poll error: ${err.message}`);
  }
}

async function main() {
  await login();
  console.log(`[${ts()}] Claimer started — check every ${CHECK_EVERY}s, older than ${OLDER_THAN}s, limit ${LIMIT}`);
  console.log(`[${ts()}] Ctrl-C to stop\n`);

  while (true) {
    await claimCycle();
    await sleep(CHECK_EVERY * 1000);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

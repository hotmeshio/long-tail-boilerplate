/**
 * 07-resolve — Workers complete their station tasks.
 *
 * Polls for claimed escalations. Resolves any that have been held
 * long enough (claimed_at + OLDER_THAN seconds ago). Runs forever
 * until killed — designed to be left running in a terminal.
 *
 * Sorted ascending by claimed_at so longest-held come first. Once
 * an escalation is too young, the rest will be too — stop early.
 *
 * Env vars:
 *   CHECK_EVERY  — seconds between poll cycles (default 60)
 *   OLDER_THAN   — min hold time in seconds before resolving (default 60)
 *   LIMIT        — escalations per page (default 25)
 *
 * Usage:
 *   CHECK_EVERY=30 OLDER_THAN=30 npx ts-node tests/throughput/07-resolve.ts
 */

import { login, api, sleep, envInt, ageSeconds, ts } from './07-shared';

const CHECK_EVERY = envInt('CHECK_EVERY', 60);
const OLDER_THAN = envInt('OLDER_THAN', 60);
const LIMIT = envInt('LIMIT', 25);

let totalResolved = 0;

async function resolveCycle() {
  try {
    const resp = await api('GET', `/api/escalations?status=pending&limit=${LIMIT}&sort_by=claimed_at&order=asc`);
    const all = resp?.escalations || [];
    const escalations = all.filter((e: any) => e.assigned_to && e.claimed_at);
    console.log(`[${ts()}] ${escalations.length} claimed (of ${all.length} pending)`);
    if (escalations.length === 0) return;

    for (const esc of escalations) {
      const holdTime = Math.floor(ageSeconds(esc.claimed_at));
      if (holdTime < OLDER_THAN) {
        console.log(`[${ts()}]   ↳ ${esc.id.slice(0, 8)}… too young (held ${holdTime}s < ${OLDER_THAN}s) — done`);
        break;
      }

      const station = esc.role || 'unknown';
      try {
        await api('POST', `/api/escalations/${esc.id}/resolve`, {
          resolverPayload: { approved: true, station },
        });
        totalResolved++;
        console.log(`[${ts()}]   ↳ ${esc.id.slice(0, 8)}… resolved ${station} (held ${holdTime}s) [total: ${totalResolved}]`);
      } catch (err: any) {
        console.log(`[${ts()}]   ↳ ${esc.id.slice(0, 8)}… skip: ${err.message.slice(0, 80)}`);
      }
    }
  } catch (err: any) {
    console.error(`[${ts()}] Resolve poll error: ${err.message}`);
  }
}

async function main() {
  await login();
  console.log(`[${ts()}] Resolver started — check every ${CHECK_EVERY}s, older than ${OLDER_THAN}s, limit ${LIMIT}`);
  console.log(`[${ts()}] Ctrl-C to stop\n`);

  while (true) {
    await resolveCycle();
    await sleep(CHECK_EVERY * 1000);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

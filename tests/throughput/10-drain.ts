/**
 * 10-drain — clear leftover print-routing escalations after an interrupted run.
 *
 * Unlike the ortho drain (which resolves to push workflows forward), the print farm
 * is resolved autonomously by its crew. The leftover state after an aborted run is
 * parked printer `ready` adverts and any un-settled order/signoff rows. Resolving a
 * `ready` advert would just re-advertise — so here we CANCEL pending escalations in
 * the print roles to clear the board. Parked workflows then expire on their own.
 *
 * Usage:
 *   npm run print:drain
 */

import { login, api, sleep, ts } from './10-shared';
import { ALL_PRINT_ROLES } from '../../src/workflows/print-routing/types';

const POLL_MS = parseInt(process.env.POLL_MS || '2000', 10);

async function main() {
  await login();
  console.log(`[drain] ${ts()} cancelling pending escalations in ${ALL_PRINT_ROLES.length} print roles...`);

  let cancelled = 0;
  let consecutiveEmpty = 0;
  while (consecutiveEmpty < 3) {
    let found = 0;
    for (const role of ALL_PRINT_ROLES) {
      const resp = await api('GET', `/api/escalations?status=pending&role=${role}&limit=100`);
      const escalations = resp?.escalations || [];
      for (const esc of escalations) {
        try {
          await api('POST', `/api/escalations/${esc.id}/cancel`, { reason: 'print-drain' });
          cancelled++;
          found++;
        } catch { /* already gone */ }
      }
    }
    if (found === 0) consecutiveEmpty++; else consecutiveEmpty = 0;
    await sleep(POLL_MS);
  }

  console.log(`[drain] ${ts()} drain complete — cancelled ${cancelled} escalations`);
}

main().catch((err) => { console.error('[drain] failed:', err.message); process.exit(1); });

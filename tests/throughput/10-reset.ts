/**
 * 10-reset — power down all idling printers before a fresh run.
 *
 * After a completed run, printers sit on pending `state=ready` adverts
 * waiting for the broker. Without a reset they would be claimed by the next
 * run's broker — mixing old and new fleet capacity in unpredictable ways.
 *
 * This script resolves every pending `state=ready` escalation in both printer
 * pools with `{ powerdown: true }`, which wakes each printer and causes it to
 * break out of its assembly-line loop and retire cleanly.
 *
 * Usage (standalone):
 *   npm run print:reset
 *
 * Called automatically by 10-farm.sh when RESET=1 is set.
 */

import { login, api, sleep, ts } from './10-shared';
import { PRINTER_POND, PRINTER_FACETS, PRINTER_STATE } from '../../src/workflows/print-routing/types';
import { operatorIds } from '../../src/workflows/print-routing/operators';

const POLL_MS = parseInt(process.env.POLL_MS || '1500', 10);

async function powerDownPool(role: string, operatorId: string): Promise<number> {
  let resolved = 0;
  let consecutiveEmpty = 0;

  while (consecutiveEmpty < 3) {
    const resp = await api('POST', '/api/escalations/search-by-facets', {
      role,
      status: 'pending',
      facets: { [PRINTER_FACETS.STATE]: PRINTER_STATE.READY },
      limit: 100,
    });
    const escalations: any[] = resp?.escalations || [];

    let found = 0;
    for (const esc of escalations) {
      try {
        await api('POST', `/api/escalations/${esc.id}/claim`, { durationMinutes: 1 });
        await api('POST', `/api/escalations/${esc.id}/resolve`, {
          resolverPayload: { powerdown: true },
          operatorId,
        });
        resolved++;
        found++;
      } catch { /* already claimed or gone */ }
    }

    if (found === 0) consecutiveEmpty++;
    else consecutiveEmpty = 0;
    if (found > 0) await sleep(POLL_MS);
  }

  return resolved;
}

async function main() {
  await login();

  console.log(`[reset] ${ts()} powering down idling printers in both pools...`);

  const stdOp = operatorIds(false);
  const diaOp = operatorIds(true);

  const [stdCount, diaCount] = await Promise.all([
    powerDownPool(PRINTER_POND.standard, stdOp.printerOperatorId),
    powerDownPool(PRINTER_POND.diabetic, diaOp.printerOperatorId),
  ]);

  const total = stdCount + diaCount;
  if (total === 0) {
    console.log(`[reset] ${ts()} no idling printers found — pool is already clear`);
  } else {
    console.log(`[reset] ${ts()} powered down ${total} printer(s) (standard=${stdCount} diabetic=${diaCount})`);
  }
}

main().catch((err) => { console.error('[reset] failed:', err.message); process.exit(1); });

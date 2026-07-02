/**
 * 10-shift — one-shot end-to-end smoke for the print farm.
 *
 * Invokes the `printShift` entry target (the dashboard's one-click farm): it powers
 * on its own fleet + crew, feeds order flavor waves, drains, and retires idle
 * machines — all internally. We just invoke it and await the headline summary.
 *
 * A fast proof the whole system is wired correctly. For pressure/scale, use
 * `npm run print:run` (the decomposed supply/demand orchestrator).
 *
 * Usage:
 *   npm run print:smoke
 *   DIABETIC=1 npm run print:smoke
 */

import { login, api, sleep, ts, RUN_ID, DIABETIC, operators } from './10-shared';

const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '300000', 10);

async function main() {
  await login();

  const op = operators();
  const workflowId = `print-shift-${RUN_ID}`;

  console.log(`[shift] ${ts()} invoking printShift (kind=${DIABETIC ? 'diabetic' : 'standard'}) wf=${workflowId}`);
  await api('POST', '/api/workflows/printShift/invoke', {
    data: { diabetic: DIABETIC, ...op },
    workflowId,
  });

  const t0 = performance.now();
  while (performance.now() - t0 < TIMEOUT_MS) {
    await sleep(4000);
    try {
      const r = await api('GET', `/api/workflows/${workflowId}/result`);
      if (r?.result?.type === 'return') {
        const s = r.result.data;
        console.log(`\n[shift] ${'='.repeat(50)}`);
        console.log(`[shift] SHIFT COMPLETE`);
        console.log(`[shift]   ordersPlaced:        ${s.ordersPlaced}`);
        console.log(`[shift]   ordersPrinted:       ${s.ordersPrinted}`);
        console.log(`[shift]   insolesPrinted:      ${s.insolesPrinted}`);
        console.log(`[shift]   reprints:            ${s.reprints}`);
        console.log(`[shift]   printersPoweredDown: ${s.printersPoweredDown}`);
        console.log(`[shift]   waves:               ${s.waves.map((w: any) => `${w.name}(${w.orders})`).join(', ')}`);
        console.log(`[shift] ${'='.repeat(50)}\n`);
        const ok = s.ordersPrinted === s.ordersPlaced && s.ordersPlaced > 0;
        process.exit(ok ? 0 : 1);
      }
    } catch { /* not done */ }
    console.log(`[shift] ${ts()} running... (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
  }
  console.error(`[shift] ${ts()} TIMEOUT after ${(TIMEOUT_MS / 1000).toFixed(0)}s`);
  process.exit(1);
}

main().catch((err) => { console.error('[shift] failed:', err.message); process.exit(1); });

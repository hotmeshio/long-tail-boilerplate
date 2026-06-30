/**
 * 10-demand — feed the DEMAND surface of the print farm and watch it converge.
 *
 * Releases DAILY_VOLUME orders across BATCHES waves, and from t0 runs a convergence
 * watchdog CONCURRENTLY with the wave release — so it never goes silent during a
 * wave gap. The autonomous crew (started by 10-supply) does all the matching and
 * resolving; demand only enqueues and measures.
 *
 * Reports both lenses every tick:
 *   • marketplace efficiency — converged/total, reprints, throughput (orders/sec)
 *   • pressure gradient      — inflight (released but not cleared) and its peak
 *
 * Exits 0 on full convergence, 1 on stall/timeout — so the farm orchestrator can
 * treat it as the run's pass/fail gate.
 *
 * Usage:
 *   npm run print:demand
 *   DAILY_VOLUME=50 BATCHES=5 FLEET_SIZE=6 npm run print:demand
 */

import {
  login, api, sleep, ts,
  DIABETIC, DAILY_VOLUME, BATCHES, FLEET_SIZE, EOL_RUNS, DEFAULT_MAX_ADVERTS,
  PRINT_ROUTING_QUEUE, PRINT_WORKFLOWS,
  buildOrders, operators, batchSize, waveGapMs,
} from './10-shared';

const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '900000', 10);

async function main() {
  await login();

  const op = operators();
  await api('PUT', `/api/workflows/${PRINT_WORKFLOWS.ORDER}/config`, {
    invocable: true,
    task_queue: PRINT_ROUTING_QUEUE,
    default_role: 'reviewer',
  });

  const orders = buildOrders(Date.now());
  const size = batchSize();
  const gap = waveGapMs();
  const capacity = FLEET_SIZE * EOL_RUNS;
  const totalInsoles = orders.reduce((s, o) => s + o.units.length, 0);

  // Stall budget: max acceptable gap between any two order convergences.
  // Covers the worst case: all printers hit refill simultaneously (technician
  // processes FLEET_SIZE jobs sequentially) + broker carry-rounds to re-place
  // orders once printers are back. Use env override when the default is too tight.
  const brokerCount = Math.ceil(FLEET_SIZE / DEFAULT_MAX_ADVERTS);
  const carryRounds = Math.ceil(DAILY_VOLUME / Math.max(1, brokerCount * 2));
  const STALL_MS = process.env.STALL_MS
    ? parseInt(process.env.STALL_MS, 10)
    : Math.max(60_000, FLEET_SIZE * 3_000 + carryRounds * 10_000);

  console.log(`[demand] ${ts()} ${DAILY_VOLUME} orders (${totalInsoles} insoles) in ${BATCHES} waves of ~${size} (gap ${(gap / 1000).toFixed(1)}s) | fleet capacity≈${capacity} runs | stall budget=${(STALL_MS / 1000).toFixed(0)}s`);
  if (capacity < totalInsoles) {
    console.log(`[demand] ${ts()} WARNING: capacity (${capacity} printer-runs) < insoles (${totalInsoles}) — run will stall once supply exhausts. Raise FLEET_SIZE.`);
  }

  const t0 = performance.now();
  const released: string[] = [];
  const done = new Set<string>();
  let reprints = 0;
  let peakInflight = 0;
  let enqueueDone = false;
  let lastProgress = performance.now();

  // Loop 1 — release the order waves (demand surface fills over time).
  const enqueueLoop = (async () => {
    for (let b = 0; b < BATCHES; b++) {
      if (b > 0) await sleep(gap);
      const wave = orders.slice(b * size, (b + 1) * size);
      for (const order of wave) {
        const r = await api('POST', `/api/workflows/${PRINT_WORKFLOWS.ORDER}/invoke`, {
          data: { ...order, operatorId: op.ordererId },
          workflowId: order.orderId,
        });
        if (r?.workflowId) released.push(r.workflowId);
      }
      console.log(`[demand] ${ts()} wave ${b + 1}/${BATCHES} released (${released.length}/${DAILY_VOLUME} enqueued)`);
    }
    enqueueDone = true;
  })();

  // Loop 2 — converge from t0, concurrently. Both lenses on every line.
  const monitorLoop = (async () => {
    while (!(enqueueDone && done.size >= released.length && released.length >= DAILY_VOLUME)) {
      await sleep(3000);
      for (const id of released) {
        if (done.has(id)) continue;
        try {
          const r = await api('GET', `/api/workflows/${id}/result`);
          if (r?.result?.type === 'return') {
            done.add(id);
            reprints += Math.max(0, (r.result.data?.attempts ?? 1) - 1);
            lastProgress = performance.now();
          }
        } catch { /* not done */ }
      }
      const inflight = released.length - done.size;
      peakInflight = Math.max(peakInflight, inflight);
      const elapsed = (performance.now() - t0) / 1000;
      const tput = elapsed > 0 ? (done.size / elapsed).toFixed(2) : '0.00';
      console.log(
        `[demand] ${ts()} converged=${done.size}/${DAILY_VOLUME} inflight=${inflight} (peak ${peakInflight}) reprints=${reprints} ${tput}/s (${elapsed.toFixed(0)}s)`,
      );

      // Stall only matters once all demand is released and nothing is clearing.
      if (enqueueDone && done.size < released.length && performance.now() - lastProgress > STALL_MS) {
        console.error(`[demand] ${ts()} STALLED — no convergence for ${(STALL_MS / 1000).toFixed(0)}s (${done.size}/${released.length}). Likely under-capacity (raise FLEET_SIZE).`);
        process.exit(1);
      }
      if (performance.now() - t0 > TIMEOUT_MS) {
        console.error(`[demand] ${ts()} TIMEOUT after ${(TIMEOUT_MS / 1000).toFixed(0)}s (${done.size}/${DAILY_VOLUME}).`);
        process.exit(1);
      }
    }
  })();

  await Promise.all([enqueueLoop, monitorLoop]);

  const totalElapsed = (performance.now() - t0) / 1000;
  console.log(`\n[demand] ${'='.repeat(54)}`);
  console.log(`[demand] CONVERGED — ${done.size}/${DAILY_VOLUME} orders`);
  console.log(`[demand]   kind:          ${DIABETIC ? 'diabetic' : 'standard'}`);
  console.log(`[demand]   reprints:      ${reprints}`);
  console.log(`[demand]   peak inflight: ${peakInflight}  (pressure gradient high-water mark)`);
  console.log(`[demand]   total time:    ${totalElapsed.toFixed(1)}s`);
  console.log(`[demand]   throughput:    ${(done.size / totalElapsed).toFixed(2)} orders/sec e2e`);
  console.log(`[demand] ${'='.repeat(54)}\n`);
  process.exit(0);
}

main().catch((err) => { console.error('[demand] failed:', err.message); process.exit(1); });

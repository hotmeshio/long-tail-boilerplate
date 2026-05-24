/**
 * 07-enqueue — Feed orders into the assembly line.
 *
 * Submits stepIterator workflows one at a time at a steady pace.
 * Deterministic workflow IDs: stepIterator-{runId}-{n}
 *
 * Env vars:
 *   TARGET           — total orders to submit (default 100)
 *   ENQUEUE_EVERY    — seconds between orders (default 1)
 *   STEPS            — number of pipeline steps (default 2, max 8)
 *
 * Usage:
 *   TARGET=50 ENQUEUE_EVERY=2 npx ts-node tests/throughput/07-enqueue.ts
 */

import { login, api, sleep, envInt, ts } from './07-shared';

const TARGET = envInt('TARGET', 100);
const ENQUEUE_EVERY = parseFloat(process.env.ENQUEUE_EVERY || '1');
const STEP_COUNT = envInt('STEPS', 2);

const ALL_STATIONS = [
  { stationName: 'ingest',          role: 'ingester',  instructions: 'Ingest raw materials into the system.' },
  { stationName: 'render-assets',   role: 'renderer',  instructions: 'Render digital assets from source files.' },
  { stationName: 'validate-assets', role: 'validator',  instructions: 'Validate asset integrity and compliance.' },
  { stationName: 'print-assets',    role: 'printer',   instructions: 'Print physical assets from digital masters.' },
  { stationName: 'grind-assets',    role: 'grinder',   instructions: 'Grind widget to spec.' },
  { stationName: 'finish-assets',   role: 'finisher',  instructions: 'Apply finish coat and polish.' },
  { stationName: 'package-assets',  role: 'packager',  instructions: 'Package assets for shipping.' },
  { stationName: 'ship-assets',     role: 'shipper',   instructions: 'Ship completed order to customer.' },
];

const STATIONS = ALL_STATIONS.slice(0, Math.min(STEP_COUNT, ALL_STATIONS.length));

const RUN_ID = Math.floor(Date.now() / 1000).toString();

async function main() {
  await login();
  console.log(`[${ts()}] Enqueuer started — ${TARGET} orders, 1 every ${ENQUEUE_EVERY}s (run ${RUN_ID})`);

  await api('PUT', '/api/workflows/stepIterator/config', {
    invocable: true,
    task_queue: 'assembly-line',
    default_role: 'reviewer',
  });

  for (let i = 0; i < TARGET; i++) {
    const wfId = `stepIterator-${RUN_ID}-${i}`;
    try {
      const r = await api('POST', '/api/workflows/stepIterator/invoke', {
        data: { name: `Widget-${RUN_ID}-${i}`, steps: STATIONS },
        workflowId: wfId,
      });
      console.log(`[${ts()}] ${i + 1}/${TARGET} enqueued → ${r.workflowId}`);
    } catch (err: any) {
      console.error(`[${ts()}] ${i + 1}/${TARGET} FAILED: ${err.message}`);
    }
    if (i < TARGET - 1) await sleep(ENQUEUE_EVERY * 1000);
  }

  console.log(`[${ts()}] Enqueuer done — ${TARGET} orders submitted`);
}

main().catch((err) => { console.error(err); process.exit(1); });

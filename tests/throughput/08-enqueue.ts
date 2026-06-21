/**
 * 08-enqueue — Rolling enqueue for the ortho pipeline.
 *
 * Adds one batch of orders per compressed hour for BATCHES hours.
 * Each order enters the 7-step pipeline. The print-assets step
 * uses printstation to orchestrate PRINTER_SETS × 2 printers.
 *
 * Env vars:
 *   DAILY_VOLUME      — orders per day (default 500)
 *   BASELINE_HOURS    — real work hours per day (default 8)
 *   COMPRESSION_HOURS — compressed hours per day (default 1)
 *   BATCHES           — number of batches to enqueue (default 5)
 *   PRINTER_SETS      — printer sets per order (default 3, × 2 = 6 printers)
 *
 * Usage:
 *   npm run ortho:enqueue
 *   DAILY_VOLUME=16 COMPRESSION_HOURS=0.1 BATCHES=2 npm run ortho:enqueue
 */

import {
  login, api, sleep, ts,
  PIPELINE_STEPS, DAY_PHASES,
  BATCHES, PRINTER_SETS, DAILY_VOLUME, BASELINE_HOURS, COMPRESSION_HOURS, HOLD_S,
  compressedBatchSize, compressionWindowMs,
  PipelineStepDef,
} from './08-shared';

const RUN_ID = process.env.RUN_ID || Math.floor(Date.now() / 1000).toString();

// EFFICIENT=1 routes every step to its atomic-escalation child (stationEfficient
// / printstationEfficient), so the escalation row is written in the workflow's
// Leg1 checkpoint instead of via a separate createStationEscalation activity +
// enrich. Same workload, same dashboard resolve path — fewer moving parts.
const EFFICIENT = process.env.EFFICIENT === '1';
const WF_PREFIX = EFFICIENT ? 'ortho-eff' : 'ortho';

function buildSteps(): PipelineStepDef[] {
  return PIPELINE_STEPS.map((step) => {
    if (step.stationName === 'print-assets') {
      return {
        ...step,
        printerSets: PRINTER_SETS,
        ...(EFFICIENT ? { childWorkflow: 'printstationEfficient' } : {}),
      };
    }
    return EFFICIENT ? { ...step, childWorkflow: 'stationEfficient' } : step;
  });
}

async function main() {
  await login();

  const batchSize = compressedBatchSize();
  const windowMs = compressionWindowMs();
  const steps = buildSteps();
  const totalPrinters = PRINTER_SETS * 2;

  const escalationsPerOrder = steps.reduce((sum, s) => {
    if (s.childWorkflow === 'printstation') return sum + (s.printerSets || PRINTER_SETS) * 2;
    return sum + 1;
  }, 0);

  const windowMinutes = +(windowMs / 60_000).toFixed(1);
  const escalationsPerBatch = escalationsPerOrder * batchSize;
  const peakConcurrentBatches = Math.min(BATCHES, 5);
  const peakEscalationsPerWindow = escalationsPerBatch * peakConcurrentBatches;
  const eventsPerMinute = +(peakEscalationsPerWindow / windowMinutes).toFixed(1);

  const manifest = {
    runId: RUN_ID,
    simulation: {
      lengthOfDay: `${BASELINE_HOURS}h`,
      dailyVolume: DAILY_VOLUME,
      ordersPerMinute: +(DAILY_VOLUME / (BASELINE_HOURS * 60)).toFixed(2),
      compressionRatio: `${BASELINE_HOURS}h → ${COMPRESSION_HOURS}h`,
      compressedWindow: `${windowMinutes}min`,
      ordersPerWindow: batchSize,
    },
    eventPressure: {
      escalationsPerOrder,
      escalationsPerWindow: escalationsPerBatch,
      peakConcurrentDays: peakConcurrentBatches,
      peakEscalationsPerWindow: peakEscalationsPerWindow,
      peakEventsPerMinute: eventsPerMinute,
      note: [
        `Each window processes ${batchSize} orders × ${escalationsPerOrder} escalations = ${escalationsPerBatch} events.`,
        `At peak (${peakConcurrentBatches} stacked batches), ${peakEscalationsPerWindow} escalations flow through a single ${windowMinutes}min window (${eventsPerMinute}/min).`,
        `Each escalation is a full round-trip: workflow creates it, external actor claims it, holds for ${process.env.MIN_HOLD_S || 5}s, then resolves — signaling the paused workflow to continue.`,
        `When the window is large enough for all ${BATCHES} batches to overlap, every pipeline phase is active simultaneously and the per-minute event rate represents the system under full production load.`,
        `This is the same per-minute density as ${DAILY_VOLUME} orders/${BASELINE_HOURS}h. Scaling to longer durations adds data at rest but not additional throughput pressure.`,
      ].join(' '),
    },
    schedule: Object.entries(DAY_PHASES).map(([day, phase]) => ({
      day: +day,
      phase: phase.name,
      steps: phase.steps,
      ...(+day === 2 ? {
        printer: {
          sets: PRINTER_SETS,
          printersPerSet: 2,
          totalPrinters: totalPrinters,
          escalationsPerOrder: totalPrinters,
        },
      } : {}),
    })),
    holdSeconds: HOLD_S,
    pipeline: PIPELINE_STEPS.map((s, i) => ({
      step: i,
      station: s.stationName,
      role: s.role,
      ...(s.childWorkflow ? {
        orchestrator: s.childWorkflow,
        children: totalPrinters,
      } : {}),
    })),
    totals: {
      batches: BATCHES,
      totalOrders: BATCHES * batchSize,
      totalEscalations: escalationsPerBatch * BATCHES,
    },
  };

  console.log(`\n[${ts()}] Ortho Pipeline Manifest (RUN_ID=${RUN_ID})`);
  console.log(`─────────────────────────────────────`);
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`─────────────────────────────────────\n`);

  // Register pipeline workflow
  await api('PUT', '/api/workflows/pipeline/config', {
    invocable: true,
    task_queue: 'ortho-pipeline',
    default_role: 'reviewer',
  });

  for (let batch = 0; batch < BATCHES; batch++) {
    const batchStart = Date.now();
    const enqueueInterval = windowMs / batchSize;

    console.log(`[${ts()}] ── Batch ${batch} ── (${batchSize} orders over ${(windowMs / 60_000).toFixed(1)}min)`);

    for (let i = 0; i < batchSize; i++) {
      const wfId = `${WF_PREFIX}-${RUN_ID}-b${batch}-${i}`;
      try {
        const r = await api('POST', '/api/workflows/pipeline/invoke', {
          data: { name: `Ortho-${RUN_ID}-b${batch}-${i}`, steps },
          workflowId: wfId,
        });
        console.log(`[${ts()}]   ${i + 1}/${batchSize} enqueued → ${r.workflowId}`);
      } catch (err: any) {
        console.error(`[${ts()}]   ${i + 1}/${batchSize} FAILED: ${err.message}`);
      }

      if (i < batchSize - 1) {
        await sleep(enqueueInterval);
      }
    }

    // Wait until the hour boundary before starting next batch
    const elapsed = Date.now() - batchStart;
    const remaining = windowMs - elapsed;
    if (batch < BATCHES - 1 && remaining > 0) {
      console.log(`[${ts()}]   Batch ${batch} done. Waiting ${(remaining / 60_000).toFixed(1)}min for next batch...\n`);
      await sleep(remaining);
    }
  }

  console.log(`\n[${ts()}] Enqueuer done — ${BATCHES * batchSize} orders submitted across ${BATCHES} batches`);
}

main().catch((err) => { console.error(err); process.exit(1); });

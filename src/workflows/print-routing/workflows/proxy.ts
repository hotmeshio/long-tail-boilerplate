/**
 * Shared activity proxies for the print-routing workflows. Proxy the whole
 * activities barrel once; each workflow imports the handles it calls.
 */

import { Durable } from '@hotmeshio/hotmesh';

import * as activities from '../activities';

export const {
  enqueueOrderUnits,
  dispatchBatch,
  settleOrder,
  runPrintJob,
  technicianBatch,
  inspectorBatch,
  buildShiftPlan,
  powerDownIdlePrinters,
} = Durable.workflow.proxyActivities<typeof activities>({
  activities,
  retry: { maximumAttempts: 3 },
});

/**
 * Pacing defaults for the broker (and crew) loops.
 *
 * The broker hot path lives inside `dispatchBatch` (activity), so its sleep is
 * `activeSleepMs`/`idleSleepMs` per iteration — not a durable sleep.
 * `maxIterations` controls how many iterations run before the workflow
 * checkpoints via `continueAsNew`.
 *
 *   Test  — activeSleepMs:200, idleSleepMs:1000, maxIterations:10
 *   Prod  — activeSleepMs:2000, idleSleepMs:30000, maxIterations:20
 */
export const LOOP_DEFAULTS = {
  maxIterations: 10,
  activeSleepMs: 200,
  idleSleepMs: 1_000,
  /** Idle batch calls before a loop (broker OR crew) self-terminates. Counted in
   *  BATCHES now — one batch ≈ maxIterations × idleSleepMs of wall time — so the
   *  broker and crew share the same idle tolerance (was skewed when the crew used
   *  a per-tick model and self-terminated far sooner than the broker). */
  maxIdleRuns: 3,
  /** Adverts read per crew scan pass (technician/inspector), inside the batch. */
  crewScanLimit: 100,
};

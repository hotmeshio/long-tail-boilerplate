/**
 * Shared config, scenario builders, and helpers for the 10-* print-routing farm.
 *
 * The print farm is a two-sided market: ORDERS (demand) and PRINTER adverts
 * (supply), matched by an autonomous broker while a technician (refills) and
 * inspector (signoff/reprints) close the loops. Unlike the 08-* ortho pipeline —
 * where external day-resolver scripts stand in for humans — here the resolvers
 * are durable workflows running inside the app. So the orchestrator only has two
 * jobs: START the workflows (supply + demand) and WATCH convergence over HTTP.
 *
 * Capacity note: each printer does EOL_RUNS (10) print runs before it retires,
 * and one order = one run (plus a run per reprint). So a run converges only when
 *   FLEET_SIZE × EOL_RUNS  ≳  DAILY_VOLUME (+ reprints).
 * Size the fleet accordingly, or the watchdog will stall once supply is exhausted.
 */

export { login, api, sleep, ts, envInt, ageSeconds, BASE_URL } from './07-shared';
import { api } from './07-shared';

import {
  fleetKind,
  EOL_RUNS,
  PRINT_WORKFLOWS,
  PRINT_ROUTING_QUEUE,
  PRINTER_POND,
  DEFAULT_MAX_ADVERTS,
  type FleetKind,
  type PrinterData,
  type PrintOrderData,
  type Side,
} from '../../src/workflows/print-routing/types';
import { operatorIds, type PrintOperators } from '../../src/workflows/print-routing/operators';

export { EOL_RUNS, PRINT_WORKFLOWS, PRINT_ROUTING_QUEUE, DEFAULT_MAX_ADVERTS };
export type { PrintOperators };

// ── Run config (env-driven, ortho-style knobs) ───────────────────────────────

export const RUN_ID = process.env.RUN_ID || Math.floor(Date.now() / 1000).toString();
export const DIABETIC = process.env.DIABETIC === '1' || process.env.DIABETIC === 'true';
export const FLEET_KIND: FleetKind = fleetKind(DIABETIC);

/** Printers in the fleet (supply surface). */
export const FLEET_SIZE = parseInt(process.env.FLEET_SIZE || '2', 10);
/** Total orders to enqueue across the run (demand surface). */
export const DAILY_VOLUME = parseInt(process.env.DAILY_VOLUME || '12', 10);
/** Number of order waves the demand surface releases. */
export const BATCHES = parseInt(process.env.BATCHES || '2', 10);
/**
 * The gap between waves — the pressure-gradient knob — resolved in priority:
 *   1. WAVE_GAP_S       — set the gap directly in seconds (simplest)
 *   2. COMPRESSION_HOURS — spread all waves across this window (ortho-style compression)
 *   3. default 5s       — a brisk gap so small runs aren't silent for minutes
 */
export const WAVE_GAP_S = process.env.WAVE_GAP_S !== undefined ? parseFloat(process.env.WAVE_GAP_S) : undefined;
export const COMPRESSION_HOURS = process.env.COMPRESSION_HOURS !== undefined ? parseFloat(process.env.COMPRESSION_HOURS) : undefined;

/** Idle pacing for the autonomous crew loops (broker/technician/inspector). */
export const CREW_IDLE_TICK_S = parseInt(process.env.CREW_IDLE_TICK_S || '2', 10);
/** Idle ticks the crew tolerates before self-terminating once demand goes quiet. */
export const CREW_MAX_IDLE = parseInt(process.env.CREW_MAX_IDLE || '300', 10);
/**
 * Cap on `ready` adverts the broker reads per pond per iteration — its capacity horizon.
 * Raise this for large fleets: with 200 printers, setting to 60 lets the broker dispatch
 * 60 jobs per iteration instead of the default 10, avoiding the 20-iteration lag.
 */
export const MAX_ADVERTS = process.env.MAX_ADVERTS !== undefined
  ? parseInt(process.env.MAX_ADVERTS, 10)
  : DEFAULT_MAX_ADVERTS;
/**
 * Max conditions opened concurrently in the broker's harvest step. Caps the NATS
 * signal burst — each open condition is a live subscription. Lower values are safer
 * for local Docker; raise for production (AWS handles 100+).
 */
export const CONDITION_CHUNK_SIZE = process.env.CONDITION_CHUNK_SIZE !== undefined
  ? parseInt(process.env.CONDITION_CHUNK_SIZE, 10)
  : 20;

export const FILAMENT = process.env.FILAMENT || 'pla';

export function batchSize(): number {
  return Math.ceil(DAILY_VOLUME / BATCHES);
}

export function waveGapMs(): number {
  if (WAVE_GAP_S !== undefined) return Math.round(WAVE_GAP_S * 1000);
  if (COMPRESSION_HOURS !== undefined) return Math.round((COMPRESSION_HOURS * 60 * 60 * 1000) / BATCHES);
  return 5_000; // brisk default
}

// ── Operators (stable UUIDs seeded by scripts/print-seed.ts) ─────────────────

export function operators(diabetic = DIABETIC): PrintOperators {
  return operatorIds(diabetic);
}

// ── Marketplace telemetry (queried from the escalation queue) ────────────────

/** A live read of the supply side for one run, derived from the printer pool. */
export interface FleetSnapshot {
  /** Printers parked on a ready advert, waiting for the broker to hand off a job. */
  idle: number;
  /** Jobs in flight — the broker has handed off and is awaiting the printer's callback. */
  inflight: number;
  /** Completed print runs (resolved printing adverts). */
  prints: number;
  /** Filament refills the technician has resolved. */
  refills: number;
}

/**
 * Snapshot this run's supply side from the printer pool (`print-<runId>-*`). Unlike
 * counting retired printers (which never fires until a machine hits 10 runs), this
 * shows the marketplace actually clearing: idle supply, in-flight handoffs, prints
 * done, refills. Counts are filtered to this run, so concurrent runs don't bleed in.
 */
export async function fleetSnapshot(diabetic = DIABETIC, runId = RUN_ID): Promise<FleetSnapshot> {
  const role = PRINTER_POND[fleetKind(diabetic)];
  const prefix = `print-${runId}-`;
  const count = (status: string, state: string) =>
    api('POST', '/api/escalations/search-by-facets', { role, facets: { state }, status, limit: 5000 })
      .then((r: any) => (r?.escalations || []).filter((e: any) => (e.metadata?.printerId || '').startsWith(prefix)).length)
      .catch(() => 0);
  const [idle, inflight, prints, refills] = await Promise.all([
    count('pending', 'ready'),
    count('pending', 'printing'),
    count('resolved', 'printing'),
    count('resolved', 'maintenance'),
  ]);
  return { idle, inflight, prints, refills };
}

// ── Scenario builders (supply + demand) ──────────────────────────────────────

/** The printer fleet — all pla/standard so capability matching is trivial. */
export function buildFleet(runId = RUN_ID, size = FLEET_SIZE, diabetic = DIABETIC): PrinterData[] {
  return Array.from({ length: size }, (_, i) => ({
    printerId: `print-${runId}-p${i}`,
    diabetic,
    filament: FILAMENT,
    sizeClass: 'standard',
  }));
}

/** The order book — 4–6 insoles each, staggered deadlines so jeopardy ordering sorts. */
export function buildOrders(
  now: number,
  runId = RUN_ID,
  count = DAILY_VOLUME,
  diabetic = DIABETIC,
): PrintOrderData[] {
  return Array.from({ length: count }, (_, i) => ({
    orderId: `print-${runId}-o${i}`,
    diabetic,
    customerId: `cust-${i}`,
    filament: FILAMENT,
    sizeClass: 'standard',
    units: Array.from({ length: 4 + (i % 3) }, (_, j) => ({
      side: (j % 2 === 0 ? 'L' : 'R') as Side,
    })),
    approvedAt: now,
    mustCompleteBy: now + (i + 1) * 60_000,
  }));
}

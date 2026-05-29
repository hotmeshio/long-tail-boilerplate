/**
 * Shared constants and utilities for the 08-* ortho pipeline tests.
 *
 * Defines the manufacturing DSL, day-phase mapping, compression
 * config, and random schedule generation.
 */

export { login, api, sleep, envInt, ageSeconds, ts, getUserId, BASE_URL } from './07-shared';
import { envInt } from './07-shared';

// ── Pipeline DSL (7 sequential steps — ingest is the enqueue itself) ──────

export interface PipelineStepDef {
  stationName: string;
  role: string;
  instructions: string;
  childWorkflow?: string;
  printerSets?: number;
}

export const PIPELINE_STEPS: (PipelineStepDef & { realDurationMinutes: number })[] = [
  { stationName: 'render-assets',   role: 'renderer',  realDurationMinutes: 30, instructions: 'Render 3D foot model from scan data.' },
  { stationName: 'validate-assets', role: 'validator',  realDurationMinutes: 15, instructions: 'Validate mesh integrity and dimensional tolerances.' },
  { stationName: 'print-assets',    role: 'printer',    realDurationMinutes: 45, instructions: 'Print orthotic from validated model.', childWorkflow: 'printstation' },
  { stationName: 'grind-assets',    role: 'grinder',    realDurationMinutes: 20, instructions: 'Grind printed orthotic to final contour.' },
  { stationName: 'finish-assets',   role: 'finisher',   realDurationMinutes: 25, instructions: 'Apply finish coat and surface treatment.' },
  { stationName: 'package-assets',  role: 'packager',   realDurationMinutes: 10, instructions: 'Package orthotic with documentation.' },
  { stationName: 'ship-assets',     role: 'shipper',    realDurationMinutes: 5,  instructions: 'Ship completed order to provider.' },
];

// ── Day-phase mapping (orthodics manufacturing) ──────────────────────────

export const DAY_ROLES: Record<number, string[]> = {
  1: ['renderer', 'validator'],
  2: ['printer'],
  3: ['grinder', 'finisher'],
  4: ['packager', 'shipper'],
};

export const DAY_PHASES: Record<number, { name: string; steps: string[] }> = {
  0: { name: 'ingest',      steps: ['enqueue order'] },
  1: { name: 'digital-prep', steps: ['render-assets', 'validate-assets'] },
  2: { name: 'fabrication',  steps: ['print-assets'] },
  3: { name: 'finishing',    steps: ['grind-assets', 'finish-assets'] },
  4: { name: 'fulfillment',  steps: ['package-assets', 'ship-assets'] },
};

// ── Compression config ───────────────────────────────────────────────────

export const DAILY_VOLUME = envInt('DAILY_VOLUME', 500);
export const BASELINE_HOURS = envInt('BASELINE_HOURS', 8);
export const COMPRESSION_HOURS = parseFloat(process.env.COMPRESSION_HOURS || '1');
export const BATCHES = envInt('BATCHES', 5);
export const PRINTER_SETS = envInt('PRINTER_SETS', 3);

export function compressedBatchSize(): number {
  return Math.ceil(DAILY_VOLUME / (BASELINE_HOURS / COMPRESSION_HOURS));
}

export function compressionWindowMs(): number {
  return COMPRESSION_HOURS * 60 * 60 * 1000;
}

// ── Hold time ────────────────────────────────────────────────────────

/** Minimum seconds an item is held before resolving. Default 4s. */
export const HOLD_S = parseFloat(process.env.HOLD_S || '4');

export function holdMsForRole(_role: string): number {
  return HOLD_S * 1000;
}

// ── Random schedule generation ───────────────────────────────────────────

export interface ScheduledEvent {
  claimAtMs: number;
  resolveDurationMs: number;
}

/**
 * Generate a random schedule of N claim/resolve events spread
 * across a time window. Each event gets a random claim time
 * and a resolve duration between 5-45 seconds.
 */
export function generateSchedule(
  count: number,
  windowMs: number,
): ScheduledEvent[] {
  const margin = Math.min(30_000, windowMs * 0.05);
  const events: ScheduledEvent[] = Array.from({ length: count }, () => ({
    claimAtMs: margin + Math.floor(Math.random() * (windowMs - 2 * margin)),
    resolveDurationMs: 5_000 + Math.floor(Math.random() * 40_000),
  }));
  return events.sort((a, b) => a.claimAtMs - b.claimAtMs);
}

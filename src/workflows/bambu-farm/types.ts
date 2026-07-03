/**
 * Bambu Farm types — a virtual print farm whose machines speak the REAL Bambu
 * integration language.
 *
 * This is the testbed for acme-mono's three-environment parity work: each
 * `bambuPrinter` is a durable workflow whose lifecycle mirrors the Farm Manager's
 * `gcode_state` machine (IDLE → PREPARE → RUNNING → FINISH/FAILED → bed_clean →
 * IDLE), whose dispatch payload is byte-shaped like Acme's IoT command, and whose
 * emitted events are byte-shaped like Acme's `PrinterBambuDto` webhook. A system
 * above the membrane cannot tell this fleet from hardware — that is the point.
 *
 * Failure is data, never chaos: a `SimulateDirective` rides on the dispatch
 * payload and the machine plays it back (job_failed with hms codes, job_rejected
 * with Bambu dispatch error codes, or going dark mid-job).
 */

// ── Roles (hard capability walls) ────────────────────────────────────────────

/** Supply pond — every machine's ready advert lives here. */
export const BAMBU_POOL = 'bambu-pool';

export const ALL_BAMBU_ROLES = [BAMBU_POOL] as const;

export const BAMBU_FARM_QUEUE = 'bambu-farm';

/** Registered workflow function names (also each row's `workflow_type`). */
export const BAMBU_WORKFLOWS = {
  PRINTER: 'bambuPrinter',
} as const;

// ── The Bambu event language (mirrors acme-mono's PrinterBambuDto) ───────────

export type BambuEventType =
  | 'job_start'
  | 'job_printing'
  | 'job_paused'
  | 'job_resume'
  | 'job_failed'
  | 'job_finished'
  | 'printer_ready'
  | 'job_rejected';

/** Error payload carried by job_failed / job_rejected (real Bambu shape). */
export interface BambuErrorDetails {
  message?: string;
  code?: string;
  bambu_error_code?: number;
  hms_code?: string;
  hms_wiki_url?: string;
}

/**
 * One printer event, shaped exactly as acme-mono's webhook DTO. `printer_sn`
 * is the machine's serial (Acme maps it to `Machine.externalId`).
 */
export interface BambuPrinterEvent {
  event_type: BambuEventType;
  printer_sn: string;
  timestamp: number;
  file_name?: string;
  error_details?: BambuErrorDetails;
}

/** Real Bambu dispatch error codes (Farm Manager API v2.6, §4.6.3). */
export const BAMBU_DISPATCH_ERRORS = {
  DEVICE_BUSY: 1051,
  NO_SD_CARD: 1052,
  INVALID_FILAMENT: 1053,
  MQTT_FAILED: 1005,
  UNBOUND_DEVICE: 1006,
} as const;

/** A representative HMS code for simulated print failures. */
export const DEFAULT_HMS_CODE = '0300-0100-0001-0001';
export const HMS_WIKI_URL = 'https://wiki.bambulab.com/en/hms/home';

// ── The dispatch command (mirrors acme-mono's IoT payload) ───────────────────

/**
 * What Acme's backend publishes to AWS IoT today, verbatim. The membrane carries
 * this shape unchanged so the Acme port is a transport swap, not a translation.
 */
export interface BambuDispatchCommand {
  deviceId: string;
  fileName: string;
  folderName: string;
  presignedUrl: string;
}

// ── Failure directives (data-driven simulation) ──────────────────────────────

export type SimulateMode =
  /** Print completes, plate cleared, printer_ready fires. The default. */
  | 'ok'
  /** Print starts then fails mid-run with an hms code (Acme auto-requeues). */
  | 'job_failed'
  /** Dispatch bounced at the door — 1051/1053-class error (Acme cancels). */
  | 'job_rejected'
  /** Machine goes dark after job_start: no finish, no ready — the watchdog case. */
  | 'silent';

export interface SimulateDirective {
  mode: SimulateMode;
  /** hms code for job_failed (defaults to DEFAULT_HMS_CODE). */
  hmsCode?: string;
  /** Bambu dispatch error for job_rejected (defaults to INVALID_FILAMENT). */
  bambuErrorCode?: number;
  message?: string;
  /** Wall-clock the simulated print runs before finishing (default DEFAULT_PRINT_SECONDS). */
  printSeconds?: number;
  /** Gap between job_finished and printer_ready — the human collecting (default DEFAULT_COLLECT_SECONDS). */
  collectSeconds?: number;
}

/**
 * The payload that resolves a machine's ready advert — the handoff. In Acme this
 * is what the `virtual` dispatch adapter delivers via `resolveByMetadata`.
 */
export interface BambuJobPayload {
  command: BambuDispatchCommand;
  simulate?: SimulateDirective;
  /** Resolve a ready advert with this (no command) to retire the machine. */
  powerdown?: boolean;
}

// ── Machine facets (the advert's queryable surface) ──────────────────────────

/**
 * `MACHINE` is deliberately namespaced (`bambuMachine`, Acme: `vpMachine`) and
 * adverts carry NO `orderId` facet — order-keyed resolvers must never match a
 * printer advert.
 */
export const BAMBU_FACETS = {
  MACHINE: 'bambuMachine',
  MACHINE_NAME: 'machineName',
  STATE: 'state',
  RUN: 'run',
  LAST_OUTCOME: 'lastOutcome',
} as const;

export const MACHINE_STATE = {
  READY: 'ready',
} as const;

// ── Machine shapes ───────────────────────────────────────────────────────────

/** How one dispatched job ended, as the machine's own history records it. */
export type RunOutcome = 'success' | 'failed' | 'rejected' | 'dark';

export interface BambuPrinterData {
  /** The serial — Acme's Machine.externalId, the webhook's printer_sn. */
  deviceId: string;
  /** Human name — Acme's Machine.name, the IoT command's folderName. */
  machineName: string;
  /** Runs before the machine retires (bounds the advert loop). */
  maxRuns?: number;
}

/** One run's story, accumulated in workflow state (replay-safe: built from activity results). */
export interface BambuRunRecord {
  run: number;
  fileName: string;
  events: BambuEventType[];
  outcome: RunOutcome;
  hmsCode?: string;
  bambuErrorCode?: number;
}

export interface BambuPrinterResult {
  deviceId: string;
  machineName: string;
  runs: number;
  retired: boolean;
  /** True when a `silent` directive took the machine dark mid-job. */
  wentDark: boolean;
  history: BambuRunRecord[];
}

// ── Defaults ─────────────────────────────────────────────────────────────────

/** Simulated print time — overridable per job via SimulateDirective.printSeconds. */
export const DEFAULT_PRINT_SECONDS = 2;
/** Simulated finish→collected gap (the associate walking over, bed_clean). */
export const DEFAULT_COLLECT_SECONDS = 1;
/** Advert-loop bound; a real fleet retires machines, so the virtual one does too. */
export const DEFAULT_MAX_RUNS = 50;

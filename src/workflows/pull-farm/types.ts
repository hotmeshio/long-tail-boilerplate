/**
 * Pull Farm — the claim-as-lease contention proof.
 *
 * The question this answers (for acme-mono's virtual farm and every pull-crew
 * after it): when N pullers, each a DISTINCT principal, race one pond of work,
 * does the membrane arbitrate perfectly? Concretely:
 *
 *   - a claim by principal B on a row principal A holds → rejected (true lease)
 *   - a late resolve (row settled first by someone else) → ordinary ending
 *   - every unit resolved exactly once, no matter the contention
 *   - a puller that claims and goes dark → the claim TTL returns the work
 *
 * Demand is `pullDemand` → N `pullUnit` children, each parking one escalation
 * in the pond (the printDispatcher/printJobWorker shape). Supply is `puller`
 * crew-loops: scan → claim → work (durable sleep) → resolve, counting every
 * lost race with the status code that rejected it.
 */

export const PULL_POND = 'pull-pond';
export const PULL_FARM_QUEUE = 'pull-farm';

export const PULL_WORKFLOWS = {
  DEMAND: 'pullDemand',
  UNIT: 'pullUnit',
  PULLER: 'puller',
} as const;

export const PULL_FACETS = {
  BATCH: 'pullBatch',
  UNIT: 'pullUnit',
} as const;

/** Per-run directive for a puller: work it, or claim it and go dark. */
export type PullDirective = 'ok' | 'silent';

// ── Demand ───────────────────────────────────────────────────────────────────

export interface PullDemandData {
  /** Batch key — pullers scan only their batch so runs never cross-talk. */
  batch: string;
  units: number;
}

export interface PullUnitData {
  batch: string;
  unitIndex: number;
}

/** What a puller resolves a unit with — recorded on the row and the unit's return. */
export interface PullResolution {
  pullerId: string;
  run: number;
}

export interface PullDemandResult {
  batch: string;
  units: number;
  /** pullerId per unit, in unit order — the distribution proof. */
  resolvedBy: (string | null)[];
}

// ── Supply ───────────────────────────────────────────────────────────────────

export interface PullerData {
  pullerId: string;
  /** The puller's own principal — claims are leases only across principals. */
  operatorId: string;
  batch: string;
  plan?: PullDirective[];
  workSeconds?: number;
  claimMinutes?: number;
  maxRuns?: number;
  maxIdleTicks?: number;
  idleTickSeconds?: number;
}

export interface PullerResult {
  pullerId: string;
  resolved: number;
  /** Claims rejected because another principal held the lease — with statuses. */
  lostClaims: number;
  lostClaimStatuses: number[];
  /** Resolves that arrived after another actor settled the row. */
  lostResolves: number;
  wentDark: boolean;
}

export const PULL_DEFAULTS = {
  workSeconds: 1,
  claimMinutes: 5,
  maxRuns: 50,
  maxIdleTicks: 8,
  idleTickSeconds: 1,
} as const;

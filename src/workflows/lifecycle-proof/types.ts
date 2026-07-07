/**
 * Lifecycle proof — the minimal, isolated expression of the three core
 * patterns every simulation actor derives from. No HTTP, no logins, no
 * business objects: just the escalation surface and durable controls.
 *
 *   proofActor    — the ASSOCIATE pattern: a batch-loop worker (one proxy
 *                   activity per batch), pill-retirable, idle-budgeted,
 *                   continueAsNew before replay history grows.
 *   proofWaiter   — the PRINTER pattern: a pure event-driven machine — parks
 *                   ONE advert as its own conditionLT wait (timeout = idle
 *                   budget) and acts only when assigned.
 *   proofDirector — the DIRECTOR pattern: wind-down (fast-dry, then pills) →
 *                   cast → durable timer → retire wave → converge, every
 *                   durable promise rooted in ONE awaited tree.
 */

export const PROOF_QUEUE = 'lifecycle-proof';

/** The one seeded proof principal (scripts/seed.ts inserts it). */
export const PROOF_PRINCIPAL = '0e000000-0000-4000-8000-000000000001';

export const PROOF_ROLES = {
  ACTOR: 'proof-actor',
  WAITER: 'proof-waiter',
} as const;

export const PROOF_SUBTYPES = {
  WORK: 'proof-work',
  ADVERT: 'proof-advert',
  PILL: 'proof-pill',
} as const;

export interface ProofDirectorData {
  actors?: number;
  waiters?: number;
  /** Demand items to seed for each side (actors' pond + waiters' assignments). */
  workItems?: number;
  /** The run window, in seconds (a durable timer inside the converge tree). */
  durationSeconds?: number;
  carried?: never;
}

export interface ProofActorData {
  actorId: string;
  maxIdleBatches?: number;
  maxIterations?: number;
  idleTickMs?: number;
  carried?: { worked: string[]; idleBatches: number };
}

export interface ProofWaiterData {
  waiterId: string;
  idleSeconds?: number;
  carried?: { worked: string[]; loops: number };
}

export interface ProofDirectorResult {
  windDown: { fastDry: boolean; retired: string[] };
  cast: { actors: number; waiters: number };
  worked: { byActors: number; byWaiters: number };
  retire: { pillsConsumed: number; watersRetired: number };
  converged: true;
}

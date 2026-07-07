/**
 * Lifecycle proof — the core patterns, isolated. Every rule this file obeys
 * exists because breaking it wedged or crashed a real floor:
 *
 *   RULE 1 (sentinel): a durable promise never dangles across another
 *          durable await — everything roots in ONE awaited tree.
 *   RULE 2 (self-settling waits): every conditionLT carries a timeout; a
 *          child that can sleep forever can wedge a parent forever.
 *   RULE 3 (batching): the durable ledger records batches, not ticks — one
 *          proxy activity per batch, continueAsNew before history grows.
 *   RULE 4 (ids): children carry parent-scoped ids; fixed-id collisions
 *          inside a cast collation abort sibling creation.
 *   RULE 5 (retirement): pills for pond workers, terminate-by-id ONLY for
 *          leaf feeders — terminating a child never settles a parent await.
 */

import { Durable } from '@hotmeshio/hotmesh';

import { conditionLT } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import { JOB_EXPIRE_SECS } from '@hotmeshio/long-tail/build/modules/defaults';

import * as activities from './activities';
import { PROOF_QUEUE, PROOF_ROLES, PROOF_SUBTYPES } from './types';
import type { ProofActorData, ProofDirectorData, ProofWaiterData } from './types';

const { seedWork, actorBatch, workAssignment, assignBatch, signalDone } = Durable.workflow.proxyActivities<typeof activities>({
  activities,
  retry: { maximumAttempts: 3 },
});

/** RULE 3's replay ceiling. */
const BATCHES_PER_LIFE = 5;

// ── proofPill — retirement through the membrane, self-expiring (RULE 2) ─────

export async function proofPill(envelope: LTEnvelope): Promise<unknown> {
  const d = (envelope.data ?? {}) as { role: string; timeoutSeconds?: number };
  const ctx = Durable.workflow.workflowInfo();

  const resolution = await conditionLT<{ actor?: string }>(`pill-${ctx.workflowId}`, {
    role: d.role,
    type: 'lifecycleProof',
    subtype: PROOF_SUBTYPES.PILL,
    priority: 1,
    description: `Proof pill — the ${d.role} that consumes this retires`,
    metadata: { pillId: ctx.workflowId },
    timeout: `${d.timeoutSeconds ?? 30}s`,
  });

  if (resolution === false) return { type: 'return' as const, data: { consumed: false, by: null } };
  return { type: 'return' as const, data: { consumed: true, by: resolution?.actor ?? null } };
}

// ── proofActor — the ASSOCIATE pattern (RULE 3) ─────────────────────────────

export async function proofActor(envelope: LTEnvelope): Promise<unknown> {
  const d = envelope.data as ProofActorData;
  if (!d?.actorId) throw new Error('proofActor requires data.actorId');

  const maxIdleBatches = d.maxIdleBatches ?? 3;
  const maxIterations = d.maxIterations ?? 5;
  const idleTickMs = d.idleTickMs ?? 1000;

  const worked: string[] = [...(d.carried?.worked ?? [])];
  let idleBatches = d.carried?.idleBatches ?? 0;
  let poweredDown = false;
  let batchesThisLife = 0;

  while (idleBatches < maxIdleBatches) {
    const batch = await actorBatch({ actorId: d.actorId, maxIterations, idleTickMs });
    worked.push(...batch.worked);
    idleBatches = batch.didWork ? 0 : idleBatches + 1;
    if (batch.poweredDown) {
      poweredDown = true;
      break;
    }
    batchesThisLife++;
    if (batchesThisLife >= BATCHES_PER_LIFE && idleBatches < maxIdleBatches) {
      await Durable.workflow.continueAsNew({
        data: { ...d, carried: { worked, idleBatches } },
        metadata: envelope.metadata,
      });
    }
  }

  return { type: 'return' as const, data: { actorId: d.actorId, worked: worked.length, poweredDown } };
}

// ── proofWaiter — the PRINTER pattern (RULE 2: the advert IS the wait) ──────

export async function proofWaiter(envelope: LTEnvelope): Promise<unknown> {
  const d = envelope.data as ProofWaiterData;
  if (!d?.waiterId) throw new Error('proofWaiter requires data.waiterId');

  const idleSeconds = d.idleSeconds ?? 30;
  const worked: string[] = [...(d.carried?.worked ?? [])];
  let loops = d.carried?.loops ?? 0;
  let loopsThisLife = 0;
  let poweredDown = false;

  for (;;) {
    const assignment = await conditionLT<{ itemId?: string; retire?: boolean }>(`advert-${d.waiterId}-l${loops}`, {
      role: PROOF_ROLES.WAITER,
      type: 'lifecycleProof',
      subtype: PROOF_SUBTYPES.ADVERT,
      priority: 3,
      description: `${d.waiterId} — parked, awaiting assignment`,
      metadata: { waiterId: d.waiterId },
      timeout: `${idleSeconds}s`,
    });
    loops++;
    loopsThisLife++;

    if (assignment === false) break; // idle budget spent — clean retirement
    if (assignment?.retire === true) {
      poweredDown = true;
      break;
    }
    if (assignment?.itemId) {
      const run = await workAssignment({ waiterId: d.waiterId, itemId: assignment.itemId });
      if (run.done) worked.push(assignment.itemId);
    }

    if (loopsThisLife >= BATCHES_PER_LIFE) {
      await Durable.workflow.continueAsNew({
        data: { ...d, carried: { worked, loops } },
        metadata: envelope.metadata,
      });
    }
  }

  return { type: 'return' as const, data: { waiterId: d.waiterId, worked: worked.length, poweredDown } };
}

// ── chainedActor — the GENERATION CHAIN (the un-taxing loop) ────────────────
//
// No long-lived execution at all: each generation performs ONE batch (one
// proxy activity), then fire-and-forget starts its successor under an
// incremented suffix and ENDS. The engine holds no open loops, no held child
// promises, no growing replay ledger — each link is a tiny complete job.
// Retirement: a consumed pill (or the idle budget) makes a link TERMINAL —
// it signals the director's parked wait by signal key instead of chaining.

export interface ChainedActorData {
  actorId: string;
  base: string;
  doneSignalKey: string;
  generation?: number;
  worked?: number;
  idleRuns?: number;
  maxIdleRuns?: number;
  maxGenerations?: number;
}

export async function chainedActor(envelope: LTEnvelope): Promise<unknown> {
  const d = envelope.data as ChainedActorData;
  if (!d?.actorId || !d?.base || !d?.doneSignalKey) throw new Error('chainedActor requires actorId, base, doneSignalKey');

  const generation = d.generation ?? 0;
  const maxIdleRuns = d.maxIdleRuns ?? 2;
  const maxGenerations = d.maxGenerations ?? 200;

  // ONE batch of work — the single durable checkpoint of this link.
  const batch = await actorBatch({ actorId: d.actorId, maxIterations: 5, idleTickMs: 1000 });
  const worked = (d.worked ?? 0) + batch.worked.length;
  const idleRuns = batch.didWork ? 0 : (d.idleRuns ?? 0) + 1;

  const terminal = batch.poweredDown || idleRuns >= maxIdleRuns || generation >= maxGenerations;
  if (terminal) {
    await signalDone({
      signalKey: d.doneSignalKey,
      payload: { actorId: d.actorId, worked, generations: generation + 1, poweredDown: batch.poweredDown },
    });
    return { type: 'return' as const, data: { actorId: d.actorId, worked, generations: generation + 1, poweredDown: batch.poweredDown } };
  }

  // Chain: start the successor and END. Fire-and-forget — nothing dangles.
  await Durable.workflow.startChild({
    workflowName: 'chainedActor',
    args: [{ data: { ...d, generation: generation + 1, worked, idleRuns }, metadata: envelope.metadata }],
    taskQueue: PROOF_QUEUE,
    workflowId: `${d.base}-g${generation + 1}`,
    expire: JOB_EXPIRE_SECS,
    entity: 'chainedActor',
  });
  return { type: 'return' as const, data: { chained: generation + 1 } };
}

// ── proofBroker — the elected matcher (RULE 4: parent-scoped id) ────────────

export async function proofBroker(envelope: LTEnvelope): Promise<unknown> {
  const d = (envelope.data ?? {}) as { maxIdleBatches?: number };
  const maxIdleBatches = d.maxIdleBatches ?? 3;
  let matched = 0;
  let idleBatches = 0;

  while (idleBatches < maxIdleBatches) {
    const batch = await assignBatch({ maxIterations: 5, idleTickMs: 1000 });
    matched += batch.matched;
    idleBatches = batch.didWork ? 0 : idleBatches + 1;
  }

  return { type: 'return' as const, data: { matched } };
}

// ── proofDirector2 — the CHAIN director (convergence by parked waits) ───────
//
// The director holds NO child promises. It seeds demand, parks ONE
// conditionLT wait per actor chain (timeout = the run budget — RULE 2), then
// fire-and-forget starts each chain's first link. Convergence is purely
// event-driven: each chain's terminal link resolves its wait by signal key;
// an unresolved wait times out to `false`. One Promise.all over the WAITS —
// which all self-settle by construction.

export async function proofDirector2(envelope: LTEnvelope): Promise<unknown> {
  const d = (envelope.data ?? {}) as ProofDirectorData;
  const actors = d.actors ?? 2;
  const workItems = d.workItems ?? 4;
  const budgetSeconds = d.durationSeconds ?? 60;
  const ctx = Durable.workflow.workflowInfo();

  await seedWork({ count: workItems, role: PROOF_ROLES.ACTOR, tag: ctx.workflowId });

  // Start the chains FIRST — plain sequential durable calls, nothing pending
  // beside them. THEN open the convergence waits as ONE atomic expression:
  // conditionLT promises may never dangle across another durable await
  // (RULE 1 — violating exactly this crashed the app in one clean log line;
  // the isolated harness paying for itself). A chain's first link takes
  // seconds; the waits park in milliseconds — the signal race is theoretical.
  for (let i = 0; i < actors; i++) {
    await Durable.workflow.startChild({
      workflowName: 'chainedActor',
      args: [
        {
          data: {
            actorId: `${ctx.workflowId}-actor-${i}`,
            base: `${ctx.workflowId}-actor-${i}`,
            doneSignalKey: `done-${ctx.workflowId}-actor-${i}`,
          },
          metadata: { source: 'proofDirector2' },
        },
      ],
      taskQueue: PROOF_QUEUE,
      workflowId: `${ctx.workflowId}-actor-${i}-g0`,
      expire: JOB_EXPIRE_SECS,
      entity: 'chainedActor',
    });
  }

  const settled = await Promise.all(
    Array.from({ length: actors }, (_, i) =>
      conditionLT<{ actorId?: string; worked?: number; generations?: number; poweredDown?: boolean }>(
        `done-${ctx.workflowId}-actor-${i}`,
        {
          role: PROOF_ROLES.ACTOR,
          type: 'lifecycleProof',
          subtype: 'proof-done',
          priority: 3,
          description: `Convergence wait for actor chain ${i}`,
          metadata: { chain: i },
          timeout: `${budgetSeconds}s`,
        },
      ),
    ),
  );
  const done = settled.filter((w) => w !== false && w !== null) as Array<{ worked?: number; generations?: number }>;

  return {
    type: 'return' as const,
    data: {
      cast: { actors },
      converged: done.length,
      timedOut: settled.length - done.length,
      worked: done.reduce((sum, w) => sum + (w.worked ?? 0), 0),
      generations: done.map((w) => w.generations ?? 0),
    },
  };
}

// ── proofDirector — the DIRECTOR pattern (RULES 1, 4, 5) ────────────────────

export async function proofDirector(envelope: LTEnvelope): Promise<unknown> {
  const d = (envelope.data ?? {}) as ProofDirectorData;
  const actors = d.actors ?? 2;
  const waiters = d.waiters ?? 2;
  const workItems = d.workItems ?? 4;
  const durationSeconds = d.durationSeconds ?? 45;
  const ctx = Durable.workflow.workflowInfo();

  // 1. WIND-DOWN: one pill per pond; the pill self-expires (RULE 2), so this
  //    phase is bounded by construction. Sequential awaits — no children
  //    exist yet, nothing can dangle.
  const windRetired: string[] = [];
  for (const role of [PROOF_ROLES.ACTOR]) {
    for (let i = 0; i < 5; i++) {
      const pill = await Durable.workflow.executeChild<{ data?: { consumed: boolean; by: string | null } }>({
        workflowName: 'proofPill',
        args: [{ data: { role, timeoutSeconds: 10 }, metadata: { source: 'proofDirector', wave: 'winddown' } }],
        taskQueue: PROOF_QUEUE,
        workflowId: `${ctx.workflowId}-winddown-${role}-${i}`,
        expire: JOB_EXPIRE_SECS,
        entity: 'proofPill',
      });
      const out = pill?.data ?? (pill as unknown as { consumed: boolean; by: string | null });
      if (!out?.consumed) break; // pond dry
      windRetired.push(out.by ?? 'unknown');
    }
  }

  // 2. SEED demand for both sides (sequential activities — still no children).
  await seedWork({ count: workItems, role: PROOF_ROLES.ACTOR, tag: ctx.workflowId });
  await seedWork({ count: workItems, role: PROOF_ROLES.WAITER, tag: ctx.workflowId });

  // 3. CAST — create every child promise with parent-scoped ids (RULE 4),
  //    then ONE awaited tree (RULE 1). The run window is a durable timer in
  //    its own branch; the retire wave follows it inside the same tree.
  const actorChildren = Array.from({ length: actors }, (_, i) =>
    Durable.workflow.executeChild({
      workflowName: 'proofActor',
      // A large idle budget: pills must be the actors' ONLY retirement path,
      // so the retire-wave assertion (pillsConsumed === actors) is strict.
      args: [{ data: { actorId: `${ctx.workflowId}-actor-${i}`, maxIdleBatches: 50 }, metadata: { source: 'proofDirector' } }],
      taskQueue: PROOF_QUEUE,
      workflowId: `${ctx.workflowId}-actor-${i}`,
      expire: JOB_EXPIRE_SECS,
      entity: 'proofActor',
    }),
  );
  const waiterChildren = Array.from({ length: waiters }, (_, i) =>
    Durable.workflow.executeChild({
      workflowName: 'proofWaiter',
      args: [{ data: { waiterId: `${ctx.workflowId}-waiter-${i}`, idleSeconds: durationSeconds + 30 }, metadata: { source: 'proofDirector' } }],
      taskQueue: PROOF_QUEUE,
      workflowId: `${ctx.workflowId}-waiter-${i}`,
      expire: JOB_EXPIRE_SECS,
      entity: 'proofWaiter',
    }),
  );
  const broker = Durable.workflow.executeChild({
    workflowName: 'proofBroker',
    args: [{ data: { maxIdleBatches: 4 }, metadata: { source: 'proofDirector' } }],
    taskQueue: PROOF_QUEUE,
    workflowId: `${ctx.workflowId}-broker`,
    expire: JOB_EXPIRE_SECS,
    entity: 'proofBroker',
  });

  let retirePillsConsumed = 0;
  const runAndRetire = async (): Promise<null> => {
    await Durable.workflow.sleep(`${durationSeconds} seconds`);
    // Retire actors through the membrane (RULE 5) — pills, self-expiring.
    for (let i = 0; i < actors + 1; i++) {
      const pill = await Durable.workflow.executeChild<{ data?: { consumed: boolean } }>({
        workflowName: 'proofPill',
        args: [{ data: { role: PROOF_ROLES.ACTOR, timeoutSeconds: 15 }, metadata: { source: 'proofDirector', wave: 'retire' } }],
        taskQueue: PROOF_QUEUE,
        workflowId: `${ctx.workflowId}-retire-${PROOF_ROLES.ACTOR}-${i}`,
        expire: JOB_EXPIRE_SECS,
        entity: 'proofPill',
      });
      const out = pill?.data ?? (pill as unknown as { consumed: boolean });
      if (!out?.consumed) break;
      retirePillsConsumed++;
    }
    return null;
  };

  const [actorResults, waiterResults, brokerResult] = await Promise.all([
    Promise.all(actorChildren),
    Promise.all(waiterChildren),
    broker.catch(() => null),
    runAndRetire(),
  ]);

  const unwrap = (r: any) => r?.data ?? r;
  return {
    type: 'return' as const,
    data: {
      windDown: { retired: windRetired },
      cast: { actors, waiters },
      worked: {
        byActors: actorResults.reduce((sum: number, r: any) => sum + (unwrap(r)?.worked ?? 0), 0),
        byWaiters: waiterResults.reduce((sum: number, r: any) => sum + (unwrap(r)?.worked ?? 0), 0),
      },
      broker: unwrap(brokerResult),
      retire: { pillsConsumed: retirePillsConsumed },
      converged: true,
    },
  };
}

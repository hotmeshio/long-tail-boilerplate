/**
 * Lifecycle-proof activities — every side effect through the LT escalation
 * surface as ONE seeded proof principal. Deliberately tiny: seed demand,
 * scan a pond, work an item. The patterns, not the business.
 */

import { createClient } from '@hotmeshio/long-tail';

import { PROOF_PRINCIPAL, PROOF_ROLES, PROOF_SUBTYPES } from './types';

const lt = () => createClient({ auth: { userId: PROOF_PRINCIPAL } });

const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seed N work rows for a role's pond (the demand side of the proof). */
export async function seedWork(input: { count: number; role: string; tag: string }): Promise<{ seeded: number }> {
  let seeded = 0;
  for (let i = 0; i < input.count; i++) {
    const res = await lt().escalations.create({
      type: 'lifecycleProof',
      subtype: PROOF_SUBTYPES.WORK,
      role: input.role,
      priority: 2,
      description: `Proof work item ${i} (${input.role})`,
      metadata: { proofTag: input.tag, item: i },
    });
    if (res.status === 200 || res.status === 201) seeded += 1;
  }
  return { seeded };
}

export interface ActorBatchResult {
  worked: string[];
  poweredDown: boolean;
  didWork: boolean;
}

/**
 * The associate's hot loop: scan (subtype-filtered), consume a pill if one
 * waits, otherwise claim-and-resolve ONE work item per iteration. One durable
 * checkpoint per batch.
 */
export async function actorBatch(input: {
  actorId: string;
  maxIterations: number;
  idleTickMs: number;
}): Promise<ActorBatchResult> {
  const worked: string[] = [];
  let didWork = false;

  for (let i = 0; i < input.maxIterations; i++) {
    const pills = await lt().escalations.list({
      status: 'pending', subtype: PROOF_SUBTYPES.PILL, limit: 10, sort_by: 'created_at', order: 'asc',
    });
    const pill = ((pills.data?.escalations ?? []) as any[]).find((e) => e?.role === PROOF_ROLES.ACTOR && !e?.assigned_to);
    if (pill) {
      const consumed = await lt().escalations.resolve({
        id: pill.id,
        resolverPayload: { approved: true, actor: input.actorId },
      });
      if (consumed.status === 200) return { worked, poweredDown: true, didWork };
      continue; // raced — rescan
    }

    const pond = await lt().escalations.list({
      status: 'pending', subtype: PROOF_SUBTYPES.WORK, limit: 10, sort_by: 'created_at', order: 'asc',
    });
    const item = ((pond.data?.escalations ?? []) as any[]).find((e) => e?.role === PROOF_ROLES.ACTOR && !e?.assigned_to);
    if (!item) {
      await sleepMs(input.idleTickMs);
      continue;
    }

    const done = await lt().escalations.resolve({
      id: item.id,
      resolverPayload: { approved: true, actor: input.actorId },
    });
    if (done.status === 200) {
      worked.push(item.id);
      didWork = true;
    }
    // 404/409 = another actor settled it first — an ordinary ending.
  }

  return { worked, poweredDown: false, didWork };
}

/**
 * Terminal-generation handshake: the last link of an actor CHAIN resolves the
 * director's parked wait by signal key — fully event-driven convergence, no
 * held child promises anywhere.
 */
export async function signalDone(input: { signalKey: string; payload: Record<string, unknown> }): Promise<{ signaled: boolean }> {
  const res = await lt().escalations.resolveBySignalKey({
    signalKey: input.signalKey,
    resolverPayload: { approved: true, ...input.payload },
  });
  // 404/409 = the wait already timed out (an expired wait is the DIRECTOR's
  // honest record of a late chain — not this link's error). Anything else
  // must fail loud so the activity retries.
  if (res.status !== 200 && res.status !== 404 && res.status !== 409) {
    throw new Error(`signalDone failed (${res.status}): ${res.error ?? ''}`);
  }
  return { signaled: res.status === 200 };
}

/** Work one broker-assigned item (the waiter's single action per wake). */
export async function workAssignment(input: { waiterId: string; itemId: string }): Promise<{ done: boolean }> {
  const done = await lt().escalations.resolve({
    id: input.itemId,
    resolverPayload: { approved: true, actor: input.waiterId },
  });
  return { done: done.status === 200 };
}

/**
 * The broker pass: pair the oldest unassigned waiter-addressed WORK row with
 * the oldest parked ADVERT, resolving the advert as the assignment. One
 * matcher; waiters never poll.
 */
export async function assignBatch(input: { maxIterations: number; idleTickMs: number }): Promise<{ matched: number; didWork: boolean }> {
  let matched = 0;
  let didWork = false;

  for (let i = 0; i < input.maxIterations; i++) {
    const [workRes, advertRes] = await Promise.all([
      lt().escalations.list({ status: 'pending', subtype: PROOF_SUBTYPES.WORK, limit: 25, sort_by: 'created_at', order: 'asc' }),
      lt().escalations.list({ status: 'pending', subtype: PROOF_SUBTYPES.ADVERT, limit: 25, sort_by: 'created_at', order: 'asc' }),
    ]);
    const demand = ((workRes.data?.escalations ?? []) as any[]).filter((e) => e?.role === PROOF_ROLES.WAITER && !e?.assigned_to);
    const supply = ((advertRes.data?.escalations ?? []) as any[]).filter((e) => e?.role === PROOF_ROLES.WAITER && !e?.assigned_to);

    const pairs = Math.min(demand.length, supply.length);
    for (let j = 0; j < pairs; j++) {
      const res = await lt().escalations.resolve({
        id: supply[j].id,
        resolverPayload: { approved: true, actor: 'proof-broker', itemId: demand[j].id },
      });
      if (res.status === 200) {
        matched += 1;
        didWork = true;
      }
    }
    await sleepMs(input.idleTickMs);
  }

  return { matched, didWork };
}

/**
 * Pond activities — every side effect crosses the escalation surface as the
 * puller's OWN principal. That identity is the experiment: leases only mean
 * something between distinct users.
 */

import { createClient } from '@hotmeshio/long-tail';

import { PULL_FACETS, PULL_POND } from '../types';
import type { PullResolution } from '../types';

export interface PondLead {
  escalationId: string;
}

/** Scan the pond for available (pending, unclaimed) units of this batch. */
export async function scanPond(input: { operatorId: string; batch: string; limit?: number }): Promise<PondLead | null> {
  const lt = createClient({ auth: { userId: input.operatorId } });
  const res = await lt.escalations.searchByFacets({
    role: PULL_POND,
    status: 'pending',
    available: true,
    facets: { [PULL_FACETS.BATCH]: input.batch },
    limit: input.limit ?? 10,
  });
  if (res.status !== 200) throw new Error(`pull-farm scan failed (${res.status}): ${res.error ?? ''}`);
  const rows: any[] = res.data?.escalations ?? [];
  return rows.length ? { escalationId: rows[0].id } : null;
}

/**
 * The lease attempt. Returns the raw status — 200 is the lease; anything in
 * the 4xx family is a lost race (another principal holds it, or it settled),
 * and the STATUS ITSELF is telemetry this experiment exists to record.
 */
export async function claimLead(input: { operatorId: string; escalationId: string; claimMinutes: number }): Promise<number> {
  const lt = createClient({ auth: { userId: input.operatorId } });
  const res = await lt.escalations.claim({ id: input.escalationId, durationMinutes: input.claimMinutes });
  if (res.status >= 500) throw new Error(`pull-farm claim failed (${res.status}): ${res.error ?? ''}`);
  return res.status;
}

/** The answer. 200 resolved; 409/404 = settled by another actor — ordinary ending. */
export async function resolveLead(input: {
  operatorId: string;
  escalationId: string;
  resolution: PullResolution;
}): Promise<number> {
  const lt = createClient({ auth: { userId: input.operatorId } });
  const res = await lt.escalations.resolve({
    id: input.escalationId,
    resolverPayload: { approved: true, ...input.resolution },
  });
  if (res.status >= 500) throw new Error(`pull-farm resolve failed (${res.status}): ${res.error ?? ''}`);
  return res.status;
}

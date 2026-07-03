/**
 * Pull-farm puller principals — stable UUIDs (`0c..` namespace), one per
 * puller, all holding the pond role. Distinct principals are the point: a
 * claim is a lease only when the claimants are different users.
 */

import { PULL_POND } from './types';

export const PULLER_COUNT = 6;

function pullerUuid(n: number): string {
  return `0c000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`;
}

/** The puller principals, in stable order — harness assigns pullers[i] → operator i. */
export function pullOperatorIds(): string[] {
  return Array.from({ length: PULLER_COUNT }, (_, i) => pullerUuid(i));
}

export interface PullOperatorSeed {
  id: string;
  externalId: string;
  display: string;
  roles: string[];
}

export function pullOperatorSeeds(): PullOperatorSeed[] {
  return pullOperatorIds().map((id, i) => ({
    id,
    externalId: `pull-farm-puller-${i}`,
    display: `Pull Farm Puller ${i}`,
    roles: [PULL_POND],
  }));
}

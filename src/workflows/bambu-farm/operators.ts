/**
 * Bambu-farm operator identities — stable UUIDs (`0b..` namespace) so the seed,
 * the harness, and the dashboard all reference the same principals.
 *
 * One operator matters in v1: the DISPATCHER — the principal that resolves ready
 * adverts with job payloads. In acme-mono this is the `virtual` dispatch
 * adapter's identity; here it is the harness (and, next, the refined broker).
 */

import { BAMBU_POOL } from './types';

export interface BambuOperators {
  dispatcherId: string;
}

const DISPATCHER_ID = '0b000000-0000-4000-8000-000000000001';

export function bambuOperatorIds(): BambuOperators {
  return { dispatcherId: DISPATCHER_ID };
}

/** One operator's full identity for seeding: stable uuid, external_id, pond roles. */
export interface BambuOperatorSeed {
  id: string;
  externalId: string;
  display: string;
  roles: string[];
}

export function bambuOperatorSeeds(): BambuOperatorSeed[] {
  return [
    {
      id: DISPATCHER_ID,
      externalId: 'bambu-dispatcher',
      display: 'Bambu Farm Dispatcher',
      roles: [BAMBU_POOL],
    },
  ];
}

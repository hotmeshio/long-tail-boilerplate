/**
 * branchLease: one open escalation per repo and branch. Claiming the row is
 * holding the branch: only the holder writes to it, a re-claim extends the
 * lease, and a lapsed claim frees it for the next agent. Resolving the row
 * retires the lease once the branch is merged or abandoned.
 */

import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { branchLeaseSignalId } from './facets';
import { AGENT_CREW_WORKFLOWS, BRANCH_LEASE_ROLE } from './types';
import type { BranchLeaseInput } from './types';

const LEASE_PRIORITY = 4;

export async function branchLease(envelope: LTEnvelope): Promise<{ type: 'return'; data: { repo: string; branch: string; outcome: string } }> {
  const input = envelope.data as BranchLeaseInput;

  const retirement = await conditional<{ lease: { retirement: string } }>(branchLeaseSignalId(input.repo, input.branch), {
    role: BRANCH_LEASE_ROLE,
    type: 'agent-crew',
    subtype: BRANCH_LEASE_ROLE,
    priority: LEASE_PRIORITY,
    description: input.branch.slice(0, 60),
    workflowType: AGENT_CREW_WORKFLOWS.BRANCH_LEASE,
    metadata: { kind: BRANCH_LEASE_ROLE, repo: input.repo, branch: input.branch, ...(input.project ? { project: input.project } : {}) },
  });

  const outcome = retirement ? retirement.lease.retirement : 'cancelled';
  return { type: 'return', data: { repo: input.repo, branch: input.branch, outcome } };
}

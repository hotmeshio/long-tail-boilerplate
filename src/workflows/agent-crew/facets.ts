/**
 * Pure builders for agent crew metadata and signal ids. Absent optional facts
 * are left off, so `metadata @>` queries never match a null.
 */

import type { AgentWorkInput } from './types';

function present(entries: Record<string, string | number | undefined>) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined && value !== ''));
}

/** Facets on every row of one piece: claim by `area`/`skill`, group by `workstream`. */
export function pieceFacets(input: AgentWorkInput, kind: string, round: number) {
  return present({
    project: input.project,
    kind,
    piece: input.key,
    round,
    workstream: input.workstream,
    area: input.area,
    skill: input.skill,
    repo: input.repo,
  });
}

/** The workstream row's home signal: finished pieces join it by this key. */
export function workstreamSignalId(workstream: string) {
  return `workstream-${workstream}`;
}

/** One lease row per repo and branch; the claim on it is the lease. */
export function branchLeaseSignalId(repo: string, branch: string) {
  return `branch-lease-${repo}-${branch}`.replace(/[^A-Za-z0-9_-]/g, '-');
}

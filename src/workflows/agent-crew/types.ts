/**
 * Agent crew: roles, facets and shapes for work that spans agents, sessions
 * and contexts. A claim is a lease, a resolution carries a structured handoff,
 * and every row of one goal carries the `workstream` facet.
 */

export const AGENT_CREW_QUEUE = 'agent-crew';

export const AGENT_WORK_ROLE = 'agent-work';
export const AGENT_REVIEW_ROLE = 'agent-review';
export const AGENT_PLAN_ROLE = 'agent-plan';
export const BRANCH_LEASE_ROLE = 'branch-lease';
export const WORKSTREAM_ROLE = 'workstream';

export const AGENT_CREW_ROLES = [AGENT_WORK_ROLE, AGENT_REVIEW_ROLE, AGENT_PLAN_ROLE, BRANCH_LEASE_ROLE, WORKSTREAM_ROLE];

export const AGENT_CREW_WORKFLOWS = {
  AGENT_WORK: 'agentWork',
  BRANCH_LEASE: 'branchLease',
  WORKSTREAM: 'workstream',
} as const;

export const DEFAULT_MAX_ROUNDS = 3;
export const MAX_PIECES = 12;
export const KEY_PATTERN = '^[a-z0-9][a-z0-9-]{1,63}$';

export const HANDOFF_OUTCOMES = [
  { value: 'done', label: 'Done; ready for review' },
  { value: 'partly-done', label: 'Partly done; ready for review' },
  { value: 'blocked', label: 'Blocked; the owner must decide' },
] as const;

export const REVIEW_VERDICTS = [
  { value: 'approved', label: 'Approved' },
  { value: 'changes-requested', label: 'Changes requested' },
] as const;

export const LEASE_RETIREMENTS = [
  { value: 'merged', label: 'Merged' },
  { value: 'abandoned', label: 'Abandoned' },
] as const;

export const WORKSTREAM_CLOSINGS = [
  { value: 'shipped', label: 'Shipped' },
  { value: 'stopped', label: 'Stopped early' },
] as const;

/** What an agent leaves for the next agent: the context bridge between sessions. */
export interface Handoff {
  outcome: (typeof HANDOFF_OUTCOMES)[number]['value'];
  summary: string;
  blockerQuestion?: string;
  branch?: string;
  commit?: string;
  pr?: number;
  filesTouched?: string[];
  decisions?: string;
  openQuestions?: string;
  nextSuggested?: string;
}

export interface Review {
  verdict: (typeof REVIEW_VERDICTS)[number]['value'];
  findings?: string;
}

export interface OwnerAnswer {
  outcome: string;
  notes?: string;
}

/** One piece of a workstream, as the planner lays it out. */
export interface Piece {
  key: string;
  headline: string;
  brief: string;
  area?: string;
  skill?: string;
}

export interface AgentWorkInput extends Piece {
  project: string;
  repo?: string;
  workstream?: string;
  maxRounds?: number;
}

export interface BranchLeaseInput {
  repo: string;
  branch: string;
  project?: string;
}

export interface WorkstreamInput {
  project: string;
  headline: string;
  brief: string;
  repo?: string;
  maxRounds?: number;
}

export type PieceVerdict = 'approved' | 'rounds-exhausted' | 'cancelled';

/** What a finished piece adds to its workstream row. */
export interface PieceItem {
  key: string;
  verdict: PieceVerdict;
  summary: string;
  branch?: string;
  pr?: number;
}

export interface AgentWorkResult {
  key: string;
  verdict: PieceVerdict;
  rounds: number;
  handoff?: Handoff;
}

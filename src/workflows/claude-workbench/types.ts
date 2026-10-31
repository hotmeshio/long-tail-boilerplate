/**
 * Claude workbench: the roles, facets and shapes shared by its workflows.
 *
 * Owner roles are queues of acts only the owner performs; `claude-next` holds
 * work queued for a future Claude session; `claude-project` holds one open
 * accumulator per project, whose items are the sessions that worked it.
 */

export const CLAUDE_WORKBENCH_QUEUE = 'claude-workbench';

export const OWNER_DECIDE_ROLE = 'owner-decide';
export const OWNER_VERIFY_ROLE = 'owner-verify';
export const OWNER_REVIEW_ROLE = 'owner-review';
export const CLAUDE_NEXT_ROLE = 'claude-next';
export const CLAUDE_PROJECT_ROLE = 'claude-project';

/** Roles an `ownerEscalation` or `projectPlan` row may park in. */
export const WORK_ROLES = [OWNER_DECIDE_ROLE, OWNER_VERIFY_ROLE, OWNER_REVIEW_ROLE, CLAUDE_NEXT_ROLE] as const;
export type WorkRole = (typeof WORK_ROLES)[number];

export const PROJECT_SLUG_PATTERN = '^[a-z0-9][a-z0-9-]{1,63}$';
export const HEADLINE_MAX_LENGTH = 60;

export const DECIDE_OUTCOMES = [
  { value: 'go-ahead', label: 'Go ahead as planned' },
  { value: 'change-course', label: 'Go ahead with changes' },
  { value: 'defer', label: 'Not now' },
  { value: 'drop', label: 'Drop it' },
] as const;

export const VERIFY_OUTCOMES = [
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'blocked', label: 'Could not run it' },
] as const;

export const REVIEW_OUTCOMES = [
  { value: 'approved', label: 'Approved' },
  { value: 'changes-requested', label: 'Changes requested' },
  { value: 'defer', label: 'Review later' },
] as const;

export const CLAUDE_OUTCOMES = [
  { value: 'done', label: 'Done' },
  { value: 'partly-done', label: 'Partly done; follow-up parked' },
  { value: 'dropped', label: 'Dropped' },
] as const;

export const PROJECT_CLOSINGS = [
  { value: 'shipped', label: 'Shipped' },
  { value: 'paused', label: 'Paused' },
  { value: 'abandoned', label: 'Abandoned' },
] as const;

/** Searchable facts every workbench row carries in metadata. */
export type WorkbenchFacets = {
  project: string;
  kind: string;
  pr?: number;
  sessionId?: string;
};

export interface OwnerEscalationInput {
  role: WorkRole;
  project: string;
  headline: string;
  /** Markdown rendered at the top of the resolve form. */
  brief: string;
  pr?: number;
  sessionId?: string;
  priority?: number;
  timeoutHours?: number;
}

export interface ClaudeProjectInput {
  project: string;
  headline: string;
  /** Markdown goal rendered at the top of the project's form. */
  brief: string;
  repo?: string;
}

export interface ProjectPlanInput {
  role: WorkRole;
  project: string;
  headline: string;
  brief: string;
  /** Step keys; the row resolves when every step is filled. */
  steps: string[];
  sessionId?: string;
}

/** One session, added to a project's accumulator by `sessionId`. */
export interface SessionItem {
  resume: string;
  note: string;
  repo?: string;
  branch?: string;
  pr?: number;
  date?: string;
}

export interface WorkbenchResult {
  project: string;
  outcome: 'resolved' | 'expired' | 'cancelled';
  resolution?: Record<string, unknown>;
  resolvedBy?: string;
}

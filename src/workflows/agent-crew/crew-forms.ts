/**
 * `agent-review`, `agent-plan` and `branch-lease` surfaces. The review and
 * plan forms show the work under review or the goal to plan as the markdown
 * brief; the lease form only retires a lease, because holding the claim is
 * the lease.
 */

import { BRIEF_FIELD } from '../claude-workbench/forms';
import { KEY_PATTERN, LEASE_RETIREMENTS, MAX_PIECES, REVIEW_VERDICTS } from './types';

const TEXT_MAX_LENGTH = 4000;

function crewList(actionLabel: string, durationMinutes: number, extraColumns: Record<string, unknown>[] = []) {
  return {
    'x-lt-layout': 'facet-table',
    'x-lt-columns': [
      { label: 'Headline', value: '{{escalation.description}}', priority: 1, width: '40%' },
      { label: 'Project', value: '{{metadata.project}}', priority: 1 },
      ...extraColumns,
      { label: 'Holder', value: '{{escalation.assigned_to}}', format: 'user', priority: 2 },
      { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age', priority: 1 },
    ],
    'x-lt-row-action': { action: 'claim', label: actionLabel, durationMinutes },
  };
}

export const AGENT_REVIEW_FORM_SCHEMA = {
  title: 'Review',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Record review' },
  'x-lt-help': [
    '1. Read the handoff in the brief, then the branch or PR it names.',
    '2. Approve, or request changes with findings the next round can act on.',
    '',
    'Review only work another agent did.',
  ].join('\n'),
  'x-lt-order': ['brief', 'verdict', 'findings'],
  required: ['verdict', 'findings'],
  properties: {
    brief: BRIEF_FIELD,
    verdict: { type: 'string', title: 'Verdict', description: 'Pick the verdict', 'x-lt-options': [...REVIEW_VERDICTS], 'x-lt-bind': 'review.verdict' },
    findings: {
      type: 'string',
      format: 'textarea',
      title: 'Findings',
      description: 'What must change, as a numbered list',
      minLength: 10,
      maxLength: TEXT_MAX_LENGTH,
      'x-lt-span': 2,
      'x-lt-bind': 'review.findings',
      'x-lt-showIf': 'resolver.verdict=changes-requested',
    },
  },
};

export const AGENT_PLAN_FORM_SCHEMA = {
  title: 'Plan',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Start the pieces' },
  'x-lt-help': [
    '1. Read the goal in the brief.',
    '2. Break it into pieces one agent can finish in one session.',
    '3. Give each piece a key, a headline, a markdown brief, and its area and skill.',
  ].join('\n'),
  'x-lt-order': ['brief', 'pieces'],
  required: ['pieces'],
  properties: {
    brief: BRIEF_FIELD,
    pieces: {
      type: 'array',
      title: 'Pieces',
      description: 'One object per piece: key, headline, brief, area, skill',
      'x-lt-widget': 'json',
      minItems: 1,
      maxItems: MAX_PIECES,
      'x-lt-span': 2,
      'x-lt-bind': 'plan.pieces',
      items: {
        type: 'object',
        required: ['key', 'headline', 'brief'],
        properties: {
          key: { type: 'string', pattern: KEY_PATTERN },
          headline: { type: 'string', minLength: 3, maxLength: 60 },
          brief: { type: 'string', minLength: 10, maxLength: 20_000 },
          area: { type: 'string', maxLength: 64 },
          skill: { type: 'string', maxLength: 64 },
        },
      },
    },
  },
};

export const BRANCH_LEASE_FORM_SCHEMA = {
  title: 'Retire lease',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Retire lease' },
  'x-lt-help': [
    '1. Claim the row to hold the branch; only the holder writes to it.',
    '2. Re-claim to extend; release when you stop.',
    '3. Retire the lease only once the branch is merged or abandoned.',
  ].join('\n'),
  'x-lt-order': ['retirement', 'notes'],
  required: ['retirement'],
  properties: {
    retirement: { type: 'string', title: 'Retirement', description: 'Pick why the lease ends', 'x-lt-options': [...LEASE_RETIREMENTS], 'x-lt-bind': 'lease.retirement' },
    notes: { type: 'string', format: 'textarea', title: 'Notes', description: 'Optional', maxLength: TEXT_MAX_LENGTH, 'x-lt-span': 2, 'x-lt-bind': 'lease.notes' },
  },
};

export const AGENT_REVIEW_LIST_SCHEMA = crewList('Review', 60, [{ label: 'Round', value: '{{metadata.round}}', priority: 3 }]);
export const AGENT_PLAN_LIST_SCHEMA = crewList('Plan', 60);
export const BRANCH_LEASE_LIST_SCHEMA = crewList('Hold', 120, [
  { label: 'Repo', value: '{{metadata.repo}}', priority: 2 },
  { label: 'Branch', value: '{{metadata.branch}}', priority: 1 },
]);

/**
 * `agent-work` surfaces. The resolve form is the handoff: what the next agent,
 * in any session, needs to continue without this one's context. Every field
 * binds under `handoff.*`, so the resolver payload is `{ handoff }`.
 */

import { BRIEF_FIELD } from '../claude-workbench/forms';
import { HANDOFF_OUTCOMES } from './types';

const SECTION_RESULT = 'Result';
const SECTION_CODE = 'Code';
const SECTION_NEXT = 'For the next agent';
const TEXT_MAX_LENGTH = 4000;

function textField(title: string, description: string, bind: string, section: string) {
  return { type: 'string', format: 'textarea', title, description, maxLength: TEXT_MAX_LENGTH, 'x-lt-span': 2, 'x-lt-bind': `handoff.${bind}`, 'x-lt-section': section };
}

export const AGENT_WORK_FORM_SCHEMA = {
  title: 'Hand off',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Hand off' },
  'x-lt-help': [
    '1. Claim the row; the claim is your lease. Re-claim to extend it.',
    '2. Do the work the brief names, on a branch you hold in `branch-lease`.',
    '3. Hand off: what changed, where it lives, what is open.',
    '',
    'Pick **Blocked** to send a question to the owner instead of guessing.',
  ].join('\n'),
  'x-lt-order': ['brief', 'outcome', 'blocker_question', 'summary', 'branch', 'commit', 'pr', 'files_touched', 'decisions', 'open_questions', 'next_suggested'],
  required: ['outcome', 'blocker_question', 'summary'],
  properties: {
    brief: BRIEF_FIELD,
    outcome: {
      type: 'string',
      title: 'Outcome',
      description: 'Pick where the work stands',
      'x-lt-options': [...HANDOFF_OUTCOMES],
      'x-lt-bind': 'handoff.outcome',
      'x-lt-section': SECTION_RESULT,
    },
    blocker_question: {
      ...textField('Question for the owner', 'Ask one question the owner can answer with a decision', 'blockerQuestion', SECTION_RESULT),
      minLength: 10,
      'x-lt-showIf': 'resolver.outcome=blocked',
    },
    summary: { ...textField('Summary', 'What changed and why, for an agent with no context', 'summary', SECTION_RESULT), minLength: 20 },
    branch: { type: 'string', title: 'Branch', description: 'Optional; where the work lives', maxLength: 200, 'x-lt-bind': 'handoff.branch', 'x-lt-section': SECTION_CODE },
    commit: {
      type: 'string',
      title: 'Commit',
      description: 'Optional; the last commit',
      pattern: '^[0-9a-f]{7,40}$',
      'x-lt-pattern-error': 'Use a 7 to 40 character commit hash',
      'x-lt-bind': 'handoff.commit',
      'x-lt-section': SECTION_CODE,
    },
    pr: { type: 'integer', title: 'PR', description: 'Optional; the pull request number', minimum: 1, 'x-lt-bind': 'handoff.pr', 'x-lt-section': SECTION_CODE },
    files_touched: {
      type: 'array',
      title: 'Files touched',
      description: 'Optional; repo-relative paths',
      'x-lt-widget': 'json',
      items: { type: 'string', maxLength: 300 },
      maxItems: 200,
      'x-lt-span': 2,
      'x-lt-bind': 'handoff.filesTouched',
      'x-lt-section': SECTION_CODE,
    },
    decisions: textField('Decisions', 'Optional; what was decided and why', 'decisions', SECTION_NEXT),
    open_questions: textField('Open questions', 'Optional; what is still unknown', 'openQuestions', SECTION_NEXT),
    next_suggested: textField('Next', 'Optional; what the next agent should do first', 'nextSuggested', SECTION_NEXT),
  },
};

export const AGENT_WORK_LIST_SCHEMA = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Headline', value: '{{escalation.description}}', priority: 1, width: '35%' },
    { label: 'Project', value: '{{metadata.project}}', priority: 1 },
    { label: 'Area', value: '{{metadata.area}}', priority: 2 },
    { label: 'Skill', value: '{{metadata.skill}}', priority: 2 },
    { label: 'Round', value: '{{metadata.round}}', priority: 3 },
    { label: 'Holder', value: '{{escalation.assigned_to}}', format: 'user', priority: 2 },
    { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age', priority: 1 },
  ],
  'x-lt-row-action': { action: 'claim', label: 'Work', durationMinutes: 60 },
};

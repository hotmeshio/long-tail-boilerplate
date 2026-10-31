/**
 * `claude-project` surfaces: one open accumulator row per project.
 *
 * The role enforces its form, and every accumulator add validates its payload
 * against that same form, so the form declares both payloads it receives:
 * a session item (the `session_*` fields) and the owner's close (`closing`
 * and `summary`). Each set shows, and so is required, only when its payload
 * is what arrived; the close form never shows the session fields.
 */

import { BRIEF_FIELD, NOTES_MAX_LENGTH } from './forms';
import { PROJECT_CLOSINGS } from './types';

const CLOSE_ONLY = '!resolver.session_resume';
const SESSION_ONLY = 'resolver.session_resume';
const SESSION_TEXT_MAX_LENGTH = 2000;

function sessionField(bind: string, type = 'string') {
  return { type, 'x-lt-bind': `session.${bind}`, 'x-lt-showIf': SESSION_ONLY };
}

export const CLAUDE_PROJECT_FORM_SCHEMA = {
  title: 'Project',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Close project' },
  'x-lt-help': [
    '1. Read the goal and the sessions that worked it.',
    '2. Close the project only when it has shipped, paused or been abandoned.',
    '3. Summarize where it ended.',
    '',
    'Sessions held: **{{metadata.accumulate_count}}**.',
  ].join('\n'),
  'x-lt-order': ['brief', 'closing', 'summary'],
  required: ['closing', 'session_resume', 'session_note'],
  properties: {
    brief: BRIEF_FIELD,
    closing: {
      type: 'string',
      title: 'Closing',
      description: 'Pick where the project ended',
      'x-lt-options': [...PROJECT_CLOSINGS],
      'x-lt-showIf': CLOSE_ONLY,
    },
    summary: {
      type: 'string',
      format: 'textarea',
      title: 'Summary',
      description: 'Optional; what shipped and what is left',
      maxLength: NOTES_MAX_LENGTH,
      'x-lt-span': 2,
      'x-lt-showIf': CLOSE_ONLY,
    },
    session_resume: { ...sessionField('resume'), maxLength: SESSION_TEXT_MAX_LENGTH },
    session_note: { ...sessionField('note'), maxLength: SESSION_TEXT_MAX_LENGTH },
    session_repo: sessionField('repo'),
    session_branch: sessionField('branch'),
    session_pr: sessionField('pr', 'integer'),
    session_date: sessionField('date'),
  },
};

export const CLAUDE_PROJECT_LIST_SCHEMA = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Project', value: '{{metadata.project}}', priority: 1 },
    { label: 'Headline', value: '{{escalation.description}}', priority: 1, width: '40%' },
    { label: 'Sessions', value: '{{metadata.accumulate_count}}', priority: 2 },
    { label: 'Open for', value: '{{escalation.created_at}}', format: 'age', priority: 2 },
  ],
  'x-lt-row-action': { action: 'claim', label: 'Open', durationMinutes: 60 },
};

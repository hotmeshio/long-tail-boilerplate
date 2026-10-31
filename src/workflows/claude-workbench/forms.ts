/**
 * Claude workbench surfaces: the owner and Claude escalation roles, their
 * resolve forms, and their list pages.
 *
 * Each role is a queue of one kind of act; each row is an escalation. The row's
 * description is a short headline; its context renders as the markdown `brief`
 * at the top of the form, filled per row from `envelope.formDefaults.brief`.
 * The project rides the row's metadata, so the same roles serve every project.
 */

import { CLAUDE_OUTCOMES, DECIDE_OUTCOMES, REVIEW_OUTCOMES, VERIFY_OUTCOMES } from './types';

interface Outcome {
  value: string;
  label: string;
}

interface EscalationFormSpec {
  title: string;
  submitLabel: string;
  steps: string[];
  outcomes: readonly Outcome[];
  notesTitle: string;
  notesDescription: string;
}

export const BRIEF_FIELD = {
  type: 'string',
  title: 'Brief',
  readOnly: true,
  'x-lt-widget': 'markdown',
  'x-lt-span': 2,
  'x-lt-bind': 'brief',
  'x-lt-hide-if-empty': true,
};

export const NOTES_MAX_LENGTH = 4000;

function escalationForm(spec: EscalationFormSpec) {
  return {
    title: spec.title,
    'x-lt-layout': 'two-column',
    'x-lt-labels': { submit: spec.submitLabel },
    'x-lt-help': spec.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    'x-lt-order': ['brief', 'outcome', 'notes'],
    required: ['outcome'],
    properties: {
      brief: BRIEF_FIELD,
      outcome: {
        type: 'string',
        title: 'Outcome',
        description: 'Pick what happened',
        'x-lt-options': [...spec.outcomes],
      },
      notes: {
        type: 'string',
        format: 'textarea',
        title: spec.notesTitle,
        description: spec.notesDescription,
        maxLength: NOTES_MAX_LENGTH,
        'x-lt-span': 2,
      },
    },
  };
}

function escalationList(actionLabel: string) {
  return {
    'x-lt-layout': 'facet-table',
    'x-lt-columns': [
      { label: 'Headline', value: '{{escalation.description}}', priority: 1, width: '40%' },
      { label: 'Project', value: '{{metadata.project}}', priority: 1 },
      { label: 'PR', value: '{{metadata.pr}}', priority: 3 },
      { label: 'Holder', value: '{{escalation.assigned_to}}', format: 'user', priority: 3 },
      { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age', priority: 1 },
    ],
    'x-lt-row-action': { action: 'claim', label: actionLabel, durationMinutes: 240 },
  };
}

export const OWNER_DECIDE_FORM_SCHEMA = escalationForm({
  title: 'Decide',
  submitLabel: 'Record decision',
  steps: ['Read the brief.', 'Pick the outcome.', 'Add any change of course in the notes.'],
  outcomes: DECIDE_OUTCOMES,
  notesTitle: 'Notes',
  notesDescription: 'Optional; what to change, or why not',
});

export const OWNER_VERIFY_FORM_SCHEMA = escalationForm({
  title: 'Verify',
  submitLabel: 'Record result',
  steps: ['Run the check the brief names.', 'Pick the result.', 'Note what you saw when it failed or could not run.'],
  outcomes: VERIFY_OUTCOMES,
  notesTitle: 'Findings',
  notesDescription: 'Optional; what you saw',
});

export const OWNER_REVIEW_FORM_SCHEMA = escalationForm({
  title: 'Review',
  submitLabel: 'Record review',
  steps: ['Open the PR or document the brief links.', 'Pick the verdict.', 'List requested changes in the notes.'],
  outcomes: REVIEW_OUTCOMES,
  notesTitle: 'Requested changes',
  notesDescription: 'Optional; what to change',
});

export const CLAUDE_NEXT_FORM_SCHEMA = escalationForm({
  title: 'Claude work',
  submitLabel: 'Record outcome',
  steps: [
    'Claim the escalation at the start of a session.',
    'Do the work the brief names.',
    'Pick the outcome and summarize it, naming the session id.',
  ],
  outcomes: CLAUDE_OUTCOMES,
  notesTitle: 'Summary',
  notesDescription: 'What was done, and the session id',
});

export const OWNER_DECIDE_LIST_SCHEMA = escalationList('Decide');
export const OWNER_VERIFY_LIST_SCHEMA = escalationList('Verify');
export const OWNER_REVIEW_LIST_SCHEMA = escalationList('Review');
export const CLAUDE_NEXT_LIST_SCHEMA = escalationList('Work');

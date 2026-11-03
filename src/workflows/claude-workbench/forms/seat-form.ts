/**
 * The one form every seat enforces. A row's `envelope.section` picks which
 * part shows (work, review, decide, gate); the rest stays hidden, and hidden
 * fields are never required. Flat field names are prefixed per section so
 * one `required` list covers all four; payloads are namespaced by bind:
 * `{ handoff }`, `{ review }`, `{ decision }`, `{ gate }`.
 */

import {
  GATE_VERDICTS,
  HANDOFF_OUTCOMES,
  NOTES_MAX_LENGTH,
  REVIEW_VERDICTS,
  SECTION,
  type Section,
} from '../types';
import { FACET } from '../facets';
import { INBOX_FIELDS, INBOX_ORDER, INBOX_REQUIRED } from './inbox-sections';

export const BRIEF_FIELD = {
  type: 'string',
  title: 'Brief',
  readOnly: true,
  'x-lt-widget': 'markdown',
  'x-lt-span': 2,
  'x-lt-bind': 'brief',
  'x-lt-hide-if-empty': true,
};

const SUMMARY_MIN_LENGTH = 20;
const ASSETS_MAX = 50;

const inSection = (section: Section) => `envelope.section=${section}`;
const SECTION_TITLE: Record<Section, string> = { work: 'Handoff', review: 'Review', decide: 'Decision', gate: 'Gate', triage: 'Decide', act: 'Report', preferences: 'Your reactions' };

function choice(title: string, description: string, bind: string, section: Section, options: readonly { value: string; label: string }[] | string) {
  return {
    type: 'string',
    title,
    description,
    'x-lt-options': typeof options === 'string' ? options : [...options],
    'x-lt-bind': bind,
    'x-lt-section': SECTION_TITLE[section],
    'x-lt-showIf': inSection(section),
  };
}

function textarea(title: string, description: string, bind: string, section: Section, showIf: string | string[] = inSection(section)) {
  return {
    type: 'string',
    format: 'textarea',
    title,
    description,
    maxLength: NOTES_MAX_LENGTH,
    'x-lt-span': 2,
    'x-lt-bind': bind,
    'x-lt-section': SECTION_TITLE[section],
    'x-lt-showIf': showIf,
  };
}

const gated = (section: Section, field: string, value: string) => [inSection(section), `resolver.${field}=${value}`];

export const SEAT_FORM_SCHEMA = {
  title: 'Seat',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Submit', cancel: false },
  'x-lt-help': [
    'Section: **{{envelope.section}}**. Program: {{metadata.program}}, phase {{metadata.phase}}, round {{metadata.round}}.',
    '',
    '1. Read the brief.',
    '2. Fill the fields that show; hidden sections are not yours.',
    '3. Submit. There is no cancel: every way out is a choice here.',
  ].join('\n'),
  'x-lt-order': [
    'brief',
    'work_outcome', 'work_blocker_question', 'work_summary', 'work_assets', 'work_decisions', 'work_open_questions', 'work_next',
    'review_verdict', 'review_findings',
    'decision_outcome', 'decision_rework', 'decision_notes',
    'gate_verdict', 'gate_notes',
    ...INBOX_ORDER,
  ],
  required: [
    'work_outcome', 'work_blocker_question', 'work_summary',
    'review_verdict', 'review_findings',
    'decision_outcome', 'decision_rework',
    'gate_verdict', 'gate_notes',
    ...INBOX_REQUIRED,
  ],
  properties: {
    brief: BRIEF_FIELD,

    work_outcome: choice('Outcome', 'Where the work stands', 'handoff.outcome', SECTION.WORK, HANDOFF_OUTCOMES),
    work_blocker_question: {
      ...textarea('Question', 'The decision you need before you can continue', 'handoff.blockerQuestion', SECTION.WORK, gated(SECTION.WORK, 'work_outcome', 'blocked')),
      minLength: 10,
    },
    work_summary: {
      ...textarea('Summary', 'What you did and why, for a reader with no context', 'handoff.summary', SECTION.WORK),
      minLength: SUMMARY_MIN_LENGTH,
    },
    work_assets: {
      type: 'array',
      title: 'Assets',
      description: 'What you produced: a label and a link each',
      'x-lt-widget': 'json',
      maxItems: ASSETS_MAX,
      items: {
        type: 'object',
        required: ['label', 'url'],
        properties: { label: { type: 'string', maxLength: 200 }, url: { type: 'string', maxLength: 2000 } },
      },
      'x-lt-span': 2,
      'x-lt-bind': 'handoff.assets',
      'x-lt-section': SECTION_TITLE.work,
      'x-lt-showIf': inSection(SECTION.WORK),
    },
    work_decisions: textarea('Decisions', 'Choices you made that the reviewer should know', 'handoff.decisions', SECTION.WORK),
    work_open_questions: textarea('Open questions', 'What you could not settle', 'handoff.openQuestions', SECTION.WORK),
    work_next: textarea('Next', 'What you suggest happens next', 'handoff.nextSuggested', SECTION.WORK),

    review_verdict: choice('Verdict', 'Accept, or send it back', 'review.verdict', SECTION.REVIEW, REVIEW_VERDICTS),
    review_findings: textarea('Findings', 'What to change, specifically', 'review.findings', SECTION.REVIEW, gated(SECTION.REVIEW, 'review_verdict', 'changes-requested')),

    decision_outcome: choice('Decision', 'Pick one', 'decision.outcome', SECTION.DECIDE, 'envelope.decision_options'),
    decision_rework: {
      type: 'array',
      title: 'Rework',
      description: 'The deliverables to redo',
      items: { type: 'string' },
      'x-lt-options': 'lookup.types.items',
      'x-lt-bind': 'decision.rework',
      'x-lt-section': SECTION_TITLE.decide,
      'x-lt-showIf': gated(SECTION.DECIDE, 'decision_outcome', 'rework'),
    },
    decision_notes: textarea('Notes', 'What to change, or why', 'decision.notes', SECTION.DECIDE),

    gate_verdict: choice('Verdict', 'Sign the phase, or hold it', 'gate.verdict', SECTION.GATE, GATE_VERDICTS),
    gate_notes: textarea('Notes', 'Why it is held, and what would release it', 'gate.notes', SECTION.GATE, gated(SECTION.GATE, 'gate_verdict', 'hold')),

    ...INBOX_FIELDS,
  },
};

export const SEAT_LIST_SCHEMA = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Headline', value: '{{escalation.description}}', priority: 1, width: '32%' },
    { label: 'Section', value: '{{escalation.subtype}}', priority: 1 },
    { label: 'Category', value: `{{metadata.${FACET.CATEGORY}}}`, priority: 2 },
    { label: 'Needs', value: `{{metadata.${FACET.NEED}}}`, priority: 3 },
    { label: 'Program', value: `{{metadata.${FACET.PROGRAM}}}`, priority: 2 },
    { label: 'Phase', value: `{{metadata.${FACET.PHASE}}}`, priority: 3 },
    { label: 'Kind', value: `{{metadata.${FACET.KIND}}}`, priority: 2 },
    { label: 'Round', value: `{{metadata.${FACET.ROUND}}}`, priority: 3 },
    { label: 'Holder', value: '{{escalation.assigned_to}}', format: 'user', priority: 3 },
    { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age', priority: 1 },
  ],
  'x-lt-row-action': { action: 'claim', label: 'Open', durationMinutes: 240 },
};

const nullable = (type: string) => ({ type: [type, 'null'] });

export const SEAT_METADATA_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    [FACET.PROGRAM]: nullable('string'),
    [FACET.PHASE]: nullable('string'),
    [FACET.DELIVERABLE]: nullable('string'),
    [FACET.KIND]: nullable('string'),
    [FACET.SEAT]: nullable('string'),
    [FACET.DOMAIN]: nullable('string'),
    [FACET.RACI]: nullable('string'),
    [FACET.ROUND]: nullable('integer'),
    [FACET.AI]: nullable('string'),
    [FACET.TEMPLATE]: nullable('string'),
    [FACET.SECTION]: nullable('string'),
    [FACET.HOLDER]: nullable('string'),
    [FACET.SOURCE]: nullable('string'),
    [FACET.ITEM]: nullable('string'),
    [FACET.ACT]: nullable('string'),
    [FACET.CATEGORY]: nullable('string'),
    [FACET.NEED]: nullable('string'),
    [FACET.CHANNEL]: nullable('string'),
    [FACET.SENT_AT]: nullable('string'),
    [FACET.VIEW]: nullable('string'),
    [FACET.WAITING_ON]: nullable('string'),
    [FACET.STAGE]: nullable('string'),
  },
};

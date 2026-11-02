/**
 * The program board's form. The board is an open accumulator in
 * `org-programs`, and every add is validated against this form, so it
 * declares both payloads it receives: a finished deliverable (`item_*`) and
 * the close (`closing_*`). Each set shows, and so is required, only when its
 * payload is what arrived.
 */

import { NOTES_MAX_LENGTH, PROGRAM_CLOSINGS } from '../types';
import { FACET } from '../facets';
import { BRIEF_FIELD } from './seat-form';

const ITEM_ONLY = 'resolver.item_key';
const CLOSE_ONLY = '!resolver.item_key';

function itemField(title: string, bind: string, extra: Record<string, unknown> = {}) {
  return { type: 'string', title, 'x-lt-bind': `item.${bind}`, 'x-lt-section': 'Deliverable', 'x-lt-showIf': ITEM_ONLY, ...extra };
}

export const PROGRAM_FORM_SCHEMA = {
  title: 'Program',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Close program', cancel: false },
  'x-lt-help': [
    '1. Watch the deliverables land; each row below is one that finished.',
    '2. The program closes itself at launch. Close it here only to stop it early.',
    '',
    'Deliverables in: **{{metadata.accumulate_count}}**.',
  ].join('\n'),
  'x-lt-order': ['brief', 'landed', 'closing_outcome', 'closing_summary', 'item_key', 'item_kind', 'item_verdict', 'item_summary', 'item_round'],
  required: ['closing_outcome', 'item_key', 'item_kind', 'item_verdict', 'item_summary'],
  properties: {
    brief: BRIEF_FIELD,
    landed: {
      type: 'string',
      title: 'Landed',
      readOnly: true,
      'x-lt-widget': 'roster',
      'x-lt-roster': { expected: { list: 'metadata.accumulate_keys' }, in: ['items'] },
      'x-lt-columns': [
        { label: 'Deliverable', value: '{{item.key}}' },
        { label: 'Kind', value: '{{item.payload.item.kind}}' },
        { label: 'Verdict', value: '{{item.payload.item.verdict}}' },
        { label: 'Rounds', value: '{{item.payload.item.round}}' },
      ],
      'x-lt-span': 2,
      'x-lt-showIf': CLOSE_ONLY,
    },
    closing_outcome: {
      type: 'string',
      title: 'Closing',
      description: 'Where the program ended',
      'x-lt-options': [...PROGRAM_CLOSINGS],
      'x-lt-bind': 'closing.outcome',
      'x-lt-showIf': CLOSE_ONLY,
    },
    closing_summary: {
      type: 'string',
      format: 'textarea',
      title: 'Summary',
      description: 'Optional; what shipped and what is left',
      maxLength: NOTES_MAX_LENGTH,
      'x-lt-span': 2,
      'x-lt-bind': 'closing.summary',
      'x-lt-showIf': CLOSE_ONLY,
    },
    item_key: itemField('Deliverable', 'key', { maxLength: 200 }),
    item_kind: itemField('Kind', 'kind', { maxLength: 64 }),
    item_verdict: itemField('Verdict', 'verdict', { enum: ['accepted', 'dropped', 'rounds-exhausted', 'stalled', 'cancelled'] }),
    item_summary: itemField('Summary', 'summary', { maxLength: NOTES_MAX_LENGTH }),
    item_round: { ...itemField('Round', 'round'), type: 'integer', minimum: 1 },
  },
};

export const PROGRAM_LIST_SCHEMA = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Program', value: `{{metadata.${FACET.PROGRAM}}}`, priority: 1 },
    { label: 'Headline', value: '{{escalation.description}}', priority: 1, width: '36%' },
    { label: 'Template', value: `{{metadata.${FACET.TEMPLATE}}}`, priority: 2 },
    { label: 'Deliverables in', value: '{{metadata.accumulate_count}}', priority: 2 },
    { label: 'Open for', value: '{{escalation.created_at}}', format: 'age', priority: 2 },
  ],
  'x-lt-row-action': { action: 'claim', label: 'Open', durationMinutes: 60 },
};

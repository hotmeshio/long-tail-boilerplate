/**
 * `workstream` surfaces: one open accumulator row per goal, filled with one
 * item per finished piece. Every add validates against this enforced form, so
 * the form declares both payloads it receives: a piece item (the `piece_*`
 * fields, shown only when a piece arrived) and the owner's early close.
 */

import { BRIEF_FIELD } from '../claude-workbench/forms';
import { WORKSTREAM_CLOSINGS } from './types';

const CLOSE_ONLY = '!resolver.piece_key';
const PIECE_ONLY = 'resolver.piece_key';

function pieceField(bind: string, type = 'string') {
  return { type, 'x-lt-bind': `piece.${bind}`, 'x-lt-showIf': PIECE_ONLY };
}

export const WORKSTREAM_FORM_SCHEMA = {
  title: 'Workstream',
  'x-lt-layout': 'two-column',
  'x-lt-labels': { submit: 'Close workstream' },
  'x-lt-help': [
    '1. Read the goal; each finished piece joins this row.',
    '2. The row closes by itself when every piece is in.',
    '3. Close it early only to stop the goal.',
    '',
    'Pieces in: **{{metadata.accumulate_count}}** of **{{metadata.accumulate_max}}**.',
  ].join('\n'),
  'x-lt-order': ['brief', 'closing', 'summary'],
  required: ['closing', 'piece_key', 'piece_verdict', 'piece_summary'],
  properties: {
    brief: BRIEF_FIELD,
    closing: { type: 'string', title: 'Closing', description: 'Pick why it ends early', 'x-lt-options': [...WORKSTREAM_CLOSINGS], 'x-lt-showIf': CLOSE_ONLY },
    summary: { type: 'string', format: 'textarea', title: 'Summary', description: 'Optional', maxLength: 4000, 'x-lt-span': 2, 'x-lt-showIf': CLOSE_ONLY },
    piece_key: pieceField('key'),
    piece_verdict: { ...pieceField('verdict'), enum: ['approved', 'rounds-exhausted', 'cancelled'] },
    piece_summary: { ...pieceField('summary'), maxLength: 4000 },
    piece_branch: pieceField('branch'),
    piece_pr: pieceField('pr', 'integer'),
  },
};

export const WORKSTREAM_LIST_SCHEMA = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Headline', value: '{{escalation.description}}', priority: 1, width: '40%' },
    { label: 'Project', value: '{{metadata.project}}', priority: 1 },
    { label: 'Pieces in', value: '{{metadata.accumulate_count}}', priority: 1 },
    { label: 'Of', value: '{{metadata.accumulate_max}}', priority: 1 },
    { label: 'Open for', value: '{{escalation.created_at}}', format: 'age', priority: 2 },
  ],
  'x-lt-row-action': { action: 'claim', label: 'Open', durationMinutes: 30 },
};

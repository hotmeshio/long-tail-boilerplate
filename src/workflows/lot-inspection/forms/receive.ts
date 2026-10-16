/**
 * `lot-receiver` surfaces: the receiving-dock form and its queue.
 *
 * Facts render as a dictionary; one decision (the receipt) reveals only the
 * fields that outcome needs. The dock select reads its options from the row
 * (`envelope.dock_doors`), so one static form offers per-lot legal values.
 * The short count is bounded by the row's expected units.
 */

import { RECEIPT_OUTCOMES } from '../types';

const SECTION_LOT = 'The lot';
const SECTION_RECEIPT = 'Receipt';

export const RECEIVE_FORM_SCHEMA = {
  title: 'Receive Lot',
  description: 'Count the lot at the dock, then record the receipt.',
  'x-lt-layout': 'two-column',
  // Dictionary only for the facts: display widgets elsewhere keep their controls.
  'x-lt-section-options': { [SECTION_LOT]: { display: 'dictionary' } },
  'x-lt-labels': { submit: 'Receive lot', cancel: false },
  'x-lt-help': [
    '### Receiving',
    '',
    'Lot **{{metadata.lotNumber}}** ({{metadata.partFamily}}) is due with **{{envelope.expected_units}}** units.',
    '',
    '| Receipt | When |',
    '|---|---|',
    '| Accept the full lot | The count matches the traveler |',
    '| Accept a short count | Fewer units arrived; enter the count |',
    '| Refuse the lot | Damaged in transit or the wrong part |',
    '',
    'Accepted lots move to inspection. [Inspection queue](/escalations/available?role=lot-inspector)',
  ].join('\n'),
  'x-lt-order': ['lot_number', 'part_family', 'expected_units', 'receipt', 'units_received', 'dock', 'refuse_reason'],
  required: ['receipt', 'units_received', 'dock', 'refuse_reason'],
  properties: {
    lot_number: { type: 'string', title: 'Lot', readOnly: true, 'x-lt-bind': 'lot.number', 'x-lt-section': SECTION_LOT },
    part_family: { type: 'string', title: 'Part family', readOnly: true, 'x-lt-bind': 'lot.partFamily', 'x-lt-section': SECTION_LOT },
    expected_units: { type: 'number', title: 'Expected units', readOnly: true, 'x-lt-bind': 'lot.expectedUnits', 'x-lt-section': SECTION_LOT },
    receipt: {
      type: 'string',
      title: 'Receipt',
      description: 'Pick what arrived; the form asks only what that receipt needs',
      'x-lt-options': [...RECEIPT_OUTCOMES],
      'x-lt-bind': 'receipt.outcome',
      'x-lt-section': SECTION_RECEIPT,
    },
    units_received: {
      type: 'integer',
      title: 'Units received',
      description: 'Enter the count on the pallet, up to the expected units',
      minimum: 1,
      'x-lt-maximum': 'envelope.expected_units',
      'x-lt-bind': 'receipt.unitsReceived',
      'x-lt-section': SECTION_RECEIPT,
      'x-lt-showIf': 'resolver.receipt=short',
    },
    dock: {
      type: 'string',
      title: 'Dock door',
      description: 'Pick the door the lot is staged at',
      'x-lt-options': 'envelope.dock_doors',
      'x-lt-bind': 'receipt.dock',
      'x-lt-section': SECTION_RECEIPT,
      'x-lt-showIf': ['resolver.receipt', 'resolver.receipt!=refuse'],
    },
    refuse_reason: {
      type: 'string',
      format: 'textarea',
      title: 'Reason',
      description: 'Say why the lot is refused, in one or two sentences',
      minLength: 10,
      maxLength: 400,
      'x-lt-span': 2,
      'x-lt-bind': 'receipt.reason',
      'x-lt-section': SECTION_RECEIPT,
      'x-lt-showIf': 'resolver.receipt=refuse',
    },
  },
};

export const RECEIVE_LIST_SCHEMA = {
  'x-lt-layout': 'facet-table',
  'x-lt-columns': [
    { label: 'Lot', value: '{{metadata.lotNumber}}', priority: 1, width: '24%' },
    { label: 'Part family', value: '{{metadata.partFamily}}', priority: 2 },
    { label: 'Expected', value: '{{envelope.expected_units}}', priority: 2 },
    { label: 'Receiver', value: '{{escalation.assigned_to}}', format: 'user', priority: 3 },
    { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age', priority: 1 },
  ],
  'x-lt-row-action': { action: 'claim', label: 'Receive', durationMinutes: 15 },
};

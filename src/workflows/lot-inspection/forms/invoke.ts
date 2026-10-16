/**
 * The `lotInspection` invoke form. The part-family select reads the pinned
 * `hitl/part-families` edition (declared as `inputLookups` on the worker
 * config); the invoke API validates `data` against this schema with the same
 * shared pass the form runs, so a bad payload is a 422 before anything starts.
 */

import { PART_FAMILIES_LOOKUP } from '../lookups';
import { DOCK_DOORS } from '../types';

const SECTION_LOT = 'The lot';
const SECTION_INSPECTION = 'Inspection plan';
const SECTION_DOCK = 'Receiving';

export const LOT_INSPECTION_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': [
    '## Start a lot inspection',
    '',
    'Lot **{{input.lotNumber}}** goes to the receiving dock first, then to inspection.',
    '',
    '1. **Receive**: the dock counts the lot and accepts, short-counts, or refuses it.',
    '2. **Inspect**: the inspector measures **{{input.sampleSize}}** units against **{{input.toleranceMin}} to {{input.toleranceMax}} mm** and records pass, rework, or scrap.',
    '',
    'The part-family list is edition 1 of the `hitl/part-families` knowledge entry.',
  ].join('\n'),
  'x-lt-order': ['lotNumber', 'partFamily', 'expectedUnits', 'priority', 'sampleSize', 'toleranceMin', 'toleranceMax', 'docks'],
  required: ['lotNumber', 'partFamily', 'expectedUnits', 'sampleSize', 'toleranceMin', 'toleranceMax', 'docks'],
  properties: {
    lotNumber: {
      type: 'string',
      title: 'Lot number',
      description: 'Enter the number on the traveler',
      default: 'LOT-1001',
      pattern: '^LOT-[0-9]{4,}(-R[0-9]+)?$',
      'x-lt-pattern-error': 'Use LOT- and at least four digits, e.g. LOT-1001 or LOT-1001-R1',
      'x-lt-bind': 'lot.number',
      'x-lt-section': SECTION_LOT,
    },
    partFamily: {
      type: 'string',
      title: 'Part family',
      description: 'Pick the family on the traveler',
      'x-lt-options': `lookup.${PART_FAMILIES_LOOKUP.as}.items`,
      'x-lt-bind': 'lot.partFamily',
      'x-lt-section': SECTION_LOT,
    },
    expectedUnits: {
      type: 'integer',
      title: 'Expected units',
      description: 'Enter the count on the traveler, 1 to 500',
      default: 24,
      minimum: 1,
      maximum: 500,
      'x-lt-column-group': 'lot',
      'x-lt-bind': 'lot.expectedUnits',
      'x-lt-section': SECTION_LOT,
    },
    priority: {
      type: 'integer',
      title: 'Priority',
      description: 'Leave unset for normal',
      'x-lt-options': [{ value: 1, label: 'Critical' }, { value: 2, label: 'High' }, { value: 3, label: 'Normal' }],
      'x-lt-nullable': true,
      'x-lt-column-group': 'lot',
      'x-lt-bind': 'priority',
      'x-lt-section': SECTION_LOT,
    },
    sampleSize: {
      type: 'integer',
      title: 'Sample size',
      description: 'Enter how many units to measure, 1 to 50',
      default: 5,
      minimum: 1,
      maximum: 50,
      'x-lt-bind': 'inspection.sampleSize',
      'x-lt-section': SECTION_INSPECTION,
    },
    toleranceMin: {
      type: 'number',
      title: 'Min (mm)',
      description: 'Lower tolerance',
      default: 9.8,
      minimum: 0,
      'x-lt-column-group': 'tolerance',
      'x-lt-bind': 'inspection.tolerance.min',
      'x-lt-section': SECTION_INSPECTION,
    },
    toleranceMax: {
      type: 'number',
      title: 'Max (mm)',
      description: 'Upper tolerance',
      default: 10.2,
      minimum: 0,
      'x-lt-column-group': 'tolerance',
      'x-lt-bind': 'inspection.tolerance.max',
      'x-lt-section': SECTION_INSPECTION,
    },
    docks: {
      type: 'array',
      title: 'Dock doors',
      description: 'Pick the doors the receiver may stage this lot at',
      items: { type: 'string' },
      default: ['D1', 'D2'],
      'x-lt-options': DOCK_DOORS.map((door) => ({ value: door, label: `Door ${door.slice(1)}` })),
      minItems: 1,
      'x-lt-span': 2,
      'x-lt-bind': 'receiving.docks',
      'x-lt-section': SECTION_DOCK,
    },
  },
};

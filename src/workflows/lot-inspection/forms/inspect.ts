/**
 * `lot-inspector` surfaces: the inspection form and its queue.
 *
 * The form reads two current knowledge lookups: the checklist
 * (`lookup.checks.items`) and the defect cascade (category picks the legal
 * types via `lookup.defects.types.{{resolver.defect_category}}`). The passing
 * measurement is bounded by the row's own tolerance, and the defect count by
 * its sample size. A rework verdict offers to start the re-inspection run in
 * a prefilled dialog (x-lt-invoke).
 *
 * The queue looks ahead: each row counts the lots of the same part family
 * still at the receiving dock, and expands to list them (x-lt-related).
 */

import { INSPECTION_CHECKS_LOOKUP, DEFECTS_LOOKUP } from '../lookups';
import { VERDICTS, LOT_RECEIVER_ROLE, LOT_INSPECTOR_ROLE } from '../types';

const SECTION_LOT = 'The lot';
const SECTION_VERDICT = 'Verdict';
const SECTION_DEFECT = 'Defect';
const SECTION_SIGNOFF = 'Sign-off';

const FAILED = ['resolver.verdict', 'resolver.verdict!=pass'];

export const INSPECT_FORM_SCHEMA = {
  title: 'Inspect Lot',
  description: 'Measure the sample, work the checklist, then record the verdict.',
  'x-lt-layout': 'two-column',
  // Dictionary only for the facts: display widgets elsewhere keep their controls.
  'x-lt-section-options': { [SECTION_LOT]: { display: 'dictionary' } },
  'x-lt-labels': { submit: 'Record verdict' },
  'x-lt-help': [
    '### Inspection',
    '',
    'Lot **{{metadata.lotNumber}}**: measure **{{envelope.sample_size}}** units. Tolerance is **{{envelope.tolerance.min}} to {{envelope.tolerance.max}} mm**.',
    '',
    '| Verdict | When | Next |',
    '|---|---|---|',
    '| Pass | Mean inside tolerance, no defects | Lot ships |',
    '| Rework | Defects a finisher can fix | Start a re-inspection run |',
    '| Scrap | Defects that cannot be fixed | Lot is written off |',
    '',
    'The checklist and the defect lists are versioned knowledge entries; edits reach open rows on their next render.',
  ].join('\n'),
  'x-lt-order': [
    'lot_number', 'part_family', 'units_received', 'sample_size',
    'verdict', 'measured_mm', 'checks',
    'defect_category', 'defect_type', 'units_failed', 'evidence', 'rework_guide', 'reinspect',
    'note', 'signature', 'family_queue',
  ],
  required: ['verdict', 'measured_mm', 'checks', 'defect_category', 'defect_type', 'units_failed', 'signature'],
  properties: {
    lot_number: { type: 'string', title: 'Lot', readOnly: true, 'x-lt-bind': 'lot.number', 'x-lt-section': SECTION_LOT },
    part_family: { type: 'string', title: 'Part family', readOnly: true, 'x-lt-bind': 'lot.partFamily', 'x-lt-section': SECTION_LOT },
    units_received: { type: 'number', title: 'Units received', readOnly: true, 'x-lt-bind': 'lot.unitsReceived', 'x-lt-section': SECTION_LOT },
    sample_size: { type: 'number', title: 'Sample size', readOnly: true, 'x-lt-bind': 'lot.sampleSize', 'x-lt-section': SECTION_LOT },

    verdict: {
      type: 'string',
      title: 'Verdict',
      description: 'Pick the verdict; the form shows what it needs',
      'x-lt-options': [...VERDICTS],
      'x-lt-bind': 'verdict',
      'x-lt-section': SECTION_VERDICT,
    },
    measured_mm: {
      type: 'number',
      title: 'Mean thickness (mm)',
      description: 'Enter the sample mean; it must sit inside tolerance',
      'x-lt-minimum': 'envelope.tolerance.min',
      'x-lt-maximum': 'envelope.tolerance.max',
      'x-lt-bind': 'measurement.mm',
      'x-lt-section': SECTION_VERDICT,
      'x-lt-showIf': 'resolver.verdict=pass',
    },
    checks: {
      type: 'object',
      title: 'Checklist',
      description: 'Confirm each step; photos are optional',
      'x-lt-widget': 'checklist',
      'x-lt-source': `lookup.${INSPECTION_CHECKS_LOOKUP.as}.items`,
      'x-lt-require-all': true,
      'x-lt-variant': 'rows',
      'x-lt-span': 2,
      'x-lt-bind': 'inspection.checks',
      'x-lt-section': SECTION_VERDICT,
      'x-lt-showIf': 'resolver.verdict',
    },

    defect_category: {
      type: 'string',
      title: 'Category',
      description: 'Pick the defect category',
      'x-lt-options': `lookup.${DEFECTS_LOOKUP.as}.categories`,
      'x-lt-column-group': 'defect',
      'x-lt-bind': 'defect.category',
      'x-lt-section': SECTION_DEFECT,
      'x-lt-showIf': FAILED,
    },
    defect_type: {
      type: 'string',
      title: 'Type',
      description: 'Pick the type; the list follows the category',
      'x-lt-options': `lookup.${DEFECTS_LOOKUP.as}.types.{{resolver.defect_category}}`,
      'x-lt-column-group': 'defect',
      'x-lt-bind': 'defect.type',
      'x-lt-section': SECTION_DEFECT,
      'x-lt-showIf': FAILED,
    },
    units_failed: {
      type: 'integer',
      title: 'Units failed',
      description: 'Enter how many sampled units show the defect',
      minimum: 1,
      'x-lt-maximum': 'envelope.sample_size',
      'x-lt-bind': 'defect.unitsFailed',
      'x-lt-section': SECTION_DEFECT,
      'x-lt-showIf': FAILED,
    },
    evidence: {
      type: 'string',
      title: 'Evidence',
      description: 'Optional; a photo of the worst unit',
      'x-lt-widget': 'file-upload',
      accept: 'image/*',
      'x-lt-bind': 'defect.evidence',
      'x-lt-section': SECTION_DEFECT,
      'x-lt-showIf': FAILED,
    },
    rework_guide: {
      type: 'string',
      readOnly: true,
      'x-lt-widget': 'markdown',
      default: '**Rework** returns the lot to finishing. Start the re-inspection run below so the reworked units come back to this queue.',
      'x-lt-span': 2,
      'x-lt-section': SECTION_DEFECT,
      'x-lt-showIf': 'resolver.verdict=rework',
    },
    reinspect: {
      type: 'string',
      readOnly: true,
      title: 'Start re-inspection',
      description: 'Opens the lot inspection form prefilled for the reworked units',
      'x-lt-widget': 'invoke',
      'x-lt-invoke': {
        workflow: 'lotInspection',
        modal: true,
        variant: 'button',
        data: {
          lot: {
            number: '{{metadata.lotNumber}}-R1',
            partFamily: '{{metadata.partFamily}}',
            expectedUnits: '{{resolver.units_failed}}',
          },
          inspection: { tolerance: '{{envelope.tolerance}}' },
        },
      },
      'x-lt-span': 2,
      'x-lt-section': SECTION_DEFECT,
      'x-lt-showIf': 'resolver.verdict=rework',
    },

    note: {
      type: 'string',
      format: 'textarea',
      title: 'Note',
      description: 'Optional; anything the next station should know',
      maxLength: 280,
      'x-lt-span': 2,
      'x-lt-bind': 'signoff.note',
      'x-lt-section': SECTION_SIGNOFF,
      'x-lt-showIf': 'resolver.verdict',
    },
    signature: {
      type: 'string',
      title: 'Inspector signature',
      description: 'Sign to certify the verdict',
      'x-lt-widget': 'signature',
      'x-lt-span': 2,
      'x-lt-bind': 'signoff.signature',
      'x-lt-section': SECTION_SIGNOFF,
      'x-lt-showIf': 'resolver.verdict',
    },
    family_queue: {
      type: 'string',
      readOnly: true,
      title: 'Other lots in this part family',
      description: 'Opens the inspection queue filtered to this part family',
      'x-lt-widget': 'link',
      'x-lt-href': `/escalations/available?role=${LOT_INSPECTOR_ROLE}&facets={"partFamily":"{{metadata.partFamily}}"}`,
      'x-lt-span': 2,
      'x-lt-section': SECTION_SIGNOFF,
    },
  },
};

export const INSPECT_LIST_SCHEMA = {
  'x-lt-layout': 'facet-table',
  'x-lt-related': {
    arriving: {
      source: 'query',
      query: { roles: [LOT_RECEIVER_ROLE], facets: { partFamily: '{{metadata.partFamily}}' } },
    },
  },
  'x-lt-columns': [
    { label: 'Lot', value: '{{metadata.lotNumber}}', priority: 1, width: '20%' },
    { label: 'Part family', value: '{{metadata.partFamily}}', priority: 2 },
    { label: 'Sample', value: '{{envelope.sample_size}}', priority: 2 },
    { label: 'Tolerance (mm)', value: '{{envelope.tolerance.min}} to {{envelope.tolerance.max}}', priority: 3 },
    { label: 'Arriving', related: 'arriving', aggregate: 'count' },
    { label: 'Inspector', value: '{{escalation.assigned_to}}', format: 'user', priority: 3 },
    { label: 'Waiting', value: '{{escalation.created_at}}', format: 'age', priority: 1 },
  ],
  'x-lt-row-detail': [
    {
      related: 'arriving',
      label: 'Still at the dock',
      columns: [
        { label: 'Lot', value: '{{metadata.lotNumber}}' },
        { label: 'Expected', value: '{{envelope.expected_units}}' },
        { label: 'At', value: '{{escalation.role}}', format: 'role' },
        { label: 'Since', value: '{{escalation.created_at}}', format: 'age' },
      ],
    },
  ],
  'x-lt-row-action': { action: 'claim', label: 'Inspect', durationMinutes: 30 },
};

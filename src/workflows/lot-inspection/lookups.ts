/**
 * Versioned knowledge lookups read by the lot-inspection forms.
 *
 * Knowledge editions are immutable and numbered per entry, so a pinned ref
 * (version: 1) names the same list in every environment. Writing unchanged
 * data mints nothing; changing an entry's data below mints the next edition,
 * which current refs follow and pinned refs ignore.
 */

import type { EscalationLookupRef } from '@hotmeshio/long-tail';

export const LOOKUP_DOMAIN = 'hitl';

/** Part families, pinned for the invoke form. */
export const PART_FAMILIES_LOOKUP: EscalationLookupRef = { domain: LOOKUP_DOMAIN, key: 'part-families', version: 1, as: 'families' };
/** Inspection checklist; current, so open rows pick up edits. */
export const INSPECTION_CHECKS_LOOKUP: EscalationLookupRef = { domain: LOOKUP_DOMAIN, key: 'inspection-checks', as: 'checks' };
/** Defect categories and their types (the cascade map); current. */
export const DEFECTS_LOOKUP: EscalationLookupRef = { domain: LOOKUP_DOMAIN, key: 'defects', as: 'defects' };

export const LOOKUP_ENTRIES: { key: string; data: Record<string, unknown> }[] = [
  {
    key: 'part-families',
    data: {
      items: [
        { value: 'insole-shell', label: 'Insole shell' },
        { value: 'heel-cup', label: 'Heel cup' },
        { value: 'arch-insert', label: 'Arch insert' },
      ],
    },
  },
  {
    key: 'inspection-checks',
    data: {
      items: [
        { id: 'sample_random', label: 'Sample drawn at random from the lot', required: true },
        { id: 'gauge_zeroed', label: 'Gauge zeroed before the first reading', required: true },
        { id: 'label_matches', label: 'Lot label matches the traveler', required: true },
        { id: 'photos', label: 'Photos taken of every defect', required: false },
      ],
    },
  },
  {
    key: 'defects',
    data: {
      categories: [
        { value: 'surface', label: 'Surface' },
        { value: 'dimensional', label: 'Dimensional' },
        { value: 'material', label: 'Material' },
      ],
      types: {
        surface: [
          { value: 'scratch', label: 'Scratch' },
          { value: 'void', label: 'Void' },
          { value: 'stringing', label: 'Stringing' },
        ],
        dimensional: [
          { value: 'oversize', label: 'Oversize' },
          { value: 'undersize', label: 'Undersize' },
          { value: 'warp', label: 'Warp' },
        ],
        material: [
          { value: 'delamination', label: 'Delamination' },
          { value: 'discoloration', label: 'Discoloration' },
          { value: 'brittle', label: 'Brittle' },
        ],
      },
    },
  },
];

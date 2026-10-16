import { describe, it, expect } from 'vitest';
import { listSchemaRelationsError } from '@hotmeshio/long-tail/build/shared/list-schema/validate';

import { violationsOf, SIGNATURE } from '../../../../helpers/form-validation';
import { LOOKUP_ENTRIES } from '../../../../../src/workflows/lot-inspection/lookups';
import { INSPECT_FORM_SCHEMA, INSPECT_LIST_SCHEMA } from '../../../../../src/workflows/lot-inspection/forms/inspect';

const entry = (key: string) => LOOKUP_ENTRIES.find((e) => e.key === key)!.data;
const ctx = {
  envelope: { sample_size: 5, tolerance: { min: 9.8, max: 10.2 } },
  metadata: { lotNumber: 'LOT-1001', partFamily: 'heel-cup' },
  lookup: { checks: entry('inspection-checks'), defects: entry('defects') },
};
const checks = { sample_random: true, gauge_zeroed: true, label_matches: true };
const signoff = { signature: SIGNATURE };

describe('INSPECT_FORM_SCHEMA', () => {
  it('accepts a pass inside tolerance with every required check', () => {
    const v = violationsOf(INSPECT_FORM_SCHEMA, { verdict: 'pass', measurement: { mm: 10 }, inspection: { checks }, signoff }, ctx);
    expect(v).toEqual({});
  });

  it('bounds a passing measurement by the row tolerance', () => {
    const v = violationsOf(INSPECT_FORM_SCHEMA, { verdict: 'pass', measurement: { mm: 10.5 }, inspection: { checks }, signoff }, ctx);
    expect(Object.keys(v)).toEqual(['measured_mm']);
  });

  it('requires every required checklist item from the lookup', () => {
    const v = violationsOf(INSPECT_FORM_SCHEMA, {
      verdict: 'pass', measurement: { mm: 10 }, inspection: { checks: { ...checks, gauge_zeroed: false } }, signoff,
    }, ctx);
    expect(Object.keys(v)).toEqual(['checks']);
  });

  it('accepts a defect type from the chosen category', () => {
    const v = violationsOf(INSPECT_FORM_SCHEMA, {
      verdict: 'rework', inspection: { checks }, defect: { category: 'surface', type: 'void', unitsFailed: 2 }, signoff,
    }, ctx);
    expect(v).toEqual({});
  });

  it('refuses a defect type from another category (cascade)', () => {
    const v = violationsOf(INSPECT_FORM_SCHEMA, {
      verdict: 'scrap', inspection: { checks }, defect: { category: 'surface', type: 'warp', unitsFailed: 1 }, signoff,
    }, ctx);
    expect(Object.keys(v)).toEqual(['defect_type']);
  });

  it('bounds failed units by the row sample size', () => {
    const v = violationsOf(INSPECT_FORM_SCHEMA, {
      verdict: 'scrap', inspection: { checks }, defect: { category: 'material', type: 'brittle', unitsFailed: 6 }, signoff,
    }, ctx);
    expect(Object.keys(v)).toEqual(['units_failed']);
  });

  it('requires the signature once a verdict is chosen', () => {
    const v = violationsOf(INSPECT_FORM_SCHEMA, { verdict: 'pass', measurement: { mm: 10 }, inspection: { checks } }, ctx);
    expect(Object.keys(v)).toEqual(['signature']);
  });

  it('drops display-only widgets from the contract', () => {
    const v = violationsOf(INSPECT_FORM_SCHEMA, { verdict: 'pass', measurement: { mm: 10 }, inspection: { checks }, signoff }, ctx);
    expect(v).not.toHaveProperty('reinspect');
    expect(v).not.toHaveProperty('family_queue');
  });
});

describe('INSPECT_LIST_SCHEMA', () => {
  it('declares a valid look-ahead set', () => {
    expect(listSchemaRelationsError(INSPECT_LIST_SCHEMA)).toBeNull();
  });

  it('counts arriving lots in a column', () => {
    const arriving = INSPECT_LIST_SCHEMA['x-lt-columns'].find((c) => 'related' in c);
    expect(arriving).toMatchObject({ related: 'arriving', aggregate: 'count' });
  });
});

describe('INSPECT_FORM_SCHEMA display', () => {
  it('scopes the dictionary to the facts so widgets keep their controls', () => {
    expect(INSPECT_FORM_SCHEMA).not.toHaveProperty('x-lt-display');
    expect(INSPECT_FORM_SCHEMA['x-lt-section-options']['The lot']).toEqual({ display: 'dictionary' });
  });
});

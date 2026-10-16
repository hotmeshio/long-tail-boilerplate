import { describe, it, expect } from 'vitest';
import { buildInvokeFormContext } from '@hotmeshio/long-tail/build/shared/form-validation';

import { violationsOf } from '../../../../helpers/form-validation';
import { LOOKUP_ENTRIES } from '../../../../../src/workflows/lot-inspection/lookups';
import { LOT_INSPECTION_INPUT_SCHEMA } from '../../../../../src/workflows/lot-inspection/forms/invoke';

const families = LOOKUP_ENTRIES.find((e) => e.key === 'part-families')!.data;
const ctx = buildInvokeFormContext({ source: 'dashboard' }, { families });

const valid = {
  lot: { number: 'LOT-1001', partFamily: 'heel-cup', expectedUnits: 24 },
  inspection: { sampleSize: 5, tolerance: { min: 9.8, max: 10.2 } },
  receiving: { docks: ['D1', 'D2'] },
};

describe('LOT_INSPECTION_INPUT_SCHEMA', () => {
  it('accepts a complete payload', () => {
    expect(violationsOf(LOT_INSPECTION_INPUT_SCHEMA, valid, ctx)).toEqual({});
  });

  it('accepts a rework lot number', () => {
    const v = violationsOf(LOT_INSPECTION_INPUT_SCHEMA, { ...valid, lot: { ...valid.lot, number: 'LOT-1001-R1' } }, ctx);
    expect(v).toEqual({});
  });

  it('guards the lot number pattern with its message', () => {
    const v = violationsOf(LOT_INSPECTION_INPUT_SCHEMA, { ...valid, lot: { ...valid.lot, number: 'lot 7' } }, ctx);
    expect(v.lotNumber).toMatch(/LOT-/);
  });

  it('refuses a part family outside the pinned edition', () => {
    const v = violationsOf(LOT_INSPECTION_INPUT_SCHEMA, { ...valid, lot: { ...valid.lot, partFamily: 'toe-cap' } }, ctx);
    expect(v).toHaveProperty('partFamily');
  });

  it('requires at least one dock door from the list', () => {
    expect(violationsOf(LOT_INSPECTION_INPUT_SCHEMA, { ...valid, receiving: { docks: [] } }, ctx)).toHaveProperty('docks');
    expect(violationsOf(LOT_INSPECTION_INPUT_SCHEMA, { ...valid, receiving: { docks: ['D9'] } }, ctx)).toHaveProperty('docks');
  });

  it('bounds sample size and expected units', () => {
    const v = violationsOf(LOT_INSPECTION_INPUT_SCHEMA, {
      ...valid,
      lot: { ...valid.lot, expectedUnits: 0 },
      inspection: { ...valid.inspection, sampleSize: 51 },
    }, ctx);
    expect(Object.keys(v).sort()).toEqual(['expectedUnits', 'sampleSize']);
  });
});

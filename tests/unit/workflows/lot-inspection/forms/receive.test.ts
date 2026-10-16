import { describe, it, expect } from 'vitest';

import { violationsOf } from '../../../../helpers/form-validation';
import { RECEIVE_FORM_SCHEMA, RECEIVE_LIST_SCHEMA } from '../../../../../src/workflows/lot-inspection/forms/receive';

const ctx = { envelope: { expected_units: 24, dock_doors: ['D1', 'D2'] }, metadata: { lotNumber: 'LOT-1001', partFamily: 'heel-cup' } };
const lot = { number: 'LOT-1001', partFamily: 'heel-cup', expectedUnits: 24 };

describe('RECEIVE_FORM_SCHEMA', () => {
  it('accepts a full receipt at an offered door', () => {
    expect(violationsOf(RECEIVE_FORM_SCHEMA, { lot, receipt: { outcome: 'accept', dock: 'D2' } }, ctx)).toEqual({});
  });

  it('refuses a door the row does not offer', () => {
    expect(violationsOf(RECEIVE_FORM_SCHEMA, { lot, receipt: { outcome: 'accept', dock: 'D4' } }, ctx)).toHaveProperty('dock');
  });

  it('bounds a short count by the row expected units', () => {
    const over = violationsOf(RECEIVE_FORM_SCHEMA, { lot, receipt: { outcome: 'short', unitsReceived: 30, dock: 'D1' } }, ctx);
    expect(over).toHaveProperty('units_received');
    const under = violationsOf(RECEIVE_FORM_SCHEMA, { lot, receipt: { outcome: 'short', unitsReceived: 20, dock: 'D1' } }, ctx);
    expect(under).toEqual({});
  });

  it('asks a refusal for its reason and nothing else', () => {
    const v = violationsOf(RECEIVE_FORM_SCHEMA, { lot, receipt: { outcome: 'refuse' } }, ctx);
    expect(Object.keys(v)).toEqual(['refuse_reason']);
  });

  it('requires a receipt outcome', () => {
    expect(violationsOf(RECEIVE_FORM_SCHEMA, { lot }, ctx)).toHaveProperty('receipt');
  });
});

describe('RECEIVE_LIST_SCHEMA', () => {
  it('claims from the list as "Receive"', () => {
    expect(RECEIVE_LIST_SCHEMA['x-lt-row-action']).toMatchObject({ action: 'claim', label: 'Receive' });
  });
});

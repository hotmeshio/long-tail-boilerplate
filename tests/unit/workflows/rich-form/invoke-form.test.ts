import { describe, it, expect } from 'vitest';

import { violationsOf } from '../../../helpers/form-validation';
import { INTAKE_INPUT_SCHEMA } from '../../../../src/workflows/rich-form/invoke-form';

describe('INTAKE_INPUT_SCHEMA', () => {
  it('accepts the minimal bound payload', () => {
    const v = violationsOf(INTAKE_INPUT_SCHEMA, {
      customer: { name: 'Acme Widgets LLC', email: 'ops@acme.example' },
      contract: { tier: 'starter' },
    });
    expect(v).toEqual({});
  });

  it('requires customer, email, and tier', () => {
    expect(Object.keys(violationsOf(INTAKE_INPUT_SCHEMA, {})).sort()).toEqual(['contactEmail', 'customerName', 'tier']);
  });

  it('refuses a non-integer or zero form edition', () => {
    const base = { customer: { name: 'Acme', email: 'ops@acme.example' }, contract: { tier: 'starter' } };
    expect(violationsOf(INTAKE_INPUT_SCHEMA, { ...base, formVersion: 0 })).toHaveProperty('formVersion');
    expect(violationsOf(INTAKE_INPUT_SCHEMA, { ...base, formVersion: '2' })).toHaveProperty('formVersion');
    expect(violationsOf(INTAKE_INPUT_SCHEMA, { ...base, formVersion: 2 })).toEqual({});
  });
});

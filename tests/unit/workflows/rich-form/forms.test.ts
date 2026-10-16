import { describe, it, expect } from 'vitest';

import { violationsOf } from '../../../helpers/form-validation';
import { INTAKE_FORM_SCHEMA, INTAKE_LIST_SCHEMA } from '../../../../src/workflows/rich-form/forms';

const customer = { name: 'Acme Widgets LLC', email: 'ops@acme.example', phone: '+1 555 0100' };
const contract = { tier: 'professional', startDate: '2026-11-01', budget: 50_000 };

describe('INTAKE_FORM_SCHEMA', () => {
  it('accepts an approval', () => {
    const v = violationsOf(INTAKE_FORM_SCHEMA, { customer, contract, review: { decision: 'approve' } });
    expect(v).toEqual({});
  });

  it('requires a decision', () => {
    const v = violationsOf(INTAKE_FORM_SCHEMA, { customer, contract });
    expect(Object.keys(v)).toEqual(['decision']);
  });

  it('demands a reason only when rejecting', () => {
    expect(violationsOf(INTAKE_FORM_SCHEMA, { customer, contract, review: { decision: 'reject' } })).toHaveProperty('reject_reason');
    expect(violationsOf(INTAKE_FORM_SCHEMA, { customer, contract, review: { decision: 'approve' } })).not.toHaveProperty('reject_reason');
  });

  it('demands at least one missing item when requesting information', () => {
    const empty = violationsOf(INTAKE_FORM_SCHEMA, { customer, contract, review: { decision: 'needs-info', missing: [] } });
    expect(empty).toHaveProperty('missing');
    const listed = violationsOf(INTAKE_FORM_SCHEMA, { customer, contract, review: { decision: 'needs-info', missing: ['agreement'] } });
    expect(listed).toEqual({});
  });

  it('refuses a missing item outside the option list', () => {
    const v = violationsOf(INTAKE_FORM_SCHEMA, { customer, contract, review: { decision: 'needs-info', missing: ['passport'] } });
    expect(v).toHaveProperty('missing');
  });

  it('refuses a tier outside the option list', () => {
    const v = violationsOf(INTAKE_FORM_SCHEMA, { customer, contract: { ...contract, tier: 'platinum' }, review: { decision: 'approve' } });
    expect(v).toHaveProperty('tier');
  });

  it('guards email format, phone pattern, and budget bounds', () => {
    const v = violationsOf(INTAKE_FORM_SCHEMA, {
      customer: { ...customer, email: 'not-an-email', phone: 'call me' },
      contract: { ...contract, budget: -1 },
      review: { decision: 'approve' },
    });
    expect(Object.keys(v).sort()).toEqual(['budget', 'contact_email', 'phone']);
  });

  it('every ordered and required key names a property', () => {
    const keys = Object.keys(INTAKE_FORM_SCHEMA.properties);
    expect(INTAKE_FORM_SCHEMA['x-lt-order'].filter((k) => !keys.includes(k))).toEqual([]);
    expect(INTAKE_FORM_SCHEMA.required.filter((k) => !keys.includes(k))).toEqual([]);
  });
});

describe('INTAKE_LIST_SCHEMA', () => {
  it('is a facet table with a claim action', () => {
    expect(INTAKE_LIST_SCHEMA['x-lt-layout']).toBe('facet-table');
    expect(INTAKE_LIST_SCHEMA['x-lt-row-action'].action).toBe('claim');
  });
});

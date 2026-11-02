import { describe, it, expect } from 'vitest';

import { PROGRAM_FORM_SCHEMA, PROGRAM_LIST_SCHEMA } from '../../../../src/workflows/claude-workbench/forms';
import { violationsOf } from '../../../helpers/form-validation';

describe('PROGRAM_FORM_SCHEMA', () => {
  it('accepts a finished deliverable without any closing field', () => {
    const payload = { item: { key: 'tdd', kind: 'tdd', verdict: 'accepted', summary: 'Accepted in one round.', round: 1 } };
    expect(violationsOf(PROGRAM_FORM_SCHEMA, payload)).toEqual({});
  });

  it('refuses an item with an unknown verdict', () => {
    const payload = { item: { key: 'tdd', kind: 'tdd', verdict: 'maybe', summary: 's', round: 1 } };
    expect(Object.keys(violationsOf(PROGRAM_FORM_SCHEMA, payload))).toEqual(['item_verdict']);
  });

  it('requires a closing outcome when no item arrived', () => {
    expect(Object.keys(violationsOf(PROGRAM_FORM_SCHEMA, { closing: {} }))).toEqual(['closing_outcome']);
    expect(violationsOf(PROGRAM_FORM_SCHEMA, { closing: { outcome: 'launched', summary: 'Shipped.' } })).toEqual({});
  });

  it('has no cancel and a roster of what landed', () => {
    expect(PROGRAM_FORM_SCHEMA['x-lt-labels'].cancel).toBe(false);
    expect(PROGRAM_FORM_SCHEMA.properties.landed['x-lt-widget']).toBe('roster');
  });
});

describe('PROGRAM_LIST_SCHEMA', () => {
  it('shows how many deliverables are in', () => {
    expect(PROGRAM_LIST_SCHEMA['x-lt-columns'].map((column) => column.value)).toContain('{{metadata.accumulate_count}}');
  });
});

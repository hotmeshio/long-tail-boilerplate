import { describe, it, expect } from 'vitest';

import { INBOX_ITEM_INPUT_SCHEMA, INBOX_PREFERENCES_INPUT_SCHEMA, INBOX_SWEEP_INPUT_SCHEMA } from '../../../../../src/workflows/claude-workbench/forms';
import { violationsOf } from '../../../../helpers/form-validation';

const ctx = { lookup: { kinds: { items: [{ value: 'request', label: 'Request' }] } } };

describe('inbox invoke forms', () => {
  it('never require the inbox: it defaults to the caller\'s own', () => {
    for (const schema of [INBOX_SWEEP_INPUT_SCHEMA, INBOX_ITEM_INPUT_SCHEMA, INBOX_PREFERENCES_INPUT_SCHEMA]) {
      expect(schema.required).not.toContain('holder');
    }
  });

  it('accepts a sweep and a reactions row with no inbox named', () => {
    expect(violationsOf(INBOX_SWEEP_INPUT_SCHEMA, { source: 'slack' }, ctx)).toEqual({});
    expect(violationsOf(INBOX_PREFERENCES_INPUT_SCHEMA, {}, ctx)).toEqual({});
  });

  it('accepts an empty inbox or a named one, and refuses a malformed name', () => {
    expect(violationsOf(INBOX_PREFERENCES_INPUT_SCHEMA, { holder: '' }, ctx)).toEqual({});
    expect(violationsOf(INBOX_PREFERENCES_INPUT_SCHEMA, { holder: 'inbox-ana-ruiz-at-example-com' }, ctx)).toEqual({});
    expect(violationsOf(INBOX_PREFERENCES_INPUT_SCHEMA, { holder: 'Ana Ruiz' }, ctx)).toHaveProperty('holder');
  });
});

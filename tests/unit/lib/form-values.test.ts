import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { blankAsAbsent, parseFormPayload } from '../../../src/lib/form-values';

const schema = z.object({ count: blankAsAbsent(z.number()), note: blankAsAbsent(z.string()) });

describe('blankAsAbsent', () => {
  it('reads "" and null as absent', () => {
    expect(parseFormPayload(schema, { count: '', note: null })).toEqual({ count: undefined, note: undefined });
  });

  it('keeps real values', () => {
    expect(parseFormPayload(schema, { count: 3, note: 'ok' })).toEqual({ count: 3, note: 'ok' });
  });

  it('still rejects a wrong type', () => {
    expect(() => parseFormPayload(schema, { count: 'three' })).toThrow(/count/);
  });
});

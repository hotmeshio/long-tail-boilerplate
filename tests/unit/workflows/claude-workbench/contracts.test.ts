import { describe, it, expect } from 'vitest';

import { parseAnswer, parseDecision, parseGate, parseHandoff, parseReview } from '../../../../src/workflows/claude-workbench/contracts';

describe('contracts', () => {
  it('parses a handoff and drops the blanks the dashboard submits', () => {
    const handoff = parseHandoff({ handoff: { outcome: 'done', summary: 'Twenty characters at least.', blockerQuestion: '', decisions: null, assets: '' } });
    expect(handoff).toEqual({ outcome: 'done', summary: 'Twenty characters at least.' });
  });

  it('keeps assets when given', () => {
    const handoff = parseHandoff({ handoff: { outcome: 'partly-done', summary: 'Half of it, with a link.', assets: [{ label: 'Doc', url: 'https://x' }] } });
    expect(handoff.assets).toEqual([{ label: 'Doc', url: 'https://x' }]);
  });

  it('parses a review, a decision and a gate sign', () => {
    expect(parseReview({ review: { verdict: 'changes-requested', findings: 'Missing tests.' } })).toEqual({ verdict: 'changes-requested', findings: 'Missing tests.' });
    expect(parseDecision({ decision: { outcome: 'rework', rework: ['tdd'], notes: '' } })).toEqual({ outcome: 'rework', rework: ['tdd'] });
    expect(parseGate({ gate: { verdict: 'approve' } })).toEqual({ verdict: 'approve' });
  });

  it('refuses an outcome outside the contract', () => {
    expect(() => parseHandoff({ handoff: { outcome: 'maybe', summary: 'Long enough summary here.' } })).toThrow();
  });

  it('passes timeouts and cancels through unparsed', () => {
    expect(parseAnswer(false, parseGate)).toBe(false);
    expect(parseAnswer(null, parseGate)).toBe(null);
    expect(parseAnswer({ gate: { verdict: 'hold', notes: 'n' } }, parseGate)).toEqual({ verdict: 'hold', notes: 'n' });
  });
});

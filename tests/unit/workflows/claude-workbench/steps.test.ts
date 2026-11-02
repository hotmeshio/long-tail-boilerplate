import { describe, it, expect } from 'vitest';

import { exhaustedVerdict, reworkKinds, routeDecision, routeGate, routeHold, routeReview, routeWork } from '../../../../src/workflows/claude-workbench/steps';
import type { Handoff, PhaseTemplate } from '../../../../src/workflows/claude-workbench/types';

const done: Handoff = { outcome: 'done', summary: 'Done, with the usual detail.' };
const blocked: Handoff = { outcome: 'blocked', summary: 'Stuck on the schema choice.', blockerQuestion: 'A or B?' };
const phase: PhaseTemplate = { key: 'design', label: 'Design', deliverables: ['tdd', 'test-plan'], gate: ['sre', 'quality'] };

describe('deliverable routes', () => {
  it('routes a handoff by its outcome, and timeouts and cancels by kind', () => {
    expect(routeWork(done)).toEqual({ kind: 'review', handoff: done });
    expect(routeWork(blocked)).toEqual({ kind: 'blocked', handoff: blocked });
    expect(routeWork(false)).toEqual({ kind: 'expired' });
    expect(routeWork(null)).toEqual({ kind: 'cancelled' });
  });

  it('ends on drop, otherwise carries the decision into the next round', () => {
    expect(routeDecision({ outcome: 'drop' }, 1, blocked)).toEqual({ kind: 'dropped' });
    expect(routeDecision({ outcome: 'go-ahead', notes: 'A' }, 1, blocked)).toEqual({ kind: 'again', note: { round: 1, handoff: blocked, decision: { outcome: 'go-ahead', notes: 'A' } } });
    expect(routeDecision(false, 1, blocked)).toEqual({ kind: 'expired' });
  });

  it('ends on acceptance, otherwise carries the findings into the next round', () => {
    expect(routeReview({ verdict: 'accepted' }, 2, done)).toEqual({ kind: 'accepted', handoff: done });
    expect(routeReview({ verdict: 'changes-requested', findings: 'More tests.' }, 2, done)).toEqual({
      kind: 'again',
      note: { round: 2, handoff: done, review: { verdict: 'changes-requested', findings: 'More tests.' } },
    });
    expect(routeReview(null, 2, done)).toEqual({ kind: 'cancelled' });
  });

  it('names the verdict when the rounds run out', () => {
    expect(exhaustedVerdict(true)).toBe('stalled');
    expect(exhaustedVerdict(false)).toBe('rounds-exhausted');
  });
});

describe('gate routes', () => {
  it('approves only when every signer approves', () => {
    expect(routeGate(phase.gate, [{ verdict: 'approve' }, { verdict: 'approve' }])).toEqual({ kind: 'approved' });
  });

  it('treats a timeout as a hold and names who held', () => {
    const route = routeGate(phase.gate, [{ verdict: 'approve' }, false]);
    expect(route).toEqual({ kind: 'held', holds: [{ role: 'quality', sign: { verdict: 'hold', timedOut: true } }] });
  });

  it('collects every hold with its notes', () => {
    const route = routeGate(phase.gate, [{ verdict: 'hold', notes: 'No runbook.' }, { verdict: 'hold', notes: 'No tests.' }]);
    expect(route.kind).toBe('held');
    expect(route.kind === 'held' && route.holds.map((hold) => hold.role)).toEqual(['sre', 'quality']);
  });

  it('cancels when any signer row is cancelled', () => {
    expect(routeGate(phase.gate, [null, { verdict: 'approve' }])).toEqual({ kind: 'cancelled' });
  });
});

describe('hold routes', () => {
  it('reworks the named deliverables of the phase, or all of them', () => {
    expect(routeHold({ outcome: 'rework', rework: ['tdd', 'prd'] }, phase)).toEqual({ kind: 'rework', kinds: ['tdd'] });
    expect(routeHold({ outcome: 'rework' }, phase)).toEqual({ kind: 'rework', kinds: ['tdd', 'test-plan'] });
    expect(reworkKinds(['nope'], phase)).toEqual(['tdd', 'test-plan']);
  });

  it('skips, stops, stalls and cancels', () => {
    expect(routeHold({ outcome: 'skip' }, phase)).toEqual({ kind: 'skip' });
    expect(routeHold({ outcome: 'stop' }, phase)).toEqual({ kind: 'stop' });
    expect(routeHold({ outcome: 'something-else' }, phase)).toEqual({ kind: 'stop' });
    expect(routeHold(false, phase)).toEqual({ kind: 'stalled' });
    expect(routeHold(null, phase)).toEqual({ kind: 'cancelled' });
  });
});

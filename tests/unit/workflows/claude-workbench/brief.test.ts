import { describe, it, expect } from 'vitest';

import { boardBrief, gateBrief, handoffMarkdown, holdBrief, reviewBrief, workBrief } from '../../../../src/workflows/claude-workbench/brief';
import type { DeliverableResult, Handoff, PhaseTemplate } from '../../../../src/workflows/claude-workbench/types';

const handoff: Handoff = {
  outcome: 'done',
  summary: 'Wrote it.',
  assets: [{ label: 'PR 7', url: 'https://x/7' }],
  decisions: 'Kept zod.',
  nextSuggested: 'Review the ids.',
};
const phase: PhaseTemplate = { key: 'design', label: 'Design', deliverables: ['tdd'], gate: ['sre'] };
const result: DeliverableResult = { key: 'p-p0-tdd-g1', kind: 'tdd', verdict: 'accepted', rounds: 2, handoff };

describe('brief builders', () => {
  it('renders a handoff with its assets and sections, leaving absent ones out', () => {
    const md = handoffMarkdown(handoff);
    expect(md).toContain('[PR 7](https://x/7)');
    expect(md).toContain('#### Decisions');
    expect(md).toContain('#### Next');
    expect(md).not.toContain('Open questions');
  });

  it('carries every earlier round into the next brief', () => {
    const md = workBrief('Do the TDD.', [
      { round: 1, handoff, review: { verdict: 'changes-requested', findings: 'Name the ids.' } },
      { round: 2, expired: true },
    ]);
    expect(md.startsWith('Do the TDD.')).toBe(true);
    expect(md).toContain('### Round 1 handoff');
    expect(md).toContain('Name the ids.');
    expect(md).toContain('### Round 2');
    expect(md).toContain('expired');
  });

  it('heads the review brief with the round', () => {
    expect(reviewBrief('TDD', 2, handoff)).toContain('### TDD, round 2');
  });

  it('tables the phase for a gate and lists holds for the owner', () => {
    expect(gateBrief('Insole v2', phase, [result])).toContain('| p-p0-tdd-g1 | tdd | accepted | 2 | Wrote it. |');
    const held = holdBrief('Insole v2', phase, [result], [{ role: 'sre', sign: { verdict: 'hold', timedOut: true } }]);
    expect(held).toContain('**sre:** no answer within the gate window');
  });

  it('lists the phases on the board', () => {
    expect(boardBrief('Goal.', [phase])).toContain('1. Design: tdd (gate: sre)');
  });
});

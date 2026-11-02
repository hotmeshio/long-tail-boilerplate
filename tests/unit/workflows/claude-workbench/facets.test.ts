import { describe, it, expect } from 'vitest';

import {
  aiAssignment,
  boardSignal,
  deliverableChildId,
  domainOf,
  gateSignal,
  holdSignal,
  present,
  roundSignal,
  rowFacets,
  sectionEnvelope,
} from '../../../../src/workflows/claude-workbench/facets';
import { CLAUDE_BOT_ID } from '../../../../src/workflows/claude-workbench/personas';

describe('facets', () => {
  it('drops absent facts so a containment query never matches null', () => {
    expect(present({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
    const facets = rowFacets({ seat: 'engineering-platform', section: 'work', raci: 'responsible', round: 1 });
    expect(facets).toEqual({ seat: 'engineering-platform', domain: 'engineering', section: 'work', raci: 'responsible', round: 1 });
    expect('program' in facets).toBe(false);
  });

  it('knows each role\'s domain', () => {
    expect(domainOf('sre')).toBe('sre');
    expect(domainOf('engineering-lab')).toBe('engineering');
    expect(domainOf('nobody')).toBeUndefined();
  });

  it('puts the section at the envelope root beside the brief', () => {
    expect(sectionEnvelope('decide', '# Hi', { decision_options: [] })).toEqual({ section: 'decide', decision_options: [], formDefaults: { brief: '# Hi' } });
  });

  it('assigns work to the bot only under an AI mode, with the mode\'s window', () => {
    expect(aiAssignment(undefined, CLAUDE_BOT_ID)).toEqual({});
    expect(aiAssignment('none', CLAUDE_BOT_ID)).toEqual({});
    expect(aiAssignment('eligible', CLAUDE_BOT_ID)).toEqual({ assignee: CLAUDE_BOT_ID, durationMinutes: 240 });
    expect(aiAssignment('only', CLAUDE_BOT_ID)).toEqual({ assignee: CLAUDE_BOT_ID, durationMinutes: 10080 });
  });

  it('scopes every id to its workflow', () => {
    expect(boardSignal('p1')).toBe('p1-board');
    expect(deliverableChildId('p1', 2, 'tdd', 1)).toBe('p1-p2-tdd-g1');
    expect(roundSignal('d1', 3, 'review')).toBe('d1-r3-review');
    expect(gateSignal('p1', 2, 1, 'sre')).toBe('p1-p2-g1-sre');
    expect(holdSignal('p1', 2, 1)).toBe('p1-p2-g1-decide');
  });
});

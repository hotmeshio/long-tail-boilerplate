import { describe, it, expect } from 'vitest';

import { digestMarkdown, handoffMarkdown, reviewBrief, workBrief } from '../../../../src/workflows/agent-crew/brief';
import { branchLeaseSignalId, pieceFacets, workstreamSignalId } from '../../../../src/workflows/agent-crew/facets';
import { CREW_PERSONAS } from '../../../../src/workflows/agent-crew/personas';
import { AGENT_PRINCIPALS, COORDINATOR_ID } from '../../../../src/workflows/agent-crew/principals';
import type { Handoff } from '../../../../src/workflows/agent-crew/types';

const handoff: Handoff = { outcome: 'done', summary: 'Added the form.', branch: 'luke/x', pr: 7, filesTouched: ['src/a.ts'] };

describe('handoffMarkdown', () => {
  it('lists only the facts the handoff carries', () => {
    const text = handoffMarkdown(handoff);
    expect(text).toContain('**Branch:** `luke/x`');
    expect(text).toContain('`src/a.ts`');
    expect(text).not.toContain('Commit');
  });
});

describe('workBrief', () => {
  it('is the bare ask on round one', () => {
    expect(workBrief('### Ask', [])).toBe('### Ask');
  });

  it('carries every earlier round with its review and owner answer', () => {
    const text = workBrief('### Ask', [
      { round: 1, handoff, review: { verdict: 'changes-requested', findings: '1. Add tests' } },
      { round: 2, handoff: { ...handoff, outcome: 'blocked' }, ownerAnswer: { outcome: 'go-ahead', notes: 'use v2' } },
    ]);
    expect(text).toContain('### Round 1 handoff');
    expect(text).toContain('1. Add tests');
    expect(text).toContain('### Round 2 handoff');
    expect(text).toContain('go-ahead: use v2');
  });
});

describe('reviewBrief and digestMarkdown', () => {
  it('heads the review with the piece and round', () => {
    expect(reviewBrief('Handoff form', 2, handoff)).toMatch(/^### Handoff form, round 2/);
  });

  it('tables every finished piece', () => {
    const text = digestMarkdown('Goal', [{ key: 'a', verdict: 'approved', summary: 'one\ntwo', pr: 3 }]);
    expect(text).toContain('| a | approved | 3 | one two |');
  });
});

describe('facets and signals', () => {
  it('leaves absent facets off and keeps the round', () => {
    const facets = pieceFacets({ key: 'a', headline: 'A', brief: 'b', project: 'p' }, 'agent-work', 1);
    expect(facets).toEqual({ project: 'p', kind: 'agent-work', piece: 'a', round: 1 });
  });

  it('derives deterministic home signals', () => {
    expect(workstreamSignalId('ws-1')).toBe('workstream-ws-1');
    expect(branchLeaseSignalId('hotmeshio/long-tail-boilerplate', 'luke/claude-workbench')).toBe('branch-lease-hotmeshio-long-tail-boilerplate-luke-claude-workbench');
  });
});

describe('crew identities', () => {
  const persona = (key: string) => CREW_PERSONAS.find((entry) => entry.key === key);
  const writes = (key: string) => persona(key)?.roles.filter((link) => link.relationship === 'write-all').map((link) => link.role);

  it('keeps building and reviewing apart', () => {
    expect(writes('agent-builder')).not.toContain('agent-review');
    expect(writes('agent-reviewer')).toEqual(['agent-review']);
  });

  it('gives each principal a known persona and the coordinator its own id', () => {
    const keys = CREW_PERSONAS.map((entry) => entry.key);
    expect(AGENT_PRINCIPALS.every((principal) => keys.includes(principal.persona))).toBe(true);
    expect(AGENT_PRINCIPALS.find((principal) => principal.externalId === 'workstream-coordinator')?.id).toBe(COORDINATOR_ID);
  });
});

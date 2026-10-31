import { describe, it, expect } from 'vitest';

import { violationsOf } from '../../../helpers/form-validation';
import { AGENT_WORK_FORM_SCHEMA } from '../../../../src/workflows/agent-crew/handoff-form';
import { AGENT_REVIEW_FORM_SCHEMA, AGENT_PLAN_FORM_SCHEMA, BRANCH_LEASE_FORM_SCHEMA } from '../../../../src/workflows/agent-crew/crew-forms';
import { WORKSTREAM_FORM_SCHEMA } from '../../../../src/workflows/agent-crew/workstream-form';

const summary = 'Added the handoff form and its tests.';

describe('AGENT_WORK_FORM_SCHEMA (the handoff)', () => {
  it('accepts a done handoff with code pointers', () => {
    const handoff = { outcome: 'done', summary, branch: 'luke/claude-workbench', commit: 'abc1234', pr: 12, filesTouched: ['src/a.ts'] };
    expect(violationsOf(AGENT_WORK_FORM_SCHEMA, { handoff })).toEqual({});
  });

  it('asks a blocked handoff for its question to the owner', () => {
    expect(violationsOf(AGENT_WORK_FORM_SCHEMA, { handoff: { outcome: 'blocked', summary } })).toHaveProperty('blocker_question');
  });

  it('does not ask a done handoff for an owner question', () => {
    expect(violationsOf(AGENT_WORK_FORM_SCHEMA, { handoff: { outcome: 'done', summary } })).toEqual({});
  });

  it('refuses a summary too thin for the next agent', () => {
    expect(violationsOf(AGENT_WORK_FORM_SCHEMA, { handoff: { outcome: 'done', summary: 'done' } })).toHaveProperty('summary');
  });

  it('refuses a commit that is not a hash', () => {
    expect(violationsOf(AGENT_WORK_FORM_SCHEMA, { handoff: { outcome: 'done', summary, commit: 'main' } })).toHaveProperty('commit');
  });
});

describe('AGENT_REVIEW_FORM_SCHEMA', () => {
  it('approves without findings', () => {
    expect(violationsOf(AGENT_REVIEW_FORM_SCHEMA, { review: { verdict: 'approved' } })).toEqual({});
  });

  it('asks requested changes for findings', () => {
    expect(violationsOf(AGENT_REVIEW_FORM_SCHEMA, { review: { verdict: 'changes-requested' } })).toHaveProperty('findings');
  });
});

describe('AGENT_PLAN_FORM_SCHEMA', () => {
  const piece = { key: 'handoff-form', headline: 'Handoff form', brief: '### Build the handoff form' };

  it('accepts pieces with key, headline and brief', () => {
    expect(violationsOf(AGENT_PLAN_FORM_SCHEMA, { plan: { pieces: [piece] } })).toEqual({});
  });

  it('refuses an empty plan', () => {
    expect(violationsOf(AGENT_PLAN_FORM_SCHEMA, { plan: { pieces: [] } })).toHaveProperty('pieces');
  });
});

describe('BRANCH_LEASE_FORM_SCHEMA', () => {
  it('retires a lease with a reason', () => {
    expect(violationsOf(BRANCH_LEASE_FORM_SCHEMA, { lease: { retirement: 'merged' } })).toEqual({});
    expect(violationsOf(BRANCH_LEASE_FORM_SCHEMA, { lease: {} })).toHaveProperty('retirement');
  });
});

describe('WORKSTREAM_FORM_SCHEMA', () => {
  it('accepts a finished piece without the close fields', () => {
    expect(violationsOf(WORKSTREAM_FORM_SCHEMA, { piece: { key: 'handoff-form', verdict: 'approved', summary } })).toEqual({});
  });

  it('refuses a piece verdict it does not know', () => {
    expect(violationsOf(WORKSTREAM_FORM_SCHEMA, { piece: { key: 'handoff-form', verdict: 'maybe', summary } })).toHaveProperty('piece_verdict');
  });

  it('asks an early close for its closing', () => {
    expect(violationsOf(WORKSTREAM_FORM_SCHEMA, { summary: 'stop' })).toHaveProperty('closing');
  });
});

import { describe, it, expect } from 'vitest';

import { ASK_INPUT_SCHEMA, DELIVERABLE_INPUT_SCHEMA, PROGRAM_INPUT_SCHEMA } from '../../../../src/workflows/claude-workbench/forms';
import { DELIVERABLE_TYPES, PROGRAM_TEMPLATES, ROLE_ITEMS } from '../../../../src/workflows/claude-workbench/org';
import { violationsOf } from '../../../helpers/form-validation';

const ctx = { lookup: { roles: { items: ROLE_ITEMS }, types: { items: DELIVERABLE_TYPES }, programs: { items: PROGRAM_TEMPLATES } } };
const BRIEF = 'Ship the thing. Here is why and what good looks like.';

describe('PROGRAM_INPUT_SCHEMA', () => {
  it('accepts a program on a known template', () => {
    expect(violationsOf(PROGRAM_INPUT_SCHEMA, { program: 'insole-v2', headline: 'Insole v2', template: 'software-launch', brief: BRIEF }, ctx)).toEqual({});
  });

  it('refuses a bad slug, a long headline and an unknown template', () => {
    const bad = { program: 'Insole V2', headline: 'x'.repeat(61), template: 'nope', brief: BRIEF };
    expect(Object.keys(violationsOf(PROGRAM_INPUT_SCHEMA, bad, ctx)).sort()).toEqual(['headline', 'program', 'template']);
  });
});

describe('DELIVERABLE_INPUT_SCHEMA', () => {
  it('accepts a standalone deliverable on a known kind', () => {
    expect(violationsOf(DELIVERABLE_INPUT_SCHEMA, { key: 'tdd-sync', kind: 'tdd', headline: 'TDD: sync', brief: BRIEF }, ctx)).toEqual({});
  });

  it('refuses an unknown kind, producer or AI mode', () => {
    const bad = { key: 'tdd-sync', kind: 'poem', headline: 'TDD', producer: 'nobody', ai: 'always', brief: BRIEF };
    expect(Object.keys(violationsOf(DELIVERABLE_INPUT_SCHEMA, bad, ctx)).sort()).toEqual(['ai', 'kind', 'producer']);
  });
});

describe('ASK_INPUT_SCHEMA', () => {
  it('accepts a question for a role, with or without options', () => {
    expect(violationsOf(ASK_INPUT_SCHEMA, { seat: 'product', headline: 'Ship Friday?', brief: BRIEF }, ctx)).toEqual({});
    expect(violationsOf(ASK_INPUT_SCHEMA, { seat: 'product', headline: 'Ship Friday?', brief: BRIEF, options: ['friday', 'monday'] }, ctx)).toEqual({});
  });

  it('refuses an unknown role and an option that is not a slug', () => {
    expect(Object.keys(violationsOf(ASK_INPUT_SCHEMA, { seat: 'ceo', headline: 'Ship?', brief: BRIEF, options: ['Not A Slug!'] }, ctx)).sort()).toEqual(['options', 'seat']);
  });
});

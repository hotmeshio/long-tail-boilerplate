import { describe, it, expect } from 'vitest';

import { violationsOf } from '../../../helpers/form-validation';
import {
  OWNER_ESCALATION_INPUT_SCHEMA,
  CLAUDE_PROJECT_INPUT_SCHEMA,
  PROJECT_PLAN_INPUT_SCHEMA,
} from '../../../../src/workflows/claude-workbench/invoke-forms';

const brief = '### Question\n\nRestore the turbo block in AGENTS.md?';

describe('OWNER_ESCALATION_INPUT_SCHEMA', () => {
  const valid = { role: 'owner-decide', project: 'hike-mono-hygiene', headline: 'AGENTS.md: restore turbo block?', brief };

  it('accepts a headline, a brief and a project', () => {
    expect(violationsOf(OWNER_ESCALATION_INPUT_SCHEMA, valid)).toEqual({});
  });

  it('refuses a headline long enough to overload the title', () => {
    const headline = 'hike-mono AGENTS.md lost turbo agent-rules block. Go ahead = restore it; Drop it = leave it';
    expect(violationsOf(OWNER_ESCALATION_INPUT_SCHEMA, { ...valid, headline })).toHaveProperty('headline');
  });

  it('refuses a role outside the workbench queues', () => {
    expect(violationsOf(OWNER_ESCALATION_INPUT_SCHEMA, { ...valid, role: 'reviewer' })).toHaveProperty('role');
  });

  it('refuses a project that is not a slug', () => {
    expect(violationsOf(OWNER_ESCALATION_INPUT_SCHEMA, { ...valid, project: 'Hike Mono' })).toHaveProperty('project');
  });
});

describe('CLAUDE_PROJECT_INPUT_SCHEMA', () => {
  it('accepts a project with its goal', () => {
    const input = { project: 'claude-workbench', headline: 'Claude workbench', brief };
    expect(violationsOf(CLAUDE_PROJECT_INPUT_SCHEMA, input)).toEqual({});
  });
});

describe('PROJECT_PLAN_INPUT_SCHEMA', () => {
  const valid = { role: 'claude-next', project: 'claude-workbench', headline: 'Phase 1', brief, steps: ['declare-personas'] };

  it('accepts slug step keys', () => {
    expect(violationsOf(PROJECT_PLAN_INPUT_SCHEMA, valid)).toEqual({});
  });

  it('requires at least one step', () => {
    expect(violationsOf(PROJECT_PLAN_INPUT_SCHEMA, { ...valid, steps: [] })).toHaveProperty('steps');
  });
});

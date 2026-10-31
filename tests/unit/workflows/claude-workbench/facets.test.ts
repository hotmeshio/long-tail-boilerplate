import { describe, it, expect } from 'vitest';

import { briefEnvelope, hoursTimeout, projectSignalId, workbenchFacets } from '../../../../src/workflows/claude-workbench/facets';
import { WORKBENCH_PERSONAS } from '../../../../src/workflows/claude-workbench/personas';

describe('workbenchFacets', () => {
  it('carries every fact it is given', () => {
    const facets = workbenchFacets({ project: 'longtail-entry-flag', pr: 9266, sessionId: 'abc' }, 'owner-review');
    expect(facets).toEqual({ project: 'longtail-entry-flag', kind: 'owner-review', pr: 9266, sessionId: 'abc' });
  });

  it('leaves absent facts off rather than null', () => {
    expect(workbenchFacets({ project: 'claude-workbench' }, 'plan')).toEqual({ project: 'claude-workbench', kind: 'plan' });
  });
});

describe('briefEnvelope', () => {
  it('fills the form brief through formDefaults', () => {
    expect(briefEnvelope('# Hi')).toEqual({ formDefaults: { brief: '# Hi' } });
  });
});

describe('hoursTimeout', () => {
  it('arms a timeout only when hours are given', () => {
    expect(hoursTimeout(72)).toEqual({ timeout: '72h' });
    expect(hoursTimeout()).toEqual({});
  });
});

describe('projectSignalId', () => {
  it('derives one home signal per project slug', () => {
    expect(projectSignalId('claude-workbench')).toBe('claude-project-claude-workbench');
  });
});

describe('WORKBENCH_PERSONAS', () => {
  it('lets the owner close projects but only watch claude-next', () => {
    const owner = WORKBENCH_PERSONAS.find((persona) => persona.key === 'owner');
    expect(owner?.roles).toContainEqual({ role: 'claude-project', relationship: 'write-all' });
    expect(owner?.roles).toContainEqual({ role: 'claude-next', relationship: 'read-all' });
  });

  it('lets claude only watch the owner queues', () => {
    const claude = WORKBENCH_PERSONAS.find((persona) => persona.key === 'claude');
    const ownerLinks = claude?.roles.filter((link) => link.role.startsWith('owner-'));
    expect(ownerLinks?.every((link) => link.relationship === 'read-all')).toBe(true);
  });
});

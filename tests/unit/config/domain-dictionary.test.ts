import { describe, it, expect } from 'vitest';

import { DOMAIN_DICTIONARY } from '../../../src/config/domain-dictionary';
import { WORKERS } from '../../../src/config/workers';
import { ORG_PROGRAMS_ROLE, ORG_ROLES } from '../../../src/workflows/claude-workbench/types';

const roles = new Set([...ORG_ROLES.map((entry) => entry.role), ORG_PROGRAMS_ROLE]);
const workflows = new Set(WORKERS.map((worker) => worker.workflow.name));

describe('DOMAIN_DICTIONARY', () => {
  it('maps every term to a real role or workflow', () => {
    for (const term of DOMAIN_DICTIONARY.terms ?? []) {
      for (const role of [term.maps_to?.role, ...(term.maps_to?.roles ?? [])].filter(Boolean)) expect(roles.has(role!)).toBe(true);
      if (term.maps_to?.workflow) expect(workflows.has(term.maps_to.workflow)).toBe(true);
      expect(term.guidance.length).toBeGreaterThan(10);
    }
  });

  it('gives every workflow term a kill road and an id convention', () => {
    const workflowTerms = (DOMAIN_DICTIONARY.terms ?? []).filter((term) => term.kind === 'workflow');
    expect(workflowTerms.length).toBeGreaterThanOrEqual(4);
    for (const term of workflowTerms) {
      expect(term.kill_road).toBeTruthy();
      expect(term.id_convention).toBeTruthy();
    }
  });

  it('tells a new agent how to start its day', () => {
    const runbook = DOMAIN_DICTIONARY.runbooks?.find((entry) => entry.name === 'start your day');
    expect(runbook?.steps[0]).toContain('get_user_personas');
    expect(runbook?.steps.some((step) => step.includes('inbox-triage-guide'))).toBe(true);
    expect(runbook?.steps[runbook.steps.length - 1]).toContain('Report to the holder');
  });

  it('lets the agent start its own sweep instead of asking an admin', () => {
    const day = DOMAIN_DICTIONARY.runbooks?.find((entry) => entry.name === 'start your day');
    expect(day?.steps.some((step) => step.includes('naming no holder'))).toBe(true);
    expect(day?.steps.some((step) => step.includes('ask the superadmin'))).toBe(false);
    const sweep = DOMAIN_DICTIONARY.runbooks?.find((entry) => entry.name === 'start a sweep for a holder');
    expect(sweep?.steps[0]).toContain('own inbox');
    expect(sweep?.steps[0]).toContain('data: { source: "slack"');
  });

  it('never asks a holder or their agent to name their own inbox', () => {
    const prefs = DOMAIN_DICTIONARY.runbooks?.find((entry) => entry.name === 'set what your reactions mean');
    expect(prefs?.steps[0]).toContain('data: {}');
    expect(DOMAIN_DICTIONARY.overview).toContain("caller's own inbox");
  });

  it('points the inbox runbook at the triage guide first, then at the holder\'s reactions', () => {
    const runbook = DOMAIN_DICTIONARY.runbooks?.find((entry) => entry.name === 'work the inbox');
    expect(runbook?.steps[0]).toContain('inbox-triage-guide');
    expect(runbook?.steps[1]).toContain('inbox-reactions-<holder>');
    expect(DOMAIN_DICTIONARY.runbooks?.map((entry) => entry.name)).toContain('work a seat');
  });

  it('tells a holder how to set what their reactions mean', () => {
    const runbook = DOMAIN_DICTIONARY.runbooks?.find((entry) => entry.name === 'set what your reactions mean');
    expect(runbook?.steps[0]).toContain('inboxPreferences');
    expect(runbook?.steps.some((step) => step.includes('inbox-reactions-<holder>'))).toBe(true);
    const section = DOMAIN_DICTIONARY.terms?.find((term) => term.term === 'section');
    expect(section?.values).toContain('preferences');
  });
});

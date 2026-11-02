import { describe, it, expect } from 'vitest';

import { BOARD, WORKBENCH_ROLES, holderRoleConfigs } from '../../../../src/workflows/claude-workbench/roles';
import { parseHolder } from '../../../../src/workflows/claude-workbench/types';

const pinsOf = (role: string) => WORKBENCH_ROLES.find((entry) => entry.role === role)!.default_pins!;

describe('workbench role pins', () => {
  it("orders an inbox's pins by what is next", () => {
    const labels = pinsOf('inbox-sam').map((pin) => pin.label);
    expect(labels).toEqual(['Next', 'Back to you', 'Waiting on others', 'FYI']);
    const next = pinsOf('inbox-sam')[0];
    expect(next.badge).toBe(true);
    expect(decodeURIComponent(next.url)).toContain('"stage":"new"');
    expect(decodeURIComponent(next.url)).toContain('"field":"priority"');
  });

  it('gives the agent queue its acts and checks, and a team seat its sections', () => {
    expect(pinsOf('inbox-agent-sam').map((pin) => pin.label)).toEqual(['Acts', 'Checks']);
    expect(pinsOf('engineering-platform').map((pin) => pin.label)).toEqual(['Work', 'Reviews', 'Decisions', 'Gates', 'engineering', 'Programs']);
  });

  it('enforces the shared form on every seat', () => {
    for (const role of WORKBENCH_ROLES) expect(role.enforce_schema).toBe(true);
  });

  it('puts every seat on the boards with the entity it tracks', () => {
    for (const role of WORKBENCH_ROLES) expect(role.ops_visible, role.role).toBe(true);
    const inbox = WORKBENCH_ROLES.find((entry) => entry.role === 'inbox-sam')!;
    expect(inbox).toMatchObject({ entity_facet: 'item', entity_state_source: 'subtype', sla_minutes: BOARD.INBOX_SLA_MINUTES });
    const agent = WORKBENCH_ROLES.find((entry) => entry.role === 'inbox-agent-sam')!;
    expect(agent).toMatchObject({ entity_facet: 'item', entity_state_source: 'subtype', parent_role: 'inbox-sam', sla_minutes: BOARD.AGENT_SLA_MINUTES });
    const team = WORKBENCH_ROLES.find((entry) => entry.role === 'quality')!;
    expect(team).toMatchObject({ entity_facet: 'deliverable', entity_state_source: 'subtype' });
    expect(team.parent_role).toBeUndefined();
    const programs = WORKBENCH_ROLES.find((entry) => entry.role === 'org-programs')!;
    expect(programs).toMatchObject({ entity_facet: 'program', entity_state_source: 'role' });
  });

  it('gives a bound holder the same board dials as a named one', () => {
    const [inbox, agent] = holderRoleConfigs(parseHolder('ana.ruiz@example.com')!);
    expect(inbox).toMatchObject({ ops_visible: true, entity_facet: 'item' });
    expect(agent.parent_role).toBe('inbox-ana-ruiz-at-example-com');
  });
});

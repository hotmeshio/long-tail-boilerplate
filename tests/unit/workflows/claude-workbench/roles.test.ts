import { describe, it, expect } from 'vitest';

import { WORKBENCH_ROLES } from '../../../../src/workflows/claude-workbench/roles';

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
});

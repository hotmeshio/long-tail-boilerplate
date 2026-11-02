import { describe, it, expect } from 'vitest';

import { CLAUDE_BOT_ID, COORDINATOR_ID, SAM_PERSONA, WORKBENCH_BOTS, WORKBENCH_PERSONAS, aiPersonaKey, memberPersonaKey } from '../../../../src/workflows/claude-workbench/personas';
import { ORG_PROGRAMS_ROLE, TEAM_ROLES } from '../../../../src/workflows/claude-workbench/types';

const persona = (key: string) => WORKBENCH_PERSONAS.find((entry) => entry.key === key)!;
const relationship = (key: string, role: string) => persona(key).roles.find((entry) => entry.role === role)?.relationship;

describe('personas', () => {
  it('gives every team role a member persona and an AI persona', () => {
    for (const spec of TEAM_ROLES) {
      expect(relationship(memberPersonaKey(spec.role), spec.role)).toBe('write-all');
      expect(relationship(aiPersonaKey(spec.role), spec.role)).toBe('write-self');
      expect(relationship(memberPersonaKey(spec.role), ORG_PROGRAMS_ROLE)).toBe('read-all');
    }
  });

  it('lets a member read the rest of their domain but not write it', () => {
    expect(relationship(memberPersonaKey('engineering-platform'), 'engineering-lab')).toBe('read-all');
    expect(relationship(memberPersonaKey('engineering-platform'), 'sre')).toBeUndefined();
  });

  it('composes one person\'s persona from their roles', () => {
    const roles = SAM_PERSONA.roles.filter((entry) => entry.relationship === 'write-all').map((entry) => entry.role);
    expect(roles).toEqual(['engineering-execution', 'engineering-lab', 'engineering-platform', 'engineering-leadership', 'inbox-sam', 'inbox-agent-sam']);
  });

  it('seats the example bot in one AI persona and the coordinator on the boards only', () => {
    const claude = WORKBENCH_BOTS.find((bot) => bot.id === CLAUDE_BOT_ID)!;
    expect(claude.personas).toEqual([aiPersonaKey('engineering-platform')]);
    const coordinator = WORKBENCH_BOTS.find((bot) => bot.id === COORDINATOR_ID)!;
    expect(persona(coordinator.personas[0]).roles).toEqual([{ role: ORG_PROGRAMS_ROLE, relationship: 'write-all' }]);
    expect(new Set(WORKBENCH_PERSONAS.map((entry) => entry.key)).size).toBe(WORKBENCH_PERSONAS.length);
  });
});

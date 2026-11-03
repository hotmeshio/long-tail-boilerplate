import { describe, it, expect } from 'vitest';

import { HOLDER_INVOCABLE_WORKFLOWS, agentRoleOf, refusalFor } from '../../../../../src/workflows/claude-workbench/inbox/ownership';

const principal = (roles: string[], roleType = 'member') => ({ lt: { userId: 'u1', principal: { id: 'google:1', type: 'user' as const, displayName: 'Kim Lee', roles, roleType } } });

describe('inbox ownership', () => {
  it('names the two workflows a holder may start', () => {
    expect([...HOLDER_INVOCABLE_WORKFLOWS]).toEqual(['inboxSweep', 'inboxItem', 'inboxPreferences']);
    expect(agentRoleOf('inbox-kim')).toBe('inbox-agent-kim');
  });

  it('trusts a run the engine started itself', () => {
    expect(refusalFor({}, 'inbox-kim')).toBeUndefined();
    expect(refusalFor({ lt: {} }, 'inbox-kim')).toBeUndefined();
  });

  it('lets a holder act for their own inbox through either of their roles', () => {
    expect(refusalFor(principal(['inbox-kim', 'inbox-agent-kim']), 'inbox-kim')).toBeUndefined();
    expect(refusalFor(principal(['inbox-agent-kim']), 'inbox-kim')).toBeUndefined();
  });

  it('lets an admin or superadmin act for any inbox', () => {
    expect(refusalFor(principal(['admin'], 'admin'), 'inbox-kim')).toBeUndefined();
    expect(refusalFor(principal(['superadmin'], 'superadmin'), 'inbox-kim')).toBeUndefined();
  });

  it('refuses a member who names an inbox they do not hold', () => {
    expect(refusalFor(principal(['inbox-ana', 'engineering-platform']), 'inbox-kim')).toContain('does not hold inbox-kim');
  });

  it('refuses a caller it cannot resolve, and a row with no holder', () => {
    expect(refusalFor({ lt: { userId: 'u9' } }, 'inbox-kim')).toContain('could not be resolved');
    expect(refusalFor(principal(['inbox-kim']), undefined)).toContain('needs a holder');
  });
});

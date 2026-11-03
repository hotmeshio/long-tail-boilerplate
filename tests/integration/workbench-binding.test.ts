/**
 * Inbox binding through the HTTP API: an account created with an email in a
 * listed domain gets its two roles, its persona and the assignment on the
 * binder's next pass, without a restart. Runs only when the app's
 * WORKBENCH_INBOX_HOLDERS (read from the environment or .env) lists a domain.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { ApiClient, poll, waitForHealth } from './helpers';
import { PASSWORD, RUN, claimAndResolve, pendingBySubtype } from './hitl-helpers';
import { parseInboxEntries } from '../../src/workflows/claude-workbench/types';

function holdersSetting(): string | undefined {
  if (process.env.WORKBENCH_INBOX_HOLDERS) return process.env.WORKBENCH_INBOX_HOLDERS;
  try {
    const line = readFileSync(resolve(__dirname, '../../.env'), 'utf8').split('\n').find((entry) => entry.startsWith('WORKBENCH_INBOX_HOLDERS='));
    return line?.slice('WORKBENCH_INBOX_HOLDERS='.length).trim();
  } catch {
    return undefined;
  }
}

const [domain] = parseInboxEntries(holdersSetting()).domains;
const local = `bind-${RUN}`;
const email = domain ? `${local}@${domain}` : '';
const persona = domain ? `${local}-at-${domain.replace(/\./g, '-')}` : '';

let api: ApiClient;
let userId: string | undefined;

beforeAll(async () => {
  await waitForHealth();
  api = new ApiClient();
  await api.login('superadmin', PASSWORD);
});

afterAll(async () => {
  if (!userId) return;
  await api.delete(`/api/users/${userId}`).catch(() => undefined);
  await api.delete(`/api/personas/${persona}`).catch(() => undefined);
  for (const role of [`inbox-${persona}`, `inbox-agent-${persona}`]) await api.delete(`/api/roles/${role}`).catch(() => undefined);
});

describe.skipIf(!domain)('inbox binding', () => {
  it('gives a new account in a listed domain its inbox on the next pass', async () => {
    const created = await api.post<any>('/api/users', { external_id: local, email, display_name: 'Binding Test', roles: [{ role: 'member', type: 'member' }] });
    userId = created.data.id;

    const personas = await poll(
      `persona ${persona} bound`,
      async () => {
        const { data } = await api.get<any>(`/api/users/${userId}/personas`);
        const keys: string[] = (data.personas ?? []).map((entry: any) => entry.key);
        return keys.includes(persona) ? data.personas : null;
      },
      60_000,
    );
    const bound = personas.find((entry: any) => entry.key === persona);
    const writes = bound.roles.filter((entry: any) => entry.relationship === 'write-all').map((entry: any) => entry.role).sort();
    expect(writes).toEqual([`inbox-${persona}`, `inbox-agent-${persona}`].sort());

    const schema = await api.get<any>(`/api/roles/inbox-${persona}/schema`);
    expect(schema.data.form_schema?.properties?.triage_decision).toBeDefined();
    const details = await api.get<any>('/api/roles/details');
    const role = (details.data.roles ?? details.data).find((entry: any) => entry.role === `inbox-${persona}`);
    expect(role.default_pins.map((pin: any) => pin.label)).toEqual(['Next', 'Back to you', 'Waiting on others', 'FYI']);
  });

  it('opens the inbox workflows to the bound holder so their own agent can start a sweep', async () => {
    for (const type of ['inboxSweep', 'inboxItem']) {
      const config = await poll(
        `${type} open to inbox-${persona}`,
        async () => {
          const { data } = await api.get<any>(`/api/workflows/${type}/config`);
          const roles: string[] = data.invocation_roles ?? [];
          return roles.includes(`inbox-${persona}`) && roles.includes(`inbox-agent-${persona}`) ? data : null;
        },
        60_000,
      );
      expect(config.invocation_roles).toContain('superadmin');
      expect(config.reset ?? true).toBeTruthy();
    }
  });

  it('parks a "Your reactions" row first, and saves what the holder submits as their own edition', async () => {
    const row = await pendingBySubtype(api, `inbox-${persona}`, 'holder', `inbox-${persona}`, 'preferences', 60_000);
    expect(row.assigned_to).toBe(userId);
    const envelope = typeof row.envelope === 'string' ? JSON.parse(row.envelope) : row.envelope;
    expect(envelope.formDefaults.preferences.onIt).toBe(':eyes:');

    const resolved = await claimAndResolve(api, row.id, {
      preferences: { done: '✅ :github-approve:', approved: ':approved:', onIt: '👀', read: '👍 🔥', dismissed: ':x:', ticket: ':ticket:', readCloses: 'always', replyMeans: 'done', closeFor: ['responsible', 'accountable'] },
    });
    expect(resolved.status).toBeLessThan(300);

    const saved = await poll(
      `org/inbox-reactions-${persona} saved`,
      async () => {
        const { data } = await api.get<any>('/api/knowledge/entry', { domain: 'org', key: `inbox-reactions-${persona}` });
        const entry = data?.data ?? data;
        return entry?.done ? entry : null;
      },
      30_000,
    );
    expect(saved.done).toEqual(['white_check_mark', 'github-approve']);
    expect(saved.read).toEqual(['+1', 'fire']);
    expect(saved).toMatchObject({ readCloses: 'always', replyMeans: 'done', closeFor: ['responsible', 'accountable'] });
  });
});

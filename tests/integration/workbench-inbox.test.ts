/**
 * The inbox through the HTTP API: a hand-added item decided in the holder's
 * inbox, acted on in the AI queue, and closed; and a sweep whose check the AI
 * resolves with one item, which becomes a row in the inbox.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { ApiClient, poll, waitForHealth } from './helpers';
import { PASSWORD, RUN, claimAndResolve, invoke, pendingBySubtype, resultOf, violatedFields } from './hitl-helpers';

const HOLDER = 'inbox-sam';
const AGENT = 'inbox-agent-sam';

let api: ApiClient;

beforeAll(async () => {
  await waitForHealth();
  api = new ApiClient();
  await api.login('superadmin', PASSWORD);
});

const envelopeOf = (row: any) => (typeof row.envelope === 'string' ? JSON.parse(row.envelope) : row.envelope);

describe('inbox item', () => {
  it('decides, acts and closes, refusing a malformed act result', async () => {
    const r = await invoke(api, 'inboxItem', {
      holder: HOLDER,
      kind: 'request',
      category: 'platform',
      need: 'approve',
      raci: 'accountable',
      priority: 2,
      headline: `Approve the rollout ${RUN}`,
      summary: 'Can we roll out the new build tonight? The risk is the migration.',
    });
    expect(r.status).toBe(202);
    const wfId = r.data.workflowId as string;

    const triage = await pendingBySubtype(api, HOLDER, 'item', wfId, 'triage');
    const envelope = envelopeOf(triage);
    expect(envelope.section).toBe('triage');
    expect(envelope.formDefaults.triage).toMatchObject({ decision: 'investigate', category: 'platform' });
    expect(envelope.decision_options.map((o: any) => o.value)).toContain('on-it');

    const decided = await claimAndResolve(api, triage.id, { triage: { decision: 'investigate', guidance: 'How risky is the migration?', need: 'decide' } });
    expect(decided.status).toBe(200);

    const act = await pendingBySubtype(api, AGENT, 'item', wfId, 'investigate');
    expect(envelopeOf(act).formDefaults.brief).toContain('How risky is the migration?');

    const malformed = await claimAndResolve(api, act.id, { act: { outcome: 'done' } });
    expect(malformed.status).toBe(422);
    expect(violatedFields(malformed.data)).toEqual(['act_findings']);

    const reported = await claimAndResolve(api, act.id, { act: { outcome: 'done', findings: 'The migration is additive; low risk. Recommend tonight.' } });
    expect(reported.status).toBe(200);

    const findings = await pendingBySubtype(api, HOLDER, 'item', wfId, 'findings');
    expect(envelopeOf(findings).formDefaults.brief).toContain('low risk');
    expect(findings.metadata.need).toBe('decide');
    expect((await claimAndResolve(api, findings.id, { triage: { decision: 'handle' } })).status).toBe(200);

    const result = await resultOf(api, wfId);
    expect(result).toMatchObject({ itemId: wfId, close: 'handled' });

    const corrections = await api.get<any>('/api/knowledge/entry', { domain: 'org', key: 'inbox-corrections' });
    const items: any[] = corrections.data?.data?.items ?? corrections.data?.items ?? [];
    expect(items.some((entry) => entry.itemId === wfId && entry.to?.need === 'decide')).toBe(true);
  });
});

describe('inbox sweep', () => {
  it('parks a check, admits what the AI found, and parks the item for the holder', async () => {
    const r = await invoke(api, 'inboxSweep', { holder: HOLDER, source: 'slack', intervalMinutes: 60 });
    expect(r.status).toBe(202);
    const wfId = r.data.workflowId as string;

    const check = await poll(`check row of ${wfId}`, async () => {
      const { escalations } = await api.listEscalations({ role: AGENT, status: 'pending' });
      return escalations.find((e: any) => e.workflow_id === wfId && e.subtype === 'check');
    }, 30_000, 1_000);
    const full = await api.get<any>(`/api/escalations/${check.id}`);
    expect(envelopeOf(full.data.escalation ?? full.data)).toMatchObject({ act: 'check', source: 'slack', holder: HOLDER });

    const ts = `${Math.floor(Date.now() / 1000)}.${RUN.slice(-6).padStart(6, '0')}`;
    const resolved = await claimAndResolve(api, check.id, {
      act: {
        outcome: 'done',
        checkedThrough: ts,
        items: [
          { source: 'slack', kind: 'question', category: 'engineering', need: 'answer', raci: 'consulted', priority: 3, headline: `Which branch ${RUN}?`, summary: 'Which branch has the fix?', channelId: `C${RUN}`, messageTs: ts, permalink: 'https://example.com/p', fromName: 'Ana' },
          { kind: 'poem', headline: 'Dropped', summary: 'Not in the vocabulary.' },
        ],
      },
    });
    expect(resolved.status).toBe(200);

    const item = await poll(`item row for channel C${RUN}`, async () => {
      const { escalations } = await api.listEscalations({ role: HOLDER, status: 'pending' });
      return escalations.find((e: any) => e.metadata?.channel === `C${RUN}`);
    }, 30_000, 1_000);
    expect(item.subtype).toBe('triage');
    expect(item.metadata).toMatchObject({ holder: HOLDER, source: 'slack', kind: 'question', need: 'answer' });
    const itemRow = await api.get<any>(`/api/escalations/${item.id}`);
    expect(envelopeOf(itemRow.data.escalation ?? itemRow.data).formDefaults.triage).toMatchObject({ decision: 'reply', replyMode: 'ai-drafts' });

    expect((await claimAndResolve(api, item.id, { triage: { decision: 'dismiss' } })).status).toBe(200);
    const closed = await poll(`item row ${item.id} resolved`, async () => {
      const { data } = await api.get<any>(`/api/escalations/${item.id}`);
      const row = data.escalation ?? data;
      return row.status === 'resolved' ? row : null;
    }, 30_000, 1_000);
    expect(closed.status).toBe('resolved');

    const stopped = await api.send('POST', `/api/workflows/${wfId}/terminate`);
    expect([200, 202]).toContain(stopped.status);
  });
});

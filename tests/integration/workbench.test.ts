/**
 * The workbench through the HTTP API: an ask decided in a role's queue, a
 * deliverable through work and review (and a malformed handoff refused with
 * its fields), and the demo program from invoke to launched with its board.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { ApiClient, poll, waitForHealth } from './helpers';
import { PASSWORD, RUN, claimAndResolve, invoke, pendingByFacet, pendingBySubtype, resultOf, violatedFields } from './hitl-helpers';

const BRIEF = 'A short brief for the integration test. The ask, the context, the links.';
const SUMMARY = 'Done; the note is written and linked below for review.';

let api: ApiClient;

beforeAll(async () => {
  await waitForHealth();
  api = new ApiClient();
  await api.login('superadmin', PASSWORD);
});

async function pendingForWorkflow(role: string, workflowId: string, subtype: string) {
  return poll(`pending ${role}/${subtype} row of ${workflowId}`, async () => {
    const { escalations } = await api.listEscalations({ role, status: 'pending' });
    return escalations.find((e: any) => e.workflow_id === workflowId && e.subtype === subtype);
  }, 30_000, 1_000);
}

describe('ask', () => {
  it('parks one decision in a role and returns the answer', async () => {
    const r = await invoke(api, 'ask', { seat: 'product', headline: `Ask ${RUN}`, brief: BRIEF, options: ['friday', 'monday'] });
    expect(r.status).toBe(202);
    const wfId = r.data.workflowId as string;

    const row = await pendingForWorkflow('product', wfId, 'decide');
    expect(row.metadata.section).toBe('decide');
    expect(row.metadata.raci).toBe('accountable');

    const resolved = await claimAndResolve(api, row.id, { decision: { outcome: 'friday', notes: 'Ship it.' } });
    expect(resolved.status).toBe(200);

    const result = await resultOf(api, wfId);
    expect(result.outcome).toBe('answered');
    expect(result.decision).toMatchObject({ outcome: 'friday', notes: 'Ship it.' });
    expect(typeof result.resolvedBy).toBe('string');
  });
});

describe('deliverable', () => {
  it('runs work and review between the type\'s two roles and refuses a malformed handoff', async () => {
    const key = `note-${RUN}`;
    const r = await invoke(api, 'deliverable', { key, kind: 'demo-note', headline: `Note ${RUN}`, brief: BRIEF });
    expect(r.status).toBe(202);
    const wfId = r.data.workflowId as string;

    const work = await pendingByFacet(api, 'engineering-platform', 'deliverable', key);
    expect(work.subtype).toBe('work');
    expect(work.metadata).toMatchObject({ kind: 'demo-note', raci: 'responsible', round: 1 });

    const malformed = await claimAndResolve(api, work.id, { handoff: { outcome: 'blocked', summary: 'x' } });
    expect(malformed.status).toBe(422);
    expect(violatedFields(malformed.data)).toEqual(['work_blocker_question', 'work_summary']);

    const done = await claimAndResolve(api, work.id, { handoff: { outcome: 'done', summary: SUMMARY, assets: [{ label: 'Note', url: 'https://example.com/note' }] } });
    expect(done.status).toBe(200);

    const review = await pendingBySubtype(api, 'product', 'deliverable', key, 'review');
    expect(review.metadata.raci).toBe('accountable');
    const envelope = typeof review.envelope === 'string' ? JSON.parse(review.envelope) : review.envelope;
    expect(envelope.section).toBe('review');
    expect(envelope.formDefaults.brief).toContain(SUMMARY);

    const accepted = await claimAndResolve(api, review.id, { review: { verdict: 'accepted' } });
    expect(accepted.status).toBe(200);

    const result = await resultOf(api, wfId);
    expect(result).toMatchObject({ key, kind: 'demo-note', verdict: 'accepted', rounds: 1 });
    expect(result.handoff.assets).toEqual([{ label: 'Note', url: 'https://example.com/note' }]);
  });
});

describe('program', () => {
  it('runs the demo template from invoke to launched, with its board', async () => {
    const slug = `demo-${RUN}`;
    const r = await invoke(api, 'program', { program: slug, headline: `Demo ${RUN}`, template: 'demo', brief: BRIEF });
    expect(r.status).toBe(202);
    const wfId = r.data.workflowId as string;

    const board = await pendingByFacet(api, 'org-programs', 'program', slug);
    expect(board.subtype).toBe('program');
    expect(board.signal_key).toBe(`${wfId}-board`);

    const work = await pendingBySubtype(api, 'engineering-platform', 'program', slug, 'work');
    expect(work.metadata).toMatchObject({ phase: 'build', kind: 'demo-note' });
    expect((await claimAndResolve(api, work.id, { handoff: { outcome: 'done', summary: SUMMARY } })).status).toBe(200);

    const review = await pendingBySubtype(api, 'product', 'program', slug, 'review');
    expect((await claimAndResolve(api, review.id, { review: { verdict: 'accepted' } })).status).toBe(200);

    const gate = await pendingBySubtype(api, 'product', 'program', slug, 'gate');
    expect(gate.metadata).toMatchObject({ phase: 'build', raci: 'accountable', template: 'demo' });
    const lookups = await api.get<any>(`/api/escalations/${gate.id}/lookups`);
    const types = lookups.data.lookups.find((entry: any) => entry.key === 'deliverable-types');
    expect(Number.isInteger(types.version) && types.version > 0).toBe(true);
    expect(types.current).not.toBe(true);
    expect((await claimAndResolve(api, gate.id, { gate: { verdict: 'approve' } })).status).toBe(200);

    const result = await resultOf(api, wfId, 60_000);
    expect(result.outcome).toBe('launched');
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]).toMatchObject({ key: 'build', outcome: 'passed', gateRounds: 1 });
    expect(result.phases[0].deliverables[0]).toMatchObject({ kind: 'demo-note', verdict: 'accepted' });

    const closed = await poll(`board ${board.id} resolved`, async () => {
      const { data } = await api.get<any>(`/api/escalations/${board.id}`);
      const row = data.escalation ?? data;
      return row.status === 'resolved' ? row : null;
    }, 30_000, 1_000);
    expect(Number(closed.metadata.accumulate_count)).toBe(1);
    const payload = typeof closed.resolver_payload === 'string' ? JSON.parse(closed.resolver_payload) : closed.resolver_payload;
    expect(payload.closing.outcome).toBe('launched');
  });
});

/**
 * HITL forms: intake and moderation, end to end through the HTTP API.
 *
 *   - the invoke gate validates `data` against each workflow's inputSchema
 *   - code-owned roles carry their versioned form and list schema
 *   - `enforce_schema` rejects a resolve that breaks the form (422) before
 *     any state changes, and a valid resolve reaches the workflow typed
 *   - the certified content review re-runs with the moderator's decision
 *
 * Requires: docker compose up -d --build
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { ApiClient, log, poll } from './helpers';
import { PASSWORD, RUN, invoke, violatedFields, pendingByFacet, claimAndResolve, resultOf } from './hitl-helpers';

let api: ApiClient;

beforeAll(async () => {
  api = new ApiClient();
  await api.login('superadmin', PASSWORD);
});

describe('helloWorkflow invoke form', () => {
  it('rejects a sleep past its bound and starts a valid run', async () => {
    const bad = await invoke(api, 'helloWorkflow', { name: 'Gate', delaySeconds: 61 });
    expect(bad.status).toBe(422);
    expect(violatedFields(bad.data)).toEqual(['delaySeconds']);

    const ok = await invoke(api, 'helloWorkflow', { name: 'Gate', delaySeconds: 0 });
    expect(ok.status).toBe(202);
    const result = await resultOf(api, ok.data.workflowId);
    expect(result.message).toBe('Hello, Gate!');
  });
});

describe('richForm: intake-reviewer', () => {
  const customer = `Intake ${RUN}`;
  let workflowId: string;
  let escalationId: string;

  it('the role carries its form and list page', async () => {
    const { data: form } = await api.get('/api/roles/intake-reviewer/schema');
    expect(form.form_schema.title).toBe('Customer Intake');
    expect(form.form_schema.properties.decision['x-lt-options'].length).toBe(3);
    const { data: list } = await api.get('/api/roles/intake-reviewer/list-schema');
    expect(list.list_schema['x-lt-layout']).toBe('facet-table');
  });

  it('the invoke gate names every violation', async () => {
    const r = await invoke(api, 'richForm', { customer: { name: 'A', email: 'nope' }, contract: { tier: 'platinum' } });
    expect(r.status).toBe(422);
    expect(violatedFields(r.data)).toEqual(['contactEmail', 'customerName', 'tier']);
  });

  it('a valid invoke prefills the reviewer form', async () => {
    const r = await invoke(api, 'richForm', {
      customer: { name: customer, email: 'ops@acme.example' },
      contract: { tier: 'starter', startDate: '2026-11-01', budget: 1200 },
    });
    expect(r.status).toBe(202);
    workflowId = r.data.workflowId;

    const esc = await pendingByFacet(api, 'intake-reviewer', 'customer', customer);
    escalationId = esc.id;
    const envelope = typeof esc.envelope === 'string' ? JSON.parse(esc.envelope) : esc.envelope;
    expect(envelope.formDefaults.contract).toMatchObject({ tier: 'starter', budget: 1200 });
    log('intake', `escalation ${escalationId}`);
  });

  it('enforce_schema rejects a rejection with no reason', async () => {
    const r = await claimAndResolve(api, escalationId, {
      customer: { name: customer, email: 'ops@acme.example' },
      contract: { tier: 'starter', startDate: '2026-11-01' },
      review: { decision: 'reject' },
    });
    expect(r.status).toBe(422);
    expect(violatedFields(r.data)).toEqual(['reject_reason']);
  });

  it('a valid resolve returns the typed outcome', async () => {
    const r = await claimAndResolve(api, escalationId, {
      customer: { name: customer, email: 'ops@acme.example' },
      contract: { tier: 'starter', startDate: '2026-11-01' },
      review: { decision: 'needs-info', missing: ['agreement'] },
    });
    expect(r.status).toBe(200);
    const result = await resultOf(api, workflowId);
    expect(result).toMatchObject({ customerName: customer, decision: 'needs-info', followUp: ['agreement'] });
  });

  it('a pinned edition rides the row as metadata.schema_version', async () => {
    const pinned = `${customer} pinned`;
    const r = await invoke(api, 'richForm', { customer: { name: pinned, email: 'ops@acme.example' }, contract: { tier: 'free' }, formVersion: 1 });
    expect(r.status).toBe(202);
    const esc = await pendingByFacet(api, 'intake-reviewer', 'customer', pinned);
    expect(esc.metadata.schema_version).toBe(1);
    await api.post(`/api/escalations/${esc.id}/cancel`);
    expect(await resultOf(api, r.data.workflowId)).toEqual({ cancelled: true });
  });
});

describe('reviewContent: content-moderator', () => {
  it('auto-approves clean content without a moderator', async () => {
    const r = await invoke(api, 'reviewContent', { contentId: `clean-${RUN}`, contentType: 'article', content: 'A perfectly fine paragraph.' });
    expect(r.status).toBe(202);
    expect(await resultOf(api, r.data.workflowId)).toMatchObject({ status: 'approved' });
  });

  it('escalates flagged content and returns the moderator decision', async () => {
    const contentId = `flagged-${RUN}`;
    const r = await invoke(api, 'reviewContent', { contentId, contentType: 'comment', content: '<b>buy now</b>' });
    expect(r.status).toBe(202);

    const esc = await poll('content-moderator escalation', async () => {
      const { escalations } = await api.listEscalations({ role: 'content-moderator', status: 'pending' });
      return escalations.find((e: any) => e.workflow_id === r.data.workflowId);
    }, 30_000, 1_000);

    const bad = await claimAndResolve(api, esc.id, { moderation: { decision: 'remove', removalReason: 'boring' } });
    expect(bad.status).toBe(422);

    const ok = await claimAndResolve(api, esc.id, { moderation: { decision: 'remove', removalReason: 'spam' } });
    expect(ok.status).toBe(200);
    // Certified: the job result stays the escalation; the re-run's data lands on the task.
    const task = await poll('completed reviewContent task', async () => {
      const { data } = await api.get<any>('/api/tasks', { workflow_id: r.data.workflowId });
      return data.tasks.find((t: any) => t.status === 'completed');
    }, 30_000, 1_000);
    expect(JSON.parse(task.data)).toMatchObject({ contentId, status: 'moderated', decision: 'remove' });
  });
});

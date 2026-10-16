/**
 * Shared steps for the HITL form integration tests: invoke through the
 * schema gate, find a pending row by facet, and walk claim → resolve.
 */

import { expect } from 'vitest';

import { ApiClient, poll } from './helpers';

export const PASSWORD = 'l0ngt@1l';
export const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';

/** A run-unique suffix so reruns against a long-lived DB never collide. */
export const RUN = Date.now().toString(36);

/** Invoke a workflow; returns the HTTP status and body without throwing. */
export function invoke(api: ApiClient, workflowType: string, data: Record<string, unknown>) {
  return api.send('POST', `/api/workflows/${workflowType}/invoke`, { data });
}

/** The fields a 422 names. */
export function violatedFields(body: any): string[] {
  expect(body.code).toBe('schema_validation');
  return (body.violations as { field: string }[]).map((v) => v.field).sort();
}

/** The pending escalation in a role whose metadata carries the facet. */
export function pendingByFacet(api: ApiClient, role: string, key: string, value: string, timeoutMs = 30_000) {
  return poll(`pending ${role} escalation with ${key}=${value}`, async () => {
    const { data } = await api.get<any>('/api/escalations/by-metadata', { key, value, status: 'pending' });
    const rows: any[] = data.escalations ?? data;
    return rows.find((e) => e.role === role);
  }, timeoutMs, 1_000);
}

/** Claim, then resolve; returns the raw resolve response. */
export async function claimAndResolve(api: ApiClient, id: string, resolverPayload: Record<string, unknown>) {
  await api.send('POST', `/api/escalations/${id}/claim`, { durationMinutes: 10 });
  return api.send('POST', `/api/escalations/${id}/resolve`, { resolverPayload });
}

/** The workflow's returned data once it completes. */
export function resultOf(api: ApiClient, workflowId: string, timeoutMs = 30_000) {
  return poll(`result of ${workflowId}`, async () => {
    const r = await api.send('GET', `/api/workflows/${workflowId}/result`);
    return r.status === 200 && r.data?.result?.type === 'return' ? r.data.result.data : null;
  }, timeoutMs, 1_000);
}

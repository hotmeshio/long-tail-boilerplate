/**
 * Integration test helpers — ApiClient and utilities.
 *
 * All interaction with the running Docker app goes through these helpers
 * so test files stay declarative and readable.
 */

import type { ApiResponse } from './types';

// ── Logging ──────────────────────────────────────────────────────────────────

export function log(phase: string, message: string): void {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  console.log(`  [${ts}] [${phase}] ${message}`);
}

// ── Health check ─────────────────────────────────────────────────────────────

export async function waitForHealth(
  baseUrl = 'http://localhost:3030',
  timeoutMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`Health check at ${baseUrl}/health timed out after ${timeoutMs / 1000}s`);
}

// ── ApiClient ────────────────────────────────────────────────────────────────

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl = 'http://localhost:3030') {
    this.baseUrl = baseUrl;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<string> {
    const deadline = Date.now() + 60_000;
    let lastError = '';
    while (Date.now() < deadline) {
      try {
        const { data } = await this.post<{ token: string }>('/api/auth/login', { username, password });
        this.token = data.token;
        return data.token;
      } catch (err: any) {
        lastError = err.message;
        if (!err.message.includes('401')) throw err;
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    throw new Error(`Login failed after 60s: ${lastError}`);
  }

  useToken(token: string): void {
    this.token = token;
  }

  // ── Generic request methods ───────────────────────────────────────────────

  async get<T = any>(path: string, query?: Record<string, string>): Promise<ApiResponse<T>> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }
    const res = await fetch(url, { headers: this.headers() });
    const data = await res.json() as T;
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(data)}`);
    return { status: res.status, data };
  }

  async post<T = any>(path: string, body?: any): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as T;
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
    return { status: res.status, data };
  }

  async put<T = any>(path: string, body?: any): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as T;
    if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${JSON.stringify(data)}`);
    return { status: res.status, data };
  }

  async patch<T = any>(path: string, body?: any): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as T;
    if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${JSON.stringify(data)}`);
    return { status: res.status, data };
  }

  async delete<T = any>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    const data = await res.json() as T;
    if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}: ${JSON.stringify(data)}`);
    return { status: res.status, data };
  }

  // ── YAML workflow lifecycle ───────────────────────────────────────────────

  async deployWorkflow(id: string): Promise<any> {
    const { data } = await this.post(`/api/yaml-workflows/${id}/deploy`);
    return data;
  }

  async invokeWorkflow(id: string, inputData: any, sync = false): Promise<any> {
    const { data } = await this.post(`/api/yaml-workflows/${id}/invoke`, {
      data: inputData,
      sync,
    });
    return data;
  }

  // ── Workflow observation ───────────────────────────────────────────────────

  async getWorkflowStatus(workflowId: string): Promise<any> {
    const { data } = await this.get(`/api/workflows/${workflowId}/status`);
    return data;
  }

  async getWorkflowResult(workflowId: string): Promise<any> {
    const { data } = await this.get(`/api/workflows/${workflowId}/result`);
    return data;
  }

  // ── Escalation management ─────────────────────────────────────────────────

  async listEscalations(query?: Record<string, string>): Promise<{ escalations: any[]; total: number }> {
    const { data } = await this.get('/api/escalations', query);
    return data;
  }

  async claimEscalation(id: string): Promise<any> {
    const { data } = await this.post(`/api/escalations/${id}/claim`);
    return data;
  }

  async resolveEscalation(id: string, resolverPayload: any): Promise<any> {
    const { data } = await this.post(`/api/escalations/${id}/resolve`, { resolverPayload });
    return data;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }
}

// ── Polling utility ─────────────────────────────────────────────────────────

/**
 * Poll until a predicate returns a truthy value, or timeout.
 */
export async function poll<T>(
  label: string,
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 30_000,
  intervalMs = 2_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${label} (${timeoutMs / 1000}s)`);
}

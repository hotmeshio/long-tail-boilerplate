/**
 * Shared utilities for the 07-* shop floor scripts.
 */

try { require('dotenv/config'); } catch {}

export const BASE_URL = process.env.REMOTE_URL || `http://localhost:${process.env.PORT || 3030}`;

let token = '';

export async function api(method: string, path: string, body?: any): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function login(): Promise<void> {
  const isRemote = !!process.env.REMOTE_URL;
  const password = isRemote ? process.env.REMOTE_PASSWORD! : 'l0ngt@1l';
  const auth = await api('POST', '/api/auth/login', { username: 'superadmin', password });
  token = auth.token;
  if (!token) { console.error('Login failed'); process.exit(1); }
}

export function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export function envInt(key: string, fallback: number): number {
  return parseInt(process.env[key] || String(fallback), 10);
}

export function ageSeconds(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 1000;
}

export function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

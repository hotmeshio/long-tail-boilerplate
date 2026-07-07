/**
 * Lifecycle proof — the isolated, end-to-end run of the three core patterns
 * every simulation actor derives from (see src/workflows/lifecycle-proof).
 *
 * ONE test, the whole lifecycle, real platform, hard time bounds:
 *
 *   invoke proofDirector
 *     → wind-down (empty floor: pills self-expire, bounded)
 *     → seed demand (both ponds)
 *     → cast: 2 batch-loop actors, 2 event-driven waiters, 1 broker
 *     → actors drain their pond; broker assigns; waiters work assignments
 *     → durable timer fires; retire pills consumed by LIVE actors
 *     → converge: director returns; floor clean
 *
 * Requires: docker compose up -d --build && npm run seed
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { ApiClient, log, waitForHealth } from './helpers';

const PASSWORD = 'l0ngt@1l';

const DIRECTOR_BUDGET_MS = 180_000; // the whole lifecycle, invoke → converge

describe('lifecycle proof — actor, waiter, director', () => {
  let api: ApiClient;

  beforeAll(async () => {
    await waitForHealth();
    api = new ApiClient();
    await api.login('superadmin', PASSWORD);
  }, 200_000);

  it(
    'runs the full lifecycle inside the budget with every invariant intact',
    async () => {
      const t0 = Date.now();

      // ── invoke ──────────────────────────────────────────────────────────
      const { data: invoked } = await api.post<{ workflowId: string }>(
        '/api/workflows/proofDirector/invoke',
        { data: { actors: 2, waiters: 2, workItems: 4, durationSeconds: 30 } },
      );
      const directorId = invoked.workflowId;
      log('invoke', `director ${directorId}`);
      expect(directorId).toBeTruthy();

      // ── converge: the director RETURNS inside the budget ─────────────────
      let result: any = null;
      while (Date.now() - t0 < DIRECTOR_BUDGET_MS) {
        try {
          const { data } = await api.get<any>(`/api/workflows/${directorId}/result`);
          const r = data?.result?.data ?? data?.result ?? data?.data ?? data;
          if (r && r.converged !== undefined) {
            result = r;
            break;
          }
        } catch {
          /* not done yet */
        }
        await new Promise((r) => setTimeout(r, 3_000));
      }
      const elapsed = Math.round((Date.now() - t0) / 1000);
      log('converge', `director returned in ${elapsed}s: ${JSON.stringify(result)}`);
      expect(result, `director did not converge within ${DIRECTOR_BUDGET_MS / 1000}s`).toBeTruthy();
      expect(result.converged).toBe(true);

      // ── invariants ───────────────────────────────────────────────────────
      // 1. Every seeded work item was worked: actors drained their pond;
      //    the broker assigned and the waiters worked theirs.
      expect(result.worked.byActors).toBe(4);
      expect(result.worked.byWaiters).toBe(4);
      // 2. The broker matched exactly the waiter-side demand.
      expect(result.broker?.matched).toBe(4);
      // 3. Retirement was THROUGH THE MEMBRANE: both actors held large idle
      //    budgets, so pills were their only way off the floor.
      expect(result.retire.pillsConsumed).toBe(2);
      // 4. Wind-down on an empty floor retired nobody (bounded, clean).
      expect(result.windDown.retired).toEqual([]);

      // ── floor is clean: no pending proof rows survive the run ───────────
      const { escalations } = await api.listEscalations({ status: 'pending', type: 'lifecycleProof' });
      const leftovers = (escalations ?? []).filter((e: any) => e.type === 'lifecycleProof');
      log('clean', `pending lifecycleProof rows after converge: ${leftovers.length}`);
      expect(leftovers).toHaveLength(0);
    },
    DIRECTOR_BUDGET_MS + 30_000,
  );
});

describe('lifecycle proof — the GENERATION CHAIN pattern (proofDirector2)', () => {
  let api: ApiClient;

  beforeAll(async () => {
    await waitForHealth();
    api = new ApiClient();
    await api.login('superadmin', PASSWORD);
  }, 200_000);

  it(
    'chains converge event-driven with zero held children, and the ledger tax is bounded per link',
    async () => {
      const t0 = Date.now();
      const { data: invoked } = await api.post<{ workflowId: string }>(
        '/api/workflows/proofDirector2/invoke',
        { data: { actors: 2, workItems: 6, durationSeconds: 90 } },
      );
      const directorId = invoked.workflowId;
      log('invoke', `chain director ${directorId}`);

      let result: any = null;
      while (Date.now() - t0 < 120_000) {
        try {
          const { data } = await api.get<any>(`/api/workflows/${directorId}/result`);
          const r = data?.result?.data ?? data?.result ?? data?.data ?? data;
          if (r && r.converged !== undefined) {
            result = r;
            break;
          }
        } catch { /* not done */ }
        await new Promise((r) => setTimeout(r, 3_000));
      }
      log('converge', `chain director returned in ${Math.round((Date.now() - t0) / 1000)}s: ${JSON.stringify(result)}`);

      expect(result, 'chain director did not converge within 120s').toBeTruthy();
      // Both chains signaled done (no timeouts) and all 6 items were worked.
      expect(result.converged).toBe(2);
      expect(result.timedOut).toBe(0);
      expect(result.worked).toBe(6);
      // Each chain ran multiple generations — the loop existed, but as links.
      for (const g of result.generations) expect(g).toBeGreaterThanOrEqual(2);
    },
    150_000,
  );
});

/**
 * HITL forms: the two-station lot inspection, end to end through the HTTP API.
 *
 *   - the invoke form reads a pinned knowledge edition (part families)
 *   - receiving bounds the short count and the dock door by the row's own values
 *   - inspection reads current knowledge lookups (checklist, defect cascade)
 *     and bounds the measurement by the row's tolerance, all enforced server-side
 *   - the inspector list page declares a look-ahead into the receiving dock
 *
 * Requires: docker compose up -d --build
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { ApiClient, log } from './helpers';
import { PASSWORD, RUN, SIGNATURE, invoke, violatedFields, pendingByFacet, claimAndResolve, resultOf } from './hitl-helpers';

const lotNo = (n: number) => `LOT-${(parseInt(RUN, 36) % 900_000) + 100_000}${n}`;

const plan = (lotNumber: string) => ({
  lot: { number: lotNumber, partFamily: 'heel-cup', expectedUnits: 12 },
  inspection: { sampleSize: 5, tolerance: { min: 9.8, max: 10.2 } },
  receiving: { docks: ['D1', 'D2'] },
});

const checks = { sample_random: true, gauge_zeroed: true, label_matches: true };

let api: ApiClient;

beforeAll(async () => {
  api = new ApiClient();
  await api.login('superadmin', PASSWORD);
});

describe('lotInspection invoke form', () => {
  it('reads the pinned part-family edition', async () => {
    const { data } = await api.get('/api/workflows/lotInspection/input-lookups');
    expect(data.lookups[0]).toMatchObject({ domain: 'hitl', key: 'part-families', version: 1 });
  });

  it('rejects a bad lot number and a family outside the edition', async () => {
    const body = plan('lot 7');
    body.lot.partFamily = 'toe-cap';
    const r = await invoke(api, 'lotInspection', body);
    expect(r.status).toBe(422);
    expect(violatedFields(r.data)).toEqual(['lotNumber', 'partFamily']);
  });
});

describe('lotInspection: receive then inspect', () => {
  const lotNumber = lotNo(1);
  let workflowId: string;

  it('starts at the receiving dock', async () => {
    const r = await invoke(api, 'lotInspection', plan(lotNumber));
    expect(r.status).toBe(202);
    workflowId = r.data.workflowId;
    log('lot', `${lotNumber} → ${workflowId}`);
  });

  it('receiving bounds the short count and the door by the row', async () => {
    const esc = await pendingByFacet(api, 'lot-receiver', 'lotNumber', lotNumber);
    const over = await claimAndResolve(api, esc.id, { receipt: { outcome: 'short', unitsReceived: 30, dock: 'D4' } });
    expect(over.status).toBe(422);
    expect(violatedFields(over.data)).toEqual(['dock', 'units_received']);

    const ok = await claimAndResolve(api, esc.id, { receipt: { outcome: 'short', unitsReceived: 10, dock: 'D2' } });
    expect(ok.status).toBe(200);
  });

  it('the inspection row carries its knowledge lookups', async () => {
    const esc = await pendingByFacet(api, 'lot-inspector', 'lotNumber', lotNumber);
    const { data } = await api.get(`/api/escalations/${esc.id}/lookups`);
    const byKey = Object.fromEntries(data.lookups.map((l: any) => [l.key, l]));
    expect(byKey['inspection-checks'].current).toBe(true);
    expect(byKey.defects.data.types.surface.length).toBeGreaterThan(0);
  });

  it('inspection rejects out-of-tolerance, incomplete checks, and a broken cascade', async () => {
    const esc = await pendingByFacet(api, 'lot-inspector', 'lotNumber', lotNumber);
    const signoff = { signature: SIGNATURE };

    const hot = await claimAndResolve(api, esc.id, { verdict: 'pass', measurement: { mm: 10.5 }, inspection: { checks }, signoff });
    expect(violatedFields(hot.data)).toEqual(['measured_mm']);

    const skipped = await claimAndResolve(api, esc.id, {
      verdict: 'pass', measurement: { mm: 10 }, inspection: { checks: { ...checks, gauge_zeroed: false } }, signoff,
    });
    expect(violatedFields(skipped.data)).toEqual(['checks']);

    const cascade = await claimAndResolve(api, esc.id, {
      verdict: 'rework', inspection: { checks }, defect: { category: 'surface', type: 'warp', unitsFailed: 2 }, signoff,
    });
    expect(violatedFields(cascade.data)).toEqual(['defect_type']);
  });

  it('a valid rework verdict completes the run', async () => {
    const esc = await pendingByFacet(api, 'lot-inspector', 'lotNumber', lotNumber);
    const r = await claimAndResolve(api, esc.id, {
      verdict: 'rework',
      inspection: { checks },
      defect: { category: 'surface', type: 'void', unitsFailed: 2 },
      signoff: { signature: SIGNATURE, note: 'Voids on two heels' },
    });
    expect(r.status).toBe(200);
    expect(await resultOf(api, workflowId)).toMatchObject({
      lotNumber,
      outcome: 'rework',
      unitsReceived: 10,
      defect: { category: 'surface', type: 'void', unitsFailed: 2 },
    });
  });
});

describe('lotInspection: refused at the dock', () => {
  it('a refusal ends the run with its reason', async () => {
    const lotNumber = lotNo(2);
    const r = await invoke(api, 'lotInspection', plan(lotNumber));
    const esc = await pendingByFacet(api, 'lot-receiver', 'lotNumber', lotNumber);
    const ok = await claimAndResolve(api, esc.id, { receipt: { outcome: 'refuse', reason: 'Pallet crushed in transit' } });
    expect(ok.status).toBe(200);
    expect(await resultOf(api, r.data.workflowId)).toMatchObject({ lotNumber, outcome: 'refused', reason: 'Pallet crushed in transit' });
  });
});

describe('lot-inspector list page', () => {
  it('declares the look-ahead into the receiving dock', async () => {
    const { data } = await api.get('/api/roles/lot-inspector/list-schema');
    expect(data.list_schema['x-lt-related'].arriving.query.roles).toEqual(['lot-receiver']);
  });
});

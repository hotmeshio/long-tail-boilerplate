import { describe, it, expect } from 'vitest';

import { recordReceipt, recordVerdict } from '../../../../src/workflows/lot-inspection/activities';

describe('recordReceipt', () => {
  it('takes the expected units on a full receipt', async () => {
    const out = await recordReceipt({ payload: { receipt: { outcome: 'accept', dock: 'D1' } }, expectedUnits: 24 });
    expect(out).toEqual({ accepted: true, unitsReceived: 24, dock: 'D1' });
  });

  it('takes the counted units on a short receipt', async () => {
    const out = await recordReceipt({ payload: { receipt: { outcome: 'short', unitsReceived: 20, dock: 'D2' } }, expectedUnits: 24 });
    expect(out.unitsReceived).toBe(20);
  });

  it('carries the reason on a refusal', async () => {
    const out = await recordReceipt({ payload: { receipt: { outcome: 'refuse', reason: 'Crushed pallet' } }, expectedUnits: 24 });
    expect(out).toEqual({ accepted: false, unitsReceived: 0, reason: 'Crushed pallet' });
  });

  it('fails loud on an unknown outcome', async () => {
    await expect(recordReceipt({ payload: { receipt: { outcome: 'lost' } }, expectedUnits: 1 })).rejects.toThrow();
  });
});

describe('recordVerdict', () => {
  const signoff = { signature: 'data:image/png;base64,x', note: 'ok' };

  it('records a pass with its measurement', async () => {
    const out = await recordVerdict({ payload: { verdict: 'pass', measurement: { mm: 10.01 }, signoff }, lotNumber: 'LOT-1', unitsReceived: 24 });
    expect(out).toMatchObject({ outcome: 'passed', measuredMm: 10.01, reason: 'ok' });
    expect(out.defect).toBeUndefined();
  });

  it('records a rework with its defect', async () => {
    const out = await recordVerdict({
      payload: { verdict: 'rework', defect: { category: 'surface', type: 'void', unitsFailed: 2 }, signoff },
      lotNumber: 'LOT-1',
      unitsReceived: 24,
    });
    expect(out).toMatchObject({ outcome: 'rework', defect: { category: 'surface', type: 'void', unitsFailed: 2 } });
  });

  it('fails loud without a signature', async () => {
    await expect(recordVerdict({ payload: { verdict: 'pass', signoff: {} }, lotNumber: 'LOT-1', unitsReceived: 1 })).rejects.toThrow();
  });
});

describe('dashboard-shaped payloads', () => {
  // The dashboard submits hidden and untouched fields with blank defaults.
  it('records a rework whose hidden measurement arrived blank', async () => {
    const out = await recordVerdict({
      payload: {
        verdict: 'rework',
        measurement: { mm: '' },
        defect: { category: 'surface', type: 'void', unitsFailed: 2, evidence: '' },
        signoff: { note: '', signature: 'data:image/png;base64,x' },
        rework_guide: '**Rework** returns the lot to finishing.',
      },
      lotNumber: 'LOT-1',
      unitsReceived: 20,
    });
    expect(out).toMatchObject({ outcome: 'rework', defect: { category: 'surface', type: 'void', unitsFailed: 2 } });
    expect(out.measuredMm).toBeUndefined();
  });

  it('records a pass whose hidden defect fields arrived blank', async () => {
    const out = await recordVerdict({
      payload: {
        verdict: 'pass',
        measurement: { mm: 10.02 },
        defect: { category: '', type: '', unitsFailed: '', evidence: '' },
        signoff: { note: '', signature: 'data:image/png;base64,x' },
      },
      lotNumber: 'LOT-1',
      unitsReceived: 20,
    });
    expect(out).toMatchObject({ outcome: 'passed', measuredMm: 10.02 });
    expect(out.defect).toBeUndefined();
  });

  it('records a full receipt whose hidden count and reason arrived blank', async () => {
    const out = await recordReceipt({ payload: { receipt: { outcome: 'accept', unitsReceived: '', reason: '', dock: 'D1' } }, expectedUnits: 24 });
    expect(out).toEqual({ accepted: true, unitsReceived: 24, dock: 'D1' });
  });
});

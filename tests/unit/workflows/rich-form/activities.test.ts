import { describe, it, expect } from 'vitest';

import { processIntake } from '../../../../src/workflows/rich-form/activities';

const resolution = {
  customer: { name: 'Acme Widgets LLC', email: 'ops@acme.example' },
  contract: { tier: 'enterprise', startDate: '2026-11-01' },
  review: { decision: 'needs-info', missing: ['agreement', 'tax-form'] },
  $resolution: { escalationId: 'e-1', resolvedBy: 'u-1' },
};

describe('processIntake', () => {
  it('reduces a resolution to the outcome', async () => {
    const out = await processIntake(resolution);
    expect(out).toMatchObject({
      customerName: 'Acme Widgets LLC',
      contactEmail: 'ops@acme.example',
      tier: 'enterprise',
      decision: 'needs-info',
      followUp: ['agreement', 'tax-form'],
    });
  });

  it('lists no follow-up for an approval', async () => {
    const out = await processIntake({ ...resolution, review: { decision: 'approve' } });
    expect(out.followUp).toEqual([]);
  });

  it('fails loud on a payload missing the review', async () => {
    const { review: _review, ...partial } = resolution;
    await expect(processIntake(partial)).rejects.toThrow();
  });
});

describe('dashboard-shaped payloads', () => {
  it('accepts blank optional fields from hidden branches', async () => {
    const out = await processIntake({
      customer: { name: 'Acme', email: 'ops@acme.example', phone: '' },
      contract: { tier: 'starter', startDate: '2026-11-01', budget: '' },
      review: { decision: 'approve', missing: null, reason: '', note: '' },
      attachment: '',
    });
    expect(out).toMatchObject({ decision: 'approve', followUp: [] });
  });
});

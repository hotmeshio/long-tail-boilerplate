import { describe, it, expect, vi } from 'vitest';

vi.mock('@hotmeshio/hotmesh', () => ({ Durable: { workflow: { proxyActivities: () => ({}) } } }));
vi.mock('@hotmeshio/long-tail', () => ({ conditional: vi.fn(), KnowledgeApi: {} }));

import { isStandingSweep, sweepWorkflowId } from '../../../../../src/workflows/claude-workbench/inbox/sweep';

describe('the standing sweep id', () => {
  const base = sweepWorkflowId('inbox-luke-birdeau-at-hikemedical-com', 'slack');

  it('names one sweep per holder and source', () => {
    expect(base).toBe('inboxSweep-inbox-luke-birdeau-at-hikemedical-com-slack');
  });

  it('knows the base and its numbered successors, and nothing else', () => {
    expect(isStandingSweep(base, base)).toBe(true);
    expect(isStandingSweep(`${base}-2`, base)).toBe(true);
    expect(isStandingSweep(`${base}-12`, base)).toBe(true);
    expect(isStandingSweep('inboxSweep-HsLx2lJvbvRLLf1NVyC_lAp', base)).toBe(false);
    expect(isStandingSweep(`${base}-x`, base)).toBe(false);
    expect(isStandingSweep(`${base}-calendar`, base)).toBe(false);
  });
});

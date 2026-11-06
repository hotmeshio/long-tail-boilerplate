import { describe, it, expect, vi, beforeEach } from 'vitest';

const { start, status } = vi.hoisted(() => ({ start: vi.fn(), status: vi.fn() }));

vi.mock('@hotmeshio/hotmesh', () => ({
  Durable: { Client: class { workflow = { start, getHandle: async (_queue: string, _name: string, id: string) => ({ status: () => status(id) }) }; } },
}));

import { startInboxItem, startInboxSweep } from '../../../../../src/workflows/claude-workbench/inbox/activities';
import { INBOX_ITEM_EXPIRE_SECONDS, type ItemSpec } from '../../../../../src/workflows/claude-workbench/inbox/types';

const item: ItemSpec = { holder: 'inbox-sam', source: 'slack', kind: 'question', priority: 3, headline: 'A question', summary: 'Sam is asked something.' };
const workflowId = 'inbox-inbox-sam-slack-c1-1793827396-543819';

describe('startInboxItem', () => {
  beforeEach(() => {
    start.mockReset();
  });

  it('starts the item under its source id on the workbench queue', async () => {
    start.mockResolvedValue({});
    await expect(startInboxItem({ workflowId, item })).resolves.toEqual({ started: true });
    expect(start).toHaveBeenCalledWith({
      taskQueue: 'claude-workbench',
      workflowName: 'inboxItem',
      workflowId,
      entity: 'inboxItem',
      args: [{ data: item, metadata: {} }],
      expire: INBOX_ITEM_EXPIRE_SECONDS,
    });
  });

  it('reports a taken id as not started instead of failing', async () => {
    start.mockImplementation(async () => {
      throw new Error(`Duplicate job: ${workflowId}`);
    });
    await expect(startInboxItem({ workflowId, item })).resolves.toEqual({ started: false });
  });

  it('rethrows any other error so the activity retries', async () => {
    start.mockImplementation(async () => {
      throw new Error('connection refused');
    });
    await expect(startInboxItem({ workflowId, item })).rejects.toThrow('connection refused');
  });
});

describe('startInboxSweep', () => {
  beforeEach(() => {
    start.mockReset();
    status.mockReset();
  });

  const base = 'inboxSweep-inbox-sam-slack';
  const sweep = { holder: 'inbox-sam', source: 'slack' as const, intervalMinutes: 15 };
  const jobs = (states: Record<string, number>) => status.mockImplementation(async (id: string) => {
    if (id in states) return states[id];
    throw new Error(`Job ${id} not found`);
  });

  it('starts the base id with the caller metadata when no sweep ever ran', async () => {
    jobs({});
    start.mockResolvedValue({});
    await expect(startInboxSweep({ base, sweep, metadata: { source: 'mcp' } })).resolves.toEqual({ workflowId: base, started: true });
    expect(start).toHaveBeenCalledWith({ taskQueue: 'claude-workbench', workflowName: 'inboxSweep', workflowId: base, entity: 'inboxSweep', args: [{ data: sweep, metadata: { source: 'mcp' } }] });
  });

  it('starts nothing while a sweep runs', async () => {
    jobs({ [base]: -999999998, [`${base}-2`]: 1 });
    await expect(startInboxSweep({ base, sweep, metadata: {} })).resolves.toEqual({ workflowId: `${base}-2`, started: false });
    expect(start).not.toHaveBeenCalled();
  });

  it('moves past ended runs, whose records still hold their ids', async () => {
    jobs({ [base]: 0, [`${base}-2`]: -999999998 });
    start.mockResolvedValue({});
    await expect(startInboxSweep({ base, sweep, metadata: {} })).resolves.toEqual({ workflowId: `${base}-3`, started: true });
  });

  it('reports a lost race for the free id as not started', async () => {
    jobs({});
    start.mockImplementation(async () => {
      throw new Error(`Duplicate job: ${base}`);
    });
    await expect(startInboxSweep({ base, sweep, metadata: {} })).resolves.toEqual({ workflowId: base, started: false });
  });
});

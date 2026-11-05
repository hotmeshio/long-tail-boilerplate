import { describe, it, expect, vi, beforeEach } from 'vitest';

const { start } = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock('@hotmeshio/hotmesh', () => ({
  Durable: { Client: class { workflow = { start }; } },
}));

import { startInboxItem } from '../../../../../src/workflows/claude-workbench/inbox/activities';
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

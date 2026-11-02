/**
 * inboxSweep: the standing check of one source for one holder. Each gate
 * parks one check row in the AI's queue carrying the watermark; the AI
 * resolves it with what it found and how far it read; each item starts its
 * own inboxItem (ids derive from the source, so a repeat is a no-op); the
 * sweep rests, then checks again. After a bounded number of checks it
 * continues as a new generation.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { parseAnswer } from '../contracts';
import { CLAUDE_WORKBENCH_QUEUE } from '../types';
import * as activities from './activities';
import { admit, itemWorkflowId, laterWatermark } from './admission';
import { parseAct } from './contracts';
import { checkRow } from './rows';
import { INBOX_CHECKS_PER_LINK, INBOX_CHECK_MAX_ITEMS, INBOX_DEFAULT_INTERVAL_MINUTES, INBOX_DEFAULT_LOOKBACK_HOURS, type ItemSpec, type SweepInput } from './types';

const { readInboxVocabulary, watermarkHoursAgo, holderAccount } = Durable.workflow.proxyActivities<typeof activities>({ activities });

const ITEM_WORKFLOW = 'inboxItem';

/** Start one item; a duplicate id means it already exists, which is the point. */
async function startItem(item: ItemSpec): Promise<boolean> {
  try {
    await Durable.workflow.startChild({
      taskQueue: CLAUDE_WORKBENCH_QUEUE,
      workflowName: ITEM_WORKFLOW,
      workflowId: itemWorkflowId(item),
      args: [{ data: item, metadata: {} }],
    });
    return true;
  } catch (err) {
    if (Durable.workflow.didInterrupt(err)) throw err;
    if (/duplicate/i.test(String((err as Error)?.message ?? err))) return false;
    throw err;
  }
}

export async function inboxSweep(envelope: LTEnvelope): Promise<{ type: 'return'; data: SweepInput | { cancelled: true } }> {
  const { workflowId } = Durable.workflow.workflowInfo();
  const input = envelope.data as SweepInput;
  const generation = input.generation ?? 0;
  const interval = input.intervalMinutes ?? INBOX_DEFAULT_INTERVAL_MINUTES;
  const max = input.maxItems ?? INBOX_CHECK_MAX_ITEMS;
  let watermark = input.watermark ?? (await watermarkHoursAgo({ hours: input.lookbackHours ?? INBOX_DEFAULT_LOOKBACK_HOURS })).watermark;
  let admitted = input.admitted ?? 0;
  const assignee = input.assignee ?? (await holderAccount({ holder: input.holder })).userId;

  for (let gate = 0; gate < INBOX_CHECKS_PER_LINK; gate++) {
    const answer = parseAnswer(await conditional<Record<string, unknown>>(`${workflowId}-g${generation}-c${gate}`, checkRow({ ...input, maxItems: max }, watermark, assignee)), parseAct);
    if (answer === null) return { type: 'return', data: { cancelled: true } };
    if (answer !== false && answer.outcome === 'done') {
      const vocabulary = await readInboxVocabulary();
      const items = admit(answer.items ?? [], vocabulary, { holder: input.holder, source: input.source }, max);
      for (const item of items) if (await startItem(item)) admitted += 1;
      watermark = laterWatermark(watermark, answer.checkedThrough);
    }
    await Durable.workflow.sleep(`${interval} minutes`);
  }

  const next: SweepInput = { ...input, watermark, generation: generation + 1, admitted, assignee };
  await Durable.workflow.continueAsNew({ data: next, metadata: envelope.metadata ?? {} });
  return { type: 'return', data: next };
}

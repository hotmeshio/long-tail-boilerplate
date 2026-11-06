/**
 * inboxSweep: the standing check of one source for one holder. Each gate
 * parks one check row in the AI's queue carrying the watermark; the AI
 * resolves it with what it found and how far it read; each item starts its
 * own inboxItem (ids derive from the source, so a repeat is a no-op); the
 * sweep rests, then checks again. After a bounded number of checks it
 * continues as a new generation.
 *
 * One sweep per holder and source: a run under any other id starts the
 * standing one (`inboxSweep-<holder>-<source>`, numbered after a stop) and
 * returns, so starting it again while it runs is a no-op.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { parseAnswer } from '../contracts';
import * as activities from './activities';
import { admit, itemWorkflowId, laterWatermark } from './admission';
import { parseAct } from './contracts';
import { holderFor, refusalFor } from './ownership';
import { checkRow } from './rows';
import { INBOX_CHECKS_PER_LINK, INBOX_CHECK_MAX_ITEMS, INBOX_DEFAULT_INTERVAL_MINUTES, INBOX_DEFAULT_LOOKBACK_HOURS, type SweepInput } from './types';

const { readInboxVocabulary, watermarkHoursAgo, holderAccount, startInboxItem, startInboxSweep } = Durable.workflow.proxyActivities<typeof activities>({ activities });

/** The standing sweep's base id for a holder and source. */
export function sweepWorkflowId(holder: string, source: string): string {
  return `inboxSweep-${holder}-${source}`;
}

/** Whether a run is the standing sweep: the base id, or the base numbered after a stop. */
export function isStandingSweep(workflowId: string, base: string): boolean {
  return workflowId === base || (workflowId.startsWith(`${base}-`) && /^\d+$/.test(workflowId.slice(base.length + 1)));
}

type SweepReturn = SweepInput | { cancelled: true } | { refused: string } | { sweep: string; started: boolean };

export async function inboxSweep(envelope: LTEnvelope): Promise<{ type: 'return'; data: SweepReturn }> {
  const { workflowId } = Durable.workflow.workflowInfo();
  const { assignee, ...named } = envelope.data as SweepInput;
  const input: SweepInput = { ...named, holder: holderFor(envelope, named.holder) ?? '' };
  const refused = refusalFor(envelope, input.holder || undefined) ?? (input.holder ? undefined : 'Name the inbox to sweep.');
  if (refused) return { type: 'return', data: { refused } };
  const base = sweepWorkflowId(input.holder, input.source);
  if (!isStandingSweep(workflowId, base)) {
    const { workflowId: sweep, started } = await startInboxSweep({ base, sweep: input, metadata: envelope.metadata ?? {} });
    return { type: 'return', data: { sweep, started } };
  }
  const generation = input.generation ?? 0;
  const interval = input.intervalMinutes ?? INBOX_DEFAULT_INTERVAL_MINUTES;
  const max = input.maxItems ?? INBOX_CHECK_MAX_ITEMS;
  let watermark = input.watermark ?? (await watermarkHoursAgo({ hours: input.lookbackHours ?? INBOX_DEFAULT_LOOKBACK_HOURS })).watermark;
  let admitted = input.admitted ?? 0;
  // Unused; kept so runs started when rows were pre-assigned replay the same sequence.
  if (assignee === undefined) await holderAccount({ holder: input.holder });

  for (let gate = 0; gate < INBOX_CHECKS_PER_LINK; gate++) {
    const answer = parseAnswer(await conditional<Record<string, unknown>>(`${workflowId}-g${generation}-c${gate}`, checkRow({ ...input, maxItems: max }, watermark)), parseAct);
    if (answer === null) return { type: 'return', data: { cancelled: true } };
    if (answer !== false && answer.outcome === 'done') {
      const vocabulary = await readInboxVocabulary();
      const items = admit(answer.items ?? [], vocabulary, { holder: input.holder, source: input.source }, max);
      for (const item of items) if ((await startInboxItem({ workflowId: itemWorkflowId(item), item })).started) admitted += 1;
      watermark = laterWatermark(watermark, answer.checkedThrough);
    }
    await Durable.workflow.sleep(`${interval} minutes`);
  }

  const next: SweepInput = { ...input, watermark, generation: generation + 1, admitted };
  await Durable.workflow.continueAsNew({ data: next, metadata: envelope.metadata ?? {} });
  return { type: 'return', data: next };
}

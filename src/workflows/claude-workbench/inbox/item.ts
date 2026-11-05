/**
 * inboxItem: one thing that needs a holder, from arrival to close. Each round
 * parks one row: a decision in the holder's inbox or an act in the AI's
 * queue. The routing is steps.ts; this workflow only parks what it names,
 * and after a bounded number of rounds continues as a new generation.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { parseAnswer } from '../contracts';
import * as activities from './activities';
import { readItem } from './admission';
import { parseAct, parseTriage } from './contracts';
import { holderFor, refusalFor } from './ownership';
import { actRow, decideRow } from './rows';
import { actFailed, afterAct, afterTriage, openingStep, reclassified } from './steps';
import {
  INBOX_ROUNDS_PER_LINK,
  ITEM_CLOSE,
  type InboxAct,
  type InboxView,
  type ItemContext,
  type ItemResult,
  type ItemSpec,
  type ItemState,
  type Next,
} from './types';
import { STARTER_VOCABULARY } from './vocabulary';

const { readInboxVocabulary, recordCorrection, holderAccount } = Durable.workflow.proxyActivities<typeof activities>({ activities });

type Return = { type: 'return'; data: ItemResult };

function isState(data: unknown): data is { state: ItemState } {
  return typeof data === 'object' && data !== null && 'state' in data;
}

/** The inbox the envelope names, on a first start or a continuation. */
function holderOf(data: unknown): string | undefined {
  if (isState(data)) return data.state.item.holder;
  return (data as Partial<ItemSpec> | undefined)?.holder;
}

/** A first start carries the item; a continuation carries the state. */
async function stateOf(envelope: LTEnvelope, workflowId: string, holder: string | undefined): Promise<ItemState | undefined> {
  if (isState(envelope.data)) return envelope.data.state;
  const raw = envelope.data as Partial<ItemSpec>;
  const vocabulary = raw.kind && STARTER_VOCABULARY.kinds.includes(raw.kind) ? STARTER_VOCABULARY : await readInboxVocabulary();
  const item = readItem({ ...raw, holder }, vocabulary, { holder: holder ?? '', source: raw.source ?? 'manual' });
  if (!item || !item.holder) return undefined;
  const { userId } = await holderAccount({ holder: item.holder });
  return { itemId: workflowId, item, assignee: userId, step: openingStep(), context: {}, generation: 0 };
}

/** A re-filing is kept as a correction and applied to the item before routing. */
async function refile(state: ItemState, triage: ReturnType<typeof parseTriage>, signalId: string): Promise<ItemSpec> {
  const change = reclassified(state.item, triage);
  if (!change) return state.item;
  await recordCorrection({ itemId: state.itemId, signalId, headline: state.item.headline, kind: state.item.kind, from: change.from, to: change.to });
  return { ...state.item, ...change.to };
}

async function awaitDecision(state: ItemState, view: InboxView, signalId: string): Promise<{ next: Next; item: ItemSpec }> {
  const answer = parseAnswer(await conditional<Record<string, unknown>>(signalId, decideRow(state.itemId, view, state.item, state.context, state.assignee)), parseTriage);
  if (answer === null) return { next: { step: { kind: 'done', close: ITEM_CLOSE.CANCELLED }, context: state.context }, item: state.item };
  if (answer === false) return { next: { step: { kind: 'decide', view }, context: state.context }, item: state.item };
  const item = await refile(state, answer, signalId);
  return { next: afterTriage(view, answer, state.context), item };
}

async function awaitAct(state: ItemState, name: InboxAct, signalId: string): Promise<Next> {
  if (name === 'check') return actFailed(state.context, 'A check is not an item act.');
  const answer = parseAnswer(await conditional<Record<string, unknown>>(signalId, actRow(state.itemId, name, state.item, state.context, state.assignee)), parseAct);
  if (answer === null) return actFailed(state.context, `The ${name} act was cancelled.`);
  if (answer === false) return actFailed(state.context, `The ${name} act was not done within a day.`);
  return afterAct(name, answer, state.context);
}

async function runStep(state: ItemState, signalId: string): Promise<ItemState> {
  if (state.step.kind === 'decide') {
    const { next, item } = await awaitDecision(state, state.step.view, signalId);
    return { ...state, item, step: next.step, context: next.context };
  }
  if (state.step.kind === 'act') {
    const next = await awaitAct(state, state.step.act, signalId);
    return { ...state, step: next.step, context: next.context };
  }
  return state;
}

export async function inboxItem(envelope: LTEnvelope): Promise<Return> {
  const { workflowId } = Durable.workflow.workflowInfo();
  const holder = holderFor(envelope, holderOf(envelope.data));
  const refused = refusalFor(envelope, holder);
  if (refused) return { type: 'return', data: { itemId: workflowId, refused } };
  let state = await stateOf(envelope, workflowId, holder);
  if (!state) return { type: 'return', data: { itemId: workflowId, refused: 'The item needs a holder, a known kind, a headline and a summary.' } };

  for (let round = 0; round < INBOX_ROUNDS_PER_LINK && state.step.kind !== 'done'; round++) {
    state = await runStep(state, `${workflowId}-g${state.generation}-r${round}`);
  }
  if (state.step.kind === 'done') return { type: 'return', data: { itemId: state.itemId, close: state.step.close } };

  const next: ItemState = { ...state, generation: state.generation + 1 };
  await Durable.workflow.continueAsNew({ data: { state: next }, metadata: envelope.metadata ?? {} });
  return { type: 'return', data: { itemId: state.itemId, continued: next.generation } };
}

export type { ItemContext };

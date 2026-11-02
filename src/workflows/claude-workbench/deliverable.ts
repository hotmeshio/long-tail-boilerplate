/**
 * deliverable: one piece of work produced by one role and reviewed by
 * another. Each round parks a work row in the producer's queue; a blocked
 * handoff parks a decide row in the reviewer's queue, any other handoff a
 * review row. Acceptance ends it; changes or a decision start the next
 * round with the answer in the brief. Inside a program, the result joins
 * the program's board.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import * as activities from './activities';
import { reviewBrief, workBrief, type RoundNote } from './brief';
import { parseAnswer, parseDecision, parseHandoff, parseReview } from './contracts';
import { aiAssignment, roundSignal, rowFacets, sectionEnvelope } from './facets';
import { orgLookups } from './org';
import { CLAUDE_BOT_ID } from './personas';
import { exhaustedVerdict, routeDecision, routeReview, routeWork, type FollowRoute } from './steps';
import {
  BLOCKED_DECISIONS,
  DEFAULT_MAX_ROUNDS,
  PRIORITY,
  RACI,
  ROW_TIMEOUT,
  ROW_TYPE,
  SECTION,
  type DeliverableInput,
  type DeliverableResult,
  type DeliverableVerdict,
  type Handoff,
} from './types';

const { recordDeliverable, readDeliverableType } = Durable.workflow.proxyActivities<typeof activities>({ activities });

const WORKFLOW_TYPE = 'deliverable';

function rowBase(input: DeliverableInput, seat: string, section: (typeof SECTION)[keyof typeof SECTION], raci: string, round: number) {
  return {
    type: ROW_TYPE,
    subtype: section,
    role: seat,
    workflowType: WORKFLOW_TYPE,
    timeout: ROW_TIMEOUT,
    metadata: rowFacets({ seat, section, raci, round, program: input.program, phase: input.phase, deliverable: input.key, kind: input.kind, ai: input.ai }),
    ...(input.pins ? { lookups: orgLookups(input.pins) } : {}),
  };
}

async function parkWork(input: DeliverableInput, round: number, notes: RoundNote[], wfId: string) {
  const answer = await conditional<Record<string, unknown>>(roundSignal(wfId, round, SECTION.WORK), {
    ...rowBase(input, input.producer, SECTION.WORK, RACI.RESPONSIBLE, round),
    priority: PRIORITY.WORK,
    description: input.headline,
    envelope: sectionEnvelope(SECTION.WORK, workBrief(input.brief, notes)),
    ...aiAssignment(input.ai, CLAUDE_BOT_ID),
  });
  return parseAnswer(answer, parseHandoff);
}

async function parkDecision(input: DeliverableInput, round: number, handoff: Handoff, wfId: string) {
  const answer = await conditional<Record<string, unknown>>(roundSignal(wfId, round, SECTION.DECIDE), {
    ...rowBase(input, input.reviewer, SECTION.DECIDE, RACI.ACCOUNTABLE, round),
    priority: PRIORITY.DECIDE,
    description: `Blocked: ${input.headline}`.slice(0, 60),
    envelope: sectionEnvelope(SECTION.DECIDE, reviewBrief(input.headline, round, handoff), { decision_options: [...BLOCKED_DECISIONS] }),
  });
  return parseAnswer(answer, parseDecision);
}

async function parkReview(input: DeliverableInput, round: number, handoff: Handoff, wfId: string) {
  const answer = await conditional<Record<string, unknown>>(roundSignal(wfId, round, SECTION.REVIEW), {
    ...rowBase(input, input.reviewer, SECTION.REVIEW, RACI.ACCOUNTABLE, round),
    priority: PRIORITY.REVIEW,
    description: `Review: ${input.headline}`.slice(0, 60),
    envelope: sectionEnvelope(SECTION.REVIEW, reviewBrief(input.headline, round, handoff)),
  });
  return parseAnswer(answer, parseReview);
}

/** One round: work, then the reviewer's decision or verdict. */
async function runRound(input: DeliverableInput, round: number, notes: RoundNote[], wfId: string): Promise<FollowRoute> {
  const work = routeWork(await parkWork(input, round, notes, wfId));
  if (work.kind === 'cancelled' || work.kind === 'expired') return work;
  if (work.kind === 'blocked') return routeDecision(await parkDecision(input, round, work.handoff, wfId), round, work.handoff);
  return routeReview(await parkReview(input, round, work.handoff, wfId), round, work.handoff);
}

async function finish(input: DeliverableInput, verdict: DeliverableVerdict, rounds: number, handoff?: Handoff): Promise<{ type: 'return'; data: DeliverableResult }> {
  if (input.programSignal) {
    const item = { key: input.key, kind: input.kind, verdict, summary: handoff?.summary ?? verdict, round: rounds };
    await recordDeliverable({ signalKey: input.programSignal, item });
  }
  return { type: 'return', data: { key: input.key, kind: input.kind, verdict, rounds, handoff } };
}

/** A program fills these from its pinned type; a standalone deliverable takes them from the type in force. */
async function withTypeDefaults(input: DeliverableInput): Promise<DeliverableInput> {
  if (input.producer && input.reviewer && input.ai) return input;
  const type = await readDeliverableType({ kind: input.kind });
  return { ...input, producer: input.producer ?? type.producer, reviewer: input.reviewer ?? type.reviewer, ai: input.ai ?? type.ai };
}

export async function deliverable(envelope: LTEnvelope): Promise<{ type: 'return'; data: DeliverableResult }> {
  const input = await withTypeDefaults(envelope.data as DeliverableInput);
  const { workflowId } = Durable.workflow.workflowInfo();
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const notes: RoundNote[] = [];
  let lastExpired = false;

  for (let round = 1; round <= maxRounds; round++) {
    const route = await runRound(input, round, notes, workflowId);
    if (route.kind === 'cancelled') return finish(input, 'cancelled', round);
    if (route.kind === 'dropped') return finish(input, 'dropped', round);
    if (route.kind === 'accepted') return finish(input, 'accepted', round, route.handoff);
    lastExpired = route.kind === 'expired';
    notes.push(route.kind === 'expired' ? { round, expired: true } : route.note);
  }
  const last = [...notes].reverse().find((note) => note.handoff)?.handoff;
  return finish(input, exhaustedVerdict(lastExpired), maxRounds, last);
}

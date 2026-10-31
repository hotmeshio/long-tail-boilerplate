/**
 * agentWork: one piece of work carried across agents and sessions.
 *
 * Each round parks an `agent-work` escalation whose brief holds the ask and
 * every earlier round's handoff. The claim is the agent's lease. A blocked
 * handoff parks an `owner-decide` escalation; any other handoff parks an
 * `agent-review` escalation for a different agent. Approval ends the piece;
 * requested changes start the next round. Inside a workstream, the result
 * joins the workstream's row.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import * as activities from './activities';
import { reviewBrief, workBrief } from './brief';
import type { RoundNote } from './brief';
import { briefEnvelope } from '../claude-workbench/facets';
import { OWNER_DECIDE_ROLE } from '../claude-workbench/types';
import { COORDINATOR_ID } from './principals';
import { AGENT_CREW_WORKFLOWS, AGENT_REVIEW_ROLE, AGENT_WORK_ROLE, DEFAULT_MAX_ROUNDS } from './types';
import type { AgentWorkInput, AgentWorkResult, Handoff, OwnerAnswer, PieceVerdict, Review } from './types';
import { pieceFacets, workstreamSignalId } from './facets';

const { recordPiece } = Durable.workflow.proxyActivities<typeof activities>({ activities });

const WORK_PRIORITY = 2;
const REVIEW_PRIORITY = 2;
const OWNER_PRIORITY = 1;

type RoundOutcome = { kind: 'cancelled' } | { kind: 'approved'; handoff: Handoff } | { kind: 'again'; note: RoundNote };

async function parkWork(input: AgentWorkInput, round: number, notes: RoundNote[], workflowId: string) {
  return conditional<{ handoff: Handoff }>(`work-${workflowId}-r${round}`, {
    role: AGENT_WORK_ROLE,
    type: 'agent-crew',
    subtype: AGENT_WORK_ROLE,
    priority: WORK_PRIORITY,
    description: input.headline,
    workflowType: AGENT_CREW_WORKFLOWS.AGENT_WORK,
    metadata: pieceFacets(input, AGENT_WORK_ROLE, round),
    envelope: briefEnvelope(workBrief(input.brief, notes)),
  });
}

async function askOwner(input: AgentWorkInput, round: number, handoff: Handoff, workflowId: string) {
  return conditional<OwnerAnswer>(`owner-${workflowId}-r${round}`, {
    role: OWNER_DECIDE_ROLE,
    type: 'agent-crew',
    subtype: 'blocked',
    priority: OWNER_PRIORITY,
    description: `Blocked: ${input.headline}`.slice(0, 60),
    workflowType: AGENT_CREW_WORKFLOWS.AGENT_WORK,
    metadata: pieceFacets(input, OWNER_DECIDE_ROLE, round),
    envelope: briefEnvelope(reviewBrief(input.headline, round, handoff)),
  });
}

async function parkReview(input: AgentWorkInput, round: number, handoff: Handoff, workflowId: string) {
  return conditional<{ review: Review }>(`review-${workflowId}-r${round}`, {
    role: AGENT_REVIEW_ROLE,
    type: 'agent-crew',
    subtype: AGENT_REVIEW_ROLE,
    priority: REVIEW_PRIORITY,
    description: `Review: ${input.headline}`.slice(0, 60),
    workflowType: AGENT_CREW_WORKFLOWS.AGENT_WORK,
    metadata: pieceFacets(input, AGENT_REVIEW_ROLE, round),
    envelope: briefEnvelope(reviewBrief(input.headline, round, handoff)),
  });
}

async function runRound(input: AgentWorkInput, round: number, notes: RoundNote[], workflowId: string): Promise<RoundOutcome> {
  const work = await parkWork(input, round, notes, workflowId);
  if (!work) return { kind: 'cancelled' };
  const { handoff } = work;

  if (handoff.outcome === 'blocked') {
    const ownerAnswer = await askOwner(input, round, handoff, workflowId);
    if (!ownerAnswer) return { kind: 'cancelled' };
    return { kind: 'again', note: { round, handoff, ownerAnswer } };
  }

  const verdict = await parkReview(input, round, handoff, workflowId);
  if (!verdict) return { kind: 'cancelled' };
  if (verdict.review.verdict === 'approved') return { kind: 'approved', handoff };
  return { kind: 'again', note: { round, handoff, review: verdict.review } };
}

async function finish(input: AgentWorkInput, verdict: PieceVerdict, rounds: number, handoff?: Handoff): Promise<{ type: 'return'; data: AgentWorkResult }> {
  if (input.workstream) {
    const item = { key: input.key, verdict, summary: handoff?.summary ?? verdict, branch: handoff?.branch, pr: handoff?.pr };
    await recordPiece({ signalKey: workstreamSignalId(input.workstream), item, coordinatorId: COORDINATOR_ID });
  }
  return { type: 'return', data: { key: input.key, verdict, rounds, handoff } };
}

export async function agentWork(envelope: LTEnvelope): Promise<{ type: 'return'; data: AgentWorkResult }> {
  const input = envelope.data as AgentWorkInput;
  const { workflowId } = Durable.workflow.workflowInfo();
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const notes: RoundNote[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    const outcome = await runRound(input, round, notes, workflowId);
    if (outcome.kind === 'cancelled') return finish(input, 'cancelled', round);
    if (outcome.kind === 'approved') return finish(input, 'approved', round, outcome.handoff);
    notes.push(outcome.note);
  }
  return finish(input, 'rounds-exhausted', maxRounds, notes[notes.length - 1]?.handoff);
}

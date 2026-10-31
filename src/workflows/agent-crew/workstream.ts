/**
 * workstream: one goal, carried across agents and sessions.
 *
 * 1. Plan: an `agent-plan` escalation; the planner breaks the goal into pieces.
 * 2. Start: one `agentWork` child per piece, each carrying the `workstream` facet.
 * 3. Collect: an open accumulator row in `workstream`, sized to the pieces; each
 *    finished piece joins it, and the last one wakes this wait.
 * 4. Sign off: an `owner-review` escalation whose brief tables every piece.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional, conditionalAccumulator } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { digestMarkdown } from './brief';
import { workstreamSignalId } from './facets';
import { briefEnvelope } from '../claude-workbench/facets';
import { OWNER_REVIEW_ROLE } from '../claude-workbench/types';
import { AGENT_CREW_QUEUE, AGENT_CREW_WORKFLOWS, AGENT_PLAN_ROLE, WORKSTREAM_ROLE } from './types';
import type { Piece, PieceItem, WorkstreamInput } from './types';

const PLAN_PRIORITY = 2;
const ROW_PRIORITY = 4;
const SIGNOFF_PRIORITY = 2;

interface WorkstreamResult {
  project: string;
  outcome: 'signed-off' | 'cancelled';
  pieces: PieceItem[];
  signoff?: Record<string, unknown>;
}

function rowFacets(input: WorkstreamInput, kind: string, workstream: string) {
  return { project: input.project, kind, workstream, ...(input.repo ? { repo: input.repo } : {}) };
}

async function planPieces(input: WorkstreamInput, workflowId: string) {
  const plan = await conditional<{ plan: { pieces: Piece[] } }>(`plan-${workflowId}`, {
    role: AGENT_PLAN_ROLE,
    type: 'agent-crew',
    subtype: AGENT_PLAN_ROLE,
    priority: PLAN_PRIORITY,
    description: `Plan: ${input.headline}`.slice(0, 60),
    workflowType: AGENT_CREW_WORKFLOWS.WORKSTREAM,
    metadata: rowFacets(input, AGENT_PLAN_ROLE, workflowId),
    envelope: briefEnvelope(input.brief),
  });
  return plan ? plan.plan.pieces : null;
}

async function startPieces(input: WorkstreamInput, pieces: Piece[], workflowId: string) {
  for (const piece of pieces) {
    await Durable.workflow.startChild({
      taskQueue: AGENT_CREW_QUEUE,
      workflowName: AGENT_CREW_WORKFLOWS.AGENT_WORK,
      workflowId: `${workflowId}-${piece.key}`,
      args: [{ data: { ...piece, project: input.project, repo: input.repo, workstream: workflowId, maxRounds: input.maxRounds }, metadata: {} }],
    });
  }
}

async function collectPieces(input: WorkstreamInput, count: number, workflowId: string) {
  const row = await conditionalAccumulator<{ piece: PieceItem }>(workstreamSignalId(workflowId), {
    role: WORKSTREAM_ROLE,
    type: 'agent-crew',
    subtype: WORKSTREAM_ROLE,
    priority: ROW_PRIORITY,
    description: input.headline.slice(0, 60),
    workflowType: AGENT_CREW_WORKFLOWS.WORKSTREAM,
    metadata: rowFacets(input, WORKSTREAM_ROLE, workflowId),
    envelope: briefEnvelope(input.brief),
    accumulate: { max: count },
  });
  return row ? row.$accumulated.map((entry) => entry.payload?.piece).filter((item): item is PieceItem => Boolean(item)) : null;
}

async function signOff(input: WorkstreamInput, items: PieceItem[], workflowId: string) {
  return conditional<Record<string, unknown>>(`signoff-${workflowId}`, {
    role: OWNER_REVIEW_ROLE,
    type: 'agent-crew',
    subtype: WORKSTREAM_ROLE,
    priority: SIGNOFF_PRIORITY,
    description: `Sign off: ${input.headline}`.slice(0, 60),
    workflowType: AGENT_CREW_WORKFLOWS.WORKSTREAM,
    metadata: rowFacets(input, OWNER_REVIEW_ROLE, workflowId),
    envelope: briefEnvelope(digestMarkdown(input.brief, items)),
  });
}

export async function workstream(envelope: LTEnvelope): Promise<{ type: 'return'; data: WorkstreamResult }> {
  const input = envelope.data as WorkstreamInput;
  const { workflowId } = Durable.workflow.workflowInfo();
  const cancelled = (pieces: PieceItem[] = []) => ({ type: 'return' as const, data: { project: input.project, outcome: 'cancelled' as const, pieces } });

  const pieces = await planPieces(input, workflowId);
  if (!pieces) return cancelled();

  await startPieces(input, pieces, workflowId);

  const items = await collectPieces(input, pieces.length, workflowId);
  if (!items) return cancelled();

  const signoff = await signOff(input, items, workflowId);
  if (!signoff) return cancelled(items);
  return { type: 'return', data: { project: input.project, outcome: 'signed-off', pieces: items, signoff } };
}

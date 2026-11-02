/**
 * program: phases of deliverables closed by gates.
 *
 * Each phase runs its deliverables as children, then one gate row per
 * signing role, in parallel. All approve and the next phase starts; any hold
 * parks a decision in the owner's queue (rework, skip, stop). The program
 * continues as a new generation at every phase boundary so replay stays
 * small. Its board, one open row in `org-programs`, is a child that holds the
 * accumulator; finished deliverables join it and the program closes it.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional, conditionalAccumulator } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import * as activities from './activities';
import { boardBrief, gateBrief, holdBrief } from './brief';
import { parseAnswer, parseDecision, parseGate } from './contracts';
import { FACET, boardSignal, deliverableChildId, gateSignal, holdSignal, present, rowFacets, sectionEnvelope } from './facets';
import { orgLookups } from './org';
import { routeGate, routeHold } from './steps';
import {
  BOARD_TIMEOUT,
  CLAUDE_WORKBENCH_QUEUE,
  DEFAULT_GATE_TIMEOUT_HOURS,
  DEFAULT_MAX_GATE_ROUNDS,
  HOLD_DECISIONS,
  ORG_PROGRAMS_ROLE,
  PRIORITY,
  PROGRAM_SUBTYPE,
  RACI,
  ROW_TYPE,
  SECTION,
  type BoardItem,
  type DeliverableInput,
  type DeliverableResult,
  type PhaseResult,
  type PhaseTemplate,
  type ProgramInput,
  type ProgramOutcome,
  type ProgramResult,
  type ProgramState,
} from './types';

const { pinOrgEditions, readTemplate, closeProgram } = Durable.workflow.proxyActivities<typeof activities>({ activities });

const WORKFLOW = { PROGRAM: 'program', BOARD: 'programBoard', DELIVERABLE: 'deliverable' } as const;

type Return<T> = { type: 'return'; data: T };

function isState(data: unknown): data is { state: ProgramState } {
  return typeof data === 'object' && data !== null && 'state' in data;
}

/** The first generation reads and pins the org; later ones carry it. */
async function stateOf(envelope: LTEnvelope, wfId: string): Promise<ProgramState> {
  if (isState(envelope.data)) return envelope.data.state;
  const input = envelope.data as ProgramInput;
  const pins = await pinOrgEditions();
  const { template, types } = await readTemplate({ pins, template: input.template });
  return { input, pins, template, types, boardSignal: boardSignal(wfId), boardStarted: false, phaseIndex: 0, gateRound: 1, results: [] };
}

async function startBoard(state: ProgramState): Promise<ProgramState> {
  if (state.boardStarted) return state;
  await Durable.workflow.startChild({
    taskQueue: CLAUDE_WORKBENCH_QUEUE,
    workflowName: WORKFLOW.BOARD,
    workflowId: state.boardSignal,
    args: [{ data: { state }, metadata: {} }],
  });
  return { ...state, boardStarted: true };
}

function childInput(state: ProgramState, phase: PhaseTemplate, kind: string, key: string): DeliverableInput {
  const type = state.types[kind];
  return {
    key,
    kind,
    headline: `${type.label}: ${state.input.headline}`.slice(0, 60),
    brief: [state.input.brief, '', `### ${type.label}`, '', type.meaning].join('\n'),
    producer: type.producer,
    reviewer: type.reviewer,
    ai: type.ai,
    program: state.input.program,
    phase: phase.key,
    programSignal: state.boardSignal,
    pins: state.pins,
  };
}

async function runDeliverables(state: ProgramState, phase: PhaseTemplate, kinds: string[], wfId: string): Promise<DeliverableResult[]> {
  const results = await Promise.all(
    kinds.map((kind) => {
      const workflowId = deliverableChildId(wfId, state.phaseIndex, kind, state.gateRound);
      return Durable.workflow.executeChild<Return<DeliverableResult> | DeliverableResult>({
        taskQueue: CLAUDE_WORKBENCH_QUEUE,
        workflowName: WORKFLOW.DELIVERABLE,
        workflowId,
        args: [{ data: childInput(state, phase, kind, workflowId), metadata: {} }],
      });
    }),
  );
  return results.map((result) => ('data' in result ? result.data : result));
}

function gateRow(state: ProgramState, phase: PhaseTemplate, role: string, results: DeliverableResult[]) {
  return {
    type: ROW_TYPE,
    subtype: SECTION.GATE,
    role,
    workflowType: WORKFLOW.PROGRAM,
    priority: PRIORITY.GATE,
    description: `Gate: ${phase.label}, ${state.input.headline}`.slice(0, 60),
    timeout: `${state.input.gateTimeoutHours ?? DEFAULT_GATE_TIMEOUT_HOURS}h`,
    metadata: rowFacets({ seat: role, section: SECTION.GATE, raci: RACI.ACCOUNTABLE, program: state.input.program, phase: phase.key, round: state.gateRound, template: state.template.value }),
    envelope: sectionEnvelope(SECTION.GATE, gateBrief(state.input.headline, phase, results)),
    lookups: orgLookups(state.pins),
  };
}

/** One row per signer, created in one expression and awaited together. */
async function runGate(state: ProgramState, phase: PhaseTemplate, results: DeliverableResult[], wfId: string) {
  const answers = await Promise.all(
    phase.gate.map((role) => conditional<Record<string, unknown>>(gateSignal(wfId, state.phaseIndex, state.gateRound, role), gateRow(state, phase, role, results))),
  );
  return routeGate(phase.gate, answers.map((answer) => parseAnswer(answer, parseGate)));
}

async function askOwner(state: ProgramState, phase: PhaseTemplate, results: DeliverableResult[], holds: Parameters<typeof holdBrief>[3], wfId: string) {
  const answer = await conditional<Record<string, unknown>>(holdSignal(wfId, state.phaseIndex, state.gateRound), {
    type: ROW_TYPE,
    subtype: SECTION.DECIDE,
    role: state.template.owner,
    workflowType: WORKFLOW.PROGRAM,
    priority: PRIORITY.DECIDE,
    description: `Held: ${phase.label}, ${state.input.headline}`.slice(0, 60),
    timeout: `${state.input.gateTimeoutHours ?? DEFAULT_GATE_TIMEOUT_HOURS}h`,
    metadata: rowFacets({ seat: state.template.owner, section: SECTION.DECIDE, raci: RACI.ACCOUNTABLE, program: state.input.program, phase: phase.key, round: state.gateRound, template: state.template.value }),
    envelope: sectionEnvelope(SECTION.DECIDE, holdBrief(state.input.headline, phase, results, holds), { decision_options: [...HOLD_DECISIONS] }),
    lookups: orgLookups(state.pins),
  });
  return routeHold(parseAnswer(answer, parseDecision), phase);
}

async function end(state: ProgramState, outcome: ProgramOutcome, summary: string): Promise<Return<ProgramResult>> {
  await closeProgram({ signalKey: state.boardSignal, closing: { outcome, summary } });
  return { type: 'return', data: { program: state.input.program, outcome, phases: state.results } };
}

type PhaseEnd = { kind: 'next'; result: PhaseResult } | { kind: 'end'; outcome: ProgramOutcome; summary: string };

/** One phase: deliverables, gate, and the owner's answer to any hold, until it passes or the program ends. */
async function runPhase(state: ProgramState, wfId: string): Promise<PhaseEnd> {
  const phase = state.template.phases[state.phaseIndex];
  const maxGateRounds = state.input.maxGateRounds ?? DEFAULT_MAX_GATE_ROUNDS;
  let kinds = [...phase.deliverables];
  let landed: Record<string, DeliverableResult> = {};

  while (state.gateRound <= maxGateRounds) {
    for (const result of await runDeliverables(state, phase, kinds, wfId)) landed[result.kind] = result;
    const results = Object.values(landed);

    const gate = await runGate(state, phase, results, wfId);
    if (gate.kind === 'cancelled') return { kind: 'end', outcome: 'cancelled', summary: `Gate cancelled in ${phase.label}` };
    if (gate.kind === 'approved') return { kind: 'next', result: { key: phase.key, outcome: 'passed', gateRounds: state.gateRound, deliverables: results } };

    const hold = await askOwner(state, phase, results, gate.holds, wfId);
    if (hold.kind === 'cancelled') return { kind: 'end', outcome: 'cancelled', summary: `Hold decision cancelled in ${phase.label}` };
    if (hold.kind === 'stalled') return { kind: 'end', outcome: 'stalled', summary: `No decision on the ${phase.label} hold` };
    if (hold.kind === 'stop') return { kind: 'end', outcome: 'stopped', summary: `Stopped at ${phase.label}` };
    if (hold.kind === 'skip') return { kind: 'next', result: { key: phase.key, outcome: 'skipped', gateRounds: state.gateRound, deliverables: results } };
    kinds = hold.kinds;
    state = { ...state, gateRound: state.gateRound + 1 };
  }
  return { kind: 'end', outcome: 'stalled', summary: `${phase.label} held after ${maxGateRounds} gate rounds` };
}

export async function program(envelope: LTEnvelope): Promise<Return<ProgramResult> | Return<{ continued: number }>> {
  const { workflowId } = Durable.workflow.workflowInfo();
  const state = await startBoard(await stateOf(envelope, workflowId));

  const phaseEnd = await runPhase(state, workflowId);
  if (phaseEnd.kind === 'end') return end(state, phaseEnd.outcome, phaseEnd.summary);

  const next: ProgramState = { ...state, phaseIndex: state.phaseIndex + 1, gateRound: 1, results: [...state.results, phaseEnd.result] };
  if (next.phaseIndex >= next.template.phases.length) return end(next, 'launched', `Launched after ${next.results.length} phases`);

  await Durable.workflow.continueAsNew({ data: { state: next }, metadata: envelope.metadata ?? {} });
  return { type: 'return', data: { continued: next.phaseIndex } };
}

/** The program's board: one open row that holds finished deliverables until the program closes it. */
export async function programBoard(envelope: LTEnvelope): Promise<Return<{ program: string; closing: unknown; items: BoardItem[] }>> {
  const { state } = envelope.data as { state: ProgramState };
  const row = await conditionalAccumulator<{ item: BoardItem }>(state.boardSignal, {
    type: ROW_TYPE,
    subtype: PROGRAM_SUBTYPE,
    role: ORG_PROGRAMS_ROLE,
    workflowType: WORKFLOW.BOARD,
    priority: PRIORITY.BOARD,
    description: state.input.headline,
    timeout: BOARD_TIMEOUT,
    metadata: present({ [FACET.PROGRAM]: state.input.program, [FACET.TEMPLATE]: state.template.value, [FACET.SEAT]: ORG_PROGRAMS_ROLE }),
    envelope: { formDefaults: { brief: boardBrief(state.input.brief, state.template.phases) } },
    lookups: orgLookups(state.pins),
    accumulate: { unique: false },
  });

  if (row === null) return { type: 'return', data: { program: state.input.program, closing: { outcome: 'cancelled' }, items: [] } };
  const { $accumulated, $trigger, $resolution, ...closing } = row;
  const items = $accumulated.map((entry) => entry.payload?.item).filter((item): item is BoardItem => Boolean(item));
  return { type: 'return', data: { program: state.input.program, closing: { ...closing, trigger: $trigger }, items } };
}

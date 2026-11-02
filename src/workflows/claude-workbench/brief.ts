/**
 * Pure markdown builders. Context crosses roles and sessions as the brief of
 * the next row: the original ask, then what earlier rounds handed off and
 * what review or a decision answered.
 */

import type { Decision, DeliverableResult, GateSign, Handoff, PhaseTemplate, Review } from './types';

/** One earlier round, as the next round's producer reads it. */
export interface RoundNote {
  round: number;
  handoff?: Handoff;
  review?: Review;
  decision?: Decision;
  expired?: boolean;
}

function optionalLine(label: string, value?: string | number) {
  return value === undefined || value === '' ? [] : [`- **${label}:** ${value}`];
}

function optionalSection(title: string, body?: string) {
  return body ? ['', `#### ${title}`, '', body] : [];
}

export function handoffMarkdown(handoff: Handoff): string {
  const assets = handoff.assets?.length ? handoff.assets.map((asset) => `[${asset.label}](${asset.url})`).join(', ') : undefined;
  return [
    handoff.summary,
    '',
    ...optionalLine('Outcome', handoff.outcome),
    ...optionalLine('Assets', assets),
    ...optionalSection('Question', handoff.blockerQuestion),
    ...optionalSection('Decisions', handoff.decisions),
    ...optionalSection('Open questions', handoff.openQuestions),
    ...optionalSection('Next', handoff.nextSuggested),
  ].join('\n');
}

function decisionLine(decision?: Decision) {
  if (!decision) return undefined;
  const rework = decision.rework?.length ? ` (${decision.rework.join(', ')})` : '';
  return `${decision.outcome}${rework}${decision.notes ? `: ${decision.notes}` : ''}`;
}

function roundMarkdown(note: RoundNote): string[] {
  if (note.expired) return ['', `### Round ${note.round}`, '', 'No handoff within the window; the round expired.'];
  return [
    '',
    `### Round ${note.round} handoff`,
    '',
    ...(note.handoff ? [handoffMarkdown(note.handoff)] : []),
    ...optionalSection('Review findings', note.review?.findings),
    ...optionalSection('Decision', decisionLine(note.decision)),
  ];
}

/** The brief for the next round of a deliverable: the ask, then every earlier round. */
export function workBrief(brief: string, notes: RoundNote[]): string {
  return [brief, ...notes.flatMap(roundMarkdown)].join('\n');
}

/** The brief a reviewer or a decider reads for one round's handoff. */
export function reviewBrief(headline: string, round: number, handoff: Handoff): string {
  return [`### ${headline}, round ${round}`, '', handoffMarkdown(handoff)].join('\n');
}

function deliverableRow(result: DeliverableResult): string {
  const summary = (result.handoff?.summary ?? result.verdict).replace(/\n/g, ' ');
  return `| ${result.key} | ${result.kind} | ${result.verdict} | ${result.rounds} | ${summary} |`;
}

/** What a gate signer reads: the phase's deliverables as they landed. */
export function gateBrief(headline: string, phase: PhaseTemplate, results: DeliverableResult[]): string {
  return [
    `### ${headline}: ${phase.label} gate`,
    '',
    '| Deliverable | Kind | Verdict | Rounds | Summary |',
    '|---|---|---|---|---|',
    ...results.map(deliverableRow),
  ].join('\n');
}

/** What the program owner reads when a gate is held. */
export function holdBrief(headline: string, phase: PhaseTemplate, results: DeliverableResult[], holds: { role: string; sign: GateSign }[]): string {
  const lines = holds.map(({ role, sign }) => `- **${role}:** ${sign.timedOut ? 'no answer within the gate window' : sign.notes ?? 'held'}`);
  return [gateBrief(headline, phase, results), '', '#### Holds', '', ...lines].join('\n');
}

/** The board's brief: the program's goal and its phases. */
export function boardBrief(brief: string, phases: PhaseTemplate[]): string {
  const lines = phases.map((phase) => `${phase.label}: ${phase.deliverables.join(', ')} (gate: ${phase.gate.join(', ')})`);
  return [brief, '', '### Phases', '', ...lines.map((line, index) => `${index + 1}. ${line}`)].join('\n');
}

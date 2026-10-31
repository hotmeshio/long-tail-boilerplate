/**
 * Pure markdown builders. Context crosses agents and sessions as the brief of
 * the next escalation: the original ask, then what earlier rounds handed off
 * and what review or the owner answered.
 */

import type { Handoff, OwnerAnswer, PieceItem, Review } from './types';

/** One earlier round, as the next round's agent reads it. */
export interface RoundNote {
  round: number;
  handoff: Handoff;
  review?: Review;
  ownerAnswer?: OwnerAnswer;
}

function optionalLine(label: string, value?: string | number) {
  return value === undefined || value === '' ? [] : [`- **${label}:** ${value}`];
}

function optionalSection(title: string, body?: string) {
  return body ? ['', `#### ${title}`, '', body] : [];
}

export function handoffMarkdown(handoff: Handoff): string {
  const files = handoff.filesTouched?.length ? handoff.filesTouched.map((file) => `\`${file}\``).join(', ') : undefined;
  return [
    handoff.summary,
    '',
    ...optionalLine('Outcome', handoff.outcome),
    ...optionalLine('Branch', handoff.branch && `\`${handoff.branch}\``),
    ...optionalLine('Commit', handoff.commit && `\`${handoff.commit}\``),
    ...optionalLine('PR', handoff.pr),
    ...optionalLine('Files', files),
    ...optionalSection('Question for the owner', handoff.blockerQuestion),
    ...optionalSection('Decisions', handoff.decisions),
    ...optionalSection('Open questions', handoff.openQuestions),
    ...optionalSection('Next', handoff.nextSuggested),
  ].join('\n');
}

function roundMarkdown(note: RoundNote): string[] {
  return [
    '',
    `### Round ${note.round} handoff`,
    '',
    handoffMarkdown(note.handoff),
    ...optionalSection('Review findings', note.review?.findings),
    ...optionalSection('Owner answer', note.ownerAnswer && `${note.ownerAnswer.outcome}${note.ownerAnswer.notes ? `: ${note.ownerAnswer.notes}` : ''}`),
  ];
}

/** The brief for the next round of a piece: the ask, then every earlier round. */
export function workBrief(brief: string, notes: RoundNote[]): string {
  return [brief, ...notes.flatMap(roundMarkdown)].join('\n');
}

/** The brief a reviewer or the owner reads for one round's handoff. */
export function reviewBrief(headline: string, round: number, handoff: Handoff): string {
  return [`### ${headline}, round ${round}`, '', handoffMarkdown(handoff)].join('\n');
}

/** The owner's closing brief for a workstream: one row per finished piece. */
export function digestMarkdown(goal: string, items: PieceItem[]): string {
  const rows = items.map((item) => `| ${item.key} | ${item.verdict} | ${item.pr ?? '—'} | ${item.summary.replace(/\n/g, ' ')} |`);
  return [goal, '', '### Pieces', '', '| Piece | Verdict | PR | Summary |', '|---|---|---|---|', ...rows].join('\n');
}

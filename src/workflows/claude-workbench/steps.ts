/**
 * Pure routing. The workflows only park what these functions name, so every
 * route is tested here without a runtime. `false` is a timeout, `null` a
 * cancel; both are routes, never errors.
 */

import type { RoundNote } from './brief';
import type { Decision, DeliverableVerdict, GateSign, Handoff, PhaseTemplate, Review } from './types';

export type WorkRoute =
  | { kind: 'cancelled' }
  | { kind: 'expired' }
  | { kind: 'blocked'; handoff: Handoff }
  | { kind: 'review'; handoff: Handoff };

export function routeWork(answer: Handoff | false | null): WorkRoute {
  if (answer === null) return { kind: 'cancelled' };
  if (answer === false) return { kind: 'expired' };
  if (answer.outcome === 'blocked') return { kind: 'blocked', handoff: answer };
  return { kind: 'review', handoff: answer };
}

export type FollowRoute =
  | { kind: 'cancelled' }
  | { kind: 'expired' }
  | { kind: 'dropped' }
  | { kind: 'accepted'; handoff: Handoff }
  | { kind: 'again'; note: RoundNote };

/** After a blocked handoff: the reviewer's decision. */
export function routeDecision(answer: Decision | false | null, round: number, handoff: Handoff): FollowRoute {
  if (answer === null) return { kind: 'cancelled' };
  if (answer === false) return { kind: 'expired' };
  if (answer.outcome === 'drop') return { kind: 'dropped' };
  return { kind: 'again', note: { round, handoff, decision: answer } };
}

/** After a done or partly-done handoff: the reviewer's verdict. */
export function routeReview(answer: Review | false | null, round: number, handoff: Handoff): FollowRoute {
  if (answer === null) return { kind: 'cancelled' };
  if (answer === false) return { kind: 'expired' };
  if (answer.verdict === 'accepted') return { kind: 'accepted', handoff };
  return { kind: 'again', note: { round, handoff, review: answer } };
}

/** The verdict when the rounds run out. */
export function exhaustedVerdict(lastExpired: boolean): DeliverableVerdict {
  return lastExpired ? 'stalled' : 'rounds-exhausted';
}

export interface Hold {
  role: string;
  sign: GateSign;
}

export type GateRoute = { kind: 'cancelled' } | { kind: 'approved' } | { kind: 'held'; holds: Hold[] };

/** One answer per signing role; a timeout is a hold, a cancel ends the program. */
export function routeGate(roles: string[], answers: (GateSign | false | null)[]): GateRoute {
  if (answers.some((answer) => answer === null)) return { kind: 'cancelled' };
  const holds: Hold[] = [];
  answers.forEach((answer, index) => {
    if (answer === false) holds.push({ role: roles[index], sign: { verdict: 'hold', timedOut: true } });
    else if (answer && answer.verdict === 'hold') holds.push({ role: roles[index], sign: answer });
  });
  return holds.length ? { kind: 'held', holds } : { kind: 'approved' };
}

export type HoldRoute = { kind: 'cancelled' } | { kind: 'stalled' } | { kind: 'stop' } | { kind: 'skip' } | { kind: 'rework'; kinds: string[] };

/** The program owner's answer to a held gate. An unknown outcome counts as stop. */
export function routeHold(answer: Decision | false | null, phase: PhaseTemplate): HoldRoute {
  if (answer === null) return { kind: 'cancelled' };
  if (answer === false) return { kind: 'stalled' };
  if (answer.outcome === 'skip') return { kind: 'skip' };
  if (answer.outcome === 'rework') return { kind: 'rework', kinds: reworkKinds(answer.rework, phase) };
  return { kind: 'stop' };
}

/** The deliverables to redo: the named ones that belong to the phase, or all of them. */
export function reworkKinds(named: string[] | undefined, phase: PhaseTemplate): string[] {
  const kinds = (named ?? []).filter((kind) => phase.deliverables.includes(kind));
  return kinds.length ? kinds : [...phase.deliverables];
}

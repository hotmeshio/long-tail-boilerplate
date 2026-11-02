/**
 * The payload contracts behind the shared seat form, as zod. The role's
 * `enforce_schema` gate has already validated the shape at the API; these
 * parse the namespaced payload into the typed shapes the workflows route on,
 * turning the dashboard's blank strings into absent fields.
 */

import { z } from 'zod';

import { blankAsAbsent, parseFormPayload } from '../../lib/form-values';
import type { Closing, Decision, GateSign, Handoff, Review } from './types';

const text = () => blankAsAbsent(z.string());
const textList = () => blankAsAbsent(z.array(z.string()));

export const AssetSchema = z.object({ label: z.string(), url: z.string() });

export const HandoffSchema = z.object({
  outcome: z.enum(['done', 'partly-done', 'blocked']),
  summary: z.string(),
  blockerQuestion: text(),
  assets: blankAsAbsent(z.array(AssetSchema)),
  decisions: text(),
  openQuestions: text(),
  nextSuggested: text(),
});

export const ReviewSchema = z.object({
  verdict: z.enum(['accepted', 'changes-requested']),
  findings: text(),
});

export const DecisionSchema = z.object({
  outcome: z.string(),
  notes: text(),
  rework: textList(),
});

export const GateSchema = z.object({
  verdict: z.enum(['approve', 'hold']),
  notes: text(),
});

export const ClosingSchema = z.object({
  outcome: z.enum(['launched', 'stopped', 'stalled', 'cancelled']),
  summary: text(),
});

const HandoffPayload = z.object({ handoff: HandoffSchema });
const ReviewPayload = z.object({ review: ReviewSchema });
const DecisionPayload = z.object({ decision: DecisionSchema });
const GatePayload = z.object({ gate: GateSchema });
const ClosingPayload = z.object({ closing: ClosingSchema });

export const parseHandoff = (payload: unknown): Handoff => parseFormPayload(HandoffPayload, payload).handoff as Handoff;
export const parseReview = (payload: unknown): Review => parseFormPayload(ReviewPayload, payload).review as Review;
export const parseDecision = (payload: unknown): Decision => parseFormPayload(DecisionPayload, payload).decision as Decision;
export const parseGate = (payload: unknown): GateSign => parseFormPayload(GatePayload, payload).gate as GateSign;
export const parseClosing = (payload: unknown): Closing => parseFormPayload(ClosingPayload, payload).closing as Closing;

/** A wait's answer, parsed when it is a payload; a timeout (false) or a cancel (null) passes through. */
export function parseAnswer<T>(answer: Record<string, unknown> | false | null, parse: (payload: unknown) => T): T | false | null {
  if (answer === null) return null;
  if (answer === false) return false;
  return parse(answer);
}

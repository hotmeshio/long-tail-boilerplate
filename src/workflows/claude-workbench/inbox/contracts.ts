/**
 * The inbox payload contracts as zod: the holder's triage and the AI's act
 * result, parsed from the namespaced payloads the shared form binds.
 */

import { z } from 'zod';

import { blankAsAbsent, parseFormPayload } from '../../../lib/form-values';
import type { ActResult, Triage } from './types';

const text = () => blankAsAbsent(z.string());

export const TriageSchema = z.object({
  decision: z.string(),
  guidance: text(),
  replyMode: blankAsAbsent(z.enum(['verbatim', 'ai-posts', 'ai-drafts'])),
  delegateTo: text(),
  category: text(),
  need: text(),
  raci: text(),
});

export const ActResultSchema = z.object({
  outcome: z.enum(['done', 'failed']),
  failureReason: text(),
  summary: text(),
  permalink: text(),
  draft: text(),
  findings: text(),
  issue: text(),
  checkedThrough: text(),
  items: blankAsAbsent(z.array(z.unknown())),
});

const TriagePayload = z.object({ triage: TriageSchema });
const ActPayload = z.object({ act: ActResultSchema });

export const parseTriage = (payload: unknown): Triage => parseFormPayload(TriagePayload, payload).triage as Triage;
export const parseAct = (payload: unknown): ActResult => parseFormPayload(ActPayload, payload).act as ActResult;

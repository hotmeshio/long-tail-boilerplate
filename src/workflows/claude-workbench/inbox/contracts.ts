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

/** What the holder submits on their reactions row: paste boxes and two choices. */
export const PreferencesSchema = z.object({
  done: text(),
  approved: text(),
  onIt: text(),
  read: text(),
  dismissed: text(),
  ticket: text(),
  readCloses: blankAsAbsent(z.enum(['fyi', 'always', 'never'])),
  replyMeans: blankAsAbsent(z.enum(['on-it', 'done', 'nothing'])),
  closeFor: blankAsAbsent(z.array(z.string())),
});
export type PreferencesForm = z.infer<typeof PreferencesSchema>;

const TriagePayload = z.object({ triage: TriageSchema });
const ActPayload = z.object({ act: ActResultSchema });
const PreferencesPayload = z.object({ preferences: PreferencesSchema });

export const parseTriage = (payload: unknown): Triage => parseFormPayload(TriagePayload, payload).triage as Triage;
export const parseAct = (payload: unknown): ActResult => parseFormPayload(ActPayload, payload).act as ActResult;
export const parsePreferences = (payload: unknown): PreferencesForm => parseFormPayload(PreferencesPayload, payload).preferences;

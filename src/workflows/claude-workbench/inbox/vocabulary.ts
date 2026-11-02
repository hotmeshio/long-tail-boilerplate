/**
 * The inbox vocabulary as editions under `org/`: the kinds of item, the
 * categories, the needs, the rules that suggest a decision, the corrections
 * the holder made, and the code-owned triage guide the AI reads before it
 * classifies. Starter lists are written once; editing an edition is how the
 * org changes what the inbox understands.
 */

import type { EscalationLookupRef } from '@hotmeshio/long-tail';

import { ORG_DOMAIN } from '../types';
import { TRIAGE_GUIDE } from './guide';
import { TRIAGE_DECISION, type Rule, type Vocabulary } from './types';

export const INBOX_EDITION = {
  KINDS: 'inbox-kinds',
  CATEGORIES: 'inbox-categories',
  NEEDS: 'inbox-needs',
  RULES: 'inbox-rules',
  CORRECTIONS: 'inbox-corrections',
  GUIDE: 'inbox-triage-guide',
} as const;

export const INBOX_KINDS = [
  { value: 'mention', label: 'Mention', meaning: 'A message that named the holder and wants something.' },
  { value: 'question', label: 'Question', meaning: 'Someone asked the holder something.' },
  { value: 'request', label: 'Request', meaning: 'Someone asked the holder to do or approve something.' },
  { value: 'incident', label: 'Incident', meaning: 'Something is broken now.' },
  { value: 'fyi', label: 'FYI', meaning: 'Informational; no action expected.' },
  { value: 'schedule', label: 'Schedule', meaning: 'A meeting or a block of time.' },
  { value: 'ticket', label: 'Ticket', meaning: 'An issue the holder is on.' },
  { value: 'note', label: 'Note', meaning: 'Something the holder added by hand.' },
];

export const INBOX_CATEGORIES = [
  { value: 'customers', label: 'Customers', meaning: 'Orders, deliveries, complaints.' },
  { value: 'product', label: 'Product', meaning: 'What is built and why.' },
  { value: 'engineering', label: 'Engineering', meaning: 'Code, builds, releases.' },
  { value: 'platform', label: 'Platform', meaning: 'Infrastructure, access, tooling.' },
  { value: 'quality', label: 'Quality', meaning: 'Tests, defects, validation.' },
  { value: 'hiring', label: 'Hiring', meaning: 'Candidates and interviews.' },
  { value: 'people', label: 'People', meaning: 'Team matters.' },
  { value: 'planning', label: 'Planning', meaning: 'Priorities, roadmaps, tracking.' },
  { value: 'schedule', label: 'Schedule', meaning: 'Meetings and time.' },
];

export const INBOX_NEEDS = [
  { value: 'answer', label: 'Answer', meaning: 'A reply is expected.' },
  { value: 'do', label: 'Do', meaning: 'A task for the holder to carry out.' },
  { value: 'decide', label: 'Decide', meaning: 'A choice only the holder can make.' },
  { value: 'approve', label: 'Approve', meaning: 'A yes or no on something prepared.' },
  { value: 'review', label: 'Review', meaning: 'Read and comment.' },
  { value: 'investigate', label: 'Investigate', meaning: 'Find out what happened.' },
  { value: 'attend', label: 'Attend', meaning: 'Be somewhere.' },
  { value: 'read', label: 'Read', meaning: 'Know about it; nothing to do.' },
];

/** The first rule whose fields all match wins; a rule only suggests. */
export const STARTER_RULES: Rule[] = [
  { when: { kind: 'incident' }, suggests: { decision: TRIAGE_DECISION.INVESTIGATE, guidance: 'Find what is affected and come back with the timeline, the cause and what you recommend.' } },
  { when: { raci: 'accountable', need: 'approve' }, suggests: { decision: TRIAGE_DECISION.INVESTIGATE, guidance: 'Read what is proposed; tell me how you would decide and why, with the risks.' } },
  { when: { need: 'answer' }, suggests: { decision: TRIAGE_DECISION.REPLY, replyMode: 'ai-drafts', guidance: 'Draft a reply from what we know; I will review it.' } },
  { when: { need: 'read' }, suggests: { decision: TRIAGE_DECISION.HANDLE } },
  { when: { raci: 'informed' }, suggests: { decision: TRIAGE_DECISION.HANDLE } },
  { when: { kind: 'schedule' }, suggests: { decision: TRIAGE_DECISION.HANDLE } },
];

export const STARTER_VOCABULARY: Vocabulary = {
  kinds: INBOX_KINDS.map((item) => item.value),
  categories: INBOX_CATEGORIES.map((item) => item.value),
  needs: INBOX_NEEDS.map((item) => item.value),
  raci: ['responsible', 'accountable', 'consulted', 'informed'],
  rules: STARTER_RULES,
};

export const INBOX_STARTER_ENTRIES: { key: string; data: Record<string, unknown> }[] = [
  { key: INBOX_EDITION.KINDS, data: { items: INBOX_KINDS } },
  { key: INBOX_EDITION.CATEGORIES, data: { items: INBOX_CATEGORIES } },
  { key: INBOX_EDITION.NEEDS, data: { items: INBOX_NEEDS } },
  { key: INBOX_EDITION.RULES, data: { items: STARTER_RULES } },
  { key: INBOX_EDITION.CORRECTIONS, data: { items: [] } },
];

export const INBOX_CODE_OWNED_ENTRIES: { key: string; data: Record<string, unknown> }[] = [
  { key: INBOX_EDITION.GUIDE, data: { markdown: TRIAGE_GUIDE } },
];

/** Current refs: an open inbox row reads today's lists; a closed one keeps the list it was decided against. */
export const INBOX_LOOKUPS: EscalationLookupRef[] = [
  { domain: ORG_DOMAIN, key: 'roles', as: 'roles' },
  { domain: ORG_DOMAIN, key: 'raci', as: 'raci' },
  { domain: ORG_DOMAIN, key: INBOX_EDITION.KINDS, as: 'kinds' },
  { domain: ORG_DOMAIN, key: INBOX_EDITION.CATEGORIES, as: 'categories' },
  { domain: ORG_DOMAIN, key: INBOX_EDITION.NEEDS, as: 'needs' },
];

/** The values an edition lists: `{ items: [{ value }] }`. */
export function editionValues(payload: unknown): string[] | undefined {
  const items = (payload as { items?: unknown[] } | undefined)?.items;
  if (!Array.isArray(items)) return undefined;
  const values = items.map((item) => (item && typeof item === 'object' && typeof (item as { value?: unknown }).value === 'string' ? (item as { value: string }).value : undefined));
  const found = values.filter((value): value is string => Boolean(value));
  return found.length ? found : undefined;
}

/** A rule read back from an edition; one without a decision is dropped. */
export function readRule(raw: unknown): Rule | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { when, suggests } = raw as { when?: Record<string, unknown>; suggests?: Record<string, unknown> };
  if (!when || typeof when !== 'object' || !suggests || typeof suggests.decision !== 'string') return undefined;
  const pick = (key: string) => (typeof when[key] === 'string' && when[key] ? (when[key] as string) : undefined);
  return {
    when: { kind: pick('kind'), category: pick('category'), need: pick('need'), raci: pick('raci') },
    suggests: {
      decision: suggests.decision,
      ...(typeof suggests.guidance === 'string' ? { guidance: suggests.guidance } : {}),
      ...(typeof suggests.replyMode === 'string' ? { replyMode: suggests.replyMode as Rule['suggests']['replyMode'] } : {}),
    },
  };
}

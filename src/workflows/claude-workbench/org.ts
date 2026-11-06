/**
 * The org as data: knowledge editions under the `org` domain. Starter entries
 * are written once, when absent, and evolve by edit from then on; the handoff
 * guide is code-owned and replaced when it changes. A program pins the
 * edition numbers in force when it starts, so editing the org never changes a
 * running program.
 */

import type { EscalationLookupRef } from '@hotmeshio/long-tail';

import { HANDOFF_GUIDE } from './org-guide';
import { INBOX_CODE_OWNED_ENTRIES, INBOX_LOOKUPS, INBOX_STARTER_ENTRIES } from './inbox/vocabulary';
import { ORG_DOMAIN, ORG_ROLES, type DeliverableType, type OrgPins, type ProgramTemplate } from './types';

export { ORG_DOMAIN };

export const EDITION_KEY = {
  ROLES: 'roles',
  RACI: 'raci',
  CHANNELS: 'channels',
  TYPES: 'deliverable-types',
  PROGRAMS: 'programs',
  GUIDE: 'handoff-guide',
} as const;

/** The edition keys a program pins. */
export const PINNED_KEYS = [EDITION_KEY.ROLES, EDITION_KEY.RACI, EDITION_KEY.CHANNELS, EDITION_KEY.TYPES, EDITION_KEY.PROGRAMS] as const;

export const ROLE_ITEMS = ORG_ROLES.map((entry) => ({ value: entry.role, label: entry.title, meaning: entry.meaning, domain: entry.domain }));

export const RACI_ITEMS = [
  { value: 'responsible', label: 'Responsible', meaning: 'Does the work.' },
  { value: 'accountable', label: 'Accountable', meaning: 'Decides, reviews, signs; one per item.' },
  { value: 'consulted', label: 'Consulted', meaning: 'Asked before the work is done.' },
  { value: 'informed', label: 'Informed', meaning: 'Told after; no action needed.' },
];

/** The tools a delegation or a write-back may act through. */
export const CHANNEL_ITEMS = [
  { value: 'inbox', label: 'Inbox row', meaning: 'A row in the target role\'s queue.', needs: ['role'], resolvesWith: ['escalationId'] },
  { value: 'slack-thread', label: 'Slack thread', meaning: 'A post in the thread, tagging the target.', needs: ['channelId', 'threadTs'], resolvesWith: ['permalink'] },
  { value: 'linear-issue', label: 'Linear issue', meaning: 'An issue created or assigned.', needs: ['team'], resolvesWith: ['identifier', 'url'] },
  { value: 'email', label: 'Email', meaning: 'A message to someone outside the org.', needs: ['address'], resolvesWith: ['messageId'] },
];

export const DELIVERABLE_TYPES: DeliverableType[] = [
  { value: 'problem-brief', label: 'Problem brief', meaning: 'The problem, who has it, why now.', producer: 'product', reviewer: 'design', ai: 'none' },
  { value: 'research-notes', label: 'Research notes', meaning: 'What people said and did; what it means.', producer: 'design', reviewer: 'product', ai: 'eligible' },
  { value: 'prd', label: 'PRD', meaning: 'What is built and why; requirements and success criteria.', producer: 'product', reviewer: 'engineering-leadership', ai: 'none' },
  { value: 'design-spec', label: 'Design spec', meaning: 'How it works for people; flows and surfaces.', producer: 'design', reviewer: 'product', ai: 'eligible' },
  { value: 'tdd', label: 'TDD', meaning: 'How it is built; shapes, ids, failure modes.', producer: 'engineering-platform', reviewer: 'sre', ai: 'eligible' },
  { value: 'test-plan', label: 'Test plan', meaning: 'What is verified and how.', producer: 'quality', reviewer: 'engineering-execution', ai: 'eligible' },
  { value: 'increment', label: 'Increment', meaning: 'A shipped slice of the build, with its tests.', producer: 'engineering-execution', reviewer: 'quality', ai: 'eligible' },
  { value: 'runbook', label: 'Runbook', meaning: 'How it is operated and recovered.', producer: 'sre', reviewer: 'engineering-platform', ai: 'eligible' },
  { value: 'launch-plan', label: 'Launch plan', meaning: 'Who is told what, when; what is promised.', producer: 'sales', reviewer: 'product', ai: 'none' },
  { value: 'support-guide', label: 'Support guide', meaning: 'What customers will ask and what to answer.', producer: 'support', reviewer: 'sales', ai: 'eligible' },
  { value: 'prototype', label: 'Prototype', meaning: 'Working hardware that answers the feasibility question.', producer: 'engineering-lab', reviewer: 'quality', ai: 'none' },
  { value: 'requirements', label: 'Requirements', meaning: 'What the device must do, measurably.', producer: 'product', reviewer: 'engineering-lab', ai: 'none' },
  { value: 'verification-plan', label: 'Verification plan', meaning: 'How each requirement is shown to be met.', producer: 'quality', reviewer: 'engineering-lab', ai: 'eligible' },
  { value: 'process-validation', label: 'Process validation', meaning: 'The production process makes the device repeatably.', producer: 'engineering-execution', reviewer: 'quality', ai: 'none' },
  { value: 'demo-note', label: 'Demo note', meaning: 'A short note; the smallest deliverable, for demos and tests.', producer: 'engineering-platform', reviewer: 'product', ai: 'none' },
];

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    value: 'software-launch',
    label: 'Software launch',
    meaning: 'A software product from discovery to launch.',
    owner: 'product',
    phases: [
      { key: 'discover', label: 'Discover', deliverables: ['problem-brief', 'research-notes'], gate: ['product', 'design'] },
      { key: 'define', label: 'Define', deliverables: ['prd', 'design-spec'], gate: ['product', 'design', 'engineering-leadership'] },
      { key: 'design', label: 'Design', deliverables: ['tdd', 'test-plan'], gate: ['engineering-leadership', 'sre', 'quality'] },
      { key: 'build', label: 'Build', deliverables: ['increment', 'runbook'], gate: ['engineering-execution', 'quality', 'sre'] },
      { key: 'launch', label: 'Launch', deliverables: ['launch-plan', 'support-guide'], gate: ['product', 'sales', 'support'] },
    ],
  },
  {
    value: 'device-launch',
    label: 'Device launch',
    meaning: 'A physical device from concept to launch.',
    owner: 'product',
    phases: [
      { key: 'concept', label: 'Concept', deliverables: ['problem-brief'], gate: ['product', 'engineering-lab'] },
      { key: 'feasibility', label: 'Feasibility', deliverables: ['prototype', 'requirements'], gate: ['engineering-lab', 'product'] },
      { key: 'design', label: 'Design', deliverables: ['design-spec', 'verification-plan'], gate: ['design', 'quality', 'engineering-leadership'] },
      { key: 'pilot', label: 'Pilot', deliverables: ['process-validation', 'runbook'], gate: ['engineering-execution', 'quality', 'sre'] },
      { key: 'launch', label: 'Launch', deliverables: ['launch-plan', 'support-guide'], gate: ['product', 'sales', 'support'] },
    ],
  },
  {
    value: 'demo',
    label: 'Demo',
    meaning: 'One phase, one deliverable, one signer; for demos and tests.',
    owner: 'product',
    phases: [{ key: 'build', label: 'Build', deliverables: ['demo-note'], gate: ['product'] }],
  },
];

/** Written once when absent; edited since. */
export const STARTER_ENTRIES: { key: string; data: Record<string, unknown> }[] = [
  { key: EDITION_KEY.RACI, data: { items: RACI_ITEMS } },
  { key: EDITION_KEY.CHANNELS, data: { items: CHANNEL_ITEMS } },
  { key: EDITION_KEY.TYPES, data: { items: DELIVERABLE_TYPES } },
  { key: EDITION_KEY.PROGRAMS, data: { items: PROGRAM_TEMPLATES } },
  ...INBOX_STARTER_ENTRIES,
];

/** Replaced on boot when the code changes: roles are code-declared (they need forms), and the guide is the code's own text. */
export const CODE_OWNED_ENTRIES: { key: string; data: Record<string, unknown> }[] = [
  { key: EDITION_KEY.ROLES, data: { items: ROLE_ITEMS } },
  { key: EDITION_KEY.GUIDE, data: { markdown: HANDOFF_GUIDE } },
  ...INBOX_CODE_OWNED_ENTRIES,
];

const LOOKUP_AS = { [EDITION_KEY.ROLES]: 'roles', [EDITION_KEY.RACI]: 'raci', [EDITION_KEY.TYPES]: 'types', [EDITION_KEY.PROGRAMS]: 'programs' } as const;

/** The refs every program row carries: pinned to the editions in force at start. */
export function orgLookups(pins: OrgPins): EscalationLookupRef[] {
  return [
    { domain: ORG_DOMAIN, key: EDITION_KEY.ROLES, version: pins.roles, as: LOOKUP_AS.roles },
    { domain: ORG_DOMAIN, key: EDITION_KEY.RACI, version: pins.raci, as: LOOKUP_AS.raci },
    { domain: ORG_DOMAIN, key: EDITION_KEY.TYPES, version: pins['deliverable-types'], as: LOOKUP_AS['deliverable-types'] },
  ];
}

/** What a seat row carries: its program's pins, when it has them, and the current handoff guide. */
export function seatLookups(pins?: OrgPins): EscalationLookupRef[] {
  return [...(pins ? orgLookups(pins) : []), { domain: ORG_DOMAIN, key: EDITION_KEY.GUIDE, as: 'guide' }];
}

/** Current refs for invoke forms; seeds run after worker registration, so nothing is pinned here. */
export const WORKBENCH_INPUT_LOOKUPS: EscalationLookupRef[] = [
  { domain: ORG_DOMAIN, key: EDITION_KEY.ROLES, as: LOOKUP_AS.roles },
  { domain: ORG_DOMAIN, key: EDITION_KEY.TYPES, as: LOOKUP_AS['deliverable-types'] },
  { domain: ORG_DOMAIN, key: EDITION_KEY.PROGRAMS, as: LOOKUP_AS.programs },
  ...INBOX_LOOKUPS.filter((ref) => ref.key !== EDITION_KEY.ROLES),
];

export function deliverableTypeByKind(items: DeliverableType[], kind: string): DeliverableType | undefined {
  return items.find((item) => item.value === kind);
}

export function templateByKey(items: ProgramTemplate[], key: string): ProgramTemplate | undefined {
  return items.find((item) => item.value === key);
}

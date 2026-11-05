/**
 * Invoke forms for the three invocable workflows. Selects read the org
 * editions through current lookup refs (`WORKBENCH_INPUT_LOOKUPS` on the
 * worker config), so a new role or deliverable type appears here without a
 * deploy. The invoke API validates against these schemas (422 on violation).
 */

import {
  AI_MODES,
  DEFAULT_ASK_TIMEOUT_HOURS,
  DEFAULT_GATE_TIMEOUT_HOURS,
  DEFAULT_MAX_GATE_ROUNDS,
  DEFAULT_MAX_ROUNDS,
  HEADLINE_MAX_LENGTH,
  SLUG_PATTERN,
  HOLDER_ROLES,
} from '../types';
import { INBOX_DEFAULT_INTERVAL_MINUTES, INBOX_DEFAULT_LOOKBACK_HOURS, INBOX_SOURCES } from '../inbox/types';

const SLUG_ERROR = 'Use 2 to 64 lowercase letters, digits and dashes';

const slugField = (title: string, description: string) => ({
  type: 'string',
  title,
  description,
  pattern: SLUG_PATTERN,
  'x-lt-pattern-error': SLUG_ERROR,
});

const HEADLINE_FIELD = {
  type: 'string',
  title: 'Headline',
  description: 'A few words; the list and the detail page show it',
  minLength: 3,
  maxLength: HEADLINE_MAX_LENGTH,
};

const BRIEF_INPUT_FIELD = {
  type: 'string',
  title: 'Brief',
  description: 'Markdown shown at the top of every row: the ask, the context, the links',
  'x-lt-widget': 'markdown',
  minLength: 10,
  maxLength: 20_000,
  'x-lt-span': 2,
};

const roleField = (title: string, description: string) => ({
  type: 'string',
  title,
  description,
  'x-lt-options': 'lookup.roles.items',
});

const hours = (title: string, description: string, defaultValue: number) => ({
  type: 'integer',
  title,
  description,
  minimum: 1,
  maximum: 2160,
  default: defaultValue,
});

export const PROGRAM_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Name the program.\n2. Pick its template.\n3. Put the goal in the brief; every row carries it.',
  'x-lt-order': ['program', 'headline', 'template', 'gateTimeoutHours', 'maxGateRounds', 'brief'],
  required: ['program', 'headline', 'template', 'brief'],
  properties: {
    program: slugField('Program', 'The program slug; one board per slug'),
    headline: HEADLINE_FIELD,
    template: { type: 'string', title: 'Template', description: 'The phases, deliverables and gates', 'x-lt-options': 'lookup.programs.items' },
    gateTimeoutHours: hours('Gate window (hours)', 'How long a signer has before a gate counts as held', DEFAULT_GATE_TIMEOUT_HOURS),
    maxGateRounds: { type: 'integer', title: 'Gate rounds', description: 'How many reworks a phase allows', minimum: 1, maximum: 10, default: DEFAULT_MAX_GATE_ROUNDS },
    brief: BRIEF_INPUT_FIELD,
  },
};

export const DELIVERABLE_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Name the deliverable and its kind.\n2. The kind sets producer and reviewer; override only when the org differs.\n3. Put the ask in the brief.',
  'x-lt-order': ['key', 'kind', 'headline', 'producer', 'reviewer', 'ai', 'maxRounds', 'program', 'phase', 'brief'],
  required: ['key', 'kind', 'headline', 'brief'],
  properties: {
    key: slugField('Key', 'The deliverable slug; unique within its program'),
    kind: { type: 'string', title: 'Kind', description: 'The deliverable type', 'x-lt-options': 'lookup.types.items' },
    headline: HEADLINE_FIELD,
    producer: roleField('Producer', 'Optional; the role that does the work (default from the kind)'),
    reviewer: roleField('Reviewer', 'Optional; the role that reviews it (default from the kind)'),
    ai: {
      type: 'string',
      title: 'AI mode',
      description: 'Optional; none, eligible or only (default from the kind)',
      'x-lt-options': AI_MODES.map((mode) => ({ value: mode, label: mode })),
    },
    maxRounds: { type: 'integer', title: 'Rounds', description: 'How many work and review rounds before it stalls', minimum: 1, maximum: 10, default: DEFAULT_MAX_ROUNDS },
    program: { ...slugField('Program', 'Optional; the program this belongs to'), 'x-lt-hidden': true },
    phase: { type: 'string', title: 'Phase', maxLength: 64, 'x-lt-hidden': true },
    programSignal: { type: 'string', title: 'Board signal', maxLength: 300, 'x-lt-hidden': true },
    brief: BRIEF_INPUT_FIELD,
  },
};

export const ASK_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Pick the role that decides.\n2. Write the question in the brief, with the options and what each means.',
  'x-lt-order': ['seat', 'headline', 'options', 'timeoutHours', 'program', 'brief'],
  required: ['seat', 'headline', 'brief'],
  properties: {
    seat: roleField('Role', 'The role that decides'),
    headline: HEADLINE_FIELD,
    options: {
      type: 'array',
      title: 'Options',
      description: 'Optional; the choices offered (default: go-ahead, change-course, drop)',
      'x-lt-widget': 'json',
      items: { type: 'string', pattern: SLUG_PATTERN },
      minItems: 1,
      maxItems: 8,
    },
    timeoutHours: hours('Expires after (hours)', 'How long the question waits', DEFAULT_ASK_TIMEOUT_HOURS),
    program: { ...slugField('Program', 'Optional; the program this is about'), 'x-lt-hidden': false },
    brief: BRIEF_INPUT_FIELD,
  },
};

const SOURCE_FIELD = {
  type: 'string',
  title: 'Source',
  description: 'Where the AI looks',
  'x-lt-options': INBOX_SOURCES.map((source) => ({ value: source, label: source })),
};

/**
 * Optional everywhere: left empty, the run is for the caller's own inbox (the
 * one their sign-in email is bound to). Only an admin acting for someone else
 * names one. Free text, because holders bound from a domain rule are not in
 * any static list.
 */
const HOLDER_FIELD = {
  type: 'string',
  title: 'Inbox',
  description: `Leave empty for your own inbox. Admins may name another, e.g. ${HOLDER_ROLES[0]?.role ?? 'inbox-sam'}.`,
  pattern: '^(inbox-[a-z][a-z0-9_-]*)?$',
  'x-lt-pattern-error': 'An inbox role: inbox- followed by the holder name',
  maxLength: 128,
};

export const INBOX_SWEEP_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Pick the source; the sweep is for your own inbox.\n2. The AI is asked to check on the interval; each item it finds becomes a row in your inbox.',
  'x-lt-order': ['source', 'intervalMinutes', 'lookbackHours', 'maxItems', 'watermark', 'holder'],
  required: ['source'],
  properties: {
    holder: HOLDER_FIELD,
    source: SOURCE_FIELD,
    intervalMinutes: { type: 'integer', title: 'Every (minutes)', description: 'How often to check', minimum: 1, maximum: 1440, default: INBOX_DEFAULT_INTERVAL_MINUTES },
    lookbackHours: { type: 'integer', title: 'First check looks back (hours)', description: 'Used when no watermark is given', minimum: 1, maximum: 720, default: INBOX_DEFAULT_LOOKBACK_HOURS },
    maxItems: { type: 'integer', title: 'Items per check', minimum: 1, maximum: 50, default: 50 },
    watermark: { type: 'string', title: 'Start after', description: 'Optional; the source timestamp already read', maxLength: 64 },
  },
};

export const INBOX_ITEM_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Say what it is and what it needs; it lands in your own inbox.\n2. The rules suggest a decision.',
  'x-lt-order': ['kind', 'headline', 'category', 'need', 'raci', 'priority', 'permalink', 'summary', 'holder'],
  required: ['kind', 'headline', 'summary'],
  properties: {
    holder: HOLDER_FIELD,
    kind: { type: 'string', title: 'Kind', description: 'What it is', 'x-lt-options': 'lookup.kinds.items' },
    headline: HEADLINE_FIELD,
    category: { type: 'string', title: 'Category', description: 'Optional; what it is about', 'x-lt-options': 'lookup.categories.items' },
    need: { type: 'string', title: 'Needs', description: 'Optional; what it needs from the holder', 'x-lt-options': 'lookup.needs.items' },
    raci: { type: 'string', title: 'Role', description: "Optional; the holder's role on it", 'x-lt-options': 'lookup.raci.items' },
    priority: { type: 'integer', title: 'Priority', description: '1 now, 2 today, 3 this week, 4 whenever', minimum: 1, maximum: 4, default: 3 },
    permalink: { type: 'string', title: 'Link', description: 'Optional; where it came from', maxLength: 2000 },
    summary: { ...BRIEF_INPUT_FIELD, title: 'Summary', description: 'Markdown: what is asked and what matters' },
  },
};

export const INBOX_PREFERENCES_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': '1. Submit; nothing to fill in here.\n2. A "Your reactions" row opens in your inbox, pre-filled with what is in force. Say there what your emoji mean.',
  'x-lt-order': ['holder'],
  required: [],
  properties: {
    holder: HOLDER_FIELD,
  },
};

/**
 * The inbox layer: intake and the item loop.
 *
 * A holder has two queues: their inbox (`inbox-<holder>`, the decide queue)
 * and their agent queue (`inbox-agent-<holder>`, the act queue). Both belong
 * to the holder's persona; the agent works the second one acting as the
 * holder over MCP. A sweep parks a check act per source on a schedule; the
 * agent resolves it with the items it found; each item becomes a durable
 * workflow that parks a decide row, then an act row, and back, until it closes.
 */

export const INBOX_SOURCES = ['slack', 'calendar', 'issues', 'manual'] as const;
export type InboxSource = (typeof INBOX_SOURCES)[number];

/** What the AI does; each is an act row's subtype and `envelope.act`. */
export const INBOX_ACT = {
  CHECK: 'check',
  REPLY: 'reply',
  DRAFT: 'draft',
  INVESTIGATE: 'investigate',
  FILE_TICKET: 'file-ticket',
  DELEGATE: 'delegate',
  APPLY: 'apply',
} as const;
export type InboxAct = (typeof INBOX_ACT)[keyof typeof INBOX_ACT];

/** What a holder's row shows; each is a decide row's subtype and `envelope.view`. */
export const INBOX_VIEW = {
  TRIAGE: 'triage',
  DRAFT: 'draft',
  FINDINGS: 'findings',
  OUTCOME: 'outcome',
  WAITING: 'waiting',
} as const;
export type InboxView = (typeof INBOX_VIEW)[keyof typeof INBOX_VIEW];

/**
 * Where an item stands for the holder; the sidebar's "what's next" pins filter
 * on it. `new` needs a first decision, `returned` is what the agent brought
 * back, `waiting` is on someone else, `fyi` needs nothing.
 */
export const INBOX_STAGE = { NEW: 'new', RETURNED: 'returned', WAITING: 'waiting', FYI: 'fyi' } as const;
export type InboxStage = (typeof INBOX_STAGE)[keyof typeof INBOX_STAGE];

export const TRIAGE_DECISION = {
  HANDLE: 'handle',
  DISMISS: 'dismiss',
  REPLY: 'reply',
  INVESTIGATE: 'investigate',
  FILE_TICKET: 'file-ticket',
  DELEGATE: 'delegate',
  ON_IT: 'on-it',
  APPLY: 'apply',
  POST: 'post',
  REDRAFT: 'redraft',
  DROP: 'drop',
} as const;

const option = (value: string, label: string) => ({ value, label });

export const TRIAGE_DECISIONS = [
  option(TRIAGE_DECISION.HANDLE, 'I will handle it'),
  option(TRIAGE_DECISION.DISMISS, 'Dismiss'),
  option(TRIAGE_DECISION.REPLY, 'Reply'),
  option(TRIAGE_DECISION.INVESTIGATE, 'Investigate and report back'),
  option(TRIAGE_DECISION.FILE_TICKET, 'File the ticket'),
  option(TRIAGE_DECISION.DELEGATE, 'Delegate to a role'),
  option(TRIAGE_DECISION.ON_IT, "I'm on it; wait on me"),
];

/** After findings: the same choices, plus carrying out what the findings propose. */
export const FOLLOW_UP_DECISIONS = [
  option(TRIAGE_DECISION.APPLY, 'Do it as proposed'),
  ...TRIAGE_DECISIONS.filter((entry) => entry.value !== TRIAGE_DECISION.ON_IT),
];

export const DRAFT_DECISIONS = [
  option(TRIAGE_DECISION.POST, 'Post as written'),
  option(TRIAGE_DECISION.REDRAFT, 'Redraft with my notes'),
  option(TRIAGE_DECISION.DROP, 'Drop it'),
];

export const WAITING_DECISIONS = [
  option(TRIAGE_DECISION.HANDLE, 'Done; close it'),
  option(TRIAGE_DECISION.DISMISS, 'Dismiss'),
  option(TRIAGE_DECISION.INVESTIGATE, 'Investigate and report back'),
];

export const REPLY_MODES = [
  option('verbatim', 'Post my words as written'),
  option('ai-posts', 'The AI writes and posts'),
  option('ai-drafts', 'The AI writes, I review'),
] as const;
export type ReplyMode = (typeof REPLY_MODES)[number]['value'];

export const ACT_OUTCOMES = [option('done', 'Done'), option('failed', 'Could not do it')] as const;

export const ITEM_CLOSE = {
  HANDLED: 'handled',
  DISMISSED: 'dismissed',
  REPLIED: 'replied',
  TICKETED: 'ticketed',
  APPLIED: 'applied',
  DRAFT_DROPPED: 'draft-dropped',
  CANCELLED: 'cancelled',
} as const;

export const INBOX_ROUNDS_PER_LINK = 12;
export const INBOX_CHECKS_PER_LINK = 24;
export const INBOX_DECIDE_TIMEOUT = '7d';
export const INBOX_WAITING_TIMEOUT = '7d';
export const INBOX_ACT_TIMEOUT = '24h';
export const INBOX_CHECK_TIMEOUT = '7d';
export const INBOX_ACT_PRIORITY = 2;
export const INBOX_CHECK_PRIORITY = 3;
export const INBOX_DEFAULT_INTERVAL_MINUTES = 15;
/** How far back the first check of a sweep looks when no watermark is given. */
export const INBOX_DEFAULT_LOOKBACK_HOURS = 36;
export const INBOX_CHECK_MAX_ITEMS = 50;
export const INBOX_CORRECTIONS_KEPT = 200;
export const INBOX_DEFAULT_PRIORITY = 3;

/** The rule-suggested decision an item's row opens on. */
export interface Suggestion {
  decision: string;
  guidance?: string;
  replyMode?: ReplyMode;
}

/** One thing that needs the holder, as the AI reports it or a person adds it. */
export interface ItemSpec {
  /** The holder's inbox role, e.g. `inbox-sam`. */
  holder: string;
  source: InboxSource;
  /** A value of the inbox-kinds edition. */
  kind: string;
  category?: string;
  need?: string;
  raci?: string;
  /** 1 (now) to 4 (whenever). */
  priority: number;
  headline: string;
  /** Markdown; never private or customer detail. */
  summary: string;
  permalink?: string;
  channelId?: string;
  channelName?: string;
  messageTs?: string;
  threadTs?: string;
  fromName?: string;
  team?: string;
  sentAt?: string;
  suggestion?: Suggestion;
}

/** What the holder submits on a decide row. */
export interface Triage {
  decision: string;
  guidance?: string;
  replyMode?: ReplyMode;
  delegateTo?: string;
  category?: string;
  need?: string;
  raci?: string;
}

/** What the AI submits on an act row. */
export interface ActResult {
  outcome: (typeof ACT_OUTCOMES)[number]['value'];
  failureReason?: string;
  summary?: string;
  permalink?: string;
  draft?: string;
  findings?: string;
  issue?: string;
  checkedThrough?: string;
  items?: unknown[];
}

/** What the item has gathered so far; the briefs that follow read it. */
export interface ItemContext {
  request?: { decision: string; guidance?: string; replyMode?: ReplyMode; delegateTo?: string };
  draft?: string;
  approvedReply?: string;
  redraftNotes?: string;
  findings?: string;
  issue?: string;
  permalink?: string;
  failure?: string;
  waitingOn?: string;
  /** What the agent changed when it carried out the approved findings. */
  applied?: string;
}

export type Step = { kind: 'decide'; view: InboxView } | { kind: 'act'; act: InboxAct } | { kind: 'done'; close: string };

export interface Next {
  step: Step;
  context: ItemContext;
}

/** Carried across generations. */
export interface ItemState {
  itemId: string;
  item: ItemSpec;
  /** The holder's account; every row of the item opens pre-assigned to it. */
  assignee?: string;
  step: Step;
  context: ItemContext;
  generation: number;
}

export interface Rule {
  when: { kind?: string; category?: string; need?: string; raci?: string };
  suggests: Suggestion;
}

export interface Vocabulary {
  kinds: string[];
  categories: string[];
  needs: string[];
  raci: string[];
  rules: Rule[];
}

export interface Correction {
  itemId: string;
  signalId: string;
  headline: string;
  kind: string;
  from: { category?: string; need?: string; raci?: string };
  to: { category?: string; need?: string; raci?: string };
}

export interface SweepInput {
  holder: string;
  source: InboxSource;
  intervalMinutes?: number;
  maxItems?: number;
  /** The first check looks back this far when no watermark is given. */
  lookbackHours?: number;
  watermark?: string;
  generation?: number;
  admitted?: number;
  /** The holder's account, found once; check rows open pre-assigned to it. */
  assignee?: string;
}

export interface ItemResult {
  itemId: string;
  close?: string;
  continued?: number;
  refused?: string;
}

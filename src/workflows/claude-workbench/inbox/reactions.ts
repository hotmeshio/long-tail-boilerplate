/**
 * What a holder's own reactions and replies on a source message mean. Each
 * holder keeps the mapping as an edition under their name; the org edition
 * is the default. The agent applies it on every pass before it classifies
 * anything new: the holder's emoji is their decision, so no row is needed.
 * Pure; the activities read and write the editions.
 */

import { INBOX_STAGE, INBOX_VIEW, TRIAGE_DECISION, type InboxStage, type InboxView } from './types';

export const REACTIONS_EDITION = 'inbox-reactions';
export const PREFERENCES_WORKFLOW = 'inboxPreferences';

export const READ_CLOSES = [
  { value: 'fyi', label: 'Only items that just need reading' },
  { value: 'always', label: 'Any item' },
  { value: 'never', label: 'Nothing; note it and keep the item open' },
] as const;
export type ReadCloses = (typeof READ_CLOSES)[number]['value'];

export const REPLY_MEANS = [
  { value: 'on-it', label: "I'm on it; keep it open and wait on me" },
  { value: 'done', label: 'Done; close it' },
  { value: 'nothing', label: 'Nothing' },
] as const;
export type ReplyMeans = (typeof REPLY_MEANS)[number]['value'];

export const RACI_VALUES = ['responsible', 'accountable', 'consulted', 'informed'] as const;

/** Reaction names (as the source reports them) per meaning, plus the holder's settings. */
export interface ReactionSettings {
  done: string[];
  approved: string[];
  onIt: string[];
  read: string[];
  dismissed: string[];
  ticket: string[];
  readCloses: ReadCloses;
  replyMeans: ReplyMeans;
  closeFor: string[];
}

export const REACTION_LISTS = ['done', 'approved', 'onIt', 'read', 'dismissed', 'ticket'] as const;
export type ReactionList = (typeof REACTION_LISTS)[number];

export const DEFAULT_REACTIONS: ReactionSettings = {
  done: ['white_check_mark', 'heavy_check_mark', 'ballot_box_with_check'],
  approved: ['approved', 'github-approve', 'pr-approved'],
  onIt: ['eyes'],
  read: ['+1', 'thumbsup', 'fire', 'raised_hands', 'heart', 'pray'],
  dismissed: ['x', 'no_entry_sign'],
  ticket: ['ticket', 'admission_tickets'],
  readCloses: 'fyi',
  replyMeans: 'on-it',
  closeFor: [...RACI_VALUES],
};

/** Common pasted emoji and the names Slack reports them as. */
const UNICODE_NAMES: Record<string, string> = {
  '✅': 'white_check_mark', '✔': 'heavy_check_mark', '☑': 'ballot_box_with_check', '👀': 'eyes', '👍': '+1', '👎': '-1',
  '🔥': 'fire', '🎫': 'ticket', '🎟': 'admission_tickets', '❌': 'x', '🚫': 'no_entry_sign', '🙏': 'pray', '🙌': 'raised_hands',
  '❤': 'heart', '💯': '100', '🚀': 'rocket', '👋': 'wave', '🤔': 'thinking_face', '🫡': 'saluting_face', '📌': 'pushpin',
  '📝': 'memo', '✍': 'writing_hand', '👌': 'ok_hand', '🎉': 'tada', '⏳': 'hourglass_flowing_sand', '⏰': 'alarm_clock',
  '📅': 'date', '🧵': 'thread', '👏': 'clap', '💪': 'muscle', '🙂': 'slightly_smiling_face', '😀': 'grinning',
};

const NAME = /^[a-z0-9_+\-]+$/;

/** One pasted token or reported name as the name the source reports; undefined when it is nothing. */
export function normalizeReaction(token: string): string | undefined {
  const bare = token
    .trim()
    .replace(/::skin-tone-\d$/i, '')
    .replace(/[️⃣]|[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/^:+|:+$/g, '')
    .trim();
  if (!bare) return undefined;
  if (UNICODE_NAMES[bare]) return UNICODE_NAMES[bare];
  const lower = bare.toLowerCase();
  if (NAME.test(lower)) return lower;
  return /^[\p{Extended_Pictographic}\p{Emoji_Component}]+$/u.test(bare) ? bare : undefined;
}

/** What a holder pasted, as the names the source reports, in order, once each. */
export function parseReactionList(text: string | undefined): string[] {
  if (!text) return [];
  const names = text.split(/[\s,]+/).map(normalizeReaction).filter((name): name is string => Boolean(name));
  return [...new Set(names)];
}

/** Names back to what a holder reads: `:name:` tokens, pasted emoji as they are. */
export function formatReactionList(names: string[]): string {
  return names.map((name) => (NAME.test(name) ? `:${name}:` : name)).join(' ');
}

const stringList = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').map((entry) => normalizeReaction(entry)).filter((entry): entry is string => Boolean(entry)) : undefined;

const oneOf = <T extends string>(value: unknown, allowed: readonly { value: T }[]): T | undefined =>
  allowed.some((entry) => entry.value === value) ? (value as T) : undefined;

/** Settings read from an edition, every field falling back to the default. */
export function reactionSettingsFrom(raw: unknown): ReactionSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lists = Object.fromEntries(REACTION_LISTS.map((list) => [list, stringList(data[list]) ?? DEFAULT_REACTIONS[list]])) as Pick<ReactionSettings, ReactionList>;
  const closeFor = stringList(data.closeFor)?.filter((value) => (RACI_VALUES as readonly string[]).includes(value));
  return {
    ...lists,
    readCloses: oneOf(data.readCloses, READ_CLOSES) ?? DEFAULT_REACTIONS.readCloses,
    replyMeans: oneOf(data.replyMeans, REPLY_MEANS) ?? DEFAULT_REACTIONS.replyMeans,
    closeFor: closeFor ?? DEFAULT_REACTIONS.closeFor,
  };
}

/** The holder's own edition key: their inbox role without the `inbox-` prefix. */
export function reactionsKey(holder: string): string {
  return `${REACTIONS_EDITION}-${holder.startsWith('inbox-') ? holder.slice('inbox-'.length) : holder}`;
}

export interface ReactionRow {
  view: InboxView;
  stage: InboxStage;
  raci?: string;
  need?: string;
}

export interface HolderSignals {
  /** Reaction names the holder put on the source message. */
  reactions: string[];
  /** Whether the holder replied in the source thread after the item arrived. */
  replied: boolean;
}

export interface ReactionDecision {
  decision: string;
  /** The reaction that decided it, when one did. */
  emoji?: string;
  reason: string;
}

const CLOSING = new Set<string>([TRIAGE_DECISION.HANDLE, TRIAGE_DECISION.DISMISS]);

function firstMatch(settings: ReactionSettings, list: ReactionList, reactions: string[]): string | undefined {
  const wanted = new Set(settings[list].map((name) => normalizeReaction(name)));
  return reactions.find((name) => wanted.has(normalizeReaction(name)));
}

/**
 * The decision the holder's signals amount to on one open row, or undefined
 * when they amount to none. Done, approved and dismissed beat the rest; an
 * on-it emoji followed by a reply is done; a ticket or a bare on-it emoji
 * only applies to a fresh triage row; a read emoji
 * closes what the settings say it closes; a reply means what the holder
 * chose. A close applies only for the roles in `closeFor`, never on a draft.
 */
export function decideFromReactions(settings: ReactionSettings, row: ReactionRow, signals: HolderSignals): ReactionDecision | undefined {
  if (row.view === INBOX_VIEW.DRAFT) return undefined;
  const mayClose = !row.raci || settings.closeFor.includes(row.raci);
  const fresh = row.view === INBOX_VIEW.TRIAGE;
  const pick = (list: ReactionList) => firstMatch(settings, list, signals.reactions);

  const approved = pick('approved');
  if (approved && mayClose) return { decision: TRIAGE_DECISION.HANDLE, emoji: approved, reason: row.need === 'approve' || row.need === 'review' ? `approved with :${approved}:` : `done, marked :${approved}:` };
  const done = pick('done');
  if (done && mayClose) return { decision: TRIAGE_DECISION.HANDLE, emoji: done, reason: `done, marked :${done}:` };
  const dismissed = pick('dismissed');
  if (dismissed && mayClose) return { decision: TRIAGE_DECISION.DISMISS, emoji: dismissed, reason: `dismissed with :${dismissed}:` };
  const ticket = pick('ticket');
  if (ticket && fresh) return { decision: TRIAGE_DECISION.FILE_TICKET, emoji: ticket, reason: `ticket asked for with :${ticket}:` };
  const onIt = pick('onIt');
  if (onIt && signals.replied && mayClose) return { decision: TRIAGE_DECISION.HANDLE, emoji: onIt, reason: `on it with :${onIt}:, then you replied in the thread` };
  if (onIt && fresh) return { decision: TRIAGE_DECISION.ON_IT, emoji: onIt, reason: `on it, marked :${onIt}:` };
  const read = pick('read');
  if (read && mayClose && (settings.readCloses === 'always' || (settings.readCloses === 'fyi' && row.stage === INBOX_STAGE.FYI))) {
    return { decision: TRIAGE_DECISION.HANDLE, emoji: read, reason: `read, marked :${read}:` };
  }
  if (signals.replied) {
    if (settings.replyMeans === 'done' && mayClose) return { decision: TRIAGE_DECISION.HANDLE, reason: 'you replied in the thread' };
    if (settings.replyMeans === 'on-it' && fresh) return { decision: TRIAGE_DECISION.ON_IT, reason: 'you replied in the thread' };
  }
  return undefined;
}

export const closesItem = (decision: string): boolean => CLOSING.has(decision);

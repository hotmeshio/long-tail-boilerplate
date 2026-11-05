/**
 * inboxPreferences: one row in the holder's inbox where they say what their
 * own reactions mean. It opens pre-filled with what is in force (their own
 * edition, else the org's, else the default); submitting saves their edition
 * under their name, and the agent reads it on every pass. Invoked by the
 * holder, by their agent acting as them, or by the binder when an inbox is
 * first bound, so the first row a new holder sees shows what is possible.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import { parseAnswer } from '../contracts';
import { FACET, present, sectionEnvelope } from '../facets';
import { RACI, ROW_TYPE, SECTION } from '../types';
import * as activities from './activities';
import type { ReactionSource } from './activities';
import { safeMarkdown } from './brief';
import { parsePreferences, type PreferencesForm } from './contracts';
import { holderFor, refusalFor } from './ownership';
import {
  PREFERENCES_WORKFLOW,
  READ_CLOSES,
  REPLY_MEANS,
  formatReactionList,
  parseReactionList,
  type ReactionSettings,
} from './reactions';
import { INBOX_PREFERENCES_PRIORITY, INBOX_PREFERENCES_TIMEOUT, INBOX_STAGE, PREFERENCES_SUBTYPE } from './types';

const { readReactionSettings, storeReactionSettings, holderAccount } = Durable.workflow.proxyActivities<typeof activities>({ activities });

export interface PreferencesInput {
  /** The holder's inbox role, e.g. `inbox-sam`; omitted, the caller's own inbox. */
  holder?: string;
}

export interface PreferencesResult {
  holder: string;
  saved: boolean;
  key?: string;
  refused?: string;
  cancelled?: true;
  expired?: true;
}

const SOURCE_LINE: Record<ReactionSource, string> = {
  holder: 'These are your own settings.',
  org: "These are the org's defaults; you have not saved your own yet.",
  default: 'These are the built-in defaults; you have not saved your own yet.',
};

const label = <T extends string>(options: readonly { value: T; label: string }[], value: T) => options.find((entry) => entry.value === value)?.label ?? value;

/** The card above the form: what reactions do, and what is in force now. */
export function preferencesBrief(settings: ReactionSettings, source: ReactionSource): string {
  const show = (names: string[]) => safeMarkdown(formatReactionList(names)) || '_none_';
  return [
    '#### Your reactions',
    '',
    'Your emoji on a message that landed in this inbox is your decision. Your agent reads it on every pass and closes, parks or files the item for you; the thread itself is untouched. Paste the emoji you actually use, from Slack or anywhere; `:name:` works too, and several per box.',
    '',
    '| Emoji | Means |',
    '|---|---|',
    `| ${show(settings.done)} | **Done.** Closed as handled. |`,
    `| ${show(settings.approved)} | **Approved.** Closed as handled, noted as your approval. |`,
    `| ${show(settings.onIt)} | **On it.** Stays open and waits on you. |`,
    `| ${show(settings.read)} | **Read.** Closes what the setting below allows. |`,
    `| ${show(settings.dismissed)} | **Not mine.** Dismissed. |`,
    `| ${show(settings.ticket)} | **Ticket.** Your agent files the issue. |`,
    '',
    `A Read emoji closes: ${label(READ_CLOSES, settings.readCloses).toLowerCase()}. Your reply in the thread means: ${label(REPLY_MEANS, settings.replyMeans).toLowerCase()}. A reaction closes an item only when your role on it is ${settings.closeFor.join(', ') || 'none'}.`,
    '',
    `${SOURCE_LINE[source]} Submit to save yours; it is kept under your name, versioned, and you can change it any time by asking your agent or by opening this row again.`,
  ].join('\n');
}

/** The row the holder decides on; its answer is the next edition. */
export function preferencesRow(holder: string, settings: ReactionSettings, source: ReactionSource, assignee?: string) {
  const brief = preferencesBrief(settings, source);
  return {
    ...(assignee ? { assignee } : {}),
    type: ROW_TYPE,
    subtype: PREFERENCES_SUBTYPE,
    role: holder,
    workflowType: PREFERENCES_WORKFLOW,
    priority: INBOX_PREFERENCES_PRIORITY,
    description: 'Your reactions: what your emoji mean',
    timeout: INBOX_PREFERENCES_TIMEOUT,
    metadata: present({
      [FACET.HOLDER]: holder,
      [FACET.SEAT]: holder,
      [FACET.SECTION]: SECTION.PREFERENCES,
      [FACET.STAGE]: INBOX_STAGE.NEW,
      [FACET.RACI]: RACI.RESPONSIBLE,
    }),
    envelope: {
      ...sectionEnvelope(SECTION.PREFERENCES, brief),
      formDefaults: {
        brief,
        preferences: {
          done: formatReactionList(settings.done),
          approved: formatReactionList(settings.approved),
          onIt: formatReactionList(settings.onIt),
          read: formatReactionList(settings.read),
          dismissed: formatReactionList(settings.dismissed),
          ticket: formatReactionList(settings.ticket),
          readCloses: settings.readCloses,
          replyMeans: settings.replyMeans,
          closeFor: settings.closeFor,
        },
      },
    },
  };
}

/** The submitted form as settings: a cleared box is an empty list; an untouched choice keeps what was in force. */
export function settingsFromForm(form: PreferencesForm, current: ReactionSettings): ReactionSettings {
  return {
    done: parseReactionList(form.done),
    approved: parseReactionList(form.approved),
    onIt: parseReactionList(form.onIt),
    read: parseReactionList(form.read),
    dismissed: parseReactionList(form.dismissed),
    ticket: parseReactionList(form.ticket),
    readCloses: form.readCloses ?? current.readCloses,
    replyMeans: form.replyMeans ?? current.replyMeans,
    closeFor: form.closeFor?.length ? form.closeFor : current.closeFor,
  };
}

export async function inboxPreferences(envelope: LTEnvelope): Promise<{ type: 'return'; data: PreferencesResult }> {
  const { workflowId } = Durable.workflow.workflowInfo();
  const input = envelope.data as PreferencesInput;
  const holder = holderFor(envelope, input?.holder) ?? '';
  const refused = refusalFor(envelope, holder || undefined) ?? (holder.startsWith('inbox-') ? undefined : 'The row needs an inbox role.');
  if (refused) return { type: 'return', data: { holder, saved: false, refused } };

  const { settings, source } = await readReactionSettings({ holder });
  const { userId } = await holderAccount({ holder });
  const answer = parseAnswer(await conditional<Record<string, unknown>>(`${workflowId}-prefs`, preferencesRow(holder, settings, source, userId)), parsePreferences);
  if (answer === null) return { type: 'return', data: { holder, saved: false, cancelled: true } };
  if (answer === false) return { type: 'return', data: { holder, saved: false, expired: true } };

  const { key } = await storeReactionSettings({ holder, settings: settingsFromForm(answer, settings) });
  return { type: 'return', data: { holder, saved: true, key } };
}

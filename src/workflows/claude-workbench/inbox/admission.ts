/**
 * Admission, pure: an item the AI reported or a person added is read against
 * the vocabulary in force, given its id from its source, and opened on the
 * decision the rules suggest. Data is never trusted.
 */

import { HEADLINE_MAX_LENGTH } from '../types';
import { INBOX_DEFAULT_PRIORITY, INBOX_SOURCES, type InboxSource, type ItemSpec, type Rule, type Suggestion, type Vocabulary } from './types';

const text = (raw: Record<string, unknown>, key: string): string | undefined => {
  const value = raw[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const inList = (value: string | undefined, list: string[]) => (value && list.includes(value) ? value : undefined);

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** One workflow per source thing: a thread, an issue, a day; a note gets its own id. */
export function itemWorkflowId(item: ItemSpec): string {
  const anchor = item.threadTs ?? item.messageTs ?? item.sentAt ?? slug(item.headline);
  const where = item.channelId ? `-${slug(item.channelId)}` : '';
  return `inbox-${slug(item.holder)}-${item.source}${where}-${slug(anchor)}`;
}

/** The first rule whose fields all match; a rule only suggests. */
export function suggestionFor(item: Pick<ItemSpec, 'kind' | 'category' | 'need' | 'raci'>, rules: Rule[]): Suggestion | undefined {
  const match = (rule: Rule) =>
    (rule.when.kind === undefined || rule.when.kind === item.kind) &&
    (rule.when.category === undefined || rule.when.category === item.category) &&
    (rule.when.need === undefined || rule.when.need === item.need) &&
    (rule.when.raci === undefined || rule.when.raci === item.raci);
  return rules.find(match)?.suggests;
}

/**
 * An item from raw data. An unknown kind refuses it; an out-of-vocabulary
 * category, need or RACI is dropped; a suggestion the reporter sent is
 * replaced by the rules'.
 */
export function readItem(raw: unknown, vocabulary: Vocabulary, defaults: { holder: string; source: InboxSource }): ItemSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  const kind = inList(text(data, 'kind'), vocabulary.kinds);
  const headline = text(data, 'headline');
  const summary = text(data, 'summary');
  if (!kind || !headline || !summary) return undefined;

  const priorityRaw = Number(data.priority);
  const priority = Number.isInteger(priorityRaw) && priorityRaw >= 1 && priorityRaw <= 4 ? priorityRaw : INBOX_DEFAULT_PRIORITY;
  const source = (INBOX_SOURCES as readonly string[]).includes(String(data.source)) ? (data.source as InboxSource) : defaults.source;

  const item: ItemSpec = {
    holder: text(data, 'holder') ?? defaults.holder,
    source,
    kind,
    priority,
    headline: headline.slice(0, HEADLINE_MAX_LENGTH),
    summary,
  };
  const optional: (keyof ItemSpec)[] = ['permalink', 'channelId', 'channelName', 'messageTs', 'threadTs', 'fromName', 'team', 'sentAt'];
  for (const key of optional) {
    const value = text(data, key);
    if (value) (item as unknown as Record<string, unknown>)[key] = value;
  }
  const category = inList(text(data, 'category'), vocabulary.categories);
  const need = inList(text(data, 'need'), vocabulary.needs);
  const raci = inList(text(data, 'raci'), vocabulary.raci);
  if (category) item.category = category;
  if (need) item.need = need;
  if (raci) item.raci = raci;

  const suggestion = suggestionFor(item, vocabulary.rules);
  if (suggestion) item.suggestion = suggestion;
  return item;
}

/** The items a check reported, read in order; unreadable ones are dropped. */
export function admit(rawItems: unknown[], vocabulary: Vocabulary, defaults: { holder: string; source: InboxSource }, max: number): ItemSpec[] {
  return rawItems
    .slice(0, max)
    .map((raw) => readItem(raw, vocabulary, defaults))
    .filter((item): item is ItemSpec => item !== undefined);
}

/** The watermark only moves forward. */
export function laterWatermark(current: string | undefined, checked: string | undefined): string | undefined {
  if (!checked) return current;
  if (!current) return checked;
  const a = Number(current);
  const b = Number(checked);
  if (Number.isFinite(a) && Number.isFinite(b)) return b > a ? checked : current;
  return checked > current ? checked : current;
}

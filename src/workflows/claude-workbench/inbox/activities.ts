/**
 * Inbox activities: the vocabulary in force (with the starter set as the
 * fallback) and the corrections the holder makes, kept as an edition the AI
 * reads before it classifies. Both are safe to run twice.
 */

import { KnowledgeApi } from '@hotmeshio/long-tail';
import { Pool } from 'pg';

import { DB_CONFIG } from '../../../config/database';
import { HOLDERS, ORG_DOMAIN } from '../types';
import { INBOX_CORRECTIONS_KEPT, type Correction, type Rule, type Vocabulary } from './types';
import { INBOX_EDITION, STARTER_VOCABULARY, editionValues, readRule } from './vocabulary';

function entryData(result: { status: number; data?: any }): unknown {
  if (result.status !== 200 || result.data?.found === false) return undefined;
  return result.data?.data ?? result.data;
}

async function currentValues(key: string): Promise<string[] | undefined> {
  return editionValues(entryData(await KnowledgeApi.getEntry({ domain: ORG_DOMAIN, key })));
}

/** The vocabulary and rules in force, each falling back to the starter set when unreadable. */
export async function readInboxVocabulary(): Promise<Vocabulary> {
  const [kinds, categories, needs, raci, rulesData] = await Promise.all([
    currentValues(INBOX_EDITION.KINDS),
    currentValues(INBOX_EDITION.CATEGORIES),
    currentValues(INBOX_EDITION.NEEDS),
    currentValues('raci'),
    KnowledgeApi.getEntry({ domain: ORG_DOMAIN, key: INBOX_EDITION.RULES }).then(entryData),
  ]);
  const ruleItems = (rulesData as { items?: unknown[] } | undefined)?.items;
  const rules = Array.isArray(ruleItems) ? ruleItems.map(readRule).filter((rule): rule is Rule => rule !== undefined) : [];
  return {
    kinds: kinds ?? STARTER_VOCABULARY.kinds,
    categories: categories ?? STARTER_VOCABULARY.categories,
    needs: needs ?? STARTER_VOCABULARY.needs,
    raci: raci ?? STARTER_VOCABULARY.raci,
    rules: rules.length ? rules : STARTER_VOCABULARY.rules,
  };
}

/**
 * The account that owns an inbox, by the email its holder was configured with.
 * Rows open pre-assigned to it: a durable routing hint with no claim window,
 * so they stay available and appear under the holder's own items without a
 * claim. Undefined when the holder has no email or no account yet.
 */
export async function holderAccount(input: { holder: string }): Promise<{ userId?: string }> {
  const holder = HOLDERS.find((entry) => entry.role === input.holder);
  if (!holder?.email) return {};
  const pool = new Pool(DB_CONFIG);
  try {
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM lt_users WHERE lower(email) = $1 AND account_type <> 'bot' LIMIT 1`, [holder.email]);
    return rows.length ? { userId: rows[0].id } : {};
  } finally {
    await pool.end();
  }
}

/** A source timestamp this many hours ago, as the first watermark of a sweep. */
export async function watermarkHoursAgo(input: { hours: number }): Promise<{ watermark: string }> {
  return { watermark: `${Math.floor((Date.now() - input.hours * 3_600_000) / 1000)}.000000` };
}

/** Keep a re-filing, once per decision, newest last, capped. */
export async function recordCorrection(correction: Correction): Promise<{ recorded: boolean }> {
  const existing = entryData(await KnowledgeApi.getEntry({ domain: ORG_DOMAIN, key: INBOX_EDITION.CORRECTIONS }));
  const items: Correction[] = Array.isArray((existing as { items?: unknown[] } | undefined)?.items) ? ((existing as { items: Correction[] }).items) : [];
  if (items.some((entry) => entry.signalId === correction.signalId)) return { recorded: false };
  const kept = [...items, correction].slice(-INBOX_CORRECTIONS_KEPT);
  const result = await KnowledgeApi.storeEntry({ domain: ORG_DOMAIN, key: INBOX_EDITION.CORRECTIONS, data: { items: kept }, tags: ['org', 'workbench', 'inbox'], replace: true });
  if (result.status >= 400) throw new Error(`org/${INBOX_EDITION.CORRECTIONS}: ${result.error ?? result.status}`);
  return { recorded: true };
}

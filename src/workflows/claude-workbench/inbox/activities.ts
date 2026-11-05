/**
 * Inbox activities: the vocabulary in force (with the starter set as the
 * fallback) and the corrections the holder makes, kept as an edition the AI
 * reads before it classifies. Both are safe to run twice.
 */

import { Durable } from '@hotmeshio/hotmesh';
import { KnowledgeApi } from '@hotmeshio/long-tail';
import { Pool } from 'pg';

import { getConnection } from '../../../config/connection';
import { DB_CONFIG } from '../../../config/database';
import { CLAUDE_WORKBENCH_QUEUE, ORG_DOMAIN } from '../types';
import { DEFAULT_REACTIONS, reactionSettingsFrom, reactionsKey, type ReactionSettings } from './reactions';
import { INBOX_CORRECTIONS_KEPT, INBOX_ITEM_EXPIRE_SECONDS, type Correction, type ItemSpec, type Rule, type Vocabulary } from './types';
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
 * The account that owns an inbox. Rows no longer open assigned to it; the
 * sweep and item still call this so earlier runs replay the same sequence.
 * The account is whoever holds the holder's persona, which covers
 * holders named in code and holders bound from a domain rule alike.
 * Undefined when nobody holds it yet.
 */
export async function holderAccount(input: { holder: string }): Promise<{ userId?: string }> {
  if (!input.holder.startsWith('inbox-')) return {};
  const persona = input.holder.slice('inbox-'.length);
  const pool = new Pool(DB_CONFIG);
  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT u.id FROM lt_users u
       JOIN lt_user_personas up ON up.user_id = u.id
       JOIN lt_personas p ON p.id = up.persona_id
       WHERE p.key = $1 AND u.account_type <> 'bot' AND u.status = 'active'
       ORDER BY up.created_at LIMIT 1`,
      [persona],
    );
    return rows.length ? { userId: rows[0].id } : {};
  } finally {
    await pool.end();
  }
}

/**
 * Start one item under its source id; false when that id is already taken.
 * Started here rather than as a child: a child start on a taken id parks the
 * parent with no reply, while a client start throws. Safe to retry.
 */
export async function startInboxItem(input: { workflowId: string; item: ItemSpec }): Promise<{ started: boolean }> {
  const client = new Durable.Client({ connection: getConnection() });
  try {
    await client.workflow.start({
      taskQueue: CLAUDE_WORKBENCH_QUEUE,
      workflowName: 'inboxItem',
      workflowId: input.workflowId,
      args: [{ data: input.item, metadata: {} }],
      expire: INBOX_ITEM_EXPIRE_SECONDS,
    });
    return { started: true };
  } catch (err) {
    if (/duplicate/i.test(String((err as Error)?.message ?? err))) return { started: false };
    throw err;
  }
}

/** A source timestamp this many hours ago, as the first watermark of a sweep. */
export async function watermarkHoursAgo(input: { hours: number }): Promise<{ watermark: string }> {
  return { watermark: `${Math.floor((Date.now() - input.hours * 3_600_000) / 1000)}.000000` };
}

export type ReactionSource = 'holder' | 'org' | 'default';

/** What the holder's reactions mean: their own edition, else the org's, else the code default. */
export async function readReactionSettings(input: { holder: string }): Promise<{ settings: ReactionSettings; source: ReactionSource }> {
  const own = entryData(await KnowledgeApi.getEntry({ domain: ORG_DOMAIN, key: reactionsKey(input.holder) }));
  if (own) return { settings: reactionSettingsFrom(own), source: 'holder' };
  const org = entryData(await KnowledgeApi.getEntry({ domain: ORG_DOMAIN, key: INBOX_EDITION.REACTIONS }));
  if (org) return { settings: reactionSettingsFrom(org), source: 'org' };
  return { settings: DEFAULT_REACTIONS, source: 'default' };
}

/** Write the holder's own edition; every save mints the next version. */
export async function storeReactionSettings(input: { holder: string; settings: ReactionSettings }): Promise<{ key: string }> {
  const key = reactionsKey(input.holder);
  const result = await KnowledgeApi.storeEntry({ domain: ORG_DOMAIN, key, data: { ...input.settings }, tags: ['org', 'workbench', 'inbox', 'reactions'], replace: true });
  if (result.status >= 400) throw new Error(`org/${key}: ${result.error ?? result.status}`);
  return { key };
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

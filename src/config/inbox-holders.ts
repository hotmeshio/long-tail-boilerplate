/**
 * Binds personal inboxes to accounts. WORKBENCH_INBOX_HOLDERS names holders
 * (whose roles exist from boot) and domains (a rule). An account whose email
 * matches gets its two roles, its persona and the assignment the first time
 * the binder sees it: at boot, then on a short interval in the api process.
 * Every step is idempotent, so a pass over bound accounts changes nothing.
 */

import { Pool } from 'pg';
import { api } from '@hotmeshio/long-tail';

import { DB_CONFIG } from './database';
import { HOLDERS, INBOX_ENTRIES, holderForEmail, holderPersona, holderRoleConfigs, type InboxEntries, type InboxHolder } from '../workflows/claude-workbench';

export const INBOX_BIND_SECONDS = Math.max(5, Number(process.env.WORKBENCH_INBOX_BIND_SECONDS ?? 15));

export interface InboxAccount {
  id: string;
  email: string;
  /** The persona keys the account already holds. */
  personas: string[];
}

export interface Binding {
  account: InboxAccount;
  holder: InboxHolder;
  /** True when the holder's roles are not declared in code and must be made by the binder. */
  dynamic: boolean;
}

/** Pure: which accounts are entitled to an inbox they do not hold yet. */
export function unboundHolders(accounts: InboxAccount[], entries: InboxEntries = INBOX_ENTRIES, named: InboxHolder[] = HOLDERS): Binding[] {
  const bindings: Binding[] = [];
  for (const account of accounts) {
    const holder = holderForEmail(account.email, entries);
    if (!holder || account.personas.includes(holder.persona)) continue;
    bindings.push({ account, holder, dynamic: !named.some((entry) => entry.name === holder.name) });
  }
  return bindings;
}

/** Pure: the holders whose roles live only in the database, for a schema refresh at boot. */
export function dynamicHolders(accounts: InboxAccount[], entries: InboxEntries = INBOX_ENTRIES, named: InboxHolder[] = HOLDERS): InboxHolder[] {
  const seen = new Map<string, InboxHolder>();
  for (const account of accounts) {
    const holder = holderForEmail(account.email, entries);
    if (holder && !named.some((entry) => entry.name === holder.name)) seen.set(holder.name, holder);
  }
  return [...seen.values()];
}

const ACCOUNTS_SQL = `
  SELECT u.id, lower(u.email) AS email,
         coalesce(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS personas
  FROM lt_users u
  LEFT JOIN lt_user_personas up ON up.user_id = u.id
  LEFT JOIN lt_personas p ON p.id = up.persona_id
  WHERE u.email IS NOT NULL AND u.account_type <> 'bot' AND u.status = 'active'
  GROUP BY u.id`;

async function readAccounts(): Promise<InboxAccount[]> {
  const pool = new Pool(DB_CONFIG);
  try {
    const { rows } = await pool.query<InboxAccount>(ACCOUNTS_SQL);
    return rows;
  } finally {
    await pool.end();
  }
}

const failed = (what: string, result: { status: number; error?: string }) => new Error(`${what}: ${result.error ?? result.status}`);

/** Create the holder's two roles if absent, then apply the seat config so a code change reaches them. */
async function ensureRoles(holder: InboxHolder) {
  for (const config of holderRoleConfigs(holder)) {
    const { role, reset: _reset, ...rest } = config;
    const created = await api.roles.createRole({ role });
    if (created.status >= 400 && created.status !== 409) throw failed(`role ${role}`, created);
    const updated = await api.roles.updateRole({ role, ...rest });
    if (updated.status >= 400) throw failed(`role ${role}`, updated);
  }
}

async function bind({ account, holder, dynamic }: Binding) {
  if (dynamic) await ensureRoles(holder);
  const seeded = await api.personas.seedPersonas({ personas: [holderPersona(holder)] });
  if (seeded.status >= 400) throw failed(`persona ${holder.persona}`, seeded);
  const assigned = await api.personas.assignPersona({ id: account.id, key: holder.persona });
  if (assigned.status >= 400) throw failed(`assign ${holder.persona}`, assigned);
  console.log(`[inbox] bound ${holder.role} to ${account.email}`);
}

/**
 * One pass: bind every entitled account that lacks its persona. With
 * `refreshRoles`, also re-apply the seat config to roles the binder made
 * earlier, so they track the code the same way the boot-declared roles do.
 */
export async function bindInboxHolders(options: { refreshRoles?: boolean } = {}): Promise<number> {
  if (!INBOX_ENTRIES.domains.length && !HOLDERS.some((holder) => holder.email)) return 0;
  const accounts = await readAccounts();
  const pending = unboundHolders(accounts);
  for (const binding of pending) await bind(binding);
  if (options.refreshRoles) {
    const bound = new Set(pending.map((binding) => binding.holder.name));
    for (const holder of dynamicHolders(accounts)) if (!bound.has(holder.name)) await ensureRoles(holder);
  }
  return pending.length;
}

/** Bind now, then keep binding on an interval. The timer never holds the process open. */
export function startInboxBinding(): () => void {
  if (!INBOX_ENTRIES.domains.length) return () => undefined;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await bindInboxHolders();
    } catch (err: any) {
      console.error('[inbox] binding pass failed (will retry):', err.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, INBOX_BIND_SECONDS * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

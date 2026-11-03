/**
 * Binds personal inboxes to accounts. WORKBENCH_INBOX_HOLDERS names holders
 * (whose roles exist from boot) and domains (a rule). An account whose email
 * matches gets its two roles, its persona and the assignment the first time
 * the binder sees it: at boot, then on a short interval in the api process.
 * Each pass also opens the inbox workflows to every bound holder's roles, so
 * a holder's own agent can start their sweep. Every step is idempotent, so a
 * pass over bound accounts changes nothing.
 */

import { Pool } from 'pg';
import { api } from '@hotmeshio/long-tail';

import { DB_CONFIG } from './database';
import { HOLDERS, HOLDER_INVOCABLE_WORKFLOWS, INBOX_ENTRIES, PREFERENCES_WORKFLOW, holderForEmail, holderPersona, holderRoleConfigs, type InboxEntries, type InboxHolder } from '../workflows/claude-workbench';

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

/** The roles holders invoke the inbox workflows with, inbox then agent queue per holder, holders by name so the worker and the binder write the same list. */
export function holderInvocationRoles(holders: InboxHolder[]): string[] {
  return [...holders].sort((a, b) => a.name.localeCompare(b.name)).flatMap((holder) => [holder.role, holder.agentRole]);
}

/** Pure: the stored invocation list with the roles it lacks appended, or undefined when it lacks none. */
export function widenedInvocationRoles(stored: string[], roles: string[]): string[] | undefined {
  const missing = roles.filter((role) => !stored.includes(role));
  return missing.length ? [...stored, ...missing] : undefined;
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

/**
 * The invocation roles of every holder bound from a domain rule, for the
 * worker's code-owned configs at boot. Empty when the database cannot answer
 * yet; the binder opens the workflows on its next pass in that case.
 */
export async function boundHolderRoles(): Promise<string[]> {
  if (!INBOX_ENTRIES.domains.length) return [];
  try {
    return holderInvocationRoles(dynamicHolders(await readAccounts()));
  } catch (err: any) {
    console.error('[inbox] bound holders unreadable at boot (the binder will open the workflows later):', err.message);
    return [];
  }
}

/** Add the roles to the stored invocation list of each holder-invocable workflow that lacks them. */
async function openWorkflows(roles: string[]) {
  if (!roles.length) return;
  for (const type of HOLDER_INVOCABLE_WORKFLOWS) {
    const current = await api.workflows.getWorkflowConfig({ type });
    if (current.status === 404) continue;
    if (current.status >= 400) throw failed(`workflow ${type}`, current);
    const { workflow_type, tier: _tier, input_lookup_data: _lookups, created_at: _created, updated_at: _updated, ...rest } = current.data;
    const widened = widenedInvocationRoles(rest.invocation_roles ?? [], roles);
    if (!widened) continue;
    const saved = await api.workflows.upsertWorkflowConfig({ ...rest, type: workflow_type, invocation_roles: widened });
    if (saved.status >= 400) throw failed(`workflow ${type}`, saved);
    console.log(`[inbox] ${type} open to ${widened.length - (rest.invocation_roles?.length ?? 0)} more holder roles`);
  }
}

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
 * The first row a new holder sees: what their reactions mean, pre-filled,
 * started as them so the row is theirs. Not fatal: they or their agent can
 * invoke it later.
 */
async function parkPreferences({ account, holder }: Binding) {
  const started = await api.workflows.invokeWorkflow(
    { type: PREFERENCES_WORKFLOW, data: { holder: holder.role }, options: { workflowId: `${PREFERENCES_WORKFLOW}-${holder.name}-welcome` } },
    { userId: account.id },
  );
  if (started.status >= 400) console.error(`[inbox] reactions row for ${holder.role} not parked (${started.error ?? started.status}); invoke ${PREFERENCES_WORKFLOW} later`);
}

/**
 * One pass: bind every entitled account that lacks its persona, make sure
 * the inbox workflows accept every bound holder's roles (the worker writes
 * the code-owned list at its boot; this heals whatever it missed), then park
 * the reactions row for each holder bound in this pass. With `refreshRoles`,
 * also re-apply the seat config to roles the binder made earlier, so they
 * track the code the same way the boot-declared roles do.
 */
export async function bindInboxHolders(options: { refreshRoles?: boolean } = {}): Promise<number> {
  if (!INBOX_ENTRIES.domains.length && !HOLDERS.some((holder) => holder.email)) return 0;
  const accounts = await readAccounts();
  const pending = unboundHolders(accounts);
  for (const binding of pending) await bind(binding);
  const dynamic = dynamicHolders(accounts);
  if (options.refreshRoles) {
    const bound = new Set(pending.map((binding) => binding.holder.name));
    for (const holder of dynamic) if (!bound.has(holder.name)) await ensureRoles(holder);
  }
  await openWorkflows(holderInvocationRoles(dynamic));
  for (const binding of pending) await parkPreferences(binding);
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

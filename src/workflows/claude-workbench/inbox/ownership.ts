/**
 * Who may start a sweep or admit an item for a holder. Long Tail stamps the
 * caller's resolved principal (`envelope.lt`) on every run it starts from the
 * API; a run the engine starts itself (a child, a continuation) carries none
 * and is trusted. A caller acts for an inbox they hold, or for any inbox when
 * they hold an admin or superadmin grant.
 */

import type { LTEnvelope } from '@hotmeshio/long-tail';

/** The workflows a holder may invoke for their own inbox. */
export const HOLDER_INVOCABLE_WORKFLOWS = ['inboxSweep', 'inboxItem', 'inboxPreferences'] as const;

const ADMIN_TYPES = new Set(['admin', 'superadmin']);

/** The agent queue paired with an inbox role. */
export function agentRoleOf(holder: string): string {
  return holder.startsWith('inbox-') ? `inbox-agent-${holder.slice('inbox-'.length)}` : holder;
}

/** Why the caller may not act for this holder, or undefined when they may. */
export function refusalFor(envelope: Pick<LTEnvelope, 'lt'>, holder: string | undefined): string | undefined {
  const lt = envelope.lt;
  if (!lt || (!lt.userId && !lt.principal)) return undefined;
  if (!lt.principal) return 'The caller could not be resolved to an account.';
  if (!holder) return 'The row needs a holder.';
  if (lt.principal.roleType && ADMIN_TYPES.has(lt.principal.roleType)) return undefined;
  const held = new Set(lt.principal.roles ?? []);
  if (held.has(holder) || held.has(agentRoleOf(holder))) return undefined;
  return `${lt.principal.displayName ?? lt.principal.id} does not hold ${holder}; only its holder or an admin may act for it.`;
}

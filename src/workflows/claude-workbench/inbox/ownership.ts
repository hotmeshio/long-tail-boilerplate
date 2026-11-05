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

const INBOX_PREFIX = 'inbox-';
const AGENT_PREFIX = 'inbox-agent-';

/** The inbox roles a set of held roles stands for; an agent role stands for its inbox. */
function inboxesHeld(roles: readonly string[]): string[] {
  const inboxes = roles
    .filter((role) => role.startsWith(INBOX_PREFIX))
    .map((role) => (role.startsWith(AGENT_PREFIX) ? `${INBOX_PREFIX}${role.slice(AGENT_PREFIX.length)}` : role));
  return [...new Set(inboxes)];
}

/**
 * The inbox a run is for: the one it names, else the caller's own inbox when
 * they hold exactly one. Pure, so replay reads the same envelope the same way.
 */
export function holderFor(envelope: Pick<LTEnvelope, 'lt'>, named: string | undefined): string | undefined {
  if (named) return named;
  const held = inboxesHeld(envelope.lt?.principal?.roles ?? []);
  return held.length === 1 ? held[0] : undefined;
}

/** Why the caller may not act for this holder, or undefined when they may. */
export function refusalFor(envelope: Pick<LTEnvelope, 'lt'>, holder: string | undefined): string | undefined {
  const lt = envelope.lt;
  if (!lt || (!lt.userId && !lt.principal)) return undefined;
  if (!lt.principal) return 'The caller could not be resolved to an account.';
  if (!holder) return 'Name the inbox: the caller holds no inbox, or more than one.';
  if (lt.principal.roleType && ADMIN_TYPES.has(lt.principal.roleType)) return undefined;
  const held = new Set(lt.principal.roles ?? []);
  if (held.has(holder) || held.has(agentRoleOf(holder))) return undefined;
  return `${lt.principal.displayName ?? lt.principal.id} does not hold ${holder}; only its holder or an admin may act for it.`;
}

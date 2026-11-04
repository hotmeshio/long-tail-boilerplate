/**
 * Entry point for the Long Tail application.
 *
 * Configuration is assembled from `./config/`, which exports:
 * - **DB_CONFIG** — database connection (Postgres via env vars)
 * - **WORKERS** — workflow worker definitions (the assembly line)
 * - **READONLY_OBSERVERS** — lightweight observer copies for the API dashboard
 * - **MCP_SERVER_FACTORIES** — MCP tool servers exposed to agents
 * - **AGENTS** — LLM agent definitions wired into the escalation flow
 * - **seedIfEmpty()** — idempotent seed for default users/data
 *
 * The `APP_ROLE` env var splits this into two container images
 * (api + worker) in production, or runs everything in one
 * process for local dev.
 *
 * ## NATS event bus
 *
 * When `NATS_URL` is set (docker-compose and CDK both set it),
 * NATS replaces Socket.IO as the event transport. All three vars
 * flow through the declarative `events.nats` config:
 *
 * | Env var         | Purpose                                      |
 * |-----------------|----------------------------------------------|
 * | NATS_URL        | Internal server-to-NATS connection (4222)     |
 * | NATS_WS_TARGET  | Internal NATS WS endpoint for reverse proxy   |
 * | NATS_TOKEN      | Auth token (Secrets Manager in AWS, hardcoded locally) |
 */
try { require('dotenv/config'); } catch {}
import { start } from '@hotmeshio/long-tail';

import { DB_CONFIG, READONLY_OBSERVERS, workersWithHolders, boundHolderRoles, oauthProviders, oauthAllowedDomains, MCP_SERVER_FACTORIES, AGENTS, TOPICS, GRAPH_WORKFLOWS, HITL_ROLES, DOMAIN_DICTIONARY, seedIfEmpty, seedHitlLookups, seedPrintFarmIfEmpty, seedBambuFarmIfEmpty, seedPullFarmIfEmpty, seedWorkbenchOrg, startInboxBinding } from './config';

/** Controls which capabilities this process runs. */
const APP_ROLE = process.env.APP_ROLE as 'api' | 'worker' | undefined;

async function main() {
  const isWorker = APP_ROLE === 'worker';
  const isApi = APP_ROLE === 'api';

  // 1. Start Long Tail
  const lt = await start({
    database: DB_CONFIG,

    server: isWorker
      ? { enabled: false }
      : { port: parseInt(process.env.PORT || '3030') },

    auth: {
      secret: process.env.JWT_SECRET || 'change-me',
      // Dashboard sign-in with Google/GitHub/Microsoft (OAUTH_<PROVIDER>_CLIENT_ID in env).
      // Google is registered explicitly with identity scopes only (config/oauth.ts);
      // the library default would also ask for Gmail. Invite-only by default: a
      // sign-in must match an account an admin created (by email).
      // OAUTH_AUTO_PROVISION=true lets a sign-in create its own account, limited to
      // the domains in OAUTH_ALLOWED_DOMAINS (default: the domains in
      // WORKBENCH_INBOX_HOLDERS). Which accounts get a workbench inbox is
      // WORKBENCH_INBOX_HOLDERS (see config/inbox-holders.ts).
      oauth: { providers: oauthProviders(), autoProvision: process.env.OAUTH_AUTO_PROVISION === 'true', allowedDomains: oauthAllowedDomains() },
      // OAuth sign-in for MCP clients at /mcp. Loopback redirects (Claude Code)
      // are always allowed; https redirects must be listed exactly.
      oauthServer: process.env.LT_OAUTH_ISSUER
        ? {
            issuer: process.env.LT_OAUTH_ISSUER,
            allowedRedirectUris: (process.env.LT_OAUTH_ALLOWED_REDIRECT_URIS || '')
              .split(',')
              .map((uri) => uri.trim())
              .filter(Boolean),
          }
        : undefined,
    },

    // The worker owns the workflow configs; the inbox workflows open to every
    // holder bound so far, so a holder's own agent can start their sweep.
    workers: isApi ? READONLY_OBSERVERS : workersWithHolders(await boundHolderRoles()),

    graphWorkflows: GRAPH_WORKFLOWS,

    // Code-owned HITL roles: versioned forms and list pages (reset per entry).
    roles: HITL_ROLES,

    agents: AGENTS,

    topics: TOPICS,

    mcp: {
      serverFactories: MCP_SERVER_FACTORIES,
      // The front door for agents: terms, kill roads and runbooks; code-owned.
      domainDictionary: DOMAIN_DICTIONARY,
      domainDictionaryReset: true,
    },

    escalation: {
      strategy: 'mcp',
    },

    // NATS event bus — enabled when NATS_URL is set.
    // docker-compose sets: NATS_URL, NATS_WS_TARGET, NATS_TOKEN
    // CDK sets the same three via config and Secrets Manager.
    // wsProxy: internal target the server proxies to.
    // wsUrl: auto-derived from request headers (X-Forwarded-Proto/Host).
    events: process.env.NATS_URL
      ? {
          nats: {
            url: process.env.NATS_URL,
            wsProxy: process.env.NATS_WS_TARGET,
            token: process.env.NATS_TOKEN,
          },
        }
      : undefined,
  });

  // 2. Seed default users + print-farm operators (skipped for worker-only containers)
  if (!isWorker) {
    await seedIfEmpty();
    await seedHitlLookups();
    await seedPrintFarmIfEmpty();
    await seedBambuFarmIfEmpty();
    await seedPullFarmIfEmpty();
    await seedWorkbenchOrg();
    // 3. Bind inboxes to accounts as they sign in (domain rules in WORKBENCH_INBOX_HOLDERS)
    startInboxBinding();
  }

  // 4. Graceful shutdown
  process.on('SIGTERM', () => lt.shutdown());
  process.on('SIGINT', () => lt.shutdown());
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

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

import { DB_CONFIG, WORKERS, READONLY_OBSERVERS, MCP_SERVER_FACTORIES, AGENTS, TOPICS, GRAPH_WORKFLOWS, seedIfEmpty, seedPrintFarmIfEmpty, seedBambuFarmIfEmpty, seedPullFarmIfEmpty } from './config';

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
    },

    workers: isApi ? READONLY_OBSERVERS : WORKERS,

    graphWorkflows: GRAPH_WORKFLOWS,

    agents: AGENTS,

    topics: TOPICS,

    mcp: {
      serverFactories: MCP_SERVER_FACTORIES,
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
    await seedPrintFarmIfEmpty();
    await seedBambuFarmIfEmpty();
    await seedPullFarmIfEmpty();
  }

  // 4. Graceful shutdown
  process.on('SIGTERM', () => lt.shutdown());
  process.on('SIGINT', () => lt.shutdown());
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

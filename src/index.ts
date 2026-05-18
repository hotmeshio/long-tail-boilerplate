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
 */
try { require('dotenv/config'); } catch {}
import { start, NatsEventAdapter } from '@hotmeshio/long-tail';

import { DB_CONFIG, WORKERS, READONLY_OBSERVERS, MCP_SERVER_FACTORIES, AGENTS, seedIfEmpty } from './config';

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

    agents: AGENTS,

    mcp: {
      serverFactories: MCP_SERVER_FACTORIES,
    },

    escalation: {
      strategy: 'mcp',
    },

    events: process.env.NATS_URL
      ? { adapters: [new NatsEventAdapter({ url: process.env.NATS_URL, token: process.env.NATS_TOKEN })] }
      : undefined,
  });

  // 2. Seed default users (skipped for worker-only containers)
  if (!isWorker) {
    await seedIfEmpty();
  }

  // 3. Graceful shutdown
  process.on('SIGTERM', () => lt.shutdown());
  process.on('SIGINT', () => lt.shutdown());
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

try { require('dotenv/config'); } catch {}
import { start, NatsEventAdapter } from '@hotmeshio/long-tail';

import { DB_CONFIG, WORKERS, READONLY_OBSERVERS, MCP_SERVER_FACTORIES, AGENTS, seedIfEmpty } from './config';

// APP_ROLE controls the container's behavior:
//   'api'    — dashboard + REST API, readonly workflow observers
//   'worker' — workflow execution only, no HTTP server
//   unset    — full standalone mode (local dev via docker compose)
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

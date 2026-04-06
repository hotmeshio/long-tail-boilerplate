import 'dotenv/config';
import { start } from '@hotmeshio/long-tail';

import * as helloWorld from './workflows/hello-world';
import * as contentReview from './workflows/content-review';

async function main() {
  const lt = await start({
    database: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5433'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      database: process.env.POSTGRES_DB || 'myapp',
    },

    workers: [
      { taskQueue: 'default', workflow: helloWorld.helloWorkflow },
      { taskQueue: 'default', workflow: contentReview.reviewContent },
    ],

    auth: {
      secret: process.env.JWT_SECRET || 'change-me',
    },

    server: {
      port: parseInt(process.env.PORT || '3030'),
    },

    // Uncomment to enable MCP tool orchestration with escalation support:
    // escalation: { strategy: 'mcp' },
  });

  process.on('SIGTERM', () => lt.shutdown());
  process.on('SIGINT', () => lt.shutdown());
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

import 'dotenv/config';
import { start } from '@hotmeshio/long-tail';

import * as helloWorld from './workflows/hello-world';
import * as contentReview from './workflows/content-review';
import * as screenshotResearch from './workflows/screenshot-research';
import { assemblyLine } from './workflows/assembly-line';
import { workstation } from './workflows/assembly-line/worker';
import { stepIterator } from './workflows/assembly-line/iterator';
import { reverter } from './workflows/assembly-line/reverter';
import { createImageToolsServer } from './mcp-servers/image-tools';

async function main() {
  const lt = await start({
    database: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5416'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      database: process.env.POSTGRES_DB || 'myapp',
    },

    workers: [
      { taskQueue: 'default', workflow: helloWorld.helloWorkflow },
      { taskQueue: 'default', workflow: contentReview.reviewContent },
      { taskQueue: 'default', workflow: screenshotResearch.screenshotResearch },
      { taskQueue: 'assembly-line', workflow: assemblyLine },
      { taskQueue: 'assembly-line', workflow: workstation },
      { taskQueue: 'assembly-line', workflow: stepIterator },
      { taskQueue: 'assembly-line', workflow: reverter },
    ],

    auth: {
      secret: process.env.JWT_SECRET || 'change-me',
    },

    server: {
      port: parseInt(process.env.PORT || '3030'),
    },

    mcp: {
      serverFactories: {
        'image-tools': createImageToolsServer,
      },
    },
  });

  process.on('SIGTERM', () => lt.shutdown());
  process.on('SIGINT', () => lt.shutdown());
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

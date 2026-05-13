try { require('dotenv/config'); } catch {}
import { Pool } from 'pg';
import { start, NatsEventAdapter } from '@hotmeshio/long-tail';
import type { LTWorkerConfig, LTMcpServerConfig } from '@hotmeshio/long-tail';

import * as helloWorld from './workflows/hello-world';
import * as contentReview from './workflows/content-review';
import * as screenshotResearch from './workflows/screenshot-research';
import { assemblyLine } from './workflows/assembly-line';
import { workstation } from './workflows/assembly-line/worker';
import { stepIterator } from './workflows/assembly-line/iterator';
import { reverter } from './workflows/assembly-line/reverter';
import { createImageToolsServer } from './mcp-servers/image-tools';
import { IMAGE_TOOLS } from './mcp-servers/tool-manifests-image';
import { createGmailServer, GMAIL_SERVER_CONFIG } from './mcp-servers/gmail';

const bcrypt: any = require('bcryptjs');

// ── Constants ───────────────────────────────────────────────────────────────

const REVIEWER = 'reviewer';
const ENGINEER = 'engineer';
const ADMIN = 'admin';
const SUPERADMIN = 'superadmin';
const CERTIFIED_ROLES = [REVIEWER, ENGINEER, ADMIN];
const INVOCATION_ROLES = [SUPERADMIN, ENGINEER];

const DB_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5416'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'myapp',
};

// ── Worker configs ──────────────────────────────────────────────────────────

const helloWorldConfig: LTWorkerConfig = {
  description: 'Hello world — minimal durable workflow with sleep and IAM context',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  envelopeSchema: {
    data: { name: 'World' },
    metadata: { source: 'dashboard' },
  },
};

const contentReviewConfig: LTWorkerConfig = {
  description: 'Content review — AI-powered moderation with human escalation for low-confidence results',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: CERTIFIED_ROLES,
  envelopeSchema: {
    data: { contentId: 'article-001', content: 'Content to review...', contentType: 'article' },
    metadata: { certified: true, source: 'dashboard' },
  },
  resolverSchema: {
    approved: true,
    analysis: { confidence: 0.95, flags: [], summary: 'Manually reviewed and approved.' },
  },
};

const screenshotConfig: LTWorkerConfig = {
  description: 'Screenshot research — capture and analyze web pages using Playwright and Vision',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  envelopeSchema: {
    data: { url: 'https://example.com', description: 'Capture and analyze this page' },
    metadata: { source: 'dashboard' },
  },
};

const assemblyLineConfig: LTWorkerConfig = {
  description: 'Assembly line — orchestrates sequential stations with parallel child workflows and human escalation',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: CERTIFIED_ROLES,
  envelopeSchema: {
    data: {
      productName: 'Widget A',
      stations: [
        { stationName: 'grinder', role: 'grinder', instructions: 'Grind widget to spec.' },
        { stationName: 'gluer', role: 'gluer', instructions: 'Bond components. Verify bond strength.' },
      ],
    },
    metadata: { certified: true, source: 'dashboard' },
  },
};

const stepIteratorConfig: LTWorkerConfig = {
  description: 'Step iterator — walks stations sequentially, spawning a child workstation for each step',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: CERTIFIED_ROLES,
  envelopeSchema: {
    data: {
      name: 'Widget B',
      steps: [
        { stationName: 'grinder', role: 'grinder', instructions: 'Grind widget to spec.' },
        { stationName: 'gluer', role: 'gluer', instructions: 'Bond components.' },
      ],
    },
    metadata: { certified: true, source: 'dashboard' },
  },
};

const reverterConfig: LTWorkerConfig = {
  description: 'Reverter — like stepIterator but supports revert-on-rejection, stepping backwards',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: CERTIFIED_ROLES,
  envelopeSchema: {
    data: {
      name: 'Widget C',
      steps: [
        { stationName: 'grinder', role: 'grinder', instructions: 'Grind widget to spec.' },
        { stationName: 'gluer', role: 'gluer', instructions: 'Bond components.' },
      ],
    },
    metadata: { certified: true, source: 'dashboard' },
  },
  resolverSchema: { approved: true, revertSteps: 0 },
};

const workstationConfig: LTWorkerConfig = {
  description: 'Workstation — child workflow for a single assembly station. Creates escalation, waits for human, signals parent.',
  invocable: false,
  defaultRole: 'grinder',
  roles: [...CERTIFIED_ROLES, 'grinder', 'gluer'],
  resolverSchema: { approved: true, station: 'grinder' },
};

// APP_ROLE controls the container's behavior:
//   'api'    — dashboard + REST API, readonly workflow observers
//   'worker' — workflow execution only, no HTTP server
//   unset    — full standalone mode (local dev via docker compose)
const APP_ROLE = process.env.APP_ROLE as 'api' | 'worker' | undefined;

// Active worker registrations with inline config
const WORKERS = [
  { taskQueue: 'default', workflow: helloWorld.helloWorkflow, config: helloWorldConfig },
  { taskQueue: 'default', workflow: contentReview.reviewContent, config: contentReviewConfig },
  { taskQueue: 'default', workflow: screenshotResearch.screenshotResearch, config: screenshotConfig },
  { taskQueue: 'assembly-line', workflow: assemblyLine, config: assemblyLineConfig },
  { taskQueue: 'assembly-line', workflow: workstation, config: workstationConfig },
  { taskQueue: 'assembly-line', workflow: stepIterator, config: stepIteratorConfig },
  { taskQueue: 'assembly-line', workflow: reverter, config: reverterConfig },
];

// Readonly observers — same workflows with readonly connections for dashboard visibility
const READONLY_OBSERVERS = WORKERS.map((w) => ({
  ...w,
  connection: { readonly: true } as const,
}));

// ── Image tools MCP server config ───────────────────────────────────────────

const IMAGE_TOOLS_CONFIG: LTMcpServerConfig = {
  description: 'Image processing tools — resize, crop, rotate, convert, blur, compress, and more.',
  tags: ['image', 'processing', 'vision'],
  compileHints: 'Image tools accept file paths from storage. Use file_storage tools to upload images first.',
  toolManifest: IMAGE_TOOLS,
};

// ── Conditional seed ────────────────────────────────────────────────────────

const SEED_ROLES = [REVIEWER, ENGINEER, ADMIN, SUPERADMIN];

const SEED_CHAINS: [string, string][] = [
  [REVIEWER, ADMIN],
  [REVIEWER, ENGINEER],
  [ADMIN, ENGINEER],
  [ADMIN, SUPERADMIN],
  [ENGINEER, ADMIN],
  [ENGINEER, SUPERADMIN],
];

async function seedIfEmpty() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) return;

  const pool = new Pool(DB_CONFIG);
  try {
    const { rows } = await pool.query(
      "SELECT COUNT(*) AS count FROM lt_users WHERE external_id = 'superadmin'",
    );
    if (parseInt(rows[0].count) > 0) return;

    console.log('[seed] No users found — seeding superadmin account');

    for (const role of SEED_ROLES) {
      await pool.query(
        'INSERT INTO lt_roles (role) VALUES ($1) ON CONFLICT DO NOTHING',
        [role],
      );
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows: userRows } = await pool.query(
      `INSERT INTO lt_users (external_id, display_name, email, password_hash, status)
       VALUES ('superadmin', 'Super Admin', 'admin@longtail.local', $1, 'active')
       ON CONFLICT DO NOTHING RETURNING id`,
      [hash],
    );

    if (userRows.length > 0) {
      await pool.query(
        `INSERT INTO lt_user_roles (user_id, role, type)
         VALUES ($1, 'superadmin', 'superadmin')
         ON CONFLICT DO NOTHING`,
        [userRows[0].id],
      );
    }

    for (const [source, target] of SEED_CHAINS) {
      await pool.query(
        'INSERT INTO lt_config_role_escalations (source_role, target_role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [source, target],
      );
    }

    console.log('[seed] Superadmin account created (login: superadmin)');
  } catch (err: any) {
    console.error('[seed] Seed failed (non-fatal):', err.message);
  } finally {
    await pool.end();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const isWorker = APP_ROLE === 'worker';
  const isApi = APP_ROLE === 'api';

  const lt = await start({
    database: DB_CONFIG,

    workers: isApi
      ? READONLY_OBSERVERS
      : WORKERS,

    auth: {
      secret: process.env.JWT_SECRET || 'change-me',
    },

    server: isWorker
      ? { enabled: false }
      : { port: parseInt(process.env.PORT || '3030') },

    events: process.env.NATS_URL
      ? { adapters: [new NatsEventAdapter({ url: process.env.NATS_URL, token: process.env.NATS_TOKEN })] }
      : undefined,

    mcp: {
      serverFactories: {
        'image-tools': { factory: createImageToolsServer, config: IMAGE_TOOLS_CONFIG },
        'long-tail-gmail': { factory: createGmailServer, config: GMAIL_SERVER_CONFIG },
      },
    },
  });

  // Seed the superadmin account on first boot (API role only, or standalone)
  if (!isWorker) {
    await seedIfEmpty();
  }

  process.on('SIGTERM', () => lt.shutdown());
  process.on('SIGINT', () => lt.shutdown());
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

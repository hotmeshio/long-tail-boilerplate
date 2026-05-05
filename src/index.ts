try { require('dotenv/config'); } catch {}
import { Pool } from 'pg';
import { start } from '@hotmeshio/long-tail';

import * as helloWorld from './workflows/hello-world';
import * as contentReview from './workflows/content-review';
import * as screenshotResearch from './workflows/screenshot-research';
import { assemblyLine } from './workflows/assembly-line';
import { workstation } from './workflows/assembly-line/worker';
import { stepIterator } from './workflows/assembly-line/iterator';
import { reverter } from './workflows/assembly-line/reverter';
import { createImageToolsServer } from './mcp-servers/image-tools';

const bcrypt: any = require('bcryptjs');

const DB_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5416'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'myapp',
};

// APP_ROLE controls the container's behavior:
//   'api'    — dashboard + REST API, readonly workflow observers
//   'worker' — workflow execution only, no HTTP server
//   unset    — full standalone mode (local dev via docker compose)
const APP_ROLE = process.env.APP_ROLE as 'api' | 'worker' | undefined;

// Active worker registrations
const WORKERS = [
  { taskQueue: 'default', workflow: helloWorld.helloWorkflow },
  { taskQueue: 'default', workflow: contentReview.reviewContent },
  { taskQueue: 'default', workflow: screenshotResearch.screenshotResearch },
  { taskQueue: 'assembly-line', workflow: assemblyLine },
  { taskQueue: 'assembly-line', workflow: workstation },
  { taskQueue: 'assembly-line', workflow: stepIterator },
  { taskQueue: 'assembly-line', workflow: reverter },
];

// Readonly observers — same workers registered with readonly connections so the
// dashboard can see and invoke them without the API container executing work.
const READONLY_OBSERVERS = [
  { taskQueue: 'default', workflow: helloWorld.helloWorkflow, connection: { readonly: true } },
  { taskQueue: 'default', workflow: contentReview.reviewContent, connection: { readonly: true } },
  { taskQueue: 'default', workflow: screenshotResearch.screenshotResearch, connection: { readonly: true } },
  { taskQueue: 'assembly-line', workflow: assemblyLine, connection: { readonly: true } },
  { taskQueue: 'assembly-line', workflow: workstation, connection: { readonly: true } },
  { taskQueue: 'assembly-line', workflow: stepIterator, connection: { readonly: true } },
  { taskQueue: 'assembly-line', workflow: reverter, connection: { readonly: true } },
];

// ── Conditional seed ────────────────────────────────────────────────────────

const SEED_ROLES = ['reviewer', 'engineer', 'admin', 'superadmin'];

const SEED_CHAINS: [string, string][] = [
  ['reviewer', 'admin'],
  ['reviewer', 'engineer'],
  ['admin', 'engineer'],
  ['admin', 'superadmin'],
  ['engineer', 'admin'],
  ['engineer', 'superadmin'],
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
      ? READONLY_OBSERVERS                    // API: readonly observers for dashboard visibility
      : WORKERS,                              // Worker or standalone: active workers

    auth: {
      secret: process.env.JWT_SECRET || 'change-me',
    },

    server: isWorker
      ? { enabled: false }                    // Worker: no HTTP server
      : { port: parseInt(process.env.PORT || '3030') },

    mcp: {
      serverFactories: {
        'image-tools': createImageToolsServer,
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

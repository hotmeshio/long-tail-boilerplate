import { Pool } from 'pg';

import { REVIEWER, ENGINEER, ADMIN, SUPERADMIN } from './roles';
import { DB_CONFIG } from './database';
import { ALL_PRINT_ROLES } from '../workflows/print-routing/types';
import { allOperatorSeeds, operatorIds } from '../workflows/print-routing/operators';
import { ALL_BAMBU_ROLES } from '../workflows/bambu-farm/types';
import { bambuOperatorSeeds, bambuOperatorIds } from '../workflows/bambu-farm/operators';
import { PULL_POND } from '../workflows/pull-farm/types';
import { pullOperatorSeeds, pullOperatorIds } from '../workflows/pull-farm/operators';

const bcrypt: any = require('bcryptjs');

const SEED_ROLES = [REVIEWER, ENGINEER, ADMIN, SUPERADMIN];

const SEED_CHAINS: [string, string][] = [
  [REVIEWER, ADMIN],
  [REVIEWER, ENGINEER],
  [ADMIN, ENGINEER],
  [ADMIN, SUPERADMIN],
  [ENGINEER, ADMIN],
  [ENGINEER, SUPERADMIN],
];

export async function seedIfEmpty() {
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

/**
 * Seed the print-farm roles and operator principals from the static config in
 * `src/workflows/print-routing/operators.ts` (deterministic UUIDs). Runs at
 * startup so the operators exist everywhere the app boots — local Docker AND an
 * AWS deploy — making `npm run print:seed` unnecessary and remote `print:remote:*`
 * runs work without any DB access or HTTP seed.
 *
 * Independent of the superadmin "if empty" guard so it also provisions the farm on
 * an existing DB (an AWS deploy that already has a superadmin). Idempotent: guarded
 * by an existence check on the standard broker operator, and every write is
 * `ON CONFLICT`. Additive and isolated — it never touches the default
 * users/roles/chains, so the integration baseline is unaffected.
 */
export async function seedPrintFarmIfEmpty() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) return;

  const pool = new Pool(DB_CONFIG);
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM lt_users WHERE id = $1',
      [operatorIds(false).brokerId],
    );
    if (rows.length > 0) return;

    console.log('[seed] Seeding print-farm roles and operators');

    for (const role of ALL_PRINT_ROLES) {
      await pool.query('INSERT INTO lt_roles (role) VALUES ($1) ON CONFLICT DO NOTHING', [role]);
    }

    const hash = await bcrypt.hash(password, 10);
    for (const op of allOperatorSeeds()) {
      await pool.query(
        `INSERT INTO lt_users (id, external_id, display_name, email, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (external_id) DO UPDATE SET id = $1, password_hash = $5`,
        [op.id, op.externalId, op.display, `${op.externalId}@print.local`, hash],
      );
      for (const role of op.roles) {
        await pool.query(
          `INSERT INTO lt_user_roles (user_id, role, type)
           VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
          [op.id, role],
        );
      }
    }

    console.log(`[seed] Print farm seeded (${allOperatorSeeds().length} operators, ${ALL_PRINT_ROLES.length} roles)`);
  } catch (err: any) {
    console.error('[seed] Print farm seed failed (non-fatal):', err.message);
  } finally {
    await pool.end();
  }
}

/**
 * Seed the bambu-farm role and dispatcher operator (deterministic UUID from
 * `src/workflows/bambu-farm/operators.ts`). Same shape and guarantees as
 * `seedPrintFarmIfEmpty`: startup-time, idempotent, additive, non-fatal.
 */
export async function seedBambuFarmIfEmpty() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) return;

  const pool = new Pool(DB_CONFIG);
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM lt_users WHERE id = $1',
      [bambuOperatorIds().dispatcherId],
    );
    if (rows.length > 0) return;

    console.log('[seed] Seeding bambu-farm role and dispatcher operator');

    for (const role of ALL_BAMBU_ROLES) {
      await pool.query('INSERT INTO lt_roles (role) VALUES ($1) ON CONFLICT DO NOTHING', [role]);
    }

    const hash = await bcrypt.hash(password, 10);
    for (const op of bambuOperatorSeeds()) {
      await pool.query(
        `INSERT INTO lt_users (id, external_id, display_name, email, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (external_id) DO UPDATE SET id = $1, password_hash = $5`,
        [op.id, op.externalId, op.display, `${op.externalId}@print.local`, hash],
      );
      for (const role of op.roles) {
        await pool.query(
          `INSERT INTO lt_user_roles (user_id, role, type)
           VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
          [op.id, role],
        );
      }
    }

    console.log(`[seed] Bambu farm seeded (${bambuOperatorSeeds().length} operator, ${ALL_BAMBU_ROLES.length} role)`);
  } catch (err: any) {
    console.error('[seed] Bambu farm seed failed (non-fatal):', err.message);
  } finally {
    await pool.end();
  }
}

/**
 * Seed the pull-farm pond role and puller principals (deterministic `0c..`
 * UUIDs). Distinct principals are the experiment: claims are leases only
 * across users. Same guarantees as the other farm seeds: startup-time,
 * idempotent, additive, non-fatal.
 */
export async function seedPullFarmIfEmpty() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) return;

  const pool = new Pool(DB_CONFIG);
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM lt_users WHERE id = $1',
      [pullOperatorIds()[0]],
    );
    if (rows.length > 0) return;

    console.log('[seed] Seeding pull-farm role and puller principals');

    await pool.query('INSERT INTO lt_roles (role) VALUES ($1) ON CONFLICT DO NOTHING', [PULL_POND]);

    const hash = await bcrypt.hash(password, 10);
    for (const op of pullOperatorSeeds()) {
      await pool.query(
        `INSERT INTO lt_users (id, external_id, display_name, email, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (external_id) DO UPDATE SET id = $1, password_hash = $5`,
        [op.id, op.externalId, op.display, `${op.externalId}@print.local`, hash],
      );
      for (const role of op.roles) {
        await pool.query(
          `INSERT INTO lt_user_roles (user_id, role, type)
           VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
          [op.id, role],
        );
      }
    }

    console.log(`[seed] Pull farm seeded (${pullOperatorSeeds().length} pullers, 1 role)`);
  } catch (err: any) {
    console.error('[seed] Pull farm seed failed (non-fatal):', err.message);
  } finally {
    await pool.end();
  }
}

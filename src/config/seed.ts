import { Pool } from 'pg';

import { REVIEWER, ENGINEER, ADMIN, SUPERADMIN } from './roles';
import { DB_CONFIG } from './database';

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

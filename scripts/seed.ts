/**
 * Seed user identities, roles, and escalation chains.
 *
 * Usage:
 *   docker compose exec app npm run seed
 */

import 'dotenv/config';
import { Pool } from 'pg';
const bcrypt: any = require('bcryptjs');

// ── Seed data (mirrors long-tail examples/seed.ts) ─────────────────────────

const SEED_USERS = [
  {
    external_id: 'superadmin',
    display_name: 'Super Admin',
    email: 'admin@longtail.local',
    password: 'l0ngt@1l',
    roles: [{ role: 'superadmin', type: 'superadmin' }],
  },
  {
    external_id: 'admin',
    display_name: 'Admin User',
    email: 'admin-user@longtail.local',
    password: 'l0ngt@1l',
    roles: [{ role: 'admin', type: 'admin' }],
  },
  {
    external_id: 'engineer',
    display_name: 'Engineer User',
    email: 'engineer@longtail.local',
    password: 'l0ngt@1l',
    roles: [{ role: 'engineer', type: 'member' }],
  },
  {
    external_id: 'reviewer',
    display_name: 'Reviewer User',
    email: 'reviewer@longtail.local',
    password: 'l0ngt@1l',
    roles: [{ role: 'reviewer', type: 'member' }],
  },
];

const SEED_ROLES = ['reviewer', 'engineer', 'admin', 'superadmin'];

const SEED_CHAINS = [
  ['reviewer', 'admin'],
  ['reviewer', 'engineer'],
  ['admin', 'engineer'],
  ['admin', 'superadmin'],
  ['engineer', 'admin'],
  ['engineer', 'superadmin'],
];

// ── Seed logic ──────────────────────────────────────────────────────────────

async function seed() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5416'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    database: process.env.POSTGRES_DB || 'myapp',
  });

  // 1. Seed roles
  for (const role of SEED_ROLES) {
    await pool.query(
      `INSERT INTO lt_roles (role) VALUES ($1) ON CONFLICT DO NOTHING`,
      [role],
    );
  }
  console.log(`[seed] roles created: ${SEED_ROLES.join(', ')}`);

  // 2. Seed users
  for (const user of SEED_USERS) {
    const hash = await bcrypt.hash(user.password, 10);
    const { rows } = await pool.query(
      `INSERT INTO lt_users (external_id, display_name, email, password_hash, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (external_id) DO UPDATE SET password_hash = $4
       RETURNING id`,
      [user.external_id, user.display_name, user.email, hash],
    );
    const userId = rows[0].id;

    for (const { role, type } of user.roles) {
      await pool.query(
        `INSERT INTO lt_user_roles (user_id, role, type)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [userId, role, type],
      );
    }
    console.log(`[seed] user: ${user.external_id} (${user.roles.map(r => r.role).join(', ')})`);
  }

  // 3. Seed escalation chains
  for (const [source, target] of SEED_CHAINS) {
    await pool.query(
      `INSERT INTO lt_config_role_escalations (source_role, target_role)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [source, target],
    );
  }
  console.log(`[seed] escalation chains: ${SEED_CHAINS.length} entries`);

  console.log(`\n  Seed complete. Login at http://localhost:${process.env.PORT || '3030'}/`);
  console.log(`  Credentials: superadmin / l0ngt@1l\n`);

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

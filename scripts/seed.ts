/**
 * Create the initial admin account.
 *
 * Usage:
 *   npx ts-node scripts/seed.ts
 *   npx ts-node scripts/seed.ts --user admin --password changeme
 */

import 'dotenv/config';
import { Pool } from 'pg';
const bcrypt: any = require('bcryptjs');

const username = process.argv.includes('--user')
  ? process.argv[process.argv.indexOf('--user') + 1]
  : 'superadmin';

const password = process.argv.includes('--password')
  ? process.argv[process.argv.indexOf('--password') + 1]
  : 'changeme';

async function seed() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5433'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    database: process.env.POSTGRES_DB || 'myapp',
  });

  const hash = await bcrypt.hash(password, 10);

  // Create user
  const { rows } = await pool.query(
    `INSERT INTO lt_users (external_id, display_name, password_hash, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (external_id) DO UPDATE SET password_hash = $3
     RETURNING id`,
    [username, username, hash],
  );
  const userId = rows[0].id;

  // Assign superadmin role
  await pool.query(
    `INSERT INTO lt_user_roles (user_id, role, type)
     VALUES ($1, 'admin', 'superadmin')
     ON CONFLICT DO NOTHING`,
    [userId],
  );

  console.log(`\n  Account ready.`);
  console.log(`  Username: ${username}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     superadmin\n`);
  console.log(`  Login at: http://localhost:${process.env.PORT || '3030'}/\n`);

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

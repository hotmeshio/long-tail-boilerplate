/**
 * Seed the print-routing farm's roles and operator principals.
 *
 * Additive and independent of `scripts/seed.ts` — it never touches the default
 * users/roles/chains, so the integration baseline (and the self-test's seed
 * coupling) is unaffected. Run it once after the base seed when exercising the
 * print farm:
 *
 *   docker compose exec app npm run print:seed
 *
 * Every print-routing robot resolves escalations through the role-gated public
 * API as an operator holding exactly the pond role its robot acts on (broker →
 * printer pool + order pond; technician → printer pool; inspector → farmer pond;
 * orderer → order pond; printer → printer pool). The escalation write path stores
 * the operator as a UUID, so operators are seeded with the stable deterministic
 * ids from src/workflows/print-routing/operators.ts — the same ids the printShift
 * envelope and the 10-* orchestrator reference.
 */

import 'dotenv/config';
import { Pool } from 'pg';
const bcrypt: any = require('bcryptjs');

import { ALL_PRINT_ROLES } from '../src/workflows/print-routing/types';
import { allOperatorSeeds } from '../src/workflows/print-routing/operators';

const PASSWORD = process.env.SEED_PASSWORD || 'l0ngt@1l';

async function seed() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5416'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    database: process.env.POSTGRES_DB || 'myapp',
  });

  // 1. Seed the print-farm roles (hard capability walls).
  for (const role of ALL_PRINT_ROLES) {
    await pool.query(`INSERT INTO lt_roles (role) VALUES ($1) ON CONFLICT DO NOTHING`, [role]);
  }
  console.log(`[print-seed] roles created: ${ALL_PRINT_ROLES.join(', ')}`);

  // 2. Seed the operator principals (stable ids) and their pond role grants.
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const op of allOperatorSeeds()) {
    await pool.query(
      `INSERT INTO lt_users (id, external_id, display_name, email, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (external_id) DO UPDATE SET id = $1, password_hash = $5
       RETURNING id`,
      [op.id, op.externalId, op.display, `${op.externalId}@print.local`, hash],
    );
    for (const role of op.roles) {
      await pool.query(
        `INSERT INTO lt_user_roles (user_id, role, type)
         VALUES ($1, $2, 'member')
         ON CONFLICT DO NOTHING`,
        [op.id, role],
      );
    }
    console.log(`[print-seed] operator: ${op.externalId} → ${op.id} (${op.roles.join(', ')})`);
  }

  console.log(`\n  Print farm seeded. Run a shift: npm run print:smoke | pressure: npm run print:run\n`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Print seed failed:', err.message);
  process.exit(1);
});

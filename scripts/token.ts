/**
 * Generate a JWT token for API access.
 *
 * Usage:
 *   npx ts-node scripts/token.ts
 *   npx ts-node scripts/token.ts --user admin --role admin
 */

import 'dotenv/config';
import { signToken } from '@hotmeshio/long-tail';

const args = process.argv.slice(2);
const userId = args.includes('--user') ? args[args.indexOf('--user') + 1] : 'admin';
const role = args.includes('--role') ? args[args.indexOf('--role') + 1] : 'superadmin';

const token = signToken(
  { userId, role, roles: [{ role, type: role }] },
  '24h',
);

console.log(`\n  Token (${userId}, ${role}, 24h):\n`);
console.log(`  ${token}\n`);

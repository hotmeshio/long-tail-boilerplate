/**
 * Loads .env and resolves the remote target for test and pressure scripts.
 *
 * An explicit REMOTE_URL wins (CI passes it from secrets). REMOTE=1 reads the
 * deployment URL from LT_REMOTE_URL in the gitignored .env, so no deployment
 * is named in the repo. REMOTE=1 without a URL throws rather than falling
 * back to local.
 */

try { require('dotenv/config'); } catch {}

if (process.env.REMOTE === '1' && !process.env.REMOTE_URL) {
  if (!process.env.LT_REMOTE_URL) {
    throw new Error('REMOTE=1 needs LT_REMOTE_URL (set it in .env), or pass REMOTE_URL');
  }
  process.env.REMOTE_URL = process.env.LT_REMOTE_URL;
}

import { Client } from 'pg';

import { DB_CONFIG } from './database';

/**
 * HotMesh connection descriptor: `{ class: Client, options }`.
 *
 * Use wherever HotMesh / Durable APIs need a connection config (e.g. building a
 * one-off `Durable.Client` to signal a parked workflow) instead of importing
 * `pg` and the database config directly. Mirrors the descriptor the long-tail
 * `start()` builds internally, sourced from the same env-driven `DB_CONFIG`.
 */
export function getConnection(): { class: typeof Client; options: typeof DB_CONFIG } {
  return { class: Client, options: DB_CONFIG };
}

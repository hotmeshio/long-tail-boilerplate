/**
 * Shared Postgres config for throughput tests.
 * Reads from env vars matching the boilerplate's docker-compose.yml.
 */
import 'dotenv/config';

export const postgres_options = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5416', 10),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'myapp',
};

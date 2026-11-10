import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { env } from '../env';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  ssl: env.isProd && !env.DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export { schema };

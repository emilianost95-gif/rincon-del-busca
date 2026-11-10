import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { env } from '../env';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  // DATABASE_SSL=false para conexiones internas (ej. red privada de Render).
  ssl:
    process.env.DATABASE_SSL === 'false' || !env.isProd || env.DATABASE_URL.includes('localhost')
      ? undefined
      : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export { schema };

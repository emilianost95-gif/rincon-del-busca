import { migrate } from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool } from './index';

const here = path.dirname(fileURLToPath(import.meta.url));
// Funciona tanto desde src/db (tsx) como desde dist (build).
const folder =
  [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle')].find((p) =>
    fs.existsSync(path.join(p, 'meta')),
  ) ?? path.resolve(here, '../../drizzle');

export async function runMigrations() {
  await migrate(db, { migrationsFolder: folder });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log('✔ Migraciones aplicadas');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

/** Crea (o resetea la contraseña de) un usuario Dueño. Uso en producción sin seed demo. */
import { db, pool, schema } from './index';
import { hashPassword } from '../lib/auth';
import { runMigrations } from './migrate';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../services/settings';

async function main() {
  const email = process.env.OWNER_EMAIL?.toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password || password.length < 10) {
    throw new Error('Definí OWNER_EMAIL y OWNER_PASSWORD (mínimo 10 caracteres)');
  }
  await runMigrations();
  const passwordHash = await hashPassword(password);
  await db
    .insert(schema.users)
    .values({ name: process.env.OWNER_NAME ?? 'Dueño', email, role: 'OWNER', passwordHash })
    .onConflictDoUpdate({ target: schema.users.email, set: { passwordHash, role: 'OWNER', isActive: true } });
  const current = await getSettings();
  await saveSettings({ ...DEFAULT_SETTINGS, ...current, demoMode: false });
  console.log(`✔ Dueño listo: ${email}`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });

import { eq } from 'drizzle-orm';
import { settingsSchema, type SettingsInput } from '@rincon/shared';
import { db, schema } from '../db';

/**
 * Valores por defecto: sólo el nombre comercial es un dato conocido.
 * Todo lo demás arranca vacío y la landing lo muestra como "pendiente".
 */
export const DEFAULT_SETTINGS: SettingsInput = {
  businessName: 'El Rincón del Busca',
  tagline: null,
  about: null,
  whatsapp: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  mapsUrl: null,
  instagram: null,
  facebook: null,
  hours: [],
  gallery: [],
  currency: 'ARS',
  demoMode: true,
};

export async function getSettings(): Promise<SettingsInput> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  if (!row) return DEFAULT_SETTINGS;
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(row.data as object) });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(data: SettingsInput) {
  await db
    .insert(schema.settings)
    .values({ id: 1, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.id, set: { data, updatedAt: new Date() } });
}

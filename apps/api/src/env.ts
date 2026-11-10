import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  WEB_URL: z.string().default('http://localhost:3000'),
  REVALIDATE_SECRET: z.string().default(''),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** Zona horaria del local: define dónde empieza y termina cada día en los reportes. */
  BUSINESS_TZ: z.string().default('America/Santiago'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Variables de entorno inválidas:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  allowedOrigins: parsed.data.WEB_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
};

import { db, schema, type Tx } from '../db';
import { env } from '../env';

export async function audit(
  entry: { userId?: string | null; action: string; entity: string; entityId?: string | null; summary: string; meta?: unknown },
  tx?: Tx,
) {
  await (tx ?? db).insert(schema.auditLogs).values({
    userId: entry.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    meta: entry.meta ?? null,
  });
}

/**
 * Avisa al frontend que el catálogo cambió para que regenere las páginas
 * públicas al instante. Es "fire and forget": si el frontend no responde, la
 * caché igual expira sola a los 60 s.
 */
export function revalidateCatalog() {
  if (!env.REVALIDATE_SECRET || env.NODE_ENV === 'test') return;
  fetch(`${env.WEB_URL}/internal/revalidate`, {
    method: 'POST',
    headers: { 'x-revalidate-secret': env.REVALIDATE_SECRET },
    signal: AbortSignal.timeout(3000),
  }).catch(() => undefined);
}

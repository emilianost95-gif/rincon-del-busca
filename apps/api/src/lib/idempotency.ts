import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { and, eq, lt } from 'drizzle-orm';
import { db, schema, type Tx } from '../db';
import { HttpError } from './http';

/**
 * Idempotencia para escrituras que no deben repetirse (ventas, entradas,
 * importaciones, precios masivos).
 *
 * El navegador manda `Idempotency-Key: <uuid>` (uno por intento lógico). Si el
 * mismo pedido llega dos veces —doble clic, reintento por mala señal— la
 * segunda vez se devuelve la respuesta guardada y la operación NO se repite.
 *
 * La clave se reserva DENTRO de la misma transacción que la operación:
 * - Si la operación falla, se revierte también la reserva y se puede reintentar.
 * - Si dos pedidos iguales llegan a la vez, Postgres hace esperar al segundo
 *   en el INSERT hasta que el primero confirme; entonces ve el conflicto y
 *   devuelve la respuesta del primero.
 *
 * Sin cabecera, la ruta funciona como siempre (compatibilidad).
 */

const KEY_RE = /^[A-Za-z0-9_-]{16,100}$/;
const ik = schema.idempotencyKeys;

export const IDEMPOTENCY_TTL_DAYS = 7;

class AlreadyClaimed extends Error {}

const hashBody = (body: unknown) => createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');

function keyOf(req: Request): string | null {
  const raw = req.get('idempotency-key');
  if (raw === undefined || raw === '') return null;
  if (!KEY_RE.test(raw)) throw new HttpError(400, 'bad_idempotency_key', 'Idempotency-Key inválida');
  return raw;
}

async function findPrior(userId: string, key: string) {
  const [row] = await db
    .select()
    .from(ik)
    .where(and(eq(ik.userId, userId), eq(ik.key, key)))
    .limit(1);
  return row;
}

function replay(prior: typeof ik.$inferSelect, scope: string, hash: string) {
  if (prior.scope !== scope || prior.requestHash !== hash) {
    throw new HttpError(409, 'idempotency_conflict', 'Esta operación ya se usó con otros datos. Recargá la pantalla e intentá de nuevo.');
  }
  return { status: prior.responseStatus ?? 200, body: prior.responseBody, replayed: true };
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export async function idempotent<T>(
  req: Request,
  scope: string,
  run: (tx: Tx) => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  const key = keyOf(req);
  if (!key) return { ...(await db.transaction(run)), replayed: false };

  const userId = req.user!.id;
  const hash = hashBody(req.body);

  // Camino rápido: ya se procesó (reintento después de una respuesta perdida).
  const prior = await findPrior(userId, key);
  if (prior) return replay(prior, scope, hash) as IdempotentResult<T>;

  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(ik)
        .values({ key, userId, scope, requestHash: hash })
        .onConflictDoNothing()
        .returning({ key: ik.key });
      if (!claimed.length) throw new AlreadyClaimed();

      const out = await run(tx);
      await tx
        .update(ik)
        .set({ responseStatus: out.status, responseBody: out.body as never })
        .where(and(eq(ik.userId, userId), eq(ik.key, key)));
      return { ...out, replayed: false };
    });
  } catch (err) {
    if (!(err instanceof AlreadyClaimed)) throw err;
    const winner = await findPrior(userId, key);
    if (!winner) throw new HttpError(409, 'idempotency_retry', 'La operación se está procesando. Intentá de nuevo en un momento.');
    return replay(winner, scope, hash) as IdempotentResult<T>;
  }
}

/** Envía el resultado y marca las respuestas repetidas. */
export function sendIdempotent(res: Response, out: IdempotentResult<unknown>) {
  if (out.replayed) res.set('Idempotent-Replayed', 'true');
  res.status(out.status).json(out.body);
}

export async function purgeIdempotencyKeys() {
  await db.delete(ik).where(lt(ik.createdAt, new Date(Date.now() - IDEMPOTENCY_TTL_DAYS * 86_400_000)));
}

import { eq } from 'drizzle-orm';
import type { MovementType } from '@rincon/shared';
import { db, schema, type Tx } from '../db';
import { HttpError, notFound } from '../lib/http';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface MovementRequest {
  productId: string;
  type: MovementType;
  quantity: number;
  supplierId?: string | null;
  unitCost?: number | null;
  note?: string | null;
  userId: string | null;
  /** Sólo para cargas históricas internas (seed/importación). */
  createdAt?: Date;
}

/** Cuánto cambia el stock según el tipo. ADJUST recibe el stock contado. */
export function computeDelta(type: MovementType, quantity: number, previous: number): number {
  switch (type) {
    case 'IN':
    case 'RETURN':
    case 'INITIAL':
      return round3(quantity);
    case 'OUT':
    case 'LOSS':
      return round3(-quantity);
    case 'ADJUST':
      return round3(quantity - previous);
  }
}

/**
 * Aplica un movimiento de forma atómica.
 *
 * 1. Bloquea la fila del producto (SELECT … FOR UPDATE): dos ventas
 *    simultáneas del último paquete se ejecutan en fila, nunca a la vez.
 * 2. Calcula el saldo y rechaza si quedaría negativo.
 * 3. Escribe el movimiento y actualiza el saldo en la misma transacción.
 *
 * Si cualquier paso falla, no queda nada a medias.
 */
export async function applyMovement(req: MovementRequest, tx?: Tx) {
  const run = async (t: Tx) => {
    const [product] = await t
      .select({
        id: schema.products.id,
        name: schema.products.name,
        stock: schema.products.stock,
        archivedAt: schema.products.archivedAt,
      })
      .from(schema.products)
      .where(eq(schema.products.id, req.productId))
      .for('update');

    if (!product) throw notFound('Producto');
    if (product.archivedAt) throw new HttpError(409, 'archived', 'El producto está archivado');

    const previous = Number(product.stock);
    const delta = computeDelta(req.type, req.quantity, previous);
    const resulting = round3(previous + delta);

    if (resulting < 0) {
      throw new HttpError(409, 'insufficient_stock', `Stock insuficiente: hay ${previous} y querés descontar ${-delta}`, {
        quantity: `Disponible: ${previous}`,
      });
    }

    await t
      .update(schema.products)
      .set({ stock: resulting, updatedAt: new Date() })
      .where(eq(schema.products.id, product.id));

    const [movement] = await t
      .insert(schema.stockMovements)
      .values({
        productId: product.id,
        productName: product.name,
        type: req.type,
        quantity: round3(req.quantity),
        delta,
        previousStock: previous,
        resultingStock: resulting,
        unitCost: req.unitCost ?? null,
        supplierId: req.supplierId ?? null,
        note: req.note ?? null,
        userId: req.userId,
        createdAt: req.createdAt,
      })
      .returning();

    return movement!;
  };

  return tx ? run(tx) : db.transaction(run);
}

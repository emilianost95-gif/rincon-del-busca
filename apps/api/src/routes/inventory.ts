import { Router } from 'express';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { bulkPriceSchema, MOVEMENT_LABELS, movementSchema, MOVEMENT_TYPES, type BulkPriceInput, type MovementDTO } from '@rincon/shared';
import { db, schema } from '../db';
import { audit, revalidateCatalog } from '../lib/audit';
import { requirePermission } from '../lib/auth';
import { applyMovement } from '../services/inventory';

/* -------------------------------------------------------- Movimientos */

export const movementsRouter = Router();
const m = schema.stockMovements;

const movementQuery = z.object({
  productId: z.string().uuid().optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export function movementFilters(q: z.infer<typeof movementQuery>): SQL | undefined {
  const conds: SQL[] = [];
  if (q.productId) conds.push(eq(m.productId, q.productId));
  if (q.type) conds.push(eq(m.type, q.type));
  if (q.from) conds.push(gte(m.createdAt, q.from));
  if (q.to) conds.push(lte(m.createdAt, q.to));
  return conds.length ? and(...conds) : undefined;
}

export async function listMovements(where: SQL | undefined, limit: number, offset = 0): Promise<MovementDTO[]> {
  const rows = await db
    .select({ m, userName: schema.users.name, supplierName: schema.suppliers.name })
    .from(m)
    .leftJoin(schema.users, eq(schema.users.id, m.userId))
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, m.supplierId))
    .where(where)
    .orderBy(desc(m.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map(({ m: r, userName, supplierName }) => ({
    id: r.id,
    productId: r.productId,
    productName: r.productName,
    type: r.type,
    quantity: Number(r.quantity),
    delta: Number(r.delta),
    previousStock: Number(r.previousStock),
    resultingStock: Number(r.resultingStock),
    unitCost: r.unitCost,
    unitPrice: r.unitPrice,
    note: r.note,
    userName,
    supplierName,
    createdAt: r.createdAt.toISOString(),
  }));
}

movementsRouter.get('/', requirePermission('catalog:read'), async (req, res) => {
  const q = movementQuery.parse(req.query);
  const where = movementFilters(q);
  const [items, [total]] = await Promise.all([
    listMovements(where, q.pageSize, (q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(m).where(where),
  ]);
  res.json({ items, total: total?.n ?? 0, page: q.page, pageSize: q.pageSize });
});

movementsRouter.post('/', requirePermission('stock:write'), async (req, res) => {
  const data = movementSchema.parse(req.body);
  const movement = await db.transaction(async (tx) => {
    const mv = await applyMovement({ ...data, userId: req.user!.id }, tx);
    await audit(
      {
        userId: req.user!.id,
        action: 'stock.movement',
        entity: 'product',
        entityId: mv.productId,
        summary: `${MOVEMENT_LABELS[mv.type]} de ${Number(mv.quantity)} · ${mv.productName} (${Number(mv.previousStock)} → ${Number(mv.resultingStock)})`,
      },
      tx,
    );
    return mv;
  });
  revalidateCatalog();
  const [dto] = await listMovements(eq(m.id, movement.id), 1);
  res.status(201).json(dto);
});

/* ---------------------------------------------------- Precios masivos */

export const pricesRouter = Router();
pricesRouter.use(requirePermission('prices:write'));
const p = schema.products;

function roundTo(value: number, step: number) {
  return Math.max(0, Math.round(value / step) * step);
}

async function computeBulk(input: BulkPriceInput) {
  const conds: SQL[] = [isNull(p.archivedAt)];
  if (input.scope === 'category') conds.push(eq(p.categoryId, input.categoryId!));
  if (input.scope === 'supplier') conds.push(eq(p.supplierId, input.supplierId!));
  if (input.scope === 'products') conds.push(inArray(p.id, input.productIds!));
  const rows = await db
    .select({ id: p.id, name: p.name, salePrice: p.salePrice, costPrice: p.costPrice })
    .from(p)
    .where(and(...conds))
    .orderBy(asc(p.name));

  return rows
    .map((r) => {
      const current = input.target === 'sale' ? r.salePrice : r.costPrice;
      const raw = input.mode === 'percent' ? current * (1 + input.value / 100) : current + input.value;
      const next = roundTo(raw, input.rounding);
      return { id: r.id, name: r.name, current, next, diff: next - current };
    })
    .filter((r) => r.diff !== 0);
}

/** Vista previa: calcula sin escribir nada. */
pricesRouter.post('/bulk/preview', async (req, res) => {
  const input = bulkPriceSchema.parse(req.body);
  const changes = await computeBulk(input);
  res.json({ count: changes.length, changes: changes.slice(0, 500) });
});

/** Aplica en una sola transacción y registra cada cambio. */
pricesRouter.post('/bulk/apply', async (req, res) => {
  const input = bulkPriceSchema.parse(req.body);
  const changes = await computeBulk(input);
  if (!changes.length) {
    res.json({ updated: 0 });
    return;
  }
  const field = input.target === 'sale' ? 'salePrice' : 'costPrice';
  await db.transaction(async (tx) => {
    for (const c of changes) {
      await tx.update(p).set({ [field]: c.next, updatedAt: new Date() }).where(eq(p.id, c.id));
    }
    await tx.insert(schema.priceChanges).values(
      changes.map((c) => ({
        productId: c.id,
        field: input.target,
        previousValue: c.current,
        newValue: c.next,
        reason: `Actualización masiva ${input.mode === 'percent' ? `${input.value}%` : `$${input.value}`}`,
        userId: req.user!.id,
      })),
    );
    await audit(
      {
        userId: req.user!.id,
        action: 'price.bulk',
        entity: 'product',
        summary: `Actualizó ${changes.length} precio(s) de ${input.target === 'sale' ? 'venta' : 'costo'} (${input.mode === 'percent' ? `${input.value > 0 ? '+' : ''}${input.value}%` : `${input.value > 0 ? '+' : ''}$${input.value}`})`,
        meta: input,
      },
      tx,
    );
  });
  revalidateCatalog();
  res.json({ updated: changes.length });
});

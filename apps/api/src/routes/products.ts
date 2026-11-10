import { Router } from 'express';
import { count, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { can, productCreateSchema, productListQuerySchema, productUpdateSchema } from '@rincon/shared';
import { db, schema } from '../db';
import { HttpError, notFound } from '../lib/http';
import { audit, revalidateCatalog } from '../lib/audit';
import { requirePermission } from '../lib/auth';
import { applyMovement } from '../services/inventory';
import { buildSearchText, productOrder, productWhere, toProductDTO, uniqueSlug } from '../services/products';

export const productsRouter = Router();
const p = schema.products;
const sup = alias(schema.suppliers, 'sup');

async function categoryName(id: string | null | undefined) {
  if (!id) return null;
  const [c] = await db.select({ name: schema.categories.name }).from(schema.categories).where(eq(schema.categories.id, id));
  return c?.name ?? null;
}

productsRouter.get('/', requirePermission('catalog:read'), async (req, res) => {
  const q = productListQuerySchema.parse(req.query);
  const where = productWhere({ q: q.q, category: q.category, supplier: q.supplier, stock: q.stock, status: q.status });
  const [rows, [total]] = await Promise.all([
    db
      .select({ product: p, category: schema.categories, supplier: { id: sup.id, name: sup.name } })
      .from(p)
      .leftJoin(schema.categories, eq(schema.categories.id, p.categoryId))
      .leftJoin(sup, eq(sup.id, p.supplierId))
      .where(where)
      .orderBy(...productOrder(q.sort))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(p).leftJoin(schema.categories, eq(schema.categories.id, p.categoryId)).where(where),
  ]);
  res.json({
    items: rows.map((r) => toProductDTO(r.product, r.category, r.supplier?.id ? r.supplier : null)),
    total: total?.n ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  });
});

productsRouter.get('/:id', requirePermission('catalog:read'), async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db
    .select({ product: p, category: schema.categories, supplier: { id: sup.id, name: sup.name } })
    .from(p)
    .leftJoin(schema.categories, eq(schema.categories.id, p.categoryId))
    .leftJoin(sup, eq(sup.id, p.supplierId))
    .where(eq(p.id, id));
  if (!row) throw notFound('Producto');
  const [movements, prices] = await Promise.all([
    db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.productId, id))
      .orderBy(desc(schema.stockMovements.createdAt))
      .limit(15),
    db
      .select()
      .from(schema.priceChanges)
      .where(eq(schema.priceChanges.productId, id))
      .orderBy(desc(schema.priceChanges.createdAt))
      .limit(15),
  ]);
  res.json({
    ...toProductDTO(row.product, row.category, row.supplier?.id ? row.supplier : null),
    archivedAt: row.product.archivedAt,
    movements,
    priceHistory: prices,
  });
});

productsRouter.post('/', requirePermission('catalog:write'), async (req, res) => {
  const data = productCreateSchema.parse(req.body);
  const { initialStock, ...fields } = data;
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(p)
      .values({
        ...fields,
        slug: await uniqueSlug(fields.name, undefined, tx),
        searchText: buildSearchText([fields.name, fields.description, await categoryName(fields.categoryId)]),
      })
      .returning();
    if (initialStock > 0) {
      await applyMovement(
        { productId: row!.id, type: 'INITIAL', quantity: initialStock, userId: req.user!.id, note: 'Alta del producto' },
        tx,
      );
    }
    await audit(
      { userId: req.user!.id, action: 'product.create', entity: 'product', entityId: row!.id, summary: `Creó el producto ${row!.name}` },
      tx,
    );
    return row!;
  });
  revalidateCatalog();
  const [fresh] = await db.select().from(p).where(eq(p.id, created.id));
  res.status(201).json(toProductDTO(fresh!));
});

productsRouter.patch('/:id', requirePermission('catalog:write'), async (req, res) => {
  const id = String(req.params.id);
  if ('stock' in (req.body ?? {})) {
    throw new HttpError(400, 'validation', 'El stock se modifica registrando un movimiento, no editando el producto');
  }
  const data = productUpdateSchema.parse(req.body);
  const touchesPrice = data.salePrice !== undefined || data.costPrice !== undefined;
  if (touchesPrice && !can(req.user!.role, 'prices:write')) {
    throw new HttpError(403, 'forbidden', 'Tu rol no puede modificar precios');
  }

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(p).where(eq(p.id, id)).for('update');
    if (!current) throw notFound('Producto');

    const name = data.name ?? current.name;
    const [row] = await tx
      .update(p)
      .set({
        ...data,
        slug: data.name && data.name !== current.name ? await uniqueSlug(data.name, id, tx) : undefined,
        searchText: buildSearchText([
          name,
          data.description !== undefined ? data.description : current.description,
          await categoryName(data.categoryId !== undefined ? data.categoryId : current.categoryId),
        ]),
        updatedAt: new Date(),
      })
      .where(eq(p.id, id))
      .returning();

    // Cada cambio de precio queda registrado con quién y cuándo.
    const changes: (typeof schema.priceChanges.$inferInsert)[] = [];
    if (data.salePrice !== undefined && data.salePrice !== current.salePrice) {
      changes.push({ productId: id, field: 'sale', previousValue: current.salePrice, newValue: data.salePrice, userId: req.user!.id });
    }
    if (data.costPrice !== undefined && data.costPrice !== current.costPrice) {
      changes.push({ productId: id, field: 'cost', previousValue: current.costPrice, newValue: data.costPrice, userId: req.user!.id });
    }
    if (changes.length) await tx.insert(schema.priceChanges).values(changes);

    await audit(
      {
        userId: req.user!.id,
        action: changes.length ? 'product.price' : 'product.update',
        entity: 'product',
        entityId: id,
        summary: changes.length
          ? `Cambió el precio de ${row!.name}${changes.find((c) => c.field === 'sale') ? ` a $${data.salePrice}` : ''}`
          : `Editó el producto ${row!.name}`,
      },
      tx,
    );
    return row!;
  });
  revalidateCatalog();
  res.json(toProductDTO(updated));
});

/**
 * "Eliminar" archiva: el producto desaparece del catálogo y de los listados,
 * pero su historial de movimientos y precios sigue intacto para reportes.
 */
productsRouter.delete('/:id', requirePermission('catalog:write'), async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db
    .update(p)
    .set({ archivedAt: new Date(), isPublished: false, isFeatured: false, sku: null, updatedAt: new Date() })
    .where(eq(p.id, id))
    .returning();
  if (!row) throw notFound('Producto');
  await audit({ userId: req.user!.id, action: 'product.archive', entity: 'product', entityId: id, summary: `Archivó el producto ${row.name}` });
  revalidateCatalog();
  res.status(204).end();
});

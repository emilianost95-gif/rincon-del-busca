import { Router } from 'express';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { categorySchema, slugify, supplierSchema } from '@rincon/shared';
import { db, schema } from '../db';
import { conflict, notFound } from '../lib/http';
import { audit, revalidateCatalog } from '../lib/audit';
import { requirePermission } from '../lib/auth';

/* --------------------------------------------------------- Categorías */

export const categoriesRouter = Router();
const cat = schema.categories;
const prod = schema.products;

categoriesRouter.get('/', requirePermission('catalog:read'), async (_req, res) => {
  const rows = await db
    .select({ category: cat, productCount: sql<number>`cast(count(${prod.id}) as int)` })
    .from(cat)
    .leftJoin(prod, and(eq(prod.categoryId, cat.id), isNull(prod.archivedAt)))
    .groupBy(cat.id)
    .orderBy(asc(cat.sortOrder), asc(cat.name));
  res.json(rows.map((r) => ({ ...r.category, productCount: r.productCount })));
});

async function uniqueCategorySlug(name: string, excludeId?: string) {
  const base = slugify(name) || 'categoria';
  let slug = base;
  for (let i = 2; ; i++) {
    const [hit] = await db.select({ id: cat.id }).from(cat).where(eq(cat.slug, slug));
    if (!hit || hit.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
}

categoriesRouter.post('/', requirePermission('catalog:write'), async (req, res) => {
  const data = categorySchema.parse(req.body);
  const [row] = await db
    .insert(cat)
    .values({ ...data, slug: await uniqueCategorySlug(data.name) })
    .returning();
  await audit({ userId: req.user!.id, action: 'category.create', entity: 'category', entityId: row!.id, summary: `Creó la categoría ${row!.name}` });
  revalidateCatalog();
  res.status(201).json(row);
});

categoriesRouter.patch('/:id', requirePermission('catalog:write'), async (req, res) => {
  const id = String(req.params.id);
  const data = categorySchema.partial().parse(req.body);
  const [row] = await db
    .update(cat)
    .set({ ...data, slug: data.name ? await uniqueCategorySlug(data.name, id) : undefined, updatedAt: new Date() })
    .where(eq(cat.id, id))
    .returning();
  if (!row) throw notFound('Categoría');
  await audit({ userId: req.user!.id, action: 'category.update', entity: 'category', entityId: id, summary: `Editó la categoría ${row.name}` });
  revalidateCatalog();
  res.json(row);
});

categoriesRouter.delete('/:id', requirePermission('catalog:write'), async (req, res) => {
  const id = String(req.params.id);
  const [used] = await db.select({ n: count() }).from(prod).where(and(eq(prod.categoryId, id), isNull(prod.archivedAt)));
  if (used && used.n > 0) {
    throw conflict(`La categoría tiene ${used.n} producto(s). Movelos a otra categoría antes de eliminarla.`);
  }
  const [row] = await db.delete(cat).where(eq(cat.id, id)).returning();
  if (!row) throw notFound('Categoría');
  await audit({ userId: req.user!.id, action: 'category.delete', entity: 'category', entityId: id, summary: `Eliminó la categoría ${row.name}` });
  revalidateCatalog();
  res.status(204).end();
});

/* -------------------------------------------------------- Proveedores */

export const suppliersRouter = Router();
const sup = schema.suppliers;

suppliersRouter.get('/', requirePermission('catalog:read'), async (_req, res) => {
  const rows = await db
    .select({ supplier: sup, productCount: sql<number>`cast(count(${prod.id}) as int)` })
    .from(sup)
    .leftJoin(prod, and(eq(prod.supplierId, sup.id), isNull(prod.archivedAt)))
    .groupBy(sup.id)
    .orderBy(asc(sup.name));
  res.json(rows.map((r) => ({ ...r.supplier, productCount: r.productCount })));
});

suppliersRouter.get('/:id', requirePermission('catalog:read'), async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.select().from(sup).where(eq(sup.id, id));
  if (!row) throw notFound('Proveedor');
  const [products, lastEntries] = await Promise.all([
    db
      .select({ id: prod.id, name: prod.name, stock: prod.stock, costPrice: prod.costPrice, unit: prod.unit })
      .from(prod)
      .where(and(eq(prod.supplierId, id), isNull(prod.archivedAt)))
      .orderBy(asc(prod.name)),
    db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.supplierId, id))
      .orderBy(desc(schema.stockMovements.createdAt))
      .limit(20),
  ]);
  res.json({ ...row, products: products.map((p) => ({ ...p, stock: Number(p.stock) })), lastEntries });
});

suppliersRouter.post('/', requirePermission('suppliers:write'), async (req, res) => {
  const data = supplierSchema.parse(req.body);
  const [row] = await db.insert(sup).values(data).returning();
  await audit({ userId: req.user!.id, action: 'supplier.create', entity: 'supplier', entityId: row!.id, summary: `Creó el proveedor ${row!.name}` });
  res.status(201).json(row);
});

suppliersRouter.patch('/:id', requirePermission('suppliers:write'), async (req, res) => {
  const id = String(req.params.id);
  const data = supplierSchema.partial().parse(req.body);
  const [row] = await db.update(sup).set({ ...data, updatedAt: new Date() }).where(eq(sup.id, id)).returning();
  if (!row) throw notFound('Proveedor');
  await audit({ userId: req.user!.id, action: 'supplier.update', entity: 'supplier', entityId: id, summary: `Editó el proveedor ${row.name}` });
  res.json(row);
});

suppliersRouter.delete('/:id', requirePermission('suppliers:write'), async (req, res) => {
  const id = String(req.params.id);
  // Los productos quedan sin proveedor (FK on delete set null); el historial se conserva.
  const [row] = await db.delete(sup).where(eq(sup.id, id)).returning();
  if (!row) throw notFound('Proveedor');
  await audit({ userId: req.user!.id, action: 'supplier.delete', entity: 'supplier', entityId: id, summary: `Eliminó el proveedor ${row.name}` });
  res.status(204).end();
});

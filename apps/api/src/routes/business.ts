import { Router } from 'express';
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { promotionSchema, settingsSchema, type DashboardDTO, type PromotionDTO } from '@rincon/shared';
import { z } from 'zod';
import { db, schema } from '../db';
import { env } from '../env';
import { notFound } from '../lib/http';
import { audit, revalidateCatalog } from '../lib/audit';
import { requirePermission } from '../lib/auth';
import { getSettings, saveSettings } from '../services/settings';
import { listMovements } from './inventory';

/* -------------------------------------------------------- Promociones */

export const promotionsRouter = Router();
const promo = schema.promotions;

function promoStatus(r: typeof promo.$inferSelect): PromotionDTO['status'] {
  const now = Date.now();
  if (!r.isActive) return 'paused';
  if (r.startsAt.getTime() > now) return 'scheduled';
  if (r.endsAt.getTime() <= now) return 'ended';
  return 'live';
}

promotionsRouter.get('/', requirePermission('catalog:read'), async (_req, res) => {
  const rows = await db
    .select({ promo, productName: schema.products.name })
    .from(promo)
    .leftJoin(schema.products, eq(schema.products.id, promo.productId))
    .orderBy(desc(promo.startsAt));
  res.json(
    rows.map(({ promo: r, productName }): PromotionDTO => ({
      id: r.id,
      title: r.title,
      description: r.description,
      productId: r.productId,
      productName,
      promoPrice: r.promoPrice,
      badge: r.badge,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      isActive: r.isActive,
      status: promoStatus(r),
    })),
  );
});

promotionsRouter.post('/', requirePermission('promotions:write'), async (req, res) => {
  const data = promotionSchema.parse(req.body);
  const [row] = await db.insert(promo).values(data).returning();
  await audit({ userId: req.user!.id, action: 'promotion.create', entity: 'promotion', entityId: row!.id, summary: `Creó la promoción "${row!.title}"` });
  revalidateCatalog();
  res.status(201).json(row);
});

promotionsRouter.patch('/:id', requirePermission('promotions:write'), async (req, res) => {
  const id = String(req.params.id);
  const [current] = await db.select().from(promo).where(eq(promo.id, id));
  if (!current) throw notFound('Promoción');
  // Se valida el resultado completo para que las fechas sigan siendo coherentes.
  const merged = promotionSchema.parse({ ...current, ...req.body });
  const [row] = await db.update(promo).set({ ...merged, updatedAt: new Date() }).where(eq(promo.id, id)).returning();
  await audit({ userId: req.user!.id, action: 'promotion.update', entity: 'promotion', entityId: id, summary: `Editó la promoción "${row!.title}"` });
  revalidateCatalog();
  res.json(row);
});

promotionsRouter.delete('/:id', requirePermission('promotions:write'), async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.delete(promo).where(eq(promo.id, id)).returning();
  if (!row) throw notFound('Promoción');
  await audit({ userId: req.user!.id, action: 'promotion.delete', entity: 'promotion', entityId: id, summary: `Eliminó la promoción "${row.title}"` });
  revalidateCatalog();
  res.status(204).end();
});

/* ------------------------------------------------------ Configuración */

export const settingsRouter = Router();

settingsRouter.get('/', requirePermission('dashboard:read'), async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put('/', requirePermission('settings:write'), async (req, res) => {
  const data = settingsSchema.parse(req.body);
  await saveSettings(data);
  await audit({ userId: req.user!.id, action: 'settings.update', entity: 'settings', summary: 'Actualizó la configuración del negocio' });
  revalidateCatalog();
  res.json(data);
});

/** Borra todos los datos marcados como DEMO (productos, promociones y sus movimientos). */
settingsRouter.post('/clear-demo', requirePermission('settings:write'), async (req, res) => {
  const result = await db.transaction(async (tx) => {
    const demo = await tx
      .select({ id: schema.products.id, name: schema.products.name })
      .from(schema.products)
      .where(eq(schema.products.isDemo, true))
      .for('update');

    // Red de seguridad: un producto demo con movimientos que vinieron de una planilla
    // es un producto real mal marcado (bases anteriores a esta corrección). No se borra:
    // se convierte en real y se informa.
    const touched = demo.length
      ? await tx
          .selectDistinct({ id: schema.stockMovements.productId })
          .from(schema.stockMovements)
          .where(
            and(
              inArray(schema.stockMovements.productId, demo.map((d) => d.id)),
              sql`${schema.stockMovements.importBatchId} is not null`,
            ),
          )
      : [];
    const keep = new Set(touched.map((t) => t.id));
    const kept = demo.filter((d) => keep.has(d.id));
    if (kept.length) {
      await tx
        .update(schema.products)
        .set({ isDemo: false, updatedAt: new Date() })
        .where(inArray(schema.products.id, kept.map((k) => k.id)));
    }
    const ids = demo.filter((d) => !keep.has(d.id)).map((d) => d.id);
    if (ids.length) {
      await tx.delete(schema.stockMovements).where(inArray(schema.stockMovements.productId, ids));
      await tx.delete(schema.priceChanges).where(inArray(schema.priceChanges.productId, ids));
      await tx.delete(schema.promotions).where(inArray(schema.promotions.productId, ids));
      await tx.delete(schema.products).where(inArray(schema.products.id, ids));
    }
    await tx.delete(schema.promotions).where(eq(schema.promotions.isDemo, true));
    const settings = await getSettings();
    await saveSettings({ ...settings, demoMode: false });
    await audit(
      {
        userId: req.user!.id,
        action: 'demo.clear',
        entity: 'settings',
        summary: `Eliminó ${ids.length} producto(s) de demostración${kept.length ? ` y conservó ${kept.length} con datos importados` : ''}`,
        meta: kept.length ? { kept: kept.map((k) => k.name) } : undefined,
      },
      tx,
    );
    return { removed: ids.length, kept: kept.map((k) => k.name) };
  });
  revalidateCatalog();
  res.json(result);
});

/* ---------------------------------------------------------- Dashboard */

export const dashboardRouter = Router();
const p = schema.products;
const c = schema.categories;
const m = schema.stockMovements;

dashboardRouter.get('/', requirePermission('dashboard:read'), async (_req, res) => {
  const active = isNull(p.archivedAt);

  const [totalsRow] = await db
    .select({
      products: sql<number>`cast(count(*) as int)`,
      published: sql<number>`cast(count(*) filter (where ${p.isPublished}) as int)`,
      inventoryCost: sql<number>`cast(coalesce(sum(${p.stock} * ${p.costPrice}), 0) as float)`,
      inventoryRetail: sql<number>`cast(coalesce(sum(${p.stock} * ${p.salePrice}), 0) as float)`,
      lowStock: sql<number>`cast(count(*) filter (where ${p.stock} > 0 and ${p.stock} <= ${p.minStock}) as int)`,
      outOfStock: sql<number>`cast(count(*) filter (where ${p.stock} <= 0) as int)`,
    })
    .from(p)
    .where(active);

  const [[cats], [sups], byDay, topCategories, topOut, recent, alerts, [promos]] = await Promise.all([
    db.select({ n: count() }).from(c),
    db.select({ n: count() }).from(schema.suppliers),
    // Serie diaria en la zona horaria del negocio, con días vacíos incluidos.
    db.execute<{ date: string; inQty: number; outQty: number; count: number }>(sql`
      select to_char(d, 'YYYY-MM-DD') as "date",
        cast(coalesce(sum(${m.delta}) filter (where ${m.delta} > 0), 0) as float) as "inQty",
        cast(coalesce(-sum(${m.delta}) filter (where ${m.delta} < 0), 0) as float) as "outQty",
        cast(count(${m.id}) as int) as "count"
      from generate_series((now() at time zone ${env.BUSINESS_TZ})::date - 13, (now() at time zone ${env.BUSINESS_TZ})::date, interval '1 day') as d
      left join ${m} on (${m.createdAt} at time zone ${env.BUSINESS_TZ})::date = d::date and ${m.type} <> 'INITIAL'
      group by d order by d`),
    db
      .select({
        name: c.name,
        color: c.color,
        retail: sql<number>`cast(coalesce(sum(${p.stock} * ${p.salePrice}), 0) as float)`,
        products: sql<number>`cast(count(${p.id}) as int)`,
      })
      .from(c)
      .leftJoin(p, and(eq(p.categoryId, c.id), active))
      .groupBy(c.id)
      .orderBy(desc(sql`3`))
      .limit(6),
    db
      .select({ id: m.productId, name: m.productName, quantity: sql<number>`cast(sum(${m.quantity}) as float)` })
      .from(m)
      .where(and(eq(m.type, 'OUT'), gt(m.createdAt, new Date(Date.now() - 30 * 86_400_000))))
      .groupBy(m.productId, m.productName)
      .orderBy(desc(sql`3`))
      .limit(5),
    listMovements(undefined, 8),
    db
      .select({ id: p.id, name: p.name, stock: p.stock, minStock: p.minStock, unit: p.unit })
      .from(p)
      .where(and(active, lte(p.stock, p.minStock)))
      .orderBy(asc(p.stock))
      .limit(8),
    db
      .select({ n: count() })
      .from(promo)
      .where(and(eq(promo.isActive, true), lte(promo.startsAt, new Date()), gt(promo.endsAt, new Date()))),
  ]);

  const dto: DashboardDTO = {
    totals: {
      products: totalsRow?.products ?? 0,
      published: totalsRow?.published ?? 0,
      categories: cats?.n ?? 0,
      suppliers: sups?.n ?? 0,
      inventoryCost: Math.round(totalsRow?.inventoryCost ?? 0),
      inventoryRetail: Math.round(totalsRow?.inventoryRetail ?? 0),
      lowStock: totalsRow?.lowStock ?? 0,
      outOfStock: totalsRow?.outOfStock ?? 0,
    },
    movementsByDay: byDay.rows,
    topCategories: topCategories.filter((t) => t.products > 0),
    topOutProducts: topOut,
    recentMovements: recent,
    alerts: alerts.map((a) => ({ ...a, stock: Number(a.stock), minStock: Number(a.minStock), unit: a.unit as never })),
    activePromotions: promos?.n ?? 0,
  };
  res.json(dto);
});

/* ---------------------------------------------------------- Auditoría */

export const auditRouter = Router();
const auditQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

auditRouter.get('/', requirePermission('audit:read'), async (req, res) => {
  const q = auditQuery.parse(req.query);
  const a = schema.auditLogs;
  const [rows, [total]] = await Promise.all([
    db
      .select({ a, userName: schema.users.name })
      .from(a)
      .leftJoin(schema.users, eq(schema.users.id, a.userId))
      .orderBy(desc(a.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(a),
  ]);
  res.json({
    items: rows.map(({ a: r, userName }) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      summary: r.summary,
      userName,
      createdAt: r.createdAt.toISOString(),
    })),
    total: total?.n ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  });
});

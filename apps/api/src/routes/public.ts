import { Router } from 'express';
import { and, asc, count, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { productListQuerySchema, type PublicSettingsDTO } from '@rincon/shared';
import { db, schema } from '../db';
import { notFound } from '../lib/http';
import { getSettings } from '../services/settings';
import { livePromotionsByProduct, productOrder, productWhere, toPublicProduct } from '../services/products';

/**
 * Endpoints públicos de sólo lectura que alimentan la landing y el catálogo.
 * Nunca exponen costos, proveedores ni cantidades exactas de stock.
 */
export const publicRouter = Router();

publicRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
  next();
});

publicRouter.get('/settings', async (_req, res) => {
  const s = await getSettings();
  const dto: PublicSettingsDTO = s;
  res.json(dto);
});

publicRouter.get('/categories', async (_req, res) => {
  const p = schema.products;
  const rows = await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      slug: schema.categories.slug,
      description: schema.categories.description,
      color: schema.categories.color,
      icon: schema.categories.icon,
      sortOrder: schema.categories.sortOrder,
      productCount: sql<number>`cast(count(${p.id}) as int)`,
    })
    .from(schema.categories)
    .leftJoin(p, and(eq(p.categoryId, schema.categories.id), eq(p.isPublished, true), isNull(p.archivedAt)))
    .where(eq(schema.categories.isPublished, true))
    .groupBy(schema.categories.id)
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  res.json(rows);
});

publicRouter.get('/products', async (req, res) => {
  const q = productListQuerySchema.parse(req.query);
  const featured = req.query.featured === '1';
  const where = productWhere({ q: q.q, category: q.category, publicOnly: true, featured });
  const base = db
    .select({ product: schema.products, category: schema.categories })
    .from(schema.products)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(where);

  const [rows, [total], promos] = await Promise.all([
    base
      .orderBy(...productOrder(q.sort))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db
      .select({ n: count() })
      .from(schema.products)
      .leftJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
      .where(where),
    livePromotionsByProduct(),
  ]);

  res.json({
    items: rows.map((r) => toPublicProduct(r.product, r.category, promos)),
    total: total?.n ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  });
});

publicRouter.get('/products/:slug', async (req, res) => {
  const [row] = await db
    .select({ product: schema.products, category: schema.categories })
    .from(schema.products)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(eq(schema.products.slug, String(req.params.slug)), productWhere({ publicOnly: true })))
    .limit(1);
  if (!row) throw notFound('Producto');
  const promos = await livePromotionsByProduct();
  res.json(toPublicProduct(row.product, row.category, promos));
});

/** Promociones vigentes con su producto (si está publicado). */
publicRouter.get('/promotions', async (_req, res) => {
  const now = new Date();
  const rows = await db
    .select({ promo: schema.promotions, product: schema.products, category: schema.categories })
    .from(schema.promotions)
    .leftJoin(schema.products, eq(schema.products.id, schema.promotions.productId))
    .leftJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(
      and(eq(schema.promotions.isActive, true), lte(schema.promotions.startsAt, now), gt(schema.promotions.endsAt, now)),
    )
    .orderBy(asc(schema.promotions.endsAt))
    .limit(12);

  const promos = await livePromotionsByProduct();
  res.json(
    rows
      .filter((r) => !r.product || (r.product.isPublished && !r.product.archivedAt))
      .map((r) => ({
        id: r.promo.id,
        title: r.promo.title,
        description: r.promo.description,
        badge: r.promo.badge,
        endsAt: r.promo.endsAt.toISOString(),
        isDemo: r.promo.isDemo,
        product: r.product ? toPublicProduct(r.product, r.category, promos) : null,
      })),
  );
});

/** Lista mínima para el sitemap. */
publicRouter.get('/sitemap', async (_req, res) => {
  const rows = await db
    .select({ slug: schema.products.slug, updatedAt: schema.products.updatedAt })
    .from(schema.products)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(productWhere({ publicOnly: true }))
    .limit(5000);
  res.json(rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() })));
});

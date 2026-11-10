import { and, asc, desc, eq, ilike, isNull, lte, gt, or, sql, type SQL } from 'drizzle-orm';
import { slugify, type ProductDTO, type PublicProductDTO, type Unit } from '@rincon/shared';
import { db, schema, type Tx } from '../db';

const p = schema.products;
const c = schema.categories;

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function buildSearchText(parts: (string | null | undefined)[]) {
  return normalize(parts.filter(Boolean).join(' '));
}

/** Genera un slug único agregando sufijo si hace falta. */
export async function uniqueSlug(name: string, excludeId?: string, t: Tx | typeof db = db) {
  const base = slugify(name) || 'producto';
  let slug = base;
  for (let i = 2; i < 200; i++) {
    const [hit] = await t.select({ id: p.id }).from(p).where(eq(p.slug, slug)).limit(1);
    if (!hit || hit.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

export interface ProductFilterInput {
  q?: string;
  category?: string; // slug o id
  supplier?: string;
  stock?: 'all' | 'low' | 'out' | 'ok';
  status?: 'all' | 'published' | 'hidden';
  publicOnly?: boolean;
  featured?: boolean;
}

export function productWhere(f: ProductFilterInput): SQL {
  const conds: SQL[] = [isNull(p.archivedAt)];
  if (f.q) {
    const terms = normalize(f.q).split(/\s+/).filter(Boolean).slice(0, 5);
    for (const term of terms) {
      const like = `%${term.replace(/[%_]/g, '')}%`;
      conds.push(or(ilike(p.searchText, like), ilike(p.sku, like), ilike(p.barcode, like))!);
    }
  }
  if (f.category) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(f.category);
    conds.push(isUuid ? eq(p.categoryId, f.category) : eq(c.slug, f.category));
  }
  if (f.supplier) conds.push(eq(p.supplierId, f.supplier));
  if (f.stock === 'out') conds.push(lte(p.stock, 0));
  if (f.stock === 'low') conds.push(and(gt(p.stock, 0), lte(p.stock, p.minStock))!);
  if (f.stock === 'ok') conds.push(gt(p.stock, p.minStock));
  if (f.status === 'published') conds.push(eq(p.isPublished, true));
  if (f.status === 'hidden') conds.push(eq(p.isPublished, false));
  if (f.publicOnly) {
    conds.push(eq(p.isPublished, true));
    conds.push(or(isNull(p.categoryId), eq(c.isPublished, true))!);
  }
  if (f.featured) conds.push(eq(p.isFeatured, true));
  return and(...conds)!;
}

export function productOrder(sort: string) {
  switch (sort) {
    case 'price_asc':
      return [asc(p.salePrice)];
    case 'price_desc':
      return [desc(p.salePrice)];
    case 'stock':
      return [asc(p.stock)];
    case 'updated':
      return [desc(p.updatedAt)];
    case 'featured':
      return [desc(p.isFeatured), asc(p.name)];
    default:
      return [asc(p.name)];
  }
}

type ProductRow = typeof p.$inferSelect;
type CategoryRow = typeof c.$inferSelect;

export function toProductDTO(
  row: ProductRow,
  category?: CategoryRow | null,
  supplier?: { id: string; name: string } | null,
): ProductDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    barcode: row.barcode,
    description: row.description,
    categoryId: row.categoryId,
    supplierId: row.supplierId,
    unit: row.unit as Unit,
    costPrice: row.costPrice,
    salePrice: row.salePrice,
    stock: Number(row.stock),
    minStock: Number(row.minStock),
    imageUrl: row.imageUrl,
    isPublished: row.isPublished,
    isFeatured: row.isFeatured,
    showPrice: row.showPrice,
    isDemo: row.isDemo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    category: category
      ? { id: category.id, name: category.name, slug: category.slug, color: category.color, icon: category.icon }
      : null,
    supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
  };
}

/** Promociones vigentes por producto (la de menor precio gana). */
export async function livePromotionsByProduct(): Promise<Map<string, { price: number | null; badge: string | null }>> {
  const now = new Date();
  const rows = await db
    .select()
    .from(schema.promotions)
    .where(
      and(
        eq(schema.promotions.isActive, true),
        lte(schema.promotions.startsAt, now),
        gt(schema.promotions.endsAt, now),
        sql`${schema.promotions.productId} is not null`,
      ),
    );
  const map = new Map<string, { price: number | null; badge: string | null }>();
  for (const r of rows) {
    const prev = map.get(r.productId!);
    if (!prev || (r.promoPrice ?? Infinity) < (prev.price ?? Infinity)) {
      map.set(r.productId!, { price: r.promoPrice, badge: r.badge });
    }
  }
  return map;
}

export function toPublicProduct(
  row: ProductRow,
  category: CategoryRow | null,
  promos: Map<string, { price: number | null; badge: string | null }>,
): PublicProductDTO {
  const stock = Number(row.stock);
  const min = Number(row.minStock);
  const promo = promos.get(row.id);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    unit: row.unit as Unit,
    price: row.showPrice ? row.salePrice : null,
    promoPrice: row.showPrice && promo?.price != null && promo.price < row.salePrice ? promo.price : null,
    promoBadge: promo?.badge ?? (promo ? 'Promo' : null),
    availability: stock <= 0 ? 'out' : stock <= min ? 'low' : 'available',
    imageUrl: row.imageUrl,
    isFeatured: row.isFeatured,
    isDemo: row.isDemo,
    category:
      category && category.isPublished
        ? { name: category.name, slug: category.slug, color: category.color, icon: category.icon }
        : null,
  };
}

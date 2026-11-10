import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { ParetoDTO, ParetoMetric, Unit } from '@rincon/shared';
import { db, schema } from '../db';

const p = schema.products;
const c = schema.categories;
const m = schema.stockMovements;

/** Umbrales clásicos del análisis ABC sobre el acumulado. */
export const ABC_THRESHOLDS = { A: 0.8, B: 0.95 } as const;
/** Días de cobertura que se sugieren como stock mínimo para los productos A. */
const COVERAGE_DAYS = 7;

/**
 * Clasifica una lista ya ordenada de mayor a menor.
 * Un ítem es A si el acumulado ANTES de sumarlo todavía no llegó al 80 %:
 * así el producto que cruza el umbral también cuenta como A (criterio estándar).
 */
export function classify<T extends { value: number }>(sorted: T[]) {
  const total = sorted.reduce((a, r) => a + r.value, 0);
  let acc = 0;
  return {
    total,
    items: sorted.map((r) => {
      const before = total > 0 ? acc / total : 1;
      acc += r.value;
      const share = total > 0 ? r.value / total : 0;
      const cumulative = total > 0 ? acc / total : 0;
      const abc: 'A' | 'B' | 'C' = r.value <= 0 ? 'C' : before < ABC_THRESHOLDS.A ? 'A' : before < ABC_THRESHOLDS.B ? 'B' : 'C';
      return { ...r, share, cumulative, abc };
    }),
  };
}

export async function computePareto(metric: ParetoMetric, from: Date, to: Date): Promise<ParetoDTO> {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));

  // Ventas netas del período (salidas menos devoluciones), por producto.
  const sales = db
    .select({
      productId: m.productId,
      units: sql<number>`cast(coalesce(sum(case when ${m.type} = 'OUT' then ${m.quantity} when ${m.type} = 'RETURN' then -${m.quantity} else 0 end), 0) as float)`.as('units'),
      revenue: sql<number>`cast(coalesce(sum(case
        when ${m.type} = 'OUT' then ${m.quantity} * coalesce(${m.unitPrice}, ${p.salePrice})
        when ${m.type} = 'RETURN' then -${m.quantity} * coalesce(${m.unitPrice}, ${p.salePrice})
        else 0 end), 0) as float)`.as('revenue'),
    })
    .from(m)
    .innerJoin(p, eq(p.id, m.productId))
    .where(and(gte(m.createdAt, from), lte(m.createdAt, to)))
    .groupBy(m.productId)
    .as('sales');

  const rows = await db
    .select({
      id: p.id,
      name: p.name,
      unit: p.unit,
      stock: p.stock,
      minStock: p.minStock,
      costPrice: p.costPrice,
      category: c.name,
      color: c.color,
      units: sql<number>`coalesce(${sales.units}, 0)`,
      revenue: sql<number>`coalesce(${sales.revenue}, 0)`,
    })
    .from(p)
    .leftJoin(c, eq(c.id, p.categoryId))
    .leftJoin(sales, eq(sales.productId, p.id))
    .where(isNull(p.archivedAt));

  const withValue = rows.map((r) => {
    const stock = Number(r.stock);
    const units = Math.max(0, Number(r.units));
    const revenue = Math.max(0, Math.round(Number(r.revenue)));
    const value = metric === 'units' ? units : metric === 'revenue' ? revenue : Math.max(0, Math.round(stock * r.costPrice));
    return { ...r, stock, minStock: Number(r.minStock), units, revenue, value };
  });
  withValue.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const { total, items } = classify(withValue);

  const summary = { A: { count: 0, share: 0 }, B: { count: 0, share: 0 }, C: { count: 0, share: 0 } };
  for (const it of items) {
    summary[it.abc].count += 1;
    summary[it.abc].share += it.share;
  }

  return {
    metric,
    from: from.toISOString(),
    to: to.toISOString(),
    days,
    total,
    productCount: items.length,
    withoutMovement: items.filter((i) => i.value <= 0).length,
    summary,
    items: items.map((it) => {
      const dailyAvg = it.units / days;
      const suggested = metric !== 'inventory' && it.abc === 'A' && dailyAvg > 0 ? Math.ceil(dailyAvg * COVERAGE_DAYS) : null;
      return {
        id: it.id,
        name: it.name,
        category: it.category ?? 'Sin categoría',
        color: it.color ?? '#8A8577',
        unit: it.unit as Unit,
        value: it.value,
        units: it.units,
        revenue: it.revenue,
        share: it.share,
        cumulative: it.cumulative,
        abc: it.abc,
        stock: it.stock,
        minStock: it.minStock,
        suggestedMinStock: suggested !== null && suggested > it.minStock ? suggested : null,
      };
    }),
  };
}

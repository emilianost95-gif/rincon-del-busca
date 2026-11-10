import { Router, type Response } from 'express';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { MOVEMENT_LABELS, UNIT_SHORT, type Unit } from '@rincon/shared';
import { z } from 'zod';
import { db, schema } from '../db';
import { requirePermission } from '../lib/auth';
import { listMovements, movementFilters } from './inventory';
import { env } from '../env';

export const reportsRouter = Router();
reportsRouter.use(requirePermission('reports:read'));

const p = schema.products;
const c = schema.categories;

/** CSV compatible con Excel en español: separador ";" y BOM UTF-8. */
function sendCsv(res: Response, filename: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Evita inyección de fórmulas al abrir en Excel.
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + body);
}

const stamp = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: env.BUSINESS_TZ }).format(new Date(d));

/** Valorización de inventario por categoría (para la pantalla Reportes). */
reportsRouter.get('/inventory', async (_req, res) => {
  const rows = await db
    .select({
      category: sql<string>`coalesce(${c.name}, 'Sin categoría')`,
      color: sql<string>`coalesce(${c.color}, '#8A8577')`,
      products: sql<number>`cast(count(${p.id}) as int)`,
      units: sql<number>`cast(coalesce(sum(${p.stock}), 0) as float)`,
      cost: sql<number>`cast(coalesce(sum(${p.stock} * ${p.costPrice}), 0) as float)`,
      retail: sql<number>`cast(coalesce(sum(${p.stock} * ${p.salePrice}), 0) as float)`,
      low: sql<number>`cast(count(*) filter (where ${p.stock} > 0 and ${p.stock} <= ${p.minStock}) as int)`,
      out: sql<number>`cast(count(*) filter (where ${p.stock} <= 0) as int)`,
    })
    .from(p)
    .leftJoin(c, eq(c.id, p.categoryId))
    .where(isNull(p.archivedAt))
    .groupBy(c.id, c.name, c.color)
    .orderBy(sql`5 desc`);
  res.json(rows.map((r) => ({ ...r, cost: Math.round(r.cost), retail: Math.round(r.retail) })));
});

reportsRouter.get('/export/products.csv', async (_req, res) => {
  const rows = await db
    .select({ p, category: c.name, supplier: schema.suppliers.name })
    .from(p)
    .leftJoin(c, eq(c.id, p.categoryId))
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, p.supplierId))
    .where(isNull(p.archivedAt))
    .orderBy(asc(p.name));
  sendCsv(
    res,
    `productos-${stamp()}.csv`,
    ['Nombre', 'SKU', 'Código de barras', 'Categoría', 'Proveedor', 'Unidad', 'Costo', 'Precio venta', 'Margen %', 'Stock', 'Stock mínimo', 'Estado', 'Publicado', 'Destacado'],
    rows.map(({ p: r, category, supplier }) => {
      const stock = Number(r.stock);
      const min = Number(r.minStock);
      const margin = r.salePrice > 0 ? Math.round(((r.salePrice - r.costPrice) / r.salePrice) * 1000) / 10 : 0;
      return [
        r.name,
        r.sku,
        r.barcode,
        category,
        supplier,
        UNIT_SHORT[r.unit as Unit] ?? r.unit,
        r.costPrice,
        r.salePrice,
        margin,
        stock,
        min,
        stock <= 0 ? 'Agotado' : stock <= min ? 'Stock bajo' : 'OK',
        r.isPublished ? 'Sí' : 'No',
        r.isFeatured ? 'Sí' : 'No',
      ];
    }),
  );
});

reportsRouter.get('/export/low-stock.csv', async (_req, res) => {
  const rows = await db
    .select({ p, supplier: schema.suppliers.name, phone: schema.suppliers.phone })
    .from(p)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, p.supplierId))
    .where(and(isNull(p.archivedAt), sql`${p.stock} <= ${p.minStock}`))
    .orderBy(asc(p.stock));
  sendCsv(
    res,
    `reposicion-${stamp()}.csv`,
    ['Producto', 'SKU', 'Stock actual', 'Stock mínimo', 'Sugerido reponer', 'Proveedor', 'Teléfono proveedor'],
    rows.map(({ p: r, supplier, phone }) => {
      const stock = Number(r.stock);
      const min = Number(r.minStock);
      return [r.name, r.sku, stock, min, Math.max(0, min * 2 - stock), supplier, phone];
    }),
  );
});

const exportMovementsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

reportsRouter.get('/export/movements.csv', async (req, res) => {
  const q = exportMovementsQuery.parse(req.query);
  const items = await listMovements(movementFilters({ ...q, page: 1, pageSize: 1 }), 20000);
  sendCsv(
    res,
    `movimientos-${stamp()}.csv`,
    ['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Variación', 'Stock anterior', 'Stock resultante', 'Costo unitario', 'Proveedor', 'Usuario', 'Nota'],
    items.map((m) => [
      fmtDate(m.createdAt),
      m.productName,
      MOVEMENT_LABELS[m.type],
      m.quantity,
      m.delta,
      m.previousStock,
      m.resultingStock,
      m.unitCost,
      m.supplierName,
      m.userName,
      m.note,
    ]),
  );
});

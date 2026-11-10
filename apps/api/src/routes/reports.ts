import { Router, type Response } from 'express';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import * as XLSX from '@e965/xlsx';
import { MOVEMENT_LABELS, UNIT_SHORT, type ParetoMetric, type Unit } from '@rincon/shared';
import { z } from 'zod';
import { db, schema } from '../db';
import { requirePermission } from '../lib/auth';
import { HttpError } from '../lib/http';
import { listMovements, movementFilters } from './inventory';
import { computePareto } from '../services/pareto';
import { env } from '../env';

export const reportsRouter = Router();
reportsRouter.use(requirePermission('reports:read'));

const p = schema.products;
const c = schema.categories;

type Cell = string | number | null;
interface Table {
  filename: string;
  sheet: string;
  header: string[];
  rows: Cell[][];
  /** Anchos de columna sugeridos (en caracteres) para Excel. */
  widths?: number[];
}

/** Evita que un texto que empieza con =, +, - o @ se ejecute como fórmula. */
const safeText = (v: Cell) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

function sendCsv(res: Response, t: Table) {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return '';
    const s = String(safeText(v));
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [t.header, ...t.rows].map((r) => r.map(esc).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${t.filename}.csv"`);
  res.send('﻿' + body);
}

/** Excel nativo: números como números (se pueden sumar y filtrar), encabezado fijo y autofiltro. */
function sendXlsx(res: Response, t: Table) {
  const ws = XLSX.utils.aoa_to_sheet([t.header, ...t.rows.map((r) => r.map(safeText))]);
  ws['!cols'] = t.header.map((h, i) => ({ wch: t.widths?.[i] ?? Math.max(10, Math.min(40, h.length + 4)) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: t.rows.length, c: t.header.length - 1 } }) };
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.sheet.slice(0, 31));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${t.filename}.xlsx"`);
  res.send(buf);
}

const stamp = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: env.BUSINESS_TZ }).format(new Date(d));

/* ------------------------------------------------------ Tablas exportables */

async function productsTable(): Promise<Table> {
  const rows = await db
    .select({ p, category: c.name, supplier: schema.suppliers.name })
    .from(p)
    .leftJoin(c, eq(c.id, p.categoryId))
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, p.supplierId))
    .where(isNull(p.archivedAt))
    .orderBy(asc(p.name));
  return {
    filename: `productos-${stamp()}`,
    sheet: 'Productos',
    // Mismos encabezados que reconoce el importador: exportar → editar en Excel → importar.
    header: ['Producto', 'SKU', 'Código de barras', 'Categoría', 'Proveedor', 'Unidad', 'Costo', 'Precio venta', 'Margen %', 'Stock', 'Stock mínimo', 'Estado', 'Publicado', 'Destacado'],
    widths: [36, 14, 16, 16, 22, 9, 10, 12, 10, 9, 12, 12, 10, 10],
    rows: rows.map(({ p: r, category, supplier }) => {
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
  };
}

async function lowStockTable(): Promise<Table> {
  const rows = await db
    .select({ p, supplier: schema.suppliers.name, phone: schema.suppliers.phone })
    .from(p)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, p.supplierId))
    .where(and(isNull(p.archivedAt), sql`${p.stock} <= ${p.minStock}`))
    .orderBy(asc(p.stock));
  return {
    filename: `reposicion-${stamp()}`,
    sheet: 'Reposición',
    header: ['Producto', 'SKU', 'Stock actual', 'Stock mínimo', 'Sugerido reponer', 'Proveedor', 'Teléfono proveedor'],
    widths: [36, 14, 12, 12, 16, 24, 18],
    rows: rows.map(({ p: r, supplier, phone }) => {
      const stock = Number(r.stock);
      const min = Number(r.minStock);
      return [r.name, r.sku, stock, min, Math.max(0, min * 2 - stock), supplier, phone];
    }),
  };
}

const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

async function movementsTable(query: unknown): Promise<Table> {
  const q = rangeQuery.parse(query);
  const items = await listMovements(movementFilters({ ...q, page: 1, pageSize: 1 }), 50000);
  return {
    filename: `movimientos-${stamp()}`,
    sheet: 'Movimientos',
    header: ['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Variación', 'Stock anterior', 'Stock resultante', 'Precio venta', 'Costo unitario', 'Proveedor', 'Usuario', 'Nota'],
    widths: [17, 34, 16, 10, 10, 13, 15, 12, 13, 22, 16, 30],
    rows: items.map((m) => [
      fmtDate(m.createdAt),
      m.productName,
      MOVEMENT_LABELS[m.type],
      m.quantity,
      m.delta,
      m.previousStock,
      m.resultingStock,
      m.unitPrice,
      m.unitCost,
      m.supplierName,
      m.userName,
      m.note,
    ]),
  };
}

const paretoQuery = z.object({
  metric: z.enum(['units', 'revenue', 'inventory']).default('revenue'),
  days: z.coerce.number().int().min(1).max(730).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function paretoRange(q: z.infer<typeof paretoQuery>) {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - (q.days ?? 30) * 86_400_000);
  if (from >= to) throw new HttpError(400, 'validation', 'La fecha inicial debe ser anterior a la final');
  return { from, to };
}

const METRIC_LABEL: Record<ParetoMetric, string> = {
  units: 'Unidades vendidas',
  revenue: 'Facturación',
  inventory: 'Capital inmovilizado',
};

async function paretoTable(query: unknown): Promise<Table> {
  const q = paretoQuery.parse(query);
  const { from, to } = paretoRange(q);
  const data = await computePareto(q.metric, from, to);
  return {
    filename: `pareto-${q.metric}-${stamp()}`,
    sheet: 'Pareto ABC',
    header: ['#', 'Producto', 'Categoría', METRIC_LABEL[q.metric], 'Participación %', 'Acumulado %', 'Clase', 'Unidades vendidas', 'Facturación', 'Stock', 'Stock mínimo', 'Mínimo sugerido'],
    widths: [5, 36, 16, 18, 15, 13, 7, 17, 13, 9, 13, 15],
    rows: data.items.map((it, i) => [
      i + 1,
      it.name,
      it.category,
      it.value,
      Math.round(it.share * 1000) / 10,
      Math.round(it.cumulative * 1000) / 10,
      it.abc,
      it.units,
      it.revenue,
      it.stock,
      it.minStock,
      it.suggestedMinStock,
    ]),
  };
}

const TABLES: Record<string, (query: unknown) => Promise<Table>> = {
  products: () => productsTable(),
  'low-stock': () => lowStockTable(),
  movements: movementsTable,
  pareto: paretoTable,
};

/* --------------------------------------------------------------- Rutas */

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

/** Análisis de Pareto / ABC. */
reportsRouter.get('/pareto', async (req, res) => {
  const q = paretoQuery.parse(req.query);
  const { from, to } = paretoRange(q);
  res.json(await computePareto(q.metric, from, to));
});

/** Exportaciones: /export/products.csv, /export/products.xlsx, etc. */
reportsRouter.get('/export/:file', async (req, res) => {
  const match = /^([a-z-]+)\.(csv|xlsx)$/.exec(String(req.params.file));
  const build = match ? TABLES[match[1]!] : undefined;
  if (!match || !build) throw new HttpError(404, 'not_found', 'Reporte inexistente');
  const table = await build(req.query);
  if (match[2] === 'xlsx') sendXlsx(res, table);
  else sendCsv(res, table);
});

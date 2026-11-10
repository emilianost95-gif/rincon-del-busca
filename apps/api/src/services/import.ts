import { isNull, sql } from 'drizzle-orm';
import {
  formatQty,
  normalizeText,
  similarity,
  slugify,
  type ImportPreviewDTO,
  type ImportRequest,
  type ImportRowResult,
  type Unit,
} from '@rincon/shared';
import { db, schema, type Tx } from '../db';
import { audit, revalidateCatalog } from '../lib/audit';
import { buildSearchText } from './products';

const FUZZY_THRESHOLD = 0.75;
const CHUNK = 500;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

type ProductRow = typeof schema.products.$inferSelect;
interface Named {
  id: string;
  name: string;
}

interface State {
  products: ProductRow[];
  categories: Named[];
  suppliers: Named[];
  slugs: Set<string>;
}

async function loadState(t: Tx | typeof db): Promise<State> {
  const [products, categories, suppliers, slugRows] = await Promise.all([
    t.select().from(schema.products).where(isNull(schema.products.archivedAt)),
    t.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories),
    t.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers),
    t.select({ slug: schema.products.slug }).from(schema.products),
  ]);
  return { products, categories, suppliers, slugs: new Set(slugRows.map((r) => r.slug)) };
}

/** Busca por nombre exacto (sin tildes) y si no, por parecido (errores de tipeo). */
function resolveNamed(list: Named[], input: string): { item: Named; fuzzy: boolean } | null {
  const n = normalizeText(input);
  const exact = list.find((x) => normalizeText(x.name) === n);
  if (exact) return { item: exact, fuzzy: false };
  let best: Named | null = null;
  let bestScore = 0;
  for (const x of list) {
    const s = similarity(x.name, input);
    if (s > bestScore) {
      bestScore = s;
      best = x;
    }
  }
  return best && bestScore >= FUZZY_THRESHOLD ? { item: best, fuzzy: true } : null;
}

interface PlannedProduct {
  result: ImportRowResult;
  existing?: ProductRow;
  /** Valores finales a escribir. */
  data?: {
    name: string;
    sku: string | null;
    barcode: string | null;
    description: string | null;
    categoryKey: string | null; // id existente o "new:<nombre>"
    supplierKey: string | null;
    unit: Unit;
    costPrice: number;
    salePrice: number;
    minStock: number;
    isPublished: boolean;
    showPrice: boolean;
  };
  stock?: { type: 'INITIAL' | 'ADJUST' | 'IN'; quantity: number; resulting: number };
  priceChanges: { field: 'sale' | 'cost'; from: number; to: number }[];
}

/**
 * Arma el plan completo SIN escribir nada: qué se crea, qué se actualiza
 * (campo por campo), qué movimientos de stock se generan y qué filas fallan.
 * La vista previa y la aplicación usan exactamente esta misma función.
 */
export function buildPlan(state: State, req: ImportRequest) {
  const { options } = req;
  const bySku = new Map<string, ProductRow>();
  const byBarcode = new Map<string, ProductRow>();
  const byName = new Map<string, ProductRow>();
  for (const p of state.products) {
    if (p.sku) bySku.set(p.sku.toLowerCase(), p);
    if (p.barcode) byBarcode.set(p.barcode, p);
    byName.set(normalizeText(p.name), p);
  }

  const newCategories = new Map<string, string>(); // normalizado → nombre a crear
  const newSuppliers = new Map<string, string>();
  const fuzzyMatches: ImportPreviewDTO['fuzzyMatches'] = [];
  const fuzzySeen = new Set<string>();
  const seenKeys = new Map<string, number>();
  const plans: PlannedProduct[] = [];

  const resolveCategory = (raw: string | null, warnings: string[]) => {
    if (!raw) return null;
    const hit = resolveNamed(state.categories, raw);
    if (hit) {
      if (hit.fuzzy && !fuzzySeen.has(`c:${raw}`)) {
        fuzzySeen.add(`c:${raw}`);
        fuzzyMatches.push({ input: raw, matched: hit.item.name, kind: 'categoría' });
      }
      return hit.item.id;
    }
    const key = normalizeText(raw);
    // Varias filas con la misma categoría nueva (o con typos entre sí) crean una sola.
    for (const [k, name] of newCategories) if (k === key || similarity(name, raw) >= 0.9) return `new:${k}`;
    if (!options.createCategories) {
      warnings.push(`La categoría "${raw}" no existe: queda sin categoría`);
      return null;
    }
    newCategories.set(key, raw.trim().replace(/^\w/, (c) => c.toUpperCase()));
    return `new:${key}`;
  };

  const resolveSupplier = (raw: string | null, warnings: string[]) => {
    if (!raw) return null;
    const hit = resolveNamed(state.suppliers, raw);
    if (hit) {
      if (hit.fuzzy && !fuzzySeen.has(`s:${raw}`)) {
        fuzzySeen.add(`s:${raw}`);
        fuzzyMatches.push({ input: raw, matched: hit.item.name, kind: 'proveedor' });
      }
      return hit.item.id;
    }
    const key = normalizeText(raw);
    if (newSuppliers.has(key)) return `new:${key}`;
    if (!options.createSuppliers) {
      warnings.push(`El proveedor "${raw}" no existe: queda sin proveedor`);
      return null;
    }
    newSuppliers.set(key, raw.trim());
    return `new:${key}`;
  };

  for (const r of req.rows) {
    const errors: string[] = [...r.parseIssues];
    const warnings: string[] = [];
    const label = r.name ?? r.sku ?? r.barcode ?? `Fila ${r.row}`;
    const result: ImportRowResult = { row: r.row, sheet: r.sheet, name: label, action: 'error', changes: [], errors, warnings };
    const plan: PlannedProduct = { result, priceChanges: [] };
    plans.push(plan);

    if (!r.name && !r.sku && !r.barcode) {
      result.action = 'skip';
      warnings.push('Fila sin nombre ni código');
      continue;
    }

    // Duplicados dentro del mismo archivo
    const key = r.sku ? `sku:${r.sku.toLowerCase()}` : r.barcode ? `bc:${r.barcode}` : `n:${normalizeText(r.name)}`;
    const dupOf = seenKeys.get(key);
    if (dupOf !== undefined) {
      errors.push(`Repetido: el mismo producto ya aparece en la fila ${dupOf}`);
      continue;
    }
    seenKeys.set(key, r.row);

    // Coincidencia con lo existente: SKU → código de barras → nombre
    let existing: ProductRow | undefined;
    let matchedBy: ImportRowResult['matchedBy'];
    if (r.sku && bySku.get(r.sku.toLowerCase())) {
      existing = bySku.get(r.sku.toLowerCase());
      matchedBy = 'sku';
    } else if (r.barcode && byBarcode.get(r.barcode)) {
      existing = byBarcode.get(r.barcode);
      matchedBy = 'barcode';
    } else if (r.name && byName.get(normalizeText(r.name))) {
      existing = byName.get(normalizeText(r.name));
      matchedBy = 'name';
    }
    result.matchedBy = matchedBy;

    if (existing && options.mode === 'create') {
      result.action = 'skip';
      result.productId = existing.id;
      warnings.push('Ya existe y el modo es "solo crear nuevos"');
      continue;
    }
    if (!existing && options.mode === 'update') {
      result.action = 'skip';
      warnings.push('No existe en el sistema y el modo es "solo actualizar"');
      continue;
    }

    // El código apunta a un producto pero el nombre coincide con OTRO: algo está mal en la fila.
    if (existing && matchedBy !== 'name' && r.name) {
      const sameName = byName.get(normalizeText(r.name));
      if (sameName && sameName.id !== existing.id) {
        errors.push(`El ${matchedBy === 'sku' ? 'SKU' : 'código de barras'} corresponde a "${existing.name}" pero el nombre coincide con "${sameName.name}"`);
        continue;
      }
    }

    // Un SKU que ya usa OTRO producto (p. ej. match por nombre con SKU distinto)
    if (r.sku) {
      const owner = bySku.get(r.sku.toLowerCase());
      if (owner && owner.id !== existing?.id) {
        errors.push(`El SKU "${r.sku}" ya pertenece a "${owner.name}"`);
        continue;
      }
    }

    if (errors.length) continue;

    const categoryKey = r.category !== null ? resolveCategory(r.category, warnings) : undefined;
    const supplierKey = r.supplier !== null ? resolveSupplier(r.supplier, warnings) : undefined;

    if (!existing) {
      if (!r.name || r.name.length < 2) {
        errors.push('Falta el nombre del producto');
        continue;
      }
      const salePrice = r.salePrice !== null ? Math.round(r.salePrice) : 0;
      if (r.salePrice === null) warnings.push('Sin precio de venta: se publica como "Consultá el precio"');
      if (r.costPrice !== null && r.salePrice !== null && r.costPrice > r.salePrice) warnings.push('El costo es mayor que el precio de venta');
      plan.data = {
        name: r.name,
        sku: r.sku,
        barcode: r.barcode,
        description: r.description,
        categoryKey: categoryKey ?? null,
        supplierKey: supplierKey ?? null,
        unit: r.unit ?? 'unidad',
        costPrice: r.costPrice !== null ? Math.round(r.costPrice) : 0,
        salePrice,
        minStock: r.minStock ?? 0,
        isPublished: r.isPublished ?? options.publishNew,
        showPrice: r.salePrice !== null,
      };
      const initial = options.stockMode !== 'ignore' && r.stock !== null ? round3(r.stock) : 0;
      if (initial > 0) plan.stock = { type: 'INITIAL', quantity: initial, resulting: initial };
      result.action = 'create';
      continue;
    }

    // Actualización: sólo se tocan las columnas que vienen en el Excel y cambian.
    result.productId = existing.id;
    result.name = existing.name;
    const ch = result.changes;
    const next = {
      name: existing.name,
      sku: existing.sku,
      barcode: existing.barcode,
      description: existing.description,
      categoryKey: existing.categoryId,
      supplierKey: existing.supplierId,
      unit: existing.unit as Unit,
      costPrice: existing.costPrice,
      salePrice: existing.salePrice,
      minStock: Number(existing.minStock),
      isPublished: existing.isPublished,
      showPrice: existing.showPrice,
    };
    if (r.name && r.name !== existing.name && matchedBy !== 'name') {
      ch.push({ field: 'Nombre', from: existing.name, to: r.name });
      next.name = r.name;
    }
    if (r.sku && r.sku !== existing.sku) {
      ch.push({ field: 'SKU', from: existing.sku, to: r.sku });
      next.sku = r.sku;
    }
    if (r.barcode && r.barcode !== existing.barcode) {
      ch.push({ field: 'Código de barras', from: existing.barcode, to: r.barcode });
      next.barcode = r.barcode;
    }
    if (r.description && r.description !== existing.description) {
      ch.push({ field: 'Descripción', from: existing.description ? '…' : null, to: '…' });
      next.description = r.description;
    }
    if (categoryKey !== undefined && categoryKey !== null && categoryKey !== existing.categoryId) {
      const fromName = state.categories.find((c) => c.id === existing!.categoryId)?.name ?? null;
      const toName = categoryKey.startsWith('new:') ? newCategories.get(categoryKey.slice(4))! : state.categories.find((c) => c.id === categoryKey)!.name;
      ch.push({ field: 'Categoría', from: fromName, to: toName });
      next.categoryKey = categoryKey;
    }
    if (supplierKey !== undefined && supplierKey !== null && supplierKey !== existing.supplierId) {
      const fromName = state.suppliers.find((s) => s.id === existing!.supplierId)?.name ?? null;
      const toName = supplierKey.startsWith('new:') ? newSuppliers.get(supplierKey.slice(4))! : state.suppliers.find((s) => s.id === supplierKey)!.name;
      ch.push({ field: 'Proveedor', from: fromName, to: toName });
      next.supplierKey = supplierKey;
    }
    if (r.unit && r.unit !== existing.unit) {
      ch.push({ field: 'Unidad', from: existing.unit, to: r.unit });
      next.unit = r.unit;
    }
    if (r.costPrice !== null && Math.round(r.costPrice) !== existing.costPrice) {
      const to = Math.round(r.costPrice);
      ch.push({ field: 'Costo', from: existing.costPrice, to });
      plan.priceChanges.push({ field: 'cost', from: existing.costPrice, to });
      next.costPrice = to;
    }
    if (r.salePrice !== null && Math.round(r.salePrice) !== existing.salePrice) {
      const to = Math.round(r.salePrice);
      ch.push({ field: 'Precio de venta', from: existing.salePrice, to });
      plan.priceChanges.push({ field: 'sale', from: existing.salePrice, to });
      next.salePrice = to;
      next.showPrice = true;
      const pct = existing.salePrice > 0 ? Math.abs(to - existing.salePrice) / existing.salePrice : 0;
      if (pct > 0.5) warnings.push(`El precio cambia ${Math.round(pct * 100)}%: revisá que la columna sea la correcta`);
    }
    if (r.minStock !== null && round3(r.minStock) !== Number(existing.minStock)) {
      ch.push({ field: 'Stock mínimo', from: Number(existing.minStock), to: round3(r.minStock) });
      next.minStock = round3(r.minStock);
    }
    if (r.isPublished !== null && r.isPublished !== existing.isPublished) {
      ch.push({ field: 'Visible en web', from: existing.isPublished ? 'Sí' : 'No', to: r.isPublished ? 'Sí' : 'No' });
      next.isPublished = r.isPublished;
    }

    const current = Number(existing.stock);
    if (r.stock !== null && options.stockMode === 'set' && round3(r.stock) !== current) {
      const target = round3(r.stock);
      ch.push({ field: 'Stock (conteo)', from: formatQty(current), to: formatQty(target) });
      plan.stock = { type: 'ADJUST', quantity: target, resulting: target };
    } else if (r.stock !== null && options.stockMode === 'add' && r.stock > 0) {
      const resulting = round3(current + r.stock);
      ch.push({ field: 'Stock (entrada)', from: formatQty(current), to: formatQty(resulting) });
      plan.stock = { type: 'IN', quantity: round3(r.stock), resulting };
    }

    plan.existing = existing;
    plan.data = next;
    result.action = ch.length ? 'update' : 'unchanged';
  }

  const summary = { create: 0, update: 0, unchanged: 0, skip: 0, error: 0, stockMovements: 0, priceChanges: 0 };
  for (const p of plans) {
    if (p.result.errors.length) p.result.action = 'error';
    summary[p.result.action]++;
    if (p.result.action === 'create' || p.result.action === 'update') {
      if (p.stock) summary.stockMovements++;
      summary.priceChanges += p.priceChanges.length;
    }
  }

  const preview: ImportPreviewDTO = {
    summary,
    newCategories: [...newCategories.values()],
    newSuppliers: [...newSuppliers.values()],
    fuzzyMatches,
    rows: plans.map((p) => p.result),
  };
  return { plans, preview, newCategories, newSuppliers };
}

export async function previewImport(req: ImportRequest) {
  return buildPlan(await loadState(db), req).preview;
}

/**
 * Aplica la importación en UNA transacción. Bloquea la tabla de productos
 * mientras dura (nadie puede vender ni editar a la mitad de una importación),
 * recalcula el plan sobre el estado real y escribe por lotes.
 */
export async function applyImport(req: ImportRequest, userId: string) {
  const out = await db.transaction(async (tx) => {
    await tx.execute(sql`lock table products in share row exclusive mode`);
    const state = await loadState(tx);
    const { plans, preview, newCategories, newSuppliers } = buildPlan(state, req);
    const note = `Importación: ${req.fileName}`.slice(0, 300);

    const [batch] = await tx
      .insert(schema.importBatches)
      .values({ userId, fileName: req.fileName, sheets: req.sheets.join(', '), options: req.options, stats: preview.summary })
      .returning({ id: schema.importBatches.id });

    // 1. Categorías y proveedores nuevos
    const catIds = new Map<string, string>();
    if (newCategories.size) {
      const maxOrder = await tx.select({ m: sql<number>`coalesce(max(${schema.categories.sortOrder}), 0)` }).from(schema.categories);
      const usedSlugs = new Set((await tx.select({ s: schema.categories.slug }).from(schema.categories)).map((r) => r.s));
      const values = [...newCategories.entries()].map(([key, name], i) => {
        let slug = slugify(name) || 'categoria';
        for (let n = 2; usedSlugs.has(slug); n++) slug = `${slugify(name)}-${n}`;
        usedSlugs.add(slug);
        return { key, row: { name, slug, sortOrder: Number(maxOrder[0]?.m ?? 0) + i + 1, color: '#5E7B4F', icon: 'package' } };
      });
      const inserted = await tx.insert(schema.categories).values(values.map((v) => v.row)).returning({ id: schema.categories.id, slug: schema.categories.slug });
      values.forEach((v, i) => catIds.set(`new:${v.key}`, inserted[i]!.id));
    }
    const supIds = new Map<string, string>();
    if (newSuppliers.size) {
      const entries = [...newSuppliers.entries()];
      const inserted = await tx.insert(schema.suppliers).values(entries.map(([, name]) => ({ name }))).returning({ id: schema.suppliers.id });
      entries.forEach(([key], i) => supIds.set(`new:${key}`, inserted[i]!.id));
    }
    const catId = (k: string | null) => (k === null ? null : k.startsWith('new:') ? (catIds.get(k) ?? null) : k);
    const supId = (k: string | null) => (k === null ? null : k.startsWith('new:') ? (supIds.get(k) ?? null) : k);
    const catNames = new Map([...state.categories.map((c) => [c.id, c.name] as const)]);
    for (const [k, name] of newCategories) catNames.set(catIds.get(`new:${k}`)!, name);

    const movements: (typeof schema.stockMovements.$inferInsert)[] = [];
    const priceRows: (typeof schema.priceChanges.$inferInsert)[] = [];

    // 2. Productos nuevos, por lotes
    const creates = plans.filter((p) => p.result.action === 'create' && p.data);
    for (let i = 0; i < creates.length; i += CHUNK) {
      const chunk = creates.slice(i, i + CHUNK);
      const values = chunk.map((p) => {
        const d = p.data!;
        const base = slugify(d.name) || 'producto';
        let slug = base;
        for (let n = 2; state.slugs.has(slug); n++) slug = `${base}-${n}`;
        state.slugs.add(slug);
        const category = catId(d.categoryKey);
        return {
          name: d.name,
          slug,
          sku: d.sku,
          barcode: d.barcode,
          description: d.description,
          searchText: buildSearchText([d.name, d.description, category ? catNames.get(category) : null]),
          categoryId: category,
          supplierId: supId(d.supplierKey),
          unit: d.unit,
          costPrice: d.costPrice,
          salePrice: d.salePrice,
          stock: p.stock?.resulting ?? 0,
          minStock: d.minStock,
          isPublished: d.isPublished,
          showPrice: d.showPrice,
        };
      });
      const inserted = await tx.insert(schema.products).values(values).returning({ id: schema.products.id, name: schema.products.name });
      chunk.forEach((p, j) => {
        p.result.productId = inserted[j]!.id;
        if (p.stock) {
          movements.push({
            productId: inserted[j]!.id,
            productName: inserted[j]!.name,
            type: 'INITIAL',
            quantity: p.stock.quantity,
            delta: p.stock.quantity,
            previousStock: 0,
            resultingStock: p.stock.resulting,
            note,
            userId,
            importBatchId: batch!.id,
          });
        }
      });
    }

    // 3. Productos existentes con cambios
    for (const p of plans.filter((x) => x.result.action === 'update' && x.existing && x.data)) {
      const d = p.data!;
      const e = p.existing!;
      const category = catId(d.categoryKey);
      await tx
        .update(schema.products)
        .set({
          name: d.name,
          sku: d.sku,
          barcode: d.barcode,
          description: d.description,
          categoryId: category,
          supplierId: supId(d.supplierKey),
          unit: d.unit,
          costPrice: d.costPrice,
          salePrice: d.salePrice,
          minStock: d.minStock,
          isPublished: d.isPublished,
          showPrice: d.showPrice,
          searchText: buildSearchText([d.name, d.description, category ? catNames.get(category) : null]),
          ...(p.stock ? { stock: p.stock.resulting } : {}),
          updatedAt: new Date(),
        })
        .where(sql`${schema.products.id} = ${e.id}`);
      if (p.stock) {
        const prev = Number(e.stock);
        movements.push({
          productId: e.id,
          productName: d.name,
          type: p.stock.type,
          quantity: p.stock.quantity,
          delta: round3(p.stock.resulting - prev),
          previousStock: prev,
          resultingStock: p.stock.resulting,
          note,
          userId,
          importBatchId: batch!.id,
        });
      }
      for (const pc of p.priceChanges) {
        priceRows.push({ productId: e.id, field: pc.field, previousValue: pc.from, newValue: pc.to, reason: note, userId });
      }
    }

    // 4. Movimientos e historial de precios, por lotes
    for (let i = 0; i < movements.length; i += CHUNK) await tx.insert(schema.stockMovements).values(movements.slice(i, i + CHUNK));
    for (let i = 0; i < priceRows.length; i += CHUNK) await tx.insert(schema.priceChanges).values(priceRows.slice(i, i + CHUNK));

    const s = preview.summary;
    await audit(
      {
        userId,
        action: 'import.apply',
        entity: 'import',
        entityId: batch!.id,
        summary: `Importó "${req.fileName}": ${s.create} nuevos, ${s.update} actualizados, ${s.error} con error`,
        meta: { ...s, newCategories: preview.newCategories, newSuppliers: preview.newSuppliers },
      },
      tx,
    );
    return { batchId: batch!.id, preview };
  });
  revalidateCatalog();
  return out;
}

export async function listImportBatches() {
  return db
    .select({
      id: schema.importBatches.id,
      fileName: schema.importBatches.fileName,
      sheets: schema.importBatches.sheets,
      stats: schema.importBatches.stats,
      createdAt: schema.importBatches.createdAt,
      userName: schema.users.name,
    })
    .from(schema.importBatches)
    .leftJoin(schema.users, sql`${schema.users.id} = ${schema.importBatches.userId}`)
    .orderBy(sql`${schema.importBatches.createdAt} desc`)
    .limit(20);
}


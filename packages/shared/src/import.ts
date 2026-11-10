/**
 * Motor de importación de planillas: detección de encabezados, mapeo
 * automático de columnas y normalización de valores. Corre igual en el
 * navegador (vista previa instantánea) y en la API (validación final).
 */
import { z } from 'zod';
import { UNITS, type Unit } from './schemas';

export const normalizeText = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();

/* ----------------------------------------------------------- Campos */

export type ImportFieldKey =
  | 'name'
  | 'sku'
  | 'barcode'
  | 'category'
  | 'supplier'
  | 'unit'
  | 'costPrice'
  | 'salePrice'
  | 'stock'
  | 'minStock'
  | 'description'
  | 'isPublished';

export type ImportFieldType = 'text' | 'money' | 'qty' | 'unit' | 'bool' | 'code';

export interface ImportField {
  key: ImportFieldKey;
  label: string;
  type: ImportFieldType;
  /** Encabezados típicos (ya normalizados: minúsculas, sin tildes). */
  synonyms: string[];
}

export const IMPORT_FIELDS: ImportField[] = [
  {
    key: 'name',
    label: 'Nombre del producto',
    type: 'text',
    synonyms: ['producto', 'nombre', 'nombre producto', 'nombre del producto', 'articulo', 'item', 'descripcion', 'descripcion producto', 'detalle', 'glosa', 'mercaderia', 'desc'],
  },
  { key: 'sku', label: 'SKU / código interno', type: 'code', synonyms: ['sku', 'codigo', 'cod', 'codigo interno', 'cod interno', 'codigo producto', 'cod producto', 'referencia', 'ref', 'id producto', 'codigo articulo', 'n articulo'] },
  { key: 'barcode', label: 'Código de barras', type: 'code', synonyms: ['codigo de barras', 'codigo barras', 'cod barra', 'cod barras', 'cod de barra', 'barcode', 'ean', 'ean13', 'upc', 'gtin'] },
  { key: 'category', label: 'Categoría', type: 'text', synonyms: ['categoria', 'rubro', 'familia', 'seccion', 'linea', 'departamento', 'grupo', 'tipo', 'clase', 'subcategoria'] },
  { key: 'supplier', label: 'Proveedor', type: 'text', synonyms: ['proveedor', 'distribuidor', 'prov', 'proveedor habitual', 'mayorista', 'fabricante'] },
  { key: 'unit', label: 'Unidad', type: 'unit', synonyms: ['unidad', 'unidad de medida', 'um', 'u m', 'medida', 'unid', 'formato venta'] },
  {
    key: 'costPrice',
    label: 'Costo',
    type: 'money',
    synonyms: ['costo', 'precio costo', 'p costo', 'costo unitario', 'precio compra', 'valor compra', 'precio de compra', 'costo neto', 'precio neto compra', 'compra'],
  },
  {
    key: 'salePrice',
    label: 'Precio de venta',
    type: 'money',
    synonyms: ['precio', 'precio venta', 'precio de venta', 'p venta', 'pvp', 'valor', 'valor venta', 'precio publico', 'precio unitario', 'venta', 'precio final', 'precio detalle', 'p unitario'],
  },
  { key: 'stock', label: 'Stock actual', type: 'qty', synonyms: ['stock', 'stock actual', 'cantidad', 'cant', 'existencia', 'existencias', 'inventario', 'saldo', 'unidades', 'disponible', 'stock fisico', 'conteo'] },
  { key: 'minStock', label: 'Stock mínimo', type: 'qty', synonyms: ['stock minimo', 'minimo', 'min', 'stock min', 'punto de reposicion', 'stock critico', 'stock de seguridad', 'reponer en'] },
  { key: 'description', label: 'Descripción para la web', type: 'text', synonyms: ['descripcion larga', 'descripcion web', 'observacion', 'observaciones', 'notas', 'comentario', 'caracteristicas'] },
  { key: 'isPublished', label: 'Visible en la web', type: 'bool', synonyms: ['publicado', 'visible', 'web', 'activo', 'mostrar', 'en web', 'publicar'] },
];

export const FIELD_BY_KEY = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, f])) as Record<ImportFieldKey, ImportField>;

/* ------------------------------------------------- Similitud de textos */

function bigrams(s: string) {
  const t = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Coeficiente de Dice sobre bigramas: tolera errores de tipeo ("Limpiesa" ≈ "Limpieza"). */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigrams(x);
  const by = bigrams(y);
  const pool = new Map<string, number>();
  for (const g of by) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of bx) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (bx.length + by.length);
}

/** Puntaje de un encabezado para un campo (0–1). */
export function headerScore(header: string, field: ImportField): number {
  const h = normalizeText(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of field.synonyms) {
    if (h === syn) return 1;
    // "precio venta $" o "stock (unidades)" contienen el sinónimo completo
    const words = h.split(' ');
    const synWords = syn.split(' ');
    const containsAll = synWords.every((w) => words.includes(w));
    if (containsAll) best = Math.max(best, 0.82 + 0.1 * (synWords.length / Math.max(words.length, 1)));
    best = Math.max(best, similarity(h, syn) * 0.85);
  }
  return Math.min(best, 0.97);
}

/* ------------------------------------------------- Valores de celdas */

export type CellValue = string | number | boolean | Date | null | undefined;

/** Decide el separador decimal mirando la columna entera (más confiable que celda por celda). */
export function detectDecimalSeparator(values: CellValue[]): ',' | '.' {
  let comma = 0;
  let dot = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.replace(/[^\d.,]/g, '');
    if (!s) continue;
    const lastC = s.lastIndexOf(',');
    const lastD = s.lastIndexOf('.');
    if (lastC >= 0 && lastD >= 0) {
      if (lastC > lastD) comma++;
      else dot++;
    } else if (lastC >= 0) {
      // "14,5" o "1,25" → decimal; "1,590" (3 dígitos) es ambiguo
      if (s.length - lastC - 1 !== 3) comma += 2;
      else dot += 0.5;
    } else if (lastD >= 0) {
      if (s.length - lastD - 1 !== 3) dot += 2;
      else comma += 0.5; // "1.590" en Chile = mil quinientos noventa
    }
  }
  return dot > comma ? '.' : ',';
}

/** "$1.590" → 1590 · "1.590,50" → 1590.5 · "14,5 kg" → 14.5 · número de Excel → igual. */
export function parseNumber(v: CellValue, decimal: ',' | '.' = ','): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v instanceof Date) return null;
  let s = String(v).trim();
  if (!s || /^[-–—]$/.test(s)) return null;
  const negative = /^-|^\(.*\)$/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const thousands = decimal === ',' ? '.' : ',';
  s = s.split(thousands).join('');
  if (decimal === ',') s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const UNIT_ALIASES: Record<string, Unit> = {
  un: 'unidad', u: 'unidad', und: 'unidad', unid: 'unidad', unidad: 'unidad', unidades: 'unidad', 'c u': 'unidad', pza: 'unidad', pieza: 'unidad', ud: 'unidad',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  l: 'litro', lt: 'litro', lts: 'litro', litro: 'litro', litros: 'litro',
  ml: 'ml', cc: 'ml', mililitro: 'ml', mililitros: 'ml',
  paq: 'paquete', paquete: 'paquete', paquetes: 'paquete', pack: 'paquete', bolsa: 'paquete',
  caja: 'caja', cajas: 'caja', cj: 'caja', cja: 'caja', display: 'caja',
  doc: 'docena', docena: 'docena', docenas: 'docena',
  m: 'metro', mt: 'metro', mts: 'metro', metro: 'metro', metros: 'metro',
};

export function parseUnit(v: CellValue): Unit | null {
  const s = normalizeText(v);
  if (!s) return null;
  if ((UNITS as readonly string[]).includes(s)) return s as Unit;
  return UNIT_ALIASES[s] ?? null;
}

export function parseBool(v: CellValue): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = normalizeText(v);
  if (!s) return null;
  if (['si', 's', 'yes', 'y', 'x', '1', 'true', 'verdadero', 'activo', 'visible', 'publicado'].includes(s)) return true;
  if (['no', 'n', '0', 'false', 'falso', 'inactivo', 'oculto'].includes(s)) return false;
  return null;
}

/** Códigos: Excel los convierte en número (7801234567890 → 7.80123E+12). Se recuperan como texto. */
export function parseCode(v: CellValue): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isInteger(v) ? BigInt(Math.round(v)).toString() : String(v);
  const s = String(v).trim();
  return s ? s.slice(0, 40) : null;
}

export function parseText(v: CellValue, max = 200): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/* ------------------------------------------- Detección de estructura */

const isEmpty = (v: CellValue) => v === null || v === undefined || (typeof v === 'string' && !v.trim());

/** Busca la fila de encabezados en las primeras 25 filas (puede haber títulos o logos arriba). */
export function detectHeaderRow(rows: CellValue[][]): number {
  let best = 0;
  let bestScore = -1;
  const limit = Math.min(rows.length, 25);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? [];
    const texts = row.filter((c) => typeof c === 'string' && c.trim() && !/^[\d.,$\s]+$/.test(c));
    if (texts.length < 2) continue;
    let score = 0;
    const used = new Set<ImportFieldKey>();
    for (const cell of texts) {
      let top = 0;
      let topKey: ImportFieldKey | null = null;
      for (const f of IMPORT_FIELDS) {
        const s = headerScore(String(cell), f);
        if (s > top) {
          top = s;
          topKey = f.key;
        }
      }
      if (topKey && top >= 0.7 && !used.has(topKey)) {
        used.add(topKey);
        score += top;
      }
    }
    // Leve preferencia por filas con más columnas de texto
    score += texts.length * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

export type ColumnMapping = Partial<Record<ImportFieldKey, number>>;

export interface MappingSuggestion {
  mapping: ColumnMapping;
  confidence: Partial<Record<ImportFieldKey, number>>;
}

/** Qué tan bien encaja el CONTENIDO de una columna con el tipo del campo (0–1). */
function contentFit(values: CellValue[], type: ImportFieldType): number {
  const sample = values.filter((v) => !isEmpty(v)).slice(0, 60);
  if (!sample.length) return 0.3;
  const share = (pred: (v: CellValue) => boolean) => sample.filter(pred).length / sample.length;
  switch (type) {
    case 'money':
    case 'qty':
      return share((v) => parseNumber(v) !== null);
    case 'unit':
      return share((v) => parseUnit(v) !== null);
    case 'bool':
      return share((v) => parseBool(v) !== null);
    case 'code':
      return share((v) => typeof v === 'number' || /^[\w.-]{2,}$/.test(String(v).trim()));
    case 'text':
      return share((v) => typeof v === 'string' && /[a-zA-ZáéíóúñÑ]/.test(v));
  }
}

/**
 * Asigna columnas a campos: combina el parecido del encabezado con el tipo de
 * contenido, y resuelve conflictos asignando primero los pares más seguros.
 */
export function suggestMapping(headers: CellValue[], dataRows: CellValue[][]): MappingSuggestion {
  const candidates: { field: ImportField; col: number; score: number }[] = [];
  headers.forEach((h, col) => {
    if (isEmpty(h)) return;
    const values = dataRows.map((r) => r[col]);
    for (const field of IMPORT_FIELDS) {
      const hs = headerScore(String(h), field);
      if (hs < 0.55) continue;
      const fit = contentFit(values, field.type);
      candidates.push({ field, col, score: hs * 0.75 + fit * 0.25 });
    }
  });
  candidates.sort((a, b) => b.score - a.score);

  const mapping: ColumnMapping = {};
  const confidence: Partial<Record<ImportFieldKey, number>> = {};
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (mapping[c.field.key] !== undefined || usedCols.has(c.col)) continue;
    if (c.score < 0.6) continue;
    mapping[c.field.key] = c.col;
    confidence[c.field.key] = Math.round(c.score * 100) / 100;
    usedCols.add(c.col);
  }

  // Sin columna de nombre: la columna de texto más "descriptiva" que quede libre.
  if (mapping.name === undefined) {
    let bestCol = -1;
    let bestLen = 0;
    headers.forEach((_, col) => {
      if (usedCols.has(col)) return;
      const vals = dataRows.map((r) => r[col]).filter((v) => typeof v === 'string' && /[a-zA-Z]/.test(v)) as string[];
      if (vals.length < dataRows.length * 0.6) return;
      const avg = vals.reduce((a, v) => a + v.length, 0) / Math.max(vals.length, 1);
      if (avg > bestLen) {
        bestLen = avg;
        bestCol = col;
      }
    });
    if (bestCol >= 0) {
      mapping.name = bestCol;
      confidence.name = 0.5;
    }
  }
  return { mapping, confidence };
}

/** Firma de los encabezados: permite recordar el mapeo de una planilla conocida. */
export function headerSignature(headers: CellValue[]): string {
  return headers.map((h) => normalizeText(h)).filter(Boolean).join('|');
}

/* --------------------------------------------- Fila normalizada (red) */

export const importRowSchema = z.object({
  row: z.number().int().min(1),
  sheet: z.string().max(80).optional(),
  name: z.string().trim().max(120).nullable(),
  sku: z.string().trim().max(40).nullable(),
  barcode: z.string().trim().max(40).nullable(),
  category: z.string().trim().max(60).nullable(),
  supplier: z.string().trim().max(80).nullable(),
  unit: z.enum(UNITS).nullable(),
  costPrice: z.number().min(0).max(100_000_000).nullable(),
  salePrice: z.number().min(0).max(100_000_000).nullable(),
  stock: z.number().min(0).max(1_000_000).nullable(),
  minStock: z.number().min(0).max(1_000_000).nullable(),
  description: z.string().trim().max(1000).nullable(),
  isPublished: z.boolean().nullable(),
  /** Problemas detectados al leer la celda (ej. "precio ilegible"). */
  parseIssues: z.array(z.string().max(200)).max(20).default([]),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importOptionsSchema = z.object({
  /** upsert = crear nuevos y actualizar existentes. */
  mode: z.enum(['upsert', 'create', 'update']).default('upsert'),
  /** set = el Excel es un conteo (ajusta al valor) · add = suma como entrada · ignore = no toca stock. */
  stockMode: z.enum(['set', 'add', 'ignore']).default('set'),
  createCategories: z.boolean().default(true),
  createSuppliers: z.boolean().default(true),
  publishNew: z.boolean().default(true),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const importRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  sheets: z.array(z.string().max(80)).max(30).default([]),
  options: importOptionsSchema,
  rows: z.array(importRowSchema).min(1, 'La planilla no tiene filas para importar').max(20000, 'Máximo 20.000 filas por importación'),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

export interface ImportRowResult {
  row: number;
  sheet?: string;
  name: string;
  action: 'create' | 'update' | 'unchanged' | 'skip' | 'error';
  productId?: string;
  matchedBy?: 'sku' | 'barcode' | 'name';
  changes: { field: string; from: string | number | null; to: string | number | null }[];
  errors: string[];
  warnings: string[];
}

export interface ImportPreviewDTO {
  summary: { create: number; update: number; unchanged: number; skip: number; error: number; stockMovements: number; priceChanges: number };
  newCategories: string[];
  newSuppliers: string[];
  fuzzyMatches: { input: string; matched: string; kind: 'categoría' | 'proveedor' }[];
  rows: ImportRowResult[];
}

'use client';

/**
 * Lectura de planillas en el navegador. El archivo nunca se sube entero al
 * servidor: se lee acá, se normaliza y sólo viajan las filas ya limpias.
 */
import {
  detectDecimalSeparator,
  detectHeaderRow,
  FIELD_BY_KEY,
  headerSignature,
  IMPORT_FIELDS,
  normalizeText,
  parseBool,
  parseCode,
  parseNumber,
  parseText,
  parseUnit,
  suggestMapping,
  type CellValue,
  type ColumnMapping,
  type ImportFieldKey,
  type ImportRow,
} from '@rincon/shared';

export const ACCEPTED = '.xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.txt';
const MAX_ROWS = 20000;
const MAX_BYTES = 25 * 1024 * 1024;

export interface ParsedSheet {
  name: string;
  rows: CellValue[][];
  headerRow: number;
  headers: string[];
  data: CellValue[][];
  /** Número de fila real en Excel de cada fila de datos (para reportar errores). */
  rowNumbers: number[];
  mapping: ColumnMapping;
  confidence: Partial<Record<ImportFieldKey, number>>;
  rememberedMapping: boolean;
  signature: string;
}

export interface ParsedWorkbook {
  fileName: string;
  sheets: ParsedSheet[];
  encoding?: string;
}

const lazyXlsx = () => import('@e965/xlsx');

/** Los CSV de Excel en Windows suelen venir en Windows-1252: se detecta para no romper las tildes. */
function decodeText(buf: ArrayBuffer): { text: string; encoding: string } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'Windows-1252 (Latin-1)' };
  }
}

const memoryKey = (sig: string) => `rb:import-map:${sig}`;

function rememberedMapping(headers: string[], sig: string): ColumnMapping | null {
  try {
    const raw = localStorage.getItem(memoryKey(sig));
    if (!raw) return null;
    const byHeader = JSON.parse(raw) as Partial<Record<ImportFieldKey, string>>;
    const mapping: ColumnMapping = {};
    for (const [key, header] of Object.entries(byHeader)) {
      const idx = headers.findIndex((h) => normalizeText(h) === normalizeText(header));
      if (idx >= 0) mapping[key as ImportFieldKey] = idx;
    }
    return Object.keys(mapping).length ? mapping : null;
  } catch {
    return null;
  }
}

export function saveMapping(sheet: ParsedSheet) {
  try {
    const byHeader: Partial<Record<ImportFieldKey, string>> = {};
    for (const [key, idx] of Object.entries(sheet.mapping)) if (idx !== undefined) byHeader[key as ImportFieldKey] = sheet.headers[idx];
    localStorage.setItem(memoryKey(sheet.signature), JSON.stringify(byHeader));
  } catch {
    /* almacenamiento no disponible: no pasa nada */
  }
}

const isBlankRow = (r: CellValue[]) => r.every((c) => c === null || c === undefined || (typeof c === 'string' && !c.trim()));

export function analyzeSheet(name: string, rows: CellValue[][], firstRow = 0): ParsedSheet {
  const headerRow = detectHeaderRow(rows);
  const width = Math.max(0, ...rows.slice(headerRow, headerRow + 50).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => {
    const h = rows[headerRow]?.[i];
    return h === null || h === undefined || h === '' ? `Columna ${String.fromCharCode(65 + (i % 26))}` : String(h).trim();
  });
  const data: CellValue[][] = [];
  const rowNumbers: number[] = [];
  rows.slice(headerRow + 1).forEach((r, i) => {
    if (isBlankRow(r)) return;
    data.push(r);
    rowNumbers.push(firstRow + headerRow + i + 2);
  });
  const signature = headerSignature(headers);
  const remembered = rememberedMapping(headers, signature);
  const suggestion = suggestMapping(headers, data.slice(0, 200));
  return {
    name,
    rows,
    headerRow,
    headers,
    data,
    rowNumbers,
    mapping: remembered ?? suggestion.mapping,
    confidence: remembered ? {} : suggestion.confidence,
    rememberedMapping: !!remembered,
    signature,
  };
}

export async function readWorkbook(file: File): Promise<ParsedWorkbook> {
  if (file.size > MAX_BYTES) throw new Error('El archivo supera los 25 MB. Dividilo en partes o guardalo como .xlsx.');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ACCEPTED.split(',').includes(`.${ext}`)) throw new Error('Formato no soportado. Usá Excel (.xlsx, .xls), LibreOffice (.ods) o CSV.');
  const XLSX = await lazyXlsx();
  const buf = await file.arrayBuffer();

  let wb: import('@e965/xlsx').WorkBook;
  let encoding: string | undefined;
  if (['csv', 'tsv', 'txt'].includes(ext)) {
    const decoded = decodeText(buf);
    encoding = decoded.encoding;
    // raw: no convertir "1.590" en 1,59: los números se interpretan después, con la columna entera a la vista.
    wb = XLSX.read(decoded.text, { type: 'string', raw: true, dense: true, FS: ext === 'tsv' ? '\t' : undefined });
  } else {
    wb = XLSX.read(buf, { type: 'array', cellDates: true, dense: true });
  }

  const sheets: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // blankrows: true mantiene la numeración real de Excel (los errores citan la fila que ve el usuario).
    const rows = XLSX.utils.sheet_to_json<CellValue[]>(ws, { header: 1, raw: true, defval: null, blankrows: true }).slice(0, MAX_ROWS + 60);
    if (rows.filter((r) => !isBlankRow(r)).length < 2) continue; // hojas vacías o sólo con título
    // Si la hoja no empieza en A1 (ej. datos desde B3), se corrige la numeración.
    const firstRow = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
    sheets.push(analyzeSheet(name, rows, firstRow));
  }
  if (!sheets.length) throw new Error('No encontramos datos en el archivo. Revisá que tenga una fila de encabezados y al menos un producto.');
  return { fileName: file.name, sheets, encoding };
}

/** Filas de totales o subtotales: el primer texto de la fila dice "Total". */
const looksLikeTotal = (row: CellValue[]) => {
  const first = row.find((c) => typeof c === 'string' && c.trim());
  return typeof first === 'string' && /^(sub ?)?total(es)?\b/.test(normalizeText(first));
};

export function buildRows(sheet: ParsedSheet, opts: { categoryFromSheet: boolean; multiSheet: boolean }): ImportRow[] {
  const m = sheet.mapping;
  const col = (k: ImportFieldKey) => m[k];
  const decimals: Partial<Record<ImportFieldKey, ',' | '.'>> = {};
  for (const f of IMPORT_FIELDS) {
    if ((f.type === 'money' || f.type === 'qty') && col(f.key) !== undefined) {
      decimals[f.key] = detectDecimalSeparator(sheet.data.map((r) => r[col(f.key)!]));
    }
  }

  const out: ImportRow[] = [];
  sheet.data.forEach((r, i) => {
    const issues: string[] = [];
    const get = (k: ImportFieldKey) => (col(k) === undefined ? undefined : r[col(k)!]);
    const num = (k: ImportFieldKey) => {
      const v = get(k);
      if (v === undefined || v === null || v === '') return null;
      const n = parseNumber(v, decimals[k]);
      if (n === null) issues.push(`${FIELD_BY_KEY[k].label}: "${String(v).slice(0, 30)}" no es un número`);
      else if (n < 0) {
        issues.push(`${FIELD_BY_KEY[k].label} negativo (${n})`);
        return null;
      }
      return n;
    };
    if (looksLikeTotal(r)) return;
    const name = parseText(get('name'), 120);

    const unitRaw = get('unit');
    const unit = parseUnit(unitRaw);
    const published = get('isPublished');
    const category = parseText(get('category'), 60) ?? (opts.categoryFromSheet ? sheet.name.trim().slice(0, 60) : null);

    out.push({
      row: sheet.rowNumbers[i]!,
      sheet: opts.multiSheet ? sheet.name : undefined,
      name,
      sku: parseCode(get('sku')),
      barcode: parseCode(get('barcode')),
      category,
      supplier: parseText(get('supplier'), 80),
      unit,
      costPrice: num('costPrice'),
      salePrice: num('salePrice'),
      stock: num('stock'),
      minStock: num('minStock'),
      description: parseText(get('description'), 1000),
      isPublished: published === undefined ? null : parseBool(published),
      // Celdas ilegibles = error de la fila (mejor avisar que importar un precio equivocado).
      // Una unidad desconocida no es grave: se usa "unidad".
      parseIssues: issues,
    });
  });
  return out;
}

/** Plantilla de ejemplo con los encabezados que el importador reconoce. */
export async function downloadTemplate() {
  const XLSX = await lazyXlsx();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Producto', 'SKU', 'Código de barras', 'Categoría', 'Proveedor', 'Unidad', 'Costo', 'Precio venta', 'Stock', 'Stock mínimo', 'Descripción web', 'Publicado'],
    ['Ejemplo: Detergente líquido 3 L', 'LIM-001', '7800000000000', 'Limpieza', 'Nombre del proveedor', 'un', 4200, 5990, 12, 4, 'Opcional', 'Sí'],
  ]);
  ws['!cols'] = [36, 12, 16, 16, 22, 8, 10, 12, 8, 12, 30, 10].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, 'plantilla-productos-rincon.xlsx');
}

/** Descarga las filas con problemas para corregirlas en Excel. */
export async function downloadIssues(rows: { row: number; sheet?: string; name: string; errors: string[]; warnings: string[] }[]) {
  const XLSX = await lazyXlsx();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Hoja', 'Fila', 'Producto', 'Errores', 'Advertencias'],
    ...rows.map((r) => [r.sheet ?? '', r.row, r.name, r.errors.join(' · '), r.warnings.join(' · ')]),
  ]);
  ws['!cols'] = [14, 6, 36, 60, 60].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Revisar');
  XLSX.writeFile(wb, 'filas-a-revisar.xlsx');
}

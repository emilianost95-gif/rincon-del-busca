'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  formatMoney,
  IMPORT_FIELDS,
  type ImportFieldKey,
  type ImportOptions,
  type ImportPreviewDTO,
  type ImportRow,
  type ImportRowResult,
} from '@rincon/shared';
import { api, ApiError, fmtRelative, useResource } from '@/lib/client';
import { ACCEPTED, buildRows, downloadIssues, downloadTemplate, readWorkbook, saveMapping, type ParsedWorkbook } from '@/lib/spreadsheet';
import { Badge, Button, EmptyState, Field, PageHeader, Panel, Select, Table, Td, Th, Toggle, useFeedback } from '@/components/admin/ui';
import { useSession } from '@/components/admin/session';

type Step = 'upload' | 'map' | 'preview' | 'done';

const DEFAULT_OPTIONS: ImportOptions = { mode: 'upsert', stockMode: 'set', createCategories: true, createSuppliers: true, publishNew: true };

const ACTION_LABEL: Record<ImportRowResult['action'], { label: string; tone: 'green' | 'blue' | 'neutral' | 'amber' | 'red' }> = {
  create: { label: 'Nuevo', tone: 'green' },
  update: { label: 'Actualiza', tone: 'blue' },
  unchanged: { label: 'Sin cambios', tone: 'neutral' },
  skip: { label: 'Omitida', tone: 'amber' },
  error: { label: 'Error', tone: 'red' },
};

type Batch = { id: string; fileName: string; sheets: string; stats: ImportPreviewDTO['summary']; createdAt: string; userName: string | null };

function StepDots({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Archivo' },
    { key: 'map', label: 'Columnas' },
    { key: 'preview', label: 'Revisión' },
    { key: 'done', label: 'Listo' },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <ol className="mb-5 flex items-center gap-2 text-[13px]" aria-label="Pasos">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2" aria-current={i === idx ? 'step' : undefined}>
          <span className={`grid size-6 place-items-center rounded-full text-[12px] font-semibold ${i < idx ? 'bg-gondola text-white' : i === idx ? 'bg-cartel text-tinta' : 'bg-[#e6e7e0] text-gris'}`}>{i + 1}</span>
          <span className={i === idx ? 'font-semibold' : 'text-gris'}>{s.label}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-linea" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export default function ImportPage() {
  const { toast, confirm } = useFeedback();
  const { currency, can } = useSession();
  const [step, setStep] = useState<Step>('upload');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const [wb, setWb] = useState<ParsedWorkbook | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [categoryFromSheet, setCategoryFromSheet] = useState(false);
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [rowsSent, setRowsSent] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<ImportRowResult['action'] | 'all'>('all');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const batches = useResource<Batch[]>('/admin/import/batches');

  const sheets = wb?.sheets.filter((s) => selected.includes(s.name)) ?? [];
  const sheet = sheets[active] ?? sheets[0];
  const multi = sheets.length > 1;

  const handleFile = useCallback(async (file: File) => {
    setReading(true);
    setReadError('');
    try {
      const parsed = await readWorkbook(file);
      setWb(parsed);
      setSelected([parsed.sheets[0]!.name]);
      setActive(0);
      setCategoryFromSheet(false);
      setPreview(null);
      setStep('map');
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'No se pudo leer el archivo');
    } finally {
      setReading(false);
    }
  }, []);

  function setColumn(key: ImportFieldKey, value: string) {
    if (!wb || !sheet) return;
    const idx = value === '' ? undefined : Number(value);
    const next = { ...sheet.mapping };
    // Una columna sólo puede ir a un campo.
    for (const k of Object.keys(next) as ImportFieldKey[]) if (next[k] === idx) delete next[k];
    if (idx === undefined) delete next[key];
    else next[key] = idx;
    setWb({ ...wb, sheets: wb.sheets.map((s) => (s.name === sheet.name ? { ...s, mapping: next, confidence: { ...s.confidence, [key]: undefined } } : s)) });
  }

  const priceMapped = sheets.some((s) => s.mapping.salePrice !== undefined || s.mapping.costPrice !== undefined);
  const missingName = sheets.filter((s) => s.mapping.name === undefined && s.mapping.sku === undefined && s.mapping.barcode === undefined);

  async function runPreview() {
    if (!wb) return;
    if (priceMapped && !can('prices:write')) {
      toast('Tu rol no puede modificar precios: dejá las columnas de precio en "No importar".', 'error');
      return;
    }
    const rows = sheets.flatMap((s) => buildRows(s, { categoryFromSheet, multiSheet: multi }));
    if (!rows.length) {
      toast('No hay filas con datos para importar', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api<ImportPreviewDTO>('/admin/import/preview', {
        method: 'POST',
        json: { fileName: wb.fileName, sheets: sheets.map((s) => s.name), options, rows },
      });
      sheets.forEach(saveMapping);
      setRowsSent(rows);
      setPreview(res);
      setFilter(res.summary.error ? 'error' : 'all');
      setStep('preview');
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!wb || !preview) return;
    const s = preview.summary;
    const ok = await confirm({
      title: 'Aplicar importación',
      message: `Se crean ${s.create} producto(s) y se actualizan ${s.update}${s.stockMovements ? `, con ${s.stockMovements} movimiento(s) de stock` : ''}${preview.newCategories.length ? ` y ${preview.newCategories.length} categoría(s) nueva(s)` : ''}. ${s.error ? `Las ${s.error} fila(s) con error se omiten. ` : ''}Todo queda registrado en el historial.`,
      confirmLabel: 'Importar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api<{ batchId: string; preview: ImportPreviewDTO }>('/admin/import/apply', {
        method: 'POST',
        json: { fileName: wb.fileName, sheets: sheets.map((x) => x.name), options, rows: rowsSent },
      });
      setPreview(res.preview);
      setStep('done');
      batches.reload();
      toast('Importación aplicada');
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setWb(null);
    setPreview(null);
    setStep('upload');
    setReadError('');
  }

  const filteredRows = useMemo(() => (preview ? (filter === 'all' ? preview.rows : preview.rows.filter((r) => r.action === filter)) : []), [preview, filter]);
  const issues = preview?.rows.filter((r) => r.errors.length || r.warnings.length) ?? [];
  const fmtVal = (field: string, v: string | number | null) =>
    v === null ? '—' : typeof v === 'number' && /precio|costo/i.test(field) ? formatMoney(v, currency) : String(v);

  return (
    <>
      <PageHeader
        title="Importar desde Excel"
        description="Cargá o actualizá el catálogo desde la planilla que ya usás. Antes de guardar vas a ver exactamente qué se crea y qué cambia."
        actions={
          <>
            <Button onClick={() => downloadTemplate()}><Download className="size-4" /> Plantilla</Button>
            <a href="/api/admin/reports/export/products.xlsx" className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3.5 text-[14px] font-medium ring-1 ring-linea hover:ring-gondola/40">
              <FileSpreadsheet className="size-4" /> Exportar catálogo actual
            </a>
          </>
        }
      />
      <StepDots step={step} />

      {/* Paso 1 — archivo */}
      {step === 'upload' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Panel>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-16 text-center transition-colors ${dragging ? 'border-gondola bg-[#eef3ef]' : 'border-linea hover:border-gondola/50 hover:bg-[#fafaf7]'}`}
            >
              {reading ? <Loader2 className="size-9 animate-spin text-gondola" /> : <Upload className="size-9 text-gondola" />}
              <p className="mt-4 text-[17px] font-semibold">{reading ? 'Leyendo la planilla…' : 'Arrastrá tu planilla o hacé clic para elegirla'}</p>
              <p className="mt-1.5 text-[13.5px] text-gris">Excel (.xlsx, .xls, .xlsm), LibreOffice (.ods) o CSV · hasta 20.000 filas</p>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            {readError && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-[#fbe4e2] px-3 py-2.5 text-[14px] text-[#7d1d17]">
                <XCircle className="mt-0.5 size-4 shrink-0" /> {readError}
              </p>
            )}
          </Panel>
          <Panel title="Qué hace el importador">
            <ul className="space-y-2.5 text-[13.5px] text-tinta/85">
              {[
                'Encuentra la fila de encabezados aunque haya títulos arriba.',
                'Reconoce columnas como “Descripción”, “P. Venta”, “Existencia” o “Rubro”.',
                'Entiende precios como $1.590 o 1.590,50 y cantidades con decimales.',
                'Busca cada producto por SKU, código de barras o nombre para no duplicarlo.',
                'Asocia categorías mal escritas (“Limpiesa” → Limpieza).',
                'Recuerda cómo mapeaste las columnas para la próxima vez.',
              ].map((t) => (
                <li key={t} className="flex gap-2"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#c08a17]" />{t}</li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {/* Paso 2 — hojas, columnas y opciones */}
      {step === 'map' && wb && sheet && (
        <div className="space-y-4">
          <Panel
            title={wb.fileName}
            actions={<Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="size-3.5" /> Otro archivo</Button>}
          >
            {wb.encoding && <p className="mb-3 text-[12.5px] text-gris">Texto leído como {wb.encoding}.</p>}
            {wb.sheets.length > 1 && (
              <fieldset className="mb-4">
                <legend className="mb-2 text-[13px] font-medium text-tinta/80">Hojas a importar</legend>
                <div className="flex flex-wrap gap-2">
                  {wb.sheets.map((s) => {
                    const on = selected.includes(s.name);
                    return (
                      <label key={s.name} className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-[13.5px] ring-1 ${on ? 'bg-gondola text-white ring-gondola' : 'bg-white ring-linea'}`}>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() => {
                            const next = on ? selected.filter((n) => n !== s.name) : [...selected, s.name];
                            if (next.length) {
                              setSelected(next);
                              setActive(0);
                            }
                          }}
                        />
                        {s.name} <span className={on ? 'text-white/70' : 'text-gris'}>{s.data.length} filas</span>
                      </label>
                    );
                  })}
                </div>
                {multi && (
                  <div className="mt-3">
                    <Toggle
                      checked={categoryFromSheet}
                      onChange={setCategoryFromSheet}
                      label="Usar el nombre de cada hoja como categoría"
                      description="Para planillas con una hoja por rubro. Si una fila trae su propia categoría, se respeta esa."
                    />
                  </div>
                )}
              </fieldset>
            )}

            {multi && (
              <div className="mb-3 flex flex-wrap gap-1 border-b border-linea" role="tablist">
                {sheets.map((s, i) => (
                  <button key={s.name} role="tab" aria-selected={i === active} onClick={() => setActive(i)} className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] ${i === active ? 'border-gondola font-semibold' : 'border-transparent text-gris'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            <p className="mb-3 text-[13px] text-gris">
              Encabezados detectados en la fila {sheet.headerRow + 1} · {sheet.data.length} filas de datos.
              {sheet.rememberedMapping && <span className="ml-1 font-medium text-gondola">Se usó el mapeo que guardaste la última vez para esta planilla.</span>}
            </p>

            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => {
                const idx = sheet.mapping[f.key];
                const conf = sheet.confidence[f.key];
                const sample = idx !== undefined ? sheet.data.slice(0, 3).map((r) => r[idx]).filter((v) => v !== null && v !== '').map((v) => (v instanceof Date ? v.toLocaleDateString() : String(v))).join(' · ') : '';
                return (
                  <Field key={f.key} label={f.label} hint={sample ? `Ej.: ${sample.slice(0, 60)}` : undefined}>
                    {(id, d) => (
                      <div className="flex items-center gap-2">
                        <Select id={id} aria-describedby={d} value={idx === undefined ? '' : String(idx)} onChange={(e) => setColumn(f.key, e.target.value)}>
                          <option value="">— No importar —</option>
                          {sheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                        </Select>
                        {conf !== undefined && idx !== undefined && (
                          <span title="Coincidencia detectada automáticamente" className={`shrink-0 text-[11.5px] font-medium ${conf >= 0.85 ? 'text-[#1e6a3f]' : 'text-[#9a6a0b]'}`}>
                            {conf >= 0.85 ? 'auto' : 'revisar'}
                          </span>
                        )}
                      </div>
                    )}
                  </Field>
                );
              })}
            </div>

            {missingName.length > 0 && (
              <p className="mt-4 flex items-start gap-2 rounded-md bg-[#fbefd2] px-3 py-2.5 text-[13.5px] text-[#6b4a00]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Elegí al menos la columna del nombre o de un código{multi ? ` en: ${missingName.map((s) => s.name).join(', ')}` : ''}.
              </p>
            )}
          </Panel>

          <Panel title={`Vista de la hoja ${multi ? `“${sheet.name}”` : ''}`} padded={false}>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-[#fafaf7]">
                  <tr>
                    {sheet.headers.map((h, i) => {
                      const field = IMPORT_FIELDS.find((f) => sheet.mapping[f.key] === i);
                      return (
                        <th key={i} className={`border-b border-linea px-3 py-2 text-left font-medium whitespace-nowrap ${field ? 'text-gondola' : 'text-gris/60'}`}>
                          {h}
                          <span className="block text-[11px] font-normal">{field ? `→ ${field.label}` : 'no se importa'}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sheet.data.slice(0, 8).map((r, ri) => (
                    <tr key={ri}>
                      {sheet.headers.map((_, ci) => {
                        const mapped = IMPORT_FIELDS.some((f) => sheet.mapping[f.key] === ci);
                        const v = r[ci];
                        return (
                          <td key={ci} className={`border-b border-linea/60 px-3 py-1.5 whitespace-nowrap ${mapped ? '' : 'text-gris/50'}`}>
                            {v instanceof Date ? v.toLocaleDateString() : v === null || v === undefined ? '' : String(v).slice(0, 40)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Cómo importar">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Qué hacer con los productos">
                {(id) => (
                  <Select id={id} value={options.mode} onChange={(e) => setOptions({ ...options, mode: e.target.value as ImportOptions['mode'] })}>
                    <option value="upsert">Crear los nuevos y actualizar los existentes</option>
                    <option value="create">Sólo crear los nuevos (no tocar los existentes)</option>
                    <option value="update">Sólo actualizar los existentes (no crear)</option>
                  </Select>
                )}
              </Field>
              <Field
                label="La columna de stock es…"
                hint={options.stockMode === 'set' ? 'Se registra un ajuste por conteo con la diferencia.' : options.stockMode === 'add' ? 'Se registra una entrada por la cantidad indicada.' : 'El stock no se modifica.'}
              >
                {(id, d) => (
                  <Select id={id} aria-describedby={d} value={options.stockMode} onChange={(e) => setOptions({ ...options, stockMode: e.target.value as ImportOptions['stockMode'] })}>
                    <option value="set">Un conteo: el stock pasa a ser ese número</option>
                    <option value="add">Mercadería que llegó: se suma al stock</option>
                    <option value="ignore">No tocar el stock</option>
                  </Select>
                )}
              </Field>
              <Toggle checked={options.createCategories} onChange={(v) => setOptions({ ...options, createCategories: v })} label="Crear categorías que no existan" />
              <Toggle checked={options.createSuppliers} onChange={(v) => setOptions({ ...options, createSuppliers: v })} label="Crear proveedores que no existan" />
              <Toggle checked={options.publishNew} onChange={(v) => setOptions({ ...options, publishNew: v })} label="Publicar en la web los productos nuevos" description="Si la planilla trae una columna “Publicado”, manda esa." />
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="primary" onClick={runPreview} loading={busy} disabled={missingName.length > 0}>
                Revisar cambios
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* Paso 3 y 4 — revisión y resultado */}
      {(step === 'preview' || step === 'done') && preview && (
        <div className="space-y-4">
          {step === 'done' && (
            <div className="flex items-start gap-3 rounded-lg bg-[#e3efe6] p-4 text-[#164c2c]" role="status">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Importación aplicada</p>
                <p className="text-[14px]">
                  {preview.summary.create} producto(s) nuevos y {preview.summary.update} actualizados. La web ya muestra los cambios.
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/admin/productos" className="inline-flex h-9 items-center rounded-md bg-gondola px-3 text-[13.5px] font-medium text-white">Ver productos</Link>
                <Button size="md" onClick={reset}>Importar otro</Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(['create', 'update', 'unchanged', 'skip', 'error'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setFilter(filter === a ? 'all' : a)}
                aria-pressed={filter === a}
                className={`rounded-lg bg-white p-3 text-left ring-1 ${filter === a ? 'ring-2 ring-gondola' : 'ring-linea hover:ring-gondola/40'}`}
              >
                <Badge tone={ACTION_LABEL[a].tone}>{ACTION_LABEL[a].label}</Badge>
                <p className="tnum mt-2 text-[24px] leading-none font-bold">{preview.summary[a]}</p>
              </button>
            ))}
          </div>

          {(preview.newCategories.length > 0 || preview.newSuppliers.length > 0 || preview.fuzzyMatches.length > 0 || preview.summary.stockMovements > 0) && (
            <Panel title="Además">
              <ul className="space-y-1.5 text-[14px]">
                {preview.summary.stockMovements > 0 && <li>• {preview.summary.stockMovements} movimiento(s) de stock y {preview.summary.priceChanges} cambio(s) de precio quedan en el historial.</li>}
                {preview.newCategories.length > 0 && <li>• Categorías nuevas: <strong>{preview.newCategories.join(', ')}</strong></li>}
                {preview.newSuppliers.length > 0 && <li>• Proveedores nuevos: <strong>{preview.newSuppliers.join(', ')}</strong></li>}
                {preview.fuzzyMatches.map((f) => (
                  <li key={f.kind + f.input}>• {f.kind === 'categoría' ? 'Categoría' : 'Proveedor'} “{f.input}” se asocia a <strong>{f.matched}</strong> (nombre parecido).</li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title={filter === 'all' ? 'Todas las filas' : ACTION_LABEL[filter].label}
            padded={false}
            actions={
              <div className="flex gap-2">
                {issues.length > 0 && <Button size="sm" onClick={() => downloadIssues(issues)}><Download className="size-3.5" /> Filas a revisar (Excel)</Button>}
                {filter !== 'all' && <Button size="sm" variant="ghost" onClick={() => setFilter('all')}>Ver todas</Button>}
              </div>
            }
          >
            {filteredRows.length ? (
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <Th className="w-16">Fila</Th>
                      <Th>Producto</Th>
                      <Th className="w-28">Acción</Th>
                      <Th>Detalle</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 500).map((r) => (
                      <tr key={`${r.sheet ?? ''}-${r.row}`}>
                        <Td className="text-gris">{r.sheet ? <span className="block text-[11px]">{r.sheet}</span> : null}{r.row}</Td>
                        <Td className="font-medium">
                          {r.name}
                          {r.matchedBy && <span className="block text-[12px] font-normal text-gris">encontrado por {r.matchedBy === 'sku' ? 'SKU' : r.matchedBy === 'barcode' ? 'código de barras' : 'nombre'}</span>}
                        </Td>
                        <Td><Badge tone={ACTION_LABEL[r.action].tone}>{ACTION_LABEL[r.action].label}</Badge></Td>
                        <Td className="text-[13px]">
                          {r.errors.map((e) => <p key={e} className="text-plumon">{e}</p>)}
                          {r.changes.map((c) => (
                            <p key={c.field}>
                              <span className="text-gris">{c.field}:</span> {fmtVal(c.field, c.from)} → <strong>{fmtVal(c.field, c.to)}</strong>
                            </p>
                          ))}
                          {r.warnings.map((w) => <p key={w} className="text-[#9a6a0b]">{w}</p>)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {filteredRows.length > 500 && <p className="px-4 py-3 text-[13px] text-gris">Se muestran 500 de {filteredRows.length}. Descargá las filas a revisar para ver el detalle completo.</p>}
              </div>
            ) : (
              <EmptyState title="Nada en esta categoría" />
            )}
          </Panel>

          {step === 'preview' && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button onClick={() => setStep('map')}>Volver a las columnas</Button>
              <Button variant="primary" onClick={apply} loading={busy} disabled={preview.summary.create + preview.summary.update === 0}>
                {preview.summary.create + preview.summary.update === 0 ? 'No hay cambios para aplicar' : `Importar ${preview.summary.create + preview.summary.update} producto(s)`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Historial */}
      {!!batches.data?.length && (step === 'upload' || step === 'done') && (
        <Panel title="Importaciones anteriores" className="mt-6" padded={false}>
          <ul className="divide-y divide-linea">
            {batches.data.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[14px]">
                <History className="size-4 text-gris" />
                <span className="font-medium">{b.fileName}</span>
                <span className="text-gris">{b.stats.create} nuevos · {b.stats.update} actualizados{b.stats.error ? ` · ${b.stats.error} con error` : ''}</span>
                <span className="ml-auto text-[13px] text-gris">{b.userName ?? 'Sistema'} · {fmtRelative(b.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

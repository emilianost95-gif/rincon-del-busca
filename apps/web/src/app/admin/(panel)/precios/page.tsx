'use client';

import { useState } from 'react';
import { ArrowRight, Calculator } from 'lucide-react';
import { bulkPriceSchema, formatMoney, type CategoryDTO, type SupplierDTO } from '@rincon/shared';
import { api, ApiError, useResource } from '@/lib/client';
import { Badge, Button, EmptyState, Field, Input, PageHeader, Panel, Select, Table, Td, Th, useFeedback } from '@/components/admin/ui';
import { useSession } from '@/components/admin/session';

type Change = { id: string; name: string; current: number; next: number; diff: number };

export default function PricesPage() {
  const { toast, confirm } = useFeedback();
  const { currency } = useSession();
  const cats = useResource<CategoryDTO[]>('/admin/categories');
  const sups = useResource<SupplierDTO[]>('/admin/suppliers');

  const [scope, setScope] = useState<'all' | 'category' | 'supplier'>('category');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [target, setTarget] = useState<'sale' | 'cost'>('sale');
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const [rounding, setRounding] = useState('10');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ count: number; changes: Change[] } | null>(null);
  const [busy, setBusy] = useState(false);

  function body() {
    return bulkPriceSchema.safeParse({
      scope,
      categoryId: scope === 'category' ? categoryId || undefined : undefined,
      supplierId: scope === 'supplier' ? supplierId || undefined : undefined,
      target,
      mode,
      value: value.replace(',', '.'),
      rounding,
    });
  }

  async function runPreview(e?: React.FormEvent) {
    e?.preventDefault();
    const parsed = body();
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    if (Number(parsed.data.value) === 0) return setErrors({ value: 'Ingresá un valor distinto de cero' });
    setErrors({});
    setBusy(true);
    try {
      setPreview(await api('/admin/prices/bulk/preview', { method: 'POST', json: parsed.data }));
    } catch (err) {
      toast((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const parsed = body();
    if (!parsed.success || !preview) return;
    const ok = await confirm({
      title: 'Aplicar cambio de precios',
      message: `Se van a actualizar ${preview.count} precio(s) de ${target === 'sale' ? 'venta' : 'costo'}. Cada cambio queda en el historial del producto y la web se actualiza al instante.`,
      confirmLabel: `Actualizar ${preview.count} precio(s)`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api<{ updated: number }>('/admin/prices/bulk/apply', { method: 'POST', json: parsed.data });
      toast(`${r.updated} precio(s) actualizados`);
      setPreview(null);
      setValue('');
    } catch (err) {
      toast((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Actualización de precios" description="Subí o bajá precios por categoría, proveedor o todo el catálogo. Primero ves la vista previa; nada cambia hasta que confirmás." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Panel title="Regla">
          <form onSubmit={runPreview} className="space-y-4" noValidate onChange={() => setPreview(null)}>
            <Field label="Aplicar a">
              {(id) => (
                <Select id={id} value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                  <option value="category">Una categoría</option>
                  <option value="supplier">Un proveedor</option>
                  <option value="all">Todo el catálogo</option>
                </Select>
              )}
            </Field>
            {scope === 'category' && (
              <Field label="Categoría" error={errors.categoryId}>
                {(id) => (
                  <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} invalid={!!errors.categoryId}>
                    <option value="">Elegí…</option>
                    {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                )}
              </Field>
            )}
            {scope === 'supplier' && (
              <Field label="Proveedor" error={errors.supplierId} hint="Útil cuando un proveedor te avisa un aumento.">
                {(id, d) => (
                  <Select id={id} aria-describedby={d} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} invalid={!!errors.supplierId}>
                    <option value="">Elegí…</option>
                    {sups.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                )}
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio">
                {(id) => (
                  <Select id={id} value={target} onChange={(e) => setTarget(e.target.value as 'sale' | 'cost')}>
                    <option value="sale">De venta</option>
                    <option value="cost">De costo</option>
                  </Select>
                )}
              </Field>
              <Field label="Tipo">
                {(id) => (
                  <Select id={id} value={mode} onChange={(e) => setMode(e.target.value as 'percent' | 'amount')}>
                    <option value="percent">Porcentaje</option>
                    <option value="amount">Monto fijo</option>
                  </Select>
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={mode === 'percent' ? 'Variación (%)' : 'Variación ($)'} error={errors.value} hint="Negativo para bajar">
                {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === 'percent' ? 'Ej.: 8' : 'Ej.: 200'} invalid={!!errors.value} />}
              </Field>
              <Field label="Redondear a">
                {(id) => (
                  <Select id={id} value={rounding} onChange={(e) => setRounding(e.target.value)}>
                    <option value="1">$1</option>
                    <option value="10">$10</option>
                    <option value="50">$50</option>
                    <option value="100">$100</option>
                  </Select>
                )}
              </Field>
            </div>
            <Button type="submit" variant="primary" className="w-full" loading={busy && !preview}>
              <Calculator className="size-4" /> Ver vista previa
            </Button>
          </form>
        </Panel>

        <Panel
          title="Vista previa"
          padded={false}
          actions={preview && preview.count > 0 ? <Button variant="primary" size="sm" onClick={apply} loading={busy}>Aplicar {preview.count} cambio(s)</Button> : null}
        >
          {!preview ? (
            <EmptyState icon={Calculator} title="Definí la regla y mirá el resultado" description="Vas a ver cada producto con su precio actual y el nuevo antes de confirmar." />
          ) : preview.count === 0 ? (
            <EmptyState title="Ningún precio cambia" description="Con esa regla y redondeo los precios quedan iguales, o no hay productos en esa selección." />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Producto</Th>
                    <Th className="text-right">Actual</Th>
                    <Th className="w-0" />
                    <Th className="text-right">Nuevo</Th>
                    <Th className="text-right">Diferencia</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map((c) => (
                    <tr key={c.id}>
                      <Td>{c.name}</Td>
                      <Td className="text-right text-gris">{formatMoney(c.current, currency)}</Td>
                      <Td><ArrowRight className="size-3.5 text-gris" aria-hidden /></Td>
                      <Td className="text-right font-semibold">{formatMoney(c.next, currency)}</Td>
                      <Td className="text-right"><Badge tone={c.diff > 0 ? 'amber' : 'green'}>{c.diff > 0 ? '+' : ''}{formatMoney(c.diff, currency)}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {preview.count > preview.changes.length && <p className="px-4 py-3 text-[13px] text-gris">Se muestran {preview.changes.length} de {preview.count}.</p>}
            </>
          )}
        </Panel>
      </div>
    </>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import {
  formatMoney,
  formatQty,
  MOVEMENT_LABELS,
  productCreateSchema,
  productUpdateSchema,
  UNITS,
  type CategoryDTO,
  type MovementType,
  type ProductDTO,
  type SupplierDTO,
} from '@rincon/shared';
import { api, ApiError, fmtDateTime } from '@/lib/client';
import { Button, Field, Input, Modal, Select, Textarea, Toggle, useFeedback } from './ui';
import { useSession } from './session';

type Detail = ProductDTO & {
  movements: { id: string; type: MovementType; delta: string | number; resultingStock: string | number; createdAt: string; note: string | null }[];
  priceHistory: { id: string; field: 'sale' | 'cost'; previousValue: number; newValue: number; createdAt: string }[];
};

const EMPTY = {
  name: '',
  sku: '',
  barcode: '',
  description: '',
  categoryId: '',
  supplierId: '',
  unit: 'unidad',
  costPrice: '',
  salePrice: '',
  minStock: '0',
  initialStock: '0',
  imageUrl: '',
  isPublished: true,
  isFeatured: false,
  showPrice: true,
};

export function ProductDrawer({
  open,
  productId,
  onClose,
  onSaved,
  categories,
  suppliers,
}: {
  open: boolean;
  productId: string | null;
  onClose: () => void;
  onSaved: () => void;
  categories: CategoryDTO[];
  suppliers: SupplierDTO[];
}) {
  const { toast } = useFeedback();
  const { can, currency } = useSession();
  const [form, setForm] = useState(EMPTY);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = !!productId;
  const readOnly = !can('catalog:write');

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setDetail(null);
    if (!productId) {
      setForm(EMPTY);
      return;
    }
    api<Detail>(`/admin/products/${productId}`)
      .then((p) => {
        setDetail(p);
        setForm({
          name: p.name,
          sku: p.sku ?? '',
          barcode: p.barcode ?? '',
          description: p.description ?? '',
          categoryId: p.categoryId ?? '',
          supplierId: p.supplierId ?? '',
          unit: p.unit,
          costPrice: String(p.costPrice),
          salePrice: String(p.salePrice),
          minStock: String(p.minStock),
          initialStock: '0',
          imageUrl: p.imageUrl ?? '',
          isPublished: p.isPublished,
          isFeatured: p.isFeatured,
          showPrice: p.showPrice,
        });
      })
      .catch((e: ApiError) => toast(e.message, 'error'));
  }, [open, productId, toast]);

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ url: string }>('/admin/uploads', { method: 'POST', body: fd });
      set('imageUrl', r.url);
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      categoryId: form.categoryId || null,
      supplierId: form.supplierId || null,
      ...(editing ? { initialStock: undefined } : {}),
    };
    const schema = editing ? productUpdateSchema : productCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    // Si el rol no puede tocar precios, no se envían.
    const body: Record<string, unknown> = { ...parsed.data };
    if (editing && !can('prices:write')) {
      delete body.salePrice;
      delete body.costPrice;
    }
    setSaving(true);
    try {
      await api(editing ? `/admin/products/${productId}` : '/admin/products', { method: editing ? 'PATCH' : 'POST', json: body });
      toast(editing ? 'Producto guardado' : 'Producto creado');
      onSaved();
      onClose();
    } catch (err) {
      const e2 = err as ApiError;
      setErrors(e2.fields ?? {});
      toast(e2.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const margin = Number(form.salePrice) > 0 ? ((Number(form.salePrice) - Number(form.costPrice || 0)) / Number(form.salePrice)) * 100 : null;
  const priceLocked = readOnly || (editing && !can('prices:write'));

  return (
    <Modal
      open={open}
      onClose={onClose}
      side
      wide
      title={editing ? (detail?.name ?? 'Cargando…') : 'Nuevo producto'}
      description={editing && detail ? `Stock actual: ${formatQty(detail.stock)} · El stock se modifica desde “Registrar movimiento”.` : 'Lo que cargues acá se publica en el catálogo si está marcado como visible.'}
      footer={
        readOnly ? (
          <Button onClick={onClose}>Cerrar</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit" form="product-form" loading={saving}>
              {editing ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </>
        )
      }
    >
      <form id="product-form" onSubmit={submit} noValidate>
        <fieldset disabled={readOnly} className="space-y-5">
          <Field label="Nombre" error={errors.name}>
            {(id, d) => <Input id={id} aria-describedby={d} value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} placeholder="Ej.: Detergente líquido 3 L" />}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoría">
              {(id) => (
                <Select id={id} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">Sin categoría</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Proveedor habitual">
              {(id) => (
                <Select id={id} value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Costo" error={errors.costPrice} hint={priceLocked && editing ? 'Tu rol no edita precios' : undefined}>
              {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={form.costPrice} onChange={(e) => set('costPrice', e.target.value)} disabled={priceLocked} invalid={!!errors.costPrice} />}
            </Field>
            <Field label="Precio de venta" error={errors.salePrice} hint={margin !== null && !errors.salePrice ? `Margen ${margin.toFixed(1)}%` : undefined}>
              {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} disabled={priceLocked} invalid={!!errors.salePrice} />}
            </Field>
            <Field label="Unidad">
              {(id) => (
                <Select id={id} value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </Select>
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {!editing && (
              <Field label="Stock inicial" error={errors.initialStock} hint="Se registra como movimiento “Stock inicial”.">
                {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={form.initialStock} onChange={(e) => set('initialStock', e.target.value)} invalid={!!errors.initialStock} />}
              </Field>
            )}
            <Field label="Stock mínimo" error={errors.minStock} hint="Debajo de este número se genera una alerta.">
              {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} invalid={!!errors.minStock} />}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SKU / código interno" error={errors.sku}>
              {(id, d) => <Input id={id} aria-describedby={d} value={form.sku} onChange={(e) => set('sku', e.target.value)} invalid={!!errors.sku} />}
            </Field>
            <Field label="Código de barras">
              {(id) => <Input id={id} inputMode="numeric" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />}
            </Field>
          </div>

          <Field label="Descripción (se muestra en la web)" error={errors.description}>
            {(id) => <Textarea id={id} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-tinta/80">Foto</p>
            <div className="flex items-center gap-4">
              {form.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="" className="size-20 rounded-md object-cover ring-1 ring-linea" />
              ) : (
                <div className="grid size-20 place-items-center rounded-md bg-[#f3f3ef] text-gris ring-1 ring-linea">
                  <ImagePlus className="size-6" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <Button type="button" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                  {form.imageUrl ? 'Cambiar foto' : 'Subir foto'}
                </Button>
                {form.imageUrl && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => set('imageUrl', '')}>
                    <Trash2 className="size-3.5" /> Quitar
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-[12.5px] text-gris">JPG, PNG o WebP de hasta 3 MB.</p>
          </div>

          <div className="space-y-4 rounded-md bg-[#f6f7f2] p-4 ring-1 ring-linea">
            <Toggle checked={form.isPublished} onChange={(v) => set('isPublished', v)} label="Visible en la web" description="Si lo apagás, sigue en el inventario pero no aparece en el catálogo." />
            <Toggle checked={form.isFeatured} onChange={(v) => set('isFeatured', v)} label="Destacado" description="Aparece en la sección “Destacados” de la página principal." />
            <Toggle checked={form.showPrice} onChange={(v) => set('showPrice', v)} label="Mostrar precio" description="Si lo apagás, la web dice “Consultá el precio”." />
          </div>
        </fieldset>
      </form>

      {detail && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="mb-2 text-[13px] font-semibold">Últimos movimientos</h3>
            {detail.movements.length ? (
              <ul className="divide-y divide-linea text-[13px]">
                {detail.movements.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2 py-1.5">
                    <span>{MOVEMENT_LABELS[m.type]}<span className="block text-[12px] text-gris">{fmtDateTime(m.createdAt)}</span></span>
                    <span className="tnum text-right">
                      <span className={Number(m.delta) >= 0 ? 'text-[#1e6a3f]' : 'text-plumon'}>{Number(m.delta) > 0 ? '+' : ''}{formatQty(Number(m.delta))}</span>
                      <span className="block text-[12px] text-gris">queda {formatQty(Number(m.resultingStock))}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-gris">Sin movimientos.</p>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-[13px] font-semibold">Historial de precios</h3>
            {detail.priceHistory.length ? (
              <ul className="divide-y divide-linea text-[13px]">
                {detail.priceHistory.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 py-1.5">
                    <span>{p.field === 'sale' ? 'Venta' : 'Costo'}<span className="block text-[12px] text-gris">{fmtDateTime(p.createdAt)}</span></span>
                    <span className="tnum text-right">
                      {formatMoney(p.newValue, currency)}
                      <span className="block text-[12px] text-gris line-through">{formatMoney(p.previousValue, currency)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-gris">Sin cambios de precio.</p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

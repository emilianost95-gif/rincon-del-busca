'use client';

import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, RotateCcw, Trash2 } from 'lucide-react';
import { formatQty, MOVEMENT_LABELS, movementSchema, UNIT_SHORT, type ProductDTO, type SupplierDTO, type Unit } from '@rincon/shared';
import { api, ApiError, useDebounced } from '@/lib/client';
import { Button, Field, Input, Modal, Select, Textarea, useFeedback } from './ui';

type MType = 'IN' | 'OUT' | 'ADJUST' | 'RETURN' | 'LOSS';

const TYPES: { value: MType; icon: React.ComponentType<{ className?: string }>; help: string }[] = [
  { value: 'IN', icon: ArrowDownToLine, help: 'Mercadería que entra (compra a proveedor).' },
  { value: 'OUT', icon: ArrowUpFromLine, help: 'Venta o salida del local.' },
  { value: 'ADJUST', icon: ClipboardCheck, help: 'Contaste el stock: ingresá cuánto hay realmente.' },
  { value: 'RETURN', icon: RotateCcw, help: 'Un cliente devolvió el producto.' },
  { value: 'LOSS', icon: Trash2, help: 'Roto, vencido o perdido.' },
];

export type MovementTarget = Pick<ProductDTO, 'id' | 'name' | 'stock' | 'unit'> & { salePrice?: number };

export function MovementModal({
  open,
  onClose,
  onDone,
  product: initial,
  defaultType = 'IN',
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  product?: MovementTarget | null;
  defaultType?: MType;
}) {
  const { toast } = useFeedback();
  const [product, setProduct] = useState<MovementTarget | null>(initial ?? null);
  const [type, setType] = useState<MType>(defaultType);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const [results, setResults] = useState<ProductDTO[]>([]);

  useEffect(() => {
    if (!open) return;
    setProduct(initial ?? null);
    setType(defaultType);
    setQuantity('');
    setNote('');
    setSupplierId('');
    setUnitCost('');
    setUnitPrice('');
    setErrors({});
    setSearch('');
    api<SupplierDTO[]>('/admin/suppliers').then(setSuppliers).catch(() => setSuppliers([]));
  }, [open, initial, defaultType]);

  useEffect(() => {
    if (!open || product) return;
    const qs = new URLSearchParams({ pageSize: '8' });
    if (debounced) qs.set('q', debounced);
    api<{ items: ProductDTO[] }>(`/admin/products?${qs}`)
      .then((r) => setResults(r.items))
      .catch(() => setResults([]));
  }, [debounced, open, product]);

  const qty = Number(quantity.replace(',', '.'));
  const preview =
    product && quantity !== '' && !Number.isNaN(qty)
      ? type === 'ADJUST'
        ? qty
        : type === 'OUT' || type === 'LOSS'
          ? product.stock - qty
          : product.stock + qty
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return setErrors({ productId: 'Elegí un producto' });
    const parsed = movementSchema.safeParse({
      productId: product.id,
      type,
      quantity: quantity.replace(',', '.'),
      note,
      supplierId: type === 'IN' && supplierId ? supplierId : null,
      unitCost: type === 'IN' && unitCost ? unitCost : null,
      unitPrice: type === 'OUT' && unitPrice ? unitPrice : null,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setSaving(true);
    try {
      await api('/admin/movements', { method: 'POST', json: parsed.data });
      toast(`${MOVEMENT_LABELS[type]} registrada: ${product.name}`);
      onDone();
      onClose();
    } catch (err) {
      const e2 = err as ApiError;
      setErrors(e2.fields ?? {});
      toast(e2.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const unit = product ? UNIT_SHORT[product.unit as Unit] : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar movimiento de stock"
      description="Cada movimiento queda en el historial con fecha y usuario."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="movement-form" loading={saving}>
            Registrar movimiento
          </Button>
        </>
      }
    >
      <form id="movement-form" onSubmit={submit} className="space-y-5" noValidate>
        {product ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-[#f6f7f2] px-3 py-2.5 ring-1 ring-linea">
            <div>
              <p className="text-[14px] font-medium">{product.name}</p>
              <p className="text-[12.5px] text-gris">Stock actual: {formatQty(product.stock)} {unit}</p>
            </div>
            {!initial && (
              <Button size="sm" variant="ghost" type="button" onClick={() => setProduct(null)}>
                Cambiar
              </Button>
            )}
          </div>
        ) : (
          <Field label="Producto" error={errors.productId}>
            {(id) => (
              <div>
                <Input id={id} placeholder="Buscá por nombre, SKU o código" value={search} onChange={(e) => setSearch(e.target.value)} />
                <ul className="mt-2 max-h-56 overflow-y-auto rounded-md ring-1 ring-linea">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => setProduct(r)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[14px] hover:bg-[#f6f7f2]">
                        <span className="truncate">{r.name}</span>
                        <span className="tnum shrink-0 text-[12.5px] text-gris">{formatQty(r.stock)} {UNIT_SHORT[r.unit]}</span>
                      </button>
                    </li>
                  ))}
                  {!results.length && <li className="px-3 py-3 text-[13px] text-gris">Sin resultados</li>}
                </ul>
              </div>
            )}
          </Field>
        )}

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-tinta/80">Tipo de movimiento</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TYPES.map((t) => (
              <label key={t.value} className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[13.5px] ring-1 transition-colors ${type === t.value ? 'bg-gondola text-white ring-gondola' : 'bg-white ring-linea hover:ring-gondola/40'}`}>
                <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
                <t.icon className="size-4" />
                {MOVEMENT_LABELS[t.value]}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] text-gris">{TYPES.find((t) => t.value === type)?.help}</p>
        </fieldset>

        <Field
          label={type === 'ADJUST' ? `Stock contado${unit ? ` (${unit})` : ''}` : `Cantidad${unit ? ` (${unit})` : ''}`}
          error={errors.quantity}
          hint={preview !== null ? `Stock resultante: ${formatQty(Math.round(preview * 1000) / 1000)} ${unit}` : undefined}
        >
          {(id, d) => (
            <Input id={id} aria-describedby={d} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} invalid={!!errors.quantity || (preview !== null && preview < 0)} />
          )}
        </Field>

        {type === 'OUT' && (
          <Field label="Precio de venta unitario" error={errors.unitPrice} hint={`Vacío = precio vigente${product?.salePrice ? ` (${product.salePrice})` : ''}. Se usa en el análisis de facturación.`}>
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} invalid={!!errors.unitPrice} />}
          </Field>
        )}

        {type === 'IN' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Proveedor (opcional)">
              {(id) => (
                <Select id={id} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Costo unitario (opcional)" error={errors.unitCost}>
              {(id) => <Input id={id} inputMode="numeric" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />}
            </Field>
          </div>
        )}

        <Field label="Nota (opcional)">
          {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: factura 1234, vencido, conteo mensual" />}
        </Field>
      </form>
    </Modal>
  );
}

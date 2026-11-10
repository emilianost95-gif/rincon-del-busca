'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { formatMoney, promotionSchema, type Paginated, type ProductDTO, type PromotionDTO } from '@rincon/shared';
import { api, ApiError, fmtDate, useDebounced, useResource } from '@/lib/client';
import { Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Panel, Table, TableSkeleton, Td, Textarea, Th, Toggle, useFeedback } from '@/components/admin/ui';
import { Can, useSession } from '@/components/admin/session';

const STATUS = {
  live: { label: 'Vigente', tone: 'green' },
  scheduled: { label: 'Programada', tone: 'blue' },
  ended: { label: 'Finalizada', tone: 'neutral' },
  paused: { label: 'Pausada', tone: 'amber' },
} as const;

const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function PromotionsPage() {
  const { toast, confirm } = useFeedback();
  const { currency } = useSession();
  const list = useResource<PromotionDTO[]>('/admin/promotions');
  const [editing, setEditing] = useState<PromotionDTO | 'new' | null>(null);
  const [form, setForm] = useState({ title: '', description: '', badge: '', promoPrice: '', startsAt: '', endsAt: '', isActive: true });
  const [product, setProduct] = useState<Pick<ProductDTO, 'id' | 'name' | 'salePrice'> | null>(null);
  const [search, setSearch] = useState('');
  const dq = useDebounced(search, 250);
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing || product) return;
    api<Paginated<ProductDTO>>(`/admin/products?pageSize=6${dq ? `&q=${encodeURIComponent(dq)}` : ''}`).then((r) => setResults(r.items)).catch(() => undefined);
  }, [dq, editing, product]);

  function open(p: PromotionDTO | 'new') {
    setErrors({});
    setSearch('');
    if (p === 'new') {
      const now = new Date();
      setForm({ title: '', description: '', badge: '', promoPrice: '', startsAt: toLocal(now), endsAt: toLocal(new Date(now.getTime() + 7 * 86400000)), isActive: true });
      setProduct(null);
    } else {
      setForm({ title: p.title, description: p.description ?? '', badge: p.badge ?? '', promoPrice: p.promoPrice != null ? String(p.promoPrice) : '', startsAt: toLocal(new Date(p.startsAt)), endsAt: toLocal(new Date(p.endsAt)), isActive: p.isActive });
      setProduct(p.productId ? { id: p.productId, name: p.productName ?? 'Producto', salePrice: 0 } : null);
    }
    setEditing(p);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = promotionSchema.safeParse({
      ...form,
      promoPrice: form.promoPrice || null,
      productId: product?.id ?? null,
      startsAt: form.startsAt ? new Date(form.startsAt) : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt) : undefined,
    });
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    if (product?.salePrice && parsed.data.promoPrice != null && parsed.data.promoPrice >= product.salePrice) {
      return setErrors({ promoPrice: `Debe ser menor al precio actual (${formatMoney(product.salePrice, currency)})` });
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      await api(isNew ? '/admin/promotions' : `/admin/promotions/${(editing as PromotionDTO).id}`, { method: isNew ? 'POST' : 'PATCH', json: parsed.data });
      toast(isNew ? 'Promoción creada' : 'Promoción guardada');
      setEditing(null);
      list.reload();
    } catch (err) {
      setErrors((err as ApiError).fields ?? {});
      toast((err as ApiError).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: PromotionDTO) {
    if (!(await confirm({ title: 'Eliminar promoción', message: `¿Eliminar “${p.title}”? Deja de mostrarse en la web.`, confirmLabel: 'Eliminar', danger: true }))) return;
    try {
      await api(`/admin/promotions/${p.id}`, { method: 'DELETE' });
      toast('Promoción eliminada');
      list.reload();
    } catch (err) {
      toast((err as ApiError).message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Promociones"
        description="Las vigentes aparecen en “Ofertas de la semana” y el precio promocional se aplica solo en el catálogo, entre las fechas que indiques."
        actions={<Can perm="promotions:write"><Button variant="primary" onClick={() => open('new')}><Plus className="size-4" /> Nueva promoción</Button></Can>}
      />
      <Panel padded={false}>
        {list.error ? (
          <div className="p-4"><ErrorBox message={list.error.message} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={4} />
        ) : !list.data?.length ? (
          <EmptyState title="Sin promociones" description="Creá una oferta con precio especial y fechas: se publica y se retira sola." />
        ) : (
          <Table>
            <thead><tr><Th>Promoción</Th><Th>Producto</Th><Th className="text-right">Precio promo</Th><Th>Vigencia</Th><Th>Estado</Th><Th className="w-0" /></tr></thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id}>
                  <Td><p className="font-medium">{p.title}</p>{p.badge && <p className="text-[12.5px] text-gris">Etiqueta: {p.badge}</p>}</Td>
                  <Td className="text-gris">{p.productName ?? '—'}</Td>
                  <Td className="text-right font-medium">{p.promoPrice != null ? formatMoney(p.promoPrice, currency) : '—'}</Td>
                  <Td className="text-[13px] whitespace-nowrap text-gris">{fmtDate(p.startsAt)} – {fmtDate(p.endsAt)}</Td>
                  <Td><Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge></Td>
                  <Td>
                    <Can perm="promotions:write">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => open(p)} aria-label={`Editar ${p.title}`}><Pencil className="size-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label={`Eliminar ${p.title}`}><Trash2 className="size-4" /></Button>
                      </div>
                    </Can>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        wide
        title={editing === 'new' ? 'Nueva promoción' : 'Editar promoción'}
        footer={<><Button onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" type="submit" form="promo-form" loading={saving}>Guardar</Button></>}
      >
        <form id="promo-form" onSubmit={save} className="space-y-4" noValidate>
          <Field label="Título" error={errors.title}>{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} invalid={!!errors.title} placeholder="Ej.: Semana de la limpieza" />}</Field>
          <Field label="Producto">
            {(id) =>
              product ? (
                <div className="flex items-center justify-between rounded-md bg-[#f6f7f2] px-3 py-2 ring-1 ring-linea">
                  <span className="text-[14px] font-medium">{product.name}{product.salePrice ? <span className="ml-2 text-gris">{formatMoney(product.salePrice, currency)}</span> : null}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setProduct(null)}>Cambiar</Button>
                </div>
              ) : (
                <div>
                  <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscá el producto en oferta" />
                  <ul className="mt-2 rounded-md ring-1 ring-linea">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => setProduct(r)} className="flex w-full justify-between px-3 py-2 text-left text-[14px] hover:bg-[#f6f7f2]">
                          {r.name}<span className="text-gris">{formatMoney(r.salePrice, currency)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            }
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Precio promocional" error={errors.promoPrice}>{(id) => <Input id={id} inputMode="numeric" value={form.promoPrice} onChange={(e) => setForm({ ...form, promoPrice: e.target.value })} invalid={!!errors.promoPrice} />}</Field>
            <Field label="Etiqueta corta" hint="Ej.: -15%, 2x1, Oferta" error={errors.badge}>{(id, d) => <Input id={id} aria-describedby={d} maxLength={24} value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} />}</Field>
            <Field label="Empieza" error={errors.startsAt}>{(id) => <Input id={id} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />}</Field>
            <Field label="Termina" error={errors.endsAt}>{(id) => <Input id={id} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} invalid={!!errors.endsAt} />}</Field>
          </div>
          <Field label="Descripción (se muestra en el cartel)">{(id) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Activa" description="Pausala para ocultarla sin borrarla." />
        </form>
      </Modal>
    </>
  );
}

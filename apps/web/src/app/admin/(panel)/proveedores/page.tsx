'use client';

import { useState } from 'react';
import { Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { supplierSchema, type SupplierDTO } from '@rincon/shared';
import { api, ApiError, useResource } from '@/lib/client';
import { Button, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Panel, Table, TableSkeleton, Td, Textarea, Th, useFeedback } from '@/components/admin/ui';
import { Can } from '@/components/admin/session';

const EMPTY = { name: '', contactName: '', phone: '', email: '', taxId: '', notes: '' };

export default function SuppliersPage() {
  const { toast, confirm } = useFeedback();
  const list = useResource<SupplierDTO[]>('/admin/suppliers');
  const [editing, setEditing] = useState<SupplierDTO | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function open(s: SupplierDTO | 'new') {
    setErrors({});
    setForm(s === 'new' ? EMPTY : { name: s.name, contactName: s.contactName ?? '', phone: s.phone ?? '', email: s.email ?? '', taxId: s.taxId ?? '', notes: s.notes ?? '' });
    setEditing(s);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = supplierSchema.safeParse(form);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setSaving(true);
    try {
      const isNew = editing === 'new';
      await api(isNew ? '/admin/suppliers' : `/admin/suppliers/${(editing as SupplierDTO).id}`, { method: isNew ? 'POST' : 'PATCH', json: parsed.data });
      toast(isNew ? 'Proveedor creado' : 'Proveedor guardado');
      setEditing(null);
      list.reload();
    } catch (err) {
      setErrors((err as ApiError).fields ?? {});
      toast((err as ApiError).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: SupplierDTO) {
    const ok = await confirm({
      title: 'Eliminar proveedor',
      message: `¿Eliminar “${s.name}”? ${s.productCount ? `Sus ${s.productCount} producto(s) quedan sin proveedor asignado. ` : ''}El historial de entradas se conserva.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/suppliers/${s.id}`, { method: 'DELETE' });
      toast('Proveedor eliminado');
      list.reload();
    } catch (err) {
      toast((err as ApiError).message, 'error');
    }
  }

  const f = (k: keyof typeof EMPTY, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} error={errors[k]}>
      {(id) => <Input id={id} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} invalid={!!errors[k]} {...extra} />}
    </Field>
  );

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="A quién le comprás. Se usan en las entradas de stock, en la lista de reposición y para actualizar precios por proveedor."
        actions={<Can perm="suppliers:write"><Button variant="primary" onClick={() => open('new')}><Plus className="size-4" /> Nuevo proveedor</Button></Can>}
      />
      <Panel padded={false}>
        {list.error ? (
          <div className="p-4"><ErrorBox message={list.error.message} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={4} />
        ) : !list.data?.length ? (
          <EmptyState title="Sin proveedores" description="Cargá a tus proveedores para registrar compras y generar listas de reposición." action={<Can perm="suppliers:write"><Button variant="primary" onClick={() => open('new')}>Nuevo proveedor</Button></Can>} />
        ) : (
          <Table>
            <thead><tr><Th>Proveedor</Th><Th>Contacto</Th><Th className="text-right">Productos</Th><Th className="w-0" /></tr></thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <p className="font-medium">{s.name}</p>
                    {s.notes && <p className="max-w-md truncate text-[12.5px] text-gris">{s.notes}</p>}
                  </Td>
                  <Td className="text-[13px]">
                    {s.contactName && <p>{s.contactName}</p>}
                    <div className="flex flex-wrap gap-x-3 text-gris">
                      {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:text-tinta"><Phone className="size-3" />{s.phone}</a>}
                      {s.email && <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 hover:text-tinta"><Mail className="size-3" />{s.email}</a>}
                    </div>
                  </Td>
                  <Td className="text-right">{s.productCount ?? 0}</Td>
                  <Td>
                    <Can perm="suppliers:write">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => open(s)} aria-label={`Editar ${s.name}`}><Pencil className="size-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(s)} aria-label={`Eliminar ${s.name}`}><Trash2 className="size-4" /></Button>
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
        title={editing === 'new' ? 'Nuevo proveedor' : 'Editar proveedor'}
        footer={<><Button onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" type="submit" form="sup-form" loading={saving}>Guardar</Button></>}
      >
        <form id="sup-form" onSubmit={save} className="space-y-4" noValidate>
          {f('name', 'Nombre o razón social')}
          <div className="grid gap-4 sm:grid-cols-2">
            {f('contactName', 'Persona de contacto')}
            {f('taxId', 'RUT / CUIT')}
            {f('phone', 'Teléfono', { type: 'tel' })}
            {f('email', 'Email', { type: 'email' })}
          </div>
          <Field label="Notas">{(id) => <Textarea id={id} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Días de entrega, condiciones de pago…" />}</Field>
        </form>
      </Modal>
    </>
  );
}

'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { categorySchema, type CategoryDTO } from '@rincon/shared';
import { api, ApiError, useResource } from '@/lib/client';
import { Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Panel, Table, TableSkeleton, Td, Th, Textarea, Toggle, useFeedback } from '@/components/admin/ui';
import { Can } from '@/components/admin/session';
import { CATEGORY_ICONS, CategoryIcon } from '@/components/site/icons';

const PALETTE = ['#A4532E', '#3E6A8A', '#C99A2E', '#5E7B4F', '#8A5A7A', '#2E7D7A', '#A3423A', '#4F5D75', '#163828', '#7A6A4F'];
const EMPTY = { name: '', description: '', color: PALETTE[0]!, icon: 'package', sortOrder: '0', isPublished: true };

export default function CategoriesPage() {
  const { toast, confirm } = useFeedback();
  const list = useResource<CategoryDTO[]>('/admin/categories');
  const [editing, setEditing] = useState<CategoryDTO | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function open(c: CategoryDTO | 'new') {
    setErrors({});
    setForm(c === 'new' ? { ...EMPTY, sortOrder: String(list.data?.length ?? 0) } : { name: c.name, description: c.description ?? '', color: c.color, icon: c.icon, sortOrder: String(c.sortOrder), isPublished: c.isPublished });
    setEditing(c);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = categorySchema.safeParse(form);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setSaving(true);
    try {
      const isNew = editing === 'new';
      await api(isNew ? '/admin/categories' : `/admin/categories/${(editing as CategoryDTO).id}`, { method: isNew ? 'POST' : 'PATCH', json: parsed.data });
      toast(isNew ? 'Categoría creada' : 'Categoría guardada');
      setEditing(null);
      list.reload();
    } catch (err) {
      setErrors((err as ApiError).fields ?? {});
      toast((err as ApiError).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: CategoryDTO) {
    const ok = await confirm({ title: 'Eliminar categoría', message: `¿Eliminar “${c.name}”? Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    try {
      await api(`/admin/categories/${c.id}`, { method: 'DELETE' });
      toast('Categoría eliminada');
      list.reload();
    } catch (err) {
      toast((err as ApiError).message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Categorías"
        description="Los rubros que se muestran en la web: el orden, el color y el ícono se usan en la góndola de la portada y en el catálogo."
        actions={<Can perm="catalog:write"><Button variant="primary" onClick={() => open('new')}><Plus className="size-4" /> Nueva categoría</Button></Can>}
      />
      <Panel padded={false}>
        {list.error ? (
          <div className="p-4"><ErrorBox message={list.error.message} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={5} />
        ) : !list.data?.length ? (
          <EmptyState title="Sin categorías" description="Creá los rubros del local para ordenar el catálogo." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Categoría</Th><Th className="text-right">Productos</Th><Th className="text-right">Orden</Th><Th>Web</Th><Th className="w-0" /></tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded text-white" style={{ backgroundColor: c.color }}><CategoryIcon name={c.icon} className="size-4" /></span>
                      <div>
                        <p className="font-medium">{c.name}</p>
                        {c.description && <p className="max-w-md truncate text-[12.5px] text-gris">{c.description}</p>}
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right">{c.productCount ?? 0}</Td>
                  <Td className="text-right text-gris">{c.sortOrder}</Td>
                  <Td>{c.isPublished ? <Badge tone="green">Visible</Badge> : <Badge>Oculta</Badge>}</Td>
                  <Td>
                    <Can perm="catalog:write">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => open(c)} aria-label={`Editar ${c.name}`}><Pencil className="size-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(c)} aria-label={`Eliminar ${c.name}`}><Trash2 className="size-4" /></Button>
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
        title={editing === 'new' ? 'Nueva categoría' : 'Editar categoría'}
        footer={<><Button onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" type="submit" form="cat-form" loading={saving}>Guardar</Button></>}
      >
        <form id="cat-form" onSubmit={save} className="space-y-4" noValidate>
          <Field label="Nombre" error={errors.name}>{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={!!errors.name} />}</Field>
          <Field label="Descripción corta">{(id) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-tinta/80">Color</legend>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} aria-label={`Color ${c}`} aria-pressed={form.color === c} className={`size-8 rounded ${form.color === c ? 'ring-2 ring-tinta ring-offset-2' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-tinta/80">Ícono</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(CATEGORY_ICONS).map((name) => (
                <button key={name} type="button" onClick={() => setForm({ ...form, icon: name })} aria-label={`Ícono ${name}`} aria-pressed={form.icon === name} className={`grid size-9 place-items-center rounded ring-1 ${form.icon === name ? 'text-white ring-transparent' : 'ring-linea hover:bg-[#f6f7f2]'}`} style={form.icon === name ? { backgroundColor: form.color } : undefined}>
                  <CategoryIcon name={name} className="size-4" />
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="Orden en la web" hint="Menor número aparece primero.">{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />}</Field>
          <Toggle checked={form.isPublished} onChange={(v) => setForm({ ...form, isPublished: v })} label="Visible en la web" />
        </form>
      </Modal>
    </>
  );
}

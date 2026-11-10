'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, userCreateSchema, userUpdateSchema, type Role } from '@rincon/shared';
import { api, ApiError, fmtRelative, useResource } from '@/lib/client';
import { Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Panel, Select, Table, TableSkeleton, Td, Th, Toggle, useFeedback } from '@/components/admin/ui';
import { useSession } from '@/components/admin/session';

type U = { id: string; name: string; email: string; role: Role; isActive: boolean; lastLoginAt: string | null };

export default function UsersPage() {
  const { toast, confirm } = useFeedback();
  const { user: me } = useSession();
  const list = useResource<U[]>('/admin/users');
  const [editing, setEditing] = useState<U | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STAFF' as Role, isActive: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function open(u: U | 'new') {
    setErrors({});
    setForm(u === 'new' ? { name: '', email: '', password: '', role: 'STAFF', isActive: true } : { name: u.name, email: u.email, password: '', role: u.role, isActive: u.isActive });
    setEditing(u);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const isNew = editing === 'new';
    const parsed = isNew
      ? userCreateSchema.safeParse(form)
      : userUpdateSchema.safeParse({ name: form.name, role: form.role, isActive: form.isActive, password: form.password || undefined });
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setSaving(true);
    try {
      await api(isNew ? '/admin/users' : `/admin/users/${(editing as U).id}`, { method: isNew ? 'POST' : 'PATCH', json: parsed.data });
      toast(isNew ? 'Usuario creado' : 'Usuario guardado');
      setEditing(null);
      list.reload();
    } catch (err) {
      setErrors((err as ApiError).fields ?? {});
      toast((err as ApiError).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(u: U) {
    if (!(await confirm({ title: 'Eliminar usuario', message: `¿Eliminar a ${u.name}? Sus acciones pasadas quedan en el historial.`, confirmLabel: 'Eliminar', danger: true }))) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      toast('Usuario eliminado');
      list.reload();
    } catch (err) {
      toast((err as ApiError).message, 'error');
    }
  }

  return (
    <>
      <PageHeader title="Usuarios y permisos" description="Cada persona entra con su cuenta. El rol define qué puede ver y modificar." actions={<Button variant="primary" onClick={() => open('new')}><Plus className="size-4" /> Nuevo usuario</Button>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="rounded-lg bg-white p-3 ring-1 ring-linea">
            <p className="text-[14px] font-semibold">{ROLE_LABELS[r]}</p>
            <p className="mt-0.5 text-[12.5px] text-gris">{ROLE_DESCRIPTIONS[r]}</p>
          </div>
        ))}
      </div>
      <Panel padded={false}>
        {list.error ? (
          <div className="p-4"><ErrorBox message={list.error.message} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <TableSkeleton rows={3} />
        ) : !list.data?.length ? (
          <EmptyState title="Sin usuarios" />
        ) : (
          <Table>
            <thead><tr><Th>Persona</Th><Th>Rol</Th><Th>Estado</Th><Th>Último ingreso</Th><Th className="w-0" /></tr></thead>
            <tbody>
              {list.data.map((u) => (
                <tr key={u.id}>
                  <Td><p className="font-medium">{u.name}{u.id === me.id && <span className="ml-2 text-[12px] text-gris">(vos)</span>}</p><p className="text-[12.5px] text-gris">{u.email}</p></Td>
                  <Td>{ROLE_LABELS[u.role]}</Td>
                  <Td>{u.isActive ? <Badge tone="green">Activo</Badge> : <Badge>Desactivado</Badge>}</Td>
                  <Td className="text-gris">{u.lastLoginAt ? fmtRelative(u.lastLoginAt) : 'Nunca'}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => open(u)} aria-label={`Editar ${u.name}`}><Pencil className="size-4" /></Button>
                      {u.id !== me.id && <Button size="sm" variant="ghost" onClick={() => remove(u)} aria-label={`Eliminar ${u.name}`}><Trash2 className="size-4" /></Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo usuario' : 'Editar usuario'} footer={<><Button onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" type="submit" form="user-form" loading={saving}>Guardar</Button></>}>
        <form id="user-form" onSubmit={save} className="space-y-4" noValidate>
          <Field label="Nombre" error={errors.name}>{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={!!errors.name} />}</Field>
          <Field label="Email" error={errors.email}>{(id) => <Input id={id} type="email" value={form.email} disabled={editing !== 'new'} onChange={(e) => setForm({ ...form, email: e.target.value })} invalid={!!errors.email} />}</Field>
          <Field label={editing === 'new' ? 'Contraseña' : 'Nueva contraseña (opcional)'} error={errors.password} hint="Mínimo 10 caracteres, con letras y números.">
            {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} invalid={!!errors.password} />}
          </Field>
          <Field label="Rol" hint={ROLE_DESCRIPTIONS[form.role]}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            )}
          </Field>
          {editing !== 'new' && editing?.id !== me.id && <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Cuenta activa" description="Desactivarla cierra sus sesiones abiertas." />}
        </form>
      </Modal>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DAY_NAMES, settingsSchema, type BusinessHours, type SettingsInput } from '@rincon/shared';
import { api, ApiError, useResource } from '@/lib/client';
import { Button, Field, Input, PageHeader, Panel, Select, Skeleton, Textarea, Toggle, useFeedback } from '@/components/admin/ui';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

function HoursEditor({ value, onChange }: { value: BusinessHours; onChange: (h: BusinessHours) => void }) {
  const get = (day: number) => value.find((h) => h.day === day) ?? { day, closed: true, ranges: [] };
  const update = (day: number, patch: Partial<BusinessHours[number]>) => {
    const next = ORDER.map((d) => (d === day ? { ...get(d), ...patch } : get(d)));
    onChange(next);
  };
  return (
    <div className="divide-y divide-linea rounded-md ring-1 ring-linea">
      {ORDER.map((day) => {
        const h = get(day);
        const open = !h.closed;
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="w-32"><Toggle checked={open} onChange={(v) => update(day, { closed: !v, ranges: v && !h.ranges.length ? [{ open: '09:00', close: '20:00' }] : h.ranges })} label={DAY_NAMES[day]!} /></div>
            {open ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {h.ranges.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input type="time" aria-label={`${DAY_NAMES[day]} abre`} value={r.open} className="w-28" onChange={(e) => update(day, { ranges: h.ranges.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)) })} />
                    <span className="text-gris">a</span>
                    <Input type="time" aria-label={`${DAY_NAMES[day]} cierra`} value={r.close} className="w-28" onChange={(e) => update(day, { ranges: h.ranges.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)) })} />
                    {h.ranges.length > 1 && <Button type="button" size="sm" variant="ghost" aria-label="Quitar franja" onClick={() => update(day, { ranges: h.ranges.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></Button>}
                  </div>
                ))}
                {h.ranges.length < 2 && <Button type="button" size="sm" variant="ghost" onClick={() => update(day, { ranges: [...h.ranges, { open: '17:00', close: '21:00' }] })}><Plus className="size-3.5" /> Horario cortado</Button>}
              </div>
            ) : (
              <span className="text-[13px] text-gris">Cerrado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SettingsPage() {
  const { toast, confirm } = useFeedback();
  const { data, loading, reload } = useResource<SettingsInput>('/admin/settings');
  const [form, setForm] = useState<SettingsInput | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [galleryInput, setGalleryInput] = useState('');

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (loading || !form) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  const set = <K extends keyof SettingsInput>(k: K, v: SettingsInput[K]) => setForm({ ...form, [k]: v });
  const text = (k: keyof SettingsInput, label: string, hint?: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} error={errors[k]} hint={hint}>
      {(id, d) => <Input id={id} aria-describedby={d} value={(form[k] as string | null) ?? ''} onChange={(e) => set(k, e.target.value as never)} invalid={!!errors[k]} {...extra} />}
    </Field>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      toast('Revisá los campos marcados', 'error');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api('/admin/settings', { method: 'PUT', json: parsed.data });
      toast('Configuración guardada. La web ya muestra los cambios.');
      reload();
    } catch (err) {
      setErrors((err as ApiError).fields ?? {});
      toast((err as ApiError).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function clearDemo() {
    const ok = await confirm({
      title: 'Eliminar datos de demostración',
      message: 'Se borran los productos, movimientos y promociones de ejemplo, y se quita el aviso de demostración de la web. Las categorías, proveedores y usuarios se mantienen. No se puede deshacer.',
      confirmLabel: 'Eliminar datos demo',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api<{ removed: number; kept: string[] }>('/admin/settings/clear-demo', { method: 'POST' });
      toast(
        r.kept.length
          ? `Se eliminaron ${r.removed} productos de demostración. ${r.kept.length} tenían datos de una planilla y se conservaron como reales.`
          : `Se eliminaron ${r.removed} productos de demostración`,
      );
      reload();
    } catch (err) {
      toast((err as ApiError).message, 'error');
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <PageHeader
        title="Configuración del negocio"
        description="Estos datos alimentan la web: contacto, WhatsApp, dirección y horarios. Lo que quede vacío se muestra como “pendiente”, nunca inventado."
        actions={<Button variant="primary" type="submit" loading={saving}>Guardar cambios</Button>}
      />
      <div className="space-y-4">
        <Panel title="Identidad">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('businessName', 'Nombre comercial')}
            {text('tagline', 'Frase corta (pie de página)')}
            <Field label="Presentación (sección “Un rincón de barrio…”)" className="sm:col-span-2" hint="Si queda vacío se usa un texto genérico sobre los rubros.">
              {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} value={form.about ?? ''} onChange={(e) => set('about', e.target.value)} />}
            </Field>
          </div>
        </Panel>

        <Panel title="Contacto">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('whatsapp', 'WhatsApp', 'Formato internacional, sólo números. Ej.: 56912345678', { inputMode: 'tel' })}
            {text('phone', 'Teléfono')}
            {text('email', 'Email', undefined, { type: 'email' })}
            {text('instagram', 'Instagram', 'Usuario, sin @')}
          </div>
        </Panel>

        <Panel title="Ubicación">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('address', 'Dirección')}
            {text('city', 'Ciudad / comuna')}
            {text('mapsUrl', 'Enlace de Google Maps (opcional)', 'Si queda vacío se arma con la dirección.')}
            <Field label="Moneda">
              {(id) => (
                <Select id={id} value={form.currency} onChange={(e) => set('currency', e.target.value as SettingsInput['currency'])}>
                  {['CLP', 'ARS', 'USD', 'PEN', 'COP', 'MXN', 'UYU'].map((c) => <option key={c}>{c}</option>)}
                </Select>
              )}
            </Field>
          </div>
        </Panel>

        <Panel title="Horarios de atención">
          <HoursEditor value={form.hours} onChange={(h) => set('hours', h)} />
          {!form.hours.length && <p className="mt-2 text-[13px] text-gris">Sin horarios cargados: la web muestra “Horario pendiente de confirmar”.</p>}
        </Panel>

        <Panel title="Galería del local">
          <p className="mb-3 text-[13px] text-gris">Hasta 5 fotos en la portada. Pegá la URL de una imagen subida (por ejemplo, desde un producto) o de un servicio externo.</p>
          <ul className="mb-3 space-y-2">
            {form.gallery.map((g, i) => (
              <li key={g + i} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g} alt="" className="size-12 rounded object-cover ring-1 ring-linea" />
                <span className="flex-1 truncate text-[13px]">{g}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => set('gallery', form.gallery.filter((_, j) => j !== i))} aria-label="Quitar foto"><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input value={galleryInput} onChange={(e) => setGalleryInput(e.target.value)} placeholder="https://… o /uploads/…" aria-label="URL de la foto" />
            <Button type="button" onClick={() => { if (galleryInput.trim()) { set('gallery', [...form.gallery, galleryInput.trim()].slice(0, 12)); setGalleryInput(''); } }}>Agregar</Button>
          </div>
        </Panel>

        <Panel title="Modo demostración">
          <Toggle checked={form.demoMode} onChange={(v) => set('demoMode', v)} label="Mostrar aviso de demostración en la web" description="Indica a los visitantes que los productos y precios son de ejemplo." />
          <div className="mt-4 flex flex-col gap-3 rounded-md bg-[#fbe4e2]/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13.5px]">Antes de publicar con datos reales, eliminá los productos y promociones de ejemplo.</p>
            <Button type="button" variant="danger" onClick={clearDemo}>Eliminar datos demo</Button>
          </div>
        </Panel>
      </div>
    </form>
  );
}

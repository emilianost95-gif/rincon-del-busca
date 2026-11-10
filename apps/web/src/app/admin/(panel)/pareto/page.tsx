'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Lightbulb, Wand2 } from 'lucide-react';
import { formatMoney, formatQty, UNIT_SHORT, type ParetoDTO, type ParetoMetric } from '@rincon/shared';
import { api, ApiError, useResource } from '@/lib/client';
import { Badge, Button, EmptyState, ErrorBox, PageHeader, Panel, Select, Skeleton, Table, Td, Th, useFeedback } from '@/components/admin/ui';
import { ParetoChart } from '@/components/admin/ParetoChart';
import { useSession } from '@/components/admin/session';

const METRICS: { value: ParetoMetric; label: string; help: string }[] = [
  { value: 'revenue', label: 'Facturación', help: 'Qué productos generan la mayor parte de la plata que entra.' },
  { value: 'units', label: 'Unidades', help: 'Qué productos salen más, sin importar el precio.' },
  { value: 'inventory', label: 'Capital inmovilizado', help: 'En qué productos está invertida la plata del stock (a costo).' },
];

const PERIODS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: '365', label: 'Último año' },
];

const CLASS_TONE = { A: 'green', B: 'amber', C: 'neutral' } as const;

export default function ParetoPage() {
  const { currency, can } = useSession();
  const { toast, confirm } = useFeedback();
  const [metric, setMetric] = useState<ParetoMetric>('revenue');
  const [days, setDays] = useState('30');
  const [filter, setFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const qs = `metric=${metric}&days=${days}`;
  const { data, error, loading, reload } = useResource<ParetoDTO>(`/admin/reports/pareto?${qs}`);

  const fmt = (n: number) => (metric === 'units' ? `${formatQty(n)} un.` : formatMoney(n, currency));
  const items = useMemo(() => (data ? (filter === 'all' ? data.items : data.items.filter((i) => i.abc === filter)) : []), [data, filter]);
  const timeBased = metric !== 'inventory';
  const suggestions = data?.items.filter((i) => i.suggestedMinStock !== null) ?? [];
  const aAtRisk = data?.items.filter((i) => i.abc === 'A' && i.value > 0 && i.stock <= i.minStock) ?? [];
  const pctA = data && data.productCount ? Math.round((data.summary.A.count / data.productCount) * 100) : 0;

  async function applySuggestions() {
    const ok = await confirm({
      title: 'Subir stock mínimo de productos A',
      message: `Se actualiza el stock mínimo de ${suggestions.length} producto(s) a lo que se vende en 7 días promedio. Así las alertas avisan antes de que se agoten los que más venden.`,
      confirmLabel: `Actualizar ${suggestions.length} mínimo(s)`,
    });
    if (!ok) return;
    try {
      for (const s of suggestions) {
        await api(`/admin/products/${s.id}`, { method: 'PATCH', json: { minStock: s.suggestedMinStock } });
      }
      toast(`Stock mínimo actualizado en ${suggestions.length} producto(s)`);
      reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Análisis de Pareto (ABC)"
        description="Ordena los productos por su peso y muestra cuáles concentran el 80 % del total. Sirve para decidir qué nunca puede faltar, dónde está la plata y qué conviene liquidar."
        actions={
          <>
            <a href={`/api/admin/reports/export/pareto.xlsx?${qs}`} className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3.5 text-[14px] font-medium ring-1 ring-linea hover:ring-gondola/40">
              <Download className="size-4" /> Excel
            </a>
            <a href={`/api/admin/reports/export/pareto.csv?${qs}`} className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3.5 text-[14px] font-medium ring-1 ring-linea hover:ring-gondola/40">
              CSV
            </a>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="Criterio" className="inline-flex rounded-md bg-white p-1 ring-1 ring-linea">
          {METRICS.map((m) => (
            <button
              key={m.value}
              role="radio"
              aria-checked={metric === m.value}
              onClick={() => setMetric(m.value)}
              className={`h-8 rounded px-3 text-[13.5px] font-medium transition-colors ${metric === m.value ? 'bg-gondola text-white' : 'text-tinta/75 hover:bg-black/5'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {timeBased && (
          <Select aria-label="Período" value={days} onChange={(e) => setDays(e.target.value)} className="sm:w-48">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        )}
        <p className="text-[13px] text-gris sm:ml-2">{METRICS.find((m) => m.value === metric)?.help}</p>
      </div>

      {error && <ErrorBox message={error.message} onRetry={reload} />}

      {loading && !data ? (
        <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>
      ) : data && data.total > 0 ? (
        <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['A', 'B', 'C'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(filter === k ? 'all' : k)}
                aria-pressed={filter === k}
                className={`rounded-lg bg-white p-4 text-left ring-1 transition-shadow ${filter === k ? 'ring-2 ring-gondola' : 'ring-linea hover:ring-gondola/40'}`}
              >
                <div className="flex items-center justify-between">
                  <Badge tone={CLASS_TONE[k]}>Clase {k}</Badge>
                  <span className="tnum text-[13px] text-gris">{(data.summary[k].share * 100).toFixed(1)}% del total</span>
                </div>
                <p className="tnum mt-2 text-[26px] leading-none font-bold">{data.summary[k].count} <span className="text-[14px] font-normal text-gris">productos</span></p>
                <p className="mt-1.5 text-[12.5px] text-gris">
                  {k === 'A' ? 'Los imprescindibles: no pueden faltar nunca.' : k === 'B' ? 'Importantes: revisión periódica.' : timeBased ? 'Bajo impacto: candidatos a liquidar o comprar menos.' : 'Poca plata invertida.'}
                </p>
              </button>
            ))}
          </div>

          <Panel title="Diagrama de Pareto">
            <ParetoChart items={data.items} format={fmt} />
          </Panel>

          <Panel title="Lectura rápida">
            <ul className="space-y-2.5 text-[14px]">
              <li className="flex gap-2.5">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#c08a17]" />
                <span>
                  <strong>{data.summary.A.count} de {data.productCount} productos ({pctA}%)</strong> explican el{' '}
                  {(data.summary.A.share * 100).toFixed(0)}% {metric === 'revenue' ? 'de la facturación' : metric === 'units' ? 'de las unidades vendidas' : 'del capital en stock'}
                  {timeBased ? ` de los últimos ${data.days} días` : ''}.
                  {pctA > 35 && timeBased && ' La concentración es baja: las ventas están repartidas entre muchos productos.'}
                </span>
              </li>
              {timeBased && aAtRisk.length > 0 && (
                <li className="flex gap-2.5">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-plumon" />
                  <span>
                    <strong>{aAtRisk.length} producto(s) clase A están en stock bajo o agotados:</strong>{' '}
                    {aAtRisk.slice(0, 4).map((i) => i.name).join(', ')}{aAtRisk.length > 4 ? '…' : ''}. Son los que más pesan: conviene reponer primero.{' '}
                    <Link href="/admin/alertas" className="font-medium text-gondola underline">Ver alertas</Link>
                  </span>
                </li>
              )}
              {timeBased && data.withoutMovement > 0 && (
                <li className="flex gap-2.5">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-gris" />
                  <span><strong>{data.withoutMovement} producto(s) no se vendieron</strong> en el período. Revisá si conviene ponerlos en promoción o dejar de comprarlos.</span>
                </li>
              )}
              {timeBased && suggestions.length > 0 && (
                <li className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="flex gap-2.5">
                    <Wand2 className="mt-0.5 size-4 shrink-0 text-gondola" />
                    <span><strong>{suggestions.length} producto(s) A</strong> tienen un stock mínimo menor a lo que se vende en una semana.</span>
                  </span>
                  {can('catalog:write') && (
                    <Button size="sm" variant="primary" onClick={applySuggestions} className="sm:ml-auto">Aplicar mínimos sugeridos</Button>
                  )}
                </li>
              )}
            </ul>
          </Panel>

          <Panel
            title={filter === 'all' ? 'Todos los productos' : `Clase ${filter}`}
            padded={false}
            actions={filter !== 'all' ? <Button size="sm" variant="ghost" onClick={() => setFilter('all')}>Ver todos</Button> : null}
          >
            <Table>
              <thead>
                <tr>
                  <Th className="w-10">#</Th>
                  <Th>Producto</Th>
                  <Th className="text-right">{METRICS.find((m) => m.value === metric)?.label}</Th>
                  <Th className="text-right">Particip.</Th>
                  <Th className="text-right">Acumulado</Th>
                  <Th>Clase</Th>
                  <Th className="text-right">Stock</Th>
                  {timeBased && <Th className="text-right">Mín. sugerido</Th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <Td className="text-gris">{data.items.indexOf(it) + 1}</Td>
                    <Td>
                      <Link href={`/admin/productos?ver=${it.id}`} className="font-medium hover:underline">{it.name}</Link>
                      <span className="block text-[12.5px] text-gris">{it.category}</span>
                    </Td>
                    <Td className="text-right font-medium">{fmt(it.value)}</Td>
                    <Td className="text-right text-gris">{(it.share * 100).toFixed(1)}%</Td>
                    <Td className="text-right">{(it.cumulative * 100).toFixed(1)}%</Td>
                    <Td><Badge tone={CLASS_TONE[it.abc]}>{it.abc}</Badge></Td>
                    <Td className={`text-right ${it.stock <= it.minStock ? 'text-plumon' : ''}`}>{formatQty(it.stock)} <span className="text-[12px] text-gris">{UNIT_SHORT[it.unit]}</span></Td>
                    {timeBased && <Td className="text-right">{it.suggestedMinStock !== null ? <span className="font-medium text-gondola">{it.suggestedMinStock}</span> : <span className="text-gris">—</span>}</Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </div>
      ) : data ? (
        <Panel>
          <EmptyState
            title={timeBased ? 'No hay ventas registradas en el período' : 'No hay stock valorizado'}
            description={timeBased ? 'El análisis usa las salidas de stock. Registrá ventas en Movimientos o elegí un período más largo.' : 'Cargá costos y stock en los productos.'}
          />
        </Panel>
      ) : null}
    </>
  );
}

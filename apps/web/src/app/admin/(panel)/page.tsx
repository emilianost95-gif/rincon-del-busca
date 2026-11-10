'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ArrowDownToLine, PackageX, Plus } from 'lucide-react';
import { formatMoney, formatQty, MOVEMENT_LABELS, UNIT_SHORT, type DashboardDTO } from '@rincon/shared';
import { fmtRelative, useResource } from '@/lib/client';
import { Badge, Button, EmptyState, ErrorBox, PageHeader, Panel, Skeleton } from '@/components/admin/ui';
import { BarList, MovementsChart } from '@/components/admin/charts';
import { MovementModal, type MovementTarget } from '@/components/admin/MovementModal';
import { Can, useSession } from '@/components/admin/session';

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' | 'amber' }) {
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-linea">
      <p className="text-[13px] text-gris">{label}</p>
      <p className={`tnum mt-1.5 text-[26px] leading-none font-bold tracking-tight ${tone === 'red' ? 'text-plumon' : tone === 'amber' ? 'text-[#9a6a0b]' : ''}`}>{value}</p>
      {sub && <p className="mt-1.5 text-[12.5px] text-gris">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user, currency } = useSession();
  const { data, error, loading, reload } = useResource<DashboardDTO>('/admin/dashboard');
  const [move, setMove] = useState<{ product: MovementTarget | null } | null>(null);
  const money = (n: number) => formatMoney(n, currency);

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name.split(' ')[0]}`}
        description="Estado del inventario calculado en tiempo real a partir de los movimientos registrados."
        actions={
          <Can perm="stock:write">
            <Button variant="primary" onClick={() => setMove({ product: null })}>
              <Plus className="size-4" /> Registrar movimiento
            </Button>
          </Can>
        }
      />

      {error && <ErrorBox message={error.message} onRetry={reload} />}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
          <Skeleton className="h-72 sm:col-span-2 lg:col-span-3" />
          <Skeleton className="h-72" />
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Productos activos" value={String(data.totals.products)} sub={`${data.totals.published} publicados en la web`} />
            <Kpi label="Inventario a costo" value={money(data.totals.inventoryCost)} sub={`${money(data.totals.inventoryRetail)} a precio de venta`} />
            <Kpi label="Stock bajo" value={String(data.totals.lowStock)} sub="En o debajo del mínimo" tone={data.totals.lowStock ? 'amber' : undefined} />
            <Kpi label="Agotados" value={String(data.totals.outOfStock)} sub={`${data.activePromotions} promociones vigentes`} tone={data.totals.outOfStock ? 'red' : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Entradas y salidas" className="lg:col-span-2">
              <MovementsChart data={data.movementsByDay} />
            </Panel>
            <Panel title="Valor por categoría" actions={<span className="text-[12px] text-gris">a precio de venta</span>}>
              {data.topCategories.length ? (
                <BarList items={data.topCategories.map((c) => ({ label: c.name, value: c.retail, color: c.color, hint: `· ${c.products}` }))} format={money} />
              ) : (
                <EmptyState title="Sin datos todavía" description="Cargá productos con stock para ver la distribución." />
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Necesitan reposición"
              padded={false}
              actions={<Link href="/admin/alertas" className="text-[13px] font-medium text-gondola hover:underline">Ver todas</Link>}
            >
              {data.alerts.length ? (
                <ul className="divide-y divide-linea">
                  {data.alerts.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      {a.stock <= 0 ? <PackageX className="size-4 shrink-0 text-plumon" /> : <AlertTriangle className="size-4 shrink-0 text-[#c08a17]" />}
                      <Link href={`/admin/productos?ver=${a.id}`} className="min-w-0 flex-1 truncate text-[14px] hover:underline">{a.name}</Link>
                      <span className="tnum text-[13px] text-gris">
                        {formatQty(a.stock)} / mín. {formatQty(a.minStock)} {UNIT_SHORT[a.unit]}
                      </span>
                      <Can perm="stock:write">
                        <Button size="sm" onClick={() => setMove({ product: a })} aria-label={`Registrar entrada de ${a.name}`}>
                          <ArrowDownToLine className="size-3.5" /> Entrada
                        </Button>
                      </Can>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Todo en orden" description="Ningún producto está por debajo de su stock mínimo." />
              )}
            </Panel>

            <Panel
              title="Últimos movimientos"
              padded={false}
              actions={<Link href="/admin/inventario" className="text-[13px] font-medium text-gondola hover:underline">Historial</Link>}
            >
              {data.recentMovements.length ? (
                <ul className="divide-y divide-linea">
                  {data.recentMovements.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                      <span className={`tnum w-14 shrink-0 text-right font-semibold ${m.delta >= 0 ? 'text-[#1e6a3f]' : 'text-plumon'}`}>
                        {m.delta > 0 ? '+' : ''}{formatQty(m.delta)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{m.productName}</p>
                        <p className="text-[12.5px] text-gris">{MOVEMENT_LABELS[m.type]} · {m.userName ?? 'Sistema'}</p>
                      </div>
                      <span className="shrink-0 text-[12.5px] text-gris">{fmtRelative(m.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Sin movimientos" description="Cuando registres entradas o salidas van a aparecer acá." />
              )}
            </Panel>
          </div>

          {data.topOutProducts.length > 0 && (
            <Panel
              title="Más vendidos en los últimos 30 días"
              actions={<Can perm="reports:read"><Link href="/admin/pareto" className="text-[13px] font-medium text-gondola hover:underline">Análisis ABC</Link></Can>}
            >
              <BarList items={data.topOutProducts.map((p) => ({ label: p.name, value: p.quantity }))} format={(n) => `${formatQty(n)} un.`} />
            </Panel>
          )}
          {data.totals.products > 0 && <p className="text-[12px] text-gris"><Badge>Nota</Badge> Las ventas se cuentan a partir de las salidas registradas en Movimientos.</p>}
        </div>
      ) : null}

      <MovementModal open={!!move} onClose={() => setMove(null)} onDone={reload} product={move?.product} defaultType="IN" />
    </>
  );
}

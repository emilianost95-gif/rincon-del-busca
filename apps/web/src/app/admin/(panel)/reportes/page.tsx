'use client';

import { Download, FileSpreadsheet } from 'lucide-react';
import { formatMoney, formatQty } from '@rincon/shared';
import { useResource } from '@/lib/client';
import { ErrorBox, PageHeader, Panel, Table, TableSkeleton, Td, Th } from '@/components/admin/ui';
import { BarList } from '@/components/admin/charts';
import { useSession } from '@/components/admin/session';

type Row = { category: string; color: string; products: number; units: number; cost: number; retail: number; low: number; out: number };

const EXPORTS = [
  { href: '/api/admin/reports/export/products.csv', title: 'Catálogo e inventario', text: 'Todos los productos con costo, precio, margen, stock y estado.' },
  { href: '/api/admin/reports/export/low-stock.csv', title: 'Lista de reposición', text: 'Agotados y bajo mínimo, con cantidad sugerida y contacto del proveedor.' },
  { href: '/api/admin/reports/export/movements.csv', title: 'Movimientos de stock', text: 'Historial completo de entradas, salidas y ajustes con usuario y nota.' },
];

export default function ReportsPage() {
  const { currency } = useSession();
  const { data, error, loading, reload } = useResource<Row[]>('/admin/reports/inventory');
  const money = (n: number) => formatMoney(n, currency);
  const total = data?.reduce((a, r) => ({ cost: a.cost + r.cost, retail: a.retail + r.retail, products: a.products + r.products }), { cost: 0, retail: 0, products: 0 });

  return (
    <>
      <PageHeader title="Reportes" description="Valorización del inventario por categoría y exportaciones en CSV (se abren directo en Excel o Google Sheets)." />
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {EXPORTS.map((e) => (
            <a key={e.href} href={e.href} className="group flex gap-3 rounded-lg bg-white p-4 ring-1 ring-linea transition-shadow hover:ring-gondola/40">
              <FileSpreadsheet className="size-5 shrink-0 text-gondola" />
              <div className="flex-1">
                <p className="flex items-center justify-between font-medium">{e.title}<Download className="size-4 text-gris group-hover:text-gondola" /></p>
                <p className="mt-1 text-[13px] text-gris">{e.text}</p>
              </div>
            </a>
          ))}
        </div>

        {error && <ErrorBox message={error.message} onRetry={reload} />}
        <Panel title="Inventario valorizado por categoría" padded={false}>
          {loading && !data ? (
            <TableSkeleton rows={5} />
          ) : data && total ? (
            <div className="grid lg:grid-cols-[1fr_320px]">
              <Table>
                <thead>
                  <tr><Th>Categoría</Th><Th className="text-right">Productos</Th><Th className="text-right">Unidades</Th><Th className="text-right">A costo</Th><Th className="text-right">A venta</Th><Th className="text-right">Margen</Th><Th className="text-right">Alertas</Th></tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.category}>
                      <Td><span className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ backgroundColor: r.color }} />{r.category}</Td>
                      <Td className="text-right">{r.products}</Td>
                      <Td className="text-right text-gris">{formatQty(r.units)}</Td>
                      <Td className="text-right">{money(r.cost)}</Td>
                      <Td className="text-right font-medium">{money(r.retail)}</Td>
                      <Td className="text-right text-gris">{r.retail > 0 ? `${(((r.retail - r.cost) / r.retail) * 100).toFixed(0)}%` : '—'}</Td>
                      <Td className="text-right text-[13px]">{r.out > 0 && <span className="text-plumon">{r.out} agot.</span>} {r.low > 0 && <span className="text-[#9a6a0b]">{r.low} bajo</span>}</Td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <Td>Total</Td>
                    <Td className="text-right">{total.products}</Td>
                    <Td />
                    <Td className="text-right">{money(total.cost)}</Td>
                    <Td className="text-right">{money(total.retail)}</Td>
                    <Td className="text-right">{total.retail > 0 ? `${(((total.retail - total.cost) / total.retail) * 100).toFixed(0)}%` : '—'}</Td>
                    <Td />
                  </tr>
                </tbody>
              </Table>
              <div className="border-t border-linea p-4 lg:border-t-0 lg:border-l">
                <p className="mb-3 text-[13px] font-medium text-gris">Participación a precio de venta</p>
                <BarList items={data.map((r) => ({ label: r.category, value: r.retail, color: r.color }))} format={money} />
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}

'use client';

import { useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Download } from 'lucide-react';
import { formatQty, UNIT_SHORT, type Paginated, type ProductDTO } from '@rincon/shared';
import { useResource } from '@/lib/client';
import { Badge, Button, EmptyState, ErrorBox, PageHeader, Panel, Table, TableSkeleton, Td, Th } from '@/components/admin/ui';
import { MovementModal } from '@/components/admin/MovementModal';
import { Can } from '@/components/admin/session';

function AlertTable({ items, onEntry }: { items: ProductDTO[]; onEntry: (p: ProductDTO) => void }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Producto</Th>
          <Th>Proveedor</Th>
          <Th className="text-right">Stock</Th>
          <Th className="text-right">Mínimo</Th>
          <Th className="text-right">Sugerido reponer</Th>
          <Th className="w-0"><span className="sr-only">Acción</span></Th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.id}>
            <Td className="font-medium">{p.name}<span className="block text-[12.5px] font-normal text-gris">{p.category?.name ?? 'Sin categoría'}</span></Td>
            <Td className="text-gris">{p.supplier?.name ?? '—'}</Td>
            <Td className="text-right">{formatQty(p.stock)} {UNIT_SHORT[p.unit]}</Td>
            <Td className="text-right text-gris">{formatQty(p.minStock)}</Td>
            <Td className="text-right font-medium">{formatQty(Math.max(0, p.minStock * 2 - p.stock))}</Td>
            <Td>
              <Can perm="stock:write">
                <Button size="sm" onClick={() => onEntry(p)}><ArrowDownToLine className="size-3.5" /> Registrar entrada</Button>
              </Can>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function AlertsPage() {
  const out = useResource<Paginated<ProductDTO>>('/admin/products?stock=out&pageSize=100&sort=name');
  const low = useResource<Paginated<ProductDTO>>('/admin/products?stock=low&pageSize=100&sort=stock');
  const [target, setTarget] = useState<ProductDTO | null>(null);
  const reload = () => {
    out.reload();
    low.reload();
  };
  const loading = (out.loading && !out.data) || (low.loading && !low.data);
  const empty = !loading && !out.data?.items.length && !low.data?.items.length;

  return (
    <>
      <PageHeader
        title="Alertas de stock"
        description="Productos agotados o en su stock mínimo. Lo sugerido a reponer lleva el stock al doble del mínimo."
        actions={
          <Can perm="reports:read">
            <a href="/api/admin/reports/export/low-stock.xlsx" className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3.5 text-[14px] font-medium ring-1 ring-linea hover:ring-gondola/40">
              <Download className="size-4" /> Lista de reposición (Excel)
            </a>
          </Can>
        }
      />
      {(out.error || low.error) && <ErrorBox message={(out.error ?? low.error)!.message} onRetry={reload} />}
      {loading ? (
        <Panel padded={false}><TableSkeleton /></Panel>
      ) : empty ? (
        <Panel><EmptyState icon={CheckCircle2} title="Todo en orden" description="No hay productos agotados ni debajo del mínimo." /></Panel>
      ) : (
        <div className="space-y-4">
          {!!out.data?.items.length && (
            <Panel title="Agotados" actions={<Badge tone="red">{out.data.items.length}</Badge>} padded={false}>
              <AlertTable items={out.data.items} onEntry={setTarget} />
            </Panel>
          )}
          {!!low.data?.items.length && (
            <Panel title="Stock bajo" actions={<Badge tone="amber">{low.data.items.length}</Badge>} padded={false}>
              <AlertTable items={low.data.items} onEntry={setTarget} />
            </Panel>
          )}
        </div>
      )}
      <MovementModal open={!!target} onClose={() => setTarget(null)} onDone={reload} product={target} defaultType="IN" />
    </>
  );
}

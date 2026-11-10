'use client';

import { useEffect, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { formatMoney, formatQty, MOVEMENT_LABELS, MOVEMENT_TYPES, type MovementDTO, type Paginated } from '@rincon/shared';
import { fmtDateTime, useResource } from '@/lib/client';
import { Badge, Button, EmptyState, ErrorBox, Input, PageHeader, Pagination, Panel, Select, Table, TableSkeleton, Td, Th } from '@/components/admin/ui';
import { MovementModal } from '@/components/admin/MovementModal';
import { Can, useSession } from '@/components/admin/session';

const tone = { IN: 'green', RETURN: 'green', INITIAL: 'blue', OUT: 'neutral', LOSS: 'red', ADJUST: 'amber' } as const;

export default function InventoryPage() {
  const { currency } = useSession();
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  useEffect(() => setPage(1), [type, from, to]);

  const qs = new URLSearchParams({ page: String(page), pageSize: '30' });
  if (type) qs.set('type', type);
  if (from) qs.set('from', new Date(`${from}T00:00:00`).toISOString());
  if (to) qs.set('to', new Date(`${to}T23:59:59`).toISOString());
  const list = useResource<Paginated<MovementDTO>>(`/admin/movements?${qs}`);

  const exportQs = new URLSearchParams();
  if (from) exportQs.set('from', new Date(`${from}T00:00:00`).toISOString());
  if (to) exportQs.set('to', new Date(`${to}T23:59:59`).toISOString());

  return (
    <>
      <PageHeader
        title="Movimientos de stock"
        description="Historial completo de entradas, salidas y ajustes. El stock de cada producto es la suma de estos movimientos."
        actions={
          <>
            <Can perm="reports:read">
              <a href={`/api/admin/reports/export/movements.csv?${exportQs}`} className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3.5 text-[14px] font-medium ring-1 ring-linea hover:ring-gondola/40">
                <Download className="size-4" /> Exportar CSV
              </a>
            </Can>
            <Can perm="stock:write">
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Registrar movimiento
              </Button>
            </Can>
          </>
        }
      />
      <Panel padded={false}>
        <div className="grid gap-2 border-b border-linea p-3 sm:grid-cols-3">
          <Select aria-label="Tipo" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos los tipos</option>
            {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-[13px] text-gris">
            Desde <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-gris">
            Hasta <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {list.error ? (
          <div className="p-4"><ErrorBox message={list.error.message} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <TableSkeleton />
        ) : !list.data?.items.length ? (
          <EmptyState title="Sin movimientos para estos filtros" description="Registrá una entrada o salida, o ampliá el rango de fechas." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Producto</Th>
                  <Th>Tipo</Th>
                  <Th className="text-right">Variación</Th>
                  <Th className="text-right">Stock</Th>
                  <Th>Detalle</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((m) => (
                  <tr key={m.id}>
                    <Td className="whitespace-nowrap text-gris">{fmtDateTime(m.createdAt)}</Td>
                    <Td className="font-medium">{m.productName}</Td>
                    <Td><Badge tone={tone[m.type]}>{MOVEMENT_LABELS[m.type]}</Badge></Td>
                    <Td className={`text-right font-semibold ${m.delta >= 0 ? 'text-[#1e6a3f]' : 'text-plumon'}`}>
                      {m.delta > 0 ? '+' : ''}{formatQty(m.delta)}
                    </Td>
                    <Td className="text-right text-gris">{formatQty(m.previousStock)} → <span className="text-tinta">{formatQty(m.resultingStock)}</span></Td>
                    <Td className="text-[13px] text-gris">
                      {[m.userName, m.supplierName, m.unitCost != null ? `${formatMoney(m.unitCost, currency)} c/u` : null, m.note].filter(Boolean).join(' · ')}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Panel>
      <MovementModal open={open} onClose={() => setOpen(false)} onDone={list.reload} />
    </>
  );
}

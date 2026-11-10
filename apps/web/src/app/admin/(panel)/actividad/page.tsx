'use client';

import { useState } from 'react';
import type { AuditDTO, Paginated } from '@rincon/shared';
import { fmtDateTime, useResource } from '@/lib/client';
import { EmptyState, ErrorBox, PageHeader, Pagination, Panel, TableSkeleton } from '@/components/admin/ui';

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<Paginated<AuditDTO>>(`/admin/audit?page=${page}&pageSize=40`);
  return (
    <>
      <PageHeader title="Actividad" description="Registro de quién hizo qué y cuándo: altas, cambios de precio, movimientos, usuarios y configuración." />
      <Panel padded={false}>
        {error ? (
          <div className="p-4"><ErrorBox message={error.message} onRetry={reload} /></div>
        ) : loading && !data ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState title="Sin actividad registrada" />
        ) : (
          <>
            <ol className="divide-y divide-linea">
              {data.items.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-40 shrink-0 text-[12.5px] text-gris tnum">{fmtDateTime(a.createdAt)}</span>
                  <span className="flex-1 text-[14px]">{a.summary}</span>
                  <span className="text-[13px] font-medium text-gris">{a.userName ?? 'Sistema'}</span>
                </li>
              ))}
            </ol>
            <Pagination page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}

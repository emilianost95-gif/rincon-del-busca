'use client';

import { useEffect, useState } from 'react';
import { openStatus, type BusinessHours } from '@rincon/shared';

/** Se calcula en el navegador para usar la hora real de quien mira. */
export function OpenStatus({ hours }: { hours: BusinessHours }) {
  const [status, setStatus] = useState<ReturnType<typeof openStatus> | null>(null);
  useEffect(() => {
    const tick = () => setStatus(openStatus(hours, new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [hours]);

  if (!status) return <span className="inline-block h-7" aria-hidden />;
  const color = status.state === 'open' ? 'bg-[#2f8f5b]' : status.state === 'closed' ? 'bg-plumon' : 'bg-gris';
  return (
    <span className="inline-flex items-center gap-2 bg-white px-3 py-1.5 text-[14px] font-semibold ring-1 ring-linea" role="status">
      <span className={`size-2.5 rounded-full ${color}`} aria-hidden />
      {status.label}
    </span>
  );
}

export function TodayHighlight({ day, children }: { day: number; children: React.ReactNode }) {
  const [today, setToday] = useState<number | null>(null);
  useEffect(() => setToday(new Date().getDay()), []);
  return (
    <tr className={today === day ? 'bg-cartel/45 font-semibold' : ''} aria-current={today === day ? 'date' : undefined}>
      {children}
    </tr>
  );
}

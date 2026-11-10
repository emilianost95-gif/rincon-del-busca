'use client';

import { useState } from 'react';
import { formatQty } from '@rincon/shared';

/**
 * Gráficos livianos en SVG: sin librería de charts (ahorra ~100 KB en el panel).
 */
export function MovementsChart({ data }: { data: { date: string; inQty: number; outQty: number; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.inQty, d.outQty)));
  const W = 640;
  const H = 180;
  const slot = W / data.length;
  const bw = Math.min(14, slot / 3);
  const fmtDay = (s: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(s));
  const active = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[12.5px] text-gris">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-gondola" /> Entradas</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#d9a441]" /> Salidas</span>
        <span className="ml-auto min-h-5 text-tinta" aria-live="polite">
          {active ? `${fmtDay(active.date)}: +${formatQty(active.inQty)} / −${formatQty(active.outQty)} (${active.count} mov.)` : 'Unidades por día, últimos 14 días'}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label="Entradas y salidas de stock por día en los últimos 14 días">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={H - H * f} y2={H - H * f} stroke="#ecede7" />
        ))}
        {data.map((d, i) => {
          const x = i * slot + slot / 2;
          const hIn = (d.inQty / max) * (H - 8);
          const hOut = (d.outQty / max) * (H - 8);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * slot} y="0" width={slot} height={H} fill={hover === i ? '#f3f4ee' : 'transparent'} />
              <rect x={x - bw - 1} y={H - hIn} width={bw} height={hIn} rx="2" fill="#163828" />
              <rect x={x + 1} y={H - hOut} width={bw} height={hOut} rx="2" fill="#d9a441" />
              {(i % 2 === 0 || data.length <= 7) && (
                <text x={x} y={H + 16} textAnchor="middle" fontSize="11" fill="#5d625b">
                  {fmtDay(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Movimientos por día</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>Entradas {d.inQty}</td>
              <td>Salidas {d.outQty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BarList({ items, format }: { items: { label: string; value: number; color?: string; hint?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex justify-between gap-3 text-[13.5px]">
            <span className="truncate font-medium">{i.label}</span>
            <span className="tnum shrink-0 text-gris">
              {format(i.value)}
              {i.hint && <span className="ml-1.5 text-[12px]">{i.hint}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#eeefe9]">
            <div className="h-2 rounded-full" style={{ width: `${(i.value / max) * 100}%`, backgroundColor: i.color ?? '#163828' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

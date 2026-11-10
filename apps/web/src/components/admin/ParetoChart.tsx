'use client';

import { useState } from 'react';
import type { ParetoItem } from '@rincon/shared';

const CLASS_COLOR = { A: '#163828', B: '#d9a441', C: '#c9cbc2' } as const;

/**
 * Diagrama de Pareto: barras ordenadas de mayor a menor (color por clase ABC)
 * y la curva del porcentaje acumulado sobre un segundo eje, con la línea del 80 %.
 */
export function ParetoChart({ items, format, max = 40 }: { items: ParetoItem[]; format: (n: number) => string; max?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = items.filter((i) => i.value > 0).slice(0, max);
  if (!shown.length) return null;

  const W = 760;
  const H = 260;
  const padL = 8;
  const padR = 38;
  const padB = 8;
  const plotW = W - padL - padR;
  const plotH = H - padB - 10;
  const slot = plotW / shown.length;
  const bw = Math.max(3, Math.min(22, slot * 0.72));
  const maxV = shown[0]!.value;
  const y = (v: number) => 10 + plotH - (v / maxV) * plotH;
  const yPct = (p: number) => 10 + plotH - p * plotH;
  const x = (i: number) => padL + i * slot + slot / 2;
  const line = shown.map((it, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yPct(it.cumulative).toFixed(1)}`).join(' ');
  const cut80 = shown.findIndex((it) => it.cumulative >= 0.8);
  const active = hover !== null ? shown[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-gris">
        {(['A', 'B', 'C'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLOR[k] }} /> Clase {k}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-plumon" /> % acumulado</span>
        <span className="ml-auto min-h-5 text-tinta" aria-live="polite">
          {active
            ? `${active.name}: ${format(active.value)} · ${(active.share * 100).toFixed(1)}% · acumulado ${(active.cumulative * 100).toFixed(1)}%`
            : items.length > shown.length
              ? `Se muestran los ${shown.length} principales de ${items.length}`
              : 'Pasá el cursor por una barra para ver el detalle'}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Diagrama de Pareto: productos ordenados por valor con la curva del porcentaje acumulado">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={yPct(f)} y2={yPct(f)} stroke="#ecede7" />
            {f !== 0.75 && <text x={W - padR + 6} y={yPct(f) + 4} fontSize="11" fill="#5d625b">{f * 100}%</text>}
          </g>
        ))}
        {/* Umbral del 80 % */}
        <line x1={padL} x2={W - padR} y1={yPct(0.8)} y2={yPct(0.8)} stroke="#d2302a" strokeDasharray="5 4" strokeWidth="1" opacity="0.7" />
        <text x={W - padR + 6} y={yPct(0.8) + 4} fontSize="11" fontWeight="600" fill="#d2302a">80%</text>
        {cut80 >= 0 && (
          <line x1={x(cut80) + slot / 2} x2={x(cut80) + slot / 2} y1={10} y2={10 + plotH} stroke="#d2302a" strokeDasharray="2 4" opacity="0.5" />
        )}
        {shown.map((it, i) => (
          <g key={it.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={padL + i * slot} y={10} width={slot} height={plotH} fill={hover === i ? '#f3f4ee' : 'transparent'} />
            <rect x={x(i) - bw / 2} y={y(it.value)} width={bw} height={10 + plotH - y(it.value)} rx="2" fill={CLASS_COLOR[it.abc]} />
          </g>
        ))}
        <path d={line} fill="none" stroke="#d2302a" strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />
        {shown.map((it, i) => (
          <circle key={it.id} cx={x(i)} cy={yPct(it.cumulative)} r={hover === i ? 4 : 2.2} fill="#d2302a" pointerEvents="none" />
        ))}
      </svg>
    </div>
  );
}

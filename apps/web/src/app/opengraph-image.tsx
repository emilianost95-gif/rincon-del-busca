import { ImageResponse } from 'next/og';

export const alt = 'El Rincón del Busca — Bazar, limpieza, almacén y hogar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  const rubros = [
    ['Almacén', '#A4532E'],
    ['Limpieza', '#3E6A8A'],
    ['Bazar', '#C99A2E'],
    ['Hogar', '#5E7B4F'],
  ];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#163828', padding: 64, color: '#FBFBF8' }}>
        <div style={{ fontSize: 34, fontWeight: 700, display: 'flex' }}>El Rincón del Busca</div>
        <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 0.95, marginTop: 36, letterSpacing: -3, display: 'flex', maxWidth: 980 }}>
          Lo que buscás está en el Rincón.
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 'auto' }}>
          {rubros.map(([name, color]) => (
            <div key={name} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: color, color: '#fff', fontSize: 34, fontWeight: 800, padding: '14px 24px', display: 'flex' }}>{name}</div>
              <div style={{ height: 12, background: '#D9C4A0', display: 'flex' }} />
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

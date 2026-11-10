import localFont from 'next/font/local';

/**
 * Fuentes servidas desde el propio sitio con next/font: se precargan, no
 * dependen de Google Fonts y generan un fallback con métricas ajustadas
 * (evita saltos de diseño mientras cargan). Licencia OFL.
 */
export const archivo = localFont({
  src: './archivo-latin-wdth-normal.woff2',
  variable: '--font-archivo',
  weight: '100 900',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
  adjustFontFallback: 'Arial',
});

export const caveatBrush = localFont({
  src: './caveat-brush-latin-400-normal.woff2',
  variable: '--font-caveat',
  weight: '400',
  display: 'swap',
  preload: false,
});

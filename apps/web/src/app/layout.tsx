import type { Metadata, Viewport } from 'next';
import { archivo, caveatBrush } from '@/fonts';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'El Rincón del Busca — Bazar, limpieza, almacén y hogar',
    template: '%s · El Rincón del Busca',
  },
  description:
    'Comercio de barrio con bazar, artículos de limpieza, mercadería de almacén y cosas para el hogar. Mirá el catálogo con precios y consultá por WhatsApp.',
  applicationName: 'El Rincón del Busca',
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    siteName: 'El Rincón del Busca',
  },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: '#163828',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${archivo.variable} ${caveatBrush.variable}`}>
      <body>{children}</body>
    </html>
  );
}

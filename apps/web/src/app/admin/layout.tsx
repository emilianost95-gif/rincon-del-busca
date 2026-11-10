import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel · El Rincón del Busca' },
  robots: { index: false, follow: false },
};

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="admin min-h-dvh">{children}</div>;
}

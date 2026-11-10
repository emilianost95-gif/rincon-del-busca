import Link from 'next/link';
import { Navbar } from '@/components/site/Navbar';
import { Footer } from '@/components/site/Footer';
import { WhatsAppButton } from '@/components/site/WhatsAppButton';
import { getSettings } from '@/lib/api';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <>
      <a href="#contenido" className="sr-only z-50 bg-cartel px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Saltar al contenido
      </a>
      {settings.demoMode && (
        <div className="bg-cartel text-tinta">
          <p className="mx-auto max-w-7xl px-5 py-2 text-[13px] font-medium lg:px-8">
            Versión de demostración: los productos, precios y promociones son ejemplos y todavía no corresponden al local.
          </p>
        </div>
      )}
      <Navbar whatsapp={settings.whatsapp} />
      <main id="contenido" className="on-light">{children}</main>
      <Footer settings={settings} />

      {/* Barra fija en el celular: las dos acciones que más importan, siempre a mano. */}
      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-black/10 bg-etiqueta/95 p-2 backdrop-blur pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
        <Link href="/catalogo" className="inline-flex min-h-12 items-center justify-center text-[15px] font-semibold text-gondola w-semi">
          Catálogo
        </Link>
        <WhatsAppButton number={settings.whatsapp} label="WhatsApp" variant="solid-dark" className="!text-[14px]" message="Hola, quería hacer una consulta." />
      </div>
    </>
  );
}

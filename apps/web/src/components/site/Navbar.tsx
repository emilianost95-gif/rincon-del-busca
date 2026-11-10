'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { whatsappLink } from '@rincon/shared';
import { WhatsAppGlyph } from './icons';

const LINKS = [
  { href: '/catalogo', label: 'Catálogo' },
  { href: '/#rubros', label: 'Rubros' },
  { href: '/#promociones', label: 'Promociones' },
  { href: '/#ubicacion', label: 'Ubicación y horarios' },
];

export function Wordmark({ light = true }: { light?: boolean }) {
  return (
    <span className={`flex items-baseline gap-1.5 leading-none ${light ? 'text-etiqueta' : 'text-gondola'}`}>
      <span className="text-[13px] font-medium w-semi">El</span>
      <span className="text-[22px] font-extrabold tracking-tight w-cond">Rincón del Busca</span>
    </span>
  );
}

export function Navbar({ whatsapp }: { whatsapp: string | null }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const wa = whatsappLink(whatsapp, 'Hola, quería hacer una consulta.');

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-40 bg-gondola transition-shadow ${scrolled ? 'shadow-[0_1px_0_rgba(255,255,255,.08),0_8px_24px_-12px_rgba(0,0,0,.5)]' : ''}`}
    >
      <nav aria-label="Principal" className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 lg:px-8">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        <ul className="ml-auto hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`inline-flex min-h-10 items-center text-[15px] font-medium text-etiqueta/80 transition-colors hover:text-cartel ${pathname === l.href ? 'text-cartel' : ''}`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto hidden h-10 items-center gap-2 bg-cartel px-4 text-[14px] font-semibold text-tinta w-semi hover:bg-[#f7e968] sm:inline-flex lg:ml-0"
          >
            <WhatsAppGlyph className="size-4" /> WhatsApp
          </a>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="menu-movil"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          className={`grid size-11 place-items-center text-etiqueta lg:hidden ${wa ? '' : 'ml-auto'}`}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </nav>

      {open && (
        <div id="menu-movil" className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-gondola-deep px-5 pt-6 pb-10 lg:hidden">
          <ul className="flex flex-col">
            {LINKS.map((l) => (
              <li key={l.href} className="border-b border-white/10">
                <Link href={l.href} className="block py-5 text-[32px] font-extrabold text-etiqueta w-cond">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}

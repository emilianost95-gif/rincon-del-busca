import Link from 'next/link';
import type { PublicSettingsDTO } from '@rincon/shared';
import { Wordmark } from './Navbar';

export function Footer({ settings }: { settings: PublicSettingsDTO }) {
  const year = new Date().getFullYear();
  const instagram = settings.instagram?.replace(/^@/, '');
  return (
    <footer className="bg-gondola-deep pb-24 text-etiqueta/80 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div className="sm:col-span-2 lg:col-span-1">
          <Wordmark />
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed">
            {settings.tagline ?? 'Bazar, limpieza, almacén y hogar en un comercio de barrio.'}
          </p>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-etiqueta">El local</h2>
          <address className="mt-3 text-[15px] leading-relaxed not-italic">
            {settings.address ? (
              <>
                {settings.address}
                {settings.city && <br />}
                {settings.city}
              </>
            ) : (
              <span className="text-etiqueta/50">Dirección pendiente de confirmar</span>
            )}
          </address>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-etiqueta">Contacto</h2>
          <ul className="mt-3 space-y-1.5 text-[15px]">
            {settings.phone && (
              <li>
                <a className="hover:text-cartel" href={`tel:${settings.phone.replace(/\s/g, '')}`}>{settings.phone}</a>
              </li>
            )}
            {settings.email && (
              <li>
                <a className="hover:text-cartel" href={`mailto:${settings.email}`}>{settings.email}</a>
              </li>
            )}
            {instagram && (
              <li>
                <a className="hover:text-cartel" href={`https://instagram.com/${instagram}`} target="_blank" rel="noopener noreferrer">
                  Instagram @{instagram}
                </a>
              </li>
            )}
            {!settings.phone && !settings.email && !instagram && (
              <li className="text-etiqueta/50">Datos de contacto pendientes</li>
            )}
          </ul>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-etiqueta">Navegar</h2>
          <ul className="mt-3 space-y-1.5 text-[15px]">
            <li><Link className="hover:text-cartel" href="/catalogo">Catálogo completo</Link></li>
            <li><Link className="hover:text-cartel" href="/#promociones">Promociones</Link></li>
            <li><Link className="hover:text-cartel" href="/#ubicacion">Ubicación y horarios</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-[13px] text-etiqueta/55 sm:flex-row sm:justify-between lg:px-8">
          <p>© {year} {settings.businessName}</p>
          <Link href="/admin" className="hover:text-etiqueta">Acceso del personal</Link>
        </div>
      </div>
    </footer>
  );
}

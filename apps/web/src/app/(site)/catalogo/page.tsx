import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { textOn } from '@rincon/shared';
import { ProductLabel } from '@/components/site/ProductLabel';
import { WhatsAppButton } from '@/components/site/WhatsAppButton';
import { AutoSubmitSelect } from '@/components/site/AutoSubmitSelect';
import { getCategories, getProducts, getSettings } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Catálogo de productos',
  description: 'Buscá productos de almacén, limpieza, bazar y hogar, con precios y disponibilidad. Consultá por WhatsApp.',
  alternates: { canonical: '/catalogo' },
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const SORTS = [
  { value: 'featured', label: 'Destacados primero' },
  { value: 'name', label: 'Nombre (A–Z)' },
  { value: 'price_asc', label: 'Menor precio' },
  { value: 'price_desc', label: 'Mayor precio' },
];

export default async function CatalogPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 80);
  const categoria = one(sp.categoria);
  const sort = SORTS.some((s) => s.value === one(sp.orden)) ? one(sp.orden) : 'featured';
  const page = Math.max(1, Number(one(sp.pagina)) || 1);

  const params = new URLSearchParams({ sort, page: String(page), pageSize: '24' });
  if (q) params.set('q', q);
  if (categoria) params.set('category', categoria);

  const [settings, categories, result] = await Promise.all([getSettings(), getCategories(), getProducts(params)]);
  const active = categories.find((c) => c.slug === categoria);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { q, categoria, orden: sort === 'featured' ? '' : sort, pagina: '', ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/catalogo?${s}` : '/catalogo';
  };

  return (
    <div className="mx-auto max-w-7xl px-5 pt-10 pb-24 lg:px-8 lg:pt-14">
      <h1 className="text-[clamp(2.6rem,7vw,4.6rem)] leading-[0.9] font-black text-gondola w-cond">
        {active ? active.name : 'Catálogo'}
      </h1>
      <p className="mt-3 max-w-[60ch] text-[17px] text-gris">
        {active?.description ?? 'Todo lo que hay en el Rincón, con precio y disponibilidad. Si no encontrás algo, preguntá.'}
      </p>

      <form role="search" action="/catalogo" method="get" className="mt-8 flex flex-col gap-3 sm:flex-row">
        {categoria && <input type="hidden" name="categoria" value={categoria} />}
        <label className="relative flex-1">
          <span className="sr-only">Buscar productos</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-gris" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscá por nombre: detergente, arroz, vasos…"
            autoComplete="off"
            className="h-13 w-full bg-white pr-4 pl-12 text-[16px] ring-1 ring-linea outline-none placeholder:text-gris/80 focus:ring-2 focus:ring-gondola"
          />
        </label>
        <AutoSubmitSelect name="orden" defaultValue={sort} options={SORTS} label="Ordenar" />
        <button type="submit" className="h-13 bg-gondola px-6 text-[15px] font-semibold text-etiqueta w-semi hover:bg-gondola-soft">
          Buscar
        </button>
      </form>

      <nav aria-label="Filtrar por rubro" className="no-scrollbar -mx-5 mt-5 overflow-x-auto px-5">
        <ul className="flex gap-2">
          <li>
            <Link
              href={href({ categoria: null })}
              aria-current={!categoria ? 'page' : undefined}
              className={`inline-flex h-10 items-center px-4 text-[14px] font-semibold whitespace-nowrap ring-1 ${!categoria ? 'bg-gondola text-etiqueta ring-gondola' : 'bg-white ring-linea hover:ring-gondola'}`}
            >
              Todos
            </Link>
          </li>
          {categories.map((c) => {
            const on = c.slug === categoria;
            return (
              <li key={c.id}>
                <Link
                  href={href({ categoria: c.slug })}
                  aria-current={on ? 'page' : undefined}
                  className={`inline-flex h-10 items-center gap-2 px-4 text-[14px] font-semibold whitespace-nowrap ring-1 ${on ? '' : 'bg-white ring-linea hover:ring-gondola'}`}
                  style={on ? { backgroundColor: c.color, color: textOn(c.color), boxShadow: `inset 0 0 0 1px ${c.color}` } : undefined}
                >
                  {!on && <span className="size-2.5" style={{ backgroundColor: c.color }} aria-hidden />}
                  {c.name}
                  <span className={`tnum text-[12px] ${on ? 'opacity-80' : 'text-gris'}`}>{c.productCount}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="mt-8 text-[14px] text-gris" aria-live="polite">
        {result.total === 0
          ? 'Sin resultados'
          : `${result.total} ${result.total === 1 ? 'producto' : 'productos'}${q ? ` para “${q}”` : ''}`}
      </p>

      <h2 className="sr-only">Resultados</h2>
      {result.items.length ? (
        <ul className="mt-4 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.items.map((p) => (
            <li key={p.id}>
              <ProductLabel product={p} currency={settings.currency} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 border border-dashed border-linea bg-white p-8 sm:p-10">
          <p className="text-[24px] font-bold text-gondola w-semi">No encontramos {q ? `“${q}”` : 'productos en este rubro'}.</p>
          <p className="mt-2 max-w-[56ch] text-[16px] text-gris">
            Puede que lo tengamos y todavía no esté cargado en la web. Probá con otra palabra o preguntá directamente.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <WhatsAppButton
              number={settings.whatsapp}
              variant="solid-dark"
              label="Preguntar si lo tienen"
              message={q ? `Hola, ¿tienen ${q}?` : 'Hola, quería hacer una consulta.'}
            />
            {(q || categoria) && (
              <Link href="/catalogo" className="inline-flex min-h-12 items-center text-[15px] font-semibold text-gondola underline underline-offset-4">
                Ver todo el catálogo
              </Link>
            )}
          </div>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Páginas" className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={href({ pagina: String(page - 1) })} className="inline-flex h-11 items-center px-4 font-semibold ring-1 ring-linea hover:ring-gondola">
              Anterior
            </Link>
          )}
          <span className="tnum px-3 text-[15px] text-gris">
            Página {page} de {pages}
          </span>
          {page < pages && (
            <Link href={href({ pagina: String(page + 1) })} className="inline-flex h-11 items-center px-4 font-semibold ring-1 ring-linea hover:ring-gondola">
              Siguiente
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

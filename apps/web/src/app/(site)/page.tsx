import Link from 'next/link';
import { Camera, Clock, HandHeart, MapPin, MessageCircle, ReceiptText, Store } from 'lucide-react';
import { DAY_NAMES, formatMoney, type BusinessHours } from '@rincon/shared';
import { Hero, type ShelfItem } from '@/components/site/Hero';
import { ProductLabel } from '@/components/site/ProductLabel';
import { WhatsAppButton } from '@/components/site/WhatsAppButton';
import { CategoryIcon } from '@/components/site/icons';
import { OpenStatus, TodayHighlight } from '@/components/site/OpenStatus';
import { getCategories, getFeatured, getPromotions, getSettings, SITE_URL } from '@/lib/api';

export const revalidate = 60;

/** Rubros que el comercio declaró. Se usan sólo si la API todavía no respondió. */
const FALLBACK_RUBROS: ShelfItem[] = [
  { name: 'Almacén', slug: null, color: '#A4532E', icon: 'wheat', count: null },
  { name: 'Limpieza', slug: null, color: '#3E6A8A', icon: 'spray-can', count: null },
  { name: 'Bazar', slug: null, color: '#C99A2E', icon: 'cooking-pot', count: null },
  { name: 'Hogar', slug: null, color: '#5E7B4F', icon: 'lamp', count: null },
];

function toShelves(items: ShelfItem[]): ShelfItem[][] {
  // Dos por estante: los nombres se leen grandes también en el celular.
  const rows: ShelfItem[][] = [];
  for (let i = 0; i < items.length && rows.length < 3; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

export default async function HomePage() {
  const [settings, categories, featured, promotions] = await Promise.all([
    getSettings(),
    getCategories(),
    getFeatured(),
    getPromotions(),
  ]);

  const shelfItems: ShelfItem[] = categories.length
    ? categories.map((c) => ({ name: c.name, slug: c.slug, color: c.color, icon: c.icon, count: c.productCount }))
    : FALLBACK_RUBROS;
  const currency = settings.currency;
  const promosWithProduct = promotions.filter((p) => p.product);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: settings.businessName,
    url: SITE_URL,
    ...(settings.address && {
      address: { '@type': 'PostalAddress', streetAddress: settings.address, addressLocality: settings.city ?? undefined },
    }),
    ...(settings.phone && { telephone: settings.phone }),
    ...(settings.hours.length && {
      openingHoursSpecification: settings.hours
        .filter((h) => !h.closed)
        .flatMap((h) =>
          h.ranges.map((r) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: `https://schema.org/${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][h.day]}`,
            opens: r.open,
            closes: r.close,
          })),
        ),
    }),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Hero
        shelves={toShelves(shelfItems.slice(0, 6))}
        ctaWhatsapp={
          <WhatsAppButton number={settings.whatsapp} variant="outline-light" message="Hola, quería hacer una consulta." />
        }
      />

      {/* Presentación */}
      <section aria-labelledby="presentacion" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-20">
          <div>
            <h2 id="presentacion" className="text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.95] font-extrabold text-gondola w-cond text-balance">
              Un rincón de barrio donde se resuelve lo de todos los días.
            </h2>
            <p className="mt-6 max-w-[60ch] text-[19px] leading-relaxed text-tinta/85 text-pretty">
              {settings.about ??
                'La mercadería del almacén, lo de limpieza, el bazar y esas cosas para la casa que siempre faltan, todo en un mismo lugar. Mirá qué hay en el catálogo, consultá lo que no encontrés y pasá a buscarlo.'}
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-gris">Cómo comprar</h3>
            <ol className="mt-4 divide-y divide-linea border-y border-linea">
              {[
                { icon: ReceiptText, title: 'Mirá el catálogo', text: 'Buscá por nombre o por rubro y revisá los precios publicados.' },
                { icon: MessageCircle, title: 'Consultá por WhatsApp', text: 'Preguntá disponibilidad o pedí lo que no aparece en la lista.' },
                { icon: Store, title: 'Pasá por el local', text: 'Te atendemos en persona, como en todo comercio de barrio.' },
              ].map((step, i) => (
                <li key={step.title} className="flex gap-4 py-5">
                  <span className="tnum w-6 shrink-0 pt-0.5 text-[22px] leading-none font-extrabold text-kraft w-cond">{i + 1}</span>
                  <div>
                    <p className="flex items-center gap-2 text-[17px] font-semibold">
                      <step.icon className="size-4 text-gondola" aria-hidden />
                      {step.title}
                    </p>
                    <p className="mt-1 text-[15px] leading-relaxed text-gris">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Rubros: filas como pasillos */}
      <section id="rubros" aria-labelledby="rubros-title" className="scroll-mt-20 border-t border-linea">
        <div className="mx-auto max-w-7xl px-5 pt-16 lg:px-8">
          <h2 id="rubros-title" className="text-[clamp(2.2rem,5vw,3.6rem)] leading-none font-extrabold text-gondola w-cond">
            Recorré los rubros
          </h2>
        </div>
        <ul className="mx-auto mt-8 max-w-7xl px-5 lg:px-8">
          {shelfItems.map((c) => (
            <li key={c.name} className="border-b border-linea first:border-t">
              <Link
                href={c.slug ? `/catalogo?categoria=${c.slug}` : '/catalogo'}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 py-5 transition-colors hover:bg-kraft-soft/60 sm:gap-6 sm:px-3"
              >
                <span className="grid size-12 place-items-center text-white" style={{ backgroundColor: c.color }}>
                  <CategoryIcon name={c.icon} className="size-6" strokeWidth={2} />
                </span>
                <span>
                  <span className="block text-[clamp(1.8rem,4.4vw,2.8rem)] leading-none font-extrabold w-cond">{c.name}</span>
                  {categories.find((x) => x.name === c.name)?.description && (
                    <span className="mt-1.5 block max-w-[60ch] text-[15px] text-gris">
                      {categories.find((x) => x.name === c.name)?.description}
                    </span>
                  )}
                </span>
                <span className="tnum text-right text-[14px] font-semibold text-gondola">
                  {c.count === null ? 'Ver' : `${c.count} ${c.count === 1 ? 'producto' : 'productos'}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Destacados */}
      <section aria-labelledby="destacados" className="mx-auto max-w-7xl py-20 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 lg:px-8">
          <h2 id="destacados" className="text-[clamp(2.2rem,5vw,3.6rem)] leading-none font-extrabold text-gondola w-cond">
            Destacados del Rincón
          </h2>
          <Link href="/catalogo" className="text-[15px] font-semibold text-gondola underline decoration-2 underline-offset-4 hover:decoration-cartel">
            Ver todo el catálogo
          </Link>
        </div>
        {featured.items.length ? (
          <ul className="no-scrollbar mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4 lg:px-8">
            {featured.items.map((p) => (
              <li key={p.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
                <ProductLabel product={p} currency={currency} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mx-5 mt-8 border border-dashed border-linea p-8 text-gris lg:mx-8">
            Todavía no hay productos destacados. Se eligen desde el panel, marcando “Destacado” en cada producto.
          </p>
        )}
      </section>

      {/* Promociones */}
      <section id="promociones" aria-labelledby="promos-title" className="kraft-paper scroll-mt-16">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <h2 id="promos-title" className="text-[clamp(2.2rem,5vw,3.6rem)] leading-none font-extrabold text-gondola-deep w-cond">
            Ofertas de la semana
          </h2>
          {promosWithProduct.length ? (
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {promosWithProduct.map((promo, i) => {
                const prod = promo.product!;
                const ends = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long' }).format(new Date(promo.endsAt));
                return (
                  <li key={promo.id} style={{ rotate: `${[-1.5, 1, -0.5][i % 3]}deg` }}>
                    <Link href={`/catalogo/${prod.slug}`} className="block h-full bg-cartel p-6 text-tinta shadow-[0_14px_24px_-16px_rgba(60,40,10,.6)] transition-transform hover:-translate-y-1">
                      <p className="font-mano text-[30px] leading-none text-plumon">{promo.badge ?? 'Oferta'}</p>
                      <p className="mt-3 text-[22px] leading-tight font-bold w-semi">{prod.name}</p>
                      {prod.price !== null && (
                        <div className="mt-5 flex items-end gap-3">
                          <p className="font-mano tnum text-[56px] leading-[0.8] text-plumon">
                            {formatMoney(prod.promoPrice ?? prod.price, currency)}
                          </p>
                          {prod.promoPrice !== null && (
                            <p className="tnum pb-1 text-[16px] line-through opacity-70">{formatMoney(prod.price, currency)}</p>
                          )}
                        </div>
                      )}
                      <p className="mt-5 border-t-2 border-dashed border-tinta/25 pt-3 text-[14px] font-medium">
                        {promo.description ? `${promo.description} ` : ''}Válida hasta el {ends}.
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-8 max-w-xl bg-etiqueta/80 p-6">
              <p className="text-[17px]">No hay ofertas publicadas en este momento. Cuando el local cargue una, aparece acá automáticamente.</p>
              <div className="mt-4">
                <WhatsAppButton number={settings.whatsapp} variant="quiet" label="Preguntar por ofertas" message="Hola, ¿tienen alguna oferta esta semana?" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Beneficios */}
      <section aria-labelledby="beneficios" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <h2 id="beneficios" className="max-w-[18ch] text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.95] font-extrabold text-gondola w-cond">
          Por qué conviene pasar por el Rincón
        </h2>
        <ul className="mt-12 grid gap-x-14 gap-y-10 sm:grid-cols-2">
          {[
            { icon: Store, t: 'Todo en un solo lugar', d: 'Almacén, limpieza, bazar y hogar sin tener que recorrer varios negocios.' },
            { icon: ReceiptText, t: 'Precios a la vista', d: 'Los precios del catálogo se actualizan desde el sistema del local, así sabés cuánto cuesta antes de ir.' },
            { icon: MessageCircle, t: 'Consultas rápidas', d: 'Escribí por WhatsApp para saber si hay stock o encargar algo puntual.' },
            { icon: HandHeart, t: 'Atención de barrio', d: 'Te atiende gente que conoce el local y te ayuda a encontrar lo que necesitás.' },
          ].map((b) => (
            <li key={b.t} className="flex gap-5 border-t-2 border-gondola pt-5">
              <b.icon className="size-7 shrink-0 text-gondola" strokeWidth={1.75} aria-hidden />
              <div>
                <h3 className="text-[20px] font-bold w-semi">{b.t}</h3>
                <p className="mt-1.5 max-w-[48ch] text-[16px] leading-relaxed text-gris">{b.d}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Galería */}
      <section aria-labelledby="galeria" className="border-t border-linea py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h2 id="galeria" className="text-[clamp(2.2rem,5vw,3.6rem)] leading-none font-extrabold text-gondola w-cond">
            El local por dentro
          </h2>
        </div>
        <div className="mx-auto mt-8 grid max-w-7xl auto-rows-[150px] grid-cols-2 gap-3 [&>figure:nth-child(5)]:max-lg:hidden px-5 sm:auto-rows-[200px] lg:grid-cols-4 lg:px-8">
          {(settings.gallery.length ? settings.gallery : Array.from({ length: 5 }, () => null)).slice(0, 5).map((src, i) => (
            <figure
              key={i}
              className={`relative overflow-hidden ${i === 0 ? 'col-span-2 row-span-2' : ''} `}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={`Foto del local ${i + 1}`} loading="lazy" decoding="async" className="size-full object-cover" />
              ) : (
                <div className="kraft-paper flex size-full flex-col items-center justify-center gap-2 text-gondola-deep/70">
                  <Camera className="size-7" strokeWidth={1.5} aria-hidden />
                  <span className="text-[13px] font-medium">Foto del local pendiente</span>
                </div>
              )}
            </figure>
          ))}
        </div>
      </section>

      {/* Ubicación y horarios */}
      <section id="ubicacion" aria-labelledby="ubicacion-title" className="scroll-mt-16 bg-kraft-soft">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-2 lg:px-8 lg:py-24">
          <div>
            <h2 id="ubicacion-title" className="text-[clamp(2.2rem,5vw,3.6rem)] leading-none font-extrabold text-gondola w-cond">
              Dónde estamos
            </h2>
            <div className="mt-8 flex gap-4">
              <MapPin className="mt-1 size-6 shrink-0 text-gondola" aria-hidden />
              <div>
                {settings.address ? (
                  <p className="text-[22px] leading-snug font-semibold">
                    {settings.address}
                    {settings.city && <span className="block text-[17px] font-normal text-gris">{settings.city}</span>}
                  </p>
                ) : (
                  <p className="text-[19px] text-gris">La dirección se publica cuando el local la confirme desde el panel.</p>
                )}
                <MapsLink address={settings.address} city={settings.city} mapsUrl={settings.mapsUrl} />
              </div>
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[22px] font-bold w-semi">
                <Clock className="size-5 text-gondola" aria-hidden /> Horarios
              </h3>
              <OpenStatus hours={settings.hours} />
            </div>
            <HoursTable hours={settings.hours} />
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section aria-labelledby="cta-final" className="bg-gondola text-etiqueta">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-20 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-24">
          <h2 id="cta-final" className="max-w-[16ch] text-[clamp(2.6rem,7vw,5rem)] leading-[0.9] font-black w-cond text-balance">
            ¿No lo ves en el catálogo? Preguntá igual.
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <WhatsAppButton number={settings.whatsapp} message="Hola, estoy buscando un producto:" label="Preguntar por WhatsApp" />
            <Link href="/catalogo" className="inline-flex min-h-12 items-center justify-center border-2 border-etiqueta/70 px-5 text-[15px] font-semibold w-semi hover:bg-etiqueta hover:text-gondola">
              Buscar en el catálogo
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function MapsLink({ address, city, mapsUrl }: { address: string | null; city: string | null; mapsUrl: string | null }) {
  const href = mapsUrl ?? (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address, city].filter(Boolean).join(', '))}` : null);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center bg-gondola px-5 text-[15px] font-semibold text-etiqueta w-semi hover:bg-gondola-soft">
      Cómo llegar en Google Maps
    </a>
  );
}

function HoursTable({ hours }: { hours: BusinessHours }) {
  if (!hours.length) {
    return (
      <p className="mt-6 border border-dashed border-gondola/30 p-6 text-[17px] text-gris">
        Los horarios de atención se publican cuando el local los confirme desde el panel.
      </p>
    );
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <table className="mt-6 w-full text-[16px]">
      <caption className="sr-only">Horarios de atención por día</caption>
      <tbody>
        {order.map((day) => {
          const h = hours.find((x) => x.day === day);
          return (
            <TodayHighlight key={day} day={day}>
              <th scope="row" className="border-b border-gondola/15 py-3 pl-2 text-left font-medium">{DAY_NAMES[day]}</th>
              <td className="tnum border-b border-gondola/15 py-3 pr-2 text-right">
                {!h || h.closed || !h.ranges.length ? 'Cerrado' : h.ranges.map((r) => `${r.open} a ${r.close}`).join(' y ')}
              </td>
            </TodayHighlight>
          );
        })}
      </tbody>
    </table>
  );
}

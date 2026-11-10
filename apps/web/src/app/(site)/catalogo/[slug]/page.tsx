import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { formatMoney, textOn, UNIT_SHORT } from '@rincon/shared';
import { ProductLabel } from '@/components/site/ProductLabel';
import { WhatsAppButton } from '@/components/site/WhatsAppButton';
import { CategoryIcon } from '@/components/site/icons';
import { getProduct, getProducts, getSettings, SITE_URL } from '@/lib/api';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: 'Producto no encontrado' };
  const settings = await getSettings();
  const price = product.price !== null ? ` a ${formatMoney(product.promoPrice ?? product.price, settings.currency)}` : '';
  return {
    title: product.name,
    description: product.description ?? `${product.name}${price} en El Rincón del Busca. Consultá disponibilidad por WhatsApp.`,
    alternates: { canonical: `/catalogo/${product.slug}` },
    openGraph: { title: product.name, images: product.imageUrl ? [product.imageUrl] : undefined },
  };
}

const AVAIL = {
  available: { text: 'Disponible en el local', cls: 'text-gondola' },
  low: { text: 'Quedan pocas unidades', cls: 'text-[#9a6a0b]' },
  out: { text: 'Agotado por ahora. Consultá cuándo vuelve a entrar.', cls: 'text-plumon' },
};

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProduct(slug), getSettings()]);
  if (!product) notFound();

  const related = product.category
    ? (await getProducts(new URLSearchParams({ category: product.category.slug, pageSize: '5', sort: 'featured' }))).items
        .filter((p) => p.id !== product.id)
        .slice(0, 4)
    : [];
  const color = product.category?.color ?? '#5d625b';
  const hasPromo = product.promoPrice !== null && product.price !== null;
  const shownPrice = product.price !== null ? (hasPromo ? product.promoPrice! : product.price) : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? undefined,
    image: product.imageUrl ? new URL(product.imageUrl, SITE_URL).toString() : undefined,
    category: product.category?.name,
    ...(shownPrice !== null && {
      offers: {
        '@type': 'Offer',
        price: shownPrice,
        priceCurrency: settings.currency,
        availability: product.availability === 'out' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      },
    }),
  };

  return (
    <div className="mx-auto max-w-7xl px-5 pt-8 pb-24 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Ruta">
        <Link
          href={product.category ? `/catalogo?categoria=${product.category.slug}` : '/catalogo'}
          className="inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-gondola hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden /> {product.category?.name ?? 'Catálogo'}
        </Link>
      </nav>

      <article className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16">
        <div className="relative">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={product.name} className="aspect-square w-full bg-white object-contain ring-1 ring-linea" />
          ) : (
            <div className="grid aspect-[4/3] place-items-center lg:aspect-square" style={{ backgroundColor: color }}>
              <div className="text-center" style={{ color: textOn(color) }}>
                <CategoryIcon name={product.category?.icon ?? 'package'} className="mx-auto size-20" strokeWidth={1.25} />
                <p className="mt-4 text-[14px] font-medium">Foto del producto pendiente</p>
              </div>
            </div>
          )}
          {product.promoBadge && (
            <p className="font-mano absolute top-4 left-4 rotate-[-4deg] bg-cartel px-4 py-1 text-[30px] text-plumon">{product.promoBadge}</p>
          )}
        </div>

        <div>
          {product.isDemo && (
            <p className="mb-4 inline-block bg-cartel px-2 py-1 text-[13px] font-medium">Producto de ejemplo (demostración)</p>
          )}
          <h1 className="text-[clamp(2.2rem,5vw,3.4rem)] leading-[0.95] font-extrabold w-cond text-balance">{product.name}</h1>

          <div className="mt-8 border-y border-linea py-6">
            {shownPrice === null ? (
              <p className="text-[22px] font-semibold text-gondola">Consultá el precio por WhatsApp</p>
            ) : (
              <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                <p className={`tnum text-[64px] leading-[0.85] font-black w-cond ${hasPromo ? 'text-plumon' : ''}`}>
                  {formatMoney(shownPrice, settings.currency)}
                </p>
                {hasPromo && <p className="tnum pb-1.5 text-[20px] text-gris line-through">{formatMoney(product.price!, settings.currency)}</p>}
                <p className="pb-1.5 text-[16px] text-gris">por {UNIT_SHORT[product.unit]}</p>
              </div>
            )}
            <p className={`mt-4 text-[16px] font-semibold ${AVAIL[product.availability].cls}`}>{AVAIL[product.availability].text}</p>
          </div>

          {product.description && <p className="mt-6 max-w-[60ch] text-[17px] leading-relaxed text-tinta/85">{product.description}</p>}

          <div className="mt-8 flex flex-col gap-3">
            <WhatsAppButton
              number={settings.whatsapp}
              variant="solid-dark"
              label={product.availability === 'out' ? 'Avisame cuando vuelva' : 'Consultar por este producto'}
              message={`Hola, quería consultar por: ${product.name}${shownPrice !== null ? ` (${formatMoney(shownPrice, settings.currency)})` : ''}`}
            />
            <p className="text-[14px] text-gris">Precios sujetos a confirmación en el local.</p>
          </div>
        </div>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="relacionados" className="mt-20">
          <h2 id="relacionados" className="text-[32px] leading-none font-extrabold text-gondola w-cond">
            Más de {product.category!.name}
          </h2>
          <ul className="mt-6 grid gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <li key={p.id}>
                <ProductLabel product={p} currency={settings.currency} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

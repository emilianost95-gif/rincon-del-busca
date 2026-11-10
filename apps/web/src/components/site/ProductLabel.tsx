import Link from 'next/link';
import { formatMoney, textOn, UNIT_SHORT, type PublicProductDTO } from '@rincon/shared';
import { CategoryIcon } from './icons';

const availability = {
  available: { text: 'Disponible', dot: 'bg-gondola-soft' },
  low: { text: 'Quedan pocas unidades', dot: 'bg-[#d99a1f]' },
  out: { text: 'Agotado por ahora', dot: 'bg-plumon' },
};

/**
 * Tarjeta de producto con forma de etiqueta de góndola:
 * banda superior del color del rubro, nombre, y el precio como protagonista.
 */
export function ProductLabel({ product, currency }: { product: PublicProductDTO; currency: string }) {
  const color = product.category?.color ?? '#5d625b';
  const state = availability[product.availability];
  const hasPromo = product.promoPrice !== null && product.price !== null;

  return (
    <Link
      href={`/catalogo/${product.slug}`}
      className="group relative flex h-full flex-col bg-white tag-cut ring-1 ring-linea transition-shadow hover:ring-2 hover:ring-gondola focus-visible:ring-2"
    >
      <div className="flex h-9 items-center gap-2 px-3 text-[13px] font-semibold w-semi" style={{ backgroundColor: color, color: textOn(color) }}>
        {product.category && <CategoryIcon name={product.category.icon} className="size-4" strokeWidth={2.25} />}
        <span className="truncate">{product.category?.name ?? 'Varios'}</span>
        {product.promoBadge && (
          <span className="ml-auto bg-cartel px-1.5 py-0.5 text-[12px] font-bold text-tinta">{product.promoBadge}</span>
        )}
      </div>

      {product.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          width={480}
          height={360}
          className="aspect-[4/3] w-full object-cover"
        />
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-[17px] leading-snug font-semibold text-pretty">{product.name}</h3>

        <div className="mt-auto">
          {product.price === null ? (
            <p className="text-[15px] font-semibold text-gondola">Consultá el precio</p>
          ) : (
            <div className="flex items-end gap-2.5">
              <p className="tnum text-[34px] leading-none font-extrabold tracking-tight w-cond" style={{ color: hasPromo ? '#d2302a' : undefined }}>
                {formatMoney(hasPromo ? product.promoPrice! : product.price, currency)}
              </p>
              {hasPromo && (
                <p className="tnum pb-1 text-[15px] text-gris line-through">{formatMoney(product.price, currency)}</p>
              )}
              <p className="ml-auto pb-1 text-[13px] text-gris">c/{UNIT_SHORT[product.unit]}</p>
            </div>
          )}
          <p className="mt-3 flex items-center gap-2 border-t border-dashed border-linea pt-2.5 text-[13px] text-gris">
            <span className={`size-2 rounded-full ${state.dot}`} aria-hidden />
            {state.text}
          </p>
        </div>
      </div>
    </Link>
  );
}

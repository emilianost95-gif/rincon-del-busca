'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { CategoryIcon } from './icons';

export interface ShelfItem {
  name: string;
  slug: string | null;
  color: string;
  icon: string;
  count: number | null;
}

/**
 * El hero es una góndola: los rubros del comercio apoyados en estantes,
 * cada uno con su cenefa. El único momento animado de la página: los rubros
 * caen al estante y el cartel se cuelga.
 */
export function Hero({ shelves, ctaWhatsapp }: { shelves: ShelfItem[][]; ctaWhatsapp: React.ReactNode }) {
  const reduce = useReducedMotion();
  let index = 0;

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-gondola text-etiqueta">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 pt-10 pb-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10 lg:px-8 lg:pt-16 lg:pb-24">
        <div className="relative z-10 flex flex-col justify-center">
          <h1
            id="hero-title"
            className="text-[clamp(3.1rem,11vw,6.6rem)] leading-[0.86] font-black tracking-[-0.02em] w-cond text-balance"
          >
            Lo que buscás está en el Rincón.
          </h1>

          <motion.div
            initial={reduce ? false : { rotate: -14, y: -40, opacity: 0 }}
            animate={{ rotate: -3, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 140, damping: 11, delay: 0.75 }}
            style={{ transformOrigin: '50% 0%' }}
            className="relative mt-8 w-fit max-w-sm bg-cartel px-5 pt-4 pb-5 text-tinta shadow-[0_18px_30px_-18px_rgba(0,0,0,.7)]"
          >
            <span aria-hidden className="absolute -top-2 left-1/2 size-3 -translate-x-1/2 rounded-full bg-gondola-deep ring-2 ring-cartel" />
            <p className="font-mano text-[40px] leading-none text-plumon">¡Hay de todo!</p>
            <p className="mt-2 text-[16px] leading-snug font-medium">
              Bazar, limpieza, almacén y cosas para la casa, en un comercio de barrio con atención de verdad.
            </p>
          </motion.div>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/catalogo"
              className="inline-flex min-h-12 items-center justify-center bg-etiqueta px-6 text-[15px] font-semibold text-gondola w-semi transition-colors hover:bg-cartel"
            >
              Ver el catálogo
            </Link>
            {ctaWhatsapp}
          </div>
        </div>

        {/* La góndola */}
        <div aria-label="Rubros del comercio" role="group" className="relative">
          <div className="relative flex flex-col gap-0 overflow-hidden border-x-[10px] border-gondola-deep bg-gondola-deep/40 px-3 pt-2 sm:px-5">
            {shelves.map((row, r) => (
              <div
                key={r}
                className="relative grid items-end gap-x-6 sm:gap-x-10"
                style={{ gridTemplateColumns: `repeat(${row.length}, max-content)` }}
              >
                {row.map((item) => {
                  const i = index++;
                  const content = (
                    <motion.span
                      initial={reduce ? false : { y: -70, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 + i * 0.09 }}
                      className="flex flex-col items-start pt-6"
                    >
                      <span className="mb-2 grid size-10 place-items-center text-white sm:size-11" style={{ backgroundColor: item.color }}>
                        <CategoryIcon name={item.icon} className="size-5 sm:size-6" strokeWidth={2} />
                      </span>
                      <span className="text-[clamp(2.1rem,7.6vw,4.2rem)] leading-[0.8] font-black text-etiqueta w-cond transition-colors group-hover:text-cartel">
                        {item.name}
                      </span>
                    </motion.span>
                  );
                  return (
                    <div key={item.name} className="group row-start-1 pl-1">
                      {item.slug ? (
                        <Link href={`/catalogo?categoria=${item.slug}`} aria-label={`Ver ${item.name}`}>
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </div>
                  );
                })}
                {/* Estante: ocupa todo el ancho del mueble */}
                <div className="relative z-10 col-span-full row-start-2 -mx-3 h-3 bg-kraft shadow-[0_10px_16px_-8px_rgba(0,0,0,.55)] sm:-mx-5" style={{ width: 'calc(100% + 2.5rem + 100vw)', maxWidth: 'none' }} />
                {row.map((item) => (
                  <span key={item.name} className="row-start-3 mt-1.5 mb-4 ml-1 w-fit bg-etiqueta px-2 py-1 text-[12px] font-semibold text-gondola w-semi tnum">
                    {item.count === null ? 'Ver rubro' : `${item.count} ${item.count === 1 ? 'producto' : 'productos'}`}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div aria-hidden className="h-4 bg-gondola-deep" />
        </div>
      </div>
    </section>
  );
}

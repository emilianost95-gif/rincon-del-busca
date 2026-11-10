import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-[80vh] place-items-center bg-gondola px-5 text-etiqueta">
      <div className="max-w-lg text-center">
        <p className="font-mano text-[44px] text-cartel">¡Uy!</p>
        <h1 className="mt-2 text-[clamp(2.4rem,7vw,4rem)] leading-[0.9] font-black w-cond">Esta página no está en la góndola.</h1>
        <p className="mt-4 text-[17px] text-etiqueta/75">Puede que el producto ya no esté publicado o que el enlace tenga un error.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/catalogo" className="inline-flex min-h-12 items-center justify-center bg-cartel px-6 font-semibold text-tinta">
            Ir al catálogo
          </Link>
          <Link href="/" className="inline-flex min-h-12 items-center justify-center border-2 border-etiqueta/60 px-6 font-semibold">
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Primera barrera: sin cookie de sesión no se sirve el panel.
 * La protección real está en la API (cada endpoint valida sesión y permiso);
 * esto sólo evita mostrar una pantalla vacía antes de redirigir.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login') && !req.cookies.has('rb_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };

import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

/** La API llama acá después de editar el catálogo: la web se actualiza al instante. */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? '';
  const given = req.headers.get('x-revalidate-secret') ?? '';
  const ok = secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return Response.json({ error: 'forbidden' }, { status: 403 });
  revalidatePath('/', 'layout');
  return Response.json({ revalidated: true });
}

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, 'not_found', `${what} no encontrado`);
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'validation', message: 'Revisá los datos ingresados', fields: zodFields(err) } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    return;
  }
  // Errores de Postgres con significado de negocio (vienen anidados en `cause` vía Drizzle)
  const pg = (err?.cause ?? err) as { code?: string; constraint?: string };
  if (pg?.code === '23505') {
    const field = pg.constraint?.includes('sku') ? 'sku' : pg.constraint?.includes('email') ? 'email' : 'slug';
    res.status(409).json({
      error: { code: 'duplicate', message: 'Ya existe un registro con ese valor', fields: { [field]: 'Ya está en uso' } },
    });
    return;
  }
  if (pg?.code === '23514') {
    res.status(409).json({ error: { code: 'constraint', message: 'La operación dejaría datos inválidos (ej. stock negativo)' } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'bad_json', message: 'JSON inválido' } });
    return;
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'too_large', message: 'La imagen supera los 3 MB' } });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: { code: 'internal', message: 'Error interno. Intentá de nuevo.' } });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Ruta inexistente' } });
};

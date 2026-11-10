import { Router } from 'express';
import { importRequestSchema } from '@rincon/shared';
import { requirePermission } from '../lib/auth';
import { HttpError } from '../lib/http';
import { applyImport, listImportBatches, previewImport } from '../services/import';
import { can } from '@rincon/shared';
import { idempotent, sendIdempotent } from '../lib/idempotency';
import { revalidateCatalog } from '../lib/audit';

export const importRouter = Router();
importRouter.use(requirePermission('catalog:write'));

/** Una importación que cambia precios exige además el permiso de precios. */
function assertPricePermission(role: Parameters<typeof can>[0], rows: { salePrice: number | null; costPrice: number | null }[]) {
  if (!can(role, 'prices:write') && rows.some((r) => r.salePrice !== null || r.costPrice !== null)) {
    throw new HttpError(403, 'forbidden', 'Tu rol no puede modificar precios: quitá las columnas de precio del mapeo');
  }
}

importRouter.post('/preview', async (req, res) => {
  const body = importRequestSchema.parse(req.body);
  assertPricePermission(req.user!.role, body.rows);
  res.json(await previewImport(body));
});

importRouter.post('/apply', async (req, res) => {
  const body = importRequestSchema.parse(req.body);
  assertPricePermission(req.user!.role, body.rows);
  // Idempotente: aplicar dos veces la misma planilla (doble clic, reintento) no duplica entradas de stock.
  const out = await idempotent(req, 'import.apply', async (tx) => ({ status: 200, body: await applyImport(body, req.user!.id, tx) }));
  if (!out.replayed) revalidateCatalog();
  sendIdempotent(res, out);
});

importRouter.get('/batches', async (_req, res) => {
  res.json(await listImportBatches());
});

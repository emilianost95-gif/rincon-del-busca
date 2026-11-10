/**
 * Fase 3 — robustez del inventario:
 * separación demo/real, idempotencia, costo en cada salida, SKU al archivar,
 * usuarios con actividad y escenarios que faltaban (devolución, merma,
 * stock mínimo, rol solo lectura, conciliación de reportes).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq, sql } from 'drizzle-orm';
import type { ImportRow } from '@rincon/shared';
import { createApp } from '../src/app';
import { db, pool, schema } from '../src/db';
import { runMigrations } from '../src/db/migrate';
import { hashPassword } from '../src/lib/auth';
import { saveSettings, DEFAULT_SETTINGS } from '../src/services/settings';

const app = createApp();
const ORIGIN = 'http://localhost:3000';
type Agent = ReturnType<typeof request.agent>;
let owner: Agent;
let staff: Agent;
let viewer: Agent;

async function login(email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').set('Origin', ORIGIN).send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}
const post = (a: Agent, path: string, body: object, key?: string) => {
  const r = a.post(path).set('Origin', ORIGIN);
  if (key) r.set('Idempotency-Key', key);
  return r.send(body);
};
const row = (n: number, r: Partial<ImportRow>): ImportRow => ({
  row: n, name: null, sku: null, barcode: null, category: null, supplier: null, unit: null,
  costPrice: null, salePrice: null, stock: null, minStock: null, description: null, isPublished: null, parseIssues: [], ...r,
});
const importOpts = (stockMode: 'set' | 'add' | 'ignore' = 'set') =>
  ({ mode: 'upsert', stockMode, createCategories: true, createSuppliers: true, publishNew: true }) as const;
const key = () => crypto.randomUUID();

async function product(values: Partial<typeof schema.products.$inferInsert> & { name: string }) {
  const [p] = await db
    .insert(schema.products)
    .values({ slug: `${values.name.toLowerCase().replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 7)}`, salePrice: 1000, ...values })
    .returning();
  return p!;
}
async function stockOf(id: string) {
  const [p] = await db.select({ stock: schema.products.stock }).from(schema.products).where(eq(schema.products.id, id));
  return Number(p!.stock);
}
async function movementsOf(id: string) {
  return db.select().from(schema.stockMovements).where(eq(schema.stockMovements.productId, id));
}

beforeAll(async () => {
  await runMigrations();
  await db.execute(
    sql.raw('truncate idempotency_keys, import_batches, audit_logs, price_changes, stock_movements, promotions, products, suppliers, categories, sessions, users, settings restart identity cascade'),
  );
  await saveSettings({ ...DEFAULT_SETTINGS, demoMode: true });
  await db.insert(schema.users).values([
    { name: 'Dueña', email: 'owner@test.ar', role: 'OWNER', passwordHash: await hashPassword('Owner123456') },
    { name: 'Empleado', email: 'staff@test.ar', role: 'STAFF', passwordHash: await hashPassword('Staff123456') },
    { name: 'Auditor', email: 'viewer@test.ar', role: 'VIEWER', passwordHash: await hashPassword('Viewer12345') },
  ]);
  owner = await login('owner@test.ar', 'Owner123456');
  staff = await login('staff@test.ar', 'Staff123456');
  viewer = await login('viewer@test.ar', 'Viewer12345');
});
afterAll(async () => {
  await pool.end();
});

/* ------------------------------------------------------------------ C2 */

describe('separación de datos demo y reales', () => {
  it('una planilla real con el mismo nombre que un demo crea un producto real aparte', async () => {
    const demo = await product({ name: 'Arroz grado 1 · 1 kg', isDemo: true, sku: 'DEMO-ARROZ' });
    const file = { fileName: 'real.xlsx', sheets: ['H'], options: importOpts(), rows: [row(2, { name: 'Arroz grado 1 · 1 kg', salePrice: 2100, stock: 300 })] };

    const prev = await post(owner, '/admin/import/preview', file);
    expect(prev.body.summary).toMatchObject({ create: 1, update: 0 });
    expect(prev.body.rows[0].warnings.join(' ')).toMatch(/demostración/);

    const res = await post(owner, '/admin/import/apply', file);
    expect(res.status).toBe(200);
    const realId = res.body.preview.rows[0].productId as string;
    expect(realId).not.toBe(demo.id);
    expect(await stockOf(demo.id)).toBe(0); // el demo no se tocó
    expect(await stockOf(realId)).toBe(300);

    await post(owner, '/admin/movements', { productId: realId, type: 'OUT', quantity: 10 });
    const clr = await post(owner, '/admin/settings/clear-demo', {});
    expect(clr.body).toMatchObject({ removed: 1, kept: [] });

    expect(await db.select().from(schema.products).where(eq(schema.products.id, demo.id))).toHaveLength(0);
    expect(await stockOf(realId)).toBe(290);
    expect(await movementsOf(realId)).toHaveLength(2); // stock inicial + venta, intactos
    await saveSettings({ ...DEFAULT_SETTINGS, demoMode: true });
  });

  it('un SKU ocupado por un demo se marca como error en la vista previa (no rompe la importación)', async () => {
    await product({ name: 'Lavandina demo', isDemo: true, sku: 'LAV-1' });
    const file = { fileName: 'real.xlsx', sheets: ['H'], options: importOpts(), rows: [row(2, { name: 'Lavandina 1 L', sku: 'LAV-1', salePrice: 900 }), row(3, { name: 'Esponja', salePrice: 500 })] };
    const res = await post(owner, '/admin/import/apply', file);
    expect(res.status).toBe(200);
    expect(res.body.preview.summary).toMatchObject({ create: 1, error: 1 });
    expect(res.body.preview.rows[0].errors.join(' ')).toMatch(/demostración/);
  });

  it('red de seguridad: un demo con movimientos de planilla (bases viejas) se conserva como real', async () => {
    const legacy = await product({ name: 'Producto mal marcado', isDemo: true });
    const [batch] = await db.insert(schema.importBatches).values({ fileName: 'vieja.xlsx', stats: {} }).returning();
    await db.insert(schema.stockMovements).values({
      productId: legacy.id, productName: legacy.name, type: 'ADJUST', quantity: 50, delta: 50,
      previousStock: 0, resultingStock: 50, importBatchId: batch!.id,
    });
    await db.update(schema.products).set({ stock: 50 }).where(eq(schema.products.id, legacy.id));

    const clr = await post(owner, '/admin/settings/clear-demo', {});
    expect(clr.body.kept).toContain('Producto mal marcado');
    const [kept] = await db.select().from(schema.products).where(eq(schema.products.id, legacy.id));
    expect(kept).toMatchObject({ isDemo: false });
    expect(await movementsOf(legacy.id)).toHaveLength(1);
    await saveSettings({ ...DEFAULT_SETTINGS, demoMode: true });
  });

  it('con la demo apagada, un producto demo no acepta operaciones reales', async () => {
    const demo = await product({ name: 'Demo suelto', isDemo: true });
    await saveSettings({ ...DEFAULT_SETTINGS, demoMode: false });
    const res = await post(owner, '/admin/movements', { productId: demo.id, type: 'IN', quantity: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('demo_product');
    await saveSettings({ ...DEFAULT_SETTINGS, demoMode: true });
    expect((await post(owner, '/admin/movements', { productId: demo.id, type: 'IN', quantity: 5 })).status).toBe(201);
  });
});

/* ------------------------------------------------------------------ C3 */

describe('idempotencia (doble clic, reintentos)', () => {
  it('el mismo movimiento enviado dos veces con la misma clave se aplica una sola vez', async () => {
    const p = await product({ name: 'Fideos', stock: 0 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 10 });
    const k = key();
    const body = { productId: p.id, type: 'OUT', quantity: 1 };
    const first = await post(staff, '/admin/movements', body, k);
    const second = await post(staff, '/admin/movements', body, k);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);
    expect(await stockOf(p.id)).toBe(9);
  });

  it('dos envíos simultáneos con la misma clave: uno solo descuenta', async () => {
    const p = await product({ name: 'Yerba' });
    await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 10 });
    const k = key();
    const body = { productId: p.id, type: 'OUT', quantity: 1 };
    const results = await Promise.all(Array.from({ length: 5 }, () => post(staff, '/admin/movements', body, k)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await stockOf(p.id)).toBe(9);
  });

  it('reusar una clave con otros datos se rechaza', async () => {
    const p = await product({ name: 'Té' });
    await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 10 });
    const k = key();
    await post(staff, '/admin/movements', { productId: p.id, type: 'OUT', quantity: 1 }, k);
    const res = await post(staff, '/admin/movements', { productId: p.id, type: 'OUT', quantity: 2 }, k);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('idempotency_conflict');
    expect(await stockOf(p.id)).toBe(9);
  });

  it('si la operación falla, la clave no queda tomada y se puede reintentar', async () => {
    const p = await product({ name: 'Azúcar' });
    const k = key();
    const fail = await post(staff, '/admin/movements', { productId: p.id, type: 'OUT', quantity: 1 }, k);
    expect(fail.status).toBe(409); // sin stock
    await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 3 });
    const retry = await post(staff, '/admin/movements', { productId: p.id, type: 'OUT', quantity: 1 }, k);
    expect(retry.status).toBe(201);
    expect(await stockOf(p.id)).toBe(2);
  });

  it('la clave es por usuario: otra persona con la misma clave no recibe la respuesta ajena', async () => {
    const p = await product({ name: 'Café' });
    await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 10 });
    const k = key();
    const body = { productId: p.id, type: 'OUT', quantity: 1 };
    await post(staff, '/admin/movements', body, k);
    const other = await post(owner, '/admin/movements', body, k);
    expect(other.headers['idempotent-replayed']).toBeUndefined();
    expect(await stockOf(p.id)).toBe(8);
  });

  it('rechaza claves con formato inválido', async () => {
    const p = await product({ name: 'Sal' });
    const res = await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 1 }, 'corta');
    expect(res.status).toBe(400);
  });

  it('precios masivos: un "+10 %" enviado dos veces se aplica una vez', async () => {
    const p = await product({ name: 'Aceite precio', salePrice: 1000 });
    const body = { scope: 'products', productIds: [p.id], target: 'sale', mode: 'percent', value: 10, rounding: 1 };
    const k = key();
    await post(owner, '/admin/prices/bulk/apply', body, k);
    const again = await post(owner, '/admin/prices/bulk/apply', body, k);
    expect(again.headers['idempotent-replayed']).toBe('true');
    const [row1] = await db.select().from(schema.products).where(eq(schema.products.id, p.id));
    expect(row1!.salePrice).toBe(1100);
  });

  it('importación en modo "sumar": aplicar dos veces la misma planilla no duplica stock', async () => {
    const p = await product({ name: 'Detergente suma', sku: 'DET-SUMA' });
    const file = { fileName: 'ingreso.xlsx', sheets: ['H'], options: importOpts('add'), rows: [row(2, { sku: 'DET-SUMA', stock: 24 })] };
    const k = key();
    await post(owner, '/admin/import/apply', file, k);
    const again = await post(owner, '/admin/import/apply', file, k);
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(await stockOf(p.id)).toBe(24);
  });
});

/* ------------------------------------------------------ Datos para márgenes */

describe('costo y precio en cada movimiento', () => {
  it('la venta guarda el costo vigente y la devolución el precio vigente', async () => {
    const p = await product({ name: 'Pilas', costPrice: 1600, salePrice: 2590 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 10, unitCost: 1500 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'OUT', quantity: 2 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'RETURN', quantity: 1 });
    const mv = await movementsOf(p.id);
    expect(mv.find((m) => m.type === 'IN')).toMatchObject({ unitCost: 1500, unitPrice: null });
    expect(mv.find((m) => m.type === 'OUT')).toMatchObject({ unitCost: 1600, unitPrice: 2590 });
    expect(mv.find((m) => m.type === 'RETURN')).toMatchObject({ unitCost: 1600, unitPrice: 2590 });
  });
});

/* -------------------------------------------------------- SKU y usuarios */

describe('archivado y usuarios', () => {
  it('archivar conserva el SKU y otro producto activo puede volver a usarlo', async () => {
    const created = await post(owner, '/admin/products', { name: 'Termo viejo', sku: 'TERMO-1', salePrice: 9990 });
    expect(created.status).toBe(201);
    await owner.delete(`/admin/products/${created.body.id}`).set('Origin', ORIGIN);
    const [archived] = await db.select().from(schema.products).where(eq(schema.products.id, created.body.id));
    expect(archived!.sku).toBe('TERMO-1');
    const reuse = await post(owner, '/admin/products', { name: 'Termo nuevo', sku: 'TERMO-1', salePrice: 10990 });
    expect(reuse.status).toBe(201);
    const dup = await post(owner, '/admin/products', { name: 'Termo copia', sku: 'TERMO-1', salePrice: 1 });
    expect(dup.status).toBe(409);
  });

  it('un usuario con actividad no se elimina (se desactiva); uno sin actividad sí', async () => {
    const [staffUser] = await db.select().from(schema.users).where(eq(schema.users.email, 'staff@test.ar'));
    const res = await owner.delete(`/admin/users/${staffUser!.id}`).set('Origin', ORIGIN);
    expect(res.status).toBe(409);
    const [fresh] = await db
      .insert(schema.users)
      .values({ name: 'Temporal', email: 'tmp@test.ar', role: 'STAFF', passwordHash: await hashPassword('Temporal1234') })
      .returning();
    expect((await owner.delete(`/admin/users/${fresh!.id}`).set('Origin', ORIGIN)).status).toBe(204);
  });
});

/* ------------------------------------------------- Escenarios que faltaban */

describe('escenarios del brief que no tenían test', () => {
  it('merma descuenta y devolución suma, con trazabilidad', async () => {
    const p = await product({ name: 'Vasos', costPrice: 3900 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 8 });
    await post(staff, '/admin/movements', { productId: p.id, type: 'LOSS', quantity: 2, note: 'Rotos' });
    await post(staff, '/admin/movements', { productId: p.id, type: 'RETURN', quantity: 1 });
    expect(await stockOf(p.id)).toBe(7);
    const loss = (await movementsOf(p.id)).find((m) => m.type === 'LOSS')!;
    expect(loss).toMatchObject({ previousStock: 8, resultingStock: 6, note: 'Rotos', unitCost: 3900 });
    expect(loss.userId).not.toBeNull();
  });

  it('detecta el stock mínimo en el dashboard', async () => {
    const p = await product({ name: 'Cloro alerta', minStock: 10 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 4 });
    const dash = await owner.get('/admin/dashboard');
    expect(dash.body.alerts.some((a: { id: string }) => a.id === p.id)).toBe(true);
  });

  it('el rol solo lectura ve reportes pero no puede escribir', async () => {
    const p = await product({ name: 'Solo lectura' });
    expect((await viewer.get('/admin/reports/inventory')).status).toBe(200);
    expect((await post(viewer, '/admin/movements', { productId: p.id, type: 'IN', quantity: 1 })).status).toBe(403);
    expect((await post(viewer, '/admin/products', { name: 'X', salePrice: 1 })).status).toBe(403);
    expect((await viewer.get('/admin/users')).status).toBe(403);
  });

  it('los reportes cierran contra los movimientos registrados', async () => {
    const p = await product({ name: 'Conciliación', costPrice: 500, salePrice: 800 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'IN', quantity: 20 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'OUT', quantity: 5, unitPrice: 750 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'OUT', quantity: 3 });
    await post(owner, '/admin/movements', { productId: p.id, type: 'RETURN', quantity: 1 });

    const pareto = await owner.get('/admin/reports/pareto?metric=revenue&days=1');
    const item = pareto.body.items.find((i: { id: string }) => i.id === p.id);
    // unidades netas = 5 + 3 − 1; facturación = 5×750 + 3×800 − 1×800
    expect(item).toMatchObject({ units: 7, revenue: 5 * 750 + 3 * 800 - 800 });

    const [sum] = (
      await db.execute<{ delta: number }>(sql`select cast(sum(delta) as float) as delta from stock_movements where product_id = ${p.id}`)
    ).rows;
    expect(await stockOf(p.id)).toBe(sum!.delta);

    // Valorización del dashboard = Σ stock × costo de los productos activos
    const dash = await owner.get('/admin/dashboard');
    const [val] = (
      await db.execute<{ v: number }>(sql`select cast(coalesce(sum(stock * cost_price), 0) as float) as v from products where archived_at is null`)
    ).rows;
    expect(dash.body.totals.inventoryCost).toBe(Math.round(val!.v));
  });

  it('el saldo de todos los productos sigue igual a la suma de sus movimientos', async () => {
    const off = await db.execute<{ n: number }>(sql`
      select cast(count(*) as int) as n from products p
      where p.stock <> coalesce((select sum(delta) from stock_movements m where m.product_id = p.id), 0)
        and exists (select 1 from stock_movements m where m.product_id = p.id)`);
    expect(off.rows[0]!.n).toBe(0);
    // Ninguna clave quedó reservada sin respuesta
    const pending = await db.select().from(schema.idempotencyKeys).where(and(sql`${schema.idempotencyKeys.responseStatus} is null`));
    expect(pending).toHaveLength(0);
  });
});

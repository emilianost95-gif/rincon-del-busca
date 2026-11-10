import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db, pool, schema } from '../src/db';
import { runMigrations } from '../src/db/migrate';
import { hashPassword } from '../src/lib/auth';
import { saveSettings, DEFAULT_SETTINGS } from '../src/services/settings';
import { classify } from '../src/services/pareto';
import type { ImportRow } from '@rincon/shared';

const app = createApp();
const ORIGIN = 'http://localhost:3000';
let owner: ReturnType<typeof request.agent>;

const row = (n: number, r: Partial<ImportRow>): ImportRow => ({
  row: n, name: null, sku: null, barcode: null, category: null, supplier: null, unit: null,
  costPrice: null, salePrice: null, stock: null, minStock: null, description: null, isPublished: null, parseIssues: [], ...r,
});
const opts = { mode: 'upsert', stockMode: 'set', createCategories: true, createSuppliers: true, publishNew: true } as const;
const post = (path: string, body: object) => owner.post(path).set('Origin', ORIGIN).send(body);

beforeAll(async () => {
  await runMigrations();
  await db.execute(sql.raw('truncate import_batches, audit_logs, price_changes, stock_movements, promotions, products, suppliers, categories, sessions, users, settings restart identity cascade'));
  await saveSettings(DEFAULT_SETTINGS);
  await db.insert(schema.users).values({ name: 'Dueña', email: 'owner@test.cl', role: 'OWNER', passwordHash: await hashPassword('Owner123456') });
  await db.insert(schema.categories).values({ name: 'Limpieza', slug: 'limpieza' });
  owner = request.agent(app);
  await owner.post('/auth/login').set('Origin', ORIGIN).send({ email: 'owner@test.cl', password: 'Owner123456' });
});
afterAll(async () => { await pool.end(); });

describe('importación de planillas', () => {
  const file = {
    fileName: 'lista.xlsx',
    sheets: ['Hoja1'],
    options: opts,
    rows: [
      row(2, { name: 'Detergente 3 L', sku: 'D-1', category: 'Limpiesa', salePrice: 5990, costPrice: 4200, stock: 12, unit: 'unidad' }),
      row(3, { name: 'Arroz 1 kg', sku: 'A-1', category: 'Almacén', supplier: 'Distribuidora Sur', salePrice: 1590, stock: 40 }),
      row(4, { name: 'Sin precio', sku: 'X-1' }),
      row(5, { name: 'Arroz 1 kg (dup)', sku: 'A-1', salePrice: 1 }),
      row(6, {}),
    ],
  };

  it('la vista previa no escribe nada y detecta todo', async () => {
    const res = await post('/admin/import/preview', file);
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ create: 3, error: 1, skip: 1 });
    expect(res.body.newCategories).toEqual(['Almacén']);
    expect(res.body.newSuppliers).toEqual(['Distribuidora Sur']);
    expect(res.body.fuzzyMatches[0]).toMatchObject({ input: 'Limpiesa', matched: 'Limpieza' });
    const [n] = (await db.execute<{ n: number }>(sql.raw('select count(*)::int n from products'))).rows;
    expect(n!.n).toBe(0);
  });

  it('aplica en una transacción: productos, categorías, proveedores y stock inicial', async () => {
    const res = await post('/admin/import/apply', file);
    expect(res.status).toBe(200);
    expect(res.body.preview.summary.create).toBe(3);
    const prods = await owner.get('/admin/products?pageSize=50');
    const det = prods.body.items.find((p: { sku: string }) => p.sku === 'D-1');
    expect(det.stock).toBe(12);
    expect(det.category.name).toBe('Limpieza');
    const sinPrecio = prods.body.items.find((p: { sku: string }) => p.sku === 'X-1');
    expect(sinPrecio.showPrice).toBe(false);
  });

  it('re-importar actualiza sólo lo que cambió y el stock se ajusta con movimiento', async () => {
    const res = await post('/admin/import/apply', {
      ...file,
      rows: [row(2, { sku: 'D-1', salePrice: 6290, stock: 10 }), row(3, { name: 'arroz 1 KG', salePrice: 1590 })],
    });
    expect(res.body.preview.summary).toMatchObject({ update: 1, unchanged: 1 });
    const upd = res.body.preview.rows[0];
    expect(upd.changes.map((c: { field: string }) => c.field)).toEqual(['Precio de venta', 'Stock (conteo)']);
    const detail = await owner.get(`/admin/products/${upd.productId}`);
    expect(detail.body.stock).toBe(10);
    expect(detail.body.priceHistory[0]).toMatchObject({ previousValue: 5990, newValue: 6290 });
    expect(detail.body.movements[0]).toMatchObject({ type: 'ADJUST' });
  });

  it('modo "sumar" registra entradas; modo "solo actualizar" ignora nuevos', async () => {
    const res = await post('/admin/import/apply', {
      ...file,
      options: { ...opts, mode: 'update', stockMode: 'add' },
      rows: [row(2, { sku: 'D-1', stock: 5 }), row(3, { name: 'Nuevo inexistente', salePrice: 100 })],
    });
    expect(res.body.preview.summary).toMatchObject({ update: 1, skip: 1 });
    const d = await owner.get(`/admin/products/${res.body.preview.rows[0].productId}`);
    expect(d.body.stock).toBe(15);
  });

  it('rechaza un SKU que ya pertenece a otro producto', async () => {
    const res = await post('/admin/import/preview', { ...file, rows: [row(2, { name: 'Arroz 1 kg', sku: 'D-1' })] });
    expect(res.body.rows[0].action).toBe('error');
  });

  it('el saldo sigue igual a la suma de movimientos', async () => {
    const r = await db.execute<{ bad: number }>(sql.raw(`select count(*)::int bad from products p left join (select product_id, sum(delta) t from stock_movements group by 1) s on s.product_id = p.id where p.stock <> coalesce(s.t, 0)`));
    expect(r.rows[0]!.bad).toBe(0);
  });

  it('valida el límite y la forma del pedido', async () => {
    const res = await post('/admin/import/preview', { fileName: 'x', options: opts, rows: [] });
    expect(res.status).toBe(400);
  });
});

describe('Pareto / ABC', () => {
  it('clasifica según el acumulado (el que cruza el 80 % es A)', () => {
    const { items } = classify([{ value: 50 }, { value: 25 }, { value: 15 }, { value: 6 }, { value: 4 }, { value: 0 }]);
    expect(items.map((i) => i.abc)).toEqual(['A', 'A', 'A', 'B', 'C', 'C']);
    expect(items[1]!.cumulative).toBeCloseTo(0.75);
  });

  it('calcula facturación con el precio real de cada venta', async () => {
    const prods = await owner.get('/admin/products?pageSize=50');
    const det = prods.body.items.find((p: { sku: string }) => p.sku === 'D-1');
    await post('/admin/movements', { productId: det.id, type: 'OUT', quantity: 2, unitPrice: 5000 });
    await post('/admin/movements', { productId: det.id, type: 'OUT', quantity: 1 }); // precio vigente 6290
    const res = await owner.get('/admin/reports/pareto?metric=revenue&days=30');
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { id: string }) => i.id === det.id);
    expect(item.revenue).toBe(2 * 5000 + 6290);
    expect(item.abc).toBe('A');
  });

  it('exporta el Pareto en Excel', async () => {
    const res = await owner.get('/admin/reports/export/pareto.xlsx?metric=units&days=30').buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });
});

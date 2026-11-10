import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db, pool, schema } from '../src/db';
import { runMigrations } from '../src/db/migrate';
import { hashPassword } from '../src/lib/auth';
import { saveSettings, DEFAULT_SETTINGS } from '../src/services/settings';

const app = createApp();
const ORIGIN = 'http://localhost:3000';

async function login(email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').set('Origin', ORIGIN).send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

let owner: ReturnType<typeof request.agent>;
let staff: ReturnType<typeof request.agent>;
let categoryId: string;

beforeAll(async () => {
  await runMigrations();
  await db.execute(
    sql.raw('truncate audit_logs, price_changes, stock_movements, promotions, products, suppliers, categories, sessions, users, settings restart identity cascade'),
  );
  await saveSettings(DEFAULT_SETTINGS);
  await db.insert(schema.users).values([
    { name: 'Dueña', email: 'owner@test.cl', role: 'OWNER', passwordHash: await hashPassword('Owner123456') },
    { name: 'Empleado', email: 'staff@test.cl', role: 'STAFF', passwordHash: await hashPassword('Staff123456') },
  ]);
  owner = await login('owner@test.cl', 'Owner123456');
  staff = await login('staff@test.cl', 'Staff123456');
  const cat = await owner.post('/admin/categories').set('Origin', ORIGIN).send({ name: 'Limpieza', color: '#3E6A8A' });
  categoryId = cat.body.id;
});

afterAll(async () => {
  await pool.end();
});

async function createProduct(overrides: Record<string, unknown> = {}) {
  const res = await owner
    .post('/admin/products')
    .set('Origin', ORIGIN)
    .send({ name: `Producto ${Math.random().toString(36).slice(2, 7)}`, salePrice: 1000, costPrice: 600, categoryId, initialStock: 5, ...overrides });
  expect(res.status).toBe(201);
  return res.body as { id: string; slug: string; stock: number };
}

describe('autenticación y permisos', () => {
  it('rechaza el panel sin sesión', async () => {
    const res = await request(app).get('/admin/products');
    expect(res.status).toBe(401);
  });

  it('rechaza credenciales incorrectas sin revelar si el email existe', async () => {
    const a = await request(app).post('/auth/login').send({ email: 'owner@test.cl', password: 'malamala1' });
    const b = await request(app).post('/auth/login').send({ email: 'noexiste@test.cl', password: 'malamala1' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('la cookie de sesión es httpOnly', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'owner@test.cl', password: 'Owner123456' });
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
  });

  it('un empleado no puede crear productos ni cambiar precios', async () => {
    const res = await staff.post('/admin/products').set('Origin', ORIGIN).send({ name: 'X producto', salePrice: 10 });
    expect(res.status).toBe(403);
    const prod = await createProduct();
    const price = await staff.patch(`/admin/products/${prod.id}`).set('Origin', ORIGIN).send({ salePrice: 1 });
    expect(price.status).toBe(403);
  });

  it('un empleado sí puede registrar movimientos de stock', async () => {
    const prod = await createProduct();
    const res = await staff.post('/admin/movements').set('Origin', ORIGIN).send({ productId: prod.id, type: 'OUT', quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body.resultingStock).toBe(3);
    expect(res.body.userName).toBe('Empleado');
  });

  it('bloquea escrituras desde otro origen (CSRF)', async () => {
    const res = await owner.post('/admin/categories').set('Origin', 'https://sitio-malicioso.com').send({ name: 'Hack' });
    expect(res.status).toBe(403);
  });

  it('no permite dejar el sistema sin dueño', async () => {
    const users = await owner.get('/admin/users');
    const me = users.body.find((u: { email: string }) => u.email === 'owner@test.cl');
    const res = await owner.patch(`/admin/users/${me.id}`).set('Origin', ORIGIN).send({ role: 'ADMIN' });
    expect(res.status).toBe(409);
  });
});

describe('inventario', () => {
  it('el stock no se puede editar directamente desde el producto', async () => {
    const prod = await createProduct();
    const res = await owner.patch(`/admin/products/${prod.id}`).set('Origin', ORIGIN).send({ stock: 999 });
    expect(res.status).toBe(400);
  });

  it('rechaza salidas mayores al stock disponible', async () => {
    const prod = await createProduct({ initialStock: 2 });
    const res = await owner.post('/admin/movements').set('Origin', ORIGIN).send({ productId: prod.id, type: 'OUT', quantity: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('insufficient_stock');
  });

  it('10 ventas simultáneas sobre 5 unidades: sólo 5 pasan y el stock queda en 0', async () => {
    const prod = await createProduct({ initialStock: 5 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        owner.post('/admin/movements').set('Origin', ORIGIN).send({ productId: prod.id, type: 'OUT', quantity: 1 }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const detail = await owner.get(`/admin/products/${prod.id}`);
    expect(detail.body.stock).toBe(0);
  });

  it('el ajuste por conteo fija el stock absoluto y registra la diferencia', async () => {
    const prod = await createProduct({ initialStock: 5 });
    const res = await owner.post('/admin/movements').set('Origin', ORIGIN).send({ productId: prod.id, type: 'ADJUST', quantity: 8 });
    expect(res.body.delta).toBe(3);
    expect(res.body.resultingStock).toBe(8);
  });

  it('acepta cantidades con decimales (kg)', async () => {
    const prod = await createProduct({ unit: 'kg', initialStock: 2.5 });
    const res = await owner.post('/admin/movements').set('Origin', ORIGIN).send({ productId: prod.id, type: 'OUT', quantity: 0.75 });
    expect(res.body.resultingStock).toBe(1.75);
  });

  it('el saldo siempre coincide con la suma de movimientos', async () => {
    const rows = await db.execute<{ bad: number }>(
      sql.raw(`select count(*)::int as bad from products p left join (select product_id, sum(delta) t from stock_movements group by 1) s on s.product_id = p.id where p.stock <> coalesce(s.t, 0)`),
    );
    expect(rows.rows[0]!.bad).toBe(0);
  });
});

describe('precios', () => {
  it('registra el historial de cada cambio de precio', async () => {
    const prod = await createProduct({ salePrice: 1000 });
    await owner.patch(`/admin/products/${prod.id}`).set('Origin', ORIGIN).send({ salePrice: 1200 });
    const detail = await owner.get(`/admin/products/${prod.id}`);
    expect(detail.body.priceHistory[0]).toMatchObject({ field: 'sale', previousValue: 1000, newValue: 1200 });
  });

  it('la vista previa masiva no escribe; aplicar sí, con redondeo', async () => {
    const prod = await createProduct({ salePrice: 1000 });
    const body = { scope: 'products', productIds: [prod.id], mode: 'percent', value: 12, rounding: 50 };
    const preview = await owner.post('/admin/prices/bulk/preview').set('Origin', ORIGIN).send(body);
    expect(preview.body.changes[0]).toMatchObject({ current: 1000, next: 1100 });
    expect((await owner.get(`/admin/products/${prod.id}`)).body.salePrice).toBe(1000);
    await owner.post('/admin/prices/bulk/apply').set('Origin', ORIGIN).send(body);
    expect((await owner.get(`/admin/products/${prod.id}`)).body.salePrice).toBe(1100);
  });
});

describe('catálogo público', () => {
  it('no expone costos, proveedores ni el stock exacto', async () => {
    await createProduct({ name: 'Detergente público', initialStock: 20 });
    const res = await request(app).get('/public/products?q=detergente');
    expect(res.status).toBe(200);
    const item = res.body.items[0];
    expect(item).toBeDefined();
    expect(item.costPrice).toBeUndefined();
    expect(item.stock).toBeUndefined();
    expect(item.supplierId).toBeUndefined();
    expect(item.availability).toBe('available');
  });

  it('busca sin importar tildes ni mayúsculas', async () => {
    await createProduct({ name: 'Té negro clásico' });
    const res = await request(app).get('/public/products?q=TE%20NEGRO');
    expect(res.body.items.some((p: { name: string }) => p.name === 'Té negro clásico')).toBe(true);
  });

  it('oculta productos no publicados y archivados', async () => {
    const hidden = await createProduct({ name: 'Producto oculto', isPublished: false });
    const archived = await createProduct({ name: 'Producto archivado' });
    await owner.delete(`/admin/products/${archived.id}`).set('Origin', ORIGIN);
    expect((await request(app).get(`/public/products/${hidden.slug}`)).status).toBe(404);
    expect((await request(app).get(`/public/products/${archived.slug}`)).status).toBe(404);
  });

  it('aplica el precio promocional vigente', async () => {
    const prod = await createProduct({ name: 'Producto en promo', salePrice: 2000 });
    await owner
      .post('/admin/promotions')
      .set('Origin', ORIGIN)
      .send({
        title: 'Promo test',
        productId: prod.id,
        promoPrice: 1500,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    const res = await request(app).get(`/public/products/${prod.slug}`);
    expect(res.body.price).toBe(2000);
    expect(res.body.promoPrice).toBe(1500);
  });

  it('devuelve errores de validación por campo', async () => {
    const res = await owner.post('/admin/products').set('Origin', ORIGIN).send({ name: 'A', salePrice: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.name).toBeTruthy();
    expect(res.body.error.fields.salePrice).toBeTruthy();
  });
});

describe('reportes', () => {
  it('exporta CSV con BOM para Excel', async () => {
    const res = await owner.get('/admin/reports/export/products.csv').buffer(true).parse((r, cb) => {
      let data = '';
      r.on('data', (c: Buffer) => (data += c.toString()));
      r.on('end', () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect((res.body as string).charCodeAt(0)).toBe(0xfeff);
  });

  it('el dashboard calcula con datos reales', async () => {
    const res = await owner.get('/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.totals.products).toBeGreaterThan(0);
    expect(res.body.movementsByDay).toHaveLength(14);
  });
});

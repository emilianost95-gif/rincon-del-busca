/**
 * Datos de DEMOSTRACIÓN.
 *
 * Las categorías corresponden a los rubros reales del comercio (bazar,
 * limpieza, almacén, hogar, uso cotidiano). Los productos, precios, stock,
 * proveedores y promociones son EJEMPLOS: quedan marcados con isDemo y la
 * landing muestra un aviso mientras `demoMode` esté activo. Se borran desde
 * Configuración → "Eliminar datos de demostración".
 */
import { eq, sql } from 'drizzle-orm';
import { db, pool, schema } from './index';
import { runMigrations } from './migrate';
import { hashPassword } from '../lib/auth';
import { applyMovement } from '../services/inventory';
import { buildSearchText, uniqueSlug } from '../services/products';
import { DEFAULT_SETTINGS, saveSettings } from '../services/settings';
import type { Unit } from '@rincon/shared';

const CATEGORIES = [
  { name: 'Almacén', slug: 'almacen', color: '#A4532E', icon: 'wheat', description: 'Mercadería seca, conservas, infusiones y lo de todos los días.' },
  { name: 'Limpieza', slug: 'limpieza', color: '#3E6A8A', icon: 'spray-can', description: 'Para la casa, la ropa y la cocina.' },
  { name: 'Bazar', slug: 'bazar', color: '#C99A2E', icon: 'cooking-pot', description: 'Vajilla, utensilios y cosas útiles para la cocina y la mesa.' },
  { name: 'Hogar', slug: 'hogar', color: '#5E7B4F', icon: 'lamp', description: 'Organización, ferretería liviana y pequeños arreglos.' },
  { name: 'Uso cotidiano', slug: 'uso-cotidiano', color: '#8A5A7A', icon: 'sparkles', description: 'Higiene personal, pilas, librería y lo que siempre falta.' },
];

const DAY = 86_400_000;

type SeedProduct = [name: string, cat: string, unit: Unit, cost: number, price: number, stock: number, min: number, featured?: boolean];

const PRODUCTS: SeedProduct[] = [
  ['Arroz grado 1 · 1 kg', 'almacen', 'unidad', 1150, 1590, 42, 12, true],
  ['Fideos spaghetti · 400 g', 'almacen', 'unidad', 620, 890, 60, 15],
  ['Aceite vegetal · 1 L', 'almacen', 'unidad', 1890, 2490, 18, 8, true],
  ['Azúcar granulada · 1 kg', 'almacen', 'unidad', 980, 1350, 6, 10],
  ['Té negro · 100 bolsitas', 'almacen', 'caja', 1450, 2190, 22, 6],
  ['Café instantáneo · 170 g', 'almacen', 'unidad', 3200, 4590, 9, 5],
  ['Harina sin polvos · 1 kg', 'almacen', 'unidad', 750, 1090, 0, 8],
  ['Legumbres surtidas · 1 kg', 'almacen', 'kg', 1600, 2290, 14.5, 5],
  ['Detergente líquido ropa · 3 L', 'limpieza', 'unidad', 4200, 5990, 12, 4, true],
  ['Lavalozas concentrado · 750 ml', 'limpieza', 'unidad', 1100, 1690, 25, 8],
  ['Cloro tradicional · 1 L', 'limpieza', 'unidad', 690, 990, 30, 10],
  ['Limpiador multiuso · 900 ml', 'limpieza', 'unidad', 1300, 1990, 3, 6],
  ['Esponjas doble uso · pack 3', 'limpieza', 'paquete', 650, 1190, 40, 10],
  ['Bolsas de basura · 10 un.', 'limpieza', 'paquete', 790, 1290, 0, 10],
  ['Set de 6 vasos de vidrio', 'bazar', 'caja', 3900, 6490, 8, 3, true],
  ['Sartén antiadherente 24 cm', 'bazar', 'unidad', 7900, 12990, 5, 2, true],
  ['Tupper hermético · set 3', 'bazar', 'caja', 2900, 4990, 11, 4],
  ['Cuchillo de cocina 20 cm', 'bazar', 'unidad', 2100, 3490, 2, 3],
  ['Termo acero 1 L', 'bazar', 'unidad', 6500, 9990, 7, 2],
  ['Ampolleta LED 9 W', 'hogar', 'unidad', 950, 1690, 35, 10],
  ['Alargador 3 tomas · 3 m', 'hogar', 'unidad', 3100, 4990, 6, 3],
  ['Colgadores plásticos · 10 un.', 'hogar', 'paquete', 1200, 1990, 18, 5],
  ['Cinta aislante', 'hogar', 'unidad', 400, 790, 24, 6],
  ['Pilas AA · pack 4', 'uso-cotidiano', 'paquete', 1600, 2590, 20, 6, true],
  ['Papel higiénico · 4 rollos', 'uso-cotidiano', 'paquete', 1500, 2290, 16, 8],
  ['Jabón de tocador · pack 3', 'uso-cotidiano', 'paquete', 1300, 1990, 4, 6],
  ['Cuaderno universitario 100 h', 'uso-cotidiano', 'unidad', 900, 1590, 28, 8],
  ['Encendedor recargable', 'uso-cotidiano', 'unidad', 350, 690, 50, 12],
];

async function seed() {
  await runMigrations();

  const [existing] = await db.select({ id: schema.products.id }).from(schema.products).limit(1);
  if (existing && !process.argv.includes('--force')) {
    console.log('La base ya tiene datos. Usá --force para reiniciarla (borra TODO).');
    return;
  }
  if (process.argv.includes('--force')) {
    await db.execute(
      sql.raw('truncate audit_logs, price_changes, stock_movements, promotions, products, suppliers, categories, sessions, users, settings restart identity cascade'),
    );
  }

  // Dueño inicial
  const email = (process.env.OWNER_EMAIL ?? 'dueno@rincondelbusca.local').toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? 'CambiarEsta123';
  const [owner] = await db
    .insert(schema.users)
    .values({ name: process.env.OWNER_NAME ?? 'Dueño', email, role: 'OWNER', passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning();
  const ownerId = owner?.id ?? (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0]!.id;

  // Usuario de demostración con permisos de empleado, para mostrar los roles
  await db
    .insert(schema.users)
    .values({ name: 'Empleado (demo)', email: 'empleado@rincondelbusca.local', role: 'STAFF', passwordHash: await hashPassword('Empleado12345') })
    .onConflictDoNothing();

  await saveSettings(DEFAULT_SETTINGS);

  const cats = await db
    .insert(schema.categories)
    .values(CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })))
    .returning();
  const catBySlug = new Map(cats.map((c) => [c.slug, c]));

  const [supA, supB, supC] = await db
    .insert(schema.suppliers)
    .values([
      { name: 'Distribuidora (ejemplo) A', contactName: 'Contacto de prueba', notes: 'Proveedor de demostración — reemplazar por uno real.' },
      { name: 'Mayorista limpieza (ejemplo)', notes: 'Proveedor de demostración — reemplazar por uno real.' },
      { name: 'Importadora bazar (ejemplo)', notes: 'Proveedor de demostración — reemplazar por uno real.' },
    ])
    .returning();
  const supplierFor = (slug: string) => (slug === 'limpieza' ? supB : slug === 'bazar' || slug === 'hogar' ? supC : supA)!.id;

  const created: { id: string; stock: number; sold: number }[] = [];
  const rndSold = mulberry32(42);
  for (const [name, catSlug, unit, cost, price, stock, min, featured] of PRODUCTS) {
    const sold = 3 + Math.floor(rndSold() * 22);
    const cat = catBySlug.get(catSlug)!;
    const [row] = await db
      .insert(schema.products)
      .values({
        name,
        slug: await uniqueSlug(name),
        sku: `DEMO-${String(created.length + 1).padStart(3, '0')}`,
        categoryId: cat.id,
        supplierId: supplierFor(catSlug),
        unit,
        costPrice: cost,
        salePrice: price,
        minStock: min,
        isFeatured: !!featured,
        isDemo: true,
        searchText: buildSearchText([name, cat.name]),
      })
      .returning();
    if (stock > 0) {
      // Stock inicial de hace 14 días, para que el historial sea coherente.
      await applyMovement({
        productId: row!.id,
        type: 'INITIAL',
        quantity: stock + sold,
        userId: ownerId,
        note: 'Carga inicial (demo)',
        createdAt: new Date(Date.now() - 14 * DAY),
      });
    }
    created.push({ id: row!.id, stock, sold });
  }

  // Movimientos de los últimos 14 días: generan datos reales para el dashboard.
  const rnd = mulberry32(7);
  for (const prod of created) {
    if (prod.stock <= 0) continue;
    // Llega del stock inicial (stock+vendido) al stock objetivo con salidas y alguna entrada.
    // Las fechas avanzan en orden para que stock anterior → resultante sea coherente.
    let toRemove = prod.sold;
    let t = Date.now() - 13 * DAY;
    while (toRemove > 0) {
      const q = Math.min(toRemove, 1 + Math.floor(rnd() * 3));
      t += Math.floor(rnd() * Math.max(0.4, 26 / prod.sold) * DAY);
      const at = new Date(Math.min(t, Date.now() - 60_000));
      await applyMovement({ productId: prod.id, type: 'OUT', quantity: q, userId: ownerId, note: 'Venta (demo)', createdAt: at });
      toRemove -= q;
    }
  }
  // Productos agotados: entraron y se vendieron
  for (const prod of created.filter((p) => p.stock <= 0)) {
    await applyMovement({ productId: prod.id, type: 'IN', quantity: 6, userId: ownerId, note: 'Compra (demo)', createdAt: new Date(Date.now() - 9 * DAY) });
    await applyMovement({ productId: prod.id, type: 'OUT', quantity: 6, userId: ownerId, note: 'Venta (demo)', createdAt: new Date(Date.now() - 2 * DAY) });
  }

  const now = Date.now();
  const featured = created.slice(0, 3);
  const ids = await db.select({ id: schema.products.id, salePrice: schema.products.salePrice, name: schema.products.name }).from(schema.products);
  const byId = new Map(ids.map((r) => [r.id, r]));
  await db.insert(schema.promotions).values([
    {
      title: 'Semana del almacén',
      description: 'Promoción de ejemplo para mostrar cómo se ven las ofertas en la web.',
      productId: featured[0]!.id,
      promoPrice: Math.round((byId.get(featured[0]!.id)!.salePrice * 0.85) / 10) * 10,
      badge: '-15%',
      startsAt: new Date(now - 86_400_000),
      endsAt: new Date(now + 6 * 86_400_000),
      isDemo: true,
    },
    {
      title: 'Lleva el detergente',
      description: 'Ejemplo de promoción por producto con precio especial.',
      productId: created[8]!.id,
      promoPrice: Math.round((byId.get(created[8]!.id)!.salePrice * 0.9) / 10) * 10,
      badge: 'Oferta',
      startsAt: new Date(now - 2 * 86_400_000),
      endsAt: new Date(now + 9 * 86_400_000),
      isDemo: true,
    },
    {
      title: 'Bazar de temporada',
      description: 'Ejemplo de promoción programada: empieza la semana que viene.',
      productId: created[15]!.id,
      promoPrice: Math.round((byId.get(created[15]!.id)!.salePrice * 0.8) / 10) * 10,
      badge: '-20%',
      startsAt: new Date(now + 7 * 86_400_000),
      endsAt: new Date(now + 21 * 86_400_000),
      isDemo: true,
    },
  ]);

  console.log(`✔ Seed DEMO listo: ${created.length} productos, ${cats.length} categorías.`);
  console.log(`  Dueño: ${email} / ${password === 'CambiarEsta123' ? 'CambiarEsta123 (cambiala)' : '(la de OWNER_PASSWORD)'}`);
  console.log('  Empleado demo: empleado@rincondelbusca.local / Empleado12345');
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

seed()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

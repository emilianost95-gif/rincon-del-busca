import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['OWNER', 'ADMIN', 'STAFF', 'VIEWER']);
export const movementTypeEnum = pgEnum('movement_type', ['IN', 'OUT', 'ADJUST', 'RETURN', 'LOSS', 'INITIAL']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Stock con hasta 3 decimales (kg, litros). Se lee como number. */
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: 'number' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('STAFF'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestamps,
});

export const sessions = pgTable(
  'sessions',
  {
    /** sha256 del token: si alguien lee la tabla, no puede usar las sesiones. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  color: text('color').notNull().default('#1F3B2D'),
  icon: text('icon').notNull().default('package'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublished: boolean('is_published').notNull().default(true),
  ...timestamps,
});

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  phone: text('phone'),
  email: text('email'),
  taxId: text('tax_id'),
  notes: text('notes'),
  ...timestamps,
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    sku: text('sku').unique(),
    barcode: text('barcode'),
    description: text('description'),
    /** Texto normalizado (sin tildes, minúsculas) para la búsqueda pública. */
    searchText: text('search_text').notNull().default(''),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    unit: text('unit').notNull().default('unidad'),
    costPrice: integer('cost_price').notNull().default(0),
    salePrice: integer('sale_price').notNull().default(0),
    /** Caché del saldo. La fuente de verdad es stock_movements. */
    stock: qty('stock').notNull().default(0),
    minStock: qty('min_stock').notNull().default(0),
    imageUrl: text('image_url'),
    isPublished: boolean('is_published').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    showPrice: boolean('show_price').notNull().default(true),
    /** Marca los productos de demostración para poder borrarlos de una. */
    isDemo: boolean('is_demo').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('products_stock_non_negative', sql`${t.stock} >= 0`),
    check('products_prices_non_negative', sql`${t.costPrice} >= 0 AND ${t.salePrice} >= 0`),
    index('products_category_idx').on(t.categoryId),
    index('products_supplier_idx').on(t.supplierId),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    /** Desnormalizado: el historial se lee aunque el producto cambie de nombre. */
    productName: text('product_name').notNull(),
    type: movementTypeEnum('type').notNull(),
    quantity: qty('quantity').notNull(),
    delta: qty('delta').notNull(),
    previousStock: qty('previous_stock').notNull(),
    resultingStock: qty('resulting_stock').notNull(),
    unitCost: integer('unit_cost'),
    /** Precio de venta al momento de la salida: base del análisis de facturación. */
    unitPrice: integer('unit_price'),
    /** Lote de importación que generó el movimiento (si vino de un Excel). */
    importBatchId: uuid('import_batch_id'),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    note: text('note'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('movements_product_idx').on(t.productId), index('movements_created_idx').on(t.createdAt)],
);

export const priceChanges = pgTable(
  'price_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    field: text('field', { enum: ['sale', 'cost'] }).notNull(),
    previousValue: integer('previous_value').notNull(),
    newValue: integer('new_value').notNull(),
    reason: text('reason'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('price_changes_product_idx').on(t.productId)],
);

export const promotions = pgTable('promotions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  promoPrice: integer('promo_price'),
  badge: text('badge'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isDemo: boolean('is_demo').notNull().default(false),
  ...timestamps,
});

/** Fila única (id = 1) con la configuración del negocio. */
export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    summary: text('summary').notNull(),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_created_idx').on(t.createdAt)],
);

/** Historial de importaciones desde planillas. */
export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  fileName: text('file_name').notNull(),
  sheets: text('sheets').notNull().default(''),
  options: jsonb('options'),
  stats: jsonb('stats').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Esquemas de validación compartidos.
 * El mismo esquema valida el formulario en el navegador y el body en la API:
 * una sola fuente de verdad para las reglas de negocio.
 */
import { z } from 'zod';
import { ROLES } from './permissions';

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const money = z.coerce
  .number({ error: 'Ingresá un número' })
  .int('Usá un monto entero')
  .min(0, 'No puede ser negativo')
  .max(100_000_000, 'Monto fuera de rango');

const quantity = z.coerce
  .number({ error: 'Ingresá un número' })
  .min(0, 'No puede ser negativo')
  .max(1_000_000, 'Cantidad fuera de rango')
  .refine((n) => Math.round(n * 1000) === n * 1000, 'Máximo 3 decimales');

const urlOrPath = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//.test(v), 'URL inválida')
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const UNITS = ['unidad', 'kg', 'g', 'litro', 'ml', 'paquete', 'caja', 'docena', 'metro'] as const;
export type Unit = (typeof UNITS)[number];
export const UNIT_SHORT: Record<Unit, string> = {
  unidad: 'un',
  kg: 'kg',
  g: 'g',
  litro: 'L',
  ml: 'ml',
  paquete: 'paq',
  caja: 'caja',
  docena: 'doc',
  metro: 'm',
};

/* ---------------------------------------------------------------- Auth */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

const password = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Combiná letras y números');

export const userCreateSchema = z.object({
  name: trimmed(80).min(2, 'Ingresá un nombre'),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password,
  role: z.enum(ROLES),
});
export const userUpdateSchema = z.object({
  name: trimmed(80).min(2).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

/* ----------------------------------------------------------- Catálogo */

export const categorySchema = z.object({
  name: trimmed(60).min(2, 'Ingresá un nombre'),
  description: optionalText(240),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color hex inválido')
    .default('#1F3B2D'),
  icon: trimmed(40).default('package'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isPublished: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const supplierSchema = z.object({
  name: trimmed(80).min(2, 'Ingresá un nombre'),
  contactName: optionalText(80),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .email('Email inválido')
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  taxId: optionalText(30),
  notes: optionalText(500),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const productBaseSchema = z.object({
  name: trimmed(120).min(2, 'Ingresá un nombre'),
  sku: optionalText(40),
  barcode: optionalText(40),
  description: optionalText(1000),
  categoryId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  supplierId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  unit: z.enum(UNITS).default('unidad'),
  costPrice: money.default(0),
  salePrice: money,
  minStock: quantity.default(0),
  imageUrl: urlOrPath,
  isPublished: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  showPrice: z.boolean().default(true),
});

export const productCreateSchema = productBaseSchema.extend({
  initialStock: quantity.default(0),
});
/** El stock NO se edita desde el producto: sólo por movimientos. */
export const productUpdateSchema = productBaseSchema.partial();
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/* -------------------------------------------------------- Inventario */

export const MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUST', 'RETURN', 'LOSS', 'INITIAL'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const MOVEMENT_LABELS: Record<MovementType, string> = {
  IN: 'Entrada',
  OUT: 'Salida / venta',
  ADJUST: 'Ajuste por conteo',
  RETURN: 'Devolución',
  LOSS: 'Merma / pérdida',
  INITIAL: 'Stock inicial',
};

export const movementSchema = z
  .object({
    productId: z.string().uuid(),
    type: z.enum(['IN', 'OUT', 'ADJUST', 'RETURN', 'LOSS']),
    /** Para ADJUST es el stock contado (absoluto); para el resto, la cantidad movida. */
    quantity,
    supplierId: z.string().uuid().nullable().optional(),
    unitCost: money.optional().nullable(),
    note: optionalText(300),
  })
  .refine((m) => m.type === 'ADJUST' || m.quantity > 0, {
    message: 'La cantidad debe ser mayor a cero',
    path: ['quantity'],
  });
export type MovementInput = z.infer<typeof movementSchema>;

/* ------------------------------------------------------------ Precios */

export const priceUpdateSchema = z.object({
  salePrice: money.optional(),
  costPrice: money.optional(),
});

export const bulkPriceSchema = z
  .object({
    scope: z.enum(['all', 'category', 'supplier', 'products']),
    categoryId: z.string().uuid().optional(),
    supplierId: z.string().uuid().optional(),
    productIds: z.array(z.string().uuid()).max(2000).optional(),
    target: z.enum(['sale', 'cost']).default('sale'),
    mode: z.enum(['percent', 'amount']),
    value: z.coerce.number().min(-90).max(100_000),
    rounding: z.coerce.number().int().refine((n) => [1, 10, 50, 100].includes(n)).default(10),
  })
  .refine((b) => b.scope !== 'category' || !!b.categoryId, { message: 'Elegí una categoría', path: ['categoryId'] })
  .refine((b) => b.scope !== 'supplier' || !!b.supplierId, { message: 'Elegí un proveedor', path: ['supplierId'] })
  .refine((b) => b.scope !== 'products' || (b.productIds?.length ?? 0) > 0, {
    message: 'Elegí al menos un producto',
    path: ['productIds'],
  });
export type BulkPriceInput = z.infer<typeof bulkPriceSchema>;

/* -------------------------------------------------------- Promociones */

export const promotionSchema = z
  .object({
    title: trimmed(80).min(3, 'Ingresá un título'),
    description: optionalText(300),
    productId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    promoPrice: money.nullable().optional().transform((v) => v ?? null),
    badge: optionalText(24),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    isActive: z.boolean().default(true),
  })
  .refine((p) => p.endsAt > p.startsAt, { message: 'La fecha de fin debe ser posterior al inicio', path: ['endsAt'] });
export type PromotionInput = z.infer<typeof promotionSchema>;

/* ------------------------------------------------------ Configuración */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM');

export const hoursSchema = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6),
      closed: z.boolean(),
      ranges: z.array(z.object({ open: hhmm, close: hhmm })).max(2),
    }),
  )
  .max(7);
export type BusinessHours = z.infer<typeof hoursSchema>;

export const settingsSchema = z.object({
  businessName: trimmed(80).min(2),
  tagline: optionalText(140),
  about: optionalText(800),
  whatsapp: z
    .string()
    .trim()
    .regex(/^\+?\d{8,15}$/, 'Usá el formato internacional, sólo números (ej. 56912345678)')
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => (v ? v.replace('+', '') : null)),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  address: optionalText(160),
  city: optionalText(80),
  mapsUrl: urlOrPath,
  instagram: optionalText(80),
  facebook: optionalText(120),
  hours: hoursSchema.default([]),
  gallery: z.array(z.string().trim().max(500)).max(12).default([]),
  currency: z.enum(['CLP', 'ARS', 'USD', 'PEN', 'COP', 'MXN', 'UYU']).default('CLP'),
  demoMode: z.boolean().default(true),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

/* ------------------------------------------------------------ Listados */

export const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export const productListQuerySchema = listQuerySchema.extend({
  category: z.string().trim().max(80).optional(),
  supplier: z.string().uuid().optional(),
  stock: z.enum(['all', 'low', 'out', 'ok']).default('all'),
  status: z.enum(['all', 'published', 'hidden']).default('all'),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'stock', 'updated', 'featured']).default('name'),
});

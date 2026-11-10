/** Contratos de respuesta de la API (lo que viaja por la red). */
import type { MovementType, Unit, BusinessHours } from './schemas';
import type { Role } from './permissions';

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string;
  sortOrder: number;
  isPublished: boolean;
  productCount?: number;
}

export interface SupplierDTO {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  notes: string | null;
  productCount?: number;
  createdAt: string;
}

export interface ProductDTO {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  supplierId: string | null;
  unit: Unit;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  imageUrl: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  showPrice: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  category?: Pick<CategoryDTO, 'id' | 'name' | 'slug' | 'color' | 'icon'> | null;
  supplier?: Pick<SupplierDTO, 'id' | 'name'> | null;
}

/** Lo que ve el público: sin costos, sin proveedor, stock sólo como estado. */
export interface PublicProductDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  unit: Unit;
  price: number | null;
  promoPrice: number | null;
  promoBadge: string | null;
  availability: 'available' | 'low' | 'out';
  imageUrl: string | null;
  isFeatured: boolean;
  isDemo: boolean;
  category: { name: string; slug: string; color: string; icon: string } | null;
}

export interface MovementDTO {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number;
  delta: number;
  previousStock: number;
  resultingStock: number;
  unitCost: number | null;
  note: string | null;
  userName: string | null;
  supplierName: string | null;
  createdAt: string;
}

export interface PromotionDTO {
  id: string;
  title: string;
  description: string | null;
  productId: string | null;
  productName?: string | null;
  promoPrice: number | null;
  badge: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  status: 'scheduled' | 'live' | 'ended' | 'paused';
}

export interface PublicSettingsDTO {
  businessName: string;
  tagline: string | null;
  about: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  mapsUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  hours: BusinessHours;
  gallery: string[];
  currency: string;
  demoMode: boolean;
}

export interface DashboardDTO {
  totals: {
    products: number;
    published: number;
    categories: number;
    suppliers: number;
    inventoryCost: number;
    inventoryRetail: number;
    lowStock: number;
    outOfStock: number;
  };
  movementsByDay: { date: string; inQty: number; outQty: number; count: number }[];
  topCategories: { name: string; color: string; retail: number; products: number }[];
  topOutProducts: { id: string; name: string; quantity: number }[];
  recentMovements: MovementDTO[];
  alerts: Pick<ProductDTO, 'id' | 'name' | 'stock' | 'minStock' | 'unit'>[];
  activePromotions: number;
}

export interface AuditDTO {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  userName: string | null;
  createdAt: string;
}

/**
 * Lecturas del lado del servidor para la parte pública.
 * Si la API no responde, se devuelven valores vacíos: la landing se sigue
 * mostrando (con los estados "pendiente") en vez de romperse.
 */
import 'server-only';
import type { CategoryDTO, Paginated, PublicProductDTO, PublicSettingsDTO } from '@rincon/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export const FALLBACK_SETTINGS: PublicSettingsDTO = {
  businessName: 'El Rincón del Busca',
  tagline: null,
  about: null,
  whatsapp: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  mapsUrl: null,
  instagram: null,
  facebook: null,
  hours: [],
  gallery: [],
  currency: 'CLP',
  demoMode: true,
};

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 60, tags: ['catalog'] } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export interface PublicPromotion {
  id: string;
  title: string;
  description: string | null;
  badge: string | null;
  endsAt: string;
  isDemo: boolean;
  product: PublicProductDTO | null;
}

const emptyPage: Paginated<PublicProductDTO> = { items: [], total: 0, page: 1, pageSize: 24 };

export const getSettings = () => get<PublicSettingsDTO>('/public/settings', FALLBACK_SETTINGS);
export const getCategories = () => get<(CategoryDTO & { productCount: number })[]>('/public/categories', []);
export const getPromotions = () => get<PublicPromotion[]>('/public/promotions', []);
export const getFeatured = () => get('/public/products?featured=1&pageSize=8&sort=name', emptyPage);
export const getProducts = (params: URLSearchParams) => get(`/public/products?${params.toString()}`, emptyPage);
export const getProduct = (slug: string) =>
  get<PublicProductDTO | null>(`/public/products/${encodeURIComponent(slug)}`, null);
export const getSitemapEntries = () => get<{ slug: string; updatedAt: string }[]>('/public/sitemap', []);

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

import type { MetadataRoute } from 'next';
import { getCategories, getSitemapEntries, SITE_URL } from '@/lib/api';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getSitemapEntries(), getCategories()]);
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/catalogo`, changeFrequency: 'daily', priority: 0.9 },
    ...categories.map((c) => ({ url: `${SITE_URL}/catalogo?categoria=${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...products.map((p) => ({ url: `${SITE_URL}/catalogo/${p.slug}`, lastModified: p.updatedAt, priority: 0.6 })),
  ];
}

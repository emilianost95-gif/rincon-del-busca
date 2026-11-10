'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Archive, ArrowLeftRight, Download, Eye, EyeOff, Pencil, Plus, Search, Star } from 'lucide-react';
import { formatMoney, formatQty, UNIT_SHORT, type CategoryDTO, type Paginated, type ProductDTO, type SupplierDTO } from '@rincon/shared';
import { api, ApiError, useDebounced, useResource } from '@/lib/client';
import { Badge, Button, EmptyState, ErrorBox, Input, PageHeader, Pagination, Panel, Select, Table, TableSkeleton, Td, Th, useFeedback } from '@/components/admin/ui';
import { ProductDrawer } from '@/components/admin/ProductDrawer';
import { MovementModal, type MovementTarget } from '@/components/admin/MovementModal';
import { Can, useSession } from '@/components/admin/session';

function stockBadge(p: ProductDTO) {
  if (p.stock <= 0) return <Badge tone="red">Agotado</Badge>;
  if (p.stock <= p.minStock) return <Badge tone="amber">Bajo</Badge>;
  return null;
}

function ProductsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast, confirm } = useFeedback();
  const { currency } = useSession();

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState(params.get('stock') ?? 'all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);

  useEffect(() => setPage(1), [dq, category, stock, status, sort]);

  const qs = new URLSearchParams({ page: String(page), pageSize: '25', stock, status, sort });
  if (dq) qs.set('q', dq);
  if (category) qs.set('category', category);

  const list = useResource<Paginated<ProductDTO>>(`/admin/products?${qs}`);
  const cats = useResource<CategoryDTO[]>('/admin/categories');
  const sups = useResource<SupplierDTO[]>('/admin/suppliers');

  const editId = params.get('ver');
  const [drawer, setDrawer] = useState<{ id: string | null } | null>(editId ? { id: editId } : null);
  const [move, setMove] = useState<MovementTarget | null>(null);

  function closeDrawer() {
    setDrawer(null);
    if (editId) router.replace('/admin/productos');
  }

  async function togglePublished(p: ProductDTO) {
    try {
      await api(`/admin/products/${p.id}`, { method: 'PATCH', json: { isPublished: !p.isPublished } });
      toast(p.isPublished ? 'Oculto del catálogo' : 'Publicado en el catálogo');
      list.reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }

  async function archive(p: ProductDTO) {
    const ok = await confirm({
      title: 'Archivar producto',
      message: `“${p.name}” deja de aparecer en el catálogo y en los listados. Su historial de movimientos y precios se conserva para los reportes.`,
      confirmLabel: 'Archivar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/products/${p.id}`, { method: 'DELETE' });
      toast('Producto archivado');
      list.reload();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Productos"
        description="El catálogo completo del local. Lo marcado como visible se publica en la web."
        actions={
          <>
            <Can perm="reports:read">
              <a href="/api/admin/reports/export/products.csv" className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3.5 text-[14px] font-medium ring-1 ring-linea hover:ring-gondola/40">
                <Download className="size-4" /> Exportar CSV
              </a>
            </Can>
            <Can perm="catalog:write">
              <Button variant="primary" onClick={() => setDrawer({ id: null })}>
                <Plus className="size-4" /> Nuevo producto
              </Button>
            </Can>
          </>
        }
      />

      <Panel padded={false}>
        <div className="grid gap-2 border-b border-linea p-3 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(4,auto)]">
          <label className="relative">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gris" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, SKU o código" className="pl-9" />
          </label>
          <Select aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label="Stock" value={stock} onChange={(e) => setStock(e.target.value)}>
            <option value="all">Todo el stock</option>
            <option value="low">Stock bajo</option>
            <option value="out">Agotados</option>
            <option value="ok">Stock OK</option>
          </Select>
          <Select aria-label="Visibilidad" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Visibles y ocultos</option>
            <option value="published">Visibles en la web</option>
            <option value="hidden">Ocultos</option>
          </Select>
          <Select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Nombre</option>
            <option value="stock">Menor stock</option>
            <option value="price_desc">Mayor precio</option>
            <option value="price_asc">Menor precio</option>
            <option value="updated">Últimos editados</option>
          </Select>
        </div>

        {list.error ? (
          <div className="p-4"><ErrorBox message={list.error.message} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <TableSkeleton />
        ) : !list.data?.items.length ? (
          <EmptyState
            title={dq || category || stock !== 'all' || status !== 'all' ? 'Ningún producto coincide con los filtros' : 'Todavía no hay productos'}
            description={dq || category ? 'Probá con otra búsqueda o limpiá los filtros.' : 'Cargá el primero y aparece en el catálogo de la web.'}
            action={
              <Can perm="catalog:write">
                <Button variant="primary" onClick={() => setDrawer({ id: null })}><Plus className="size-4" /> Nuevo producto</Button>
              </Can>
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th className="text-right">Costo</Th>
                  <Th className="text-right">Venta</Th>
                  <Th className="text-right">Stock</Th>
                  <Th>Web</Th>
                  <Th className="w-0"><span className="sr-only">Acciones</span></Th>
                </tr>
              </thead>
              <tbody className={list.loading ? 'opacity-60' : ''}>
                {list.data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-[#fafaf7]">
                    <Td>
                      <button onClick={() => setDrawer({ id: p.id })} className="flex items-center gap-3 text-left">
                        <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: p.category?.color ?? '#cfd1c8' }} aria-hidden />
                        <span>
                          <span className="flex items-center gap-1.5 font-medium hover:underline">
                            {p.name}
                            {p.isFeatured && <Star className="size-3.5 fill-[#d9a441] text-[#d9a441]" aria-label="Destacado" />}
                          </span>
                          <span className="block text-[12.5px] text-gris">
                            {p.category?.name ?? 'Sin categoría'}{p.sku ? ` · ${p.sku}` : ''}{p.isDemo ? ' · demo' : ''}
                          </span>
                        </span>
                      </button>
                    </Td>
                    <Td className="text-right text-gris">{formatMoney(p.costPrice, currency)}</Td>
                    <Td className="text-right font-medium">{formatMoney(p.salePrice, currency)}</Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {stockBadge(p)}
                        <span className="tnum">{formatQty(p.stock)} <span className="text-[12px] text-gris">{UNIT_SHORT[p.unit]}</span></span>
                      </div>
                    </Td>
                    <Td>{p.isPublished ? <Badge tone="green">Visible</Badge> : <Badge>Oculto</Badge>}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Can perm="stock:write">
                          <Button size="sm" variant="ghost" onClick={() => setMove(p)} title="Registrar movimiento" aria-label={`Registrar movimiento de ${p.name}`}>
                            <ArrowLeftRight className="size-4" />
                          </Button>
                        </Can>
                        <Can perm="catalog:write">
                          <Button size="sm" variant="ghost" onClick={() => togglePublished(p)} title={p.isPublished ? 'Ocultar de la web' : 'Publicar en la web'} aria-label={p.isPublished ? `Ocultar ${p.name}` : `Publicar ${p.name}`}>
                            {p.isPublished ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDrawer({ id: p.id })} title="Editar" aria-label={`Editar ${p.name}`}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => archive(p)} title="Archivar" aria-label={`Archivar ${p.name}`}>
                            <Archive className="size-4" />
                          </Button>
                        </Can>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        )}
      </Panel>

      <ProductDrawer
        open={!!drawer}
        productId={drawer?.id ?? null}
        onClose={closeDrawer}
        onSaved={list.reload}
        categories={cats.data ?? []}
        suppliers={sups.data ?? []}
      />
      <MovementModal open={!!move} onClose={() => setMove(null)} onDone={list.reload} product={move} defaultType="IN" />
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsInner />
    </Suspense>
  );
}

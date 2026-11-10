'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  BadgePercent,
  Bell,
  Boxes,
  DollarSign,
  ExternalLink,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Tags,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { can, ROLE_LABELS, type Permission, type SessionUser } from '@rincon/shared';
import { api } from '@/lib/client';
import { FeedbackProvider, Skeleton } from '@/components/admin/ui';
import { SessionCtx } from '@/components/admin/session';

const NAV: { group: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm: Permission }[] }[] = [
  {
    group: 'General',
    items: [
      { href: '/admin', label: 'Resumen', icon: LayoutDashboard, perm: 'dashboard:read' },
      { href: '/admin/alertas', label: 'Alertas de stock', icon: Bell, perm: 'catalog:read' },
    ],
  },
  {
    group: 'Catálogo',
    items: [
      { href: '/admin/productos', label: 'Productos', icon: Package, perm: 'catalog:read' },
      { href: '/admin/categorias', label: 'Categorías', icon: Tags, perm: 'catalog:read' },
      { href: '/admin/precios', label: 'Precios', icon: DollarSign, perm: 'prices:write' },
      { href: '/admin/promociones', label: 'Promociones', icon: BadgePercent, perm: 'catalog:read' },
    ],
  },
  {
    group: 'Inventario',
    items: [
      { href: '/admin/inventario', label: 'Movimientos', icon: Boxes, perm: 'catalog:read' },
      { href: '/admin/proveedores', label: 'Proveedores', icon: Truck, perm: 'catalog:read' },
      { href: '/admin/reportes', label: 'Reportes', icon: FileBarChart, perm: 'reports:read' },
    ],
  },
  {
    group: 'Administración',
    items: [
      { href: '/admin/actividad', label: 'Actividad', icon: Activity, perm: 'audit:read' },
      { href: '/admin/usuarios', label: 'Usuarios', icon: Users, perm: 'users:manage' },
      { href: '/admin/configuracion', label: 'Configuración', icon: Settings, perm: 'settings:write' },
    ],
  },
];

function Sidebar({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col bg-gondola text-etiqueta">
      <div className="flex h-14 items-center gap-2 px-4">
        <span className="text-[19px] font-extrabold w-cond">Rincón del Busca</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-etiqueta/80">Panel</span>
      </div>
      <nav aria-label="Panel" className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(user.role, i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group} className="mt-4">
              <p className="px-2 pb-1 text-[12px] text-etiqueta/50">{g.group}</p>
              <ul>
                {items.map((i) => {
                  const active = i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? 'page' : undefined}
                        className={`flex h-9 items-center gap-2.5 rounded-md px-2 text-[14px] transition-colors ${active ? 'bg-white/12 font-medium text-white' : 'text-etiqueta/75 hover:bg-white/6 hover:text-white'}`}
                      >
                        <i.icon className={`size-4 ${active ? 'text-cartel' : ''}`} />
                        {i.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link href="/" target="_blank" className="mb-2 flex h-9 items-center gap-2 rounded-md px-2 text-[13px] text-etiqueta/70 hover:bg-white/6 hover:text-white">
          <ExternalLink className="size-4" /> Ver la web
        </Link>
        <div className="flex items-center gap-2.5 px-2">
          <span className="grid size-8 place-items-center rounded-full bg-cartel text-[13px] font-bold text-tinta">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="text-[12px] text-etiqueta/55">{ROLE_LABELS[user.role]}</p>
          </div>
          <button onClick={onLogout} className="grid size-8 place-items-center rounded-md hover:bg-white/10" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menu, setMenu] = useState(false);
  const [currency, setCurrency] = useState('CLP');

  useEffect(() => {
    api<{ user: SessionUser }>('/auth/me')
      .then((r) => {
        setUser(r.user);
        return api<{ currency: string }>('/admin/settings').then((s) => setCurrency(s.currency));
      })
      .catch(() => undefined); // api() ya redirige al login ante 401
  }, []);
  useEffect(() => setMenu(false), [pathname]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/admin/login');
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-60 bg-gondola lg:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <SessionCtx.Provider value={{ user, logout, currency }}>
      <FeedbackProvider>
        <div className="flex min-h-dvh">
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 lg:block">
            <Sidebar user={user} onLogout={logout} />
          </aside>

          {menu && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMenu(false)} aria-hidden />
              <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
                <Sidebar user={user} onLogout={logout} />
              </div>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-linea bg-white/90 px-4 backdrop-blur lg:hidden">
              <button onClick={() => setMenu(true)} className="grid size-10 place-items-center rounded-md hover:bg-black/5" aria-label="Abrir menú" aria-expanded={menu}>
                {menu ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
              <span className="text-[17px] font-extrabold text-gondola w-cond">Rincón del Busca</span>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          </div>
        </div>
      </FeedbackProvider>
    </SessionCtx.Provider>
  );
}

'use client';

import { createContext, useContext } from 'react';
import { can, type Permission, type SessionUser } from '@rincon/shared';

export const SessionCtx = createContext<{ user: SessionUser; logout: () => void; currency: string } | null>(null);

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession fuera del panel');
  return { ...ctx, can: (p: Permission) => can(ctx.user.role, p) };
}

/** Muestra el contenido sólo si el rol tiene el permiso. */
export function Can({ perm, children, fallback = null }: { perm: Permission; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { can: allowed } = useSession();
  return <>{allowed(perm) ? children : fallback}</>;
}

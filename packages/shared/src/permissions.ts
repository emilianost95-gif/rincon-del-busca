/**
 * Roles y permisos.
 *
 * El rol define QUÉ puede hacer cada persona; los endpoints nunca preguntan
 * por el rol directamente, preguntan por un permiso. Así, sumar un rol nuevo
 * (p. ej. "Cajero") es editar este mapa, no tocar 30 rutas.
 */
export const ROLES = ['OWNER', 'ADMIN', 'STAFF', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Dueño',
  ADMIN: 'Administrador',
  STAFF: 'Empleado',
  VIEWER: 'Solo lectura',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Acceso total, incluida la gestión de usuarios y la configuración del negocio.',
  ADMIN: 'Gestiona catálogo, precios, stock, proveedores y promociones.',
  STAFF: 'Registra entradas y salidas de stock y consulta el catálogo.',
  VIEWER: 'Consulta información y reportes sin modificar nada.',
};

export const PERMISSIONS = [
  'dashboard:read',
  'catalog:read',
  'catalog:write',
  'stock:write',
  'prices:write',
  'suppliers:write',
  'promotions:write',
  'reports:read',
  'audit:read',
  'settings:write',
  'users:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => p !== 'users:manage' && p !== 'settings:write'),
  STAFF: ['dashboard:read', 'catalog:read', 'stock:write'],
  VIEWER: ['dashboard:read', 'catalog:read', 'reports:read'],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

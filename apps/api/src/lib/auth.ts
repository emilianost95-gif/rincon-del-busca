import { createHash, randomBytes } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt } from 'drizzle-orm';
import { can, type Permission, type SessionUser } from '@rincon/shared';
import { db, schema } from '../db';
import { env } from '../env';
import { HttpError } from './http';

export const SESSION_COOKIE = 'rb_session';
const SESSION_DAYS = 7;
const RENEW_BELOW_MS = 3 * 24 * 60 * 60 * 1000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const hashPassword = (plain: string) => hash(plain, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (hashed: string, plain: string) => verify(hashed, plain).catch(() => false);

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 200) ?? null,
  });
  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(token: string | undefined) {
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
}

/** Carga el usuario de la sesión si existe (no exige login). */
export const loadSession: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) return next();
  const [row] = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || !row.user.isActive) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return next();
  }
  req.user = { id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role };

  // Sesión deslizante: si queda poco, se renueva sin pedir login.
  if (row.session.expiresAt.getTime() - Date.now() < RENEW_BELOW_MS) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, row.session.id));
    setSessionCookie(res, token, expiresAt);
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Iniciá sesión para continuar'));
  next();
};

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Iniciá sesión para continuar'));
    if (!can(req.user.role, permission)) {
      return next(new HttpError(403, 'forbidden', 'Tu rol no tiene permiso para esta acción'));
    }
    next();
  };

/**
 * Protección CSRF: las escrituras sólo se aceptan desde los orígenes del
 * frontend. Combinado con SameSite=Lax y JSON obligatorio, un sitio ajeno no
 * puede disparar acciones con la cookie de la persona.
 */
export const originGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !env.allowedOrigins.includes(origin)) {
    return next(new HttpError(403, 'bad_origin', 'Origen no permitido'));
  }
  next();
};

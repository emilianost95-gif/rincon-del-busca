import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { eq } from 'drizzle-orm';
import { changePasswordSchema, loginSchema, ROLE_PERMISSIONS } from '@rincon/shared';
import { db, schema } from '../db';
import { env } from '../env';
import { HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../lib/auth';

export const authRouter = Router();

/** 10 intentos cada 15 minutos por IP: frena ataques de fuerza bruta. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Demasiados intentos. Esperá unos minutos.' } },
});

// Hash fijo para comparar aunque el email no exista (evita revelar qué cuentas existen por tiempo de respuesta).
let dummyHash: string | null = null;

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

  dummyHash ??= await hashPassword('dummy-password-0');
  const ok = await verifyPassword(user?.passwordHash ?? dummyHash, password);
  if (!user || !ok || !user.isActive) {
    throw new HttpError(401, 'invalid_credentials', 'Email o contraseña incorrectos');
  }

  const { token, expiresAt } = await createSession(user.id, { ip: req.ip, userAgent: req.get('user-agent') });
  setSessionCookie(res, token, expiresAt);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await audit({ userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, summary: `${user.name} inició sesión` });

  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    permissions: ROLE_PERMISSIONS[user.role],
  });
});

authRouter.post('/logout', async (req, res) => {
  await destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, permissions: ROLE_PERMISSIONS[req.user!.role] });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.id));
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new HttpError(400, 'validation', 'La contraseña actual no coincide', { currentPassword: 'Incorrecta' });
  }
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));
  // Cierra las demás sesiones abiertas de esta persona.
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  const { token, expiresAt } = await createSession(user.id, { ip: req.ip, userAgent: req.get('user-agent') });
  setSessionCookie(res, token, expiresAt);
  await audit({ userId: user.id, action: 'user.password', entity: 'user', entityId: user.id, summary: 'Cambió su contraseña' });
  res.status(204).end();
});

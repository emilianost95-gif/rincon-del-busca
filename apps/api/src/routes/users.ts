import { Router } from 'express';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { ROLE_LABELS, userCreateSchema, userUpdateSchema } from '@rincon/shared';
import { db, schema } from '../db';
import { conflict, HttpError, notFound } from '../lib/http';
import { audit } from '../lib/audit';
import { hashPassword, requirePermission } from '../lib/auth';

export const usersRouter = Router();
usersRouter.use(requirePermission('users:manage'));

const publicFields = {
  id: schema.users.id,
  name: schema.users.name,
  email: schema.users.email,
  role: schema.users.role,
  isActive: schema.users.isActive,
  lastLoginAt: schema.users.lastLoginAt,
  createdAt: schema.users.createdAt,
};

usersRouter.get('/', async (_req, res) => {
  res.json(await db.select(publicFields).from(schema.users).orderBy(asc(schema.users.name)));
});

usersRouter.post('/', async (req, res) => {
  const data = userCreateSchema.parse(req.body);
  const [user] = await db
    .insert(schema.users)
    .values({ name: data.name, email: data.email, role: data.role, passwordHash: await hashPassword(data.password) })
    .returning(publicFields);
  await audit({
    userId: req.user!.id,
    action: 'user.create',
    entity: 'user',
    entityId: user!.id,
    summary: `Creó el usuario ${user!.name} (${ROLE_LABELS[user!.role]})`,
  });
  res.status(201).json(user);
});

/** Nunca puede quedar el sistema sin un dueño activo. */
async function assertKeepsAnOwner(userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.users)
    .where(and(eq(schema.users.role, 'OWNER'), eq(schema.users.isActive, true), ne(schema.users.id, userId)));
  if (!row || row.n === 0) throw conflict('Tiene que quedar al menos un usuario Dueño activo');
}

usersRouter.patch('/:id', async (req, res) => {
  const id = String(req.params.id);
  const data = userUpdateSchema.parse(req.body);
  const [current] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!current) throw notFound('Usuario');

  const losesOwner = current.role === 'OWNER' && ((data.role && data.role !== 'OWNER') || data.isActive === false);
  if (losesOwner) await assertKeepsAnOwner(id);
  if (id === req.user!.id && data.isActive === false) throw new HttpError(400, 'self', 'No podés desactivar tu propia cuenta');

  const [user] = await db
    .update(schema.users)
    .set({
      name: data.name,
      role: data.role,
      isActive: data.isActive,
      passwordHash: data.password ? await hashPassword(data.password) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, id))
    .returning(publicFields);

  // Si se desactiva o se le cambia la contraseña, se cierran sus sesiones.
  if (data.isActive === false || data.password) {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  }
  await audit({ userId: req.user!.id, action: 'user.update', entity: 'user', entityId: id, summary: `Editó el usuario ${user!.name}` });
  res.json(user);
});

usersRouter.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) throw new HttpError(400, 'self', 'No podés eliminar tu propia cuenta');
  const [current] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!current) throw notFound('Usuario');
  if (current.role === 'OWNER') await assertKeepsAnOwner(id);
  await db.delete(schema.users).where(eq(schema.users.id, id));
  await audit({ userId: req.user!.id, action: 'user.delete', entity: 'user', entityId: id, summary: `Eliminó el usuario ${current.name}` });
  res.status(204).end();
});

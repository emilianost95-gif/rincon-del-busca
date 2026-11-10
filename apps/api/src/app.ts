import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './env';
import { errorHandler, notFoundHandler } from './lib/http';
import { loadSession, originGuard, requireAuth } from './lib/auth';
import { publicRouter } from './routes/public';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { categoriesRouter, suppliersRouter } from './routes/catalog';
import { productsRouter } from './routes/products';
import { movementsRouter, pricesRouter } from './routes/inventory';
import { auditRouter, dashboardRouter, promotionsRouter, settingsRouter } from './routes/business';
import { reportsRouter } from './routes/reports';
import { uploadDir, uploadsRouter } from './routes/uploads';
import { importRouter } from './routes/import';
import { pool } from './db';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  // JSON chico para todo, salvo la importación de planillas (miles de filas).
  const smallJson = express.json({ limit: '200kb' });
  const importJson = express.json({ limit: '15mb' });
  app.use((req, res, next) => (req.path.startsWith('/admin/import') ? importJson : smallJson)(req, res, next));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    await pool.query('select 1');
    res.json({ ok: true });
  });

  app.use('/uploads', express.static(uploadDir, { maxAge: '30d', immutable: true, fallthrough: false }));

  app.use(originGuard);
  app.use(loadSession);

  app.use('/public', publicRouter);
  app.use('/auth', authRouter);

  // Todo lo que cuelga de /admin exige sesión; cada ruta además exige su permiso.
  const admin = Router();
  admin.use(requireAuth);
  admin.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  admin.use('/dashboard', dashboardRouter);
  admin.use('/products', productsRouter);
  admin.use('/categories', categoriesRouter);
  admin.use('/suppliers', suppliersRouter);
  admin.use('/movements', movementsRouter);
  admin.use('/prices', pricesRouter);
  admin.use('/promotions', promotionsRouter);
  admin.use('/settings', settingsRouter);
  admin.use('/users', usersRouter);
  admin.use('/reports', reportsRouter);
  admin.use('/audit', auditRouter);
  admin.use('/uploads', uploadsRouter);
  admin.use('/import', importRouter);
  app.use('/admin', admin);

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (!env.isProd && env.NODE_ENV !== 'test') {
    console.log(`[api] orígenes permitidos: ${env.allowedOrigins.join(', ')}`);
  }
  return app;
}

import { createApp } from './app';
import { env } from './env';
import { pool } from './db';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`[api] escuchando en http://localhost:${env.PORT}`);
});

// Limpieza periódica de sesiones vencidas.
const cleanup = setInterval(
  () => pool.query('delete from sessions where expires_at < now()').catch(() => undefined),
  60 * 60 * 1000,
);

function shutdown() {
  clearInterval(cleanup);
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

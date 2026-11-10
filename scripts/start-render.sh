#!/usr/bin/env sh
# Arranque en un único servicio (ideal para el plan gratuito de Render):
# API interna en :4000 + web Next.js en $PORT, con un solo "cold start".
set -e

export API_PORT="${API_PORT:-4000}"
WEB_PORT="${PORT:-3000}"

cd apps/api
node dist/db/migrate.js
# Carga los datos demo sólo si la base está vacía (no pisa datos existentes).
if [ "${SEED_DEMO:-true}" = "true" ]; then
  if [ -n "${OWNER_PASSWORD:-}" ]; then node dist/db/seed.js || echo "[start] seed falló; sigo sin datos demo";
  else echo "[start] OWNER_PASSWORD no definida: se omite el seed"; fi
fi
PORT="$API_PORT" WEB_URL="http://127.0.0.1:${WEB_PORT}" node dist/server.js &
API_PID=$!
cd ../..

# Espera a que la API responda antes de levantar la web.
for i in $(seq 1 60); do
  if node -e "fetch('http://127.0.0.1:${API_PORT}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then break; fi
  sleep 1
done

export API_URL="http://127.0.0.1:${API_PORT}"
cd apps/web
npx next start -p "$WEB_PORT" &
WEB_PID=$!

# Cuando la web está arriba, regenera las páginas que se pre-renderizaron
# durante el build (sin API disponible) para que muestren los datos reales.
for i in $(seq 1 60); do
  if node -e "fetch('http://127.0.0.1:${WEB_PORT}/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    node -e "fetch('http://127.0.0.1:${WEB_PORT}/internal/revalidate',{method:'POST',headers:{'x-revalidate-secret':process.env.REVALIDATE_SECRET||''}}).then(r=>console.log('[start] revalidate', r.status))"
    break
  fi
  sleep 1
done

# Si cualquiera de los dos procesos muere, el contenedor se reinicia.
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do sleep 5; done
echo "[start] un proceso terminó; saliendo para que Render reinicie"
exit 1

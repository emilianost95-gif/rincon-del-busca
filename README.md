# El Rincón del Busca — Web comercial + sistema de gestión

Plataforma de dos módulos para un comercio de barrio (bazar, limpieza, almacén, hogar):

- **Web pública** (`apps/web`): landing, catálogo con buscador y filtros, ficha de producto, contacto por WhatsApp, ubicación y horarios.
- **Panel administrativo** (`/admin`): productos, inventario con movimientos, precios (individuales y masivos), categorías, proveedores, promociones, alertas, **análisis de Pareto/ABC**, **importación inteligente desde Excel**, reportes en Excel/CSV, usuarios con roles y configuración del negocio.

El catálogo público **se alimenta del panel**: lo que se edita ahí se publica en la web al instante.

> ⚠️ Los productos, precios, proveedores y promociones del seed son **de demostración** (marcados `isDemo`). La web muestra un aviso mientras `demoMode` esté activo. Se borran desde *Configuración → Eliminar datos demo*. Dirección, horarios, WhatsApp y fotos **no se inventaron**: aparecen como “pendiente” hasta que se carguen.

---

## Arquitectura

```
rincon-del-busca/
├─ packages/shared   Esquemas Zod, tipos, roles/permisos y formateo (los usan web y API)
├─ apps/api          Node + Express 5 + Drizzle ORM + PostgreSQL (API REST)
└─ apps/web          Next.js 16 (App Router) + Tailwind 4 + Motion
```

```
Navegador ──► Next.js ──(/api/* proxy)──► API Express ──► PostgreSQL
                │                            ▲
                └── SSR/ISR del catálogo ────┘   (la API avisa a la web al editar → revalidación)
```

| Decisión | Por qué |
|---|---|
| **Next.js** para la web | SEO real (SSR/ISR, metadata, Open Graph, sitemap, JSON-LD). Una SPA en Vite no indexa bien el catálogo. |
| **API separada** | El panel y la web son clientes de la misma API. Mañana puede sumarse una app móvil, un lector de código de barras o una caja sin tocar el backend. |
| **Proxy `/api` desde Next** | El navegador habla con un solo origen: la cookie de sesión es first-party, sin CORS ni tokens en `localStorage`. |
| **Drizzle en lugar de Prisma** | Prisma necesita descargar un motor binario (`schema-engine`) que no siempre está disponible en entornos restringidos; Drizzle es 100 % TypeScript, sin binarios, arranca más rápido en hosting y genera migraciones SQL versionadas (`apps/api/drizzle/`). |
| **Esquemas Zod compartidos** | La misma regla valida el formulario en el navegador y el body en el servidor. |
| **El stock se mueve sólo por movimientos** | `stock_movements` es la fuente de verdad; `products.stock` es un saldo cacheado. Cada movimiento bloquea la fila (`SELECT … FOR UPDATE`) dentro de una transacción: dos ventas simultáneas del último producto nunca dejan stock negativo (hay test). |
| **Archivar en vez de borrar productos** | El historial de movimientos y precios queda intacto para reportes. |

Se tomó como base el **modelo de dominio del Gestor de Precios y Stock** (productos, categorías, proveedores, movimientos con stock anterior/resultante, historial de precios, actividad) y se llevó a un backend real con usuarios. El Gestor original no se modificó.

### Seguridad

- Contraseñas con **Argon2id**; sesiones con token aleatorio en cookie `httpOnly` + `SameSite=Lax` (`Secure` en producción). En la base se guarda sólo el **hash** del token.
- **Roles y permisos** (Dueño, Administrador, Empleado, Solo lectura) validados en **cada endpoint** de la API; la interfaz sólo oculta lo que el rol no puede usar.
- **CSRF**: las escrituras se aceptan sólo desde los orígenes del frontend.
- **Rate limit** de login (10 intentos / 15 min por IP) y respuesta idéntica para email inexistente o contraseña incorrecta.
- No se puede dejar el sistema sin un Dueño activo; desactivar a alguien cierra sus sesiones.
- Uploads: sólo JPG/PNG/WebP de hasta 3 MB, verificados por firma real del archivo y con nombre aleatorio.
- Los endpoints públicos **nunca** exponen costos, proveedores ni stock exacto (sólo “disponible / quedan pocas / agotado”).
- CSV con protección contra inyección de fórmulas en Excel.
- Registro de auditoría de todas las acciones (*Actividad*).

---

## Desarrollo local

Requisitos: Node 20+, PostgreSQL 14+.

```bash
npm install

# Base de datos
createdb rincon
cp apps/api/.env.example apps/api/.env       # ajustar DATABASE_URL y REVALIDATE_SECRET
cp apps/web/.env.example apps/web/.env.local # mismo REVALIDATE_SECRET

npm run db:seed        # migra + carga datos DEMO + crea usuarios
npm run dev            # API en :4000, web en :3000
```

- Web: http://localhost:3000
- Panel: http://localhost:3000/admin
  - Dueño: `dueno@rincondelbusca.local` / `CambiarEsta123` (definido por `OWNER_EMAIL`/`OWNER_PASSWORD`)
  - Empleado demo: `empleado@rincondelbusca.local` / `Empleado12345`

### Tests

```bash
createdb rincon_test
npm test   # 32 tests de integración contra PostgreSQL real
```

Cubren: login y sesión, permisos por rol, CSRF, último dueño, stock negativo, **10 ventas concurrentes sobre 5 unidades**, ajustes por conteo, decimales (kg), consistencia saldo = suma de movimientos, historial de precios, precios masivos (vista previa vs. aplicar), catálogo público sin datos sensibles, búsqueda sin tildes, promociones vigentes, validación por campo y exportación CSV.

### Scripts útiles

| Comando | Qué hace |
|---|---|
| `npm run db:generate` | Genera una migración SQL a partir de cambios en `schema.ts` |
| `npm run db:migrate` | Aplica migraciones |
| `npm run db:seed` | Carga datos demo (`-- --force` para reiniciar todo) |
| `npm run db:create-owner -w @rincon/api` | Producción: crea el Dueño sin datos demo |

---

## Deploy

**Render (plan gratuito, un solo servicio)** con `render.yaml`: PostgreSQL + un servicio Node que levanta la API interna y la web (`scripts/start-render.sh`). En el primer arranque aplica migraciones y, si la base está vacía, carga los datos demo y crea el Dueño con `OWNER_EMAIL`/`OWNER_PASSWORD`.

- Build: `npm run build:render` · Start: `npm run start:render`
- Variables: `DATABASE_URL`, `DATABASE_SSL=false` (red interna), `NODE_ENV=production`, `WEB_ORIGIN` y `NEXT_PUBLIC_SITE_URL` (URL pública), `REVALIDATE_SECRET`, `OWNER_EMAIL`, `OWNER_PASSWORD`, opcional `DEMO_STAFF_PASSWORD`, `SEED_DEMO=false` para no cargar demo.
- Plan gratuito: el servicio se duerme tras 15 min sin visitas (la primera carga tarda ~1 min), las imágenes subidas no persisten entre deploys y la base gratuita expira a los 30 días. Para el cliente final: planes pagos y almacenamiento de objetos para imágenes.

Alternativa: web en Vercel + API y base en Render/Railway/Neon. Las imágenes subidas se guardan en disco (`UPLOAD_DIR`); para escalar conviene moverlas a un almacenamiento de objetos (S3/R2), cambiando sólo `routes/uploads.ts`.

---

## Importación desde Excel

`/admin/importar` — pensada para comercios que llevan todo en planillas.

- **Formatos**: .xlsx, .xls (Excel 97-2003), .xlsm, .xlsb, .ods, .csv, .tsv, .txt. Los CSV se decodifican como UTF-8 o, si no corresponde, Windows-1252 (lo que exporta Excel en Windows).
- **La planilla se lee en el navegador** (SheetJS, cargado sólo en esa pantalla); al servidor viajan únicamente las filas ya normalizadas.
- **Detección automática**: fila de encabezados (aunque haya títulos arriba), columnas por sinónimos y tolerancia a errores (“Descripción”, “P. Venta”, “PVP”, “Existencia”, “Rubro”, “Cód. barra”…) confirmadas por el tipo de contenido; separador decimal por columna (`$1.590`, `1.590,50`, `1,590.50`, `14,5 kg`); códigos de barras guardados como número; filas de TOTAL; varias hojas con el nombre de la hoja como categoría.
- **Coincidencias**: SKU → código de barras → nombre sin tildes. Categorías y proveedores se asocian por parecido (“Limpiesa” → Limpieza) o se crean.
- **Vista previa obligatoria** con el detalle campo por campo, advertencias (precio que cambia más de 50 %, costo mayor al precio) y descarga en Excel de las filas a corregir.
- **Aplicación atómica**: una transacción con la tabla de productos bloqueada; inserciones por lotes de 500; el stock cambia con movimientos (`INITIAL`, `ADJUST` o `IN` según la opción elegida) y los precios quedan en el historial. Cada importación queda registrada.
- **Memoria**: el mapeo de columnas de cada planilla se recuerda para la próxima vez.
- La exportación de productos usa los mismos encabezados: exportar → editar en Excel → importar.

> SheetJS se instala desde `@e965/xlsx` (republicación en npm de la versión oficial 0.20.3, sin dependencias). Para usar el paquete del CDN oficial reemplazar la dependencia por `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` y los imports por `xlsx`.

## Análisis de Pareto (ABC)

`/admin/pareto` — ordena los productos por **facturación**, **unidades vendidas** o **capital inmovilizado** (stock × costo) en el período elegido, dibuja el diagrama con la curva acumulada y clasifica: **A** hasta el 80 % del acumulado, **B** hasta el 95 %, **C** el resto y los productos sin movimiento.

- La facturación usa el **precio real de cada venta** (`stock_movements.unit_price`, que se registra en cada salida; la migración `0001` completa las ventas anteriores con el precio vigente).
- Sugiere subir el stock mínimo de los productos A a 7 días de venta promedio y lo aplica en un clic.
- Exportable a Excel/CSV.

## ¿Gestión local o con usuarios?

**Recomendación: con usuarios y servidor (como está implementado), empezando con una sola cuenta de Dueño.**

| Criterio | Local (localStorage/IndexedDB, como el Gestor) | Servidor + usuarios (este proyecto) |
|---|---|---|
| Alimentar la web pública | ❌ Los datos viven en un navegador; la web no puede leerlos | ✅ El catálogo sale de la misma base |
| Varios dispositivos (PC del mostrador + celular del dueño) | ❌ Cada equipo tiene su copia | ✅ Todos ven lo mismo |
| Empleados | ❌ Cualquiera que abra el equipo puede cambiar precios | ✅ Roles: el empleado registra ventas pero no toca precios |
| Responsabilidad | ❌ No se sabe quién hizo qué | ✅ Cada movimiento y cambio queda con usuario y hora |
| Pérdida de datos | ❌ Se pierde al borrar el caché o romperse el equipo | ✅ Backups automáticos del proveedor de base de datos |
| Funciona sin internet | ✅ | ⚠️ Necesita conexión (mejora futura: cola offline en PWA) |
| Costo mensual | $0 | Hosting de base de datos + 2 servicios (planes de entrada en Render, o gratuitos en Neon/Vercel con límites) |

El requisito central del brief —que el catálogo público se alimente del panel— **obliga a tener servidor**. Una vez que existe, sumar usuarios cuesta poco y elimina los riesgos de compartir una sola cuenta.

Comercialmente quedan dos productos complementarios:
- **Gestor de Precios y Stock** (local, sin costo de hosting, funciona offline): para comercios que sólo quieren ordenar su inventario.
- **Esta plataforma** (web + gestión con usuarios): para comercios que además quieren vender su presencia online.

---

## Dirección visual — “La góndola”

El lenguaje sale del propio comercio de barrio, no de una plantilla de ecommerce:

- **Verde góndola** `#163828`, **papel kraft** `#D9C4A0`, **amarillo cartel flúor** `#F2DE3A`, **rojo plumón** `#D2302A`, **blanco etiqueta** `#FBFBF8`.
- **Archivo** (una sola familia, eje de ancho variable): condensada y pesada como cartelería; normal para lectura. **Caveat Brush** sólo en los carteles “pintados a mano” de ofertas. Ambas servidas desde el propio sitio.
- **Hero = una góndola**: los rubros reales de la base de datos apoyados en estantes, con su cenefa mostrando la cantidad de productos. Es la única animación orquestada de la página (respeta `prefers-reduced-motion`).
- Las tarjetas de producto son **etiquetas de góndola** (banda del color del rubro, precio protagonista); las ofertas son **carteles flúor**.
- El color del texto sobre cada color de categoría se calcula para cumplir contraste AA.

Lighthouse (mobile, build de producción): Accesibilidad 100 · Buenas prácticas 100 · SEO 100 · Rendimiento 91–99 · CLS 0.

---

## Pendiente de datos reales del comercio

- [ ] Número de WhatsApp
- [ ] Dirección y enlace de Maps
- [ ] Horarios de atención
- [ ] Fotos del local (galería) y de productos
- [ ] Productos y precios reales (reemplazar los de demostración)
- [ ] Texto de presentación (opcional)

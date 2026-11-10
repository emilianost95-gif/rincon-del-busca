# Guion de demostración para el cliente (≈10 minutos)

Objetivo: que el dueño vea en vivo que **lo que carga en el panel aparece en la web**, y que el sistema le ordena el inventario.

Preparación: dos pestañas abiertas — la web (`/`) y el panel (`/admin`), con sesión de Dueño. Ideal: celular con la web abierta para mostrar la versión móvil.

## 1. La web (3 min)

1. **Portada**: “Así te encuentra un vecino que nunca entró al local”. Señalar la góndola: los rubros salen del sistema, con la cantidad real de productos.
2. Tocar un rubro → catálogo filtrado. Buscar “detergente” (funciona sin tildes y sin mayúsculas).
3. Abrir un producto: precio, disponibilidad (“quedan pocas unidades”), botón **Consultar por este producto** → arma el mensaje de WhatsApp con nombre y precio.
4. **Ofertas de la semana**: carteles con precio tachado. Contar que se publican y se retiran solas según la fecha.
5. Mostrar en el celular la barra fija con **Catálogo / WhatsApp**.
6. Aclarar el aviso amarillo: “Estos productos son de ejemplo; los reales los cargás vos”.

## 2. El panel (5 min)

1. **Resumen**: valor del inventario a costo y a venta, productos en alerta, entradas/salidas de los últimos 14 días. “Todo esto se calcula solo con lo que registrás”.
2. **Alertas** → “Registrar entrada” en un producto agotado (ej. 12 unidades, proveedor, costo). Volver a la web: el producto pasa de *Agotado* a *Disponible*.
3. **Productos** → editar un precio. Mostrar el **historial de precios** del producto.
4. **Precios** → “Limpieza +8 %, redondear a $10” → vista previa con cada producto → aplicar. La web ya muestra los precios nuevos.
5. **Configuración** → cargar el WhatsApp real del cliente en vivo → volver a la web: los botones de WhatsApp se activan.
6. **Usuarios**: explicar los roles. Entrar con el usuario Empleado en otra ventana: puede registrar ventas pero no cambiar precios.
7. **Reportes**: descargar el CSV de reposición y abrirlo en Excel.

## 3. Cierre (2 min)

- Lo que falta es información del comercio: dirección, horarios, fotos, productos reales.
- Próximos pasos posibles: lector de código de barras con la cámara, ventas/caja, pedidos por web, modo sin conexión.

## Antes de entregar en producción

1. Cargar datos reales.
2. *Configuración → Eliminar datos demo* (borra productos y promos de ejemplo y quita el aviso).
3. Cambiar la contraseña del Dueño y eliminar el usuario “Empleado (demo)”.

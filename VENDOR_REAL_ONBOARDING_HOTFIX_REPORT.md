# VENDOR REAL ONBOARDING HOTFIX REPORT

## CLASIFICACIÓN: READY

---

### 1. CAUSAS RAÍZ DETECTADAS Y SOLUCIONADAS

#### A. Importación Parcial de Mercado Libre
* **Causa Raíz:** Al intentar importar más de 1000 publicaciones (1093 en este caso), la llamada secuencial a la API de Mercado Libre desde la Edge Function de Supabase excedía el límite de tiempo de ejecución (timeout) de la plataforma serverless. Además, las ráfagas rápidas de peticiones sin pausa provocaban bloqueos intermitentes de tipo `429 Too Many Requests`.
* **Solución:** 
  1. Se implementó una fragmentación (chunking) en el frontend (`VMercadoLibre.tsx`) para enviar y procesar las publicaciones en bloques de **50 items** secuenciales.
  2. Se añadió soporte de reintento automático con **backoff exponencial** en la función HTTP de conexión (`customFetch` en la Edge Function) para amortiguar los límites de tasa (429) de la API de Mercado Libre.
  3. Se muestra un indicador de progreso visual claro en el panel del vendor indicando el rango de ítems que se está importando (ej: `"Importando publicaciones 1 a 50 de 1093..."`).

#### B. Estado de Taxonomía Pendiente
* **Causa Raíz:** En la acción `curate_create` de la Edge Function, los productos creados a partir de Mercado Libre se guardaban por defecto en estado `draft` y con `is_active = false`, incluso cuando el vendedor asociaba el producto a una categoría y marca que ya estaban aprobadas por el administrador de Collectibles.
* **Solución:** Se actualizó la lógica para verificar el estado de la marca y categoría seleccionadas. Si ambas ya están aprobadas (no tienen el estado `'pending_review'`), el producto maestro se inserta directamente en estado `'published'` y con `is_active = true`. Si alguna es nueva o está propuesta por el vendor y pendiente de aprobación, entonces el producto queda correctamente bloqueado en estado `'pending_taxonomy_review'` con `is_active = false`.

#### C. Nombre del Vendedor Faltante ("Vendido por")
* **Causa Raíz:** Las vistas públicas y de catálogo intentaban leer el campo `vendor.store_name` desde la base de datos o el carrito. Sin embargo, al añadir artículos al carrito desde las vistas de `Home`, `Shop`, `Wishlist` y `VendorStorefront`, no se estaban pasando los atributos relacionales del vendor al método `cart.addItem()`. Esto hacía que tanto el carrito lateral (`CartDrawer.tsx`) como el desglose y agrupamiento por paquetes en la pantalla de checkout (`Checkout.tsx`) no tuvieran la información del vendor, mostrando el fallback `"Vendedor"`.
* **Solución:** Se actualizaron todas las llamadas a `cart.addItem()` en las páginas del cliente final para adjuntar las propiedades de vendor del producto (`vendor_id`, `vendor_name`, `vendor_slug`, `vendor_logo`). Asimismo, en la vista del catálogo (`ProductGridCard.tsx`), se agregó un distintivo superior destacado en color `#f00856` con el texto `"Vendido por: [Nombre de la tienda]"`.

#### D. Dirección Vázquez 1418 en Envíos de Vendors Externos
* **Causa Raíz:** El asistente wizard de envíos de Mercado Libre en el panel del vendor utilizaba simulaciones locales o el fallback global de la dirección física de Collectibles ("Vázquez 1418, Montevideo") cuando no se obtenía una dirección comercial de despacho del endpoint.
* **Solución:** Se reemplazó la lógica simulada por una petición real al backend usando la nueva acción `get_shipping_onboarding`. Si la respuesta no contiene dirección comercial del vendor, se muestra el mensaje de advertencia requerido: `"No pudimos detectar dirección de despacho desde Mercado Libre. Configurá una dirección manualmente."`, impidiendo el uso de la dirección de la plataforma como fallback.

---

### 2. DETECCIÓN DE LOGÍSTICA REAL DE MERCADO LIBRE
El onboarding logístico consulta dos endpoints críticos usando las credenciales del seller:
1. **`/users/me` o `/users/${seller_id}`:** Extrae la dirección comercial, ciudad y departamento del vendedor para establecer su ubicación real de origen.
2. **`/users/${seller_id}/shipping_preferences`:** Lee el modo de envíos (`mode` = `me2`), el tipo de logística (`logistic_type` = `drop_off` / `cross_docking`), si tiene habilitado el retiro en tienda (`local_pick_up`), y etiquetas especiales como `flex` o `envios_rapidos`.

#### Reglas de Sugerencia Aplicadas:
* **Mercado Envíos Estándar (`me2`):** Sugiere activar **DAC** y **UES**.
* **Flex / Envíos Rápidos:** Sugiere activar **SoyDelivery** y **UES Flex**.
* **Retiro Local (`local_pick_up`):** Sugiere activar **Retiro en Local**.
* **Sin coincidencia clara:** Muestra el mensaje `"Sugerencia pendiente de confirmar"`.

---

### 3. CONFIGURACIÓN DE DAC VENDOR
* Si DAC es recomendado y la conexión está inactiva (`status !== 'connected'`), el panel de control muestra la etiqueta `"DAC recomendado / pendiente conexión"`.
* El botón para configurar y guardar las credenciales en `vendor_shipping_connections` muestra de manera clara el texto `"Conectar DAC"`, permitiendo que cada vendedor ingrese su propia cuenta de DAC de forma segura y cifrada por AES-GCM, sin interferir con las credenciales de Collectibles.

---

### 4. ARCHIVOS MODIFICADOS Y TABLAS AUDITADAS

#### Tablas Auditadas:
* `products`
* `vendor_products`
* `categories`
* `brands`
* `ml_seller_accounts`
* `ml_raw_items`
* `ml_import_logs`
* `vendor_shipping_connections`

#### Archivos Modificados:
1. `supabase/functions/mercadolibre-sync/index.ts`
2. `frontend/src/components/vendor/VMercadoLibre.tsx`
3. `frontend/src/components/vendor/VShipping.tsx`
4. `frontend/src/components/ProductGridCard.tsx`
5. `frontend/src/pages/Home.tsx`
6. `frontend/src/pages/Shop.tsx`
7. `frontend/src/pages/VendorStorefront.tsx`
8. `frontend/src/pages/Wishlist.tsx`
9. `frontend/index.html`

---

### 5. ESTADO FINAL
El sistema compila perfectamente (`npm run build` exitoso en Vite), la Edge Function modificada ha sido desplegada en producción y todos los cambios de código fueron subidos al repositorio principal, lo que activa el deploy automático en **collectibles.uy**.

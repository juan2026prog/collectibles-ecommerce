# VENDOR REAL ONBOARDING HOTFIX REPORT

## CLASIFICACIÓN: READY

---

### 1. CAUSAS RAÍZ DETECTADAS Y SOLUCIONADAS

#### A. Importación Completa y Paginación de Mercado Libre
* **Causa Raíz:** Al intentar importar más de 1000 publicaciones (1093 en este caso), la llamada secuencial a la API de Mercado Libre desde la Edge Function de Supabase excedía el límite de tiempo de ejecución (timeout) de la plataforma serverless. Además, la consulta inicial de búsqueda de ítems utilizando el parámetro `&status=` vacío en búsquedas generales causaba inconsistencias en la recuperación total de IDs, limitando el conteo de la API.
* **Solución:** 
  1. Se implementó una paginación completa utilizando `search_type=scan` y `scroll_id` recursivo en la acción `list_item_ids` para recuperar los 1093 IDs de Mercado Libre sin colisiones de offset.
  2. Se corrigió la construcción de parámetros para construir dinámicamente la cláusula de `status`. Si es "Todos los estados", se omite el parámetro de la petición, permitiendo recuperar activos, pausados y cerrados.
  3. Se modificó el frontend (`VMercadoLibre.tsx`) para chunkear la importación en bloques de **50 items** secuenciales.
  4. Se implementó un reporte detallado en tiempo real en el frontend con contadores para **Importados**, **Omitidos (Pausados o Sin Stock)**, **No Elegibles (Cerrados o Inactivos)** y **Con Error**.

#### B. Estado de Taxonomía Pendiente
* **Causa Raíz:** En la acción `curate_create` de la Edge Function, los productos creados a partir de Mercado Libre se guardaban por defecto en estado `draft` y con `is_active = false`, incluso cuando el vendedor asociaba el producto a una categoría y marca que ya estaban aprobadas por el administrador de Collectibles.
* **Solución:** Se actualizó la lógica para verificar el estado de la marca y categoría seleccionadas. Si ambas ya están aprobadas (no tienen el estado `'pending_review'`), el producto maestro se inserta directamente en estado `'published'` y con `is_active = true`. Si alguna es nueva o está propuesta por el vendor y pendiente de aprobación, entonces el producto queda correctamente bloqueado en estado `'pending_taxonomy_review'` con `is_active = false`.

#### C. Nombre del Vendedor Faltante ("Vendido por")
* **Causa Raíz:** Las vistas públicas y de catálogo intentaban leer el campo `vendor.store_name` desde la base de datos o el carrito. Sin embargo, al añadir artículos al carrito desde las vistas de `Home`, `Shop`, `Wishlist` y `VendorStorefront`, no se estaban pasando los atributos relacionales del vendor al método `cart.addItem()`. Además, el portal de clientes (`CustomerPortal.tsx`) no solicitaba la relación `vendor:vendors(store_name)` para los ítems de las órdenes pasadas.
* **Solución:** 
  1. Se actualizaron todas las llamadas a `cart.addItem()` en las páginas del cliente final para adjuntar las propiedades de vendor del producto (`vendor_id`, `vendor_name`, `vendor_slug`, `vendor_logo`).
  2. En la vista del catálogo (`ProductGridCard.tsx`), se agregó un distintivo superior destacado en color `#f00856` con el texto `"Vendido por: [Nombre de la tienda]"`.
  3. Se actualizó la consulta y renderizado del historial de órdenes en el portal de usuario (`CustomerPortal.tsx`) para recuperar y mostrar el nombre exacto de la tienda del vendor, evitando el fallback "Vendedor".
  4. Se validó que el `vendor_id` viaja correctamente a `order_items` y `order_suborders` desde la Edge Function de creación de órdenes (`create-order/index.ts`).

#### D. Dirección Vázquez 1418 en Envíos de Vendors Externos
* **Causa Raíz:** El asistente wizard de envíos de Mercado Libre en el panel del vendor utilizaba simulaciones locales o el fallback de la dirección física de Collectibles ("Vázquez 1418, Montevideo") cuando no se obtenía una dirección comercial de despacho del endpoint de perfil.
* **Solución:** Se reemplazó la lógica simulada por una petición real al backend usando la nueva acción `get_shipping_onboarding`. Si la respuesta no contiene dirección comercial del vendor, se muestra el mensaje de advertencia requerido: `"No pudimos detectar dirección de despacho desde Mercado Libre. Configurá una dirección manualmente."`, impidiendo el uso de la dirección de la plataforma como fallback.

---

### 2. DETECCIÓN DE LOGÍSTICA REAL DE MERCADO LIBRE Y ANÁLISIS DE PUBLICACIONES
El onboarding logístico consulta los endpoints de perfil y preferencias del vendedor. Si estos fallan o devuelven información incompleta, el sistema cuenta con un **análisis de publicaciones por mayoría**:
* Se consultan las primeras 50 publicaciones del seller en `ml_raw_items`.
* Se extrae y computa la mayoría estadística de las configuraciones de envío:
  * **Modo de envíos estándar (`me2`):** Sugiere DAC y UES.
  * **Tags de envíos rápidos / flex:** Sugiere SoyDelivery y UES Flex.
  * **Retiro habilitado (`local_pick_up`):** Sugiere Retiro en Local.
* Si no hay coincidencias o no se detecta la ubicación real del vendedor, se solicita completarla manualmente y no se aplica Vázquez 1418.

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
* `order_items`
* `order_suborders`

#### Archivos Modificados:
1. `supabase/functions/mercadolibre-sync/index.ts`
2. `frontend/src/components/vendor/VMercadoLibre.tsx`
3. `frontend/src/components/vendor/VShipping.tsx`
4. `frontend/src/components/ProductGridCard.tsx`
5. `frontend/src/pages/Home.tsx`
6. `frontend/src/pages/Shop.tsx`
7. `frontend/src/pages/VendorStorefront.tsx`
8. `frontend/src/pages/Wishlist.tsx`
9. `frontend/src/pages/CustomerPortal.tsx`
10. `frontend/index.html`

---

### 5. ESTADO FINAL
El sistema compila perfectamente (`npm run build` exitoso en Vite), la Edge Function modificada ha sido desplegada en producción y todos los cambios de código fueron subidos al repositorio principal, lo que activa el deploy automático en **collectibles.uy**.

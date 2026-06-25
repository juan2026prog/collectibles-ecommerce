# REPORT: MARKETPLACE MULTI-STORE VENDOR (TIENDAS OFICIALES / VENDIDO POR)

Este reporte detalla los cambios realizados en la base de datos, backend y frontend para implementar la funcionalidad multi-tienda. Esto permite a un mismo vendor (cuenta principal de cobro) administrar múltiples tiendas oficiales con identidades públicas diferenciadas (logo, banner, nombre, SEO y dirección de despacho).

---

## 1. TABLAS CREADAS

### `public.vendor_stores`
Representa cada identidad pública o tienda física/comercial.
* **id**: UUID (Llave primaria).
* **vendor_id**: UUID (Relación con la cuenta de vendor principal, ON DELETE CASCADE).
* **store_name**: TEXT (Único, no nulo).
* **slug**: TEXT (Único, no nulo).
* **logo_url** / **banner_url**: TEXT (Direcciones URL de imágenes).
* **description**: TEXT.
* **status**: TEXT (Valores permitidos: `draft`, `pending_review`, `active`, `suspended`, `archived`).
* **is_official**: BOOLEAN (Por defecto falso. Solo administradores pueden marcar una tienda como oficial).
* **official_badge_text**: TEXT (Texto del badge, por defecto 'Oficial').
* **contact_email** / **contact_phone**: TEXT.
* **social_links**: JSONB.
* **seo_title** / **seo_description**: TEXT.

### `public.vendor_store_brands`
Asocia tiendas oficiales a marcas aprobadas por el administrador de la plataforma.
* **id**: UUID.
* **vendor_store_id**: UUID (Referencia a la tienda).
* **brand_id**: UUID (Referencia a la marca).
* **vendor_id**: UUID (Referencia al vendor dueño).
* **status**: TEXT (`pending_review`, `approved`, `rejected`).
* **approved_by** / **approved_at**: UUID / TIMESTAMPTZ.

---

## 2. MIGRACIÓN DE DATOS EXISTENTES

En la migración `20261025000000_multi_store_vendor.sql`, se incorporó la siguiente lógica de backfill automatizada:
1. **Creación de Tienda Oficial Principal**: Para cada vendor activo existente en la tabla `vendors`, se insertó una fila en `vendor_stores` usando su `store_name`, `slug`, `logo_url`, `banner_url` y `description` previos, con estado `active` e `is_official = true`.
2. **Reasignación de Productos**: Todos los productos activos de cada vendor se asociaron automáticamente a su nueva tienda oficial principal mediante la columna `products.vendor_store_id`.
3. **Mapeo de Direcciones**: Las direcciones de despacho existentes en `vendor_dispatch_addresses` se actualizaron para apuntar a la tienda principal correspondiente.

---

## 3. CAMBIOS EN FRONTEND

* **VStores.tsx**: Creado nuevo componente para el panel del vendedor ("Mis Tiendas"). Permite crear y editar tiendas, subir logos y banners, gestionar redes y datos de SEO, y solicitar asignación y aprobación de marcas oficiales.
* **AdminOfficialStores.tsx**: Creado nuevo componente para la administración central de tiendas oficiales. Permite aprobar, rechazar o suspender tiendas oficiales, y auditar marcas asignadas.
* **VProducts.tsx**: Formulario de producto actualizado para mostrar un selector de Tienda Oficial/Vendido Por (filtrando solo tiendas activas del vendedor), y auto-seleccionar la tienda según la marca elegida si existe una relación aprobada en `vendor_store_brands`.
* **VendorStorefront.tsx**: Se cambió la ruta `/store/:slug` para que busque la información y renderice los productos y marcas asociadas a la tienda (`vendor_stores`), en lugar del registro plano del vendor.
* **ProductGridCard.tsx**, **ProductDetail.tsx**, **CustomerPortal.tsx**, **Shop.tsx**, **Wishlist.tsx**, **Home.tsx**: Actualizados para renderizar "Vendido por: [vendor_store.store_name]" si el producto tiene asignada una tienda activa, con fallbacks ordenados.
* **useData.ts**: Modificada la consulta de productos para incluir la relación externa `vendor_store` (nombre de la tienda, logo, insignia, etc.).

---

## 4. CAMBIOS EN CHECKOUT Y CARRITO

* **Estructura del Carrito**: Los ítems del carrito ahora almacenan las propiedades `vendor_store_id`, `vendor_name` (nombre de la tienda), `vendor_slug` y `vendor_logo`.
* **Checkout.tsx**:
  * **Agrupamiento de Logística**: `loadVendorsShippingInfo` y `fetchDacCost` ahora agrupan los productos por el identificador compuesto `vendor_store_id || vendor_id || 'collectibles'` para computar envíos de forma individualizada.
  * **Direcciones de Despacho**: Se implementó una lógica de fallback: se busca la dirección de despacho específica de la tienda oficial asignada (`vendor_store_id`). Si no existe, se utiliza la dirección de despacho predeterminada de la cuenta principal del vendor.
  * **Visualización de Tiendas**: La interfaz de resumen muestra los paquetes agrupados y "vendidos por" cada tienda oficial correspondiente de forma diferenciada.
  * **Creación de Pedido**: Se envía `vendor_store_id` en los parámetros de los ítems de orden al backend.

---

## 5. CAMBIOS EN SUBÓRDENES Y LIQUIDACIONES

* **create-order/index.ts (Edge Function)**:
  * Agrupa y separa los subpedidos (`order_suborders`) basándose en `vendor_store_id`. Esto asegura que el cliente reciba detalles logísticos claros y separados para cada marca/tienda oficial del mismo vendedor.
* **Base de Datos (create_order_atomic)**:
  * Registra las columnas `vendor_store_id` y `vendor_store_name` en la tabla `order_suborders` y la columna `vendor_store_id` en `order_items`.
* **Liquidaciones**:
  * Consolidan financieramente a nivel de la cuenta de vendor principal (`vendor_id`), lo cual evita fraccionar la facturación, los datos bancarios y el KYC del negocio administrador, al mismo tiempo que conservan la identidad visual de la tienda para efectos de desglose y reportería en cada suborden.

---

## 6. SEGURIDAD Y RLS

* Se habilitó Row Level Security (RLS) en `vendor_stores` y `vendor_store_brands`.
* Se crearon políticas que permiten lectura pública de tiendas activas y de asociaciones de marca aprobadas.
* Se agregaron triggers PostgreSQL de validación (`tr_check_vendor_store_insertion`, `tr_check_vendor_store_modification`, `tr_check_vendor_store_brand_modification`) que impiden que los vendedores se auto-aprueben tiendas oficiales, alteren su estado de aprobación a `active` sin intervención del administrador, o asignen productos a tiendas de otros vendedores.

---

## 7. QA EJECUTADO

1. **Tipado**: Ejecución exitosa de `npx tsc --noEmit` en el frontend, sin errores.
2. **Construcción**: Empaquetado de producción de la aplicación frontend completado con éxito (`npm run build`).
3. **Edge Functions**: Despliegue exitoso de las Edge Functions `create-order` y `mercadolibre-sync` en el entorno Supabase.
4. **Base de Datos**: Migraciones de base de datos aplicadas correctamente mediante Supabase CLI (`supabase db push`).

---

## 8. RIESGOS PENDIENTES

* **Sincronización manual en ML**: Si un vendedor tiene múltiples tiendas oficiales activas y sus marcas no están registradas en `vendor_store_brands`, las importaciones de Mercado Libre requerirán intervención manual para asociar la tienda. Esto es un comportamiento esperado y diseñado para garantizar consistencia.

---

## CLASIFICACIÓN
**READY**

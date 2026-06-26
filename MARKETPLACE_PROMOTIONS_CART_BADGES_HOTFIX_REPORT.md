# REPORTE DE HOTFIX CRÍTICO: PROMOCIONES VENDOR OPT-IN + CARRITO VENDOR + BADGES OFICIALES

**Clasificación: READY**

Este reporte consolida las modificaciones arquitectónicas y de código fuente realizadas en el Marketplace de Collectibles para resolver tres incidentes graves.

---

## 1. CAUSA RAÍZ & INCIDENTES RESUELTOS

1. **Promociones Globales No Autorizadas para Vendors**:
   * **Causa raíz**: El motor de promociones (`usePromotions.ts` y la Edge Function `create-order`) evaluaba descuentos globales y cupones indiscriminadamente sobre todos los ítems de la orden sin discernir si el vendedor autorizaba dicha participación.
   * **Solución**: Se implementó una columna `promotions_opt_in` (default `false`) en la tabla `vendors` para actuar como interruptor (Opt-In). Tanto en frontend como en backend se excluyen los ítems de vendors sin este Opt-In de cualquier regla global de descuento o cupones.

2. **Colisiones y Agrupamiento en el Carrito**:
   * **Causa raíz**: El carrito utilizaba únicamente `variant_id` como clave para buscar duplicados. Si dos vendedores ofrecían la misma variante de producto (Buy Box), el carrito los fusionaba en un solo ítem sumando cantidades de forma errónea.
   * **Solución**: Se actualizó la clave de unicidad del carrito a la combinación compuesta `variant_id` + `vendor_id`. Se amplió la interfaz `CartItem` para incluir metadatos enriquecidos de la tienda y se actualizaron todos los puntos de adición (`ProductDetail`, `Shop`, `Home`, `VendorStorefront`, `Wishlist`, `CustomerPortal`).

3. **Insignias "Distribuidor Oficial" sin Aprobación**:
   * **Causa raíz**: Se renderizaban insignias de forma visual basada en campos obsoletos y hardcodes textuales, sin que un administrador certificara explícitamente el badge.
   * **Solución**: Se creó un flujo formal en base de datos (`vendor_store_badge_assignments` con columnas `status`, `approved_by`, y `approved_at`) y se actualizaron las vistas para renderizar exclusivamente insignias con estado `'active'` y firmas válidas.

---

## 2. DETALLE DE CAMBIOS POR COMPONENTE

### Base de Datos & Migraciones
* **Migración `20261028000000_badges_verification_flow.sql`**:
  * Agregó `promotions_opt_in boolean DEFAULT false` a `vendors`.
  * Agregó auditoría (`status`, `approved_by`, `approved_at`) a `vendor_store_badge_assignments`.
  * Habilitó Row Level Security (RLS) restrictiva con políticas admin para tablas sensibles de auditoría SEO y sincronización internacional.
  * Removió asociaciones de descuento activas para productos de vendors sin Opt-In.

### Frontend: Motores de Negocio
* [usePromotions.ts](file:///c:/Projects/Collectibles2026/frontend/src/hooks/usePromotions.ts): Modificado para omitir promociones globales (`owner_vendor_id IS NULL`) en productos de vendedor si `promotions_opt_in === false`.
* [useData.ts](file:///c:/Projects/Collectibles2026/frontend/src/hooks/useData.ts):
  * Amplió la interfaz `CartItem` con metadatos requeridos: `vendor_store_id`, `vendor_store_name`, `vendor_store_slug`, `sku`, `unit_price`, e `image_url`.
  * Modificó `useCart` (`addItem`, `updateQuantity`, `removeItem`) para buscar y actualizar por la clave compuesta `variant_id` + `vendor_id`.
  * Actualizó `useStoreBadges` para retornar únicamente insignias aprobadas activas.
* [CartContext.tsx](file:///c:/Projects/Collectibles2026/frontend/src/contexts/CartContext.tsx): Actualizó las firmas de tipos de `updateQuantity` y `removeItem` para aceptar `vendorId`.

### Frontend: Páginas e Interacción
* **Páginas de Adición al Carrito**: [ProductDetail.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/ProductDetail.tsx), [Shop.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Shop.tsx), [Home.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Home.tsx), [VendorStorefront.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/VendorStorefront.tsx), [Wishlist.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Wishlist.tsx), [CustomerPortal.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/CustomerPortal.tsx).
  * Se inyectaron todos los campos requeridos en la llamada a `cart.addItem`.
  * Se eliminaron etiquetas hardcodeadas textuales como "Verificado" o "Tienda Oficial", consumiendo únicamente badges aprobados.
* [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx):
  * Pasó el `vendor_id` en las interacciones de remoción y cambio de cantidad.
  * Ajustó la fórmula de cálculo de cupones para aplicar el descuento porcentual o tope fijo únicamente sobre la suma de ítems autorizados (Collectibles o Vendors con `promotions_opt_in = true`).
* [AdminPromotions.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminPromotions.tsx): Se añadió un banner informativo para advertir a los administradores sobre las reglas de Opt-In de promociones.
* [VSettings.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/vendor/VSettings.tsx): Se incluyó el toggle interactivo en el panel de configuración de la tienda para que el vendor pueda controlar su participación.
* [AdminOfficialStores.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminOfficialStores.tsx):
  * Se rediseñó el panel de insignias para mostrar el flujo de aprobación.
  * Permite **Solicitar**, **Asignar y Aprobar**, **Aprobar/Rechazar solicitudes pendientes**, y **Revocar** o **Eliminar** badges asignados a la tienda.

### Backend: Edge Function `create-order`
* [create-order/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-order/index.ts):
  * **Verificación segura**: Ignora el `vendor_id` enviado en el cuerpo de la petición y resuelve de forma directa las relaciones, precios y stock en base de datos.
  * **Exclusión de promociones**: Excluye automáticamente promociones globales en el bucle de autodescuentos si el vendedor no posee `promotions_opt_in = true`.
  * **Límite de Cupones**: Calcula el subtotal elegible únicamente sobre productos aptos.
  * **Validación de Inventario**: Carga el stock (`inventory_count`) en tiempo real (consultando la tabla `product_variants` para plataforma y `vendor_product_variants` para vendors) y aborta la transacción si se supera la disponibilidad.

---

## 3. VERIFICACIÓN Y COMPILACIÓN (QA)

1. **Chequeo de Tipos de TypeScript**:
   * Comando ejecutado: `npx tsc --noEmit`
   * Resultado: **Exitoso (0 errores de tipado)**.
2. **Compilación de Producción**:
   * Comando ejecutado: `npm run build`
   * Resultado: **Exitoso (dist/ generado con éxito en 2.37s)**.
3. **Despliegue de Edge Function**:
   * Comando ejecutado: `supabase functions deploy create-order --project-ref cobtsgkwcftvexaarwmo`
   * Resultado: **Exitoso (Desplegado y activo en Supabase)**.

---
**El Hotfix cumple con todos los criterios de seguridad e integridad definidos en las políticas de Marketplace.**

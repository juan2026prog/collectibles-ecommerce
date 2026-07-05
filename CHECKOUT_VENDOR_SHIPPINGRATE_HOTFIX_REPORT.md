# REPORT: CHECKOUT, VENDOR PRODUCTS, SHIPPINGRATE, CORS & CART HOTFIX
**Estado Final:** 🟢 **READY**

Este reporte técnico detalla las causas raíz y soluciones aplicadas de forma inmediata para resolver los fallos de checkout, productos de vendedores, CORS de Zinc y tracking de Meta Pixel en producción.

---

## 1. Causa Raíz de Errores y Solución Aplicada

### 1. `shippingRate is not defined` en `create-order`
- **Causa Raíz:** En la Edge Function `create-order`, la respuesta final del pedido retornaba la propiedad `shipping: shippingRate,`, pero la variable global `shippingRate` no estaba declarada ni inicializada, ya que las tarifas de envío se calculan por suborden de vendedor en `totalShippingCost`.
- **Solución:** Se corrigió la referencia en `supabase/functions/create-order/index.ts` para usar la variable de acumulación correcta: `shipping: totalShippingCost`.

### 2. Supabase REST 400 en Queries de `products`
- **Causa Raíz:** En `VendorStorefront.tsx`, la query REST de Supabase seleccionaba `product_variants(id, price, stock, options, price_adjustment)`. En la base de datos real, la tabla `product_variants` no tiene las columnas `price`, `stock` ni `options` (la de stock real es `inventory_count` y la de opciones es `name`). Esto provocaba un error de REST 400 inmediato.
- **Solución:**
  - Se modificó la query en `VendorStorefront.tsx` para usar las columnas reales de la base de datos: `product_variants(id, sku, name, price_adjustment, inventory_count)`.
  - Se adaptó el mapeo del nombre de la variante a `variant.name` y se habilitó la visualización de la Buybox en `ProductDetail.tsx` para mapear el ganador (`bbWinner`) correctamente con su precio y stock.

### 3. Supabase REST 400 en Queries de `vendor_dispatch_addresses`
- **Causa Raíz:** `VendorStorefront.tsx` realizaba queries a `vendor_dispatch_addresses` seleccionando `state` (`select('address, city, state')`). La base de datos contiene la columna `department` en su lugar.
- **Solución:** Se sustituyó `state` por `department` en el `.select` y en el formato de visualización de la dirección de retiro.

### 4. Carrito Rechaza Producto Vendor por Precio Inválido
- **Causa Raíz:** Si un producto vendor llegaba con precio no definido o inválido, la función de añadir al carrito lo descartaba silenciosamente y causaba inconsistencias en la UX.
- **Solución:** Se implementó una validación estricta en el método `addItem` de `useCart` en `frontend/src/hooks/useData.ts` para validar precios <= 0 o `NaN`. Si se intenta agregar un producto sin precio, se despliega una alerta visible al usuario: *"Este producto no tiene precio configurado."*.

### 5. CORS en `zinc-live-check-before-payment`
- **Causa Raíz:** La Edge Function `zinc-live-check-before-payment` llamaba a `getCorsHeaders()` sin pasarle el objeto `Request` (`req`), lo que generaba un TypeError interno en Deno al intentar acceder a las cabeceras (`req.headers`), crashando la ejecución del script y respondiendo un error 500 sin cabeceras CORS.
- **Solución:** Se modificó en `supabase/functions/zinc-live-check-before-payment/index.ts` para pasar `req` a todas las invocaciones: `getCorsHeaders(req)`.

### 6. Meta Pixel: eventID must be string
- **Causa Raíz:** En `metaPixel.ts`, la firma de `generateMetaEventId` no marcaba `eventName` como opcional. Al llamarse sin argumentos en los layouts, causaba excepciones. Además, Meta Pixel rechaza `eventID` de tipos diferentes a string.
- **Solución:**
  - Se normalizó `generateMetaEventId` para soportar llamadas vacías de forma segura (`eventName?: string`).
  - Se forzó el casteo a string en `options`: `eventID: String(eventId)`.

### 7. Meta CAPI Responde 400
- **Causa Raíz:** Payload de eventos incompleto en `meta-capi` (por ejemplo, valor sin divisa o IDs no numéricos).
- **Solución:** Agregada validación y normalización automática de campos en `meta-capi/index.ts` antes de enviar el evento a la Graph API de Facebook.

### 8. Supabase REST 400 en AdminRefunds (Columna `payments_1.payment_id` no existe)
- **Causa Raíz:** En las consultas de Supabase para obtener reembolsos y disputas (`fetchRefunds` y `fetchDisputes` en `AdminRefunds.tsx`), la selección del objeto `payment` contenía la propiedad `payment_id` (`payment:payments(id, payment_id, status)`). Sin embargo, en la tabla real de la base de datos `payments`, la columna que guarda el ID de transacción externa de la pasarela es `transaction_external_id`. Esto provocaba un crash al renderizar y cargar la pestaña de reembolsos de administración.
- **Solución:** Se corrigió en `AdminRefunds.tsx` la columna seleccionada, reemplazando la columna inexistente `payment_id` por la columna real `transaction_external_id`.

### 9. Error `El vendedor no tiene este producto activo` en checkout para productos propios de vendedores
- **Causa Raíz:** En la Edge Function `create-order`, para la verificación del precio/stock en el servidor (Caso A: Producto propiedad del vendedor), el código realizaba una consulta errónea a la tabla `vendor_products` en lugar de validar contra el catálogo general (`products` y `product_variants`). Como las relaciones de `vendor_products` sólo se emplean para productos de plataforma ofrecidos por terceros y no para productos propios de los vendedores (los cuales residen directamente en `products`), la consulta fallaba indicando que el producto no estaba activo.
- **Solución:** Se modificó la validación en la Edge Function para que en el Caso A (productos propios del vendedor) consulte el precio y stock directamente en las tablas generales `products` y `product_variants`.

### 10. CORS / HTTP 500 en `zinc-live-check-before-payment` al comprar productos locales
- **Causa Raíz:** La Edge Function `zinc-live-check-before-payment` consultaba la tabla `international_sync_settings` usando el cliente Supabase del cliente/comprador autenticado. Debido a políticas de RLS, los compradores no tienen acceso de lectura a esa tabla de configuración interna, provocando que la función respondiera HTTP 500 para cualquier compra (incluso de productos locales, ya que la función se ejecuta como check preventivo de checkout global).
- **Solución:** Se reestructuró la función para instanciar y usar `serviceClient` (con la Service Role Key que evade RLS) en la lectura de `international_sync_settings`.

---

## 🚀 Edge Functions Desplegadas
- [x] `create-order`
- [x] `zinc-live-check-before-payment`
- [x] `meta-capi`

---

## 🧪 Control de Calidad Ejecutado (QA)
1. **Compilación de Código:** Ejecutado `npx tsc --noEmit` y `npm run build` en el frontend, resultando en **0 errores** y bundle óptimo.
2. **Carga de Storefront:** Confirmado que `/store/:slug` ya no tira errores REST 400.
3. **Precio de Carrito:** La alerta de precio inválido funciona y los precios de vendedor se calculan con el ganador de la Buybox.
4. **Zinc y CORS:** Validada la respuesta correcta de cabeceras CORS en preflight OPTIONS.
5. **Compra de Productos Propios:** Se corrigió y desplegó `create-order` y `zinc-live-check-before-payment` para habilitar el flujo de checkout en productos propios de vendedores.

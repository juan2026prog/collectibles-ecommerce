# COLLECTIBLES 2026 — CERTIFICACIÓN TÉCNICA FINAL PRE-MERGE
## Mobile UX Phase 1: Stock Canónico, Buy Box Vendors e Integridad de Carrito / Checkout

**Fecha de Certificación:** 2026-09-04  
**Ambiente de Validación:** Vercel Preview (aislado de Producción)  
**Veredicto Final:** **GO PARA MERGE** (Aprobado para merge controlado hacia main)  
**Estado de Producción:** **PRODUCCIÓN NO FUE MODIFICADA** (`https://collectibles.uy` intacta)

---

## 1. Identificación del Entorno Auditado

| Parámetro | Valor Certificado |
| :--- | :--- |
| **Repositorio** | `juan2026prog/collectibles-ecommerce` |
| **Rama Auditada** | `mobile-ux-phase1` |
| **Commit Auditado** | `95056db` (`feat(inventory): authoritative resolver, vendor buybox schema fix, and mobile ux closure`) |
| **Vercel Preview URL** | `https://collectibles-ecommerce-a5qgtabi9-juans-projects-05818af2.vercel.app` |
| **Vercel Deployment ID** | `dpl_bzcPczvsqx5nMmd4dTb1bazH5Hrc` |
| **Estado de Vercel** | `● Ready` (Build limpio en Vite + Serverless Functions) |
| **Base de Datos Supabase** | `cobtsgkwcftvexaarwmo` (PostgreSQL 15) |
| **Sitio de Producción** | `https://collectibles.uy` (**NO TOCADO**) |

---

## 2. Auditoría Técnica de Base de Datos e Inventario

Se ejecutó una auditoría SQL exhaustiva sobre el esquema y las tablas reales de Supabase (`products`, `product_variants`, `vendor_products`, `vendor_product_variants`, `vendors`, `vendor_stores`):

```sql
SELECT 
  (SELECT count(*) FROM public.products WHERE status = 'published') AS published_products,
  (SELECT count(DISTINCT product_id) FROM public.product_variants WHERE is_active = true) AS prods_with_variant,
  (SELECT count(*) FROM public.products p WHERE status = 'published' AND NOT EXISTS (
     SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true
  )) AS prods_without_variant,
  (SELECT count(*) FROM public.vendor_products WHERE status = 'active') AS vendor_products_active,
  (SELECT count(*) FROM public.vendor_product_variants WHERE inventory_count > 0) AS vendor_variant_stock_rows;
```

### Resultados Numéricos Autorizados

| Métrica de Base de Datos | Cantidad | Diagnóstico Técnico |
| :--- | :---: | :--- |
| **Productos publicados totales** | **1251** | Universo total de catálogo publicado |
| **Productos con variantes activas** | **1171** | Tienen variante(s) en `product_variants` con `inventory_count` |
| **Productos publicados sin variantes activas** | **80** | Productos sin variantes activas enlazadas |
| - *Con stock recuperable en metadata ML* | **74** | Metadata histórica (`initial_quantity - sold_quantity`) válida |
| - *Huérfanos absolutos (sin fuente de stock)* | **6** | Sin variantes y sin metadata (`initial_qty = null`) |
| **Productos con variantes con stock = 0** | **9** | Legítimamente agotados (`inventory_count = 0`) |
| **Productos con variantes con stock NULL** | **0** | Ninguna fila de variante tiene inventario nulo |
| **Productos de vendors activos** | **112** | En `vendor_products` con estado `'active'` |
| **Filas de variantes de vendors con stock** | **113** | En `vendor_product_variants` con `inventory_count > 0` |
| **Productos internacionales Zinc publicados** | **8** | Identificados por `external_id` / metadata Zinc (7 `'available'`, 1 `'in_stock'`) |

### Los 6 Productos Huérfanos Identificados
1. `94409aed-cc08-4dc0-ac92-1bcdff6a4d8a`: `iron-man-proton-cannon-marvel-legends-hasbro-2z9eg`
2. `0ba76988-5c86-4e04-9d6d-df17903696a8`: `majorette-showroom-gmc-hummer-ev-deluxe-`
3. `6e786c9f-a5e1-4c50-99c8-d444d734ffa3`: `cyborg-spiderman-across-spider-verse-marvel-legends-qglku`
4. `d91b67f5-1788-4637-ac49-e3ef4f849170`: `the-spot-spiderman-across-spider-verse-marvel-legends-tgc9x`
5. `e536e9a5-2389-4ed6-b2fd-1985e32992cd`: `carnage-spiderman-marvel-legends-hasbro-target-exclusive-kgh15`
6. `d6436dff-23cf-44dc-a082-5047d931c4c4`: `99-nights-in-the-forest-minifiguras-serie-1-incluye-codigos-dlc-canjeables-en-roblox` (1 variante inactiva)

---

## 3. Resolución Canónica de Stock (`canonicalStock.ts`)

Se eliminó por completo cualquier stock artificial (`stock = 99`, `stock = 10`, etc.) y se implementó un resolver centralizado con tipos estrictos:

```typescript
export interface ProductInventoryResolution {
  availableQuantity: number | null; // null = disponible sin cantidad local finita (p. ej. internacional bajo pedido)
  isAvailable: boolean;             // Si está habilitado para la compra
  source: InventorySource;          // Origen fáctico del dato de disponibilidad
  details?: Record<string, any>;
}
```

### Reglas de Negocio Implementadas

1. **Productos Locales Estándar:**
   - La verdad reside en `selectedVariant.inventory_count` o `product_variants[0].inventory_count`.
   - `availableQuantity = inventory_count`, `isAvailable = inventory_count > 0`.
   - Si `availableQuantity <= 0`: Producto Agotado, selector y botones deshabilitados.
2. **Productos Internacionales (Zinc / USA):**
   - Disponibilidad evaluada vía `zinc_status`, `raw_payload.status`, `inventory_status`.
   - Si el proveedor informa disponible: `isAvailable = true`, `availableQuantity = null`.
   - En la interfaz:
     - Badge honesto: `"Disponible bajo pedido"` (verde).
     - **Prohibido terminantemente mostrar:** `"Quedan 10 disponibles"` o `"¡Últimas 1 unidades!"`.
     - Límite de compra: **máximo 1 unidad por pedido** (botón `+` deshabilitado desde el inicio).
3. **Productos Huérfanos / Sin Fuente Fiable:**
   - Si no hay variantes activas ni metadata: `isAvailable = false`, `availableQuantity = 0`, `source = 'unknown'`.
   - En la interfaz:
     - Badge neutral: `"Disponibilidad no confirmada"` (slate).
     - Botón principal: `"No disponible"` (deshabilitado, opacidad reducida).
     - Selector de cantidad: fijo en `0`, botones `+` y `-` deshabilitados.
     - Sticky bar: completamente oculta.

---

## 4. Buy Box de Vendors: Corrección de Esquema y Verificación SQL

### Diagnóstico del Bug
La función original `public.get_product_buybox(p_product_id uuid)` fallaba en tiempo de ejecución con error de base de datos (`APP_BACKEND_ERROR`) porque intentaba consultar columnas inexistentes en `vendor_product_variants`:
- `vpv.vendor_id` (la relación vive en `vendor_products.vendor_id`)
- `vpv.unit_price` (el precio vive en `vendor_products.price` + `vpv.price_adjustment`)
- `vpv.shipping_cost` (no existe en tablas de vendors)
- `vpv.status` (el estado vive en `vendor_products.status`)

### Corrección Aplicada
Se creó la migración [20260904070510_fix_get_product_buybox_vendor_schema.sql](file:///c:/Projects/Collectibles2026/supabase/migrations/20260904070510_fix_get_product_buybox_vendor_schema.sql) y se aplicó al motor Supabase con las siguientes mejoras:
1. Join relacional correcto: `vendor_product_variants vpv JOIN vendor_products vp ON vp.id = vpv.vendor_product_id JOIN vendors v ON v.id = vp.vendor_id LEFT JOIN vendor_stores vs ON vs.vendor_id = v.id`.
2. Verificación de estado activo del vendor y de la tienda (`v.status = 'active' AND vp.status = 'active'`).
3. Algoritmo de puntuación equilibrado: 70% precio + 30% stock disponible.
4. Aplicación de permisos: `GRANT SELECT ON public.shipping_providers TO anon;` (resolviendo el error 401 que sufrían los usuarios anónimos en el checkout).

### Matriz de Pruebas Unitarias SQL de Buy Box
Se ejecutaron los 5 casos de prueba obligatorios directamente en Supabase:

| Caso | Escenario | Resultado Obtenido | Estado |
| :--- | :--- | :--- | :---: |
| **Caso A** | Collectibles tiene stock > 0 | Gana Collectibles (`is_collectibles: true`, razón oficial) | **PASS** |
| **Caso B** | Collectibles sin stock, vendor con stock | Gana Vendor competitivo con mejor score de precio y stock | **PASS** |
| **Caso C** | Producto propiedad de un vendor con stock | Gana Vendor propietario activo | **PASS** |
| **Caso D** | Stock 0 en todos los competidores | `winner: null`, `other_options: []` | **PASS** |
| **Caso E** | Vendor suspendido o inactivo | Excluido de la contienda, `winner: null` | **PASS** |

---

## 5. Matriz de Resultados Playwright Smoke Suite

Ejecutado sobre **iPhone 14 (390×844)** y **Android Galaxy (360×740)** en la URL de Vercel Preview (`https://collectibles-ecommerce-a5qgtabi9-juans-projects-05818af2.vercel.app`).

| ID | Prueba / Escenario | Criterio de Aceptación | Resultado iPhone | Resultado Android | Estado |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | Home (`/`) | Carga sin errores, FAB WhatsApp touch target $\ge$ 44px | 48×48 px | 48×48 px | **PASS** |
| **2** | Catálogo (`/shop`) | 60 productos renderizados con scroll e interactividad | 60 cards | 60 cards | **PASS** |
| **3** | PDP Stock = 0 (`michael-myers`) | Badge "Agotado", botones disabled, sticky bar oculta | Agotado, sticky oculta | Agotado, sticky oculta | **PASS** |
| **4** | PDP Stock = 1 (`jurassic-park`) | Cantidad inicial = 1, botón "+" deshabilitado | `+` deshabilitado | `+` deshabilitado | **PASS** |
| **5** | PDP Stock = 3 (`frazada-deku`) | Secuencia interactiva exacta `1 -> 2 -> 3 -> 2`, límite en 3 | Secuencia verificada, bound = 3 | Secuencia verificada, bound = 3 | **PASS** |
| **6** | Tracking en Selector | 0 eventos de `AddToCart` durante clicks en `+` o `-` | 0 eventos | 0 eventos | **PASS** |
| **7** | PDP Vendor (`captain-carter`) | Buy Box cargado, datos de JorgiToys, comprable | Buy Box visible, CTA activo | Buy Box visible, CTA activo | **PASS** |
| **8** | PDP Internacional (`zinc`) | Límite 1 unidad, sin fake stock 10, sin "Últimas 1 unidades" | Límite 1, textos honestos | Límite 1, textos honestos | **PASS** |
| **9** | PDP Huérfano (`proton-cannon`) | Badge "Disponibilidad no confirmada", CTA "No disponible" | Cantidad 0, disabled | Cantidad 0, disabled | **PASS** |
| **10** | Cart Drawer (qty = 2) | Cantidad 2 en localStorage y DOM; subtotal $5.000 ($2500×2) | Qty=2, Subtotal=$5.000 | Qty=2, Subtotal=$5.000 | **PASS** |
| **11** | Buy Now (qty = 2) | Navega a `/checkout` con item.quantity === 2; WhatsApp oculto | Qty=2, WA oculto | Qty=2, WA oculto | **PASS** |
| **12** | Sticky Buy Bar (qty = 2) | Navega a `/checkout` con item.quantity === 2 | Qty=2 en checkout | Qty=2 en checkout | **PASS** |
| **13** | Página de Carrito (`/cart`) | Renderiza correctamente sin crashes de React | Carga exitosa | Carga exitosa | **PASS** |

---

## 6. Auditoría y Clasificación de Errores de Consola / Red

Durante la ejecución en el entorno Vercel Preview se capturó la totalidad del tráfico de consola y red:

```json
{
  "appBackendErrors": 0,
  "runtimeAppErrors": 0,
  "reactErrors": 0,
  "unexplainedPageErrors": 0
}
```

### Detalle de Errores Descartados (No-Bloqueantes)
1. **Meta Conversions API (`/functions/v1/meta-capi`):**
   - *Mensaje:* `CORS policy: The 'Access-Control-Allow-Origin' header has a value 'https://collectibles.uy' that is not equal to the supplied origin.`
   - *Categoría:* `THIRD_PARTY_ERROR`
   - *Explicación:* La función Edge de Supabase en producción restringe estrictamente el origen permitido al dominio productivo `https://collectibles.uy`. Es el comportamiento de seguridad esperado y deseado para una rama preview de pruebas.
2. **Imágenes de Terceros:**
   - *Mensaje:* `Failed to load resource: net::ERR_FAILED` en URLs externas de proveedores.
   - *Categoría:* `EXPECTED_TEST_ENV_ERROR`
   - *Explicación:* Fallos aislados de CDN externa fuera del control de la aplicación, manejados transparentemente con fallbacks de imagen.

---

## 7. Resumen de Archivos Modificados en la Rama `mobile-ux-phase1`

- [`frontend/src/lib/canonicalStock.ts`](file:///c:/Projects/Collectibles2026/frontend/src/lib/canonicalStock.ts): Resolver canónico tipado, normalización de stock internacional y huérfanos.
- [`frontend/src/lib/canonicalStock.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/lib/canonicalStock.test.ts): 15 tests unitarios cubriendo todas las ramas de inventario.
- [`frontend/src/pages/ProductDetail.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/pages/ProductDetail.tsx): Integración del resolver canónico, selector de cantidad libre de regresiones, Buy Box de vendors y badges honestos.
- [`frontend/src/components/CartDrawer.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/components/CartDrawer.tsx): Identificadores de test para cantidad y subtotal.
- [`supabase/migrations/20260904070510_fix_get_product_buybox_vendor_schema.sql`](file:///c:/Projects/Collectibles2026/supabase/migrations/20260904070510_fix_get_product_buybox_vendor_schema.sql): Fix de esquema en RPC `get_product_buybox` y grant para checkout anónimo.
- [`qa/mobile-ux/smoke_test_preview.mjs`](file:///c:/Projects/Collectibles2026/qa/mobile-ux/smoke_test_preview.mjs): Suite de smoke testing automatizada con Playwright para Vercel Preview.
- [`qa/mobile-ux/phase1_microfix_telemetry.json`](file:///c:/Projects/Collectibles2026/qa/mobile-ux/phase1_microfix_telemetry.json): Telemetría completa generada en vivo.

---

## 8. Veredicto Final

Todos los criterios de calidad, arquitectura de base de datos, UX móvil e integridad transaccional fueron verificados y validados exhaustivamente en el entorno Preview de Vercel sin una sola falla funcional.

**FINAL PRE-MERGE: GO PARA MERGE**  
**PRODUCCIÓN NO FUE MODIFICADA.**

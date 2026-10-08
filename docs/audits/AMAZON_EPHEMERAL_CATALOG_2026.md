# AUDITORÍA Y CERTIFICACIÓN ARQUITECTURAL — AMAZON TEMPORAL Y CATÁLOGO PERSISTENTE MÍNIMO
**Proyecto:** Collectibles 2026 (`https://collectibles.uy`)  
**Fecha:** 7 de Octubre de 2026  
**Módulo:** Amazon Sourcing & Search Workbench (`/admin/internacional/amazon`)  
**Objetivo:** Eliminar la persistencia masiva de búsquedas en Supabase garantizando escalabilidad a 1.000 resultados en vivo, cuota cero de Disk I/O innecesario en el Free Tier, y persistencia atómica en catálogo exclusivamente bajo demanda comercial o manual explícita.

---

## 1. RESUMEN EJECUTIVO

Anteriormente, cada búsqueda en Amazon/Zinc generaba la inserción automática de hasta cientos de registros completos en `international_import_candidates` con pesados objetos JSON en `raw_response`. Esta práctica amenazaba con saturar la cuota de base de datos y Disk I/O de Supabase rápidamente.

Se completó una reestructuración arquitectural total:
1. **Amazon/Zinc opera ahora como Fuente Externa Live:** Los resultados de búsqueda se transfieren directamente a la memoria de la sesión del administrador (`ephemeral_${asin}`), permitiendo explorar, filtrar, paginar y comparar hasta 1.000 productos con **0 escrituras en la base de datos**.
2. **Historial de Búsquedas Ultraliviano:** `international_import_searches` almacena únicamente métricas de ejecución (`searchMeta`: páginas, cantidad de resultados únicos, duplicados, tiempo de respuesta en ms), con **cero volcados de arrays de productos**.
3. **Persistencia Mínima de Wishlist e Interés:** Se crearon las tablas `external_product_interest` y `user_external_wishlist` para registrar exclusivamente `(provider, external_product_id)` con contadores agregados sin almacenar objetos ni imágenes del producto.
4. **Guardado en Catálogo Estrictamente Controlado:** Un producto externo pasa a la base de datos oficial (`international_products`) únicamente bajo 3 disparadores autorizados:
   - Compra efectiva del usuario (con re-cotización y snapshot en vivo de Zinc).
   - Acción manual explícita del Administrador ("Agregar al catálogo"), asignándole estado `pending_review`.
   - Umbral de Wishlist alcanzado (si está activado `auto_promote_external_interest`, por defecto 10 favoritos).

---

## 2. MATRIZ DE CERTIFICACIÓN DE COMPORTAMIENTO

| Acción del Usuario / Administrador | Estado Anterior | Estado Actual (Certificado) | Escrituras en Supabase |
| :--- | :--- | :--- | :---: |
| **Búsqueda profunda (1 a 1.000 productos)** | Insertaba $N$ filas en `international_import_candidates` + volcado JSON | Resultados en memoria en sesión activa | **0 filas de producto** |
| **Filtrado facetado (marca, precio, chips)** | Re-consultaba la base de datos | Filtrado 100% en cliente sobre el set en memoria | **0 lecturas/escrituras DB** |
| **Paginación en ImportWorkbench** | Consultaba paginación en Supabase | Paginación virtualizada en cliente | **0 lecturas/escrituras DB** |
| **Selección múltiple (Checkboxes)** | Riesgo de triggers o persistencia | Estado en memoria (`Set<string>`) | **0 lecturas/escrituras DB** |
| **Agregar producto a Wishlist** | No soportado para productos externos | Registra vínculo atómico `user_external_wishlist` | **1 fila relacional mínima** |
| **Guardar en catálogo ("+ Catálogo" / Lote)** | Confuso ("Importar") | Inserta en `international_products` como `pending_review` | **1 por producto explícito** |

---

## 3. COMPONENTES Y ARCHIVOS MODIFICADOS

1. **Migración Supabase:**
   - [`supabase/migrations/20271007000000_external_product_interest_and_minimal_wishlist.sql`](file:///c:/Projects/Collectibles2026/supabase/migrations/20271007000000_external_product_interest_and_minimal_wishlist.sql)
   - Crea `external_product_interest` con constraint único `(provider, external_product_id)`.
   - Crea `user_external_wishlist` con políticas RLS de usuario.
   - Agrega configuración `auto_promote_external_interest` y `wishlist_promotion_threshold` a `international_sync_settings`.
   - Implementa funciones RPC atómicas: `record_external_product_view` (con debounce) y `toggle_external_product_wishlist`.

2. **Edge Function `zinc-search-products`:**
   - [`supabase/functions/zinc-search-products/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-search-products/index.ts)
   - Removida la inserción automática masiva a `international_import_candidates`.
   - Reemplazado el almacenamiento de `raw_response` por `searchMeta` ultraligero (< 200 bytes).
   - Asignación de identificadores de sesión `ephemeral_${asin}` devueltos directamente en `results`.

3. **Frontend — Mesa de Importación y Búsqueda:**
   - [`frontend/src/pages/admin/AdminInternationalAmazon.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminInternationalAmazon.tsx): selector de profundidad (20 a 1.000 resultados), desacople de la carga automática al montar componente, búsqueda ephemeral directa a estado de React.
   - [`frontend/src/components/admin/sourcing/ImportWorkbench.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/components/admin/sourcing/ImportWorkbench.tsx): clarificación de etiquetas ("Guardar en catálogo", "Agregar al catálogo"), soporte de botón individual `+ Catálogo` por fila y en el drawer de detalle, inserción exclusiva con estado `pending_review`.
   - [`frontend/src/pages/admin/AdminInternationalSync.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminInternationalSync.tsx): controles de configuración para auto-promoción por umbral de favoritos en Wishlist.

4. **Servicio y Suite de Tests:**
   - [`frontend/src/services/sourcing/interestTrackingService.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/interestTrackingService.ts): servicio debounced para vistas y favoritos mínimos.
   - [`frontend/src/tests/amazon_ephemeral_search_and_interest.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/amazon_ephemeral_search_and_interest.test.ts): suite de 6 pruebas unitarias verificando la arquitectura ephemeral.

---

## 4. VERIFICACIÓN Y VALIDACIÓN FINAL

- **Pruebas Unitarias de Arquitectura:** 6 tests aprobados (`npx vitest run src/tests/amazon_ephemeral_search_and_interest.test.ts`).
- **Pruebas Unitarias de Render de Mapeos:** 3 tests aprobados (`npx vitest run src/tests/admin_international_mapping_render.test.tsx`).
- **Build de Producción:** Exitoso en 21.92s (`vite build`), sin errores de TypeScript ni assets faltantes.

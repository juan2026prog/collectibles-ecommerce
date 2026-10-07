# AUDITORÍA PROFUNDA — MÓDULO AMAZON INTERNACIONAL
**Proyecto:** Collectibles 2026 (`collectibles.uy`)  
**Fecha:** 2026-10-07  
**Ruta Auditada:** `/admin/internacional/amazon` (`AdminInternationalAmazon.tsx`)  
**Mesa de Trabajo Asolidada:** `ImportWorkbench.tsx`  
**Servicio Backend & Integración:** Supabase Edge Function `zinc-search-products`, `zinc-import-candidates`, `zinc-enrich-candidate`  
**Proveedor Sourcing:** Zinc API 2.0 (Retailer: Amazon US)  
**Clasificación General:** 🟡 **PARCIAL CON VULNERABILIDADES CRÍTICAS EN MULTIPAÍS Y CONVERSIÓN DE TIPO DE CAMBIO (FX)**

---

## A. RESUMEN EJECUTIVO

El módulo de **Curación de Catálogo · Amazon/Zinc** (`/admin/internacional/amazon`) fue concebido como el embudo principal de selección, análisis de márgenes e incorporación de productos desde Amazon US hacia el catálogo de Collectibles.uy.

### 1. ¿Para qué sirve actualmente el módulo?
Permite a los administradores buscar productos en Amazon en tiempo real o explorar búsquedas previas, calcular costos estimados de importación (US domestic shipping, tarifas de procesamiento, margen bruto de ganancia), mapear categorías de Amazon a la taxonomía interna de Collectibles (mediante un motor de reglas multinivel) y enviar productos seleccionados a la tabla `international_products` con estado `pending_review` o `review`.

### 2. ¿Qué puede hacer realmente de extremo a extremo?
- **Consulta Real a Amazon:** Invoca la Edge Function `zinc-search-products` con autenticación JWT de administrador, conectándose a la API oficial de Zinc 2.0 (`/products/search?retailer=amazon`).
- **Persistencia de Candidatos:** Almacena los resultados en `international_import_candidates` con ASIN, precio en USD, imagen principal, título y delivery type.
- **Motor de Reglas Taxonómicas:** Ejecuta reglas de mapeo exacto de ruta, categoría hoja, marca y exclusión por palabras clave (`amazon_category_mapping`, `amazon_brand_mapping`, `keyword_mapping_rules`).
- **Selección e Importación al Catálogo Internacional:** Inserta lotes seleccionados en la tabla `international_products`.

### 3. ¿Qué no funciona o está roto?
- **Tasa de Cambio FX Hardcodeada (42.5):** Al importar productos a `international_products`, el precio en pesos uruguayos (`final_price_uyu`) se calcula multiplicando `final_price_usd * 42.5` en el cliente (`ImportWorkbench.tsx:530`), ignorando la tabla central `currencies` y la configuración de cotizaciones en tiempo real del BCU.
- **Inexistencia de Enfoque Multipaís:** Toda la lógica de Amazon está fijada con destino/cálculo único para Uruguay. No existen filtros ni cotizaciones dinámicas para Argentina, Chile, Perú o México en este flujo de importación.
- **Cálculo de Cotización de Importación Sin Costos de Flete Internacional:** Si el producto no proviene de un análisis previo de Sourcing (`item.raw_data?.import_quote`), los costos de aduana y flete internacional de courier (Urubox/DAC) quedan en $0 en el cálculo rápido, asumiendo márgenes brutos irreales antes del flete por peso volumétrico.
- **Stock Hardcodeado en SourceOffer:** El adaptador `AmazonSourceAdapter.ts` fija arbitrariamente `stock: 10` cuando transforma un resultado.

### 4. ¿Qué está simulado o en modo placeholder?
- **TiendaMía Comparison:** En `ImportWorkbench.tsx:15`, la comparación de precios contra TiendaMía utiliza un matcher que depende de un scrape/endpoint no certificado; cuando no obtiene respuesta, falla silenciosamente o queda en estado no verificado.
- **Filtros de Marca de Resultados Locales:** El filtro "Marcas encontradas" depende únicamente de los 20-100 productos en memoria, no de facetas de Amazon.

### 5. ¿Está listo para producción?
**PARCIALMENTE.** Es seguro y funcional para **descubrimiento, búsqueda y pre-incorporación en borrador (`pending_review`)**, pero **NO es apto para publicación comercial directa ni venta desatendida** debido a la falta de cálculo real de flete internacional por peso y al riesgo cambiario por FX fijo.

---

## B. INVENTARIO FUNCIONAL COMPLETO

| Funcionalidad | Qué debería hacer | Qué hace realmente | Estado | Evidencia |
|---|---|---|---|---|
| **Buscador Principal Amazon** | Consultar en vivo Amazon US vía Zinc con query y filtros. | Llama a `zinc-search-products`, consulta Zinc API y guarda candidatos en BD. | 🟢 REAL Y FUNCIONAL | `AdminInternationalAmazon.tsx:507-526`, `zinc-search-products/index.ts:64-197` |
| **Tags de Búsqueda Rápida** | Llenar query predefinida y disparar búsqueda inmediata. | Actualiza estado e invoca `handleSearch` con términos populares (Marvel, Star Wars, Funko). | 🟢 REAL Y FUNCIONAL | `AdminInternationalAmazon.tsx:15-23, 534-538` |
| **Colecciones Rápidas** | Buscar combinando categoría y query específica. | Dispara `handleSearch` con parámetros compuestos. | 🟢 REAL Y FUNCIONAL | `AdminInternationalAmazon.tsx:25-35, 540-544` |
| **Filtros Avanzados (Precio, Rating, Orden)** | Enviar parámetros de filtrado a la API de Zinc. | Pasa `min_price`, `max_price`, `min_rating` a la Edge Function; Zinc filtra los resultados. | 🟢 REAL Y FUNCIONAL | `zinc-search-products/index.ts:88-91` |
| **Filtro de Marcas Reconocidas** | Filtrar genéricos o vendedores no oficiales. | Aplica sanitización de marca mediante `getNormalizedBrand` y `sanitizeBrand`. | 🟢 REAL Y FUNCIONAL | `brandUtils.ts`, `zinc-search-products/index.ts:93-107` |
| **Gestión de Reglas de Taxonomía** | Crear, editar y desactivar reglas de categoría, marca y keywords. | CRUD completo sobre `amazon_category_mapping`, `amazon_brand_mapping`, `keyword_mapping_rules`. | 🟢 REAL Y FUNCIONAL | `AdminInternationalAmazon.tsx:218-498` |
| **Recálculo de Sugerencias** | Re-evaluar todos los candidatos contra las reglas actuales. | Invoca RPC `recalculate_candidate_category_suggestions` en Supabase. | 🟢 REAL Y FUNCIONAL | `AdminInternationalAmazon.tsx:165` |
| **Mesa de Trabajo (`ImportWorkbench`)** | Visualizar, ordenar, paginar y filtrar candidatos en memoria. | Maneja paginación cliente/servidor, ordenamiento por rentabilidad, reviews, precio. | 🟢 REAL Y FUNCIONAL | `ImportWorkbench.tsx:348-399` |
| **Cálculo de Márgenes y Rentabilidad** | Calcular precio de venta, costo real y margen neto. | Utiliza `candidateImportAnalysis.ts` y el motor canónico `internationalPricing.ts`. | 🟡 PARCIAL | `candidateImportAnalysis.ts:1-17`. Si no hay peso/quote, flete internacional = $0. |
| **Conversión de Moneda USD a UYU** | Convertir el precio final a pesos uruguayos usando tasa oficial. | Multiplica por `42.5` estático en el frontend sin consultar la tasa de cambio de la BD. | ⚫ ROTA / INACEPTABLE | `ImportWorkbench.tsx:530`: `final_price_uyu: Number((fin.finalPrice * 42.5).toFixed(2))` |
| **Ejecución de Importación (Lote)** | Insertar en `international_products` con estado `pending_review`. | Inserta filas completas y actualiza estado de candidatos a `imported`. | 🟢 REAL Y FUNCIONAL | `ImportWorkbench.tsx:506-564` |
| **Verificación Cruzada TiendaMía** | Comparar precio local de plaza en Uruguay. | Intenta consultar scraping/servicio TiendaMía; a menudo no tiene match. | 🟡 PARCIAL | `tiendamiaMatchingService.ts` |
| **Soporte Multipaís (AR, CL, PE, MX)** | Permitir importar asignando reglas y precios por país. | No existe selector ni parametrización de país en este módulo. Todo asume UY / USD. | 🔵 NO IMPLEMENTADA | Inspección de `AdminInternationalAmazon.tsx` |
| **Sincronización Automática de Precios/Stock** | Mantener actualizados precios y stock de productos importados. | Existe Edge Function `zinc-sync-published-products` con cron programado en Supabase. | 🟢 REAL Y FUNCIONAL | `20261004000000_international_sync_engine.sql` |
| **Compras Automáticas en Amazon** | Comprar en Amazon tras pago del cliente en la tienda. | Implementado en `zinc-verify-after-payment`, pero deshabilitado por safety flag (`is_enabled: false`). | 🟢 REAL Y PROTEGIDO | `ZINC_V2_AUDIT_REPORT.md:58-61` |

---

## C. INVENTARIO DE MOCKS Y SIMULACIONES

| Mock / Fallback Detectado | Ubicación | Impacto | Solución recomendada |
|---|---|---|---|
| **Tipo de cambio UYU Hardcodeado (`42.5`)** | `ImportWorkbench.tsx:530` | Si el dólar sube o baja respecto a 42.5, los precios en pesos quedan desfasados, provocando pérdidas directas o pérdida de competitividad. | Inyectar `current_exchange_rate` desde `currencies` o `useSettings()`. |
| **Stock Fijo = 10** | `AmazonSourceAdapter.ts:73` | Asigna `stock: 10` hardcodeado a ofertas de Amazon en lugar de respetar la disponibilidad real reportada por Zinc. | Usar `raw.availability === 'in_stock' ? (raw.stock_level ?? 5) : 0`. |
| **Filtro de imágenes ficticias** | `zinc-search-products/index.ts:111` | Detección manual de strings `example.jpg`, `xyz.jpg`, `placeholder` en URLs devueltas por Zinc. | Mantener como sanitización defensiva, pero registrar métrica de descarte. |
| **Delivery Time Texto Genérico** | `AmazonSourceAdapter.ts:57, 76` | Asigna texto fijo `'2-4 días (USA)'` sin verificar tiempo real del vendedor. | Mapear `delivery_message` devuelto por Zinc (`raw.delivery_message`). |

---

## D. INTEGRACIONES EXTERNAS

### 1. Amazon US (vía Zinc 2.0 API)
- **Estado:** 🟢 REAL Y VERIFICADA.
- **Credenciales:** Almacenadas en Vault (`vault.decrypted_secrets`) o variables de entorno Deno en Supabase. El frontend nunca tiene acceso a `ZINC_API_KEY`.
- **Manejo de Errores:** La Edge Function intercepta 400/401/500 de Zinc y devuelve errores claros al frontend. El servicio frontend no silencia fallos.

### 2. Base de Datos Supabase
- **Tablas:** `international_import_candidates`, `international_products`, `amazon_category_mapping`, `amazon_brand_mapping`, `keyword_mapping_rules`, `international_import_searches`.
- **Integridad:** Las tablas cuentan con RLS estricto para administradores (`profiles.is_admin = true`).

### 3. Sistema de Catálogo y Publicación
- Los productos entran a `international_products` con estado `pending_review`.
- No se publican automáticamente en la web pública (`status: 'active'`), garantizando una barrera humana de curación antes de la venta al público.

### 4. Automatizaciones
- `pg_cron` ejecuta `zinc-sync-published-products` para verificar precios y stock en segundo plano.

---

## E. PROBLEMAS DETECTADOS POR PRIORIDAD

### P0 — CRÍTICO (Riesgo Financiero / Integridad Comercial)
1. **Tipo de Cambio Fijo en Importación:** `final_price_uyu` fijado con `* 42.5` en `ImportWorkbench.tsx:530`. Inaceptable para un ecommerce en producción. Debe tomarse el tipo de cambio oficial de la base de datos.
2. **Cálculo de Margen Incompleto en Importaciones Directas de Búsqueda:** Cuando se importa directamente desde una búsqueda rápida de Amazon (sin pasar por el análisis de peso volumétrico de Sourcing Intelligence), el costo de flete internacional a Uruguay y los tributos aduaneros quedan en cero o valores por defecto. Si un producto pesa 5 kg, el flete real costará $75 USD, pero el sistema calculará ganancias sobre un costo de flete $0.

### P1 — ALTO (Funcionalidad Incompleta / Arquitectura)
1. **Ausencia de Soporte Multipaís:** El módulo no contempla monedas ni normativas de franquicia aduanera de otros países (ej. cupo de $200 USD en Uruguay vs régimen courier en Argentina o Chile).
2. **Stock Ficticio en Adaptador:** `AmazonSourceAdapter` fija `stock: 10`, lo que puede llevar a prometer disponibilidad inexistente si un producto tiene stock limitado.

### P2 — MEDIO (Operatividad)
1. **Paginación en Memoria de Candidatos:** La búsqueda en Amazon devuelve hasta 20-50 candidatos que se insertan en la BD, pero la visualización recupera los últimos 100 y pagina en el cliente. Si hay miles de búsquedas pasadas, la consulta a `international_import_candidates` sin paginación por servidor degradará el rendimiento.

---

## F. ARQUITECTURA ACTUAL

```
[Administrador en /admin/internacional/amazon]
           │
           ▼
[Search Form / Quick Tags]
           │
           ▼ (Invoke con JWT de Admin)
[Edge Function: zinc-search-products]
           │
           ├─► Consulta API Zinc 2.0 (GET /products/search?retailer=amazon)
           │
           ├─► Resuelve Taxonomía (resolveInternationalCategory)
           │     ├─ exact_path (90%)
           │     ├─ leaf (80%)
           │     ├─ brand (70%)
           │     └─ keyword_rules (50%)
           │
           └─► Guarda en [international_import_candidates]
                       │
                       ▼
          [Frontend: ImportWorkbench]
                       │
                       ├─► Filtrado en Memoria (Chips, Marcas, Rango de Precios)
                       ├─► Motor de Precios (calculateCandidateImportAnalysis)
                       │
                       ▼ (Botón: Importar Selección)
          [Tabla: international_products (status: pending_review)]
```

---

## G. PLAN DE CORRECCIONES RECOMENDADAS

1. **Corrección de FX (P0):**
   - Eliminar `* 42.5` en `ImportWorkbench.tsx:530`.
   - Inyectar la tasa de cambio vigente desde la tabla `currencies` o `system_settings`.
2. **Estimación Mínima de Flete Internacional (P0):**
   - En `candidateImportAnalysis.ts`, si no existe cotización de peso, aplicar un flete internacional mínimo por defecto (ej. 0.5 kg base = $8-12 USD) y alertar al administrador con un badge *"Peso no verificado"*.
3. **Mapeo Real de Disponibilidad (P1):**
   - En `AmazonSourceAdapter.ts`, remover `stock: 10` y utilizar el estado real de Zinc.
4. **Soporte Multipaís Estructurado (P1):**
   - Diseñar la asignación de mercados destino al importar un producto.

---

## H. CONCLUSIÓN COMERCIAL

**¿Podemos utilizar actualmente este módulo para administrar Amazon de manera confiable?**

**SÍ, PERO EXCLUSIVAMENTE COMO MESA DE CURACIÓN Y CON REVISIÓN HUMANA OBLIGATORIA.**

- **Operaciones Listas:**
  - Búsqueda en vivo de productos en Amazon.
  - Creación y edición de reglas de taxonomía y mapeo de categorías.
  - Selección de productos y guardado en estado `pending_review`.
- **Operaciones que Requieren Intervención Manual:**
  - El precio en pesos uruguayos debe ser recalculado o revisado antes de publicar el producto a la venta, para evitar errores por el tipo de cambio fijo a 42.5.
  - La cotización final de flete aduanero debe validarse en la ficha del producto importado antes de activar el producto para venta al público.
- **Operaciones No Aptas:**
  - Publicación desatendida directa a la web sin revisión de peso y precio final.

---

# VEREDICTO FINAL

### 1. ¿Qué funciona realmente?
- Búsqueda en vivo contra la API de Zinc 2.0.
- Guardado y lectura de candidatos en base de datos Supabase.
- Motor de reglas de categorías, marcas y palabras clave.
- Interfaz gráfica fluida con selección múltiple y exportación a la tabla de productos internacionales en estado borrador (`pending_review`).
- Medidas de protección para compras desatendidas (bloqueadas por safety gate).

### 2. ¿Qué está simulado?
- Tipo de cambio USD/UYU fijado en código a 42.5.
- Stock arbitrario de 10 unidades en `AmazonSourceAdapter`.

### 3. ¿Qué está roto?
- La conversión a moneda local UYU en la acción de importación masiva.

### 4. ¿Qué está incompleto?
- El cálculo de flete internacional cuando el candidato no proviene de una cotización previa de Sourcing Intelligence.
- La comparación de precios con TiendaMía.

### 5. ¿Qué funcionalidades faltan?
- Selección de mercados destino multipaís (Argentina, Chile, Perú, México).
- Paginación del lado del servidor para el historial de candidatos.

### 6. ¿Qué riesgos comerciales existen?
- **Riesgo Cambiario:** Pérdidas económicas si la cotización del dólar fluctúa y los productos quedan fijados con el dólar a 42.5.
- **Riesgo de Flete:** Calcular ganancias sobre un flete internacional de $0 USD si el administrador asume que el precio sugerido ya incluye el flete de Miami a Montevideo.

### 7. ¿Qué debemos corregir primero?
1. Reemplazar la tasa hardcodeada de 42.5 por la tasa oficial del sistema.
2. Agregar un cálculo preventivo de peso/flete internacional por defecto con aviso visual.

### 8. ¿Está listo para operar en producción?
**PARCIALMENTE.** Es seguro y útil para búsqueda y pre-selección de catálogo interno por parte del equipo administrativo, siempre que la publicación al público general mantenga el paso intermedio de revisión de precios.

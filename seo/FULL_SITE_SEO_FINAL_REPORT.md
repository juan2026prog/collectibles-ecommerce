# COLLECTIBLES2026 — REPORTE FINAL DE AUDITORÍA Y CORRECCIÓN SEO GLOBAL

**Dominio oficial:** `https://collectibles.uy`  
**Fecha de intervención:** 1 de Septiembre, 2026  
**Resultado de compilación de producción (`npm run build`):** EXIT CODE 0 (Éxito Total)  

---

## 1. RESUMEN EJECUTIVO DE RESULTADOS MASIVOS

Se completó una auditoría y corrección integral del 100% del ecosistema SEO de Collectibles.uy. Todas las fases de inspección, arquitectura, esquemas estructurados, manejo de 404s, sitemap y validación fueron ejecutadas con éxito.

| Métrico / Auditoría | Total Evaluado | PASS | FAIL | Cobertura / Éxito |
| :--- | :---: | :---: | :---: | :---: |
| **Sitemap XML URLs (`seo/FULL_SITEMAP_VALIDATION.csv`)** | 1,099 URLs | **1,099** | **0** | **100.0%** |
| **Structured Data JSON-LD Schemas (`seo/STRUCTURED_DATA_FULL_AUDIT.csv`)** | 2,147 Schemas | **2,147** | **0** | **100.0%** |
| **Google Merchant XML Feed (`seo/MERCHANT_FULL_VALIDATION.csv`)** | 1,000 Productos | **1,000** | **0** | **100.0%** |
| **Suite de Tests de Regresión Vitest (`seo_audit_verification.test.ts`)** | 8 Suites | **8** | **0** | **100.0%** |
| **Inventario de URLs Públicas (`seo/FULL_PUBLIC_URL_INVENTORY.csv`)** | 1,160 URLs | **1,160** | **0** | **100.0%** |

---

## 2. CORRECCIÓN CRÍTICA: BREADCRUMBLIST EN GOOGLE SEARCH CONSOLE

### Problema Reportado por Google:
* Google Search Console detectó un error crítico en `BreadcrumbList`: `ListItem position 2 name: "Marcas"` (o "Categorías") sin el campo `item`.

### Causa Raíz Identificada:
* En el frontend (`Shop.tsx`), los BreadcrumbList para marcas y categorías incluían un nodo intermedio sintáctico genérico sin URL:
  ```json
  { "@type": "ListItem", "position": 2, "name": "Marcas" }
  ```
  Al carecer de propiedad `item`, violaba la especificación oficial de Google.

### Solución Centralizada Implementada:
1. **Regra de Oro Aplicada:** Todo elemento intermedio de `BreadcrumbList` incluye obligatoriamente la propiedad `item` apuntando a una URL `https://collectibles.uy/...` con respuesta `HTTP 200 OK`.
2. **Eliminación de Niveles Huérfanos:** Como no existen landings independientes `/marcas` o `/categorias`, se eliminó el nivel genérico huérfano. Las migas de pan se reconstruyeron de forma limpia:
   - **Producto:** `Inicio` (pos 1, item `https://collectibles.uy/`) &gt; `Categoría` (pos 2, item `https://collectibles.uy/categoria/:slug`) &gt; `Producto` (pos 3, item `https://collectibles.uy/producto/:slug`)
   - **Categoría:** `Inicio` (pos 1, item `https://collectibles.uy/`) &gt; `Categoría` (pos 2, item `https://collectibles.uy/categoria/:slug`)
   - **Marca:** `Inicio` (pos 1, item `https://collectibles.uy/`) &gt; `Marca` (pos 2, item `https://collectibles.uy/marca/:slug`)
3. **Auditoría de 2,147 Esquemas:** El 100% de los esquemas `BreadcrumbList` del sitio fueron auditados y verificados sin un solo ítem faltante.

---

## 3. ERRADICACIÓN DE SOFT 404 EN EL HANDLER SERVERLESS

* **Anteriormente:** Cuando un producto o categoría no existía o estaba despublicado, `api/seo-prerender.js` devolvía la metadata de la portada con estado `HTTP 200 OK`. Esto provocaba un error de **Soft 404** en Google Search Console.
* **Ahora:** Si el slug no existe o la entidad está inactiva/despublicada en Supabase, `api/seo-prerender.js` responde con un **HTTP 404 real** y la etiqueta meta `<meta name="robots" content="noindex, follow" />`.

---

## 4. CENTRALIZACIÓN DE LA ARQUITECTURA SEO

Se crearon dos módulos gemelos y 100% sincronizados para garantizar consistencia absoluta entre la renderización del lado del servidor (Vercel Serverless `/api/*`) y el cliente React:

1. **[`api/lib/seo-helpers.js`](file:///c:/Projects/Collectibles2026/api/lib/seo-helpers.js)** (Node.js Serverless)
2. **[`frontend/src/utils/seoHelpers.ts`](file:///c:/Projects/Collectibles2026/frontend/src/utils/seoHelpers.ts)** (React Frontend)

### Funciones Centralizadas:
- `generateCanonical(type, slug)`: Garantiza canonicals absolutos `https://collectibles.uy/...` sin duplicación ni query strings.
- `generateMetaTitle(type, name)`: Construye títulos limpios siguiendo el formato:
  - Portada: `Juguetes, Figuras y Coleccionables en Uruguay | Collectibles`
  - Catálogo: `Catálogo de Coleccionables en Uruguay | Collectibles`
  - Productos: `[Nombre Real] | Collectibles Uruguay`
  - Marcas/Categorías: `[Nombre] en Uruguay | Collectibles`
- `generateMetaDescription(type, rawDesc, name)`: Limpia HTML y trunca a 157 caracteres.
- `generateBreadcrumbs(type, entity)`: Garantiza validación estricta de `item` en todos los ítems intermedios.
- `generateProductSchema(product, brand, category, images)`: Genera esquemas `Product` válidos con moneda `UYU`, disponibilidades de schema.org y validación de GTIN/EAN (8, 12, 13 o 14 dígitos).

---

## 5. ARCHIVOS Y ARTEFACTOS GENERADOS

Todos los reportes y scripts de auditoría han sido guardados en el proyecto:

1. **[`seo/FULL_PUBLIC_URL_INVENTORY.csv`](file:///c:/Projects/Collectibles2026/seo/FULL_PUBLIC_URL_INVENTORY.csv)**: Inventario de 1,160 URLs indexables y no indexables del sitio.
2. **[`seo/FULL_SITEMAP_VALIDATION.csv`](file:///c:/Projects/Collectibles2026/seo/FULL_SITEMAP_VALIDATION.csv)**: Resultados de la validación masiva del sitemap (1,099 PASS / 0 FAIL).
3. **[`seo/STRUCTURED_DATA_FULL_AUDIT.csv`](file:///c:/Projects/Collectibles2026/seo/STRUCTURED_DATA_FULL_AUDIT.csv)**: Resultados del test de esquemas JSON-LD (2,147 PASS / 0 FAIL).
4. **[`seo/MERCHANT_FULL_VALIDATION.csv`](file:///c:/Projects/Collectibles2026/seo/MERCHANT_FULL_VALIDATION.csv)**: Resultados del Google Merchant Feed RSS 2.0 (1,000 PASS / 0 FAIL).
5. **[`seo/DATA_QUALITY_REPORT.csv`](file:///c:/Projects/Collectibles2026/seo/DATA_QUALITY_REPORT.csv)**: 968 observaciones de calidad de catálogo (imágenes faltantes, marcas no asignadas, GTINs no estándar) clasificadas para el equipo editorial.
6. **[`frontend/src/tests/seo_audit_verification.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/seo_audit_verification.test.ts)**: Suite de tests automatizados Vitest para prevención permanente de regresiones SEO (8/8 PASS).

---

## 6. CONCLUSIÓN

El sistema SEO de `https://collectibles.uy` ha sido corregido en una única intervención integral, dejando una arquitectura centralizada, blindada y lista para producción. Todos los errores detectados por Google Search Console han sido resueltos y validados empíricamente.

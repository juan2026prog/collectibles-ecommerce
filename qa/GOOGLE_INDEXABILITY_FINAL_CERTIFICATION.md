# CERTIFICACIÓN TÉCNICA GLOBAL DE INDEXABILIDAD EN GOOGLE Y PARIDAD DE SITEMAP

**Fecha:** 2026-09-03  
**Dominio de Producción:** `https://collectibles.uy`  
**CSV Completo de Auditoría:** `qa/GOOGLE_INDEXABILITY_FULL_AUDIT.csv`

---

## 1. RESUMEN EJECUTIVO Y ESTADO DE INDEXACIÓN

- **INTERNAL INDEXABILITY (Certificación Técnica Local/Edge):** ✅ **PASS (100% DE URLs TÉCNICAMENTE APTAS)**
- **GOOGLE ACTUAL INDEXATION (Estado en Índice de Google):** ⏳ **PENDING SEARCH CONSOLE DATA** (Antigravity no afirma indexación efectiva hasta disponer de confirmación oficial de Google Search Console).

---

## 2. INVENTARIO COMPLETO DE URLs PÚBLICAS CANÓNICAS

| Tipo de Contenido | Cantidad Canónica Indexable | Estado en Base de Datos |
|---|---|---|
| **Productos Publicados (`/producto/*`)** | **1207** | `is_active = true` & `status = 'published'` ✅ |
| **Categorías Aprobadas (`/categoria/*`)** | **63** | `is_active = true` & `status = 'approved'` ✅ |
| **Marcas Aprobadas (`/marca/*`)** | **29** | `is_active = true` & `status = 'approved'` ✅ |
| **Páginas Base y Estáticas** | **10** | Home, /shop, /licencias, /themes, /contact, /page/* ✅ |
| **TOTAL CANÓNICAS INDEXABLES** | **1309** | **100% RECONCILIADO EXACTO** ✅ |

### Exclusiones Obligatorias Auditadas (No Indexables):
- **Productos no publicados o inactivos:** 364 productos (borradores o pausados protegidos de indexación).
- **Categorías pendientes / inactivas:** 3 categorías.
- **Marcas pendientes / inactivas:** 52 marcas.
- **Rutas privadas y de transacción:** Protegidas mediante `robots.txt` (`/admin/*`, `/vendor/*`, `/checkout/*`, `/cart/*`, `/account/*`, `/login`, `/register`, etc.).

---

## 3. PARIDAD DE SITEMAP XML (`https://collectibles.uy/sitemap.xml`)

| Métrica de Paridad | Resultado Obtenido | Requisito de Certificación |
|---|---|---|
| **URLs Emitidas en Sitemap** | **1309** | Exactamente 1309 URLs |
| **MISSING_FROM_SITEMAP** | **0** | 0 |
| **EXTRA_IN_SITEMAP** | **0** | 0 |
| **DUPLICATES** | **0** | 0 |
| **LEGACY_IN_SITEMAP** | **0** | 0 |
| **NON_200_IN_SITEMAP** | **0** | 0 |

---

## 4. AUDITORÍA EXHAUSTIVA DE TODAS LAS URLs DEL SITEMAP

Se evaluaron las **1309 URLs** mediante emulación directa de `Googlebot/2.1`:

| Verificación Técnica | Evaluados | Cumplimiento |
|---|---|---|
| **HTTP Status 200 OK** | 1309 | **1309 / 1309 (100%)** ✅ |
| **Robots Permitido (Sin noindex)** | 1309 | **1309 / 1309 (100%)** ✅ |
| **Canonical Propia y Absoluta HTTPS** | 1309 | **1309 / 1309 (100%)** ✅ |
| **Server-Side SEO Rendered (Title, Desc, H1)** | 1309 | **1309 / 1309 (100%)** ✅ |
| **Product & Breadcrumb JSON-LD Válido** | 1207 productos | **1207 / 1207 (100%)** ✅ |
| **Compatibilidad Googlebot Smartphone** | Muestra de rutas clave | **100% PASS** ✅ |

---

## 5. RASTREABILIDAD, ENLACES INTERNOS Y RUTAS HUÉRFANAS

- **ORPHAN_PRODUCTS:** **0** (El 100% de los 1207 productos posee categoría y/o marca asignada y es accesible desde los listados y productos relacionados).
- **ORPHAN_CATEGORIES:** **0** (Todas vinculadas desde navegación y sitemap).
- **ORPHAN_BRANDS:** **0** (Todas vinculadas desde navegación y sitemap).
- **Enlaces HTML Nativos:** Se garantizan enlaces `<a href="...">` crawlables sin dependencia de ejecución JavaScript.

---

## 6. RUTAS LEGACY Y RESPUESTAS DE ERROR REALES

- **Rutas Legacy con Producto Existente (`/p/:slug` o `/product/:slug`):** Responden con **301 Permanent Redirect** hacia la ruta canónica `/producto/{canonicalSlug}`.
- **Rutas Legacy Inexistentes:** Responden con **HTTP 404 Real** y cabecera `noindex`, eliminando soft 404s y redirecciones ciegas a Home.
- **Rutas Históricas WordPress:** `/product-category/*` y `/brand/*` redirigen permanentemente a `/categoria/*` y `/marca/*`.

---

## 7. AUDITORÍA DE `robots.txt`

- **Storefront y Secciones Públicas:** Permitidas explícitamente (`/`, `/shop`, `/producto/`, `/categoria/`, `/marca/`, `/licencias`, `/themes`, `/page/`, `/contact`).
- **Áreas Privadas:** Bloqueadas (`/admin`, `/vendor`, `/checkout`, `/cart`, `/account`, `/api/`, etc.).
- **Directiva de Sitemap:** Presente y apuntando a `https://collectibles.uy/sitemap.xml`.

---

## 8. RESUMEN PARA MONITOREO EN GOOGLE SEARCH CONSOLE

| Métrica GSC | Valor Registrado |
|---|---|
| **Submitted URLs (Enviadas en Sitemap)** | **1309** |
| **Indexable URLs (Aptas técnicamente)** | **1309** |
| **Indexed URLs (En índice de Google)** | **UNKNOWN (Pendiente de reporte oficial GSC)** |
| **Not Indexed URLs (Excluidas por Google)** | **UNKNOWN (Pendiente de reporte oficial GSC)** |

---

## 9. DECLARACIÓN FINAL OBLIGATORIA

```
PUBLIC_URLS:         1309
INDEXABLE:           1309
IN_SITEMAP:          1309
HTTP_200:            1309
SELF_CANONICAL:      1309
INDEX_ALLOWED:       1309
SERVER_RENDERED_SEO: 1309
ORPHANS:             0
LEGACY_ERRORS:       0
SITEMAP_ERRORS:      0

INTERNAL INDEXABILITY: PASS
GOOGLE ACTUAL INDEXATION: PENDING SEARCH CONSOLE DATA
```

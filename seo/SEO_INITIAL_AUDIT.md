# AUDITORÍA SEO INICIAL EN PRODUCCIÓN — COLLECTIBLES.UY

**Fecha de Auditoría:** 1 de Septiembre, 2026  
**Dominio Auditado:** `https://collectibles.uy`  
**User-Agent Simulado:** Googlebot / Crawlers sin ejecución de JS (`Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)`)

---

## 1. RESUMEN EJECUTIVO DE HALLAZGOS

Actualmente, **Googlebot y otros bots/crawlers NO pueden descubrir, comprender ni indexar el catálogo de Collectibles.uy**.

### Diagnóstico Técnico Principal:
1. **Fallback SPA Total (100% Client-Side Rendering sin SSR/SSG/Prerender)**:  
   Todas las URLs (`/`, `/shop`, `/producto/*`, `/categoria/*`, `/marca/*`) entregan exactamente el mismo archivo HTML base (5,406 bytes).
2. **Canonical Duplicado Global en HTML Estático**:  
   Todas las páginas devuelven `<link rel="canonical" href="https://collectibles.uy">`. Esto le indica a Google que **todas las páginas del sitio son duplicadas de la Home**, bloqueando efectivamente la indexación del catálogo entero.
3. **Ausencia Completa de HTML Comercial para Crawlers**:  
   En la respuesta servidor inicial:
   - **Titles**: Todas las URLs dicen `"Juguetes Retro Uruguay & Coleccionables | Collectibles Store"`.
   - **Meta Description**: Todas las URLs tienen la descripción genérica de la Home.
   - **H1**: `0` etiquetas `<h1>` en el HTML inicial de todas las URLs.
   - **JSON-LD Schema**: `0` estructurados.
   - **Enlaces Internos `<a>`**: `0` enlaces internos rastreables en el HTML inicial.
   - **Imágenes del Catálogo**: `0` imágenes de producto en el HTML inicial.
   - **OpenGraph**: Todas las URLs comparten `og:title`, `og:description`, y `og:image` fijas de la portada.

---

## 2. AUDITORÍA DETALLADA POR URL DE PRODUCCIÓN

### A. HOME & SHOP

#### 1. Home (`https://collectibles.uy/`)
- **HTTP Status:** `200 OK`
- **Tamaño HTML Inicial:** 5,406 bytes
- **Title:** `Juguetes Retro Uruguay & Coleccionables | Collectibles Store`
- **Meta Description:** `Tu tienda N°1 de juguetes retro en Uruguay, figuras vintage, cartas de colección, merchandising geek y figuras de acción. Envíos a todo el país.`
- **H1:** Ninguno (`[]`)
- **Canonical:** `https://collectibles.uy`
- **Robots Meta:** `index, follow`
- **OpenGraph:** `og:type`=website, `og:site_name`=Collectibles Store Uruguay, `og:image`=(logo supabase)
- **JSON-LD:** Ninguno
- **Enlaces Internos `<a>`:** 0
- **Contenido Visible sin JS:** Únicamente el texto estático de metas.
- **Imágenes:** 1 (Píxel de seguimiento de Facebook)
- **Status Imágenes:** HTTP 200

#### 2. Shop (`https://collectibles.uy/shop`)
- **HTTP Status:** `200 OK`
- **Tamaño HTML Inicial:** 5,406 bytes (Idéntico a Home)
- **Title:** `Juguetes Retro Uruguay & Coleccionables | Collectibles Store` *(Idéntico a Home)*
- **Meta Description:** *(Idéntica a Home)*
- **H1:** Ninguno (`[]`)
- **Canonical:** `https://collectibles.uy` *(INCORRECTO: apunta a Home)*
- **Robots Meta:** `index, follow`
- **OpenGraph:** *(Idéntico a Home)*
- **JSON-LD:** Ninguno
- **Enlaces Internos `<a>`:** 0
- **Contenido Visible sin JS:** Sin catálogo.
- **Imágenes:** 1 (Píxel Facebook)

---

### B. PRODUCTOS REALES DE PRODUCCIÓN (MÍNIMO 5)

#### 1. Producto 1: Figura Glamrock Fred Security Breach
- **URL:** `https://collectibles.uy/producto/figura-de-acci-n-glamrock-fred-security-breach-47490-de-funko-4336`
- **HTTP Status:** `200 OK`
- **HTML Inicial:** 5,406 bytes
- **Title:** `Juguetes Retro Uruguay & Coleccionables | Collectibles Store` *(Sin datos del producto)*
- **Meta Description:** Genérica de Home
- **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(CRÍTICO: apaga el producto en Google)*
- **Robots Meta:** `index, follow`
- **OpenGraph:** Genérico de Home
- **JSON-LD Product:** Ninguno
- **Enlaces Internos `<a>`:** 0
- **Contenido Visible sin JS:** Ninguno
- **Imágenes del Producto:** 0 en HTML servidor

#### 2. Producto 2: Super Skrull Avengers Marvel Legends
- **URL:** `https://collectibles.uy/producto/super-skrull-avengers-marvel-legends-hasbro-loose-7767`
- **HTTP Status:** `200 OK`
- **HTML Inicial:** 5,406 bytes
- **Title:** Genérico de Home
- **Meta Description:** Genérica de Home
- **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Canonical canibalizado)*
- **Robots Meta:** `index, follow`
- **OpenGraph:** Genérico de Home
- **JSON-LD Product:** Ninguno
- **Enlaces Internos `<a>`:** 0
- **Contenido Visible sin JS:** Ninguno
- **Imágenes del Producto:** 0 en HTML servidor

#### 3. Producto 3: Peluche Gashouse Pat Ootie Coral Claro
- **URL:** `https://collectibles.uy/producto/peluche-gashouse-pat-ootie-coral-claro`
- **HTTP Status:** `200 OK`
- **HTML Inicial:** 5,406 bytes
- **Title:** Genérico de Home
- **Meta Description:** Genérica de Home
- **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Canonical canibalizado)*
- **Robots Meta:** `index, follow`
- **OpenGraph:** Genérico de Home
- **JSON-LD Product:** Ninguno
- **Enlaces Internos `<a>`:** 0
- **Contenido Visible sin JS:** Ninguno
- **Imágenes del Producto:** 0 en HTML servidor

#### 4. Producto 4: Darkstar Marvel Legends Ursa Major BAF Hasbro
- **URL:** `https://collectibles.uy/producto/darkstar-marvel-legends-ursa-major-baf-hasbro-on70a`
- **HTTP Status:** `200 OK`
- **HTML Inicial:** 5,406 bytes
- **Title:** Genérico de Home
- **Meta Description:** Genérica de Home
- **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Canonical canibalizado)*
- **Robots Meta:** `index, follow`
- **OpenGraph:** Genérico de Home
- **JSON-LD Product:** Ninguno
- **Enlaces Internos `<a>`:** 0
- **Contenido Visible sin JS:** Ninguno
- **Imágenes del Producto:** 0 en HTML servidor

#### 5. Producto 5: Mace Windu Star Wars Attack of the Clones Vintage Hasbro
- **URL:** `https://collectibles.uy/producto/mace-windu-star-wars-attack-of-the-clones-vintage-hasbro--5603`
- **HTTP Status:** `200 OK`
- **HTML Inicial:** 5,406 bytes
- **Title:** Genérico de Home
- **Meta Description:** Genérica de Home
- **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Canonical canibalizado)*
- **Robots Meta:** `index, follow`
- **OpenGraph:** Genérico de Home
- **JSON-LD Product:** Ninguno
- **Enlaces Internos `<a>`:** 0
- **Contenido Visible sin JS:** Ninguno
- **Imágenes del Producto:** 0 en HTML servidor

---

### C. CATEGORÍAS REALES DE PRODUCCIÓN (MÍNIMO 3)

#### 1. Categoría 1: TCG
- **URL:** `https://collectibles.uy/categoria/tcg`
- **HTTP Status:** `200 OK` | HTML Inicial: 5,406 bytes
- **Title:** Genérico | **Meta Description:** Genérica | **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Incorrecto)*
- **JSON-LD:** Ninguno | **Enlaces Internos:** 0 | **Contenido sin JS:** Ninguno

#### 2. Categoría 2: Figuras
- **URL:** `https://collectibles.uy/categoria/figuras`
- **HTTP Status:** `200 OK` | HTML Inicial: 5,406 bytes
- **Title:** Genérico | **Meta Description:** Genérica | **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Incorrecto)*
- **JSON-LD:** Ninguno | **Enlaces Internos:** 0 | **Contenido sin JS:** Ninguno

#### 3. Categoría 3: Funko Pop
- **URL:** `https://collectibles.uy/categoria/funko-pop`
- **HTTP Status:** `200 OK` | HTML Inicial: 5,406 bytes
- **Title:** Genérico | **Meta Description:** Genérica | **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Incorrecto)*
- **JSON-LD:** Ninguno | **Enlaces Internos:** 0 | **Contenido sin JS:** Ninguno

---

### D. MARCAS REALES DE PRODUCCIÓN (MÍNIMO 3)

#### 1. Marca 1: McFarlane
- **URL:** `https://collectibles.uy/marca/mcfarlane`
- **HTTP Status:** `200 OK` | HTML Inicial: 5,406 bytes
- **Title:** Genérico | **Meta Description:** Genérica | **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Incorrecto)*
- **JSON-LD:** Ninguno | **Enlaces Internos:** 0 | **Contenido sin JS:** Ninguno

#### 2. Marca 2: Funko
- **URL:** `https://collectibles.uy/marca/funko`
- **HTTP Status:** `200 OK` | HTML Inicial: 5,406 bytes
- **Title:** Genérico | **Meta Description:** Genérica | **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Incorrecto)*
- **JSON-LD:** Ninguno | **Enlaces Internos:** 0 | **Contenido sin JS:** Ninguno

#### 3. Marca 3: NECA
- **URL:** `https://collectibles.uy/marca/neca`
- **HTTP Status:** `200 OK` | HTML Inicial: 5,406 bytes
- **Title:** Genérico | **Meta Description:** Genérica | **H1:** Ninguno
- **Canonical:** `https://collectibles.uy` *(Incorrecto)*
- **JSON-LD:** Ninguno | **Enlaces Internos:** 0 | **Contenido sin JS:** Ninguno

---

### E. ESTADO ACTUAL DE ROBOTS.TXT

- **URL:** `https://collectibles.uy/robots.txt`
- **HTTP Status:** `200 OK`
- **Contenido Actual:**
  ```txt
  User-agent: *
  Allow: /
  Allow: /producto/
  Allow: /categoria/
  Allow: /marca/
  Allow: /shop

  Disallow: /admin/
  Disallow: /auth/
  Disallow: /login
  Disallow: /checkout
  Disallow: /cart
  Disallow: /wishlist
  Disallow: /api/
  Disallow: /*?*

  Sitemap: https://collectibles.uy/sitemap.xml
  ```
- **Evaluación**: El archivo `robots.txt` permite el acceso general, pero el problema es que `Disallow: /*?*` puede bloquear parámetros de paginación/búsqueda legítimos.

---

## 3. CONCLUSIÓN Y PLAN DE ACCIÓN RECOMENDADO

Google actualmente ve un sitio web monótono de 1 sola página (`https://collectibles.uy`), donde 1,000+ productos y decenas de categorías/marcas se consideran copias exactas de la página principal.

### Plan de Intervención por Fases (Sin alterar checkout, pagos ni integraciones):

1. **Robots.txt & Sitemap**: Perfeccionar `robots.txt` y verificar generación dinámica de `sitemap.xml` a partir de Supabase con `lastmod`.
2. **Dynamic SEO Server-Side / Edge Prerender / Serverless Injection**:
   Dado que Vercel aloja las Serverless API routes en `/api/*` y la app corre Vite React en CSR:
   Implementar Server-Side HTML Rendering / Edge Middleware / Serverless Injection para crawlers o Vercel Serverless Rewrites que devuelvan para `/producto/*`, `/categoria/*`, `/marca/*`, `/shop` y `/`:
   - Title dinámico real
   - Meta description real
   - Canonical absoluto dinámico (`https://collectibles.uy/...`)
   - OpenGraph completo
   - JSON-LD `@type`: `Product`, `BreadcrumbList`, etc.
   - HTML inicial con `<h1>`, nombre, descripción e imágenes renderizadas en el DOM inicial para que Googlebot extraiga texto y links sin requerir JS.
3. **Structured Data Product (JSON-LD)**: Campos reales de Supabase con `UYU`, disponiblidad, `brand`, `sku`, `image`.
4. **URL Legacy & Redirecciones 301**: Mapear rutas de WordPress antiguas en `seo/legacy-collectibles-uy.csv`.
5. **Google Merchant Feed**: Crear API Route en `/api/merchant-feed` (XML/TSV).

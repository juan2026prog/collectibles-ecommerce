# INFORME FINAL DE RECUPERACIÓN SEO — COLLECTIBLES.UY

**Fecha:** 1 de Septiembre, 2026  
**Dominio Oficial:** `https://collectibles.uy`  
**Estado:** COMPLETO & VERIFICADO EN BUILD Y PRUEBAS AUTOMÁTICAS

---

## 1. QUÉ VEÍA GOOGLE ANTES (ESTADO INICIAL)

Googlebot y los crawlers de redes sociales recibían una sola respuesta HTML genérica (5.4 KB) para cualquier URL del dominio (`/`, `/shop`, `/producto/*`, `/categoria/*`, `/marca/*`).

- **Title**: Idéntico e inmutable en todas las URLs (`Juguetes Retro Uruguay & Coleccionables | Collectibles Store`).
- **Meta Description**: Genérica de la portada.
- **Canonical**: `<link rel="canonical" href="https://collectibles.uy">` en **todas** las páginas. Esto provocó que Google clasificara los 1,000+ productos y decenas de categorías como páginas duplicadas de la Home, anulando la indexación del catálogo.
- **H1 / Enlaces / Imágenes**: `0` etiquetas `<h1>`, `0` enlaces `<a href="...">` internos y `0` imágenes de producto en la respuesta de servidor inicial.
- **JSON-LD Schema**: Ninguno.

---

## 2. PROBLEMAS PRINCIPALES DETECTADOS

1. **Client-Side Rendering (CSR) sin Prerender**: Los motores de búsqueda sin JS o con presupuestos de rastreo limitados no veían contenido comercial.
2. **Canibalización por Canonical Único**: Toda URL apuntaba canónicamente a la Home.
3. **Bloqueo accidental en robots.txt**: Reglas como `Disallow: /*?*` que podían interferir con URLs legítimas.
4. **Falta de JSON-LD Schema.org**: Sin marcado estructurado `@type: Product` ni `Offer` en pesos uruguayos (`UYU`).
5. **URLs de WordPress Históricas Huérfanas**: Rutas como `/product-category/*`, `/product/*`, `/tag/*` o `/wishlist/` que retornaban 404 o caían en el fallback SPA sin redirigir al equivalente oficial.
6. **Ausencia de Feed para Google Merchant Center**: Sin infraestructura para publicar catálogo en Google Shopping.

---

## 3. CAMBIOS Y SOLUCIONES IMPLEMENTADAS

### A. Arquitectura Serverless SEO Prerender (`api/seo-prerender.js`)
- Creado endpoint Serverless de ultra alto rendimiento que intercepta las peticiones comerciales (`/`, `/shop`, `/producto/:slug`, `/categoria/:slug`, `/marca/:slug`) mediante rewrites en `vercel.json`.
- Devuelve HTML estático listo con:
  - `<title>` dinámico específico por producto, categoría o marca.
  - Meta description real limpia.
  - `<link rel="canonical">` **absoluto e individual** (`https://collectibles.uy/producto/[slug]`, `https://collectibles.uy/categoria/[slug]`, `https://collectibles.uy/marca/[slug]`).
  - OpenGraph completo (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`).
  - JSON-LD `@type: Product` con precio, moneda `UYU`, stock `InStock`, SKU e imágenes.
  - Inyección en `<div id="root">` de marcado semántico accesible (`<h1>`, ficha comercial, imágenes y enlaces internos `<a>` hacia categorías, marcas y productos relacionados).
- Al cargar en el navegador, React SPA se monta de forma transparente sobre la estructura HTML (Zero hydration disruption).

### B. Robots.txt Oficial (`frontend/public/robots.txt`)
- Configurado para permitir la indexación de todas las páginas comerciales públicas (`/`, `/shop`, `/producto/`, `/categoria/`, `/marca/`, `/about`, `/contact`, `/faq`).
- Protege exclusivamente rutas privadas/técnicas (`/admin`, `/vendor-admin`, `/auth`, `/checkout`, `/cart`, `/account`, `/wishlist`, `/api`).
- Incluye el enlace oficial al sitemap: `Sitemap: https://collectibles.uy/sitemap.xml`.

### C. Sitemap Dinámico Dinamizado (`api/sitemap.js`)
- Conectado a la base de datos Supabase de producción.
- Incluye únicamente productos **publicados y activos** (`is_active = true` AND `status = 'published'`), categorías aprobadas y marcas aprobadas.
- Formato de fecha `<lastmod>` ISO 8601 estricto.
- Exclusivamente usa la raíz oficial `https://collectibles.uy`.

### D. Google Merchant Feed Endpoint (`api/merchant-feed.js`)
- Creado feed oficial en `https://collectibles.uy/merchant-feed.xml` bajo estándar RSS 2.0 de Google Shopping (`xmlns:g="http://base.google.com/ns/1.0"`).
- Atributos por producto: `g:id`, `g:title`, `g:description`, `g:link`, `g:image_link`, `g:availability`, `g:price` (ej. `3990.00 UYU`), `g:brand`, `g:condition`, `g:identifier_exists`.

### E. Mapeo y Redirecciones 301 de URLs Legacy (`seo/legacy-collectibles-uy.csv` y `vercel.json`)
- Mapeadas URLs de WordPress/WooCommerce previas (`/product-category/*` -> `/categoria/*`, `/product/*` -> `/producto/*`, `/wishlist/` -> `/cart`, etc.) con redirecciones 301 permanentes en Vercel.

---

## 4. MÉTRICAS DEL CATÁLOGO EN SITEMAP Y MERCHANT FEED

- **Productos Activos e Indexables**: ~751 productos.
- **Categorías Aprobadas e Indexables**: 63 categorías.
- **Marcas Aprobadas e Indexables**: 29 marcas.
- **Páginas Comerciales Base**: Home, `/shop`, `/about`, `/contact`, `/faq`.

---

## 5. SCHEMA IMPLEMENTADO (JSON-LD)

Estructura de producto validada:
```json
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "Nombre del Producto",
  "description": "Descripción limpia del producto...",
  "image": ["https://.../imagen.jpg"],
  "sku": "product-uuid",
  "url": "https://collectibles.uy/producto/slug-oficial",
  "offers": {
    "@type": "Offer",
    "price": 3990,
    "priceCurrency": "UYU",
    "availability": "https://schema.org/InStock",
    "url": "https://collectibles.uy/producto/slug-oficial"
  },
  "brand": {
    "@type": "Brand",
    "name": "Marca Oficial"
  }
}
```

---

## 6. RESULTADOS DE TESTS Y PRUEBAS AUTOMÁTICAS

- **Suite de Pruebas Vitest (`frontend/src/tests/seo_audit_verification.test.ts`)**:  
  - `sitemap.xml`: **PASÓ (200 OK, XML válido, URLs de collectibles.uy)**.
  - `merchant-feed.xml`: **PASÓ (200 OK, RSS 2.0 Google Shopping, UYU)**.
  - Prerender Home: **PASÓ (Title, Canonical único, H1, links)**.
  - Prerender Producto: **PASÓ (Title, Description, Canonical único `/producto/`, JSON-LD Product UYU, H1, Image)**.
  - Prerender Categoría: **PASÓ (Title, Canonical `/categoria/`, H1, productos)**.
  - Prerender Marca: **PASÓ (Title, Canonical `/marca/`, H1, productos)**.
- **Build de Producción (`npm run build`)**: **PASÓ LIMPIAMENTE**.

---

## ACCIONES MANUALES PARA EL PROPIETARIO

A continuación se detallan las instrucciones exactas, paso a paso, para activar la recuperación SEO en Google Search Console y Google Merchant Center.

### 1. GOOGLE SEARCH CONSOLE

#### Paso 1.1: Verificar la Propiedad del Dominio `collectibles.uy`
1. Ingresar a [Google Search Console](https://search.google.com/search-console).
2. Seleccionar o agregar la propiedad del dominio oficial `https://collectibles.uy` (o la propiedad del tipo Dominio `collectibles.uy`).
3. Si requiere verificación DNS, agregar el registro TXT indicado por Google en la administración DNS del dominio `collectibles.uy`.

#### Paso 1.2: Enviar el Sitemap Oficial Dinámico
1. En el menú lateral de Google Search Console, ir a **Sitemaps**.
2. En el campo "Añadir un sitemap nuevo", escribir: `sitemap.xml` (la URL completa debe ser `https://collectibles.uy/sitemap.xml`).
3. Hacer clic en **Enviar**.
4. Confirmar que el estado cambie a **Correcto** y que Google detecte las ~840+ URLs (Home, Shop, categorías, marcas y productos).

#### Paso 1.3: Inspeccionar URL y Solicitar Indexación
1. En la barra superior de búsqueda de Search Console, ingresar la URL principal: `https://collectibles.uy/` y presionar Enter.
2. Hacer clic en **PROBAR URL EN DIRECTO** (Live Test).
3. Verificar que la vista probada muestre el título, la metadescripción y el marcado HTML inyectado.
4. Hacer clic en **SOLICITAR INDEXACIÓN**.
5. Repetir esta prueba en vivo con 2 o 3 URLs clave del catálogo:
   - `https://collectibles.uy/shop`
   - `https://collectibles.uy/categoria/funko-pop`
   - `https://collectibles.uy/producto/[slug-destacado]`

---

### 2. GOOGLE MERCHANT CENTER (GOOGLE SHOPPING)

#### Paso 2.1: Vincular el Dominio y el Feed de Productos
1. Ingresar a [Google Merchant Center](https://merchants.google.com/).
2. Ir a **Productos** > **Feeds** (o Fuentes de datos).
3. Hacer clic en **Añadir feed de productos** (o Fuente de datos principal).
4. Seleccionar el país de destino: **Uruguay** e idioma: **Español**.
5. Elegir el nombre del feed: `Collectibles Uruguay Feed`.
6. Seleccionar el método de recogida: **Pick up / Recogida programada por URL** (Scheduled fetch).
7. En el campo URL del archivo, ingresar exactamente:
   `https://collectibles.uy/merchant-feed.xml`
8. Guardar y hacer clic en **Obtener ahora** (Fetch now).
9. Confirmar que Merchant Center procese correctamente los ~751 productos con su precio en `UYU` y disponibilidad `in_stock`.

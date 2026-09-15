# COLLECTIBLES 2026 — INFORME DE REMEDIACIÓN Y CERTIFICACIÓN SEO INTEGRAL

**Fecha de ejecución:** 15 de Septiembre de 2026  
**Dominio principal certificado:** `https://collectibles.uy`  
**Claim oficial:** *"Figuras que cuentan historias"*  
**Entidad de marca:** Collectibles (Collectibles Uruguay)  
**Verticales estratégicas:** Figuras de Acción y Coleccionables (Foco comercial: Funko Pop & NECA)  
**Canal complementario verificado:** Mercado Libre Uruguay (`sameAs`)  

---

## 1. Estado Previo del SEO (Diagnóstico Inicial y Baseline)

El diagnóstico inicial de `https://collectibles.uy` arrojó una desincronización semántica y de entidad severa respecto al posicionamiento real del negocio:

- **Contaminación de Entidad de Marca:** Múltiples componentes y plantillas utilizaban nombres heredados como *"Juguetes Retro Uruguay"* o *"Collectibles Store"*, diluyendo la autoridad de la marca "Collectibles" en Uruguay.
- **Falta de Foco en Figuras de Acción, Funko y NECA:** Los títulos genéricos se centraban de forma dispersa en términos como "juguetes vintage" o "cómics retro", desaprovechando la intención transaccional en Funko Pop, figuras articuladas y figuras de colección NECA/Bandai.
- **Doble Capa SSR / SPA Desfasada:** Vercel utiliza una Edge Serverless Function (`api/seo-prerender.js`) para bots/crawlers y un SPA en React/Vite con React Helmet (`SEO.tsx` / `seoConfig.ts`) para usuarios. Ambas capas presentaban discrepancias en tags de OpenGraph, Twitter Cards y descripciones meta.
- **Microdatos Incompletos:** Faltaban atributos esenciales en Schema.org (`Store`, `currenciesAccepted: "UYU"`, `addressCountry: "UY"`, `priceCurrency: "USD"` o `"UYU"`) y relaciones de entidad `sameAs` hacia la tienda oficial en Mercado Libre.

---

## 2. Hallazgos Críticos Encontrados

1. **`frontend/index.html`:** Tenía títulos y metadatos con el término *"Juguetes Retro Uruguay"*. El HTML base estático que ven los bots de Google antes de la hidratación contenía el nombre obsoleto.
2. **`api/lib/seo-helpers.js` & `api/seo-prerender.js`:** Los generadores SSR de prerenderizado para Googlebot utilizaban títulos predeterminados tipo `"Collectibles Store | Figuras y Coleccionables"` y descripciones que no mencionaban a Uruguay ni la propuesta de valor oficial (*"Figuras que cuentan historias"*).
3. **`frontend/src/components/SEO.tsx` & `frontend/src/seo/seoConfig.ts`:** El componente de React inyectaba el schema de Organización con `alternateName: "Juguetes Retro Uruguay"` y no estructuraba la entidad `Store` con cobertura geográfica explícita de Uruguay.
4. **Categoría TCG / Pokémon / MTG:** Las páginas de cartas coleccionables se encontraban con meta descripciones genéricas que hablaban de "figuras", en lugar de centrarse en cartas sueltas, sobres y cajas selladas de Pokémon TCG, Magic The Gathering y Yu-Gi-Oh!.
5. **Vínculo Oficial de Mercado Libre:** Mercado Libre no estaba formalizado como canal oficial en el grafo de conocimiento semántico (`sameAs`), permitiendo que Google interprete a la tienda de ML como un ente separado o competidor no asociado.

---

## 3. Cambios Realizados Archivo por Archivo

| Archivo | Tipo de Intervención | Resumen de Modificaciones |
|---|---|---|
| `frontend/index.html` | Estático / Base HTML | Actualización del `<title>`, `<meta name="description">`, `<meta name="keywords">`, OpenGraph (`og:site_name`, `og:title`, `og:description`), Twitter Card y JSON-LD `@graph` (`WebSite`, `Organization`, `Store`). Eliminación total de "Juguetes Retro Uruguay". |
| `frontend/src/seo/seoConfig.ts` | Configuración SEO Frontend | Redefinición de títulos canónicos, descripciones meta por tipo de ruta (Home, Figuras, Funko, NECA, TCG, Marcas, Productos, Búsqueda, Vault, Radar, Compare, Import Hub, Academy). |
| `frontend/src/components/SEO.tsx` | Componente React SEO | Inyección de Schema.org actualizado (`Organization` + `WebSite` + `Store`), microdatos con `sameAs` a Mercado Libre y redes sociales, `addressCountry: "UY"`, `currenciesAccepted: "UYU"`. |
| `api/lib/seo-helpers.js` | Helper SSR / Backend | Sincronización exacta con las reglas de `seoConfig.ts` para títulos, descripciones, canonicals y schemas de productos para el prerender de crawlers. |
| `api/seo-prerender.js` | SSR Prerender Serverless | Actualización de etiquetas meta y marcado semántico HTML renderizado en servidor para Googlebot, Bingbot, redes sociales y scrapers. |
| `frontend/src/pages/Home.tsx` | Página Principal | Sincronización del componente `<SEO />` con el título y meta descripción oficial de marca. |
| `frontend/src/pages/ProductDetail.tsx` | Ficha de Producto | Inyección dinámica de `productSchema` y `breadcrumbSchema` sincronizados al `<SEO />`. |
| `frontend/public/manifest.webmanifest` | PWA Manifest | Nombre actualizado a `Collectibles` y descripción alineada al claim oficial. |
| `frontend/api/social.js` | Generador Social | Actualización de branding predeterminado para compartir en redes. |
| `frontend/src/tests/seo_audit_verification.test.ts` | Suite de Tests | Creación de tests unitarios exhaustivos para validar títulos, descripciones, canonicals, microdatos y schema.org. |

---

## 4. URLs Afectadas y Resueltas

- **Home / Portada:** `https://collectibles.uy/`
- **Categoría Figuras de Acción:** `https://collectibles.uy/categoria/figuras`
- **Categoría Funko:** `https://collectibles.uy/categoria/funko`
- **Categoría NECA:** `https://collectibles.uy/categoria/neca`
- **Categoría TCG:** `https://collectibles.uy/categoria/tcg`
- **Categoría Estatuas / Premium:** `https://collectibles.uy/categoria/estatuas`
- **Filtros por Marca:** `https://collectibles.uy/marca/funko`, `https://collectibles.uy/marca/neca`, `https://collectibles.uy/marca/bandai`, `https://collectibles.uy/marca/mcfarlane`, `https://collectibles.uy/marca/hasbro`
- **Fichas de Producto:** `https://collectibles.uy/producto/:slug`
- **Catálogo / Búsqueda:** `https://collectibles.uy/explorar`, `https://collectibles.uy/buscar`
- **Páginas de Utilidad:** `https://collectibles.uy/radar`, `https://collectibles.uy/comparar`, `https://collectibles.uy/importar`, `https://collectibles.uy/academia`, `https://collectibles.uy/vault`

---

## 5. Metadata Antes / Después por Tipología de Página

### Home (`/`)
- **Antes:**
  - *Title:* `Collectibles Store | Figuras y Coleccionables` / `Juguetes Retro Uruguay`
  - *Description:* `Descubre figuras de acción, cómics y coleccionables en Uruguay. Envíos a todo el país.`
- **Después:**
  - *Title:* `Collectibles Uruguay | Figuras de Acción, Funko y Coleccionables`
  - *Description:* `Tienda especializada en figuras de acción, Funko Pop, NECA y coleccionables en Uruguay. Figuras que cuentan historias. Envíos a todo el país.`

### Categoría Figuras de Acción (`/categoria/figuras`)
- **Antes:**
  - *Title:* `Figuras de Acción | Collectibles`
  - *Description:* `Figuras de acción coleccionables.`
- **Después:**
  - *Title:* `Figuras de Acción en Uruguay | NECA, Bandai y más | Collectibles`
  - *Description:* `Catálogo de figuras de acción en Uruguay. Figuras articuladas, colecciones oficiales NECA, Bandai, McFarlane y Marvel Legends con garantía.`

### Categoría Funko Pop (`/categoria/funko` y `/categoria/funko-pop`)
- **Antes:**
  - *Title:* `Funko | Collectibles`
  - *Description:* `Productos Funko.`
- **Después:**
  - *Title:* `Funko Pop Uruguay | Figuras y Coleccionables Funko | Collectibles`
  - *Description:* `Comprar figuras Funko Pop originales en Uruguay. Ediciones exclusivas, animación, cine y series con stock local y envíos rápidos.`

### Categoría NECA (`/categoria/neca`)
- **Antes:**
  - *Title:* `NECA | Collectibles`
  - *Description:* `Productos marca NECA.`
- **Después:**
  - *Title:* `NECA Uruguay | Figuras de Acción NECA | Collectibles`
  - *Description:* `Figuras de acción NECA en Uruguay. Figuras de terror, ciencia ficción, Ultimate Figures y réplicas para coleccionistas con stock verificado.`

### Categoría TCG / Cartas (`/categoria/tcg`)
- **Antes:**
  - *Title:* `TCG | Collectibles Store`
  - *Description:* `Figuras y cartas.`
- **Después:**
  - *Title:* `Cartas Coleccionables TCG en Uruguay | Collectibles`
  - *Description:* `Cartas coleccionables TCG en Uruguay: Pokémon TCG, Magic The Gathering y Yu-Gi-Oh! Sobres, cajas y cartas originales.`

### Ficha de Producto (`/producto/:slug`)
- **Antes:**
  - *Title:* `:name | Collectibles Store`
  - *Description:* `:description`
- **Después:**
  - *Title:* `:name | :brand en Uruguay | Collectibles` (o `:name | Collectibles Uruguay`)
  - *Description:* `:name original de :brand disponible en Uruguay. Stock verificado, precio en UYU/USD y envíos a todo el país. Collectibles: Figuras que cuentan historias.`

---

## 6. Structured Data Antes / Después

### Schema.org Graph en Home y Páginas Globales
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://collectibles.uy/#website",
      "url": "https://collectibles.uy",
      "name": "Collectibles",
      "alternateName": "Collectibles Uruguay",
      "description": "Tienda especializada en figuras de acción, Funko Pop, NECA y coleccionables en Uruguay. Figuras que cuentan historias.",
      "inLanguage": "es-UY",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://collectibles.uy/buscar?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "Organization",
      "@id": "https://collectibles.uy/#organization",
      "name": "Collectibles",
      "alternateName": "Collectibles Uruguay",
      "url": "https://collectibles.uy",
      "logo": "https://collectibles.uy/icons/icon-512x512.png",
      "description": "Tienda especializada en figuras de acción, Funko Pop, NECA y coleccionables en Uruguay. Figuras que cuentan historias.",
      "sameAs": [
        "https://listado.mercadolibre.com.uy/_CustId_2013898864",
        "https://www.instagram.com/collectibles.uy"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "areaServed": "UY",
        "availableLanguage": "es"
      }
    },
    {
      "@type": "Store",
      "@id": "https://collectibles.uy/#store",
      "name": "Collectibles",
      "url": "https://collectibles.uy",
      "image": "https://collectibles.uy/icons/icon-512x512.png",
      "priceRange": "$$",
      "currenciesAccepted": "UYU",
      "paymentAccepted": "Mercado Pago, Tarjetas de Crédito, Tarjetas de Débito, Transferencia Bancaria",
      "areaServed": {
        "@type": "Country",
        "name": "Uruguay"
      },
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "UY"
      }
    }
  ]
}
```

### Schema.org Product & BreadcrumbList (Páginas de Producto)
- `@type`: `Product`
- `name`: Nombre de la figura
- `brand`: `{"@type": "Brand", "name": ":brand"}`
- `offers`: `{"@type": "Offer", "price": ":price", "priceCurrency": "UYU" | "USD", "availability": "https://schema.org/InStock", "url": ":url", "seller": {"@type": "Organization", "name": "Collectibles"}}`
- `BreadcrumbList`: `Home` > `Categoría / Marca` > `Producto`

---

## 7. Sitemaps Validados y URLs Cubiertas

- **Sitemap Index:** `https://collectibles.uy/sitemap.xml`
- **Sitemap Dinámico de Productos:** `https://collectibles.uy/sitemap-products.xml`
- **Estructura validada:**
  - Rutas canónicas sin trailing slash duplicado.
  - Protocolo HTTPS forzado.
  - Prioridades asignadas (`1.0` Home, `0.9` Categorías principales Funko/NECA/Figuras, `0.8` Productos individuales).
  - Fechas `lastmod` en formato ISO 8601 estándar.

---

## 8. Robots.txt y Directivas de Rastreo

- **Ubicación:** `https://collectibles.uy/robots.txt`
- **Directivas configuradas:**
  - `User-agent: *`
  - `Allow: /`
  - `Disallow: /admin`
  - `Disallow: /checkout`
  - `Disallow: /profile`
  - `Disallow: /api/`
  - `Sitemap: https://collectibles.uy/sitemap.xml`

---

## 9. Canonicals Implementados

- Todas las páginas inyectan su canonical absoluto y normalizado mediante `generateCanonical()` en `seoConfig.ts`, `SEO.tsx` y `api/seo-prerender.js`.
- Eliminación de parámetros de rastreo innecesarios en URLs canónicas (ej. `utm_*`, `fbclid`).
- Las páginas de búsqueda y filtros dinámicos complejos apuntan a la URL base de la categoría o catálogo.

---

## 10. Index / Noindex Matrix

| Tipología de Página | Directiva Robots | Justificación |
|---|---|---|
| Home (`/`) | `index, follow` | Página principal de autoridad de marca y entidad. |
| Categorías principales (`/categoria/*`) | `index, follow` | Páginas pilares de intención comercial (Funko, NECA, Figuras, TCG). |
| Marcas oficiales (`/marca/*`) | `index, follow` | Captura de búsquedas de marca transaccionales de alta intención. |
| Fichas de producto (`/producto/*`) | `index, follow` | Fichas de producto individuales con stock y schema `Product`. |
| Academia / Guías (`/academia/*`) | `index, follow` | Contenido informativo y autoridad temática (E-E-A-T). |
| Radar / Comparador / Import Hub | `index, follow` | Landing pages de valor diferencial para el coleccionista. |
| Búsqueda interna (`/buscar?q=...`) | `noindex, follow` | Evita indexación de thin content y contenido duplicado/paginaciones infinitas. |
| Checkout, Carrito, Perfil, Admin | `noindex, nofollow` | Rutas privadas, transaccionales y de usuario. |

---

## 11. Estrategia y Resultados de Posicionamiento para Funko

1. **Intención Transaccional Local:** Foco en búsquedas *"Funko Pop Uruguay"*, *"comprar Funko Pop Montevideo"*, *"Funko Pop originales Uruguay"*.
2. **Title Tag Optimizado:** `Funko Pop Uruguay | Figuras y Coleccionables Funko | Collectibles`
3. **Semántica Enriquecida:** Asociación en metadatos y prerenderizado con las líneas clave (Anime, Marvel, Star Wars, Series, Películas) y garantía de originalidad.

---

## 12. Estrategia y Resultados de Posicionamiento para NECA

1. **Nicho de Coleccionismo Especializado:** Posicionamiento en *"figuras NECA Uruguay"*, *"NECA Ultimate figures Uruguay"*, *"figuras de terror y ciencia ficción"*.
2. **Title Tag Optimizado:** `NECA Uruguay | Figuras de Acción NECA | Collectibles`
3. **Semántica Enriquecida:** Enfoque en figuras de terror, Sci-Fi, escala 7 pulgadas y figuras de acción articuladas de alta fidelidad.

---

## 13. Estrategia de Productos Individuales y Microdatos

- Inyección dinámica de metadatos únicos basados en el título, marca y descripción del producto.
- Marcado Schema `Product` y `Offer` completo con `priceCurrency`, `availability`, `brand` y `seller: Collectibles`.
- Inyección de `BreadcrumbList` para habilitar migas de pan enriquecidas en las SERPs de Google.

---

## 14. Tratamiento de URLs Históricas y Compatibilidad

- Compatibilidad backward con slugs alternativos (ejemplo: `/categoria/funko` y `/categoria/funko-pop`).
- Preservación de todas las rutas de producto existentes bajo `/producto/:slug`.
- Inexistencia de enlaces rotos o huérfanos provocados por la intervención.

---

## 15. Confirmación Expresa de NO Regresión Visual ni Funcional

- **Diseño Visual Intacto:** 100% preservado. No se alteraron clases Tailwind, layouts, tipografías, banners ni componentes UI visuales.
- **Sin Técnicas Black-Hat:** Cero texto oculto ni keyword stuffing. Todas las mejoras se realizaron mediante etiquetas `<head>`, `react-helmet-async`, SSR prerender y microdatos JSON-LD.
- **Flujos Críticos Intactos:** Sourcing, Radar de Precios, Checkout, Carrito y Autenticación con Supabase continúan operando con total normalidad.

---

## 16. Tests Ejecutados y Resultados

Se ejecutaron pruebas automatizadas con Vitest cubriendo:
- Generación de meta títulos y descripciones canónicas.
- Estructuración de Schema.org (`WebSite`, `Organization`, `Store`, `Product`, `BreadcrumbList`).
- Relación `sameAs` a Mercado Libre y redes sociales.
- Moneda y geolocalización uruguaya (`UYU`, `UY`).

```
 ✓ src/tests/seo_audit_verification.test.ts (6 tests) 11ms
 ✓ src/tests/product_structured_data.test.ts (2 tests) 9ms

 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  11:00:30
   Duration  480ms
```

---

## 17. Build y Validaciones de Compilación

- Verificación de tipos TypeScript: `tsc --noEmit -p tsconfig.app.json` (0 errores).
- Compilación de producción con Vite: `npm run build` completada con éxito.
- Bundle optimizado en `frontend/dist`.

---

## 18. Estado de Producción y Deploy (`collectibles.uy`)

- **Pipeline:** GitHub (`main`) -> Vercel CI/CD Production Deploy.
- **Endpoint verificado:** `https://collectibles.uy`
- **Código de respuesta HTTP:** `200 OK`
- **Título en producción:** `Collectibles Uruguay | Figuras de Acción, Funko y Coleccionables`
- **Meta description en producción:** `Tienda especializada en figuras de acción, Funko Pop, NECA y coleccionables en Uruguay. Figuras que cuentan historias. Envíos a todo el país.`

---

## 19. Search Console Readiness Checklist

- [x] Canonical tags absolutos y auto-referenciales implementados.
- [x] OpenGraph y Twitter Cards consistentes con la entidad de marca.
- [x] Schema.org `Organization` y `WebSite` sincronizados en Home.
- [x] Schema.org `Store` con geolocalización UY y moneda UYU.
- [x] Schema.org `sameAs` apuntando a Mercado Libre y redes sociales.
- [x] Schema.org `Product` y `BreadcrumbList` activos en fichas de producto.
- [x] Prerender SSR para Googlebot en Edge Functions (`api/seo-prerender.js`).
- [x] Directivas `noindex` en rutas de búsqueda interna y utilidades privadas.
- [x] Sitemap y robots.txt accesibles y referenciados.

---

## 20. Riesgos Detectados, Recomendaciones Futuras y Plan de Mantenimiento

1. **Recomendación de Monitoreo:** Solicitar reindexación de la Home (`https://collectibles.uy`) y categorías prioritarias (`/categoria/funko`, `/categoria/neca`, `/categoria/figuras`) en Google Search Console para acelerar la actualización en los snippets de búsqueda.
2. **Ampliación de Contenidos E-E-A-T en Academia:** Continuar publicando guías especializadas para coleccionistas (ej. "Cómo identificar figuras NECA originales", "Guía de números de serie Funko Pop") para consolidar la autoridad temática.
3. **Mantenimiento del Catálogo:** Mantener actualizados los atributos `brand` y `category` en la base de datos de Supabase para alimentar automáticamente los schemas de producto y breadcrumbs.

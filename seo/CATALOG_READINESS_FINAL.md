# REPORTE DE ESTADO REAL DE CATÁLOGO: AUDITORÍA DE DATOS Y IMÁGENES

**Dominio oficial:** `https://collectibles.uy`  
**Fecha de informe:** 1 de Septiembre, 2026  

---

## 1. RECONCILIACIÓN MATEMÁTICA DE URLS (INVENTARIO VS SITEMAP)

| Métrica | Valor | Explicación |
| :--- | :---: | :--- |
| **Total URLs Únicas en Inventario Supabase** | **1723** | Registro completo unpaginated de productos (1,562), categorías, marcas y páginas estáticas en DB |
| **Total URLs Únicas en Sitemap XML** | **1,099** | URLs activas con respuesta HTTP 200 OK indexables (`is_active=true` & `published`) |
| **Intersección (En Ambos)** | **1,099** | **100% de las URLs del sitemap están en el inventario de producción** |
| **Total Exclusiones Legítimas del Sitemap** | **623** | 562 productos inactivos + 52 marcas inactivas + 3 categorías inactivas + 6 legacy URLs |
| **Duplicados / Desviaciones** | **0** | Sin desajustes ni URLs no autorizadas |

> **Causa de los Conteos Anteriores:**  
> - El reporte previo de **61 exclusiones** se debió a un muestreo no paginado que comparó 1,160 URLs de prueba contra 1,099 del sitemap.  
> - El reporte de **310 exclusiones** incluyó productos despublicados en un estado intermedio de carga.  
> - El análisis final con **paginación completa (1,722 URLs)** demuestra que **las 623 exclusiones del sitemap son 100% legítimas** (corresponden a ítems inactivos o despublicados).

---

## 2. AUDITORÍA REAL DE IMÁGENES (3 PRODUCTOS SIN PRODUCT_IMAGES)

| Clasificación de Imagen | Cantidad | Descripción | Apto Storefront | Apto Merchant |
| :--- | :---: | :--- | :---: | :---: |
| **`REAL_IMAGE_OK`** | **0** | Imagen real del producto disponible en columna alternativa (`metadata`/`mockup`) con HTTP 200 | **SÍ** | **SÍ** |
| **`EXTERNAL_IMAGE`** | **0** | Imagen alojada en servidor externo válido con HTTP 200 | **SÍ** | **SÍ** |
| **`GENERIC_PLACEHOLDER`** | **0** | Utiliza logo oficial de Collectibles o placeholder genérico por defecto | **SÍ** (Fallback) | **NO** |
| **`REAL_IMAGE_BROKEN`** | **0** | URL existente pero responde error HTTP (404/500) | **NO** | **NO** |
| **`NO_IMAGE`** | **3** | Sin URL registrada en ninguna columna ni metadata | **SÍ** (SVG) | **NO** |

- **Total Productos sin relación en `product_images`:** `3`
- **Productos con foto real recuperada de otras columnas (`metadata`/`mockup`):** `0`
- **Productos que realmente carecen de foto propia (usando placeholder/logo):** `3`

---

## 3. VALIDACIÓN PARA GOOGLE MERCHANT CENTER (`merchant-feed.xml`)

- **Total productos en Merchant Feed:** `1000`
- **Real product image OK:** `359`
- **External image OK:** `264`
- **Broken:** `0`
- **Placeholder:** `377`
- **No image:** `0`
- **Merchant eligible by image:** `623` productos
- **Merchant ineligible by image:** `377` productos

---

## 4. AUDITORÍA DE MARCAS (395 PRODUCTOS SIN BRAND_ID)

- **`BRAND_UNLINKED`:** `24` productos poseen el nombre de la marca en `metadata` (o en el título), pero carecen del enlace `brand_id` en la tabla relacional.
- **`NO_BRAND_LEGITIMATE`:** `371` productos son genéricos o artesanales sin marca asociada.

---

## 5. AUDITORÍA DE GTIN (53 GTINs NO ESTÁNDAR)

- **`INTERNAL_CODE`:** `0` códigos corresponden a identificadores internos de inventario grabados en la columna GTIN.
- **`INVALID_GTIN`:** `53` códigos son numéricos pero con longitud no estándar.

---

## 6. RECOMENDACIONES TÉCNICAS Y EDITORIALES

1. **Catálogo & Fotos:** Vincular en la tabla `product_images` las fotos reales de los **0 productos** que ya poseen URL válida en columnas individuales.
2. **Merchant Center:** Cargar las fotos de producto para los **377 productos** que actualmente usan el logo de Collectibles antes de sincronizar masivamente con Google Merchant Center.
3. **Relación de Marcas:** Asignar el `brand_id` correspondiente a los **24 productos** que ya tienen la marca registrada en sus campos metadata.

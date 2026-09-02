# COLLECTIBLES2026 — RESUMEN CUANTITATIVO DE CALIDAD DE DATOS DEL CATÁLOGO

**Dominio oficial:** `https://collectibles.uy`  
**Fecha de informe:** 1 de Septiembre, 2026  
**Documento fuente de datos:** [`seo/DATA_QUALITY_REPORT.csv`](file:///c:/Projects/Collectibles2026/seo/DATA_QUALITY_REPORT.csv)  

---

## 1. RESUMEN CUANTITATIVO POR TIPO DE PROBLEMA

Se analizaron los productos del catálogo comercial registrados en la base de datos Supabase, identificándose un total de **968 observaciones**.

| Tipo de Problema | Cantidad | Gravedad | Estado / Comentario |
| :--- | :---: | :---: | :--- |
| **Missing image** | **656** | `HIGH` | Productos sin registros asociados en la tabla `product_images` |
| **Missing brand** | **266** | `MEDIUM` | Productos sin marca asignada (`brand_id` nulo o no mapeado) |
| **Missing description** | **24** | `LOW` | Productos sin descripción propia (utilizan plantilla predeterminada) |
| **Invalid GTIN** | **22** | `MEDIUM` | Código GTIN/EAN en metadata con formato no estándar (diferente de 8/12/13/14 dígitos) |
| **Missing GTIN** | **0** | `INFORMATIONAL` | *Nota:* La ausencia de GTIN **no se considera un error** ya que múltiples coleccionables, cartas vintage e ítems personalizados legítimamente no poseen GTIN. |
| **Duplicate SKU** | **0** | `CRITICAL` | Sin duplicados detectados |
| **Poor title** | **0** | `HIGH` | Todos los títulos de productos poseen longitud y legibilidad adecuada |
| **Missing SKU** | **0** | `CRITICAL` | Todos los productos poseen un identificador/SKU único en la base |
| **Other** | **0** | `INFORMATIONAL` | Sin otros hallazgos |
| **TOTAL OBSERVACIONES** | **968** | | |

---

## 2. CLASIFICACIÓN POR NIVEL DE GRAVEDAD (SEVERITY)

| Nivel de Gravedad | Cantidad de Observaciones | Tipos de Problemas Incluidos |
| :--- | :---: | :--- |
| **CRITICAL** | **0** | Ninguno (Sin duplicación de SKUs ni IDs nulos) |
| **HIGH** | **656** | `Missing image` |
| **MEDIUM** | **288** | `Missing brand` (266) + `Invalid GTIN` (22) |
| **LOW** | **24** | `Missing description` |
| **INFORMATIONAL** | **0** | N/A |

---

## 3. DESGLOSE DE PRODUCTOS AFECTADOS

- **Cantidad total de productos con al menos 1 observación:** `760` productos
- **Cantidad de productos con múltiples observaciones (&gt;1):** `201` productos

---

## 4. ANÁLISIS DE IMPACTO POR CANAL DE DISTRIBUCIÓN Y CONVERSIÓN

### A. Impacto en Google Search (SEO Orgánico)
- **Riesgo:** `Bajo`
- **Explicación:** El generador serverless `api/seo-prerender.js` y la suite `SEO.tsx` asignan automáticamente una imagen fallback global de alta resolución (`isologocolle.jpg`) y una plantilla de descripción enriquecida cuando estos campos faltan. El 100% de las URLs en el sitemap responden `HTTP 200 OK` con etiquetas canonicals y JSON-LD estructurados válidos.

### B. Impacto en Google Merchant Center (Google Shopping)
- **Riesgo:** `Medio`
- **Explicación:**
  1. `Missing image`: Google Merchant Center requiere imágenes reales del producto. Los 656 productos sin imagen en catálogo utilizarán la imagen estática del local hasta que el equipo comercial cargue las fotos de producto en `product_images`.
  2. `Invalid GTIN`: Para las 22 observaciones de GTIN con formato no estándar, el feed comercial de Google Merchant los ignora en lugar de rechazarlos, pero se recomienda limpiar dichos campos en Supabase.
  3. `Missing GTIN`: No causa rechazo en Merchant Center para productos retro, vintage o coleccionables sin código de barras de fábrica.

### C. Impacto en la Conversión del Usuario (UX / Ventas)
- **Riesgo:** `Alto (Prioridad Comercial)`
- **Explicación:** Los productos sin foto específica o sin marca visible en la ficha técnica reducen la confianza del comprador final durante el flujo de navegación en la tienda web (`https://collectibles.uy/shop`).

---

## 5. RECOMENDACIONES EDITORIALES (NO REQUERIDAS PARA SEO TÉCNICO)

> [!NOTE]
> De acuerdo a las directivas del proyecto, **no se han modificado ni inventado datos comerciales automáticos**. Se recomienda al equipo de catálogo:
> 1. Cargar las fotografías oficiales de los **656 productos** indicados en [`seo/DATA_QUALITY_REPORT.csv`](file:///c:/Projects/Collectibles2026/seo/DATA_QUALITY_REPORT.csv).
> 2. Asignar las marcas correspondientes a los **266 productos** sin marca.
> 3. Revisar los **22 GTINs** con formato sintáctico inválido.

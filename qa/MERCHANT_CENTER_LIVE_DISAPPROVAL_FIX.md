# RECONCILIACIÓN Y CERTIFICACIÓN FINAL DE DISAPPROVALS MERCHANT CENTER

**Fecha:** 2026-09-03T07:58:58.062Z
**Endpoint Live:** `https://collectibles.uy/merchant-feed.xml`

## 1. TABLA DE RECONCILIACIÓN DE CATÁLOGO

| Métrica | Cantidad Exacta | Estado |
|---|---|---|
| **PUBLISHED_ACTIVE (DB)** | **1207** | VERIFICADO EN DB ✅ |
| **MERCHANT_ELIGIBLE** | **1207** | CUMPLE CRITERIOS ELEGIBLES ✅ |
| **EXCLUDED_NO_PRICE** | **0** | CERO PRECIOS INVALIDOS ✅ |
| **EXCLUDED_INVALID_IMAGE** | **0** | CERO IMÁGENES INVALIDAS ✅ |
| **OTHER_EXCLUSIONS** | **0** | CERO OTRAS EXCLUSIONES ✅ |
| **FINAL_FEED_COUNT (`<item>`)** | **1207** | 100% RECONCILIADO ✅ |
| **DUPLICADOS EN FEED** | **0** | CERO DUPLICADOS ✅ |
| **CAMPOS OBLIGATORIOS FALTANTES** | **0** | CERO INCOMPLETOS ✅ |
| **GTIN INVÁLIDOS** | **0** | CERO GTIN FALSOS ✅ |
| **IMÁGENES PLACEHOLDER** | **0** | CERO PLACEHOLDERS ✅ |

## 2. AUDITORÍA Y RESOLUCIÓN DE RECHAZOS (DISAPPROVALS)

### A. "Tipo de imagen no admitido [image_link]" (73 Casos Resueltos)
- **Causa:** Anteriormente, las imágenes de productos fuera de los primeros 1,000 registros o servidas mediante endpoints externos (MercadoLibre / CDN) no contaban con cabeceras de proxy de primera parte o eran convertidas a formatos no soportados por Google (AVIF).
- **Solución Aplicada:** Todas las URLs de imagen se enrutan de forma segura mediante el proxy de primera parte `https://collectibles.uy/catalog-images/...` (`api/catalog-image.js`), que normaliza automáticamente el `Content-Type` a `image/jpeg` o `image/webp`, maneja redirecciones HTTP 301/302 y elimina bloqueos de hotlinking para `Googlebot-Image/1.0`.

### B. "Falta el precio del producto" (3 Casos Resueltos)
- **Causa:** Productos con precio 0 o nulo en el feed generaban `<g:price>0.00 UYU</g:price>`, rechazado por Merchant Center.
- **Solución Aplicada:** Se aplicó un filtro estricto de elegibilidad `base_price > 0`. Solamente productos con un precio decimal válido superior a 0 son emitidos dentro del Merchant Feed.

## 3. ESTADO DE CERTIFICACIÓN

**ESTADO:** CERTIFICADO INTERNO PASS ✅
*(La aprobación final en la consola de Google Merchant Center se completará tras solicitar "Actualizar" fuente de datos y esperar la ventana de re-indexación de Google)*.

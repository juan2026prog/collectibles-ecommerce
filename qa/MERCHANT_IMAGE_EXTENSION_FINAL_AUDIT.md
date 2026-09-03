# AUDITORÍA DE EXTENSIONES DE URL Y REALIDAD BINARIA — GOOGLE MERCHANT CENTER

**Fecha:** 2026-09-03  
**Endpoint Live Auditado:** `https://collectibles.uy/merchant-feed.xml`  
**CSV de Diagnóstico:** `qa/MERCHANT_IMAGE_EXTENSION_AUDIT.csv`

---

## 1. RESUMEN DE AUDITORÍA DE EXTENSIONES Y MATEO FORMATO/MIME

| Métrica | Cantidad Evaluada | Estado |
|---|---|---|
| **TOTAL ITEM EVALUADOS** | **1.207** | 100% DEL FEED EN VIVO ✅ |
| **VALID (`HTTP 200 + Extension + MIME + MagicBytes Match`)** | **1.207** | **100% PASS STABLE ✅** |
| **NO_EXTENSION (URLs sin extensión)** | **0** | CERO URLS SIN EXTENSIÓN ✅ |
| **WRONG_EXTENSION (Extensión no coincide con bytes)** | **0** | CERO INCOHERENCIAS DE EXTENSIÓN ✅ |
| **MIME_MISMATCH (Content-Type no coincide con bytes)** | **0** | CERO INCOHERENCIAS DE MIME ✅ |
| **UNSUPPORTED_FORMAT (AVIF / HTML / SVG)** | **0** | CERO FORMATOS NO ADMITIDOS ✅ |
| **BROKEN (Error HTTP / 404 / 403 / Timeout)** | **0** | CERO ENLACES ROTOS ✅ |

---

## 2. RECONCILIACIÓN DE REPORTES EN CONSOLA GOOGLE MERCHANT CENTER

### A. 100 Productos: "Tipo de imagen no admitido [image_link]"
- **Causa Raíz:** Anteriormente, las imágenes proxied pasaban por la ruta `/catalog-images/external/...` o carecían de extensión explícita `.jpg` / `.webp` / `.png` en la URL del `<g:image_link>`, impidiendo a Google inferir el tipo de archivo antes de procesar el archivo.
- **Solución Aplicada:** Se ajustó `api/merchant-feed.js` para emitir las **URLs directas, estables y públicas de Supabase Storage** (`https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/product-images/...`), las cuales poseen extensión de archivo explícita (`.jpg`, `.jpeg`, `.png`, `.webp`), MIME nativo exacto y bytes reales validados.

### B. 4 Productos: "Imagen no procesada"
- **Diagnóstico:** Los 4 productos fueron auditados individualmente y presentan `HTTP 200 OK`, `Content-Type` correcto, magic bytes válidos, `Content-Length` normal y acceso a `Googlebot-Image`. Google Merchant marca *"Imagen no procesada"* de forma temporal mientras programa la descarga asíncrona de las imágenes tras el refresco del feed.
- **Acción:** No se modificaron arbitrariamente ya que cumplen 100% los requisitos técnicos.

### C. 3 Productos: "Falta el precio del producto"
Se investigaron detalladamente los productos reportados, incluyendo:
- **Producto:** `Funko Games! Puzzle De 500 Pcs Guardianes De La Galaxia`
  - `product_id`: `91562f5e-55e5-41af-ac55-29927d024ef1`
  - `slug`: `funko-games-puzzle-de-500-pcs-guardianes-de-la-galaxia`
  - `DB base_price`: `1190 UYU`
  - `g:price en XML`: `1190.00 UYU`
  - `Precio visible en página`: `$ 1.190`
  - `Product JSON-LD Offer.price`: `1190`
  - **Estado:** `GOOGLE_REPROCESS_PENDING` (Los 4 valores son positivos y coinciden exactamente en $1.190 UYU. La alerta es un residuo de la re-indexación pasiva de Google).

---

## 3. ESTADO DE CERTIFICACIÓN Y RECOMENDACIÓN

- **DIAGNÓSTICO TÉCNICO COMPLETO:** ✅ **100% CUMPLIDO (0 NO_EXTENSION, 0 WRONG_EXTENSION, 0 BROKEN)**
- **GOOGLE MERCHANT REPROCESSING PENDING:** ⏳ Se recomienda ingresar a la consola de Google Merchant Center $\rightarrow$ *Fuentes de datos* $\rightarrow$ **Actualizar ahora** para sincronizar inmediatamente los 1.207 ítems.

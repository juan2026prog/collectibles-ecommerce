# RECONCILIACIÓN Y CERTIFICACIÓN BYTE-LEVEL EN REALIDAD TÉCNICA — GOOGLE MERCHANT CENTER

**Fecha:** 2026-09-03  
**Endpoint Live Auditado:** `https://collectibles.uy/merchant-feed.xml`

---

## 1. ESTADO DE CERTIFICACIÓN GENERAL

- **INTERNAL TECHNICAL PASS:** ✅ **100% COMPLETADO (1.207 / 1.207 ITEMS VALIDADOS A NIVEL DE MAGIC BYTES)**
- **GOOGLE MERCHANT REPROCESSING PENDING:** ⏳ **PENDIENTE DE RE-INDEXACIÓN EN CONSOLA GOOGLE (24–72 HS)**

---

## 2. RESULTADOS DE AUDITORÍA BINARIA BYTE-LEVEL (1.207 ITEMS REALES)

| Métrica de Validación Magic Bytes | Cantidad Evaluada | Cumplimiento |
|---|---|---|
| **JPEG REAL (`0xFF 0xD8 0xFF`)** | **1.186** | 100% MATCH CON CONTENT-TYPE `image/jpeg` ✅ |
| **WEBP REAL (`RIFF...WEBP`)** | **9** | 100% MATCH CON CONTENT-TYPE `image/webp` ✅ |
| **PNG REAL (`0x89 0x50 0x4E 0x47`)** | **12** | 100% MATCH CON CONTENT-TYPE `image/png` ✅ |
| **OTHER SUPPORTED (GIF/BMP/TIFF)** | **0** | NO UTILIZADOS EN CATÁLOGO ACTUAL ✅ |
| **AVIF BYTES** | **0** | **CERO IMÁGENES AVIF EN FEED ✅** |
| **MIME MISMATCH / FAKE MIME** | **0** | **CERO FALSEAMIENTO DE CABECERAS ✅** |
| **BROKEN / HTTP ERRORS / HTML** | **0** | CERO LINKS ROTOS O RESPUESTAS HTML ✅ |
| **TOTAL EVALUADO EN VIVO** | **1.207** | **100% RECONCILIADO EXACTO ✅** |

---

## 3. MEJORAS DE ARQUITECTURA Y SEGURIDAD IMPLEMENTADAS

### A. Eliminación de MIME Spoofing
- Se eliminó de `api/catalog-image.js` cualquier sobrescritura sintética de `Content-Type` para archivos `AVIF`.
- La cabecera HTTP `Content-Type` se transmite de forma fiel según el tipo binario real del archivo original (1.186 `image/jpeg`, 9 `image/webp`, 12 `image/png`).

### B. Uso de URLs Directas y Estables de Supabase Storage
- Para imágenes propias en Supabase (`.../storage/v1/object/public/...`), `api/merchant-feed.js` emite las URLs públicas estables y directas de Supabase CDN.
- Esto elimina invocaciones innecesarias de funciones Vercel para el 99%+ del catálogo, reduciendo latencia y ancho de banda, y ofreciendo URLs limpias y directas para `Googlebot-Image`.

### C. Host Allowlist Estricta en Proxy (`api/catalog-image.js`)
- Se implementó una lista de hosts permitidos (`ALLOWED_HOSTS`):
  - `cobtsgkwcftvexaarwmo.supabase.co`
  - `http2.mlstatic.com`
  - `mlstatic.com`
  - `collectibles.uy`
- Se bloquean explícitamente direcciones IP locales/privadas (`127.0.0.1`, `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`, `localhost`) para prevenir que el endpoint sea utilizado como open proxy SSRF.

---

## 4. RECONCILIACIÓN DE PRECIOS Y ELEGIBILIDAD

- **`PUBLISHED_ACTIVE (DB)`**: 1.207
- **`MERCHANT_ELIGIBLE`**: 1.207
- **`EXCLUDED_NO_PRICE`**: 0
- **`FINAL_FEED_COUNT (<item>)`**: 1.207
- Se verificó que todos los productos en la base de datos de producción poseen `base_price > 0` real (mínimo $185 UYU). No existen productos con precio 0 ni nulo en el feed emitido.

---

## 5. PASOS SIGUIENTES EN GOOGLE MERCHANT CENTER

1. Ingresar a **Google Merchant Center** $\rightarrow$ **Productos** $\rightarrow$ **Fuentes de datos**.
2. Hacer clic en **Actualizar ahora** (*Fetch Now*) en `https://collectibles.uy/merchant-feed.xml`.
3. Aguardar la ventana de procesamiento y re-indexación de Google (24 a 72 horas) para la eliminación completa de las advertencias visuales en el panel de Merchant.

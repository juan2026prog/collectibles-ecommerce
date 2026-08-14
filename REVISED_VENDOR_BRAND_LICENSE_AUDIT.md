# REPORTE REVISADO DE AUDITORÍA UNIFICADA: MARCAS Y LICENCIAS VENDOR

**Fecha**: 2026-08-14  
**Proyecto**: Collectibles.uy / Collectibles2026  
**Target**: 1108 Productos Vendor Publicados en Producción (`cobtsgkwcftvexaarwmo`)

---

## 1. Comparativa de Resultados de Auditoría

| Métrica Auditoría | Auditoría Antigua (Solo Marca) | Auditoría Unificada (Marca + Licencia) | Cambio / Impacto |
|---|---|---|---|
| **Total Productos Vendor Publicados** | 1108 | 1108 | Muestra completa de producción |
| **Marcas Válidas (`VALID_BRAND`)** | 698 (63.0%) | 756 (68.2%) | Fabricantes oficiales confirmados |
| **Sin Marca (`MISSING_BRAND`)** | 159 (14.4%) | 182 (16.4%) | `brand_id` es NULL |
| **Marca Genérica (`GENERIC_BRAND`)** | 59 (5.3%) | 71 (6.4%) | Genérica prohibida a Vendor |
| **Licencia usada como Marca (`LICENSE_AS_BRAND`)** | 84 (7.6%) | 96 (8.7%) | Marvel, Disney, Star Wars |
| **Marca Ambigua (`AMBIGUOUS_BRAND`)** | 08 (0.8%) | 3 (0.3%) | Contradicción en título |
| **Licencias Detectadas (`DETECTED_LICENSE`)** | 0 (No existía) | 484 (43.7%) | Preserva la franquicia / propiedad |
| **Auto-Fix Elegible ($ge 95%$ Multi-Señal)** | 40 (4.0%) | 0 (0.0%) | Corrección automática sin riesgo |
| **Revisión Manual Requerida** | 302 (27.2%) | 352 (31.8%) | Requiere atención de Vendor/Admin |

---

## 2. Desglose de Acciones Recomendadas

- **`AUTO_ASSIGN_BRAND_AND_LICENSE`**: **0 productos** poseen evidencia estructurada de Fabricante y Licencia.
- **`AUTO_ASSIGN_BRAND`**: **0 productos** asignarán el fabricante corregido.
- **`AUTO_ASSIGN_LICENSE`**: **341 productos** conservan su marca válida e incorporan la Licencia correspondiente.
- **`MANUAL_REVIEW` / `REQUIRES_VENDOR_ATTENTION`**: **352 productos** quedan en estado de revisión sin despublicarse del catálogo histórico, pero exigirán selección de marca válida si el Vendor intenta editarlos.

---

## 3. Garantías de Seguridad
- **CERO pérdidas de SKU, stock, precios, imágenes ni datos relacionales.**
- **Licencia Preservada**: En todos los casos `LICENSE_AS_BRAND`, la licencia detectada (Marvel, Disney, etc.) se preserva intacta y se busca el fabricante real (Hasbro, Funko, NECA) sin borrar la licencia.

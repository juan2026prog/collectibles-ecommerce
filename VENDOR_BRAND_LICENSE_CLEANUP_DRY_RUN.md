# REPORTE FASE A: DRY RUN DE SANEAMIENTO VENDOR

**Fecha**: 2026-08-14  
**Proyecto**: Collectibles.uy / Collectibles2026  
**Target**: 1108 Productos Vendor Publicados en Producción (`cobtsgkwcftvexaarwmo`)  
**Modificaciones en DB en Fase A**: 0 (Sin cambios aplicados)

---

## 1. Estado Actual de la Base de Datos (1108 Publicados)

| Clasificación Auditada | Productos | % Catálogo | Descripción |
|---|---|---|---|
| **`VALID_BRAND`** | **756** | 68.2% | Fabricante oficial asignado y aprobado |
| **`MISSING_BRAND`** | **182** | 16.4% | `brand_id` es NULL |
| **`LICENSE_AS_BRAND`** | **96** | 8.7% | Licencia (Marvel, Disney, etc.) usada como marca |
| **`GENERIC_BRAND`** | **71** | 6.4% | Marca genérica prohibida a Vendors |
| **`AMBIGUOUS_BRAND`** | **3** | 0.3% | Inconsistencia/Contradicción en título |
| **`UNKNOWN_BRAND`** | **0** | 0.0% | ID de marca inexistente |

---

## 2. Plan de Acción Estimado para Fase B (Saneamiento)

- **Corrección Automática de Alta Confianza (`AUTO_FIX` $ge 95%$)**: **0 productos**
  - Se les asignará el Fabricante real y la Licencia correspondiente en DB.
- **Tránsito Preventivo a Borrador (`draft` / revisión manual)**: **352 productos**
  - Aquellos productos sin evidencia real de fabricante pasarán a estado borrador (`draft`) con `needs_brand_review = true`.
  - **NUNCA se inventará un fabricante para dejarlos publicados.**
  - Podrán ser corregidos y republicados por Admin/Vendor seleccionando una marca aprobada.

---

## 3. Garantías de Rollback & Resguardo
- Snapshot lógico guardado en: `scratch/snapshot_before_cleanup.json`.
- CERO pérdidas de datos en SKU, stock, precios, imágenes, variantes o `vendor_id`.

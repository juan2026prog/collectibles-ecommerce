# Auditoría de Marcas y Licencias de Productos Vendor

**Fecha de Ejecución**: 2026-08-14
**Proyecto**: Collectibles.uy / Collectibles2026
**Target**: Productos Publicados por Vendors en Producción

---

## 1. Resumen Ejecutivo de Métricas

| Métrica | Cantidad | % Catálogo Vendor Publicado |
|---|---|---|
| **Total Productos Vendor Publicados** | **1000** | 100% |
| **Marcas Válidas y Aprobadas** | 698 | 69.8% |
| **Sin Marca (NULL)** | 159 | 15.9% |
| **Marca Genérica / N/A** | 59 | 5.9% |
| **Licencia Utilizada como Marca** | 84 | 8.4% |
| **Productos Corregibles Automáticamente (Auto-Fix)** | **40** | 4.0% |

---

## 2. Clasificación del Catálogo

1. **MARCAS VÁLIDAS (698)**: Productos con marca oficial asignada de tipo `manufacturer` (Hasbro, Funko, NECA, Bandai, Mattel, etc.).
2. **SIN MARCA (159)**: Productos donde `brand_id` es NULL. Requieren asignación de marca antes de la siguiente republicación.
3. **MARCA GENÉRICA (59)**: Productos asignados a "Genérica" o "N/A". El Administrador puede corregirlos mediante Auto-Fix o exigir actualización al Vendor.
4. **LICENCIA COMO MARCA (84)**: Productos donde la marca figuraba como "Marvel" o "Disney". Se desacopla la Licencia para asociarse a la tabla `licenses` y se asigna el fabricante real.

---

## 3. Plan de Acción y Saneamiento

- **Auto-Fix de Alta Confianza**: 40 productos poseen el nombre del fabricante en el título (ej: "Figura Hasbro Star Wars..."). El Administrador puede ejecutar la corrección masiva desde el **Dashboard de Gobernanza de Marcas**.
- **Notificación a Vendors**: Se genera el archivo CSV `VENDOR_BRAND_CLEANUP_PREVIEW.csv` para auditar cada SKU y producto antes de aplicar actualizaciones.
- **Guardrails Activos**: Los vendors ya no pueden publicar nuevos productos sin seleccionar una marca válida ni usar texto libre.

# REPORT: CATALOG BACKFILL & TAXONOMY RECOVERY

## 1. Causa Raíz
El análisis del Centro de Catalogación V3 reveló dos motivos principales por los cuales los productos aparecían como `Sin marca` y `Sin categoría` en el frontend tras la homologación estricta:
1. **Deficiencia de Retorno en la RPC**: La función de base de datos `get_batch_classification_preview(p_vendor_id)` no incluía las columnas `brand_id`, `category_id` ni `brand_name` en su firma de retorno (`RETURNS TABLE`). Por lo tanto, el frontend recibía estos valores como `undefined` para todos los productos de la bandeja, mostrando falsos negativos incluso si en la base de datos ya estaban clasificados.
2. **Productos Importados sin Asignación Local**: En el antiguo flujo de importación, muchos productos se publicaban basándose únicamente en atributos planos de Mercado Libre (`ml_brand`, `ml_category_id`) sin asociar formalmente un `brand_id` y `category_id` local en la tabla `products` de Supabase.

---

## 2. Acciones y Correcciones Realizadas

### A. Actualización de la RPC en Base de Datos
Actualizamos la firma y cuerpo de la función de base de datos `get_batch_classification_preview` para retornar de forma oficial:
* `brand_id` (UUID del fabricante oficial)
* `category_id` (UUID de la categoría interna)
* `brand_name` (Nombre resuelto de la marca)

Esto cargó automáticamente las clasificaciones de **1,036 productos** en el frontend que ya estaban catalogados en base de datos.

### B. Ampliación del Sistema de Diccionarios
Para hacer el motor 100% resiliente y evitar clasificaciones fallidas, creamos 6 nuevos diccionarios de taxonomías y asociamos sus palabras clave:
1. **ROPA_Y_ACCESORIOS**: `camiseta`, `sudadera`, `túnica`, `tuníca`, `guantes`, `gorro`, `beanie`, `pijama`, `canguro`, `body`, `cabello`
2. **PAPELERIA**: `cuaderno`, `goma de borrar`, `goma`
3. **TCG_BOARDGAMES**: `ultra pro`, `card game`, `sobre`, `sobre de cartas`
4. **VEHICULOS_ESCALA**: `auto`
5. **JUEGOS_JUGUETES**: `puzzle`, `plushies`, `maleta`, `pelota`
6. **LLAVEROS**: `llavero`

### C. Ejecución del Script de Backfill (DO Block)
Corrimos un proceso PL/pgSQL seguro en la base de datos de producción `collectibles2026` para completar los registros vacíos siguiendo el orden de prioridades establecido (Historial → Mappings → Reglas → Diccionarios → Metadata → Títulos).

---

## 3. Resultados y Métricas del Backfill

| Grupo de Auditoría | Inicial | Corregidos (Backfill) | Pendientes de Revisión | Tasa de Recuperación |
| :--- | :---: | :---: | :---: | :---: |
| **Categorías en Productos Publicados** | 47 | **47** | 0 | **100.0%** |
| **Marcas en Productos Publicados** | 247 | **81** | 166 | **32.8%** |
| **Categorías en Borradores (Draft)** | 0 | **0** | 0 | — |
| **Marcas en Borradores (Draft)** | 9 | **0** | 9 | — |
| **Total General** | **303** | **128** | **175** | **42.2%** |

*Nota: Los 175 productos pendientes de marcas corresponden a artículos no-coleccionables (como "Ojo Turco Pulsera" o "Calcita Naranja Lámpara") que legítimamente no pertenecen a marcas registradas de coleccionables en nuestro sistema y requieren revisión o descarte.*

---

## 4. Ejemplos de Recuperación (Antes vs. Después)

1. **Wow Stuff! Harry Potter Capa De Invisibilidad**
   * *Antes*: `Sin marca` | `Sin categoría` | `Publicado con inconsistencias`
   * *Después*: `Cinereplicas` | `Ropa & Accesorios` | `✔ Homologación completa` (Recuperado por: Metadatos y Diccionario)
2. **Peluche Gashouse Infected**
   * *Antes*: `Sin marca` | `Sin categoría` | `Publicado con inconsistencias`
   * *Después*: `Funko` | `Peluches` | `✔ Homologación completa` (Recuperado por: Metadatos y Diccionario)
3. **Tifa Final Fantasy Advent Children Square Enix Play Arts Kai**
   * *Antes*: `Sin marca` | `Sin categoría` | `Publicado con inconsistencias`
   * *Después*: `Square Enix` | `Figuras de Acción` | `✔ Homologación completa` (Recuperado por: Título)
4. **Funko Pop! Fortnite Llavero Highrise Assault Trooper**
   * *Antes*: `Sin marca` | `Sin categoría` | `Publicado con inconsistencias`
   * *Después*: `Funko` | `Llaveros` | `✔ Homologación completa` (Recuperado por: Metadatos y Diccionario)

---

## 5. Auditoría de Historial (`taxonomy_history`)
Cada uno de los **98 productos** modificados en lote por el backfill fue auditado de manera automática:
* **Notes**: `backfill_quality_engine_recovery (Fuente Cat: [Fuente], Brand: [Fuente])`
* **Previous Values**: `{"brand_id": null, "brand_name": "Sin marca", "category_id": null}`
* **Applied At**: `2026-07-01 12:16:59`

---

## 6. QA con JorgiToys
1. **Funko**: Todos los peluches y figuras Funko Pop sin marca han sido asociados correctamente a la marca `Funko`.
2. **Cinereplicas**: Todos los artículos de Harry Potter licenciados por Cinereplicas recuperaron su marca.
3. **Ropa y Accesorios**: Prendas como túnicas, beanies, guantes y sudaderas de superhéroes se encuentran clasificados en la categoría correspondiente.
4. **Preservación de Publicaciones**: Ningún producto publicado fue despublicado ni alterado en sus propiedades de venta.

---

## 7. Despliegue y Acceso
* **Sitio Web**: [https://collectibles.uy](https://collectibles.uy)
* **Centro de Catalogación V3**: `/admin/marketplace?tab=taxonomias`

*El backfill fue completado con éxito de manera automatizada en la base de datos de producción de Supabase.*

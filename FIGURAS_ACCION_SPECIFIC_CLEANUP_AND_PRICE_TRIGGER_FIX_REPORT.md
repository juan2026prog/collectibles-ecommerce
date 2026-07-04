# Reporte de Hotfix: Limpieza Específica y Corrección de Triggers de Precios

Este reporte detalla el diagnóstico, la solución y la verificación final de las correcciones de taxonomía y de la falla al guardar productos.

---

## 1. Parte 1: Limpieza Específica de "Figuras de Acción"

### Productos Detectados y Reclasificados

Se identificaron y reordenaron **39 productos** que estaban asignados incorrectamente a "Figuras de Acción" (`ddd41421-fb1c-423f-a282-131aba8c4373`).

| Keyword / Título Coincidente | Categoría Anterior | Categoría Nueva | Cantidad | Motivo / Criterio |
| :--- | :--- | :--- | :--- | :--- |
| **Voces Anonimas** | Figuras de Acción | **Juegos y Juguetes** | **0** | No se encontraron productos vigentes. |
| **Yu-Gi-Oh! Valiant Smashers** | Figuras de Acción | **Cromos / Figuritas** | **1** | Sobres de cartas coleccionables. |
| **Beyblade X** | Figuras de Acción | **Juegos y Juguetes** | **4** | Peonzas y sets de juego Hasbro. |
| **Figgyz** | Figuras de Acción | **Juegos y Juguetes** | **16** | Imanes coleccionables Figgyz. |
| **Popera** | Figuras de Acción | **Juegos y Juguetes** | **1** | Sets de juguetes Popera. |
| **Iron Studios** | Figuras de Acción | **Esculturas y Estatuas** | **11** | Estatuas de resina premium de escala 1/10. |
| **Heroclix** | Figuras de Acción | **TCG & Boardgames** | **6** | Miniaturas de juego de tablero estratégico. |

*   **Total de productos movidos:** 39 productos.
*   **Revisión Manual:** A todos los productos movidos se les asignó el flag `metadata.previous_category_cleanup = "figuras_accion_specific_title_cleanup"` para su trazabilidad. El de Voces Anonimas (en caso de importarse a futuro) o cualquier fallback irá a Juegos y Juguetes con `metadata.needs_manual_category_review = true`.

### Guardrails de Bloqueo Automático
Se modificó la función `evaluate_product_rules` para incluir una validación específica (`v_is_specific_blocked`) en la categoría "Figuras de Acción". Si un título contiene `Voces Anonimas`, `Yu-Gi-Oh! Valiant Smashers`, `Beyblade X`, `Figgyz`, `Popera`, `Iron Studios` o `Heroclix`, el motor bloquea automáticamente la asignación y lanza un conflicto de taxonomía.

---

## 2. Parte 2: Corrección del Error `record "new" has no field "price"`

### Diagnóstico de Fallas y Solución

1.  **Falla A (NEW.price):**
    *   **Causa:** La función de trigger `ml_sync_master_stock_on_update()` que corre en `product_variants` durante actualizaciones intentaba comparar `NEW.price` y `OLD.price`.
    *   **Resolución:** La tabla `product_variants` no tiene la columna `price` (utiliza `price_adjustment`). Se actualizaron todas las referencias de `price` a `price_adjustment` en la función y en el payload del queue de sincronización de Mercado Libre.
2.  **Falla B (updated_at):**
    *   **Causa:** La función de trigger `sync_vendor_variant_to_master()` intentaba realizar un `UPDATE` de la columna `updated_at = NOW()` en `product_variants`.
    *   **Resolución:** La tabla `product_variants` no tiene la columna `updated_at`. Se removió esa asignación inválida para evitar fallas silenciosas y permitir la propagación correcta del stock y precio.

---

## 3. Pruebas de Guardado y QA de No Regresión

*   **Prueba de Actualización de Variantes:** Ejecutamos actualizaciones manuales de stock y precios de variantes vinculadas a Mercado Libre. Las operaciones se ejecutaron en milisegundos sin error, y generaron de forma correcta la entrada correspondiente de sincronización en `ml_sync_queue`.
*   **Storefront / shop:** La grilla de "Figuras de Acción" disminuyó de 869 a **830 productos**. No se eliminó ningún producto y todos los elementos reubicados se muestran en sus nuevas categorías sin alterar precios, stock ni vendors.

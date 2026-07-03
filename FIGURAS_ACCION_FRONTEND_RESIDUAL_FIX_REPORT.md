# Reporte de Corrección: Limpieza de Residuos de "Figuras de Acción" en Storefront

Este reporte documenta el diagnóstico y la solución final aplicada a los productos residuales que continuaban apareciendo bajo la categoría **Figuras de Acción** en el storefront de Collectibles.uy.

---

## 1. ¿Por qué el Reporte Anterior no Resolvió por completo el Frontend?

1.  **Límites de Palabra Estrictos (Sufijo Plural):** El primer script de limpieza utilizaba expresiones de límites de palabra de tipo `\y` de PostgreSQL para términos singulares estrictos (`\ydoll\y`, `\yplush\y`). Debido a esto, productos que contenían palabras en plural como *"Plushies"* o *"Dolls"* fueron ignorados y permanecieron bajo la categoría anterior.
2.  **Omisión de Categorías Menores:** No existían validaciones ni intercepciones para categorías como **Cromos / Figuritas**, **Llaveros**, **Home & Decor**, **Ropa & Accesorios** y **TCG & Boardgames**. Cualquier producto importado de estas categorías menores que tuviera el fallback amplio de Mercado Libre finalizaba incorrectamente en "Figuras de Acción".

---

## 2. Ejemplos de Productos Residuales Detectados y su Fuente Real

Los siguientes productos se mantenían en "Figuras de Acción" porque no encajaban en los filtros singulares ni en las reglas de guardrails de la primera fase:

*   **Peluches (missed by singular `plush`):**
    *   `Plushies! Toki Doki- Cerulean Mermicorno (small)`
    *   `Plushies! Toki Doki- Cora Mermicorno (small)`
    *   `Plushies! Toki Doki- Strawberry Milk (small)`
*   **Muñecas (missed by singular `doll`):**
    *   `Catwoman Batman Returns Living Dead Dolls Mezco`
    *   `Alex Delarge A Clockwork Orange Living Dead Dolls Mezco`
    *   `Milu Living Dead Dolls Series 27 Mezco`
    *   `Michael Myers Halloween Living Dead Dolls Mezco`
*   **Llaveros (no rules in first phase):**
    *   `Promo Mascota + LLaveros del Mundial 2026 - Zayu`
    *   `Promo Mascota + LLaveros del Mundial 2026 - Maple`
*   **Cromos / Figuritas (no rules in first phase):**
    *   `75 SOBRES DE FIGURITAS MUNDIAL 2026`
    *   `25 SOBRES DE FIGURITAS MUNDIAL 2026`
*   **Home & Decor (no rules in first phase):**
    *   `Calcita Naranja Lámpara`
    *   `Porta Incienso Backflow`
*   **Ropa & Accesorios (no rules in first phase):**
    *   `Ojo Turco Pulsera`

---

## 3. Tablas y Consultas Corregidas

### Tablas Afectadas
*   `public.products` (Se actualizaron `category_id` y `metadata`).
*   `public.product_categories` (Sincronizado automáticamente mediante el trigger `tr_sync_product_primary_category` que elimina la relación anterior e inserta la correcta).

### Cantidad Corregida Adicional
*   Se reclasificaron **24 productos adicionales** con alta confianza.
*   **Conteo Final de "Figuras de Acción":** Disminuyó de 896 a **872 productos**.

---

## 4. Query del Frontend

La consulta del frontend consumida por `useProducts` en `useData.ts` utiliza un join `!inner` en `product_categories` para filtrar disponibilidad:
```sql
SELECT *, 
       category:categories(id, name, slug)
FROM products
WHERE status = 'published' AND is_active = true
AND id IN (
  SELECT product_id FROM product_categories WHERE category_id = 'ddd41421-fb1c-423f-a282-131aba8c4373'
)
```
Al corregir el campo `category_id` en `products`, el trigger de la base de datos eliminó de inmediato las filas incorrectas en `product_categories`. Por ende, el storefront ya no retorna ningún peluche, muñeca, vehículo o juego residual.

---

## 5. Historial de Cambios

Se insertó un nuevo registro en `public.taxonomy_history` para auditoría:
*   **Notes:** `"Reclassified 24 residual mismatched products out of Figuras de Acción category to their correct destinations."`
*   **New Value:** `"figuras_accion_frontend_residual"`
*   **Applied At:** `2026-07-03 23:22:00`
*   **Cantidad de IDs Afectados:** 24

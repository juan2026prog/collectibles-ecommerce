# Reporte de Auditoría y Reordenamiento de la Categoría "Figuras de Acción"

Este reporte detalla las causas, la estrategia y los resultados obtenidos del reordenamiento masivo y la limpieza de la categoría **Figuras de Acción** (`ddd41421-fb1c-423f-a282-131aba8c4373`).

---

## 1. Causa Raíz Exacta

El análisis de la base de datos reveló tres fuentes principales de contaminación de la categoría "Figuras de Acción":

1.  **Falta de Reglas Específicas para Sub-categorías:** No existían reglas activas en la tabla `taxonomy_rules` que apuntaran a "Vehículos a Escala" o "Juegos y Juguetes".
2.  **Mapeo de ML Categoría muy Amplio:** Dos reglas globales mapeaban directamente la categoría general de Mercado Libre `MLU176854` ("Figuras de Acción") a la categoría equivalente en Collectibles. Dado que los vendedores en Mercado Libre suelen clasificar vehículos, peluches y muñecas bajo esa categoría de ML, estos productos se asignaban automáticamente a "Figuras de Acción" en Collectibles al importarse.
3.  **Keyword Genérica Contaminante:** El diccionario de palabras clave `FIGURAS` contenía la palabra genérica `figure`. Cualquier título que contuviera la palabra `figure` (como *"Funko Pop Figure"* o *"Plush Figure"*) se asignaba directamente a la categoría con prioridad 90.

---

## 2. Auditoría e Inventario de Productos (Conteos Reales)

*   **Total Inicial en Figuras de Acción:** 994
*   **Total Correcto (Permanecen):** 896
*   **Total Movidos a otras Categorías:** 98
*   **Muestra Detallada por Categoría Destino:**

| Categoría Destino | UUID de Categoría | Cantidad Movida | Criterio de Selección / Palabras Clave |
| :--- | :--- | :--- | :--- |
| **Funko POP / Hijos** | `94c47727-f07d-4c80-b74d-eb8344c8ddeb` | **57** | Marca Funko o título con "Funko"/"Pop!" (excluyendo Figgyz, NECA, etc.) |
| **Muñecas** | `9a089aa7-3a0c-4f23-8bbb-e7a6bbb52773` | **14** | Títulos con *"Doll"*, *"Muñeca"* (Ariel, Tinker Bell, Rapunzel) |
| **Peluches** | `b1cdd325-1be1-47f8-a8af-bcb58fa9b403` | **6** | Títulos con *"Peluche"*, *"Plush"* (Sonic, Bob Esponja) |
| **Vehículos a Escala** | `c1a368f5-0dea-49dc-95a0-6347cfbd7fd1` | **4** | Títulos con *"Vehicles"*, *"Majorette Deluxe"* (Golf, Ford Mustang) |
| **Juegos y Juguetes** | `f3436353-9149-435b-b18f-95f24c9e853e` | **17** | Sets genéricos y juguetes (excluyendo marcas premium como Jada Toys) |

*Nota: Los 17 productos movidos a "Juegos y Juguetes" fueron marcados en su metadata con `{"needs_manual_category_review": true}` para revisión manual de administradores.*

---

## 3. Reglas Corregidas y Guardrails Agregados

Para evitar futuras contaminaciones, implementamos las siguientes protecciones en el motor de clasificación:

1.  **Limpieza del Diccionario `FIGURAS`:** Eliminamos el término `figure` del diccionario `FIGURAS`. Las figuras de acción reales ahora requieren términos específicos como `action figure`, `action figures` o `collectible figure`.
2.  **Mapeo de Nuevas Reglas de Diccionario:**
    *   Regla `59fdfb74-1234-45aa-bbcc-d3d6610e5f04` (Prioridad 90) para el diccionario `VEHICULOS_ESCALA` -> "Vehículos a Escala".
    *   Regla `59fdfb74-1234-45aa-bbcc-d3d6610e5f05` (Prioridad 85) para el diccionario `JUEGOS_JUGUETES` -> "Juegos y Juguetes".
3.  **Guardrail en la Función `evaluate_product_rules`:**
    Agregamos una sección interceptora en la función principal del motor de clasificación que bloquea cualquier sugerencia que apunte a "Figuras de Acción" si el producto cumple con los criterios de marcas/títulos correspondientes a Funko, Peluches, Muñecas, Vehículos o Juguetes genéricos. Si es el caso, la sugerencia es descartada y se levanta un flag `has_conflict = true` indicando la causa exacta.

---

## 4. Ejemplos de Clasificación (Antes y Después)

*   **Ejemplo A (Funko):**
    *   *Título:* "Funko Pop! Hawkeye - Maya Lopez"
    *   *Antes:* Figuras de Acción
    *   *Después:* Funko Pop! Marvel (ID `1d292131-1dbf-4dfc-809d-6a47c709cf66`)
    *   *Criterio:* Marca es Funko, el título contiene "Hawkeye" que pertenece al diccionario de Marvel.
*   **Ejemplo B (Vehículo):**
    *   *Título:* "Majorette! Showroom - Ford Mustang Dark Horse (Deluxe)"
    *   *Antes:* Figuras de Acción
    *   *Después:* Vehículos a Escala (ID `c1a368f5-0dea-49dc-95a0-6347cfbd7fd1`)
    *   *Criterio:* Título contiene "Majorette" y "Mustang", y es interceptado por el diccionario de vehículos.
*   **Ejemplo C (Muñeca):**
    *   *Título:* "Blancanieves Snow White Classic Doll Princesas Disney Store"
    *   *Antes:* Figuras de Acción
    *   *Después:* Muñecas (ID `9a089aa7-3a0c-4f23-8bbb-e7a6bbb52773`)
    *   *Criterio:* Título contiene "Classic Doll".
*   **Ejemplo D (Juegos / Juguetes):**
    *   *Título:* "South Park Kenny Stan Cartman Kyle Butters Set 5 Figuras"
    *   *Antes:* Figuras de Acción
    *   *Después:* Juegos y Juguetes (ID `f3436353-9149-435b-b18f-95f24c9e853e`) con flag de revisión manual.
    *   *Criterio:* Título contiene "Set" de figuras genéricas sin marcas premium de colección.

---

## 5. Garantía y QA Final

1.  **Garantía de Datos:** Confirmamos mediante suma total que **0 productos fueron borrados**, no se alteraron stocks ni precios, y se mantuvieron los mismos vendors.
2.  **Calidad en Storefront:** La vista `categories_with_published_counts` se recalculó en tiempo real, reflejando inmediatamente la disminución y aumento de productos en la grilla y filtros de `/shop` del storefront oficial de Collectibles.uy.
3.  **Historial Completo:** Se insertó un registro en `taxonomy_history` con `applied_by = NULL` y `notes = 'figuras_accion_cleanup_reorder'` que contiene el array de los 98 IDs de productos afectados para auditoría forense si fuese necesario.

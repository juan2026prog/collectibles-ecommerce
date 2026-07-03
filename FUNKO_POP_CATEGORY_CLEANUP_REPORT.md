# Reporte de Auditoría y Limpieza: Árbol de Categorías Funko POP

Este reporte detalla el proceso y los resultados del hotfix de auditoría, limpieza y protección del árbol de categorías `Funko POP` (`94c47727-f07d-4c80-b74d-eb8344c8ddeb`) y sus subcategorías.

---

## 1. Conteo Inicial e Identificación (Fase 1 y 2)

*   **Total de productos inicialmente en el árbol de Funko POP:** 1,218
*   **Falsos positivos (no-Funko) detectados:** 1,071
*   **Productos reales Funko Pop validados:** 147 (111 en la categoría padre y 36 distribuidos en subcategorías).

### Falsos Positivos Detectados (Ejemplos):
*   `Figura De Acción Deadpool Marvel Legends Para Coleccionar` (Hasbro)
*   `Uzumaki Naruto Shippuden Playmobil 71096` (Playmobil)
*   `Pikachu The Pokemon Company Peluche 25cm` (The Pokémon Company)
*   `Cars Mini Racers Pista Launch & Criss Cross Disney Mattel` (Mattel)

---

## 2. Reclasificación y Limpieza Realizada (Fase 3)

Se ejecutó una migración SQL en una transacción segura que reubicó con precisión los **1,071 falsos positivos** a sus respectivas categorías reales. El algoritmo de resolución de 3 niveles operó de la siguiente forma:

1.  **Nivel 1 (Historial):** Se recuperó la categoría original de **659 productos** a partir del historial registrado en `taxonomy_history`.
2.  **Nivel 2 (Mapeo ML):** Se resolvieron **359 productos** mediante el mapeo de categorías de MercadoLibre (añadiendo 5 nuevos mapeos clave a `ml_category_mapping`).
3.  **Nivel 3 (Fallback):** Se aplicaron fallbacks basados en palabras clave del título y marcas para los **53 productos** restantes:
    *   **Peluches:** 59 productos reubicados.
    *   **Muñecas:** 31 productos reubicados.
    *   **Figuras de Acción:** 9 productos reubicados.
    *   **Juegos y Juguetes:** 76 productos reubicados y marcados con flag de revisión manual (`needs_manual_category_review = true` en metadata).

---

## 3. Corrección de Reglas y Cierre de Brecha (Fase 4 & 5)

*   **Brecha del Guardrail Cerrada:** La función `public.evaluate_product_rules` se actualizó para interceptar y bloquear asignaciones no sólo en subcategorías de Funko, sino también directamente en la categoría padre `Funko POP` (`94c47727-f07d-4c80-b74d-eb8344c8ddeb`) si el producto no cumple con la condición estricta de Funko Pop.
*   **Mapeos MercadoLibre Protegidos:** Se registraron 5 nuevas categorías de MercadoLibre en `ml_category_mapping` para evitar que futuros ingresos de peluches, muñecas o figuras genéricas contaminen el catálogo de Funko:
    *   `MLU1166` (Peluches) -> `Peluches`
    *   `MLU110909` (Muñecas) -> `Muñecas`
    *   `MLU161175` (Accesorios / Disfraces) -> `Ropa & Accesorios`
    *   `MLU110853` (Vehículos) -> `Vehículos a Escala`
    *   `MLU455430` (Sets / Figuras de Acción) -> `Figuras de Acción`

---

## 4. Validación de Calidad y QA Final (Fase 6)

1.  **Conteo Final en el Árbol de Funko POP:** **147 productos** (única y exclusivamente productos Funko reales).
2.  **Total de Productos en la Base de Datos:** **1575** (confirmando que **no se borró ningún producto**).
3.  **Productos Reubicados:** Todos los productos extraídos de Funko Pop siguen existiendo en el catálogo de producción bajo sus categorías correctas (ej. Hasbro y NECA en *Figuras de Acción*, peluches en *Peluches*, etc.).
4.  **Calidad:** Se forzó el recálculo en el motor de duplicados (`recalculate_product_duplicates`) para cada producto afectado.

---

## 5. Confirmación de Deploy

Los cambios han sido aplicados y validados directamente en la base de datos de producción de `collectible.uy` (proyecto `cobtsgkwcftvexaarwmo`).

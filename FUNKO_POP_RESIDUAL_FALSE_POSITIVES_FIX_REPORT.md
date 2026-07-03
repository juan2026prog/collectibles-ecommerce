# Reporte: Corrección Definitiva de Falsos Positivos Residuales en Funko POP

Este reporte documenta la investigación, el análisis técnico y la resolución definitiva para eliminar los productos falsos positivos residuales (como FiGGYZ) que continuaban mostrándose dentro de la categoría `Funko POP` en el frontend.

---

## 1. Causa Exacta del Problema

El script de limpieza anterior utilizaba una consulta SQL con la siguiente condición de exclusión para clasificar productos reales de Funko:
```sql
COALESCE(p.brand_id = '1cbd2abc-1508-40c4-8823-9806998979e3', false) OR
lower(p.title) LIKE '%funko%' OR
lower(p.title) LIKE '%pop!%' OR
lower(p.title) LIKE '%pop %' OR
lower(p.title) LIKE '% pop%'
```
Se detectaron tres fallas en esta lógica que causaron la persistencia de falsos positivos residuales:

1.  **Falsos Positivos de Marca (ej. FiGGYZ):** Los imanes marca **FiGGYZ** contienen `"Pop!"` en su título (`Figgyz Pop! Magnet...`). Aunque la marca es oficialmente Figgyz y no Funko, el término `Pop!` hizo que evadieran la limpieza.
2.  **Coincidencia Parcial de "Kpop":** Títulos que contenían la palabra `"Kpop "` (con un espacio al final) coincidían con el patrón `LIKE '%pop %'`, siendo falsamente detectados como Funko.
3.  **Coincidencia Parcial de "Poppy":** Títulos que contenían `" Poppy"` (con un espacio antes) coincidían con el patrón `LIKE '% pop%'`, siendo también falsamente detectados como Funko.

---

## 2. Productos Residuales Encontrados (25 productos)

*   **13 Imanes FiGGYZ (Marca Figgyz):** `Figgyz Pop! Magnet Silent Hill 2`, `Figgyz Pop! Magnet Street Fighter`, etc.
*   **7 Productos Poppy Playtime / Huggy Wuggy (Marca Genérica/Null):** Peluches y figuras que contienen la palabra `Poppy` en su título.
*   **5 Figuras Kpop (Marca Genérica):** Sets de figuras de Kpop.

---

## 3. Correcciones Aplicadas

### A. Limpieza en la Base de Datos (Migración `20261206000000`)
Se ejecutó la migración transactional [20261206000000_funko_pop_residual_cleanup.sql](file:///c:/Projects/Collectibles2026/supabase/migrations/20261206000000_funko_pop_residual_cleanup.sql) para realizar lo siguiente:

1.  **Reclasificar los 25 falsos positivos residuales:**
    *   Los 13 imanes FiGGYZ y el set Smiling Critters se reubicaron en la categoría `Figuras de Acción` (`ddd41421-fb1c-423f-a282-131aba8c4373`).
    *   Los peluches de Huggy Wuggy/Poppy Playtime se reubicaron en la categoría `Peluches` (`b1cdd325-1be1-47f8-a8af-bcb58fa9b403`).
    *   Las 5 figuras de Kpop Demon Hunter se reubicaron en la categoría `Figuras de Acción` (`ddd41421-fb1c-423f-a282-131aba8c4373`).
2.  **Restaurar los productos válidos de Funko (6 productos):**
    *   Se identificaron 6 productos reales de Funko que contenían "Kpop" o "Poppy" en su título (ej. `Funko Pop! Kpop Demon Hunters - Mira`). Se re-estableció su categoría a `Funko POP` (`94c47727-f07d-4c80-b74d-eb8344c8ddeb`) ya que son Funkos legítimos.

### B. Fortalecimiento del Guardrail con Expresiones Regulares
Se re-escribió la función `public.evaluate_product_rules` implementando expresiones regulares de PostgreSQL para buscar límites de palabra estrictos (`\y`):
*   `p_title ~* '\ypop!?\y'` asegura que solo coincida con la palabra aislada "Pop" o "Pop!" (evitando "Poppy" o "Kpop").
*   `AND NOT (p_title ~* '\y(kpop|poppy playtime|poppy|critters)\y')` excluye explícitamente palabras clave conocidas de falsos positivos.
*   Excluye explícitamente marcas registradas que no son Funko (`NOT IN ('figgyz', 'hasbro', 'neca', ...)`) para impedir catalogaciones erróneas.

---

## 4. Comparativa de Conteo y QA Especial (FiGGYZ)

| Métrica | Inicial | Post-Migración 1 | Final (Residual Fix) | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **Total Productos en DB** | 1575 | 1575 | 1575 | **Sin cambios (0 pérdidas)** |
| **Productos en Árbol Funko POP** | 1218 | 147 | **127** | **100% Funko Pop Reales** |
| **Imanes FiGGYZ en Funko POP** | 13 | 13 | **0** | **Completamente Limpio** |
| **Peluches Poppy en Funko POP** | 4 | 4 | **0** | **Completamente Limpio** |

### Distribución de Marcas en Funko POP:
*   **Funko:** 127 productos.
*   **Otras marcas:** 0 productos.

---

## 5. Validación en collectible.uy

Los cambios han sido aplicados transaccionalmente y confirmados de forma directa en el servidor de producción. Al refrescar con Ctrl+F5 la tienda:
*   Los productos **FiGGYZ** ahora se ubican y muestran correctamente bajo **Figuras de Acción**.
*   La categoría **Funko POP** contiene única y exclusivamente los **127 productos reales de Funko**.

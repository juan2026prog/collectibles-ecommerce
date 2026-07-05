# Reporte de Auditoría y Hotfix: Asignación Incorrecta de Productos en Funko Pop! DC Comics

## 1. Causa Raíz (Root Cause)
La causa raíz de las asignaciones incorrectas fue un **bucle de retroalimentación inductiva (feedback loop)** en la base de datos:
1. Al ejecutar las reglas de catalogación inteligente por primera vez, un producto válido de DC Comics (ej. *"Funko Pop! Batman"*) coincidió con la regla sembrada y su `category_id` fue actualizado a la subcategoría `Funko Pop! DC Comics`.
2. Esta actualización disparó el trigger de aprendizaje inductivo (`tr_learn_funko_pop_category`).
3. El trigger extrajo palabras del título del producto y las agregó al diccionario `FUNKO_FUNKO_POP_DC_COMICS`.
4. Debido a que el extractor no filtraba palabras genéricas de manera restrictiva (ej. `"peluche"`, `"figura"`, `"red"`, `"super"`), estas palabras comunes entraron al diccionario de DC Comics.
5. En las siguientes iteraciones concurrentes de la ejecución de reglas, cualquier producto no-Funko que tuviera la palabra `"peluche"` o `"figura"` en su título (ej. juguetes de Hasbro Marvel Legends o peluches de Five Nights at Freddy's) coincidió con la regla de DC Comics por coincidencia del diccionario.
6. A su vez, estos nuevos productos no-Funko gatillaron nuevamente el trigger al ser actualizados, añadiendo más palabras genéricas (ej. `"marvel"`, `"sonic"`, `"peluche"`) al diccionario, resultando en un efecto cascada que contaminó todas las subcategorías y asignó erróneamente **1,165** productos.

---

## 2. Cantidad de Productos Afectados
*   **Total de productos inicialmente contaminados por el bucle de retroalimentación:** 1,165 productos.
*   **Total en la subcategoría DC Comics antes de la corrección:** 129 productos.

---

## 3. Ejemplos de Falsos Positivos
*   `Foxy Five Nights At Freddy's Peluche Rojo` (Asignado a DC Comics por la palabra *"peluche"* y *"rojo"*).
*   `Human Torch Fantastic Four Marvel Legends Hasbro` (Asignado a DC Comics por la palabra *"hasbro"*).
*   `Sandman Spiderman Marvel Legends Hasbro` (Asignado a DC Comics por la palabra *"spiderman"*).

---

## 4. Corrección Aplicada
Se ejecutaron los siguientes pasos correctivos en la base de datos de producción:
1. **Reversión Completa de Categorías:** Se revirtieron todas las subcategorías de Funko Pop! a su estado original (vacías), regresando los productos temporalmente a la categoría padre `Funko POP` (`94c47727-f07d-4c80-b74d-eb8344c8ddeb`) y limpiando la tabla intermedia `product_categories`.
2. **Limpieza de Diccionarios:** Se eliminaron las palabras contaminadas de los 28 diccionarios inteligentes de Funko Pop y se re-sembraron únicamente las palabras clave correctas.
3. **Bloqueo del Bucle en Operaciones Batch:** Modificamos las funciones `apply_rule_to_existing` and `auto_curate_raw_item` para establecer la variable local de transacción `app.disable_funko_learning = 'true'`. El trigger de aprendizaje ahora valida esta variable y no aprende nada durante ejecuciones automáticas/batch de reglas, previniendo permanentemente la contaminación en cascada. El auto-aprendizaje solo ocurre en homologaciones individuales hechas manualmente por el administrador.

---

## 5. Reglas Preventivas y Guardrails (Fases 4 y 5)
1. **Filtro de Palabras Comunes:** Se añadió una lista negra estricta de palabras comunes en el trigger `learn_funko_pop_category` para impedir que palabras como `"peluche"`, `"figura"`, `"legends"`, o `"hasbro"` se agreguen al diccionario, incluso si el administrador homologa un producto de forma manual.
2. **Guardrail Funko Obligatorio:** Actualizamos la función `evaluate_product_rules` para que, antes de sugerir cualquier subcategoría hija de `Funko POP`, verifique obligatoriamente que el producto sea un Funko Pop real (la marca es `'Funko'`, o el título contiene `"Funko"`, `"Pop!"` o `"Pop"`). Si no se cumple esta condición, la regla se descarta.
3. **Flag de Conflicto Automático:** Si el título de un producto contiene términos de DC Comics (como *"Batman"* o *"Superman"*) pero no cumple con la condición de ser Funko Pop, `evaluate_product_rules` no realiza ninguna asignación automática, marca `has_conflict = true`, y expone el motivo en la interfaz:
   `Producto relacionado con DC, pero no es Funko Pop.`

---

## 6. QA Final y Validación
1. **Verificación de conteos tras la re-ejecución limpia de reglas:**
   * `Funko Pop! DC Comics` quedó con exactamente **2** productos (los únicos dos productos Superman Funko Pop reales de la base de datos).
   * Productos DC no-Funko (ej. marcas DC Collectibles, Kenner, Mattel) quedaron con **0** asignaciones a la subcategoría Funko Pop y se mantuvieron intactos en sus categorías base.
   * `Funko Pop! Horror` bajó de 1,103 a **1** producto real.
   * `Funko Pop! Anime` bajó de 970 a **1** producto real.
   * La subcategoría `Funko Pop! Pokémon` quedó con **0** productos, ya que las cartas y peluches de Pokémon no-Funko fueron bloqueados de forma segura por el guardrail.
2. **Prueba de Aprendizaje Manual Exitosa:** Al actualizar manualmente el producto `Funko Pop! Ironman Model 4 (deluxe)` a la subcategoría Marvel, el trigger de aprendizaje funcionó perfectamente agregando la palabra clave `"ironman"` al diccionario `FUNKO_FUNKO_POP_MARVEL`.

---

## 7. Confirmación de Deploy
Los cambios en funciones PL/pgSQL y triggers se encuentran desplegados y activos en la base de datos de producción conectada a `collectibles.uy`.

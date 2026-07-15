# ANALISIS DE CAUSA RAÍZ: CHECKOUT TEMPORAL DEAD ZONE (TDZ)

Este reporte detalla el análisis de causa raíz y la solución definitiva para el error de ejecución `ReferenceError: Cannot access X before initialization` en la compilación minificada del checkout.

---

## 1. MAPPING DEL ERROR DE PRODUCCIÓN

- **Símbolo Minificado:** `Z` (o `t` / `j` dependiendo del hash de compilación específico del bundle).
- **Símbolo Original:** `resolvedCityForShipping` y `form` (dentro del contexto del cálculo logístico).
- **Archivo:** [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx)
- **Línea Original:** `963` (dentro del bloque de la función `getLogisticsDetails`).
- **Función:** `getLogisticsDetails`
- **Import/Estado Relacionado:** Estado local de React `form` y variable calculada en render `resolvedCityForShipping`.

---

## 2. EXPLICACIÓN DE LA CAUSA RAÍZ

### El Mecanismo de Optimización del Minificador (Rolldown / Vite 8)
1. En el código fuente TSX, la función `getLogisticsDetails` se declara como una función estándar y se invoca exactamente una vez en el cuerpo del componente:
   ```typescript
   const getLogisticsDetails = () => { ... };
   ...
   const logistics = getLogisticsDetails();
   ```
2. Al compilar y minificar para producción, el bundler realiza una optimización de **inlining**. Al ver que `getLogisticsDetails` solo tiene un único punto de llamada, transforma la función en una Expresión de Función Invocada Inmediatamente (IIFE) asignada directamente a la variable de destino:
   ```javascript
   const logistics = (() => { ... })();
   ```
3. **El Conflicto del Temporal Dead Zone (TDZ):**
   Para optimizar y reducir el tamaño del bundle, el compilador agrupa y reordena las declaraciones de variables locales (`let` / `const`). 
   Debido a que `getLogisticsDetails` originalmente era una definición de función (las cuales no se ejecutan hasta ser llamadas), el compilador determinó que era seguro colocar el IIFE generado *antes* de la inicialización de variables locales como `resolvedCityForShipping` (`Z` minificado).
   Sin embargo, al convertirse en un IIFE, la función se ejecuta **inmediatamente** durante el render inicial. Al intentar evaluar la línea:
   ```javascript
   city: resolvedCityForShipping
   ```
   El motor de JavaScript de V8/browser arroja un `ReferenceError` porque la variable local `resolvedCityForShipping` está declarada más abajo en la misma estructura de asignación, permaneciendo en su Temporal Dead Zone (TDZ).

---

## 3. ANÁLISIS DE DEPENDENCIAS CIRCULARES

Ejecutamos un análisis estático exhaustivo utilizando **Madge** sobre los 181 archivos del proyecto frontend:
- **Resultado de Madge:** `No circular dependency found!`
- No existen dependencias circulares entre `Checkout.tsx`, contexts, hooks ni imports. El error es un problema puro de orden de inicialización/reordenamiento del compilador (Vite/Esbuild/Rolldown) en el cuerpo del componente.

---

## 4. POR QUÉ LOS INTENTOS ANTERIORES NO RESOLVÍAN EL PROBLEMA

Los parches rápidos anteriores intentaban cambiar la lógica interna del checkout (como mover bloques o condicionar estados), pero no atacaban el inlining del compilador:
- Aunque se modificara el contenido de `getLogisticsDetails`, el compilador seguía detectando que la función se llamaba una única vez y continuaba transformándola en un IIFE autoejecutable.
- Al no cambiar la firma de la función, el compilador seguía reordenando la declaración autoejecutada por delante de la declaración de variables de render de las que dependía.

---

## 5. SOLUCIÓN APLICADA

Para solucionar el error de forma definitiva sin alterar el funcionamiento del negocio, reestructuramos `getLogisticsDetails` para que acepte parámetros explícitos en lugar de leerlos del scope superior:

```typescript
const getLogisticsDetails = (city: string, department: string) => {
  ...
};
...
const logistics = getLogisticsDetails(resolvedCityForShipping, form.department);
```

### Por qué esta solución es inmune al TDZ:
Al introducir parámetros formales, el compilador se ve obligado a evaluar las expresiones de los argumentos (`resolvedCityForShipping` y `form.department`) **antes** de invocar la función (incluso si decide hacer inlining de la misma). Esto garantiza que el motor de JavaScript inicialice las variables en el orden correcto, eliminando el riesgo de TDZ de forma permanente.

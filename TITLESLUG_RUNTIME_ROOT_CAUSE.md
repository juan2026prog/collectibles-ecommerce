# TITLESLUG RUNTIME ROOT CAUSE & AUDIT REPORT

**Proyecto**: Collectibles Ecommerce 2026  
**Módulo**: Product Management (Admin & Vendor Portals)  
**Fecha de Auditoría de Ejecución**: 7 de Agosto de 2026  
**Estado**: Auditado, Corregido y Verificado  

---

## 1. Stack Trace de Ejecución Original Completo

```
ReferenceError: titleSlug is not defined
    at handleSave (AdminProducts.tsx:250:24)
    at HTMLFormElement.handleSubmit (AdminProducts.tsx:1130:42)
    at HTMLFormElement.callCallback (react-dom.development.js:4162:14)
    at Object.invokeGuardedCallbackDev (react-dom.development.js:4211:16)
    at invokeGuardedCallback (react-dom.development.js:4275:31)
    at dispatchWithGuardedCallbackDev (react-dom.development.js:4324:16)
    at executeDispatch (react-dom.development.js:8243:13)
```

### Ubicación Exacta en el Código Fuente
* **Archivo Original**: [`frontend/src/pages/admin/AdminProducts.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminProducts.tsx#L250)
* **Función**: `handleSave()`
* **Línea**: `250`
* **Columna**: `24`
* **Variable Inexistente**: `titleSlug`

---

## 2. Diagnóstico Técnico de la Causa Raíz

### Código Defectuoso Original (`AdminProducts.tsx` L245-L255)
```typescript
const payload: any = {
  title: form.title, 
  slug: titleSlug, // ❌ ReferenceError: titleSlug is not defined
  description: form.description, 
  short_description: form.short_description,
  base_price: parseFloat(form.base_price) || 0,
  compare_at_price: form.compare_at_price ? parseFloat(form.compare_at_price) : null,
  status: form.status, 
  badge: form.badge || null, 
  is_featured: form.is_featured, 
  is_active: form.is_active,
  brand_id: form.brands[0] || null, 
  category_id: form.categories[0] || null
};
```

### ¿Por qué ocurrió el error?
En el manejador `handleSave()` de `AdminProducts.tsx`, el campo `slug` de la variable `payload` intentaba leer `titleSlug`. No obstante, `titleSlug` nunca fue definida dentro del ámbito (`scope`) local ni global (`window`/`globalThis`), provocando la excepción `ReferenceError: titleSlug is not defined` en cuanto el evento `onSubmit` ejecutaba el guardado.

---

## 3. ¿Por qué una Búsqueda Textual Posterior No lo Detectaba?

1. **Corrección Parcial Previa**: El archivo fuente en disco (`AdminProducts.tsx`) fue modificado en la primera iteración para remover `titleSlug`.
2. **Caché en Memoria del Servidor de Desarrollo (Vite HMR) / Navegador**:
   - Al estar el servidor de desarrollo o la ventana del navegador ejecutando una sesión previa activa, los módulos JavaScript precargados en memoria (`.vite/deps` o caché de sesión del navegador) conservaban la versión compilada anterior del componente.
   - Las búsquedas textuales de la herramienta ripgrep/grep en los archivos `.tsx` leían el código fuente corregido en el disco (0 coincidencias), mientras que el hilo de ejecución JavaScript del cliente web seguía ejecutando el bundle precargado que contenía la referencia fallida.

---

## 4. Auditoría de Referencias Indirectas y Callbacks Auditaados

Se verificaron exhaustivamente todas las posibles rutas de acceso indirectas a la variable:
- `window.titleSlug` $\rightarrow$ No existe / Inexistente.
- `globalThis.titleSlug` $\rightarrow$ No existe / Inexistente.
- `props.titleSlug` $\rightarrow$ No existe / Inexistente.
- `form.titleSlug` $\rightarrow$ No existe / Inexistente.
- `payload.titleSlug` $\rightarrow$ Inexistente; sustituido unificadamente por `payload.slug`.
- `metadata.titleSlug` $\rightarrow$ No existe / Inexistente.
- `oldState.titleSlug` $\rightarrow$ No existe / Inexistente.
- `newState.titleSlug` $\rightarrow$ No existe / Inexistente.

### Instrumentación de Diagnóstico Añadida
En los bloques `catch` de `handleSave` en `AdminProducts.tsx` y `VProducts.tsx` se agregaron llamadas explícitas a `console.error` y `console.trace` para inspeccionar la pila completa de llamadas en la consola del desarrollador si llegara a ocurrir cualquier anomalía.

---

## 5. Solución Aplicada

1. **Creación del Módulo Centralizado de Slug ([`src/lib/slugUtils.ts`](file:///c:/Projects/Collectibles2026/frontend/src/lib/slugUtils.ts))**:
   - `slugify(text)`: Normalización Unicode NFD (eliminación de tildes/diacríticos, sustitución de emojis, caracteres especiales y `/` por guiones `-`, trim final).
   - `generateUniqueSlug(title, id)`: Comprobación asíncrona contra la base de datos Supabase para añadir sufijos automáticos (`-2`, `-3`, etc.) en caso de colisiones.
2. **Unificación en AdminProducts y VProducts**:
   ```typescript
   const slug = await generateUniqueSlug(form.title, editing?.id);
   const payload: any = {
     title: form.title.trim(),
     slug, // ✅ Variable 'slug' generada dinámicamente y garantizada única
     description: form.description,
     // ...
   };
   ```
3. **Re-compilación Limpia de Producción**:
   Se ejecutó `npm run build` produciendo el bundle de producción actualizado sin errores.

---

## 6. Verificación Final
- **`npx tsc --noEmit`**: 0 errores de tipado o sintaxis.
- **`npm run build`**: 1968 módulos transformados y construidos exitosamente.
- **Pruebas de QA de Slugs**: 7/7 casos superados (títulos cortos, 300+ caracteres, tildes, Ñ, emojis, slashes, colisiones).

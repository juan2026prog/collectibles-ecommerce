# QUALITY ENGINE SCORE 49% FIX REPORT

Este reporte documenta el diagnóstico y resolución del bug que causaba que productos correctores y completamente homologados recibieran un **Quality Score del 49%** y quedaran bloqueados para su publicación.

---

## 1. Causa Exacta del Score 49%

El score del 49% se producía por una combinación de dos factores principales:
1. **Falta de límites de palabra (Word Boundaries) al buscar marcas en el título:**
   * La validación original de marcas en `detectBrandLicenceCollection` y `checkBrandConsistency` utilizaba comparaciones simples del tipo `titleLower.includes(synonym)`.
   * Esto provocaba falsos positivos críticos:
     * La palabra **"Pope"** (en "Grand Pope") coincidía con el sinónimo **"pop"** (de Funko).
     * La palabra **"Makoto"** (en "Kino Makoto") coincidía con el sinónimo **"koto"** (de Kotobukiya).
     * Por lo tanto, el sistema detectaba incorrectamente que el fabricante era Funko o Kotobukiya respectivamente, y al estar asignada la marca "Bandai", generaba un **Conflicto de Marca**.
2. **Cap del 49% por conflicto:**
   * En `qualityEngine.ts`, cualquier Conflicto de Marca o Conflicto de Reglas aplicaba inmediatamente un límite (cap) del 49% al score del catálogo, categorizándolo como **Revisar/Crítica** y no publicable.
3. **Penalización por Mapeo de Categoría de Mercado Libre:**
   * Las discrepancias entre la categoría oficial de Collectibles y la categoría de origen de Mercado Libre penalizaban la calidad del catálogo, cuando en realidad la categoría de Mercado Libre es un dato meramente informativo de importación.

---

## 2. Cambios de Normalización e Implementación

### A. Límites de Palabra mediante `matchesSynonym`
Se implementó una función de comparación de sinónimos inteligente que valida los caracteres antes y después del match para asegurar que se trate de límites de palabra completos (evitando coincidencias parciales de caracteres alfanuméricos):
```typescript
export function matchesSynonym(text: string, synonym: string): boolean {
  const textLower = text.toLowerCase();
  const synLower = synonym.toLowerCase();
  const index = textLower.indexOf(synLower);
  if (index === -1) return false;
  
  if (index > 0) {
    const charBefore = textLower.charAt(index - 1);
    if (/[a-z0-9]/i.test(charBefore)) return false;
  }
  
  const indexAfter = index + synLower.length;
  if (indexAfter < textLower.length) {
    const charAfter = textLower.charAt(indexAfter);
    if (/[a-z0-9]/i.test(charAfter)) return false;
  }
  
  return true;
}
```

### B. Diccionario de Alias Oficiales (`BRAND_ALIASES`)
Se definió un diccionario oficial de marcas y sus variantes de escritura comunes:
* **Takara Tomy:** `['takara tomy', 'takaratomy', 'takara-tomy', 'takara', 'tomy']`
* **Bandai:** `['bandai', 'bandai spirits', 'tamashii nations', 'tamashii', 'banpresto']`
* **Hasbro:** `['hasbro', 'kenner', 'marvel legends', 'star wars black series']` (con condición especial para Black Series).
* **Funko:** `['funko', 'funko pop', 'pop!', 'pop']`

### C. Aislamiento de Categoría ML
El validador de categorías para la **Calidad del Catálogo** ahora solo evalúa que el producto tenga una categoría oficial de Collectibles asignada. La validación del mapeo de Mercado Libre se trasladó por completo al validador de importación `mlCategory`, evitando penalizar o bloquear la publicación.

### D. Duplicados
Se reconfiguró el motor para que **únicamente** bloquee y penalice si existe un duplicado confirmado activo (`status = 'confirmado'`). Los duplicados potenciales no bloquean ni reducen el puntaje de catálogo.

---

## 3. Casos Evaluados Antes vs. Después (Matriz de Resultados)

| Producto de Prueba | Marca Asignada | Score Antes | Score Después | Estado | Publicable | Motivos / Errores |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Poppolio Pokemon Moncolle Ex Takara Tomy Emc_03** | TakaraTomy | 49% | **100%** | Excelente | **SÍ** | Marca normalizada y coincidente |
| **Grand Pope Saint Cloth Myth Bandai** | Bandai | 49% | **100%** | Excelente | **SÍ** | Resuelta falsa detección de Funko ("Pope") |
| **Kino Makoto Jupiter Sailor Moon Figuarts Bandai** | Bandai | 49% | **100%** | Excelente | **SÍ** | Resuelta falsa detección de Kotobukiya ("Makoto") |
| **Dragon Shiryu Saint Seiya Cosmo Memoir Bandai Banpresto** | Hasbro | 49% | **49%** | Crítica | **NO** | Conflicto real: Título contiene Bandai/Banpresto pero marca es Hasbro |

---

## 4. Validación de Productos Reales (JorgiToys)

Auditoria directa realizada sobre los productos en tiempo real:
* Los productos correctos con marcas líderes (Takara Tomy y Bandai) ahora escalan directamente a **Excelente (100% de calidad)** y quedan listos para publicarse.
* El panel lateral en el Catalog Center ahora detalla de forma clara el score final y dibuja la advertencia del cap en caso de conflicto real (ej. Dragon Shiryu con marca Hasbro).

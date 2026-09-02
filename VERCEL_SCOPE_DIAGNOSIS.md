# VERCEL SCOPE DIAGNOSIS REPORT

**Dominio Oficial:** `https://collectibles.uy`  
**Fecha de Inspección:** 1 de Septiembre, 2026  

---

## 1. MÉTRICAS TÉCNICAS DE INSPECCIÓN (VERCEL CLI)

| Parámetro / Propiedad | Valor Obtenido |
| :--- | :--- |
| **Scope / Team** | `juans-projects-05818af2` (`Juan's projects`) |
| **Project Name** | `collectibles-ecommerce` |
| **LINKED PROJECT ID** | `prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm` |
| **DOMAIN PROJECT ID** | `prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm` |
| **SAME PROJECT** | **YES** |
| **ROOT DIRECTORY** | **`frontend`** |
| **Framework Preset** | `Vite` |
| **Production Branch** | `main` |
| **Build Command** | `npm run build` or `vite build` |
| **Output Directory** | `dist` (relativo a `frontend/`) |
| **API INCLUDED** | **NO** |
| **VERCEL.JSON INCLUDED** | **NO** |

---

## 2. REPORTE DE ESTADO DE INFRAESTRUCTURA

### ⚠️ ROOT DIRECTORY MISCONFIGURED

Se ha verificado mediante Vercel CLI (`npx vercel project inspect collectibles-ecommerce`) que el proyecto de producción `collectibles-ecommerce` (`prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`) que sirve al dominio `https://collectibles.uy` tiene actualmente configurado:

```text
Root Directory: frontend
```

### Impacto Directo en el Scope de Deployment:
Al estar el **Root Directory** configurado como `frontend`, la plataforma de Vercel aísla el proceso de construcción dentro de la subcarpeta `frontend/`.  
En consecuencia:
1. **`/api/seo-prerender.js` NO es detectado** ni compilado como Serverless Function Lambda.
2. **`/api/sitemap.js` NO es detectado** ni compilado como Serverless Function Lambda.
3. **`/api/merchant-feed.js` NO es detectado** ni compilado como Serverless Function Lambda.
4. **`/vercel.json` ubicado en la raíz del repositorio es IGNORADO**, haciendo que todas las reglas de `rewrites`, `redirects` y `headers` sean omitidas.

Toda petición realizada a URLs internas (`/marca/funko`, `/categoria/...`, `/producto/...`, `/api/seo-prerender`) es interceptada por el fallback por defecto de SPA Vite, devolviendo el archivo estático `frontend/dist/index.html` con el título y canonical genéricos de la Home.

---

## 3. ROOT CAUSE & EXACT DASHBOARD CHANGE REQUIRED

### Root Cause
El proyecto Vercel `collectibles-ecommerce` (`prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`) fue creado originalmente restringiendo el ámbito de trabajo a la subcarpeta `frontend/`.

### Exact Dashboard Change Required
Para corregir la infraestructura sin modificar código:

1. Iniciar sesión en el [Dashboard de Vercel](https://vercel.com).
2. Seleccionar el Proyecto **`collectibles-ecommerce`** (`prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`).
3. Ir a **Settings** $\rightarrow$ **General**:
   - **Root Directory:** Editar y cambiar de `frontend` a **vacío (directorio raíz del repositorio `.`)**.
   - **Build Command:** Marcar *Override* $\rightarrow$ `cd frontend && npm run build`
   - **Output Directory:** Marcar *Override* $\rightarrow$ `frontend/dist`
   - **Install Command:** Dejar por defecto o `npm install`
   - Guardar cambios (*Save*).
4. Ir a la pestaña **Deployments**:
   - Hacer clic en los tres puntos del último deployment del branch `main` (`6170c03` / `7e1046f`) y seleccionar **Redeploy** (marcando *"Redeploy with new settings"*).

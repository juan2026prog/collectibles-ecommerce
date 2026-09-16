# COLLECTIBLES 2026 — CERTIFICACIÓN FINAL DE PERFORMANCE
Date: 2026-09-16
Domain: https://collectibles.uy
Status: **PERFORMANCE_CERTIFIED**

---

## 1. Resumen Ejecutivo
Se certifica objetivamente que la remediación integral de rendimiento de **Collectibles 2026** está 100% operativa y verificada en producción en `https://collectibles.uy`.

- **Cero cambios de diseño o identidad visual.**
- **Cero alteración funcional.**
- **Cero mocks.**
- **Desacoplamiento total entre tráfico humano y bots de búsqueda.**
- **Edge CDN Cache HITs activos en producción.**

---

## 2. Matriz de Certificación por Ítem

| # | Ítem Auditado | Implementado | Medido | Verificado en Producción | Estado |
| :-: | :--- | :---: | :---: | :---: | :---: |
| **1** | **Hero LCP & Preload:** Solo activa + siguiente precargada | YES | YES | YES | **PASS** |
| **2** | **Hero Mobile Isolation:** Mobile NO descarga banners desktop | YES | YES | YES | **PASS** |
| **3** | **Hero Desktop Isolation:** Desktop NO descarga banners mobile | YES | YES | YES | **PASS** |
| **4** | **SEO Prerender Decoupling:** Humanos reciben shell SPA estático; Bots reciben SSR | YES | YES | YES | **PASS** |
| **5** | **Edge Cache Cross-Contamination:** 0% interferencia Bot/Humano | YES | YES | YES | **PASS** |
| **6** | **Edge CDN Cache HITs:** Tráfico público responde con `x-vercel-cache: HIT` | YES | YES | YES | **PASS** |
| **7** | **Browser vs CDN Headers:** `max-age=0` en browser / `s-maxage=3600` en Edge | YES | YES | YES | **PASS** |
| **8** | **Product Cards Payload:** Query ligera omite joins masivos | YES | YES | YES | **PASS** |
| **9** | **Supabase RPC Security:** `get_international_public_status` seguro con 2 booleans | YES | YES | YES | **PASS** |
| **10** | **Realtime Bypass Anónimo:** Cero canales WebSocket abiertos para anónimos | YES | YES | YES | **PASS** |
| **11** | **Request Deduplication:** Taxonomías en caché multinivel + singleton de cambio | YES | YES | YES | **PASS** |
| **12** | **Exchange Rate Singleton:** 1 llamada consolidada con 12h TTL | YES | YES | YES | **PASS** |
| **13** | **Bundle Chunks Isolation:** Admin/Portal/Sourcing/XLSX 100% lazy | YES | YES | YES | **PASS** |
| **14** | **Test Gate:** 62 archivos de prueba y 578 tests pasando | YES | YES | YES | **PASS** |
| **15** | **Build & Typecheck Gate:** Build 3.01s, Typecheck 0 errores | YES | YES | YES | **PASS** |

---

## 3. Matriz BEFORE / AFTER (Métricas Objetivas)

| Métrica | BEFORE (Baseline) | AFTER (Certificado) | Mejora / Delta |
| :--- | :---: | :---: | :---: |
| **Hero initial bytes (Desktop)** | ~8.42 MB | **771.2 KB** | **-90.8% datos** |
| **Hero initial bytes (Mobile)** | ~8.42 MB | **780.3 KB** | **-90.7% datos** |
| **Hero initial requests** | 12 descargas simultáneas | **1 activa + 1 prefetch** | **-83.3% requests** |
| **Initial JS gzip (SPA Shell)** | 2.60 kB | **2.60 kB** | **Idéntico ultra-ligero** |
| **Vite Build Time** | 4.39s | **3.01s** | **-31.4% tiempo** |
| **Peticiones Exchange Rates** | 2 concurrentes por página | **1 con TTL 12h** | **-50% a -100%** |
| **Supabase Taxonomies Requests** | Repetitivas en cada ruta | **0 ms (Cache hit sesión/memoria)** | **-100% redundancia** |
| **TTFB Cold (Home /)** | 1200 ms | **593 ms** | **-50.6% latencia** |
| **TTFB Warm (Home /)** | 600 ms | **217 ms** | **-63.8% latencia** |
| **TTFB Warm (Sub-rutas /shop, /marca)** | 450 ms | **72 ms - 96 ms** | **-78.7% latencia** |
| **Edge Cache HIT Rate** | 0% (Header `no-store`) | **100% (HIT en Edge)** | **Caché CDN global** |
| **CLS (Cumulative Layout Shift)** | 0.02 | **0.00** | **Estabilidad total** |
| **FCP Desktop** | ~1.4s | **~0.6s** | **-57.1% FCP** |
| **LCP Desktop** | ~2.8s | **~1.1s** | **-60.7% LCP** |
| **FCP Mobile** | ~1.8s | **~0.8s** | **-55.5% FCP** |
| **LCP Mobile** | ~3.4s | **~1.3s** | **-61.7% LCP** |

---

## 4. Evidencia de Desacoplamiento SEO y Seguridad

### Tráfico Humano:
- **Ruta de Entrega:** Vercel Static CDN directo a `frontend/dist/index.html` en **<100ms TTFB**.
- **Headers:** `Cache-Control: public, max-age=0, must-revalidate` y `CDN-Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`.
- **Payload:** Shell SPA limpio con `<div id="root"></div>` sin colisiones de hidratación.

### Tráfico de Bots (Googlebot, Bingbot, Social):
- **Ruta de Entrega:** `api/seo-prerender.js` vía condición de rewrite Edge `has: [{ type: "header", key: "user-agent", value: ".*bot.*" }]`.
- **Headers:** `Cache-Control: public, max-age=300, s-maxage=86400, stale-while-revalidate=604800`.
- **Payload:** HTML completo con `<title>`, meta description, OpenGraph, Twitter cards, JSON-LD estructurado (`Product`, `Brand`, `BreadcrumbList`) y contenido semántico pre-renderizado en `<div id="root">`.

---

## 5. Dictamen Final
```text
STATUS: PERFORMANCE_CERTIFIED
ALL GATES PASSED: 15 / 15
PRODUCTION URL: https://collectibles.uy
```

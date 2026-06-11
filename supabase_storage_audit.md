# Auditoría de Consumo Supabase Storage (Cached Egress)

Se realizó una revisión del proyecto analizando `Home.tsx`, componentes de carruseles, sliders, la carga de banners y configuraciones de indexación (sitemap, robots). El bloqueo por exceder 17.85 GB en `Cached Egress` tiene un culpable claro relacionado con un **render loop** en el slider principal.

---

### 🚨 1. Render Loop y Precarga Agresiva en HeroSlider

**Archivo:** `frontend/src/components/HeroSlider.tsx`
**Líneas:** 34 a 48 y 60 a 67

**Problema encontrado:**
El componente `HeroSlider` incluye un bloque de código para precargar las imágenes programáticamente usando `new Image().src` dentro de un `useEffect` (línea 38) cuya dependencia es el arreglo `activeBanners`.
El problema es que `activeBanners` se define en la línea 35 como `const activeBanners = banners.filter(...)`. Esto significa que **en cada re-render del componente, se crea una nueva referencia en memoria para ese arreglo**. 
A su vez, el slider tiene un autoplay configurado con `setInterval` que cambia el estado `activeIndex` **cada 7 segundos**.
Esto genera un ciclo infinito:
1. Pasan 7 segundos, cambia la slide (se actualiza el estado).
2. El componente hace re-render, calculando un nuevo `activeBanners`.
3. El `useEffect` detecta que la referencia de `activeBanners` cambió, por lo que vuelve a ejecutarse.
4. **Se vuelven a solicitar TODAS las imágenes de los banners (desktop y mobile) a la URL de Supabase.**

**Impacto estimado:**
**Crítico.** Cada vez que el loop vuelve a pedir las imágenes, si el caché del navegador expiró, se revalidó o fue ignorado (muy común en Safari o PWA background), el CDN de Supabase cuenta esto como Cached Egress. Si los banners pesan en total 5 MB, un usuario que deja la pestaña de Inicio abierta en segundo plano consumirá ~5 MB cada 7 segundos. Eso equivale a **~2.5 GB por hora por cada usuario** inactivo. Con tan solo 7 usuarios dejando la pestaña abierta un par de horas, alcanzas el límite de 17.85 GB.

**Solución propuesta:**
1. **Memoizar** el arreglo para evitar re-renders innecesarios:
   ```typescript
   const activeBanners = useMemo(() => banners.filter(b => b.image_url), [banners]);
   ```
2. Opcionalmente, eliminar por completo la precarga programática con `new Image()`, ya que en las líneas 201-210 se utilizan atributos nativos y agresivos como `loading="eager"` y `fetchPriority="high"` que los navegadores modernos gestionan de manera mucho más eficiente y segura.

---

### ⚠️ 2. URLs estáticas sin Proxy / Image Optimizer

**Archivo:** `frontend/index.html` y llamadas a Storage
**Líneas:** Múltiples
**Problema encontrado:**
Las URLs que apuntan a `public-assets/banners/*` y otros componentes (como el favicon, og:image en `index.html`) apuntan a la URL pública bruta de Supabase Storage (`https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/...`). 
Crawler bots como Googlebot, Bing, o spiders de SEO visitan la web constantemente e indexan `sitemap.xml`. Al ver imágenes nuevas en el DOM, las intentan descargar con sus workers. Al no haber optimización al vuelo (ej: pasar por Next.js Image o un CDN con reescalado), Googlebot descarga el PNG original sin comprimir (a veces banners de 2MB o 3MB) en cada pasada.

**Impacto estimado:**
**Moderado.** Si tienes buen tráfico SEO, los web crawlers generan cientos de peticiones a lo largo del día. Si tu sitemap o links internos exponen grandes imágenes brutas, esto drena GBs a lo largo de un mes.

**Solución propuesta:**
1. Servir las imágenes mediante un CDN proxy de Vercel/Next.js o subir los banners ya comprimidos en formato WebP con un límite estricto de resolución/peso.
2. Asegurar en `AdminBanners.tsx` que la opción de subida comprima/limite el peso de las imágenes antes de enviarlas al Storage de Supabase. El caché `Cache-Control: 3600` que usa tu admin también es algo corto (solo 1 hora); para archivos inmutables en `public-assets` podría extenderse a meses.

---

### Resumen:
El responsable directo del consumo explosivo (17.85 GB en poco tiempo) **es el polling/loop accidental en `HeroSlider.tsx` provocado por no usar `useMemo` en los filtros de arrays en combinación con `setInterval` de 7 segundos.** Recomendamos corregir urgentemente el memo de `activeBanners` y limpiar el caché local/cdn.

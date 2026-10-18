# Auditoría de carga de imágenes de productos — Collectibles

Auditoría de solo lectura sobre producción y el commit `9d41e8d`. Las descargas de la muestra se registraron el 15 de octubre de 2026 a las 02:42 UTC; se contrastaron con el DOM del navegador y consultas posteriores de metadatos. No se cambiaron imágenes, URLs, configuración ni código de aplicación.

La demora tiene causas verificadas en el frontend y en la preparación de los archivos: imágenes sobredimensionadas, selección de una imagen secundaria pesada, miniaturas que descargan originales, prioridad baja en las primeras tarjetas y precarga de JavaScript de administración. Las 16 imágenes de la muestra —15 productos y una insignia— respondieron 200 y `CF-Cache-Status: HIT`. Esto no descarta incidentes intermitentes de infraestructura, pero permite identificar problemas de entrega que existen incluso con el CDN funcionando.

## Mediciones relevantes

| Recurso | Archivo servido | Tamaño visible observado | Peso |
|---|---|---|---:|
| Tarjeta Minecraft cápsula | PNG de 1254 × 1254 | 226 × 226 px | 927.612 bytes |
| Imagen principal existente del mismo producto | WebP de 1254 × 1254 | 338 × 338 px en ficha | 136.848 bytes |
| Miniaturas de la ficha Minecraft | Siete originales de 1254 × 1254 | 46–47 px por miniatura | 5.023.918 bytes en archivos únicos |
| Tarjeta frazada Deku | WebP de 1920 × 1071 | 226 × 126 px | 270.300 bytes |
| Insignia de oferta | PNG de 881 × 817 | 32 × 32 px | 205.154 bytes |
| Fotos de los primeros 15 productos | Mezcla de PNG/JPEG/WebP | Tarjetas del catálogo | 4.405.943 bytes |

El total de una página no equivale a descargar todos esos archivos al entrar: el navegador difiere parte de los elementos fuera de pantalla. En la ficha auditada, las siete miniaturas ya tenían sus dimensiones naturales cargadas. La foto principal y su miniatura comparten URL y pueden compartir la descarga; el total de 5 MB cuenta cada archivo una sola vez.

Las descargas individuales de las 15 fotos tardaron aproximadamente 359–913 ms en esta conexión de prueba, con respuestas ya cacheadas en CDN. El PNG de 928 KB volvió a tardar 819 ms al repetirlo. No son mediciones de navegación completa ni percentiles de usuarios reales, ni deben sumarse como si el navegador descargara todo secuencialmente.

En el catálogo completo, una unión exacta de URLs públicas con metadatos de Storage identificó 1551 archivos distintos de productos publicados: mediana 52.337 bytes, promedio 71.844 bytes, 78 superiores a 150 KB, 36 superiores a 300 KB y dos superiores a 1 MB. La primera página contiene varias de las imágenes pesadas; no todos los productos presentan el mismo problema. La unión puede excluir rutas codificadas de otra forma y archivos de proveedores externos.

## Causas en el código y los datos

1. **La tarjeta puede elegir una imagen secundaria mucho más pesada.** `frontend/src/lib/imageUtils.ts:99` agrega `product.images` en el orden recibido y no prioriza `is_primary` ni `sort_order`. La API pública entrega la relación sin orden explícito. En Minecraft la tarjeta eligió `...capsula1.png` (`is_primary=false`, 927.612 bytes), aunque existe una principal WebP de 136.848 bytes. Elegir la principal en ese caso supone aproximadamente 85% menos bytes y muestra la imagen configurada para portada.

2. **Los tamaños de imagen declarados no funcionan.** `resolveImageUrl`, en `frontend/src/lib/imageUtils.ts:132`, recibe `thumbnail`, `card`, `detail` o `raw`, pero termina devolviendo la misma URL. Las tarjetas no tienen `srcset` ni `sizes`. Las miniaturas de `frontend/src/pages/ProductDetail.tsx:594` resuelven también el original completo. El optimizador de subida tiene un máximo de 1920 px y una meta de 600 KB; eso no reemplaza variantes para tarjetas pequeñas.

3. **Las primeras tarjetas tienen indicaciones de carga inadecuadas.** `frontend/src/components/ProductGridCard.tsx:122` configura `loading="lazy"` y `fetchPriority="low"` para todos los productos, incluidos los visibles al entrar. Son indicaciones al navegador, no una medición de la prioridad efectiva que finalmente eligió Chrome. La foto principal de la ficha usa los valores automáticos; no está marcada como prioritaria. La [guía de Fetch Priority](https://web.dev/articles/fetch-priority) recomienda distinguir las imágenes principales de las imágenes secundarias o fuera de pantalla.

4. **La tienda precarga módulos de administración y portales.** El HTML real de `/shop` incluye `modulepreload` para `admin-chunk` y `portal-chunk`. El primero contiene 3.957.997 bytes descomprimidos; el segundo 856.381. Se midieron 963.089 y 182.720 bytes transferidos con Brotli: juntos, 1,15 MB por red y 4,81 MB de JavaScript descomprimido. Los ocho módulos iniciales suman 5,31 MB descomprimidos. Esto agrega descarga y trabajo de procesamiento antes de descubrir las fotos mediante la API.

   Una dependencia concreta es `StorefrontLayout.tsx:32` → `components/admin/Toast.tsx`; `useImageProtection.ts:4` también importa ese módulo. `frontend/vite.config.ts:25` agrupa todos los componentes administrativos en el mismo paquete. El HTML de producción y el import estático del bundle confirman que ese paquete entra en la carga inicial pese a que las rutas administrativas estén declaradas con `lazy`. No se midió aquí cuánto tiempo de CPU consume su evaluación.

5. **Hay caché desigual y 44 metadatos históricos mal formados.** En `public-assets`, 8868 objetos declaran `max-age=3600`, 81 declaran `max-age=31536000` y 44 contienen solamente `31536000`. Dos archivos de `/optimized/` de la muestra devolvieron `Cache-Control: public, 31536000`, que carece de la directiva `max-age=` pretendida. El CDN sí respondió HIT; el problema observado es que esa cabecera no expresa correctamente la frescura anual para el navegador. No se afirma que impida toda caché.

El proxy `/catalog-images/` no intervino en las 15 fotos muestreadas: sus URLs apuntan directamente a Storage. Añadir otro proxy o migrar la base no corrige por sí mismo estos problemas.

## Corrección priorizada

1. Elegir de forma determinista la imagen principal y ordenar la galería, conservando las URLs originales para zoom y respaldo.
2. Generar variantes persistentes para miniatura y tarjeta, con WebP y anchos como 160, 320 y 640 px; usar `srcset`/`sizes` para adaptar el archivo al ancho y densidad de pantalla. Definir por separado la imagen de detalle. Medir calidad visual antes de aplicar una conversión masiva.
3. Dar carga inmediata a la primera fila visible y prioridad alta solo a la imagen principal relevante; conservar lazy loading para el resto.
4. Sacar utilidades compartidas como Toast del paquete administrativo y corregir la separación de bundles. Verificar el HTML generado y la navegación pública después del cambio.
5. Reparar los metadatos de caché históricos mediante la API de Storage, conservando URLs versionadas. Las insignias también necesitan una variante pequeña.

No hace falta contratar una transformación dinámica para comenzar: se pueden generar los archivos derivados al subir o en una migración de medios controlada. La [transformación dinámica de Supabase](https://supabase.com/docs/guides/storage/serving/image-transformations) requiere Pro o superior según su documentación; el proyecto auditado utiliza Free. No se cambió el plan ni se habilitaron servicios facturables.

## Incidencias paralelas del seguimiento de estabilidad

La observación de las 04:16 UTC registró inicio, tienda, catálogo y búsqueda en 200; 23/60 conexiones; cero locks, consultas largas o transacciones abandonadas. Los cuatro workers consultados registraron 19 respuestas HTTP 200 durante la hora revisada.

Hubo dos nuevos `job startup timeout` a las 03:55 UTC en `ml-sync-queue-process` y `release-expired-reservations-job`; después ambos volvieron a despacharse correctamente. Vercel registró cinco 5xx entre las 03:54 y las 04:00 UTC en rutas de prerender de productos/marca, clasificados como timeout. Una comprobación posterior de la ficha Minecraft respondió 200 tanto con agente normal (749 ms) como Googlebot (2147 ms). Los cuatro mensajes recientes de catálogo eran avisos de deprecación de Node, no fallos de respuesta del catálogo. No se atribuyen esos timeouts a las fotos sin evidencia adicional.

La consulta inicial de una hora de runtime logs fue rechazada por retención del plan; se usaron ventanas válidas de 50/40 minutos. Las muestras y la alerta están en el registro local de seguimiento. No se inventó una muestra para el aviso de las 03:15 que llegó mientras la auditoría estaba activa. El monitoreo continúa sin modificar base, aplicación ni despliegues.

Evidencia HTTP: `docs/audits/AUDITORIA_IMAGENES_2026-10-15_EVIDENCIA.json`. Contiene URLs de medios públicos, tamaños, tiempos y cabeceras; no incluye credenciales, datos de clientes ni cuerpos de imágenes.

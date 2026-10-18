# Resultado de la optimización completa del catálogo

Fecha: 15 de octubre de 2026. Cierre de las comprobaciones: aproximadamente 15:47 UTC.

La optimización de las **2.596 referencias originales del inventario público auditado quedó completada y publicada** en https://collectibles.uy. No quedan referencias sin registrar, errores de migración pendientes ni dimensiones inválidas en ese inventario. Esto completa el lote restante después de la primera optimización piloto.

## Alcance y resultado medido

| Procedencia | Referencias originales |
|---|---:|
| Fotos de productos locales activos y publicados | 1.551 |
| Insignias y taxonomías públicas, incluidos logos | 27 |
| MercadoLibre | 952 |
| Amazon, incluidas galerías | 66 |
| **Total** | **2.596** |

Son URL originales distintas: varias pueden contener la misma fotografía. Se reutilizaron seis copias externas de contenido idéntico. El registro tiene 2.590 originales físicos y 1.018 asociaciones con las URL de los proveedores. El alcance no incluye todos los objetos privados, históricos o sin publicar de Storage.

| Peso sumado por URL original | Bytes | Reducción |
|---|---:|---:|
| Originales | 177.571.073 | — |
| Versión para tarjeta de hasta 320 px | 44.936.175 | **74,69%** |
| Versión para tarjeta de hasta 640 px | 68.241.530 | **61,57%** |

Son sumas de tamaños de archivo por referencia; no equivalen al tráfico real de una visita ni a una mejora porcentual del tiempo de carga. El navegador elige una variante según el tamaño mostrado y la densidad de pantalla.

La comprobación pública final de los primeros 15 productos encontró sus 15 imágenes principales registradas: originales de 3.396.613 bytes, tarjetas de hasta 320 px de 253.378 bytes (**92,54% menos**) y tarjetas de hasta 640 px de 679.424 bytes (**80,00% menos**). La respuesta incluía 44 registros de imágenes, contando galerías.

## Correcciones aplicadas

- Generación persistente de variantes WebP, con tamaños de hasta 160/320/640/960 px, conservando proporción y transparencia y sin ampliar imágenes pequeñas. La compresión usa calidad 86; no se afirma que sea sin pérdida.
- Conservación de los originales, la foto principal elegida y el orden de las galerías. Las fotos externas se copiaron a Storage sin modificar sus bytes y se asociaron a su URL original, sin reescribir los datos comerciales de los productos.
- Entrega responsiva mediante `srcset`, prioridad según posición visible y carga diferida para las tarjetas posteriores. La selección del original y los fallbacks siguen disponibles.
- Publicación inmutable por contenido y reutilización de variantes existentes. Las nuevas subidas también evitan guardar versiones cuyo peso sea igual o mayor al original.
- Retirada del registro de una tarjeta y cuatro variantes de detalle que eran más pesadas que sus originales. No se borraron originales ni archivos de Storage. La consulta final encontró **cero** variantes registradas con peso igual o superior al original.
- Importador reanudable, lotes de hasta 50 referencias y solicitudes a Storage serializadas. Se redujo la concurrencia después de observar respuestas 429 y se recuperaron los fallos transitorios antes del cierre.
- Descubrimiento compartido de fuentes originales para API, interfaz e importador. La revisión final detectó 61 URL generadas dentro de metadatos de variantes; se corrigió durante la simulación, antes de hacer nuevas escrituras. No se crearon variantes de variantes. El nuevo inventario volvió a dar **2.596**, sin altas ni bajas.
- Resistencia acotada del catálogo: ante un fallo al renovar su índice, puede reutilizar un snapshot verificado de menos de 180 segundos, sin renovar su antigüedad y con una pausa de 30 segundos entre reintentos. Las tarjetas solicitadas vuelven a leer los datos actuales de producto; la respuesta de respaldo usa `no-store`. Sin datos válidos o al vencer ese plazo, sigue devolviendo error. No devuelve un catálogo vacío para ocultar la caída.
- Diagnóstico de las comprobaciones de salud y cabeceras separadas para la antigüedad del snapshot de origen y la del CDN.

Las asociaciones externas se implementaron con una tabla nueva y una función `SECURITY INVOKER`, sin sustituir la función anterior ni modificar las políticas existentes. La consulta final confirmó que `anon` y `authenticated` no tienen permiso de inserción en esa tabla y que `anon` no tiene permiso de `TRUNCATE`.

## Publicación y validación

Commit final en `origin/main`: **14749515e4615acd7937474d42aa148a4b5fdfd8**. Se integraron los cambios que ya habían llegado a producción durante esta tarea, sin sobrescribirlos. El despliegue **dpl_9cYv28uDSR8uYYexhpunDziN87rD** fue confirmado **READY**, con `collectibles.uy` y `www.collectibles.uy` asociados.

El build de la versión combinada pasó. Las pruebas dirigidas de imágenes y catálogo pasaron **43 casos en cinco suites**; la comprobación combinada con los cambios de producción pasó **72 casos en siete suites**. Se verificaron selección principal, orden estable, variantes externas, fallback, prioridades de carga, originales compactos y recuperación acotada del catálogo. No se ejecutó la suite completa de pruebas que contactan servicios reales.

El grafo inicial público contiene 26 módulos y 957.661 bytes decodificados, sin módulos de rutas privadas. La estimación Brotli es 233.923 bytes; no se presenta como transferencia real medida. El escaneo anterior de 158 archivos públicos no encontró la clave de servicio local.

Comprobaciones secuenciales del dominio oficial a las 15:44 UTC, sin cache busting:

| Ruta | HTTP | Tiempo de la solicitud |
|---|---:|---:|
| `/` | 200 | 1.081 ms |
| `/shop` | 200 | 479 ms |
| Catálogo, 15 productos | 200 | 3.640 ms |
| Búsqueda `pokemon`, 15 productos | 200 | 971 ms |

Ambas respuestas del catálogo indicaron snapshot `fresh`; se devolvieron 1.205 productos totales y 127 coincidencias de búsqueda. El primer intento dentro del entorno local restringido no tuvo acceso a la red; se repitió cada probe una vez con acceso y los cuatro respondieron correctamente. Esos fallos locales no se contabilizan como caída pública.

En el navegador real, con viewport de 600 × 764 px, las **15 imágenes de tarjetas renderizadas** estaban cargadas, con variantes publicadas y `srcset`, sin imágenes rotas. Cuatro usaban carga inmediata y once carga diferida. Se excluyeron los elementos de la cuadrícula alternativa oculta. También se había comprobado la ficha y tarjeta reales del producto Cars, con una variante importada desde MercadoLibre. La imagen de Amazon se verificó en el registro y por acceso público; no se afirma que su tarjeta estuviera publicada en la tienda cuando la publicación internacional estaba desactivada.

Los archivos generados se decodificaron para comprobar dimensiones y transparencia. Se verificaron por HTTP el peso y la caché de cada tarjeta y de cada nueva copia original externa; en las primeras tandas se verificaron todas las variantes. Las copias idénticas reutilizadas apuntan a variantes ya verificadas. No se inspeccionaron visualmente las 2.596 fotografías.

## Estado de Supabase y límites de la conclusión

Muestra SQL final: **15:44:28 UTC**. PostgreSQL llevaba 36.957 segundos en funcionamiento y tenía **23/60 conexiones (38,3%)**, cero consultas de más de 30 segundos, cero esperas por bloqueo y cero transacciones abandonadas. Tamaño de base: 247.221.395 bytes. Objetos de Storage: 759.854.440 bytes. El registro de imágenes contiene 2.590 filas y 1.018 asociaciones externas.

No hubo nuevos `job startup timeout` desde las 05:31 UTC; el último registrado seguía siendo el de las 05:29, durante la recuperación anterior. Los trabajos de la última hora figuraban como `succeeded`; esto confirma el despacho SQL, no el resultado HTTP de sus workers. No se ejecutaron workers para probarlos.

Durante el trabajo hubo errores que impiden afirmar que el bloqueo recurrente original esté resuelto:

- Eventos `Upstream TimeoutError` del catálogo a las 14:12:49, 14:23:11 y 14:40:13 UTC, y tres cancelaciones `SELECT` SQLSTATE 57014 en esa ventana.
- Un evento HTTP 5xx en la ficha `/producto/mercadolibre-MLU479513854` a las 14:24:07 UTC; no se estableció su código numérico concreto.
- Fallo de la comprobación de salud alrededor de las 14:58 UTC: el importador se detuvo y continuó después de verificar la recuperación. Los logs posteriores mostraron cuatro eventos del catálogo con clase SQL 57014 a las 14:58:08, 14:58:10, 14:58:32 y 14:58:33; son eventos de log, no necesariamente cuatro solicitudes distintas. En la consulta final de logs, de 14:55:35 a 15:45:35 UTC, no aparecieron eventos `Upstream` posteriores a esos cuatro.
- Hay un intervalo sin observación HTTP entre aproximadamente las 06:52 y las 14:07 UTC por una pausa en la ejecución local. No se confirmó suspensión del sistema operativo. La retención de logs disponible no permite reconstruir toda esa franja.

No se hicieron pruebas de carga ni se observó un pico controlado. La optimización reduce los bytes servidos y el trabajo repetido de imágenes; el fallback protege ante algunos fallos breves. Ninguna de esas medidas demuestra por sí sola la causa raíz del atasco de PostgreSQL. El monitoreo de 48 horas continúa hasta el 17 de octubre a las 02:30 UTC.

## Advertencia pendiente: cuota gratuita de la organización

En la página autenticada de uso de Supabase, observada a las **15:18 UTC**, la organización mostraba **5,27 GB de tráfico cacheado sobre 5 GB incluidos**, en plan Free, y una advertencia de exceso de cuota. El tráfico no cacheado figuraba en 2,00/5 GB. Estos valores corresponden a toda la organización, se actualizan por hora y no se atribuyeron exclusivamente a Collectibles.

La cifra de Storage de 0,37/1 GB mostrada en facturación era un promedio del período, no el tamaño físico actual. Los logs ingeridos mostraban 1,38/1 GB, pero la propia interfaz indicaba un período de gracia hasta comienzos de 2027; no se presenta ese exceso como causa de restricciones actuales.

La cuota de tráfico ya consumida no se recupera comprimiendo imágenes después: la optimización reduce el consumo futuro. No había una medición del tráfico cacheado anterior a esta migración, por lo que no se puede atribuir todo el exceso a esta tarea ni afirmar que ya existiera; las descargas y verificaciones también consumen tráfico. Supabase documenta cuotas separadas para tráfico cacheado y no cacheado, y posibles restricciones tras exceder los límites gratuitos: [gestión de egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress) y [preguntas de facturación](https://supabase.com/docs/guides/platform/billing-faq).

**La cuota requiere una decisión sobre el plan o esperar su renovación, según las condiciones que muestre la cuenta.** No se contrató un plan, no se modificó capacidad ni parámetros de PostgreSQL y no se reinició nuevamente la base. La advertencia es real, pero no demuestra que haya causado los errores 57014 o los timeouts observados. No hay evidencia suficiente para exigir una migración a otra base de datos como solución a la lentitud de estas imágenes.

Los valores estructurados, la prueba de despliegue, los probes y los límites están en `RESULTADOS_CATALOGO_COMPLETO_2026-10-15_EVIDENCIA.json`. Los diarios operativos permanecen locales y excluidos de Git, sin secretos.

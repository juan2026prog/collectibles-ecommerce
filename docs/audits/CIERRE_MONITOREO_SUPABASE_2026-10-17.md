# Cierre del seguimiento de Supabase — Collectibles

**Resultado: no se demostró estabilidad durante 48 horas.** Hubo una recuperación después del reinicio autorizado y una nueva recaída. La causa del bloqueo global sigue sin confirmarse. El cierre del seguimiento no equivale a resolver la incidencia.

Ventana prevista: **15/10/2026 22:30:33 a 17/10/2026 22:30:33 UTC**, desde el despliegue `966e1a34542db4a9aa9cc9f40e799689c10dedbf`. Proyecto: `cobtsgkwcftvexaarwmo`.

La automatización **Estabilidad de Collectibles · 48 horas** quedó **PAUSADA el 18/10 a las 00:54:59 UTC** —17/10 a las 21:54:59 de Uruguay—, aproximadamente 2 horas y 24 minutos después del límite. El cierre se procesó tarde tras una interrupción de ejecución cuya causa no se estableció. Se conservaron su nombre, instrucciones, horario y chat de destino. No se tomaron nuevas muestras del servicio al retomar después del plazo.

## Observaciones comprobadas

| Momento UTC | Evidencia y alcance |
| --- | --- |
| 15/10 22:31 | La ventana comenzó con una incidencia abierta: catálogo y búsqueda devolvían 503, también al repetir cada ruta fallida una vez. |
| 15/10 22:44:56 | PostgreSQL arrancó después del reinicio expresamente autorizado. El muestreo privado volvió desde las 22:47; esto no fija por sí solo el instante de recuperación de todo el sitio. |
| 16/10 01:23, 07:13 y 12:29 | Tres muestras independientes ya descargadas de GitHub Actions registraron cuatro HTTP 200. Hay horarios sin evidencia descargada; no se presupone continuidad entre ejecuciones. |
| 16/10 02:34, 03:35, 04:35 y 12:36 | Cuatro muestras locales registraron cuatro HTTP 200. Los snapshots SQL correspondientes mostraron 22–25 backends en `pg_stat_activity`, incluidos procesos de fondo, sin bloqueos ni transacciones abandonadas o consultas largas en esos instantes. El límite configurado de 60 corresponde a conexiones cliente; esos conteos de backends no representan su ocupación efectiva. |
| 16/10 02:26 | Un timeout de lectura SEO esencial de Charmander quedó registrado entre muestras. Su comprobación posterior de las 02:39 respondió 200. Los timeouts opcionales de relacionados se distinguieron de fallos del contenido esencial. |
| 16/10 13:13 | Primer timeout SEO esencial devuelto por los registros de la nueva recaída. Es la primera evidencia obtenida de ese episodio, no una prueba de su comienzo exacto. |
| 16/10 13:35–17:52 | Cinco muestras locales volvieron a confirmar 503 en catálogo y búsqueda, con un único reintento por ruta fallida. Los intentos SQL de las 13:34–16:37 fallaron por plazo de conexión; la API de métricas tampoco respondió. No se obtuvo una recuperación posterior en la evidencia revisada. |

En total quedaron **10 conjuntos de comprobaciones HTTP locales posteriores al despliegue**: cuatro con las cuatro rutas en 200 y seis con ambas rutas de catálogo en 503 confirmado. Son muestras puntuales; **no constituyen un porcentaje de disponibilidad**. Los 200 de `/` y `/shop` procedentes de caché no demuestran acceso a PostgreSQL ni funcionamiento del catálogo.

La última comprobación HTTP directa se tomó el **16/10 a las 17:52:02 UTC**. El último snapshot de actividad válido fue el **16/10 a las 12:36:07 UTC**, con 25 backends observados. Una consulta SQL posterior del historial privado respondió correctamente a las **12:37:03 UTC**. El estado actual del servicio al redactar este cierre **no fue comprobado**.

## Evidencia entre muestras y límites

El historial privado consultado conservó 97 muestras regulares cada cinco minutos entre el 16/10 a las 04:37 y las 12:37: sin huecos en ese tramo, sin bloqueos ni consultas largas, con 13–21 conexiones de clientes reales y 21–29 backends totales. Una transacción de un segundo no constituyó un bloqueo persistente. Ninguna muestra de ese tramo alcanzó el 80 % de conexiones. Estos datos no describen el período posterior de indisponibilidad SQL.

Los cuatro `job startup timeout` de las 22:29–22:30 del 15/10 ya estaban documentados. No se obtuvieron nuevos en los períodos legibles posteriores; con SQL inaccesible no puede afirmarse su ausencia. Los 501 despachos cron SQL exitosos del tramo consultado confirman despacho, no el resultado comercial de los workers. Cero registros Edge devueltos en ciertas consultas tampoco demuestra cero invocaciones.

En la última ventana de Vercel revisada, **16/10 16:52–17:51 UTC**, se devolvieron 41 registros HTTP 503, 37 timeouts SEO esenciales y cuatro errores de catálogo. Son conteos devueltos por las consultas, no totales exhaustivos ni usuarios distintos. Pertenecen al mismo episodio ya alertado.

Las métricas físicas válidas anteriores registraron actividad de swap y disco mientras SQL todavía respondía. Durante la recaída las lecturas fallaron: **no hay medición válida de CPU, RAM o IOPS del bloqueo que demuestre su causa**. El campo de intervalo `delta.available` de una muestra fallida no se interpreta como disponibilidad de métricas.

La solicitud SQL de la última muestra, iniciada el 16/10 a las 17:51, devolvió un **timeout del transporte MCP de 300 segundos**. No se lo reclasificó como respuesta de PostgreSQL ni como prueba de saturación de conexiones. No se repitió ese intento ni la lectura de recursos antes de la interrupción; al retomar después del límite se cerró el seguimiento sin nuevas consultas. Las observaciones originales y su procesamiento tardío tienen fechas separadas en los archivos.

Existe un **hueco de observación local de aproximadamente 28 horas y 38 minutos** entre la última muestra HTTP y el final previsto. No se recuperaron registros privados ni ejecuciones de Actions de ese tramo al cerrar. El hueco no demuestra caída ni recuperación. Tampoco hubo evidencia de carga pico que permita afirmar estabilidad bajo picos.

## Trabajo cerrado y cuestión pendiente

Las correcciones de código y el despliegue previo permanecen documentados en el [informe P0](ESTABILIZACION_P0_SUPABASE_2026-10-15.md). **No evitaron la recaída observada.** Para resolver la causa falta correlacionar el inicio del episodio con evidencia de infraestructura de Supabase: aceptación de conexiones, pooler, recursos del host e interrupción de telemetría. El borrador de soporte quedó guardado; no fue enviado.

Durante este cierre no se reinició Supabase ni se modificaron aplicación, base, capacidad, parámetros o cron. No se ejecutaron workers, compras, proveedores, pruebas de carga, commits ni despliegues. Solo se pausó esta automatización de seguimiento; la captura privada y el workflow de GitHub son mecanismos separados.

Evidencia conservada en [el registro JSONL](monitoring/collectibles-stability-2026-10.jsonl), [la última muestra HTTP](monitoring/stability-2026-10-16T1751Z.json), [el registro SQL tardío](monitoring/database-attempts-2026-10-16T1751Z.json), [los registros externos](monitoring/external-2026-10-16T1751Z.json) y [el cierre estructurado](monitoring/closure-2026-10-17.json).

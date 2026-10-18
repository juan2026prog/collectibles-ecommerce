# Estabilización P0 de PostgreSQL / Supabase — Collectibles

Fecha de intervención: 15 de octubre de 2026. Proyecto Supabase: `cobtsgkwcftvexaarwmo`. Sitio: [Collectibles](https://collectibles.uy). Horas de Uruguay: America/Montevideo, UTC−3.

**Seguimiento cerrado; automatización pausada el 18/10 a las 00:54:59 UTC.** No se demostró estabilidad durante 48 horas. La última comprobación HTTP es del 16/10 a las 17:52 UTC y confirmó nuevamente 503 en catálogo y búsqueda. El resto de la ventana carece de verificación local; el estado actual no se comprobó al cierre. Ver [informe de cierre, fechas y límites](CIERRE_MONITOREO_SUPABASE_2026-10-17.md). Las actualizaciones siguientes se conservan como evidencia histórica.

Precisión de los conteos históricos: `count(*) FROM pg_stat_activity` incluye backends de fondo; no debe interpretarse como ocupación de conexiones cliente al compararlo con `max_connections = 60`. El cierre distingue ambos conteos y separa el último snapshot de actividad de la última consulta SQL correcta del historial.

**Actualización 16/10 13:40 UTC / 10:40 de Uruguay: nueva recaída confirmada; incidencia abierta.** Catálogo y búsqueda devuelven 503 también al repetirlos; SQL agotó el plazo de conexión en dos intentos y la API de métricas tampoco respondió. Las optimizaciones publicadas no evitaron esta recaída. La recuperación anterior y las muestras saludables posteriores al reinicio se conservan como evidencia histórica, pero la estabilización definitiva no está lograda. No se realizó otro reinicio ni se modificó aplicación, base o capacidad durante el monitoreo.

## Dictamen y alcance real

Se demostraron defectos de cancelación, repetición de lecturas, concurrencia y contabilidad de intentos que agregan trabajo evitable durante una degradación. Se publicaron correcciones acotadas y se instaló captura privada de PostgreSQL para conservar evidencia entre observaciones y reinicios. Se obtuvo acceso a recursos físicos mediante la API oficial de métricas durante un intervalo sano; sus dos lecturas de las 22:29 UTC agotaron 15 segundos cada una durante la nueva incidencia. Las métricas históricas del inicio original siguen sin recuperarse.

**El desencadenante del bloqueo global del 14 de octubre y de la recaída previa al reinicio del 15 sigue sin causalidad confirmada.** No se dispone de CPU, memoria, swap, IO y ocupación del pool correspondientes al inicio de esos incidentes. Una corrección de código demostrada no debe presentarse como prueba de que ese defecto provocó toda la caída.

La observación de recursos de esta noche detecta actividad de swap y disco que merece correlación futura, pero no demuestra falta de RAM ni saturación de CPU. No se contrató capacidad, no se migró de proveedor y no se aumentaron conexiones o parámetros globales para sostener una hipótesis.

Esta intervención no repite la optimización de imágenes ya publicada ni desarrolla funcionalidades multipaís. No se invocaron importadores, campañas, compras ni acciones de proveedores para probar los parches. Las pruebas de workers utilizan fuentes simuladas; verificar sus resultados comerciales reales requiere observación de ejecuciones autorizadas existentes.

## Hechos, hipótesis y medidas

| Hallazgo | Clasificación y evidencia | Medida y límite |
| --- | --- | --- |
| Falló el acceso a PostgreSQL desde distintos servicios, incluso con instrucciones de inicialización y conexiones locales | Incidente demostrado en los registros del 14: REST, Auth, PostgREST, PgBouncer y cron | Reducir amplificadores y conservar diagnóstico futuro. No atribuir el primer fallo a una consulta particular sin correlación |
| Una promesa de timeout puede devolver control mientras siguen vivas peticiones hermanas | Defecto de código reproducido mediante pruebas de cancelación y rechazo temprano | Señal instalada antes de lanzar las consultas; cancelación de hermanas y pendientes; presupuesto compartido por petición |
| Solicitudes SEO coincidentes repetían la misma lectura | Patrón demostrable del código; no es una cuantificación de todo el tráfico Node | Compartir exclusivamente operaciones idénticas en curso. Volver a consultar precio/publicación al finalizar la anterior |
| Fan-out y cola pública sin una cota común podían amplificar solicitudes | Factor de carga demostrado en la ruta pública | Tres lecturas HTTP activas y 24 pendientes por instancia; rechazo controlado al saturarse. No es un límite distribuido de PostgreSQL |
| Facetas repetían recorridos de productos por cada taxonomía | Complejidad innecesaria identificada en código | Jerarquías y relaciones precalculadas, conteos mediante mapas y recorridos acotados, conservando la semántica de filtros |
| El importador podía hacer un cuarto fetch fuera del backoff y duplicar el incremento de `attempts` ya realizado al reclamar | Defectos del código comparado con la versión desplegada; pruebas simuladas de contabilidad | Reintentos de lectura acotados, lotes de dos, presupuesto de trabajo y devolución condicional de trabajo no iniciado |
| Reclamos concurrentes de sincronización podían competir por la misma fila | Patrón de concurrencia reproducido en pruebas | Reclamo condicionado a estado/propietario/contador; una escritura por reclamo ganador; ninguna repetición automática de escrituras inciertas |
| `pg_stat_statements` tiene una consulta de snapshot más costosa que el resto del catálogo público | Medición acumulada posterior al reinicio: 291 ms de media y 2.027 ms de máximo observado | Reducir trabajo evitable y abortar snapshots inválidos. Los joins medidos ya usan índices; no agregar índices sin evidencia |
| CPU, IOwait, swap y disco tienen datos actuales disponibles | API oficial, intervalo de 139,315 s el 15 por la noche | Conservar deltas comparables. No reconstruyen el incidente del 14 ni identifican qué proceso causó cada IO |
| Uso de Cached Egress Free superior a la cuota en la observación anterior | 5,27 GB sobre 5 GB de la organización, observado durante la tarea previa | Reducir transferencias futuras. No es evidencia automática de saturación de PostgreSQL ni una autorización para cambiar el plan |
| JSON-LD permitía cerrar el bloque script con contenido de un producto | Vulnerabilidad reproducida en el handler real con datos simulados | Escapar caracteres de cierre HTML al serializar JSON-LD; conservar el nombre original al decodificar JSON |
| Los aliases estáticos podían resolver propiedades heredadas como `constructor` | Bug reproducido con lecturas vacías y resultado de tipo función | Exigir propiedad propia y cadena válida; solicitudes desconocidas conservan 404 |

## Línea temporal y evidencia anterior

La auditoría del 14 se conserva en [AUDITORIA_PROFUNDA_SUPABASE_2026-10-14.md](C:/Projects/Collectibles2026/docs/audits/AUDITORIA_PROFUNDA_SUPABASE_2026-10-14.md). Su ventana REST comparable fue 12:00–21:00 UTC, equivalente a 09:00–18:00 de Uruguay.

| Fecha/hora UTC | Uruguay | Evidencia e interpretación |
| --- | --- | --- |
| 14/10 13:54:09 | 14/10 10:54:09 | Primer 504 REST observado en aquella ventana |
| 14/10 13:54:20,758 | 14/10 10:54:20,758 | Primer `statement timeout` PostgreSQL observado: monitor interno `postgres_exporter` consultando actividad. No es evidencia de que una consulta de categorías iniciara el incidente |
| 14/10 13:55 aprox. | 14/10 10:55 aprox. | Comienzan fallos de apertura de cron en el historial retenido |
| 14/10 14:01:44 | 14/10 11:01:44 | Primer 522 REST observado |
| 14/10 14:29:02 | 14/10 11:29:02 | Timeout fatal de autenticación; el alcance excedía el catálogo |
| 14/10 19:12:57–19:19:04 | 14/10 16:12:57–16:19:04 | Reinicializaciones de PostgREST coinciden con recuperación general; no establecen por sí solas el desencadenante |
| 15/10 05:28:31,692 | 15/10 02:28:31,692 | Arranque de PostgreSQL observado tras el reinicio autorizado previo. Durante el cierre P0 el usuario autorizó un nuevo reinicio, documentado en la actualización posterior |
| 15/10 05:29:00,512 | 15/10 02:29:00,512 | Último `job startup timeout` encontrado en la consulta forense actual; no se encontraron posteriores hasta las 22:00 UTC |
| 15/10 14:12, 14:23 y 14:40 aprox. | 15/10 11:12, 11:23 y 11:40 aprox. | Timeouts de catálogo/cancelaciones posteriores ya auditados. No se suman como incidencias nuevas ni se confunden con el bloqueo global del día anterior |
| 15/10 21:58–22:01 | 15/10 18:58–19:01 | Forense actual de estadísticas, actividad, locks, índices, RLS y cron; sin bloqueos vivos en esas fotografías |
| 15/10 22:11:30,737–22:13:50,052 | 15/10 19:11:30,737–19:13:50,052 | Dos observaciones oficiales de recursos; intervalo de 139,315 s, detallado abajo |
| 15/10 22:12 | 15/10 19:12 | Captura programada privada real: aproximadamente 88,764 ms, muestra de 3.437 bytes y sin locks observados |
| 15/10 22:28:36 y 22:28:41 | 15/10 19:28:36 y 19:28:41 | Edge Functions ML import v12 y ML sync v114 publicadas, ACTIVE y fuentes verificadas |
| 15/10 22:29:07–22:29:19 | 15/10 19:29:07–19:29:19 | Monitor externo: dos rutas de catálogo 503, ambas confirmadas con una repetición; web anterior todavía activa |
| 15/10 22:30:33,040 | 15/10 19:30:33,040 | Vercel READY y aliases oficiales sobre 966e1a3; comienzo de seguimiento posterior, con incidencia abierta |
| 15/10 22:31:23–22:31:26 | 15/10 19:31:23–19:31:26 | Probe local: inicio/tienda 200; catálogo/búsqueda 503 confirmados. SQL administrativo también agotó conexión |

En la ventana del 14 hubo **713 respuestas 5xx entre 2.580 solicitudes REST: 27,64 %**. El desglose fue 233 HTTP 504, 454 HTTP 522, nueve HTTP 524, quince HTTP 503 y dos HTTP 500. PgBouncer registró 152 mensajes de timeout de conexión y seis `query_wait_timeout`. Cron registró 109 `job startup timeout` en siete trabajos. Son métricas de sus fuentes/ventanas respectivas; no representan clientes únicos ni deben sumarse entre sí como una sola cifra de incidentes.

Los `57014` del 14 incluyeron 53 statement timeouts, 16 cancelaciones a petición del cliente y dos fallos fatales de autenticación; también se observaron 23 errores `22P02`. El reinicio recuperó funcionamiento, pero libera varios estados distintos a la vez y no identifica qué recurso falló primero.

## Recursos medidos mediante la API oficial

Fuente: Supabase Metrics API del proyecto. Intervalo entre muestras: **2026-10-15 22:11:30,737 y 22:13:50,052 UTC**, o **19:11:30,737–19:13:50,052 en Uruguay**. Duración: **139,315 segundos**. Las tasas provienen de diferencias de contadores; RAM y swap usado corresponden a la fotografía final.

| Recurso | Resultado observado | Qué permite afirmar |
| --- | ---: | --- |
| CPU ocupada, excluyendo idle e IOwait | 1,58 % | No hubo saturación de CPU demostrada durante este intervalo |
| IOwait | 5,64 % | Existió espera de IO medida en el intervalo; no identifica una consulta responsable |
| RAM total reportada | 431.308.800 bytes | Memoria reportada por el exportador, no tamaño de la base |
| RAM disponible reportada | 238.727.168 bytes | No demuestra agotamiento de memoria en esta muestra |
| Swap usado reportado | 454.586.368 bytes | Hay páginas en swap; el volumen por sí solo no establece presión actual ni causa raíz |
| Entrada a swap | 306,313 páginas/s | Actividad real del intervalo; no convertir a bytes sin confirmar tamaño de página ni atribuirla automáticamente a PostgreSQL |
| Salida a swap | 281,291 páginas/s | Misma limitación; requiere correlación temporal con latencias y procesos |
| Lecturas de dispositivo `nvme1n1` | 375,559 IOPS | Contador de dispositivo, no IOPS exclusivos de consultas SQL |
| Escrituras de dispositivo `nvme1n1` | 142,167 IOPS | No identifica el consumidor de las escrituras |
| Latencia media de lectura del dispositivo | 1,371 ms | Media derivada de tiempo acumulado/operaciones del intervalo; no p95 ni duración SQL |
| Latencia media de escritura del dispositivo | 2,028 ms | Misma limitación |
| Clientes esperando en pool observado / espera máxima reportada | 0 / 0 s | No se observó cola del pool en esa fotografía; no descarta colas entre muestras o durante el incidente anterior |

Estas mediciones **no corresponden al historial del bloqueo del 14**. La actividad de swap/disco es una hipótesis de investigación para correlacionar si reaparecen fallos, no prueba suficiente para diagnosticar falta de RAM, sobrecarga del disco o insuficiencia del plan Free. Tampoco existe una prueba de pico de tráfico en este intervalo.

El recolector nuevo guarda únicamente valores numéricos permitidos, modo de CPU y dispositivo. Excluye etiquetas ajenas, cuerpos de errores y credenciales. La autenticación usa una credencial existente del entorno local; no se copiaron claves a GitHub ni se creó una suscripción externa. La [API oficial de métricas de Supabase](https://supabase.com/docs/guides/observability/metrics/vendor-agnostic) permite preparar un colector seguro continuo, pero ese servicio externo no queda contratado ni configurado por este documento.

## Consultas, RLS, índices y mantenimiento

La captura de `pg_stat_statements` posterior al reinicio comenzó a las **05:28:31,335 UTC del 15**. Su configuración observada fue `track=top`, con máximo de 5.000 formas y cero desalojos al tomar la muestra inicial. PostgreSQL era 17.6.

| Forma identificada sin texto SQL | Llamadas | Total de ejecución | Media | Máximo completado observado | Lecturas compartidas |
| --- | ---: | ---: | ---: | ---: | --- |
| Snapshot público de productos/categorías/grupos, hash `8111359320777249542`, rol público | 310 | 90.292,45 ms | 291,266 ms | 2.026,803 ms | 2.121.010 hits y 672 bloques leídos |
| UPSERT del registro de variantes, hash `-1059430891815546995` | 2.562 | 71.902,00 ms | 28,065 ms | 1.295,170 ms | 34.478 hits y tres bloques leídos |
| Lectura de variantes utilizada durante la migración, hash `-4601721446587133855` | 1.118 | 45.779,07 ms | 40,947 ms | 3.900,163 ms | 458.021 hits y cero bloques leídos |

Las dos últimas formas están dominadas por el trabajo de imágenes ya terminado. No se interpreta ese volumen de una migración puntual como demanda habitual de producción. Los tiempos son de ejecución acumulada de sentencias, no consumo medido de CPU. `rows` significa filas devueltas o modificadas, no filas examinadas.

Un `EXPLAIN` sin `ANALYZE`, dentro de una transacción de solo lectura con rol anónimo y posterior rollback, examinó una forma equivalente al snapshot con joins laterales. Usó `products_pkey`, el índice único compuesto de categorías y el índice de producto de grupos, seguido de un subplan de acceso a grupos sujeto a RLS. Su coste estimado para 1.000 filas fue 8.156,45 unidades del planificador; **no son milisegundos ni una medición de ejecución**. No se ejecutó una prueba de carga ni `EXPLAIN ANALYZE` sobre esa operación.

No se agregó un índice por esta investigación: los joins calientes ya disponen de índices. Por ejemplo, la FK `products.suggested_brand_id` no tiene índice de prefijo completo, pero no participa de esa consulta medida y su existencia no demuestra un cuello de botella. Crear índices sobre cada aviso del asesor aumentaría almacenamiento y mantenimiento sin evidencia de beneficio.

Se encontraron cuatro políticas SELECT públicas equivalentes en `product_categories`. El plan simplifica su condición constante; quitar duplicados no aporta una mejora de ejecución demostrada. `product_groups_select` conserva llamadas a `auth.uid()` sin initplan y `is_admin()` figura como VOLATILE/SECURITY DEFINER. Son candidatos a una intervención separada con pruebas de permisos y rendimiento; no se desactivó RLS ni se fusionaron políticas a ciegas. La nueva telemetría utiliza exclusivamente su tabla privada y sus propios permisos.

Las tablas grandes consultadas en metadatos incluyen aproximadamente 98,3 MB de tabla de auditoría y 24,6 MB totales de productos e índices. Varias tablas sin modificaciones recientes muestran estimaciones de filas vivas cero después del reinicio, mientras las estimaciones del planificador registran 1.571 productos y 1.609 relaciones de categorías. Esos ceros no significan que las tablas estén vacías. No se midió bloat físico ni se ejecutó VACUUM FULL, inspección de páginas o barrido completo para estimarlo.

Al tomar la fotografía actual no había clientes ajenos activos, bloqueos de espera ni transacciones abandonadas. Había cero deadlocks y cero archivos/bytes temporales registrados. `track_io_timing=off` y `track_wal_io_timing=off`: los tiempos cero de esas vistas no demuestran ausencia de IO. El tiempo acumulado de escritura de checkpoints incluye su avance espaciado; no se presenta como latencia física del disco.

La [documentación de PostgreSQL sobre `pg_stat_statements`](https://www.postgresql.org/docs/17/pgstatstatements.html) distingue estadísticas de ejecución completada y planificación. Una cancelación durante la ejecución puede no incrementar las llamadas completadas: un máximo observado inferior a tres segundos no descarta los `57014` de consultas canceladas. `track=top` tampoco muestra el SQL interno de cada RPC. Para el próximo incidente se compararán muestras con el mismo arranque y reset de estadísticas; no se resetean contadores para fabricar un antes/después.

## Cambios publicados y control de publicación

### Lecturas públicas y SEO

Archivos principales: `api/_lib/public-supabase.js`, `api/_lib/seo-product-repository.js`, `api/seo-prerender.js`, `api/_lib/seo-sitemap-repository.js` y `api/sitemap.js`.

Se instala la señal de cancelación antes de iniciar consultas agrupadas y se abortan las hermanas si una fuente esencial falla. El contexto SEO comparte un presupuesto de ocho segundos; cada lectura tiene su plazo propio. El transporte público tiene un límite de ocho segundos entre intentos y sólo permite reintentos de lecturas seguras: no se repiten escrituras ni RPCs arbitrarias. El gate admite como máximo tres solicitudes activas y 24 esperando por instancia.

El repositorio de producto comparte lecturas idénticas únicamente mientras están en curso. No agrega un TTL al precio ni conserva resultados negativos. UUID, publicación y actividad se validan antes de solicitar relaciones. Un precio ausente o inválido no se transforma en cero. Una falla esencial devuelve 503 sin caché; recomendaciones editoriales pueden omitirse con diagnóstico seguro. Los aliases estáticos sólo producen redirecciones y deben ser propiedades propias con valor de cadena válido.

El HTML exitoso distingue navegador/crawler y no se comparte en una caché CDN que sólo varía por URL. Los JSON-LD escapan el carácter que permite cerrar un script y conservan el contenido original al decodificar JSON. Los fallos registran etapa y clase controladas; no mensajes completos del proveedor, filtros o datos privados. El sitemap no publica como éxito un resultado parcial si falla una página posterior.

### Catálogo y facetas

Archivos principales: `api/_lib/public-catalog.js` y `api/_lib/public-catalog-handler.js`.

La preparación precalcula relaciones y jerarquías, y las facetas usan mapas de conteo en lugar de recorrer todos los productos por cada opción. Se conservan descendientes, deduplicación, búsqueda, filtros y orden. La instantánea mantiene la cola acotada de lecturas y cancela tanto las activas como las pendientes ante el primer fallo; una descarga parcial nunca reemplaza datos completos.

La recuperación mediante snapshot conserva el límite anterior: 60 segundos de frescura y uso acotado hasta 180 segundos desde la última carga correcta. Un fallo no renueva esa fecha; las tarjetas se hidratan con lecturas actuales y la respuesta de respaldo no se cachea. Instancias frías o sin un snapshot válido siguen fallando con 503; no se presentan como catálogos vacíos correctos.

### Workers y compatibilidad con producción

Archivos principales: `supabase/functions/_shared/workerGuard.ts`, `workerBatch.ts`, `workerReadBackoff.ts`, `mlImportClaims.ts`, `supabase/functions/ml-import-worker/index.ts` y `supabase/functions/mercadolibre-sync/`.

El importador se comparó contra la fuente desplegada v11. El reclamo SQL ya incrementa `attempts`; el código deja de volver a contarlo. Sólo los elementos no iniciados o cancelados antes de comenzar escrituras vuelven a pendientes recuperando el intento, condicionados a propietario, estado y contador. Se procesan grupos asentados de dos y se respeta el presupuesto cooperativo de 45 segundos. El backoff de lectura permite como máximo tres intentos; no existe un cuarto fetch sin límite al salir del bucle.

`mercadolibre-sync` v113 difería comercialmente del archivo antiguo del repositorio. La base elegida es la fuente realmente desplegada, con un parche limitado y una prueba de integridad SHA-256 que reconstruye esa base. Se conserva su helper de autenticación mediante `auth-v113.ts`; no se impuso un helper local divergente ni se trasladaron cambios comerciales de otras ramas. Los reclamos condicionales evitan que dos contendientes realicen la misma escritura de cola. Una escritura externa con resultado incierto permanece como intento consumido/fallido y no se reintenta automáticamente bajo la suposición de que no ocurrió.

**Publicación Edge confirmada:** ML import v11 → v12 y ML sync v113 → v114, ambas ACTIVE. Se recuperó la fuente remota después de publicar y todos los archivos coinciden exactamente con los bundles revisados. Se preservó `verify_jwt=false`, la autenticación personalizada y las reglas comerciales de la versión remota anterior. El push a Vercel no despliega Edge Functions de Supabase: se ejecutaron ambas publicaciones por separado. El importador no se invocó para esta validación y su tarea previamente inactiva no se activó como prueba. Los respaldos exactos de v11/v113 están en `C:/Projects/Collectibles2026/frontend/node_modules/.cache/p0-worker-backups`.

### Instrumentación privada aplicada

Migración remota/local alineada: **`20261015220907_collect_private_database_health_telemetry.sql`**.

La tabla `collectibles_internal.database_health_samples` es privada, tiene RLS sin políticas y no concede acceso a PUBLIC, `anon`, `authenticated` ni `service_role`. La función `capture_database_health_sample()` es SECURITY INVOKER, pertenece a `postgres`, tiene `search_path` vacío y tampoco concede ejecución a esos roles. Se verificaron los permisos reales después de aplicar; no se creó una RPC pública.

Cron captura en minutos `2-57/5`: conexiones físicas y estados, esperas, transacciones largas o abandonadas, locks, arranque, tamaño de base, contadores IO/WAL/checkpoints y diez hashes de consultas. `pg_stat_statements(false)` evita obtener su texto. No guarda nombres de usuarios, PID, IP, identificadores de clientes, parámetros, credenciales ni filas comerciales. Usa advisory lock no bloqueante, lock timeout de 250 ms en la función y statement timeout de tres segundos en su propia conexión cron, sin modificar GUCs globales.

Retiene aproximadamente 14 días. Cada ejecución puede borrar como máximo 300 muestras vencidas de esa tabla, usando el índice de fecha y `SKIP LOCKED`. No elimina historial comercial ni toca políticas de tablas existentes. La captura manual inicial midió aproximadamente **51,304 ms**; la ejecución real de las **22:12 UTC / 19:12 de Uruguay**, aproximadamente **88,764 ms** y **3.437 bytes** por muestra. Son muestras puntuales de coste, no un máximo garantizado bajo incidencia.

Consultas operativas: `scripts/database_stability_snapshot.sql` y `scripts/database_health_history.sql`. Incluyen huecos de observación, cambios de arranque y deltas comparables entre hashes presentes en ambas muestras, conservando los límites de reset y desalojos. Si cron no logra conectar tampoco puede escribir su muestra: un hueco requiere contraste externo.

### Observación independiente publicada

`scripts/monitor_database_stability.mjs` y `.github/workflows/database-stability.yml` ejecutan cuatro GET secuenciales por hora desde GitHub Actions, sin cache busting ni invocaciones de workers/proveedores. Sólo se repite una vez cada probe fallido y se conservan las dos observaciones; un fallo confirmado falla el workflow. El artifact sanitizado tiene retención de 14 días. No usa secretos ni envía mensajes por conectores; las notificaciones son las nativas de GitHub según las preferencias de la cuenta. Primera ejecución real [38817388999](https://github.com/juan2026prog/collectibles-ecommerce/actions/runs/38817388999): terminó en fallo por los 503 reales y guardó correctamente el artifact. El fallo no se ocultó ni se repitió el workflow para buscar un resultado verde.

El script de recursos `scripts/sample_database_resources.mjs` puede obtener dos muestras oficiales sin provocar tráfico artificial. La captura continua de recursos físicos desde un servicio externo seguro continúa pendiente; el workflow HTTP no recibe credenciales administrativas y no sustituye ese colector.

## Pruebas, publicación y antes/después

La migración pasó validación offline con pglast 7.20 y parser PostgreSQL 17.7: once sentencias, cuerpo PL/pgSQL y trece contratos estáticos de seguridad/límites. Después de aplicarse se verificaron permisos reales y una ejecución cron. Las pruebas de concurrencia/cancelación/precios/claims usan simulaciones controladas, sin generar compras ni acciones de proveedores.

| Verificación | Estado que debe cerrar el responsable |
| --- | --- |
| SHA web publicado | `966e1a34542db4a9aa9cc9f40e799689c10dedbf`; commit y `git push origin main` ejecutados |
| Build sobre la combinación exacta publicada | PASS: `npm run build`, compilación final 4,02 s; salida completa local conservada |
| Suites, pruebas finales y resultado | PASS: 74 pruebas en ocho archivos; cancelación, facetas, SEO, monitor, recursos, claims, intentos y escrituras inciertas |
| Deployment Vercel READY, SHA y aliases oficiales | `dpl_8qMBTjVpjPP1eMEJFbb97GaFeanM`, READY 22:30:33,040 UTC; SHA exacto; aliases `collectibles.uy`, `www.collectibles.uy`, `collectibles-ecommerce.vercel.app` |
| HTTP de inicio, tienda, catálogo y búsqueda; fecha/latencias/caché | 22:31 UTC: catálogo/búsqueda 503 confirmados. Recuperación comprobada 16/10 02:34 UTC: inicio 200/668 ms, tienda 200/75 ms, catálogo 200/2.981 ms y búsqueda 200/783 ms; ambos API MISS/fresh, 1.205 y 127 resultados, sin reintentos |
| Ficha real, 404 desconocido y redirección canónica | 02:36 UTC, agente Googlebot: Gizmo 200/1.842 ms, Zombie Iron Man 200/692 ms y Peter Parker 200/712 ms; canonical correcto, precio 3.990 UYU y condición nueva en JSON-LD. Desconocido 404/439 ms. Sitemaps índice/productos 200, XML y marcador de versión nuevo. La respuesta SPA normal no sirve para comprobar el 404 SEO |
| Versiones finales de Edge Functions y configuración preservada | ML import v12 y ML sync v114 ACTIVE; cada archivo remoto coincide exactamente con el bundle revisado. `verify_jwt=false` previo y autenticación personalizada preservados; sin invocaciones manuales |
| Primera ejecución real del workflow alojado | Run 38817388999: detectó y confirmó dos rutas 503, guardó artifact sanitizado; ejecución fallida esperada ante ese incidente |
| Inicio y fin UTC/Uruguay de 48 h posteriores al último despliegue | Del 15/10 22:30:33 al 17/10 22:30:33 UTC; 15/10 19:30:33 al 17/10 19:30:33 de Uruguay. Misma automatización actualizada, ACTIVE |
| Resultado observado de esa ventana, incidentes y huecos | En curso; empezó con incidencia y reinicio autorizado. Muestreo SQL recuperado desde 22:47, HTTP independiente correcto a las 01:23 y local a las 02:34. Nuevo timeout SEO aislado 02:26, recheck 200 a las 02:39. Hay huecos locales/Actions; no son 48 horas saludables |

No hay una ventana antes/después de tráfico equivalente con un pico observado. Por lo tanto, no se publica una mejora porcentual de disponibilidad ni un p95 nuevo de producción. El 27,64 % de 5xx del incidente anterior debe compararse con una ventana posterior explícita, denominadores y huecos, no con cuatro respuestas 200.

La observación anterior estaba programada hasta el 17/10 a las 02:30 UTC, equivalente al 16/10 a las 23:30 de Uruguay. Se amplió la misma automatización hasta el 17/10 a las 22:30:33 UTC para cubrir 48 horas desde la publicación P0. Su horario, nombre y chat de destino se conservaron. La ventana comienza con una incidencia abierta y su informe de cierre debe reflejar fallos, recuperaciones y huecos. La propuesta de seguimiento durante 14 días busca observar cron, tráfico habitual y picos existentes sin realizar pruebas de carga sobre producción; no se contrató un servicio ni se creó otra automatización por ese plazo.

## Rollback y límites operativos

- **Web:** conservar SHA/deployment previo y revertir el conjunto revisado mediante build, commit/push y comprobación del dominio. No restaurar parcialmente archivos que dependan de helpers nuevos.
- **Edge Functions:** restaurar fuente y configuración exactas de la versión remota respaldada; no publicar un archivo antiguo del repositorio si difiere de v113 en autenticación, clasificación, SKU, marcas o reglas comerciales. No invocar importaciones para comprobar un rollback.
- **Telemetría:** si fuera necesario detenerla, desprogramar únicamente `collectibles-database-health-sample` como administrador y conservar su tabla. No eliminar la evidencia sin exportación y revisión explícita. No afecta cron comerciales.
- **Métricas y contadores:** no resetear estadísticas ni reiniciar para mejorar una fotografía. Guardar estado antes de una intervención y distinguir falta de observación, error local de red, fallo de consulta y caída general.

Siguen pendientes la causa física o de estado que inició el bloqueo global, el historial de recursos del incidente original y una correlación suficiente entre recursos, hashes de consultas, respuestas de workers y errores HTTP. Una ejecución SQL cron correcta sólo demuestra despacho; un HTTP 200 de Edge no certifica por sí solo todo el resultado comercial del worker.

No se probó autenticación o creación de pedidos mediante credenciales de clientes ni se modificaron pedidos, pagos, stock, facturación o clientes. Esos flujos deben validarse con observación autorizada o un entorno seguro. El límite público por instancia puede multiplicarse cuando Vercel crea más instancias; no equivale a control global del pool. Cancelar HTTP reduce trabajo retenido, pero su efecto exacto sobre un backend PostgreSQL debe contrastarse con actividad y logs del servidor.

No está demostrada una necesidad de migrar a otra base ni que un cambio de plan elimine el desencadenante. La cuota de transferencia de Free y la capacidad de cómputo se evalúan por separado. Cualquier cambio de facturación, reinicio adicional o intervención de infraestructura de alto riesgo requiere autorización específica.

## Fuentes y evidencia segura

- Auditoría y evidencia del 14: `docs/audits/AUDITORIA_PROFUNDA_SUPABASE_2026-10-14.md` y `AUDITORIA_SUPABASE_2026-10-14_EVIDENCIA.json`.
- Observaciones e incidencias ya registradas: `docs/audits/monitoring/collectibles-stability-2026-10.jsonl`.
- Forense agregado actual: `frontend/node_modules/.cache/p0-stability/db-forensics.json`; sin texto SQL, literales, comandos de cron, credenciales o datos de clientes. Archivo ignorado, no destinado a commit.
- Recursos: `frontend/node_modules/.cache/p0-stability/resources-before.json` y `resources-after-interval.json`; valores numéricos y etiquetas permitidas. Archivos ignorados.
- Evidencia consolidada final: [ESTABILIZACION_P0_SUPABASE_2026-10-15_EVIDENCIA.json](C:/Projects/Collectibles2026/docs/audits/ESTABILIZACION_P0_SUPABASE_2026-10-15_EVIDENCIA.json), con HTTP, recursos válidos/fallidos, último snapshot accesible, release, versiones Edge y límites.
- Operación de la captura, semántica de 200/503 y límites: [DATABASE_STABILITY.md](C:/Projects/Collectibles2026/qa/image-catalog-release/docs/operations/DATABASE_STABILITY.md), publicado con la versión P0.
- Documentación primaria: [métricas de Supabase](https://supabase.com/docs/guides/observability/metrics/vendor-agnostic), [cancelación con AbortSignal](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal), [estadísticas PostgreSQL 17](https://www.postgresql.org/docs/17/monitoring-stats.html) y [`pg_stat_statements`](https://www.postgresql.org/docs/17/pgstatstatements.html).

## Incidente recurrente durante el cierre — 15/10, 22:29 UTC

**La validación final encontró una recaída real. Este apartado impide interpretar las capturas saludables anteriores o un deployment READY como prueba de estabilización concluida.** La captura aquí documentada no confirmó recuperación; las observaciones posteriores deben añadirse con su hora y fuente.

El monitor HTTP observó 503 de catálogo con el despliegue web anterior, antes de que estuviera disponible el nuevo. El nuevo despliegue también respondió 503. El conector SQL falló al abrir conexión y el endpoint oficial de métricas agotó su plazo. Es una repetición del patrón de indisponibilidad del acceso a datos, aunque todavía no se obtuvo el recurso desencadenante en el momento del fallo.

| Fecha/hora UTC del 15/10 | Uruguay | Evidencia |
| --- | --- | --- |
| 22:20:38,696–22:20:54,627 | 19:20:38,696–19:20:54,627 | 24 rechazos RLS, SQLSTATE `42501`, desde contexto de conexión `authenticator`, sobre tablas de Sourcing; clasificación detallada abajo |
| 22:20:39–22:20:58 | 19:20:39–19:20:58 | 14 errores Auth clasificados como token/JWT inválido. No se clasificaron como fallo de conexión de Auth a PostgreSQL |
| 22:20:56,988 | 19:20:56,988 | SQLSTATE `42703`: columna `international_products.slug` inexistente, contexto `authenticator` |
| 22:21:36,073–22:27:41,634 | 19:21:36,073–19:27:41,634 | 13 eventos PostgREST con clase controlada `SERVER_THREAD_KILLED_TIMEOUT`. Es el primer patrón de timeout encontrado en esta ventana, pero no demuestra por sí solo timeout de conexión o consulta SQL |
| 22:22 | 19:22 | Última captura privada recuperada por el responsable: aproximadamente 93,584 ms de colección |
| 22:26:22 | 19:26:22 | La muestra SQL del responsable todavía respondía: 24 conexiones de 60, cero locks en espera, cero transacciones abandonadas y cero consultas largas. Una fotografía intermedia saludable no descarta degradación intermitente ni lo ocurrido después |
| 22:29:07–22:29:19 | 19:29:07–19:29:19 | Monitor alojado sobre versión web anterior `1474951`: catálogo 503, aproximadamente 8,7 s en el primer intento; su única repetición también 503 |
| 22:29:25 y 22:29:54 | 19:29:25 y 19:29:54 | Dos intentos del responsable al endpoint oficial de métricas agotaron el límite de 15 s |
| 22:30:33 | 19:30:33 | Nuevo despliegue web `966e1a3` alcanzó READY. READY demuestra compilación/publicación, no recuperación de Supabase |
| 22:31 aprox. | 19:31 aprox. | Catálogo sobre la nueva versión: 503 y repetición 503, también aproximadamente 8,7 s |
| 22:31:40 | 19:31:40 | Consulta SQL simple del responsable: timeout al conectar |
| 22:32–22:33 | 19:32–19:33 | Único intento SQL del agente forense: falló al conectar tras 16,647 s. No se repitió ni se obtuvo la muestra privada más reciente |
| 22:34 aprox. | 19:34 aprox. | Dashboard observado por el responsable: `Unhealthy` y conexiones no disponibles. La API administrativa había devuelto `ACTIVE_HEALTHY`: esos estados no sustituyen una comprobación SQL real |
| 22:34:38,058 | 19:34:38,058 | Único intento de métricas del agente forense: `TimeoutError`, plazo de 15 s; no se recibieron métricas numéricas del incidente |

La clasificación segura identificó **17 rechazos RLS en `sourcing_autopilot_audit`, cinco en `sourcing_autopilot_alerts`, uno en `sourcing_autopilot_queue` y uno en `sourcing_adaptive_settings`**. No son las tablas de la nueva captura privada. El contexto `authenticator` identifica una conexión de PostgREST; no identifica a una persona ni prueba qué JWT o proceso originó cada petición. Esa actividad requiere revisar el flujo de Sourcing que la produjo. Por sí sola no demuestra un ataque, un cambio de permisos ni el desencadenante del bloqueo.

Los mensajes PostgREST contienen las palabras de clase `error`, `killed`, `server`, `thread` y `timeout`; no se observaron allí términos de JWT, base de datos, pool, conexión, adquisición o listener. Se retuvieron conteos, longitudes y clases, nunca el mensaje completo. **No deben renombrarse como trece timeouts SQL o de PgBouncer sin evidencia adicional.** Los errores Auth sí se clasificaron como tokens/JWT inválidos, con posible relación con actividad de esos minutos, pero sin una atribución de actor o causa.

En la porción disponible no aparecieron nuevos `57014`, OOM, disco lleno o límites de conexiones. Los últimos logs PostgreSQL consultados llegaban sólo hasta 22:28:00 y PgBouncer hasta 22:28:45, aunque después seguían fallando los accesos. Puede tratarse de falta de eventos o retraso de ingestión: **esa ausencia no descarta un fallo físico ni demuestra que PostgreSQL estuviera sano**. Dos eventos cron de severidad LOG entraron en la búsqueda por contener la palabra de configuración `timeout`; no se contaron como fallos cron.

La nueva tabla de telemetría no pudo consultarse durante este fallo de conexión. La última muestra privada que el responsable había recuperado correspondía a 22:22 UTC, con aproximadamente 93,584 ms de colección. No se sabe desde esta captura si la ejecución de 22:27 persistió una muestra o si la siguiente pudo arrancar. No se inventaron locks, conexiones, CPU, RAM o IO del momento indisponible. Los valores físicos de 22:11–22:13 pertenecen a otra ventana y no rellenan ese hueco. Los resúmenes CPU/RAM del dashboard tampoco se tratan como una muestra fresca de recursos al fallar.

Que el catálogo fallara antes y después de la publicación descarta atribuir el inicio exclusivamente al nuevo bundle web. No exonera automáticamente cambios anteriores, procesos paralelos o infraestructura compartida. La causa global sigue abierta; la siguiente acción debe basarse en evidencia recuperable de recursos, capturas privadas, logs o soporte de Supabase, sin encadenar sondeos ni reinicios para ocultar el estado.

Durante esta captura no hubo reinicio, cambios de plan/parámetros, invocaciones de workers, consultas comerciales ni pruebas de carga. Sólo hubo una consulta SQL fallida del agente y una lectura de métricas fallida, además de consultas agregadas al servicio de logs. Evidencia aparte: [p0-incident-2026-10-15T2229Z.json](C:/Projects/Collectibles2026/docs/audits/monitoring/p0-incident-2026-10-15T2229Z.json).

## Recuperación autorizada y seguimiento posterior

Una vez guardada la evidencia, el usuario autorizó expresamente **un nuevo reinicio controlado**. Se confirmó en el panel alrededor de las 22:40 UTC del 15, que pasó a `Restarting`. PostgreSQL informa arranque **22:44:56,141 UTC / 19:44:56,141 de Uruguay**. La comprobación inmediata del panel quedó bloqueada por el límite de uso de Codex y la revisión automática no pudo ejecutarla. Esto dejó un hueco de observación local hasta las 02:33 UTC del 16; **no demuestra que el servicio permaneciera caído durante ese período**. No se repitió el reinicio.

Al recuperarse SQL se leyó una sola vez el historial privado, sin invocar la función de captura:

| Hora UTC del 15 | Evidencia recuperada | Límite |
| --- | --- | --- |
| 22:27:00,196 | Captura en 98,265 ms: 15 clientes reales y 23 backends excluyendo sampler; cero consultas activas/largas, transacciones abandonadas y esperas por locks | No mide lo que cambió en los dos minutos siguientes |
| 22:29–22:30 | Cuatro `job startup timeout`: campaña, cola ML, webhook y reservas. Fallaron al arrancar la conexión cron, antes de ejecutar el cuerpo | No atribuirlos a un HTTP de worker ni a reglas comerciales del parche |
| 22:32, 22:37 y 22:42 | No hay muestras privadas ni registros de ejecución de su cron | Los huecos no permiten reconstruir CPU/RAM ni la duración exacta de la caída |
| 22:47:00,445 | Primera captura privada posterior al arranque confirmado | Hueco de veinte minutos desde 22:27; mezcla incidencia y reinicio, no veinte minutos de caída HTTP medida |
| 22:47–02:32 del 16 | 46 muestras regulares de cinco minutos, 5–17 clientes y colecciones de 53,865–434,155 ms; sin locks ni consultas largas | Una transacción de un segundo a las 01:52 desapareció a las 01:57; no es una transacción abandonada persistente |

Entre las capturas 22:22 y 22:27 hubo 79 sesiones nuevas acumuladas, 423 commits, un bloque compartido leído y 50.634 hits, sin temporales/deadlocks ni ejecuciones completadas adicionales del hash del snapshot principal del catálogo. Esas sesiones son un contador acumulado, no 79 conexiones simultáneas. Estos datos no identifican qué ocurrió después de 22:27. Los contadores WAL llamativos, ya elevados antes, tampoco justifican un cambio de GUC por sí solos.

La muestra independiente de [GitHub Actions 38834837107](https://github.com/juan2026prog/collectibles-ecommerce/actions/runs/38834837107), a las **01:23:30,716 UTC del 16 / 22:23:30,716 de Uruguay del 15**, registró cuatro HTTP 200 sin reintentos; catálogo y búsqueda MISS/fresh. Sólo se devolvió esa ejecución programada y la manual anterior fallida. No hay evidencia de ejecución en todos los horarios esperados ni se conoce la causa de esos huecos; Actions no se presenta como un SLA.

La comprobación local válida de las 02:34 UTC también devolvió cuatro 200 y SQL mostró 23/60 conexiones, sin locks, transacciones abandonadas ni consultas largas. Un intento anterior no envió HTTP por un error local de importación: otro trabajo había cambiado el checkout principal a un commit ajeno, dejando el monitor y su helper en versiones incompatibles. Se usó el worktree limpio de la versión publicada. El primer intento dentro del entorno de red restringido tuvo `ENOTFOUND`; el acceso de red autorizado resolvió correctamente y produjo los resultados 200. Ninguno de estos dos fallos locales se clasificó como caída del sitio. Se actualizó la misma automatización para leer los scripts compatibles del worktree y se preservó el trabajo ajeno.

La revisión SEO real con User-Agent de Googlebot verificó los tres productos afectados y sus canonical/JSON-LD, el 404 de un producto inexistente y los dos sitemaps. Para un navegador normal esas URLs sirven la SPA: su HTTP 200 inicial no prueba que el producto exista ni sustituye la revisión del HTML SEO. La tienda visible mostró los 1.205 productos, tarjetas, precios e imágenes, sin realizar compras.

### Incidencia aislada posterior: todavía no se cumple el criterio definitivo

En los logs Vercel de 01:34:45–02:33:45 UTC hubo **un HTTP 5xx confirmado** a las **02:26:45,522** en la ficha de Charmander, correlacionado con `product_lookup_slug / TIMEOUT` a las 02:26:49,061. El recheck único de las **02:39:59,361** devolvió **200 en 2.107 ms**, MISS y el marcador `2026.10.15-bounded-reads`. Hubo además un timeout opcional de relacionados a las 02:14; no se dedujo su HTTP a partir de ese log. Cinco advertencias DEP0169 se mantuvieron separadas de los fallos. No hubo errores Upstream de catálogo retornados en esa ventana.

Una consulta agregada de Edge Functions de 59 minutos devolvió 31 HTTP 200: once de ML sync y el resto de campañas/wishlist/carritos/webhooks/tracking. Los doce despachos SQL y once HTTP de ML cubren ventanas diferentes; no demuestran una ejecución perdida ni verifican cada resultado comercial. El importador no fue invocado para probarlo.

### Recursos posteriores observados

La API oficial respondió 200 a las 02:34:48 y 02:37:21 UTC. En esos **153,256 s**, CPU ocupada fue **1,98 %**, IOwait **5,96 %**, swap-in **358,45 páginas/s** y swap-out **346,55 páginas/s**. RAM total: 431.304.704 bytes; disponible al final: 229.040.128; swap usado: 361.406.464. El dispositivo `nvme1n1` tuvo aproximadamente 437,37 lecturas/s y 171,69 escrituras/s, con 0,90 y 1,77 ms medios respectivamente.

El paging siguió activo mientras SQL y los probes respondían. Por tanto, ni swap usado ni estas tasas, por sí solas, prueban el desencadenante. No son métricas del instante fallido, ni una comparación de tráfico equivalente, ni prueba de que un plan mayor resolvería el bloqueo. No se atribuye a la optimización una mejora porcentual de disponibilidad o de recursos.

El seguimiento permanece ACTIVE hasta **17/10 22:30:33 UTC / 19:30:33 de Uruguay**, con silencio si nada cambia. El objetivo de 48 horas sin recaídas todavía no está satisfecho. Ante una nueva pérdida global de conexión deben preservarse las muestras y solicitar el diagnóstico de infraestructura a Supabase con este paquete; no encadenar reinicios o cambios de capacidad sin evidencia y autorización.

Evidencia posterior: [muestra consolidada de recuperación y seguimiento](C:/Projects/Collectibles2026/docs/audits/monitoring/p0-recovery-followup-2026-10-16.json), [historial privado](C:/Projects/Collectibles2026/docs/audits/monitoring/p0-private-history-recovery-2026-10-16.json), [logs externos y Actions](C:/Projects/Collectibles2026/docs/audits/monitoring/p0-external-followup-2026-10-16T0233Z.json), [probes válidos](C:/Projects/Collectibles2026/docs/audits/monitoring/stability-2026-10-16T0234Z-network.json), [recursos con deltas](C:/Projects/Collectibles2026/docs/audits/monitoring/resources-2026-10-16T0237Z.json) y [recheck Charmander](C:/Projects/Collectibles2026/docs/audits/monitoring/charmander-recheck-2026-10-16.json). La evidencia anterior al reinicio conserva su estado histórico y no se sobrescribió.

## Recaída del 16 de octubre: conexión SQL y catálogo indisponibles

La observación de las **12:36 UTC / 09:36 de Uruguay** todavía produjo cuatro HTTP 200, catálogo/búsqueda fresh y SQL 25/60 sin locks ni consultas largas. La lectura del historial privado recuperó 97 capturas de 04:37 a 12:37, sin huecos ni reinicios, 13–21 clientes reales y sin bloqueos o consultas largas. Esto describe el período anterior al nuevo fallo; no sus recursos o conexiones durante la indisponibilidad.

La siguiente observación encontró una nueva incidencia:

| Hora UTC del 16 | Uruguay | Evidencia |
| --- | --- | --- |
| Alrededor de 13:10 | 10:10 | Los registros disponibles de PostgreSQL, PgBouncer y PostgREST dejan de avanzar; los logs externos de Edge continúan posteriormente. Es una frontera de observación, no una hora demostrada del inicio físico |
| 13:13:08,879 | 10:13:08,879 | Primer timeout SEO esencial retornado en la ventana; aparecen también fallos de tienda y fichas |
| 13:18–13:21 | 10:18–10:21 | Errores de catálogo: ocho timeouts de `settings/international_status` y otros 25 errores genéricos/cooldown. No son 33 consultas SQL independientes identificadas |
| 13:35 | 10:35 | Catálogo 503 en 8.942 ms y búsqueda 503 en 513 ms. Sus únicas repeticiones también 503, en 296 y 487 ms. Inicio/tienda de esos probes responden 200 desde CDN; no demuestran acceso a base |
| 13:34–13:38 | 10:34–10:38 | Snapshot SQL falló al conectar y su única repetición también. Métricas oficiales: dos timeouts de 15 segundos, sin valores físicos actuales |

El filtro HTTP de Vercel retornó 50 entradas 503 en catálogo, tienda, productos y marcas; no son necesariamente 50 usuarios o solicitudes únicas ni un recuento exhaustivo. El runtime retornó 14 timeouts SEO esenciales y 33 errores de catálogo. La coincidencia con el fallo SQL directo y los 503 confirmados impide clasificarlo como una mera restricción de red local.

La API administrativa continuó indicando `ACTIVE_HEALTHY`; ese indicador no sustituyó la disponibilidad SQL real. No hubo nuevos errores graves en la porción visible de logs PostgreSQL, pero ésta termina cerca de 13:10 y no permite excluir errores posteriores. Tres eventos PgBouncer de 12:53 fueron cierres por inactividad del servidor, no fallos de apertura ni de espera de consulta. Los mensajes PostgREST `SERVER_THREAD_KILLED_TIMEOUT` ya ocurrían mientras las capturas SQL seguían sanas: no se presentan como el desencadenante.

No se obtuvieron conexiones, locks, RAM, CPU o IO del instante fallido; no se rellenan con ceros ni con las mediciones saludables anteriores. El último HTTP de ML sync retornado en la ventana fue a las 13:05 y el de campañas a las 13:09; la ausencia posterior en ese resultado no certifica cada ejecución individual. Sin SQL no se pudo comprobar el nuevo estado de cron ni recuperar aún las capturas privadas del tramo final.

Se preservó evidencia y un borrador de caso técnico para Supabase, **sin enviarlo a terceros**. Se necesita investigar el estado del host, los recursos y la admisión de conexiones durante este intervalo. La causa global continúa sin demostrarse; la intervención vuelve a confirmar que publicar los parches y recuperar mediante reinicio no equivalen a eliminar el problema. Durante este monitoreo no se reinició, modificó capacidad/GUCs/cron ni se invocaron workers o transacciones comerciales.

Evidencia de la nueva recaída: [probes y repeticiones](C:/Projects/Collectibles2026/docs/audits/monitoring/stability-2026-10-16T1334Z.json), [dos intentos SQL](C:/Projects/Collectibles2026/docs/audits/monitoring/database-attempts-2026-10-16T1334Z.json), [logs Vercel y Edge](C:/Projects/Collectibles2026/docs/audits/monitoring/external-2026-10-16T1334Z.json) y [captura forense y borrador para plataforma](C:/Projects/Collectibles2026/docs/audits/monitoring/incident-forensics-2026-10-16T1335Z.json). El registro consolidado permanece en `docs/audits/monitoring/collectibles-stability-2026-10.jsonl`.

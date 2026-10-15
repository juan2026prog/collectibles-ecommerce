# Correcciones de estabilidad — Collectibles

## Estado real

La migración y las seis funciones de Supabase están aplicadas en producción. La verificación final del despliegue web se registra en la respuesta de cierre de esta tarea.

- El build de producción de Vite pasa.
- La validación incluye catálogo, búsqueda, paginación, autorización de workers, separación de configuración pública/administrativa y el límite de doce funciones del hosting.
- Las seis funciones están activas: ml-import-worker v11, campaign-runner v10, abandoned-carts-cron v7, smart-wishlist-cron v7, zinc-sync-published-products v9 y zinc-sync-order-tracking v2. Todas rechazaron llamadas anónimas con HTTP 401 en el runtime real.
- La comprobación global de tipos presenta errores en módulos preexistentes. No debe confundirse el build exitoso con un typecheck global exitoso.
- Migración remota registrada como `20261015004657_stabilize_database_access_and_cron`; el archivo local se alineó con esa versión.
- La prueba transaccional de leases en PostgreSQL pasó: adquisición inicial, rechazo de solapamiento, rechazo de liberación por otro propietario y liberación correcta. La transacción de prueba se revirtió.
- El secreto de Vault verifica correctamente. Una llamada interna de prueba al worker ML devolvió HTTP 400 por acción no admitida, confirmando autenticación y acceso a la lease sin procesar importaciones.
- Las vistas usan `security_invoker=true`; anon no puede ejecutar las RPCs de lease ni limpieza. Los ocho índices dirigidos están presentes y los cron conocidos usan autenticación interna; ML conserva su estado pausado.
- El catálogo nuevo pasó pruebas con lecturas públicas reales: 1.205 productos, páginas de 15 y búsqueda Pokémon con 127 resultados. Primera carga local de prueba: 4.590 ms; páginas posteriores: 330–495 ms; facetas en la instantánea: 15 ms. Son muestras de funcionamiento, no percentiles de producción.
- En el dominio oficial, el catálogo devolvió HTTP 200 con `X-Catalog-Version: 2026-10-stability-1`; respuestas CDN HIT de 120 y 199 ms, facetas sin caché de 656 ms y búsqueda de 1.604 ms. Se verificaron visualmente productos, precios, imágenes y los 127 resultados de Pokémon. La primera carga de una instancia después del cambio de región tardó 10.432 ms y debe incluirse en la evaluación de latencia.
- Se ejecutó ANALYZE sobre nueve tablas del catálogo después de aplicar los índices. Autovacuum y track_counts están habilitados.
- Los permisos de ejecución que bloqueaban Supabase y Git quedaron habilitados. No se cambiaron planes de pago ni archivos de imágenes. Las pruebas no dispararon campañas ni compras.

## Cambios preparados

### Catálogo y tráfico público

`/api/public-catalog` usa exclusivamente credenciales públicas, RLS y un cliente sin sesión. Nunca hereda el JWT ni cookies del visitante.

El primer despliegue web encontró el límite de doce funciones del plan Hobby de Vercel. El endpoint JSON y el feed CSV de Meta se sirven mediante una misma función, conservando sus URLs y formatos originales. Los helpers permanecen en `api/_lib`, excluido de los entrypoints de Vercel. Esto mantiene el proyecto en doce funciones sin cambiar el plan contratado.

La verificación en Vercel detectó que la lectura inicial de configuración agotaba el plazo de transporte desde `gru1`, aunque las pruebas públicas desde el equipo local funcionaban. Se restauró el sitio anterior durante el diagnóstico. Las funciones se ubican ahora en `pdx1`, cerca de PostgreSQL en `us-west-2`, y los fallos de transporte registran solamente tipo de error y código, sin cabeceras ni credenciales. La [documentación de regiones de Vercel](https://vercel.com/docs/functions/configuring-functions/region) recomienda ubicar las funciones cerca de la fuente de datos. La promoción final requiere comprobar el endpoint desplegado, no solo el build.

El smoke test del feed CSV de Meta detectó un error preexistente `PGRST201` por las dos relaciones entre productos y marcas. El feed selecciona ahora la FK correcta, usa solamente el cliente público con plazo de transporte, ordena sus páginas por ID y habilita la caché CDN prevista de 15 minutos. Los errores no se cachean.

Sustituye las descargas completas de productos desde cada navegador por una instantánea compacta del servidor: TTL 60 segundos, una sola renovación simultánea por instancia, máximo tres lecturas concurrentes y plazo de renovación de 10 segundos. Las respuestas correctas pueden almacenarse en el CDN durante 60 segundos, con revalidación posterior de 120 segundos. Cada instancia de Vercel mantiene su propia instantánea; esto no es una caché distribuida ni una vista materializada.

La paginación local/internacional usa un orden común. Solo se solicitan las fichas completas de los productos de la página. Se conservan filtros, alias de búsqueda, categorías descendientes y conteos sin duplicar productos asignados a varias categorías. Las taxonomías públicas comparten los conteos y conservan imágenes y metadatos necesarios para la interfaz.

Los fallos devuelven 503 sin caché. Una descarga parcial no reemplaza una instantánea correcta. El navegador cancela solicitudes anteriores al cambiar filtros y la tienda ofrece reintentar cuando falla el catálogo.

### SEO

Se elimina la creación de productos ficticios para resolver fallos de Supabase y los UUID inválidos derivados. Las consultas tienen cancelación y límites de tiempo. Un fallo de base no se publica como una respuesta 200 vacía ni queda cacheado como catálogo correcto. Los alias estáticos de productos solo sirven para redireccionar.

### Configuración internacional

La caché pública y las cachés administrativas están separadas por cuenta. Las lecturas simultáneas se comparten. Una falla de permisos administrativos devuelve indisponibilidad, sin sustituir costos y márgenes reales por valores públicos. Los cambios de sesión invalidan el estado administrativo.

### Tareas automáticas

Seis workers incorporan autenticación interna, comprobación de administrador cuando reciben un JWT de usuario, límites de trabajo y llamadas HTTP acotadas. Se eliminan bypass predecibles y comparaciones parciales de claves.

Una lease atómica en PostgreSQL impide dos ejecuciones del mismo worker al mismo tiempo. Expira como máximo a los 600 segundos; los bucles preparados tienen un presupuesto de trabajo de 45 segundos. Ese presupuesto es cooperativo: no equivale a cancelar una transacción en ejecución.

El seguimiento de pedidos rota por fecha de intento incluso cuando el proveedor falla, para que una orden problemática no monopolice la cola.

### Migración independiente

Archivo: `supabase/migrations/20261015004657_stabilize_database_access_and_cron.sql`.

- Agrega leases y un secreto interno en Vault, con RPCs restringidas a `service_role`.
- Reprograma cron conocidos en minutos escalonados, conservando su estado activo/inactivo.
- Restringe RPCs de mantenimiento y establece `security_invoker` en dos vistas de conteos.
- Optimiza llamadas repetidas a `auth.uid()` en las políticas de doce tablas consultadas con frecuencia, conservando las expresiones de permisos.
- Agrega índices dirigidos y elimina solo índices duplicados cuya equivalencia verifica en el catálogo de PostgreSQL.
- Programa retención acotada de cachés vencidas, logs de sincronización de más de 90 días y ejecuciones cron de más de 30 días. Cada ejecución elimina lotes pequeños; no borra pedidos, pagos ni auditoría.

## Procedimiento de publicación y verificación

1. Revisar y aplicar **solo la migración nueva**, con permisos de administrador de Supabase. No ejecutar un `db push` general: la auditoría detectó divergencias entre el historial local y remoto. Si `lock_timeout` falla, revisar bloqueos antes de reintentar.
2. Desplegar las seis funciones con el helper compartido y `supabase/config.toml` del workspace. La verificación JWT de gateway queda deshabilitada en estas funciones porque el cuerpo implementa autenticación propia para el secreto de Vault. No deshabilitarla usando los cuerpos antiguos.

   ```powershell
   frontend/node_modules/.bin/supabase.cmd functions deploy ml-import-worker --project-ref cobtsgkwcftvexaarwmo
   frontend/node_modules/.bin/supabase.cmd functions deploy campaign-runner --project-ref cobtsgkwcftvexaarwmo
   frontend/node_modules/.bin/supabase.cmd functions deploy abandoned-carts-cron --project-ref cobtsgkwcftvexaarwmo
   frontend/node_modules/.bin/supabase.cmd functions deploy smart-wishlist-cron --project-ref cobtsgkwcftvexaarwmo
   frontend/node_modules/.bin/supabase.cmd functions deploy zinc-sync-published-products --project-ref cobtsgkwcftvexaarwmo
   frontend/node_modules/.bin/supabase.cmd functions deploy zinc-sync-order-tracking --project-ref cobtsgkwcftvexaarwmo
   ```

   Aplicar primero la migración: los workers nuevos rechazan ejecutar trabajo si no pueden adquirir la lease. Durante la transición, los cron que ya utilicen el nuevo secreto pueden fallar hasta terminar el despliegue de las funciones; comprobarlos después.

3. Repetir `npm --prefix frontend run build`, stagear solo los archivos de esta tarea, crear el commit y ejecutar `git push origin main`. Verificar que Vercel publique ese mismo commit en `collectibles.uy`.
4. Verificar catálogo local e internacional, filtros, páginas profundas, imágenes, configuración administrativa y páginas SEO. Comprobar 200 y cabeceras de caché de respuestas correctas; 400 para filtros inválidos; 503 sin caché para indisponibilidad. No hacer pruebas de fallo provocando una caída de producción.
5. Comprobar que una llamada anónima a cada worker devuelve 401 y que cron autenticado funciona. Revisar leases y resultados reales de cron. No disparar campañas ni compras como smoke test.

## Verificación de capacidad que sigue pendiente

Estas correcciones reducen carga evitable y cierran vías de ejecución no autorizada. No prueban la causa exacta de los bloqueos que obligaron a reiniciar: faltan métricas históricas de CPU, RAM y disco/IOPS durante el incidente. La consulta SQL previa al despliegue mostró 216 MB de base, 23 conexiones de un máximo de 60, cero esperas por locks y cero otras consultas activas. Los roles públicos ya tenían límites de consulta de 3 segundos para anon y 8 segundos para authenticated.

Los advisors todavía señalan otras políticas permisivas, llamadas RLS sin initplan, funciones SECURITY DEFINER e índices candidatos. No se eliminaron ni fusionaron en bloque: varias protegen flujos de pedidos, vendedores y pagos. La guía de [RLS initplans](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) y la de [funciones públicas privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) describen esos avisos. La protección de contraseñas filtradas de Auth sigue deshabilitada y requiere revisar disponibilidad y configuración del proyecto.

Después del despliegue, comparar ventanas de tráfico equivalentes, incluyendo un pico y ejecuciones de cron: latencia del catálogo, 5xx/522/504, renovaciones de sesión, conexiones, esperas, CPU, RAM y disco. Un HTTP 200 del dominio por sí solo no demuestra estabilidad de la base.

En la comprobación posterior había 34 conexiones y cero esperas por locks. Cron registró dos `job startup timeout` a las 01:43 y 01:44 UTC, seguidos por ejecuciones correctas de campañas y carritos. Son fallos de apertura de la conexión del planificador, anteriores a ejecutar el cuerpo del worker, y no los corrige por sí sola una lease. Debe comprobarse su frecuencia en un período de carga comparable y, si persisten, revisar capacidad y la conexión del planificador con Supabase. No se presenta esta intervención como garantía de que nunca vuelva a producirse un bloqueo.

No hay evidencia que justifique migrar las imágenes a otra base. Los archivos ya están en Storage o proveedores externos; PostgreSQL guarda URLs/metadatos. Si persiste saturación de recursos después de corregir las consultas y cron, dimensionar el cómputo con esas métricas y un presupuesto aprobado.

## Cierre de pendientes técnicos — 15 de octubre, 02:15 UTC

El chequeo global `npm run typecheck` pasa después de reparar importaciones ausentes de búsqueda y portal, normalizar relaciones de PostgREST en preguntas y búsqueda, corregir el contrato de OAuth y retirar una llamada inexistente del recálculo de categorías. Se alinean los metadatos de investigación y procedencia con los contratos del servidor; una imagen inválida queda explícitamente no publicable. Un resultado sin datos de mercado conserva presencia desconocida, sin afirmar ausencia de competencia.

El comando `npm run build` ahora ejecuta también TypeScript: futuros errores de este tipo detienen el build antes del despliegue. Se verificaron 208 pruebas en 15 suites, incluyendo catálogo, paginación, cachés, aislamiento de búsquedas, imágenes, Radar y contratos de investigación.

Se incorporan dos herramientas de observación de solo lectura:

- `node scripts/check_database_stability.mjs`: cuatro solicitudes HTTP secuenciales con límite de 15 segundos, sin invalidar caché ni ejecutar proveedores. Comprueba HTML del sitio, catálogo acotado a 15 productos y una búsqueda. Registra estado, latencia, caché y conteos; nunca cuerpos de respuestas ni credenciales.
- `scripts/database_stability_snapshot.sql`: conexiones y máximo, consultas largas, locks, transacciones abandonadas, leases y resultados agregados de cron. No lee consultas, comandos de cron ni datos de clientes.

Muestra de producción a las 02:14 UTC: inicio 200/436 ms, tienda 200/88 ms, catálogo 200/2698 ms (1205 productos, página de 15, MISS), búsqueda Pokémon 200/492 ms (127 coincidencias, página de 15). La primera ejecución del script quedó restringida por la red del entorno local; la ejecución con acceso a red fue correcta. Ese fallo local no constituye una caída de producción.

Muestra SQL de las 02:15 UTC: 19/60 conexiones, cero locks, cero transacciones abandonadas, cero consultas activas ajenas y cero leases vigentes. PostgreSQL llevaba aproximadamente nueve días iniciado. En la última hora hubo 48 despachos cron correctos y los dos timeouts de arranque ya registrados a las 01:43/01:44; después ambos trabajos volvieron a despacharse correctamente. Un despacho SQL correcto no demuestra por sí solo que la función remota haya completado su trabajo. Se contrastaron además siete solicitudes HTTP de los cuatro workers activos entre las 01:50 y las 02:16: todas devolvieron 200, con duraciones máximas de 1,47 a 2,47 segundos según el worker.

El [código de pg_cron](https://github.com/citusdata/pg_cron/blob/main/src/pg_cron.c) establece un tiempo máximo de apertura de conexión; el error es anterior al cuerpo del trabajo. La [guía de Supabase Cron](https://supabase.com/docs/guides/cron) recomienda como máximo ocho trabajos concurrentes. Las muestras actuales no permiten atribuir los timeouts aislados a DNS, CPU o memoria: no se cambian parámetros de arranque ni se reinicia la base por una hipótesis.

Quedó activa una observación horaria en este chat hasta el 17 de octubre de 2026 a las 02:30 UTC (`estabilidad-de-collectibles-48-horas`). Registra muestras locales y avisa únicamente por incidencias relevantes, recuperación, acciones necesarias o cierre. Requiere la aplicación y el equipo local disponibles. No sustituye una vigilancia alojada permanente ni demuestra estabilidad bajo picos que no hayan sido observados. CPU/RAM/IOPS históricos durante el bloqueo original siguen sin estar disponibles en estas consultas.

### Incidencia detectada durante la publicación y recuperación del transporte

El despliegue del commit `93c2e31` compiló correctamente y alcanzó READY, pero la comprobación del dominio a las 02:19 UTC detectó 503 en catálogo por timeout HTTP al consultar la configuración pública de Supabase. Se restauró el despliegue anterior y se verificó de nuevo 200. La misma versión apartada respondió después 200 en una petición autenticada: no se reproduce un fallo determinista de consulta o de tipos. Durante la incidencia la base tenía 25 conexiones, cero locks y cero consultas de más de diez segundos; los logs PostgreSQL de 02:18–02:22 no registraron errores.

El campo `region` del listado de runtime logs corresponde al borde donde entra la petición según la [documentación de Vercel](https://vercel.com/docs/logs/runtime); no prueba por sí mismo dónde corrió la función. La configuración del despliegue declara `pdx1`. Se agrega el valor explícito `VERCEL_REGION` a los errores del catálogo para distinguir ambos datos.

Se agrega recuperación limitada del transporte: como máximo un reintento ante fallo de red/timeout en GET/HEAD o en la RPC pública de lectura `get_international_public_status`. Cada intento tiene cinco segundos y ambos comparten un presupuesto de ocho; las cancelaciones del llamador y la fecha límite de diez segundos del refresco se respetan. No se reintentan errores HTTP, escrituras ni RPCs arbitrarias. La consulta inicial de configuración también queda vinculada a la cancelación del refresco. Se verifican ahora 214 pruebas en las mismas 15 suites.

La revisión automática rechazó desactivar `autoAssignCustomDomains`: consideró el cambio global persistente y sin autorización específica. No se cambió esa opción ni se intentó modificarla por otro camino; se conserva el pipeline existente y la verificación posterior del dominio.

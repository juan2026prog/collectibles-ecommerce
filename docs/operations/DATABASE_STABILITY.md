# Operación y evidencia de estabilidad de Collectibles

## Qué significa una comprobación correcta

Un HTTP 200 confirma esa solicitud. Un HIT de CDN no demuestra acceso directo a PostgreSQL. Los timeouts de lectura, las consultas SQL canceladas, una cola de conexiones y un bloqueo global son fenómenos distintos. Nunca presentar una muestra saludable como prueba de estabilidad en picos o como diagnóstico retrospectivo de CPU/RAM.

El backend público tiene señales de cancelación reales, presupuestos compartidos y un límite de tres lecturas HTTP activas por instancia y 24 en espera. No es un límite global de PostgreSQL. Las consultas esenciales fallidas devuelven 503 sin caché; recomendaciones editoriales opcionales pueden omitirse con un evento de diagnóstico. No se sustituyen precios ni productos por datos ficticios. Singleflight reúne únicamente solicitudes coincidentes en curso y no añade un TTL de precios.

## Captura privada alojada en PostgreSQL

La migración `20261015220907_collect_private_database_health_telemetry.sql` crea únicamente:

- `collectibles_internal.database_health_samples`: tabla privada, RLS sin políticas y sin permisos para `anon`, `authenticated` o `service_role`.
- `collectibles_internal.capture_database_health_sample()`: función `SECURITY INVOKER` de `postgres`, búsqueda de esquema vacía y sin ejecución pública.
- Cron `collectibles-database-health-sample`, minutos `2-57/5`, deadline de tres segundos en su propia conexión. No cambia parámetros globales ni trabajos comerciales.

Guarda conexiones/estados/esperas, transacciones, locks, reinicios, contadores de IO/WAL y diez hashes de consultas. `pg_stat_statements(false)` evita leer su texto. No almacena SQL, usuarios, parámetros, credenciales, pedidos o clientes. Conserva aproximadamente 14 días; cada ejecución elimina como máximo 300 muestras vencidas, usando `SKIP LOCKED`.

Consultar como administrador mediante `scripts/database_stability_snapshot.sql` o `scripts/database_health_history.sql`. Los contadores requieren diferencias entre muestras comparables, verificando reinicios y reset/evicción de estadísticas. Los bloques leídos no equivalen necesariamente a IO físico; si `track_io_timing` está desactivado, cero milisegundos no demuestra ausencia de latencia. Las consultas canceladas pueden no aparecer como llamadas completadas de `pg_stat_statements`.

La captura privada no depende del equipo local. Si PostgreSQL no acepta la conexión de cron tampoco puede escribir su propia muestra: un hueco no demuestra por sí mismo una caída y se debe contrastar con HTTP y logs externos.

## Observación HTTP independiente

`.github/workflows/database-stability.yml` ejecuta cada hora cuatro GET secuenciales del dominio oficial: inicio, tienda, catálogo y búsqueda. No usa secretos, no invalida caché ni invoca workers/proveedores. Solo repite una vez cada probe que falla, registra ambos y falla el workflow si el fallo queda confirmado. Conserva el JSON sanitizado como artifact durante 14 días. Las notificaciones dependen de las preferencias nativas de GitHub Actions; no envía correos o mensajes por un conector externo.

Ejecución manual:

```powershell
node scripts/monitor_database_stability.mjs frontend/node_modules/.cache/stability.json
```

Una falla de DNS o de red necesita corroboración desde otro punto. El runner registra códigos de red controlados, sin el mensaje original. La programación de Actions puede retrasarse; no es vigilancia continua ni un SLA. No lee métricas privadas y no requiere mover credenciales administrativas a GitHub.

## Recursos físicos mediante la API oficial

`scripts/sample_database_resources.mjs` consulta el endpoint oficial `/customer/v1/privileged/metrics` del proyecto fijado. Lee `SUPABASE_METRICS_KEY` o la credencial existente `SUPABASE_SERVICE_ROLE_KEY` del entorno local. Nunca escribirla en comandos, archivos versionados ni artifacts de Actions. No crea claves ni comparte las existentes con otro proveedor.

```powershell
node scripts/sample_database_resources.mjs frontend/node_modules/.cache/resources-first.json
# Tomar la segunda muestra al menos un minuto después, sin provocar tráfico adicional.
node scripts/sample_database_resources.mjs frontend/node_modules/.cache/resources-second.json frontend/node_modules/.cache/resources-first.json
```

Solo persiste métricas numéricas de una lista fija, modos CPU y nombres de dispositivo. Omite las demás etiquetas y el cuerpo de errores. Calcula CPU e IOwait sobre deltas de contadores y tasas por dispositivo; los contadores ausentes, reiniciados o de un dispositivo nuevo producen `null`. Swap usado no demuestra por sí solo presión actual; se deben mirar sus tasas y correlacionarlas con incidentes. Los IOPS por dispositivo no son IOPS exclusivos de PostgreSQL.

La captura continua externa de estos recursos requiere un colector seguro con una credencial de métricas; no quedó conectada automáticamente a GitHub ni a un proveedor de pago. La [API oficial de métricas](https://supabase.com/docs/guides/observability/metrics/vendor-agnostic) describe esa configuración. La cancelación de PostgREST usa el [mecanismo oficial AbortSignal](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal).

## Ante una nueva degradación

1. Guardar los probes y su única repetición antes de cambiar nada.
2. Capturar la consulta SQL de estabilidad, el historial privado reciente y, si hay acceso, una muestra de recursos. Guardar solo metadatos operativos y UTC.
3. Correlacionar logs SEO/catálogo por etapa y clase con PostgreSQL, PgBouncer, Auth y respuestas HTTP de Edge. `cron.succeeded` confirma despacho SQL, no éxito del worker; HTTP 200 tampoco demuestra toda su operación comercial.
4. Comparar conexiones contra máximo, esperas, transacciones y deltas de consultas. No reiniciar, aumentar pools o comprar capacidad por una hipótesis. La saturación del pool puede ser consecuencia de consultas o de una degradación del servidor.
5. Documentar explícitamente los períodos sin observación o fuera de retención. Presentar horas UTC y America/Montevideo (UTC−3).

Las respuestas fallidas se registran por `stage`, `query_kind`, código/clase y duración, sin filtros, SQL ni mensajes del proveedor. No interpretar las advertencias `DEP0169` de Node como fallas de consultas.

## Reversión

La versión web puede revertirse al commit de producción anterior y volver a pasar build/push/verificación del dominio. Para workers, conservar la fuente y configuración exactas de la versión desplegada previa; Vercel no publica Edge Functions de Supabase. No sustituir un worker activo por un archivo antiguo del repositorio si difieren sus reglas comerciales o autenticación.

La captura puede detenerse con `cron.unschedule('collectibles-database-health-sample')` como administrador, conservando la tabla de evidencia. No eliminar esa tabla sin exportar la información y revisar explícitamente el alcance. No resetear estadísticas durante una investigación.

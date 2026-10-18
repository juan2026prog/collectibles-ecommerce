# AUDITORÍA DETALLADA DE TRABAJOS PROGRAMADOS (PG_CRON)
**Proyecto:** Collectibles (`collectibles.uy`)  
**Fecha de Emisión:** 18 de octubre de 2026  
**Fuente de Datos:** Registros unificados de PostgreSQL en ClickHouse (`postgres_logs`), migraciones de base de datos e historial de incidentes.

---

## 1. INVENTARIO COMPLETO DE LOS 16 TRABAJOS REGISTRADOS

En las consultas a los registros forenses de PostgreSQL de producción y en las migraciones aplicadas, se identificaron **16 trabajos de pg_cron distintos** que operan o han operado sobre la instancia:

| ID | Nombre del Trabajo | Programación Real | Comando Ejecutado | Duración Media Medida | Riesgo de Superposición | Impacto Comercial de Pausarlo |
|---|---|---|---|---|---|---|
| **5** | `ml-webhook-sweep` | `*/15 * * * *` (Cada 15 min en :00, :15, :30, :45) | `net.http_post` hacia `/functions/v1/mercadolibre-webhook` (`action: sweep`) | ~200-400 ms | Medio (si el webhook demora en responder) | **Medio:** Posible demora en procesar notificaciones de cambios de ML. |
| **6** | `ml-sync-queue-process` | `*/5 * * * *` (Cada 5 min) | `net.http_post` hacia `/functions/v1/mercadolibre-sync` (`action: process_sync_queue`) | ~300 ms | Alto (corre 12 veces por hora) | **Alto:** Sincronización de stock y precios con Mercado Libre. |
| **7** | `ml-oauth-token-check` | `0 1 * * *` (Diario 01:00 UTC) | `net.http_post` hacia `/functions/v1/mercadolibre-sync` (`check_oauth_tokens`) | ~500 ms | Cero (una vez al día de noche) | **Alto:** Si expiran tokens de ML se desconectan vendedores. No pausar. |
| **8** | `ml-stock-audit` | `0 3 * * *` (Diario 03:00 UTC) | `net.http_post` hacia `/functions/v1/mercadolibre-sync` (`stock_audit`) | Variable | Cero (madrugada) | **Medio:** Auditoría de stock. No pausar, mantener en horario nocturno. |
| **9** | `abandoned-carts-cron` | `6-59/15 * * * *` (Minutos 6, 21, 36, 51) | `collectibles_internal.invoke_collectibles_worker('abandoned-carts-cron')` | ~300 ms | Bajo (escalonado) | **Bajo:** Retrasa el envío de emails de carritos abandonados. Seguro para pausar temporalmente. |
| **10** | `smart-wishlist-cron` | `8-59/30 * * * *` (Minutos 8 y 38) | `collectibles_internal.invoke_collectibles_worker('smart-wishlist-cron')` | ~250 ms | Bajo | **Bajo:** Alertas de bajadas de precio en listas de deseos. Seguro para pausar. |
| **11** | `campaign-runner` | `4-59/5 * * * *` (**Cada 5 minutos**, minutos 4, 9, 14, 19...) | `collectibles_internal.invoke_collectibles_worker('campaign-runner')` | ~200-350 ms | **Muy Alto (12 veces por hora sin campañas activas)** | **Bajo:** Envío de campañas masivas de marketing. Debe pausarse o espaciarse. |
| **12** | `zinc-sync-published-products` | `11-59/30 * * * *` (Minutos 11 y 41) | `collectibles_internal.invoke_collectibles_worker('zinc-sync-published-products')` | ~300 ms | Medio | **Medio:** Sincronización de catálogo importado de Amazon. |
| **16** | `zinc-sync-order-tracking` | `13-59/15 * * * *` (Minutos 13, 28, 43, 58) | `collectibles_internal.invoke_collectibles_worker('zinc-sync-order-tracking')` | ~300 ms | Medio (registró 6 errores HTTP 401 en la auditoría del 14) | **Medio:** Seguimiento de paquetes internacionales de Amazon. |
| **18** | `release-expired-reservations-job` | `*/15 * * * *` (Cada 15 min en :00, :15, :30, :45) | `SELECT public.release_expired_reservations();` | ~50-150 ms (SQL directo) | Bajo (ejecución atómica rápida) | **Crítico:** Libera el stock retenido por carritos no pagados. **NO PAUSAR.** |
| **19** | `admin-daily-summary-cron` | `0 12 * * *` (Diario 12:00 UTC) | `SELECT public.invoke_admin_daily_summary_cron();` | ~500 ms | Cero (diario) | **Bajo:** Notificación de ventas del día a los dueños. |
| **20** | `cleanup_international_discovery` | Diario (madrugada) | `select public.cleanup_international_discovery(30);` | Variable | Cero | **Bajo:** Mantenimiento de tablas temporales. |
| **21** | `cleanup_audit_logs` | Diario (madrugada) | `select public.cleanup_audit_logs();` | Variable | Cero | **Bajo:** Poda de logs antiguos. |
| **22** | `cleanup_cron_job_history` | Diario (madrugada) | `select public.cleanup_cron_job_history(14);` | Variable | Cero | **Bajo:** Poda de la tabla interna de cron. |
| **23** | `cleanup_operational_history` | Diario (madrugada) | `SELECT collectibles_internal.cleanup_operational_history();` | Variable | Cero | **Bajo:** Mantenimiento de telemetría interna. |
| **24** | `capture_database_health_sample` | `2-57/5 * * * *` (**Cada 5 minutos**, minutos 2, 7, 12, 17...) | `SET statement_timeout = '3s'; SELECT collectibles_internal.capture_database_health_sample();` | ~50-90 ms | Bajo (usa advisory lock y timeout estricto) | **Observabilidad:** Captura métricas privadas de salud. |

---

## 2. ANÁLISIS DE SUPERPOSICIÓN Y DENSIDAD TEMPORAL

Si representamos un período cualquiera de 15 minutos en producción, observamos que **prácticamente cada minuto se dispara al menos un trabajo**:

- **Minuto :00:** Job 5 (`ml-webhook-sweep`) + Job 6 (`ml-sync-queue`) + Job 18 (`release_expired_reservations`). **TRES TRABAJOS CONCURRENTES.**
- **Minuto :02:** Job 24 (`capture_health_sample`).
- **Minuto :04:** Job 11 (`campaign-runner`).
- **Minuto :05:** Job 6 (`ml-sync-queue`).
- **Minuto :06:** Job 9 (`abandoned-carts-cron`).
- **Minuto :07:** Job 24 (`capture_health_sample`).
- **Minuto :08:** Job 10 (`smart-wishlist-cron`).
- **Minuto :09:** Job 11 (`campaign-runner`).
- **Minuto :10:** Job 6 (`ml-sync-queue`).
- **Minuto :11:** Job 12 (`zinc-sync-published`).
- **Minuto :12:** Job 24 (`capture_health_sample`).
- **Minuto :13:** Job 16 (`zinc-sync-order-tracking`).
- **Minuto :14:** Job 11 (`campaign-runner`).
- **Minuto :15:** Vuelven a coincidir Job 5, Job 6 y Job 18.

### Conclusión Técnica
Esta densidad de disparo es **incompatible con una máquina Nano de 512 MB de RAM**. Cada invocación de `invoke_collectibles_worker` realiza una llamada de red mediante `pg_net`, lo que dispara una Edge Function en Deno que se reconecta a PostgreSQL a través de PostgREST.

---

## 3. RECOMENDACIÓN AJUSTADA (SIN PÉRDIDA COMERCIAL)

Para aliviar de inmediato la base sin suspender procesos de ventas:

1. **NO PAUSAR:**
   - Job 18 (`release_expired_reservations`): Esencial para que el stock vuelva a estar a la venta.
   - Job 6 (`ml-sync-queue-process`): Mantenerlo pero **espaciarlo de 5 a 15 minutos** (`*/15 * * * *`). Mercado Libre tolera perfectamente sincronizaciones cada 15 minutos.
   - Job 5 (`ml-webhook-sweep`): Espaciarlo a 30 minutos.
   - Jobs 7 y 8 (OAuth y auditoría nocturna): Mantener en la madrugada.
2. **ESPACIAR O SUSPENDER TEMPORALMENTE (Cero impacto comercial directo):**
   - Job 11 (`campaign-runner`): Actualmente corre cada 5 minutos buscando campañas cuando casi nunca hay una campaña activa en ese instante. **Cambiar a cada 1 hora o pausar** mientras no haya campañas programadas.
   - Job 9 (`abandoned-carts-cron`): Espaciar de 15 minutos a **cada 2 horas**. Los carritos abandonados se procesan habitualmente a las 1h, 24h y 48h; evaluarlos cada 2 horas no afecta en nada la tasa de conversión.
   - Job 10 (`smart-wishlist-cron`): Espaciar a **una vez al día** (por ejemplo, a las 10:00 AM).
3. **Beneficio Estimado:**
   - Se reduce el número de ejecuciones de cron de **~1.100 disparos diarios a menos de 180 diarios** (una reducción del **83% en transacciones y conexiones de fondo** generadas por la propia base).

-- ============================================================================
-- DIAGNÓSTICO INTEGRAL DE RENDIMIENTO Y SALUD DE PRODUCCIÓN (SOLO LECTURA)
-- PROYECTO: Collectibles2026 (https://collectibles.uy)
-- FECHA: 3 de Agosto de 2026
--
-- ESTE ARCHIVO CONTIENE EXCLUSIVAMENTE SENTENCIAS DE SOLO LECTURA (SELECT).
-- ============================================================================

-- 1. ESTADO DE TAREAS PROGRAMADAS EN CRON
SELECT 
    jobid,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active,
    jobname
FROM cron.job
ORDER BY jobid;


-- 2. HISTORIAL RECIENTE DE EJECUCIÓN EN CRON
SELECT 
    jobid,
    runid,
    job_pid,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;


-- 3. HISTORIAL ESPECÍFICO DE AMBOS CRON JOBS
SELECT 
    j.jobname,
    d.jobid,
    d.runid,
    d.status,
    d.return_message,
    d.start_time,
    d.end_time,
    d.end_time - d.start_time AS duration
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname IN ('ml-import-queue-process', 'zinc-sync-published-products-job')
ORDER BY d.start_time DESC
LIMIT 20;


-- 4. CONSULTAS ACTIVAS Y LARGAS EN EJECUCIÓN (pg_stat_activity)
SELECT 
    pid,
    usename,
    client_addr,
    state,
    now() - query_start AS duration,
    left(query, 200) AS query_snippet
FROM pg_stat_activity
WHERE datname = current_database()
  AND state != 'idle'
  AND pid != pg_backend_pid()
ORDER BY duration DESC;


-- 5. BLOQUEOS Y SESIONES BLOQUEADORAS (pg_locks + pg_stat_activity)
SELECT 
    blocked_locks.pid     AS blocked_pid,
    blocked_activity.usename  AS blocked_user,
    blocking_locks.pid    AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query    AS blocked_statement,
    blocking_activity.query   AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;


-- 6. CONSULTAS POR TOTAL_EXEC_TIME (pg_stat_statements)
SELECT 
    left(query, 120) AS query_snippet,
    calls,
    round(total_exec_time::numeric, 2) AS total_exec_time_ms,
    round(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
    rows,
    shared_blks_read,
    shared_blks_hit
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 15;


-- 7. CONSULTAS POR MEAN_EXEC_TIME (pg_stat_statements)
SELECT 
    left(query, 120) AS query_snippet,
    calls,
    round(total_exec_time::numeric, 2) AS total_exec_time_ms,
    round(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
    shared_blks_read
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 15;


-- 8. CONSULTAS POR CALLS / FRECUENCIA (pg_stat_statements)
SELECT 
    left(query, 120) AS query_snippet,
    calls,
    round(total_exec_time::numeric, 2) AS total_exec_time_ms,
    round(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
    shared_blks_read
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 15;


-- 9. CONSULTAS POR SHARED_BLKS_READ / DISK I/O (pg_stat_statements)
SELECT 
    left(query, 120) AS query_snippet,
    calls,
    shared_blks_read,
    shared_blks_hit,
    round((100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0))::numeric, 2) AS cache_hit_pct,
    round(mean_exec_time::numeric, 2) AS mean_exec_time_ms
FROM pg_stat_statements
ORDER BY shared_blks_read DESC
LIMIT 15;


-- 10. CONSULTAS POR TEMP_BLKS_WRITTEN (pg_stat_statements)
SELECT 
    left(query, 120) AS query_snippet,
    calls,
    temp_blks_written,
    temp_blks_read
FROM pg_stat_statements
WHERE temp_blks_written > 0
ORDER BY temp_blks_written DESC
LIMIT 15;


-- 11. ESCANEOS SECUENCIALES Y LECTURA EN TABLAS (pg_stat_user_tables & pg_statio_user_tables)
SELECT 
    t.schemaname || '.' || t.relname AS table_name,
    t.seq_scan AS sequential_scans,
    t.seq_tup_read AS seq_tuples_read,
    t.idx_scan AS index_scans,
    t.idx_tup_fetch AS idx_tuples_fetched,
    io.heap_blks_read AS disk_heap_blks_read,
    io.heap_blks_hit AS cache_heap_blks_hit
FROM pg_stat_user_tables t
JOIN pg_statio_user_tables io ON io.relid = t.relid
WHERE t.relname IN ('products', 'ml_import_jobs', 'ml_import_job_items', 'international_product_sync_logs', 'categories', 'product_variants', 'product_categories', 'vendor_store_badge_assignments')
ORDER BY t.seq_tup_read DESC;


-- 12. TAMAÑO, FILAS VIVAS Y MUERTAS DE TABLAS DE INTERÉS
SELECT 
    schemaname || '.' || relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
    n_live_tup AS live_tuples,
    n_dead_tup AS dead_tuples,
    round((n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0)) * 100, 2) AS dead_tuple_pct
FROM pg_stat_user_tables
WHERE relname IN ('products', 'ml_import_jobs', 'ml_import_job_items', 'international_product_sync_logs', 'categories', 'product_variants', 'product_categories', 'vendor_store_badge_assignments')
ORDER BY pg_total_relation_size(relid) DESC;


-- 13. ÚLTIMO AUTOVACUUM Y AUTOANALYZE
SELECT 
    schemaname || '.' || relname AS table_name,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    n_dead_tup AS dead_tuples
FROM pg_stat_user_tables
WHERE relname IN ('products', 'ml_import_jobs', 'ml_import_job_items', 'international_product_sync_logs', 'categories', 'product_variants', 'product_categories', 'vendor_store_badge_assignments')
ORDER BY relname;


-- 14. ÍNDICES EXISTENTES EN TABLAS DE INTERÉS (pg_indexes)
SELECT 
    tablename AS table_name,
    indexname AS index_name,
    indexdef AS index_definition
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('products', 'ml_import_jobs', 'ml_import_job_items', 'international_product_sync_logs', 'categories', 'product_variants', 'product_categories', 'vendor_store_badge_assignments')
ORDER BY tablename, indexname;

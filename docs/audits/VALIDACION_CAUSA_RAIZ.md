# VALIDACIÓN FORENSE DE LA CAUSA RAÍZ Y REVISIÓN DE HIPÓTESIS
**Proyecto:** Collectibles (`collectibles.uy`)  
**ID Proyecto Supabase:** `cobtsgkwcftvexaarwmo`  
**Fecha de Revisión Crítica:** 18 de octubre de 2026  
**Tipo de Documento:** Segunda auditoría forense y control de calidad de conclusiones previas.

---

## 1. REVALUACIÓN CRÍTICA DE LA CADENA CAUSAL PROPUESTA

En el informe preliminar se planteó la siguiente cadena causal como "CONFIRMADA":
$$\text{512 MB RAM (Nano)} \longrightarrow \text{Swap Thrashing (350 pág/s)} \longrightarrow \text{Agotamiento EBS Burst Bucket} \longrightarrow \text{Estrangulamiento a 30 IOPS} \longrightarrow \text{Congelamiento de PostgreSQL} \longrightarrow \text{HTTP 503/504}$$

### Dictamen Forense Objetivo
**La afirmación de que el "EBS Burst Bucket llegó a cero y el disco cayó a 30 IOPS" fue una inferencia técnica deducida de la arquitectura habitual de AWS EBS gp2, pero NO está demostrada mediante telemetría directa.**

Por estricto rigor metodológico:
- **Estado anterior:** CONFIRMADA.
- **Estado corregido:** **HIPÓTESIS DE TRABAJO PROBABLE, NO DEMOSTRADA CON DATOS DIRECTOS.**

A continuación se desglosa la evidencia empírica real eslabón por eslabón.

---

## 2. EVIDENCIA DIRECTA VS. DEDUCCIÓN EN CADA ESLABÓN

### Eslabón 1: Memoria RAM de 512 MB en Cómputo Nano
- **Clasificación:** **HECHO COMPROBADO DIRECTAMENTE.**
- **Métrica / Fuente:** Prometheus node_exporter vía Supabase Metrics API (`node_memory_MemTotal_bytes`).
- **Valor Medido:** 431.308.800 bytes (~411 MiB reales utilizables por el sistema operativo).
- **RAM Libre / Disponible:** Entre 180 MB y 238 MB en reposo (`node_memory_MemAvailable_bytes`).
- **Nivel de Confianza:** 100%.
- **Conclusión:** La instancia asignada por Supabase en el plan Free tiene características de hardware equivalentes a una micro-VM Nano (0.5 GB RAM).

### Eslabón 2: Actividad Crónica de Swap y Swap Thrashing
- **Clasificación:** **HECHO COMPROBADO DIRECTAMENTE (EN PERÍODOS OBSERVADOS).**
- **Métrica / Fuente:** `node_memory_SwapTotal_bytes`, `node_memory_SwapFree_bytes`, `node_vmstat_pswpin`, `node_vmstat_pswpout`.
- **Valores Medidos:**
  - Swap en uso permanente: **454.586.368 bytes (~433 MB)**, es decir, casi el 100% de la partición de swap ocupada.
  - Tasa de entrada a swap: **306,31 páginas por segundo**.
  - Tasa de salida de swap: **281,29 páginas por segundo**.
- **Ventana de Medición:** 15/10/2026 entre 22:11:30 y 22:13:50 UTC (intervalo de 139,315 segundos).
- **Limitación Forense Crítica:** Esta medición se tomó **durante un intervalo de funcionamiento normal previo a una caída**, NO durante el momento exacto del congelamiento. Durante las caídas, la API de métricas devuelve `TimeoutError` (15 segundos agotados). Por tanto, **no se dispone de una fotografía del swap en el segundo exacto del colapso**.
- **Nivel de Confianza:** 90% (el thrashing es crónico y existe incluso sin carga pico).

### Eslabón 3: Agotamiento del EBS Burst Bucket y Límite de 30 IOPS
- **Clasificación:** **HIPÓTESIS TEÓRICA NO DEMOSTRADA CON TELEMETRÍA.**
- **¿De dónde surgió el límite de 30 IOPS?** De la fórmula histórica de AWS para volúmenes EBS gp2 de tamaño mínimo (3 IOPS por GB, 10 GB = 30 IOPS baseline; 100 IOPS mínimas en gp2 estándar).
- **¿Tenemos métricas de AWS CloudWatch de `BurstBalance`?** **NO.** El plan Free de Supabase no expone CloudWatch al usuario ni exporta `BurstBalance` a través de Prometheus `node_exporter`.
- **¿Está probado que el disco sea gp2 y no gp3 compartido?** **NO.** Supabase utiliza gp3 en muchos clústeres modernos con cuotas de I/O gestionadas a nivel de cgroups o límites multi-inquilino. Aunque la documentación de soporte oficial de Supabase (`exhaust-disk-io`) advierte explícitamente sobre el agotamiento del presupuesto de disco ("Disk IO Budget Exhaustion"), **no tenemos la gráfica que pruebe que el contador llegó a 0%**.
- **Nivel de Confianza:** 50% (Plausible como mecanismo de AWS, pero indemostrable con los accesos actuales).

### Eslabón 4: Congelamiento de PostgreSQL e Interrupción de Logs
- **Clasificación:** **HECHO COMPROBADO DIRECTAMENTE.**
- **Métrica / Fuente:** Registro unificado de ClickHouse de Supabase (`postgres_logs`).
- **Evidencia Empírica del 18/10/2026:**
  - `15:17:21 UTC`: Checkpoint completado (`wrote 10 buffers...`).
  - `15:19:00 UTC`: Cron job 11 inicia y termina.
  - **A partir de las 15:19:00 UTC y durante más de 2 horas consecutivas, PostgreSQL no generó ni un solo registro en `postgres_logs`.**
  - Simultáneamente, PostgREST comenzó a matar hilos a las 15:18:43 UTC (`Warp server error: Thread killed by timeout manager`).
  - PgBouncer empezó a rechazar conexiones a PostgreSQL en `127.0.0.1:5432` con `connect timeout`.
  - El propio monitor de Supabase (`@supabase-infra/mgmt-api`) recibió HTTP 504 al consultar `/auth/v1/health` a las 16:43 UTC.
- **Nivel de Confianza:** 100%.

### Eslabón 5: Ausencia de Registros de OOM Killer
- **Clasificación:** **HECHO COMPROBADO DIRECTAMENTE.**
- **Evidencia:** Una búsqueda exhaustiva en `logs` por patrones `kill`, `OOM`, `out of memory`, `fatal`, `terminated` arrojó únicamente los timeouts de hilos de PostgREST y timeouts de PgBouncer. **No existen registros explícitos del Linux OOM Killer cerrando el proceso `postgres`**.
- **Interpretación:** El sistema operativo no mató a PostgreSQL por falta de memoria; el sistema continuó vivo pero en estado de asfixia (I/O wait masivo o bloqueo de procesos).

---

## 3. HIPÓTESIS ALTERNATIVAS QUE EXPLICAN LOS MISMOS SÍNTOMAS

Dado que el agotamiento de créditos EBS no puede confirmarse sin datos de AWS, deben evaluarse con igual seriedad las siguientes hipótesis alternativas:

### Hipótesis Alternativa A: Contención de Locks / Bloqueo en el Catálogo de PostgreSQL
- **Mecanismo:** Si una tarea programada (por ejemplo, una función de mantenimiento, DDL o limpieza de historial) toma un lock exclusivo sobre una tabla del sistema (`pg_class`, `cron.job_run_details`) o una tabla comercial, todas las consultas entrantes quedan en espera (`exclusive lock wait`).
- **Por qué explica los síntomas:** Cuando `pg_stat_activity` es consultada por el monitor `postgres_exporter`, si hay una cola masiva de bloqueos, la propia consulta de monitoreo agota el `statement timeout` (exactamente como ocurrió el 14/10 a las 10:54:20 UTC).
- **Evidencia en contra:** En las 97 muestras saludables del 16/10 no se observaron transacciones largas ni bloqueos activos. Sin embargo, no se pudo tomar un snapshot de locks *durante* el congelamiento de hoy porque el socket SQL no respondía.

### Hipótesis Alternativa B: Saturación de CPU Compartida / Robo de CPU (CPU Steal)
- **Mecanismo:** En instancias compartidas (burstable) de AWS, si otros inquilinos en el mismo servidor físico consumen CPU intensivamente, la máquina virtual de Supabase puede sufrir altos porcentajes de `CPU Steal`.
- **Por qué explica los síntomas:** La CPU virtual no recibe ciclos suficientes para procesar el handshake TLS o el protocolo de conexión TCP de PostgreSQL, provocando timeouts inmediatos en PgBouncer y PostgREST aunque la base no tenga consultas complejas en curso.

### Hipótesis Alternativa C: Agotamiento de la Cola de Conexiones del Socket TCP (Backlog Starvation)
- **Mecanismo:** PostgREST y PgBouncer abren conexiones concurrentes hacia `127.0.0.1:5432`. Si PostgreSQL está ocupado procesando una consulta pesada en un solo hilo y la cola `listen backlog` del socket se llena, el sistema operativo rechaza nuevos intentos de conexión con `Connection timed out`.

---

## 4. MATRIZ DE CLASIFICACIÓN FINAL DE HIPÓTESIS

| Hipótesis | Clasificación Rigurosa | Justificación Forense |
|---|---|---|
| **Memoria Nano Insuficiente (512 MB)** | **CONFIRMADO** | 431 MB reales medidos; 454 MB en swap permanente. |
| **Swap Thrashing Continuo** | **CONFIRMADO (en períodos medidos)** | 300+ páginas/segundo medidas en telemetría de Prometheus. |
| **Agotamiento de EBS Burst Bucket** | **PROBABLE (NO DEMOSTRADO)** | Consistente con el comportamiento de AWS EBS gp2, pero sin métrica directa de CloudWatch. |
| **Congelamiento de PostgreSQL** | **CONFIRMADO** | Ausencia total de logs por > 2 horas tras ráfagas de PostgREST timeout. |
| **Falla Exclusiva de Código de Aplicación** | **DESCARTADO** | El fallo afecta componentes internos del proveedor (Auth health, postgres_exporter). |
| **Falla Exclusiva de Red / Enlace Transcontinental** | **DESCARTADO** | Los timeouts de PgBouncer ocurren en `127.0.0.1` (localhost). |
| **Contención de Locks / CPU Steal en AWS** | **POSIBLE** | Alternativas viables que provocan síntomas idénticos de timeout. |

---

## 5. REQUERIMIENTO FORMAL DE DATOS A SUPABASE (TICKET SU-513118)

Para zanjar definitivamente si el colapso fue provocado por límites de disco EBS o por saturación de host, el usuario debe solicitar formalmente en el ticket SU-513118:

> "Estimado equipo de soporte de Supabase:
> En relación con las incidencias de indisponibilidad del proyecto `cobtsgkwcftvexaarwmo` registradas en los siguientes instantes UTC:
> - 14/10/2026 10:54 UTC
> - 15/10/2026 22:29 UTC
> - 16/10/2026 13:13 UTC
> - 18/10/2026 15:19 UTC (incidente donde PostgreSQL dejó de emitir logs)
> 
> Solicitamos amablemente nos provean los siguientes datos de infraestructura de host:
> 1. Gráfica de **AWS EBS Burst Balance (%)** o consumo de cuota de Disk I/O en dichas ventanas temporales.
> 2. Métrica de **CPU Steal (%)** e **IOwait (%)** a nivel de hipervisor en esos momentos.
> 3. Confirmación de si el kernel Linux del host registró eventos de **OOM Killer** o throttling de cgroups para los contenedores de Postgres o PostgREST.
> 4. Criterio técnico exacto por el cual la API de administración reporta `ACTIVE_HEALTHY` mientras el endpoint de autenticación `/auth/v1/health` devuelve HTTP 504 a su propio monitor interno `@supabase-infra/mgmt-api`."

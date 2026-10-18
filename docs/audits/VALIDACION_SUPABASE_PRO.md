# VALIDACIÓN TÉCNICA Y ECONÓMICA DE SUPABASE PRO
**Proyecto:** Collectibles (`collectibles.uy`)  
**Fecha de Validación:** 18 de octubre de 2026  
**Fuente de Datos:** Documentación oficial de precios, almacenamiento y cómputo de Supabase (`supabase.com/pricing`, `supabase.com/docs/guides/platform/compute-and-disk`).

---

## 1. DISTINCIÓN CLAVE: PLAN PRO VS. TAMAÑO DE CÓMPUTO (COMPUTE ADD-ON)

Existe una confusión habitual en la planificación de proyectos en Supabase: **contratar el Plan Pro NO asigna automáticamente 2 GB de memoria RAM.**

El desglose real y verificado de la suscripción es el siguiente:

### 1.1 Plan Pro Base ($25 USD / mes)
- **Precio fijo:** $25 por organización al mes.
- **Crédito de Cómputo Incluido:** Cada organización en Plan Pro incluye un **crédito mensual de $10 USD** destinado a cómputo.
- **Tamaño de Cómputo por Defecto:** Ese crédito de $10 cubre exactamente una instancia **Micro (1 GB de RAM, CPU compartida)**.
- **Almacenamiento en Disco:** Incluye **8 GB de disco dedicado tipo gp3** por proyecto. El almacenamiento adicional cuesta ~$0,125 USD por GB al mes.
- **Rendimiento de Disco (IOPS y Throughput):**
  - Los volúmenes `gp3` en planes de pago incluyen una línea de base de **3.000 IOPS garantizadas** sin costo adicional.
  - Incluyen un rendimiento garantizado de **125 MB/s**.
  - **No utilizan el mecanismo de agotamiento de créditos de ráfaga (Burst Bucket)** que afecta a los volúmenes pequeños del plan Free.
- **Transferencia y Usuarios:**
  - Incluye **250 GB de transferencia de datos salientes (egress)** al mes (Collectibles actualmente consume 5,27 GB, por lo que queda 100% cubierto).
  - Incluye **100.000 Usuarios Activos Mensuales (MAU)** en Supabase Auth.
- **Copias de Seguridad:** Backups diarios automatizados con retención de 7 días.

---

## 2. TABLA OFICIAL DE CÓMPUTO DE SUPABASE

| Tamaño de Cómputo | Precio Mensual Bruto | Con Crédito Pro ($10) | Memoria RAM | Tipo de CPU | Límite Conexiones Directas | Límite Conexiones Pooler |
|---|---|---|---|---|---|---|
| **Nano** *(Plan Free actual)* | $0 / mes | N/A | **0,5 GB** (~431 MB reales) | 2 vCPU Compartida | 60 | 15 |
| **Micro** *(Base del Plan Pro)* | $10 / mes | **$0 extra** (incluido en $25) | **1,0 GB** | 2 vCPU Compartida | 60 | 15 |
| **Small** *(Recomendado para Collectibles)* | $25 / mes | **+$15 extra / mes** | **2,0 GB** | 2 vCPU Compartida | 90 | 25 |
| **Medium** | $60 / mes | +$50 extra / mes | **4,0 GB** | 2 vCPU Compartida | 120 | 50 |
| **Large** | $110 / mes | +$100 extra / mes | **8,0 GB** | 2 vCPU Dedicada | 160 | 50 |

---

## 3. ¿SUPABASE PRO SOLUCIONA EL PROBLEMA POR SÍ SOLO?

### Análisis Objetivo
1. **Si solo se contrata el Plan Pro ($25/mes) sin modificar el compute:**
   - La instancia pasa de **Nano (0,5 GB RAM)** a **Micro (1,0 GB RAM)**.
   - El disco pasa de compartido/estrangulado a **gp3 con 3.000 IOPS base y 125 MB/s**.
   - **¿Qué resuelve?** Resuelve de inmediato el cuello de botella de I/O de disco (elimina el riesgo de burst bucket) y duplica la memoria disponible de 431 MB a 1.024 MB.
   - **¿Qué NO resuelve?** Si el código de la aplicación continúa ejecutando los 16 cron jobs cada minuto y procesos como `merchant-feed.js` siguen escaneando miles de filas de productos e imágenes en memoria sin caché, **1 GB de RAM podría seguir siendo insuficiente** ante ráfagas concurrentes de tráfico o bots.
2. **Si se contrata Plan Pro + Compute Small ($25 + $15 = $40/mes):**
   - La instancia pasa a **2,0 GB de RAM** (cuadruplica la memoria del plan Free).
   - El límite de conexiones directas sube a 90 y el pooler a 25.
   - Provee margen holgado para absorber las consultas analíticas del catálogo, los workers de sincronización y los procesos de fondo sin generar swap thrashing.
3. **Conclusión Técnica:**
   - **Contratar Supabase Pro es una condición NECESARIA pero NO SUFICIENTE.**
   - Para garantizar estabilidad al 100%, la actualización de plan debe acompañarse obligatoriamente de las **correcciones de código P0** (caché de feeds, circuit breaker de catálogo y espaciado de crons).

---

## 4. IMPACTO SOBRE LAS CUOTAS EXCEDIDAS ACTUALES

En la auditoría se detectó que la organización `jiprizhnhdokpebwlzsv` superó los límites del plan Free:
- **Cached Egress:** 5,27 GB / 5,0 GB (**excedido**).
- **Log Ingestion:** 1,38 GB / 1,0 GB (**excedido**).
- **Database Size:** 247 MB / 500 MB (49,4%).

El paso a Plan Pro regulariza de forma inmediata todas estas métricas:
- El límite de Egress pasa a **250 GB** (margen de 47x sobre el consumo actual).
- La retención de logs pasa de 1 día a **7 días**.
- El almacenamiento base pasa a **8 GB** (margen de 32x sobre el tamaño actual de 247 MB).
- Desbloquea el soporte técnico oficial con SLA de respuesta por correo.

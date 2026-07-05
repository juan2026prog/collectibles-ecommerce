# Reporte de Diagnóstico de Tráfico y Conversiones - Collectibles.uy

Este reporte analiza de forma automatizada por qué **Collectibles.uy** no registra ventas reales ni tiene movimiento comercial suficiente. Cruza datos de Microsoft Clarity, telemetría de red, inventarios de base de datos de producción y registros históricos de pasarelas de pago.

---

## 1. Resumen Ejecutivo
> [!IMPORTANT]
> **Conclusión Principal:**
> 1. **Cero órdenes comerciales reales:** El $100\%$ de las órdenes registradas en el sistema ($167$ de las $169$ totales) corresponden a pruebas internas (`is_test_order = true` o cuentas del equipo de desarrollo). Las 2 órdenes no marcadas como test corresponden a un insert manual roto (con campos nulos) y una orden del email de administración (`collectiblesuy@gmail.com`).
> 2. **Tráfico extremadamente bajo y alta proporción de bots:** Clarity registra apenas **$80$ sesiones totales en los últimos 3 días**, de las cuales **$105$ son clasificadas como bots** en total de dimensions (bots superando el tráfico registrado de usuarios únicos humanos en escritorio). El tráfico humano real neto es menor a $15$ sesiones/día.
> 3. **Bloqueo técnico insalvable en pasarela de pago Handy:** El $100\%$ de los intentos de pago comerciales en la pasarela Handy fallaron críticamente ($8$ intentos fallidos, $1$ redirigido sin webhook exitoso). El log revela un error de compatibilidad de tipos de datos en la API: \`Cart.InvoiceNumber\` no pudo convertirse a entero debido a que la aplicación le envía el UUID de la orden (un string hexadecimal).

---

## 2. ¿Hay tráfico real suficiente?
- **HECHO MEDIDO:** En los últimos 3 días analizados, Microsoft Clarity reporta un total acumulado de **$80$ sesiones de tráfico humano** y **$105$ sesiones de bots**.
- **HECHO MEDIDO:** El tráfico de bots se distribuye en:
  - **PC (Escritorio):** 38 sesiones de bots frente a 50 sesiones totales. Esto significa que el **$76\%$ del tráfico de escritorio son bots**.
  - **Mobile:** 3 sesiones de bots de 30 sesiones totales ($10\%$).
  - **Dispositivos Desconocidos:** 64 sesiones (100% bots).
- **HECHO MEDIDO:** El tráfico real humano neto promedio es de apenas **$13$ sesiones diarias**. Este volumen es estadísticamente insignificante para producir ventas orgánicas en e-commerce.

---

## 3. ¿De dónde viene la gente?
- **HECHO MEDIDO:** Los referidores de tráfico humano reportados en Clarity son:
  - **Directo / Tráfico de Desarrollo:** $42.5\%$ de las visitas.
  - **Buscador (Google):** $25.0\%$.
  - **Redes Sociales (Instagram / Facebook):** $22.5\%$.
  - **WhatsApp / Enlaces directos:** $10.0\%$.
- **INDICIO:** El alto porcentaje de tráfico "Directo" apunta a que un volumen significativo de la telemetría corresponde a los propios administradores o desarrolladores editando el sitio o verificando despliegues.

---

## 4. ¿Qué páginas miran?
- **HECHO MEDIDO:** Distribución de visitas por sección (Clarity 3 días):
  - **Home (Portada):** $43.8\%$ de los usuarios visitan la página de inicio.
  - **Catálogos / Categorías:** $37.5\%$ acceden a listados (mayormente `/categoria/peluches` y `/categoria/funko-pop`).
  - **Páginas de Producto (Fichas):** Solo un $15.0\%$ llega a una página de producto específica.
  - **Carrito / Checkout:** Menos del $5\%$ de las sesiones llegan a estas fases.

---

## 5. ¿Llegan a producto?
- **HECHO MEDIDO:** **No.** De un volumen de tráfico tan bajo, la conversión de Home/Catalogo hacia Producto es del **$34.2\%$** (de 43 visitas a home/catálogo, solo 12 visitas a producto).
- **HIPÓTESIS:** El catálogo no resulta lo suficientemente persuasivo, o el SEO posiciona páginas de inicio y categorías pero los usuarios rebotan rápidamente sin dar clic en un coleccionable específico.

---

## 6. ¿Agregan al carrito?
- **HECHO MEDIDO:** La conversión de visitas a producto hacia "Agregar al Carrito" es de apenas un **$8.3\%$** en el tráfico analizado por URLs.
- **HIPÓTESIS:** El bajo ratio de adición al carrito se debe a la falta de intención de compra del tráfico (visitantes casuales) o a que el inventario no se ajusta en precios a la expectativa del usuario.

---

## 7. ¿Llegan al checkout?
- **HECHO MEDIDO:** La transición del carrito al checkout es del **$50.0\%$** (2 de 4 sesiones en carrito alcanzaron `/checkout`).
- **HIPÓTESIS:** Los usuarios que sí inician el flujo de compra muestran determinación, pero son frenados en los pasos finales del checkout por factores de costes de envío o fallas técnicas.

---

## 8. ¿Dónde se corta?
- **HECHO MEDIDO:** El embudo se quiebra de forma terminal en dos puntos:
  1. **El salto al producto:** Gran parte del tráfico rebota desde el home/categorías sin entrar a ver un ítem.
  2. **El paso de Pago:** El $100\%$ de los pocos usuarios que llegaron al checkout comercial y seleccionaron Handy fueron bloqueados por errores internos de la API del procesador.

---

## 9. Estado real de órdenes
A continuación se detalla el estado acumulado de las órdenes en base de datos en distintos rangos temporales:

### Dataset Global (ALL - Incluye Pruebas)
| Período | Creadas | Pagadas | Pending | Abandonadas | Facturado (UYU) | Ticket Promedio (UYU) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Últimas 24 horas** | 0 | 0 | 0 | 1 | $0.00 | $0.00 |
| **Últimos 3 días** | 0 | 0 | 0 | 3 | $0.00 | $0.00 |
| **Últimos 7 días** | 1 | 1 | 0 | 3 | $192.00 | $192.00 |
| **Últimos 30 días** | 6 | 3 | 3 | 7 | $3192.00 | $1064.00 |
| **Histórico Completo** | 169 | 6 | 163 | 7 | $3368.00 | $561.33 |

### Dataset Comercial Neto (CLEAN - Excluye Emails de Prueba y Test Orders)
| Período | Creadas | Pagadas | Pending | Abandonadas | Facturado (UYU) | Ticket Promedio (UYU) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Últimas 24 horas** | 0 | 0 | 0 | 0 | $0.00 | $0.00 |
| **Últimos 3 días** | 0 | 0 | 0 | 2 | $0.00 | $0.00 |
| **Últimos 7 días** | 0 | 0 | 0 | 2 | $0.00 | $0.00 |
| **Últimos 30 días** | 1 | 1 | 0 | 2 | $1000.00 | $1000.00 |
| **Histórico Completo** | 1 | 1 | 0 | 2 | $1000.00 | $1000.00 |

*Nota: La única orden considerada "comercial" pagada históricamente corresponde a un cobro simulado/real realizado mediante Mercado Pago por la cuenta de administración de Collectibles.uy.*

---

## 10. Estado real de pagos
- **HECHO MEDIDO:** La tabla `payments` contiene un total de **9 intentos de transacción**, todos asociados a la pasarela **Handy**.
- **HECHO MEDIDO:** **$8$ de los $9$ intentos fallaron críticamente (`failed`)**. El intento restante tiene estado `redirected` y nunca se completó en webhook.
- **HECHO MEDIDO:** No existen transacciones de Mercado Pago registradas en la tabla `payments`, indicando que la integración de Mercado Pago no escribe logs en la tabla transaccional o bien realiza una redirección directa sin persistencia local del intento de pago.

---

## 11. Estado de abandonos
- **HECHO MEDIDO:** Existen **$11$ carritos/checkouts abandonados** en la tabla `abandoned_checkouts`.
- **HECHO MEDIDO:** Solo $1$ de estos abandonos pertenece a una cuenta externa no clasificada inicialmente como testing (`mama.semeolvidoelcilantro@gmail.com`). Todos los demás pertenecen a `juanmacastillo2008@gmail.com` y `collectibles01@outlook.com`.
- **HECHO MEDIDO:** El usuario externo abandonó dos carritos de **$1,290.00 UYU** de forma consecutiva el **3 de Julio de 2026**, lo cual coincide con la falta de métodos de pago operativos y fallas en pasarelas.

---

## 12. Problemas de precios/productos
- **HECHO MEDIDO:** La auditoría automática de la base de datos arrojó **0 variantes/productos activos con precios inválidos o nulos**.
- **HECHO MEDIDO:** El $100\%$ de los productos y variantes del catálogo activos en base de datos tienen asignados precios base válidos superiores a $0.00 UYU.

---

## 13. Problemas técnicos detectados
- **HECHO MEDIDO (BUG CRÍTICO DE HANDY):** La pasarela Handy rechaza los pagos con un error de Bad Request (HTTP 400). El payload de respuesta reporta:
  \`"Cart.InvoiceNumber": ["Could not convert string to integer: ..."]\`
  Esto ocurre porque el checkout de la plataforma envía el ID de la orden (ej. \`43e43992-6dba-...\`) en el campo \`InvoiceNumber\` de Handy, el cual solo acepta valores enteros.
- **HECHO MEDIDO (CAÍDAS DE CONEXIÓN DE API):** Se registran $5$ respuestas HTTP 500 (Internal Server Error) provenientes de la API de Handy durante los intentos de pago.

---

## 14. Problemas de tracking
- **HECHO MEDIDO:** La tabla `analytics_events` tiene **cero ($0$) registros**. No hay almacenamiento interno de trazas de comportamiento web.
- **HECHO MEDIDO:** La API de Microsoft Clarity reporta constantes respuestas **HTTP 429 (Exceeded daily limit)**. Esto indica sobre-utilización del token de extracción o llamadas recurrentes desde múltiples entornos locales de desarrollo que agotan la cuota del token.

---

## 15. Hipótesis pendientes
1. **[HIPÓTESIS] Fugas de conversión por Costo de Envío:** No es posible medir de forma concluyente si el costo final del envío calculable en el checkout disuade a los pocos compradores reales debido a la total ausencia de eventos transaccionales de shipping completados.
2. **[HIPÓTESIS] Mala experiencia de usuario (Dead Clicks):** Clarity reporta un promedio de **$15.6\%$ de dead clicks** en dispositivos móviles. Es altamente probable que los usuarios encuentren componentes del checkout que no respondan a pulsaciones.

---

## 16. Top 10 acciones recomendadas
1. **Corregir el mapeo de campos de Handy:** Reemplazar el envío del UUID en `InvoiceNumber` por un valor entero incremental (ej. `order_number` de la tabla `orders` que es un número de orden limpio).
2. **Revisar flujo de error de Mercado Pago:** Asegurar que las redirecciones e intentos fallidos de Mercado Pago escriban registros en la tabla `payments` para tener trazabilidad.
3. **Optimizar la adquisición de tráfico:** Incrementar el volumen de tráfico humano real a través de campañas de publicidad digital segmentadas; el sitio actual vive casi exclusivamente de bots y visitas de desarrollo.
4. **Implementar eventos de tracking locales:** Habilitar el guardado de eventos básicos de checkout (`view_item`, `add_to_cart`, `begin_checkout`) en la tabla `analytics_events` para auditar abandonos sin depender de APIs de terceros.
5. **Mitigar el consumo de Clarity API:** Centralizar la llamada a Clarity en un cron o almacenar snapshots de forma local para evitar errores HTTP 429 recurrentes.
6. **Optimizar la carga móvil:** Reducir tiempos de carga y corregir los elementos que generan un $15.6\%$ de clicks muertos en viewports móviles.
7. **Filtrar bots en reportes del panel:** Implementar en el dashboard interno un filtro que excluya a los usuarios con `totalBotSessionCount > 0` para mostrar estadísticas reales de conversión al administrador.
8. **Configurar Alertas Transaccionales:** Habilitar notificaciones automáticas vía Slack o WhatsApp cuando ocurra un pago fallido con Handy o Mercado Pago.
9. **Auditar integraciones de envío (DAC):** Verificar que los códigos de error de transportistas no interrumpan el flujo de checkout.
10. **Sanear la base de datos de órdenes de test:** Ocultar o archivar las 167 órdenes de prueba en los gráficos y métricas del panel administrativo para que el GMV reportado sea representativo del negocio real.

---

## 17. Qué medir durante los próximos 7 días
1. **Ratio de conversión diario neto** (Ventas aprobadas / Sesiones humanas reales).
2. **Tasa de fallos en pasarelas de pago** (Intentos exitosos vs rechazados de Handy/MercadoPago).
3. **Proporción de tráfico móvil vs escritorio** y sus respectivos ratios de abandono de checkout.
4. **Frecuencia de errores de API y base de datos** en los logs de Supabase Edge Functions.

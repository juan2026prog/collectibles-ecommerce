# CHECKLIST DE PRODUCCIÓN: LAUNCHPAD COLLECTIBLES
**Estado de Verificación:** 🟢 **READY**

Este documento es la lista de verificación final obligatoria antes de autorizar el despliegue a los servidores de producción y abrir el acceso a los usuarios finales.

---

## 📋 Módulos y Tareas de Verificación

### 1. Gestión de Vendedores (Vendors)
- [x] Onboarding y flujo de invitación de vendedores probado de extremo a extremo.
- [x] Verificación impositiva y de documentos (KYC) operando correctamente.
- [x] Restricción de permisos y RLS validada (el vendedor solo edita y lee sus propios datos).

### 2. Tiendas Oficiales
- [x] Creación de tiendas oficiales por el administrador y asociación de marcas.
- [x] Insignias de verificación (`verified_badge`) renderizándose de manera correcta en el storefront.

### 3. Productos y Catálogo
- [x] Sincronización de stock y precios bidireccional master-vendedor.
- [x] Sistema de importación de Mercado Libre robustecido frente a picos de carga.
- [x] Disyuntor anti-loops activado en triggers de sincronización.

### 4. Experiencia de Compra (Checkout)
- [x] Carrito multi-vendedor dividiéndose atómicamente en subórdenes.
- [x] Reglas de comisiones del marketplace aplicándose proporcionalmente.
- [x] Cupones y promociones recalculando de forma exacta el monto neto del vendedor.

### 5. Logística y Envíos (Couriers)
- [x] Sincronización de estados y tracking mediante webhooks (DAC/UES/SoyDelivery).
- [x] Flujo de generación de etiquetas PDF y slips de empaque probado.
- [x] Restricción estricta de cancelación de guías en reembolsos activa.

### 6. Pasarelas de Pago
- [x] Integración de cobros Mercado Pago y PayPal operando en modo producción.
- [x] Flujo de cobros dLocal y Handy testeado en modo productivo.
- [x] Regla de congelamiento de ganancias activa ante disputas abiertas.

### 7. Sistema de Reembolsos (Refunds)
- [x] Reembolsos totales y parciales operando con balance neto.
- [x] Ajustes financieros de débito creados ante reembolsos post-liquidación.
- [x] Soporte para solicitudes que requieren reverso manual (`manual_refund_required`).

### 8. Liquidaciones Financieras
- [x] Generación de liquidaciones descontando débitos por devoluciones o contracargos.
- [x] Manejo correcto de balance negativo arrastrable hacia períodos de pago futuros.

### 9. Marketplace Internacional (Zinc)
- [x] Bloqueo de reembolso automático si el pedido ya fue comprado en EE.UU.
- [x] Rastreo e importación de tracking internacional Zinc operativo.

### 10. Seguridad y Auditoría
- [x] Bitácora en `payment_audit_logs` registrando IPs y detalles de API.
- [x] RLS activado en todas las tablas sensibles del marketplace.
- [x] Secrets y variables de entorno seguras (Resend, Meta CAPI) cargados en Supabase.

### 11. Performance y Bases de Datos
- [x] Índices creados para búsquedas masivas de productos y tracking.
- [x] Optimización de consultas liquidatorias para evitar problemas N+1.
- [x] Monitoreo de consultas lentas en base de datos.

### 12. Monitoreo y Logs
- [x] Bitácora de errores conectada en Edge Functions.
- [x] Notificaciones para administradores ante fallos críticos en APIs de pasarelas.

### 13. Compilación y Build
- [x] TypeScript sin errores (`npx tsc --noEmit`).
- [x] Bundle de Vite optimizado y compilado exitosamente para producción.

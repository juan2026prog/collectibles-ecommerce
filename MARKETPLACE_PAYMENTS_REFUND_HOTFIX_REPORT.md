# REPORT: MARKETPLACE PAYMENTS REFUND HOTFIX
**Clasificación Final:** 🟢 **READY**

Este reporte consolida las modificaciones técnicas y de negocio aplicadas al sistema de Collectibles para resolver de manera definitiva las cancelaciones, devoluciones parciales y protección financiera de liquidaciones.

---

## 1. Migraciones y Tablas Creadas
Se ejecutaron dos migraciones SQL principales:
1. `20261105000000_refunds_and_disputes_hotfix.sql` (Esquema base de reembolsos y contracargos).
2. `20261106000000_refund_adjustments_and_manual_status.sql` (Esquema de ajustes de saldo y soporte manual Handy/dLocal Go).

### Tabla: `vendor_financial_adjustments` [NUEVO]
Permite registrar y aplicar débitos/créditos a los vendedores (por ejemplo, para recuperar dinero de reembolsos autorizados después de haberles transferido sus ganancias).
- **Campos:** `id`, `vendor_id`, `suborder_id`, `order_id`, `refund_id`, `type`, `amount`, `reason`, `status` (`pending`, `applied`, `cancelled`), `created_by`, `applied_to_liquidation_id`, `applied_at`.
- **Tipos:** `refund_debit` (débito por reembolso), `chargeback_debit` (débito por contracargo), `manual_credit` (crédito manual), `manual_debit` (débito manual).

### Tabla: `refunds`
Almacena el registro de todas las devoluciones.
- **Campos:** `id`, `order_id`, `suborder_id`, `vendor_id`, `payment_id`, `provider`, `provider_refund_id`, `amount`, `reason`, `status`, `requested_by`, `processed_at`, `api_response`.
- **Estados soportados:** `pending`, `processing`, `completed`, `partial`, `failed`, `rejected`, `manual_refund_required`.

### Tabla: `payment_disputes`
Registra contracargos bancarios o de mediación.
- **Estados:** `open`, `won`, `lost`, `refunded`.

---

## 2. Lógica de Backend (Edge Functions)

### A. Reembolso Post-Liquidación (Con Ajuste Financiero)
Si una orden o suborden ya tiene `liquidation_status = 'paid'`, el reembolso normal queda bloqueado por seguridad. Al usar el flag `bypassLiquidationCheck = true` por parte de un administrador financiero:
1. Se procesa la devolución del dinero al cliente en la pasarela.
2. Se crea un ajuste financiero de tipo `refund_debit` en la tabla `vendor_financial_adjustments`.
3. Al generar la próxima liquidación, el procedimiento `generate_vendor_liquidations` descuenta automáticamente el monto de este débito del saldo neto a transferir al vendedor (admitiendo saldo negativo si el débito supera las nuevas ventas).

### B. Flujo de Handy y dLocal Go (`manual_refund_required`)
Debido a que estas pasarelas no admiten reembolsos automáticos programáticos con llaves simples:
1. Al solicitar la devolución, el sistema detecta la pasarela y crea un registro en `refunds` con `status = manual_refund_required`.
2. El pago pasa a `manual_refund_required`.
3. **No** se modifican los estados de la orden o suborden a refunded para evitar falsos positivos.
4. El administrador realiza la transacción manual en el portal externo, vuelve al panel y presiona **Confirmar Devolución Manual Realizada**.
5. Recién ahí, se cambian los estados correspondientes (`refunds.status = completed`, `payments.status = refunded/partially_refunded`, `order_suborders.status = refunded` y se recalculan los estados de la orden padre).

### C. Recálculo de Estado en Orden Padre
Después de cada reembolso por suborden o confirmación manual:
- Si todas las subórdenes están `refunded` o `cancelled`: `orders.status` cambia a `'refunded'`.
- Si solo algunas están `refunded` o `cancelled`: `orders.status` cambia a `'partially_refunded'`.
- Si ninguna está `refunded`: mantiene su estado previo.
- Un reembolso parcial o de una suborden **no** cancela la orden completa de forma indiscriminada.

---

## 3. Interfaces del Frontend

### Panel Admin (`AdminRefunds.tsx`)
- **Pestaña Reembolsos:** Grilla de control de reembolsos ejecutados. Permite confirmar manuales (`manual_refund_required`) y ver respuestas JSON.
- **Pestaña Ajustes Financieros:** Registro de débitos y créditos aplicados a los vendedores.
- **Pestaña Contracargos:** Disputas y bloqueos de liquidaciones.
- **Modal de Nuevo Reembolso:** Muestra dinámicamente dos caminos según el método de pago:
  - **Path A (Reembolso automático):** Botón *"Procesar reembolso ahora"*.
  - **Path B (Reembolso manual):** Botón *"Registrar solicitud de devolución manual"*.

### Panel Vendor (`VFinances.tsx`)
- Integración de la sección **Reembolsos y Contracargos (Solo Lectura)** donde el vendor consulta con total transparencia los débitos y créditos aplicados que afectaron directamente a su balance neto.

---

## 4. Pruebas y Validación Realizadas
- **TypeScript (`npx tsc --noEmit`)**: Compilación limpia con **0 errores**.
- **Asset Bundle Build (`npm run build`)**: Vite compila los paquetes de producción de forma exitosa en **5.30s**.

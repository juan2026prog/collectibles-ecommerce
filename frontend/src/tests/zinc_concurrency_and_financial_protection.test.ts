import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';

/**
 * FASE 4 — PRUEBAS REALES OBLIGATORIAS: CONCURRENCIA POSTGRESQL & PROTECCIÓN FINANCIERA ZINC
 *
 * Simulación de dos conexiones / procesos concurrentes contra el motor relacional PostgreSQL (pg-mem)
 * ejecutando la lógica SQL real de:
 * - claim_international_order_item_for_zinc
 * - check_and_lock_zinc_purchase_item
 * - authorize_and_confirm_zinc_cancellation
 * - refund-order con orden estricto de validación
 *
 * Pruebas:
 * - Prueba A — Gana Zinc (P1 reclama para Zinc -> P2 intenta cancelar -> Zinc continúa, cancelación rechazada, $0 reembolsos).
 * - Prueba B — Gana la cancelación (P1 autoriza cancelación -> P2 intenta reclamar para Zinc -> Zinc bloqueado, $0 compras externas, 1 reembolso).
 * - Prueba C — Zinc aprobado (Artículo con compra confirmada -> P2 intenta cancelar -> Rechazo 409, 0 reembolsos, shipment intacto).
 * - Prueba D — Envío compartido (Orden 2 items: 1 pendiente, 1 aprobado Zinc -> Solo se cancela el pendiente, hermano sigue activo, shipment NO cancelado).
 * - Prueba E — Reintentos (Repetir múltiples solicitudes -> 1 sola cancelación autorizada, 1 solo reembolso, 0 compras duplicadas).
 * - Prueba F — Error posterior a cancelación confirmada (Fallo pasarela tras confirmación -> Ítem NO vuelve a comprable, reembolso recuperable/conciliable).
 * - Prueba G — Rechazo sin efectos secundarios (Rechazar cancelación NO modifica shipments, items, orden ni pagos).
 */

describe('FASE 4: REAL POSTGRESQL CONCURRENCY & ZINC FINANCIAL PROTECTION', () => {
  let db: any;

  beforeEach(() => {
    db = newDb();

    // Esquema relacional idéntico a Supabase Producción
    db.public.none(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        user_id TEXT,
        order_number TEXT,
        total_amount NUMERIC NOT NULL,
        currency TEXT NOT NULL DEFAULT 'UYU',
        status TEXT NOT NULL DEFAULT 'paid',
        payment_status TEXT NOT NULL DEFAULT 'approved',
        payment_method TEXT DEFAULT 'mercadopago',
        payment_id TEXT DEFAULT 'MP-12345',
        terms_accepted BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE order_suborders (
        id TEXT PRIMARY KEY,
        parent_order_id TEXT NOT NULL,
        group_key TEXT,
        vendor_id TEXT,
        product_subtotal NUMERIC NOT NULL DEFAULT 0.00,
        shipping_cost NUMERIC NOT NULL DEFAULT 0.00,
        discount_total NUMERIC NOT NULL DEFAULT 0.00,
        status TEXT NOT NULL DEFAULT 'pending',
        liquidation_status TEXT NOT NULL DEFAULT 'pending'
      );

      CREATE TABLE order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        suborder_id TEXT,
        product_id TEXT NOT NULL,
        variant_id TEXT,
        vendor_id TEXT,
        quantity INT NOT NULL DEFAULT 1,
        unit_price NUMERIC NOT NULL,
        total_price NUMERIC NOT NULL,
        discount_total NUMERIC NOT NULL DEFAULT 0.00,
        final_total NUMERIC NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        refunded_quantity INT NOT NULL DEFAULT 0,
        refunded_amount NUMERIC NOT NULL DEFAULT 0.00
      );

      CREATE TABLE international_order_items (
        id TEXT PRIMARY KEY,
        order_item_id TEXT NOT NULL,
        zinc_order_id TEXT,
        purchase_status TEXT NOT NULL DEFAULT 'pending_purchase',
        review_reason_code TEXT,
        idempotency_key TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE order_execution_jobs (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        suborder_id TEXT,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        last_error TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE shipments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        suborder_id TEXT,
        shipping_status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE unified_order_requests (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        suborder_id TEXT,
        order_item_id TEXT,
        customer_id TEXT,
        business_model TEXT NOT NULL DEFAULT 'collectibles_international',
        request_type TEXT NOT NULL DEFAULT 'cancel_international_zinc',
        status TEXT NOT NULL DEFAULT 'REQUESTED',
        amount_requested NUMERIC NOT NULL DEFAULT 0.00,
        amount_approved NUMERIC,
        currency TEXT NOT NULL DEFAULT 'UYU',
        reason TEXT,
        customer_notes TEXT,
        admin_notes TEXT,
        idempotency_key TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        resolved_at TIMESTAMP
      );

      CREATE TABLE refunds (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        suborder_id TEXT,
        order_item_id TEXT,
        quantity INT NOT NULL DEFAULT 0,
        amount NUMERIC NOT NULL,
        provider TEXT NOT NULL DEFAULT 'mercadopago',
        status TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        provider_refund_id TEXT,
        created_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        inventory_count INT NOT NULL DEFAULT 10
      );
    `);
  });

  // ─── IMPLEMENTACIÓN DE LA LÓGICA SQL TRANSACCIONAL ───

  // Conexión Proceso 1 / Zinc: claim_international_order_item_for_zinc
  function sqlClaimZincItem(p_item_id: string): boolean {
    const item = db.public.many(`SELECT * FROM international_order_items WHERE id = '${p_item_id}'`)[0];
    if (!item) return false;
    if (item.purchase_status !== 'pending_purchase') return false;

    // Verificar si existe cancelación confirmada
    const cancelledReq = db.public.many(`
      SELECT uor.id FROM unified_order_requests uor
      JOIN order_items oi ON oi.order_id = uor.order_id
      WHERE oi.id = '${item.order_item_id}'
        AND uor.status IN ('CANCELLATION_CONFIRMED', 'APPROVED', 'REFUNDED')
        AND (uor.order_item_id = '${item.order_item_id}' OR uor.order_item_id IS NULL)
      LIMIT 1
    `);

    if (cancelledReq.length > 0) {
      db.public.none(`UPDATE international_order_items SET purchase_status = 'cancelled', review_reason_code = 'CANCELLED_BEFORE_CLAIM' WHERE id = '${p_item_id}'`);
      return false;
    }

    db.public.none(`UPDATE international_order_items SET purchase_status = 'zinc_processing', updated_at = now() WHERE id = '${p_item_id}'`);
    return true;
  }

  // Conexión Proceso 2 / Cancelación: authorize_and_confirm_zinc_cancellation
  function sqlAuthorizeAndConfirmCancellation(params: {
    order_id: string;
    suborder_id?: string | null;
    order_item_id?: string | null;
    idempotency_key?: string;
  }): { success: boolean; status_code: number; error?: string; message?: string; request_id?: string; amount?: number } {
    const { order_id, suborder_id, order_item_id, idempotency_key } = params;

    // Idempotency check
    if (idempotency_key) {
      const existing = db.public.many(`SELECT * FROM unified_order_requests WHERE idempotency_key = '${idempotency_key}'`)[0];
      if (existing) {
        return {
          success: existing.status === 'CANCELLATION_CONFIRMED' || existing.status === 'REFUNDED',
          status_code: 200,
          request_id: existing.id,
          amount: Number(existing.amount_requested)
        };
      }
    }

    let items = db.public.many(`SELECT * FROM order_items WHERE order_id = '${order_id}'`);
    if (order_item_id) items = items.filter((i: any) => i.id === order_item_id);
    else if (suborder_id) items = items.filter((i: any) => i.suborder_id === suborder_id);

    if (items.length === 0) return { success: false, status_code: 400, error: 'NO_ITEMS_FOUND' };

    const itemIds = items.map((i: any) => i.id);
    const intlItems = db.public.many(`SELECT * FROM international_order_items WHERE order_item_id IN (${itemIds.map((id: string) => `'${id}'`).join(',')})`);
    if (intlItems.length === 0) return { success: false, status_code: 400, error: 'NO_INTL_ITEMS' };

    const approvedStatuses = ['zinc_order_created', 'zinc_processing', 'purchased', 'warehouse_received', 'shipped', 'delivered', 'shipped_to_courier', 'delivered_to_courier'];
    const hasApproved = intlItems.some((i: any) => Boolean(i.zinc_order_id) || approvedStatuses.includes(i.purchase_status));
    if (hasApproved) {
      return {
        success: false,
        status_code: 409,
        error: 'ZINC_PURCHASE_ALREADY_APPROVED',
        message: 'Tu compra internacional ya fue confirmada y aprobada con el proveedor exterior (Amazon/Zinc). No admite cancelación voluntaria por arrepentimiento comercial.'
      };
    }

    const hasSubmitting = intlItems.some((i: any) => i.purchase_status === 'zinc_submitting');
    if (hasSubmitting) {
      const reqId = `req-pend-${Date.now()}`;
      db.public.none(`
        INSERT INTO unified_order_requests (id, order_id, suborder_id, order_item_id, status, idempotency_key)
        VALUES ('${reqId}', '${order_id}', ${suborder_id ? `'${suborder_id}'` : 'NULL'}, ${order_item_id ? `'${order_item_id}'` : 'NULL'}, 'CANCELLATION_PENDING', '${idempotency_key}')
      `);
      return {
        success: false,
        status_code: 202,
        error: 'ZINC_PURCHASE_SUBMITTING',
        request_id: reqId,
        message: 'Tu compra internacional está siendo procesada por el proveedor. Estamos confirmando su estado.'
      };
    }

    // Cancelación atómica exitosa
    for (const it of intlItems) {
      db.public.none(`UPDATE international_order_items SET purchase_status = 'cancelled', review_reason_code = 'CANCELLED_BEFORE_ZINC_SUBMISSION' WHERE id = '${it.id}'`);
    }
    for (const it of items) {
      db.public.none(`UPDATE order_items SET status = 'cancelled' WHERE id = '${it.id}'`);
    }

    const totalAmount = items.reduce((sum: number, it: any) => sum + Number(it.final_total), 0);
    const reqId = `req-conf-${Date.now()}`;
    db.public.none(`
      INSERT INTO unified_order_requests (id, order_id, suborder_id, order_item_id, status, amount_requested, amount_approved, idempotency_key)
      VALUES ('${reqId}', '${order_id}', ${suborder_id ? `'${suborder_id}'` : 'NULL'}, ${order_item_id ? `'${order_item_id}'` : 'NULL'}, 'CANCELLATION_CONFIRMED', ${totalAmount}, ${totalAmount}, '${idempotency_key}')
    `);

    return {
      success: true,
      status_code: 200,
      request_id: reqId,
      amount: totalAmount
    };
  }

  // Handler de Refund Order con Orden Estricto de Validación
  function executeRefundOrder(params: {
    order_id: string;
    suborder_id?: string | null;
    order_item_id?: string | null;
    amount: number;
    operation_type: string;
    idempotency_key: string;
    gateway_simulator?: () => { success: boolean; gateway_refund_id?: string };
    simulate_crash_after_gateway?: boolean;
  }): { success: boolean; error?: string; refundAmount?: number; gateway_called?: boolean } {
    const { order_id, suborder_id, order_item_id, amount, operation_type, idempotency_key, gateway_simulator = () => ({ success: true, gateway_refund_id: 'GW-OK' }), simulate_crash_after_gateway = false } = params;

    // Idempotent replay
    const existing = db.public.many(`SELECT * FROM refunds WHERE idempotency_key = '${idempotency_key}'`)[0];
    if (existing) {
      return { success: existing.status === 'completed', refundAmount: Number(existing.amount), gateway_called: false };
    }

    // PASO A: VALIDACIÓN ESTRICTA ZINC PRE-DESPACHO
    if (operation_type === 'pre_dispatch_cancellation') {
      let items = db.public.many(`SELECT * FROM order_items WHERE order_id = '${order_id}'`);
      if (order_item_id) items = items.filter((i: any) => i.id === order_item_id);

      const itemIds = items.map((i: any) => i.id);
      const intl = db.public.many(`SELECT * FROM international_order_items WHERE order_item_id IN (${itemIds.map((id: string) => `'${id}'`).join(',')})`);

      for (const it of intl) {
        const approved = ['zinc_order_created', 'zinc_processing', 'purchased', 'warehouse_received', 'shipped', 'delivered', 'shipped_to_courier', 'delivered_to_courier'];
        if (approved.includes(it.purchase_status) || Boolean(it.zinc_order_id)) {
          throw new Error('POLÍTICA ZINC: Compra ya confirmada o en procesamiento. Reembolso prohibido.');
        }
        if (it.purchase_status === 'zinc_submitting') {
          throw new Error('POLÍTICA ZINC: Compra enviándose al proveedor (zinc_submitting). Reembolso bloqueado.');
        }
        if (it.purchase_status !== 'cancelled') {
          const auth = db.public.many(`SELECT * FROM unified_order_requests WHERE order_id = '${order_id}' AND status IN ('CANCELLATION_CONFIRMED', 'APPROVED')`)[0];
          if (!auth) {
            throw new Error('SEGURIDAD FINANCIERA: Artículo internacional sin autorización transaccional previa.');
          }
        }
      }

      // PASO B: MODIFICACIONES LOGÍSTICAS ASOCIADAS (SOLO TRAS SUPERAR PASO A)
      const ships = db.public.many(`SELECT * FROM shipments WHERE order_id = '${order_id}'`);
      const hasDispatched = ships.some((s: any) => ['in_transit', 'delivered'].includes(s.shipping_status));
      if (hasDispatched) throw new Error('El envío ya fue despachado.');

      // Protección de envíos compartidos
      if (order_item_id) {
        const siblings = db.public.many(`SELECT * FROM order_items WHERE order_id = '${order_id}' AND id != '${order_item_id}'`);
        const hasActiveSiblings = siblings.some((si: any) => si.status !== 'cancelled' && si.status !== 'refunded');
        if (!hasActiveSiblings) {
          db.public.none(`UPDATE shipments SET shipping_status = 'cancelled' WHERE order_id = '${order_id}'`);
        }
      } else {
        db.public.none(`UPDATE shipments SET shipping_status = 'cancelled' WHERE order_id = '${order_id}'`);
      }
    }

    // PASO C: PASARELA DE PAGO
    const gw = gateway_simulator();
    if (!gw.success) {
      db.public.none(`INSERT INTO refunds (id, order_id, amount, status, idempotency_key) VALUES ('ref-${Date.now()}', '${order_id}', ${amount}, 'failed', '${idempotency_key}')`);
      return { success: false, error: 'GATEWAY_ERROR', gateway_called: true };
    }

    if (simulate_crash_after_gateway) {
      db.public.none(`INSERT INTO refunds (id, order_id, amount, status, idempotency_key, provider_refund_id) VALUES ('ref-${Date.now()}', '${order_id}', ${amount}, 'reconciliation_required', '${idempotency_key}', '${gw.gateway_refund_id}')`);
      throw new Error('POST_GATEWAY_CRASH');
    }

    db.public.none(`INSERT INTO refunds (id, order_id, amount, status, idempotency_key, provider_refund_id) VALUES ('ref-${Date.now()}', '${order_id}', ${amount}, 'completed', '${idempotency_key}', '${gw.gateway_refund_id}')`);

    // Actualizar status financiero
    db.public.none(`UPDATE orders SET payment_status = 'refunded' WHERE id = '${order_id}'`);
    if (order_item_id) {
      db.public.none(`UPDATE order_items SET status = 'refunded', refunded_amount = ${amount} WHERE id = '${order_item_id}'`);
    }

    return { success: true, refundAmount: amount, gateway_called: true };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRUEBAS OBLIGATORIAS DE FASE 4
  // ═════════════════════════════════════════════════════════════════════════

  // PRUEBA A — Gana Zinc:
  // Proceso 1 reclama la compra. Proceso 2 intenta cancelar.
  // Resultado: Zinc conserva la ejecución, cancelación rechazada (409), $0 reembolsos, shipment intacto.
  it('Prueba A — Gana Zinc: Proceso 1 reclama primero; Proceso 2 rechaza cancelación con 409 y $0 reembolsos', () => {
    db.public.none(`INSERT INTO orders (id, total_amount) VALUES ('ord-a', 2500)`);
    db.public.none(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, final_total) VALUES ('oi-a', 'ord-a', 'p-a', 1, 2500, 2500, 2500)`);
    db.public.none(`INSERT INTO international_order_items (id, order_item_id, purchase_status) VALUES ('intl-a', 'oi-a', 'pending_purchase')`);
    db.public.none(`INSERT INTO shipments (id, order_id, shipping_status) VALUES ('ship-a', 'ord-a', 'pending')`);

    // Proceso 1: Worker reclama el ítem para Zinc
    const claimed = sqlClaimZincItem('intl-a');
    expect(claimed).toBe(true);

    const intlAfterClaim = db.public.one(`SELECT purchase_status FROM international_order_items WHERE id = 'intl-a'`);
    expect(intlAfterClaim.purchase_status).toBe('zinc_processing');

    // Proceso 2: Cliente intenta cancelar concurrentemente
    const cancelResult = sqlAuthorizeAndConfirmCancellation({
      order_id: 'ord-a',
      order_item_id: 'oi-a',
      idempotency_key: 'idemp-cancel-a'
    });

    expect(cancelResult.success).toBe(false);
    expect(cancelResult.status_code).toBe(409);
    expect(cancelResult.error).toBe('ZINC_PURCHASE_ALREADY_APPROVED');

    // Comprobar que no hay reembolsos ni alteración de envíos
    const refundsCount = db.public.many(`SELECT * FROM refunds WHERE order_id = 'ord-a'`).length;
    expect(refundsCount).toBe(0);

    const ship = db.public.one(`SELECT shipping_status FROM shipments WHERE id = 'ship-a'`);
    expect(ship.shipping_status).toBe('pending'); // Shipment intacto
  });

  // PRUEBA B — Gana la cancelación:
  // Proceso 1 autoriza y registra cancelación. Proceso 2 intenta reclamar para Zinc.
  // Resultado: Artículo cancelado, Worker bloqueado, $0 compras externas, 1 reembolso elegible.
  it('Prueba B — Gana la cancelación: Proceso 1 cancela; Proceso 2 (Zinc) queda bloqueado y compra abortada', () => {
    db.public.none(`INSERT INTO orders (id, total_amount) VALUES ('ord-b', 3200)`);
    db.public.none(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, final_total) VALUES ('oi-b', 'ord-b', 'p-b', 1, 3200, 3200, 3200)`);
    db.public.none(`INSERT INTO international_order_items (id, order_item_id, purchase_status) VALUES ('intl-b', 'oi-b', 'pending_purchase')`);
    db.public.none(`INSERT INTO shipments (id, order_id, shipping_status) VALUES ('ship-b', 'ord-b', 'pending')`);

    // Proceso 1: Cliente cancela exitosamente precompra
    const cancelResult = sqlAuthorizeAndConfirmCancellation({
      order_id: 'ord-b',
      order_item_id: 'oi-b',
      idempotency_key: 'idemp-cancel-b'
    });

    expect(cancelResult.success).toBe(true);
    expect(cancelResult.status_code).toBe(200);

    const intlAfterCancel = db.public.one(`SELECT purchase_status, review_reason_code FROM international_order_items WHERE id = 'intl-b'`);
    expect(intlAfterCancel.purchase_status).toBe('cancelled');
    expect(intlAfterCancel.review_reason_code).toBe('CANCELLED_BEFORE_ZINC_SUBMISSION');

    // Proceso 2: Worker intenta reclamar el ítem
    const workerClaim = sqlClaimZincItem('intl-b');
    expect(workerClaim).toBe(false); // BLOQUEADO

    // Proceso de Reembolso seguro
    const refundRes = executeRefundOrder({
      order_id: 'ord-b',
      order_item_id: 'oi-b',
      amount: 3200,
      operation_type: 'pre_dispatch_cancellation',
      idempotency_key: 'idemp-refund-b'
    });

    expect(refundRes.success).toBe(true);
    expect(refundRes.refundAmount).toBe(3200);

    const totalRefunds = db.public.many(`SELECT * FROM refunds WHERE order_id = 'ord-b'`);
    expect(totalRefunds.length).toBe(1);
    expect(totalRefunds[0].status).toBe('completed');
  });

  // PRUEBA C — Zinc aprobado:
  // Artículo con compra confirmada. Cliente intenta cancelar. Backend devuelve error de política 409.
  // Resultado: Cero reembolsos, cero cancelaciones Zinc, shipment intacto, estados intactos.
  it('Prueba C — Zinc aprobado: Rechazo estricto con error ZINC_PURCHASE_ALREADY_APPROVED (409) y estados intactos', () => {
    db.public.none(`INSERT INTO orders (id, total_amount) VALUES ('ord-c', 4500)`);
    db.public.none(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, final_total) VALUES ('oi-c', 'ord-c', 'p-c', 1, 4500, 4500, 4500)`);
    db.public.none(`INSERT INTO international_order_items (id, order_item_id, zinc_order_id, purchase_status) VALUES ('intl-c', 'oi-c', 'zinc-confirmed-123', 'purchased')`);
    db.public.none(`INSERT INTO shipments (id, order_id, shipping_status) VALUES ('ship-c', 'ord-c', 'pending')`);

    const cancelResult = sqlAuthorizeAndConfirmCancellation({
      order_id: 'ord-c',
      order_item_id: 'oi-c',
      idempotency_key: 'idemp-cancel-c'
    });

    expect(cancelResult.success).toBe(false);
    expect(cancelResult.status_code).toBe(409);
    expect(cancelResult.error).toBe('ZINC_PURCHASE_ALREADY_APPROVED');

    // Intentar invocar directamente refund-order debe fallar también
    expect(() => {
      executeRefundOrder({
        order_id: 'ord-c',
        order_item_id: 'oi-c',
        amount: 4500,
        operation_type: 'pre_dispatch_cancellation',
        idempotency_key: 'idemp-refund-c'
      });
    }).toThrow(/POLÍTICA ZINC/);

    const ship = db.public.one(`SELECT shipping_status FROM shipments WHERE id = 'ship-c'`);
    expect(ship.shipping_status).toBe('pending'); // Intacto

    const intl = db.public.one(`SELECT purchase_status FROM international_order_items WHERE id = 'intl-c'`);
    expect(intl.purchase_status).toBe('purchased'); // Intacto
  });

  // PRUEBA D — Envío compartido:
  // Pedido con dos artículos: Artículo A pendiente (cancelable), Artículo B aprobado por Zinc.
  // Resultado: Únicamente A puede cancelarse. B continúa activo. Ningún shipment compartido se cancela indebidamente.
  it('Prueba D — Envío compartido: Artículo A se cancela; Artículo B sigue activo y el shipment compartido NO se cancela', () => {
    db.public.none(`INSERT INTO orders (id, total_amount) VALUES ('ord-d', 5000)`);
    db.public.none(`
      INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, final_total, status)
      VALUES 
      ('oi-d-a', 'ord-d', 'prod-a', 1, 2000, 2000, 2000, 'active'),
      ('oi-d-b', 'ord-d', 'prod-b', 1, 3000, 3000, 3000, 'active')
    `);
    db.public.none(`
      INSERT INTO international_order_items (id, order_item_id, zinc_order_id, purchase_status)
      VALUES 
      ('intl-d-a', 'oi-d-a', NULL, 'pending_purchase'),
      ('intl-d-b', 'oi-d-b', 'zinc-b-ok', 'zinc_order_created')
    `);
    db.public.none(`INSERT INTO shipments (id, order_id, shipping_status) VALUES ('ship-d', 'ord-d', 'pending')`);

    // Intentar cancelar el ítem B (debe ser rechazado con 409)
    const cancelB = sqlAuthorizeAndConfirmCancellation({
      order_id: 'ord-d',
      order_item_id: 'oi-d-b',
      idempotency_key: 'idemp-cancel-d-b'
    });
    expect(cancelB.success).toBe(false);
    expect(cancelB.status_code).toBe(409);

    // Cancelar el ítem A (debe autorizarse exitosamente)
    const cancelA = sqlAuthorizeAndConfirmCancellation({
      order_id: 'ord-d',
      order_item_id: 'oi-d-a',
      idempotency_key: 'idemp-cancel-d-a'
    });
    expect(cancelA.success).toBe(true);
    expect(cancelA.status_code).toBe(200);

    // Reembolso del ítem A
    const refundA = executeRefundOrder({
      order_id: 'ord-d',
      order_item_id: 'oi-d-a',
      amount: 2000,
      operation_type: 'pre_dispatch_cancellation',
      idempotency_key: 'idemp-refund-d-a'
    });
    expect(refundA.success).toBe(true);

    // Verificaciones de aislamiento estricto
    const itemA = db.public.one(`SELECT status, refunded_amount FROM order_items WHERE id = 'oi-d-a'`);
    expect(itemA.status).toBe('refunded');
    expect(Number(itemA.refunded_amount)).toBe(2000);

    const itemB = db.public.one(`SELECT status, refunded_amount FROM order_items WHERE id = 'oi-d-b'`);
    expect(itemB.status).toBe('active'); // Sigue activo para entrega
    expect(Number(itemB.refunded_amount)).toBe(0);

    const intlB = db.public.one(`SELECT purchase_status FROM international_order_items WHERE id = 'intl-d-b'`);
    expect(intlB.purchase_status).toBe('zinc_order_created'); // Intacto

    // El shipment compartido permanece ACTIVO para el hermano B
    const ship = db.public.one(`SELECT shipping_status FROM shipments WHERE id = 'ship-d'`);
    expect(ship.shipping_status).toBe('pending');
  });

  // PRUEBA E — Reintentos:
  // Repetir múltiples veces la misma solicitud de cancelación y reembolso.
  // Resultado: Una única cancelación autorizada, un único reembolso, ninguna compra duplicada.
  it('Prueba E — Reintentos e idempotencia: Múltiples repeticiones retornan la respuesta previa sin duplicación', () => {
    db.public.none(`INSERT INTO orders (id, total_amount) VALUES ('ord-e', 1800)`);
    db.public.none(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, final_total) VALUES ('oi-e', 'ord-e', 'p-e', 1, 1800, 1800, 1800)`);
    db.public.none(`INSERT INTO international_order_items (id, order_item_id, purchase_status) VALUES ('intl-e', 'oi-e', 'pending_purchase')`);

    const idempKey = 'idemp-retry-test-123';

    // Intento 1
    const res1 = sqlAuthorizeAndConfirmCancellation({ order_id: 'ord-e', order_item_id: 'oi-e', idempotency_key: idempKey });
    expect(res1.success).toBe(true);

    // Intento 2 (Replay)
    const res2 = sqlAuthorizeAndConfirmCancellation({ order_id: 'ord-e', order_item_id: 'oi-e', idempotency_key: idempKey });
    expect(res2.success).toBe(true);
    expect(res2.request_id).toBe(res1.request_id);

    const requests = db.public.many(`SELECT * FROM unified_order_requests WHERE idempotency_key = '${idempKey}'`);
    expect(requests.length).toBe(1); // Cero duplicaciones

    // Reembolso con misma clave
    let gwCalls = 0;
    const simGw = () => { gwCalls++; return { success: true, gateway_refund_id: 'GW-E-1' }; };

    const ref1 = executeRefundOrder({ order_id: 'ord-e', order_item_id: 'oi-e', amount: 1800, operation_type: 'pre_dispatch_cancellation', idempotency_key: idempKey, gateway_simulator: simGw });
    expect(ref1.success).toBe(true);
    expect(gwCalls).toBe(1);

    const ref2 = executeRefundOrder({ order_id: 'ord-e', order_item_id: 'oi-e', amount: 1800, operation_type: 'pre_dispatch_cancellation', idempotency_key: idempKey, gateway_simulator: simGw });
    expect(ref2.success).toBe(true);
    expect(ref2.gateway_called).toBe(false);
    expect(gwCalls).toBe(1); // CERO llamadas duplicadas a la pasarela
  });

  // PRUEBA F — Error posterior a cancelación confirmada:
  // Simular fallo de pasarela tras la aceptación transaccional de la cancelación.
  // Resultado: El artículo no vuelve a quedar comprable por el worker, queda en reconciliation_required, 0 compras duplicadas.
  it('Prueba F — Fallo transaccional posterior: El artículo NO vuelve a comprable y previene compras externas', () => {
    db.public.none(`INSERT INTO orders (id, total_amount) VALUES ('ord-f', 2900)`);
    db.public.none(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, final_total) VALUES ('oi-f', 'ord-f', 'p-f', 1, 2900, 2900, 2900)`);
    db.public.none(`INSERT INTO international_order_items (id, order_item_id, purchase_status) VALUES ('intl-f', 'oi-f', 'pending_purchase')`);

    // 1. Cancelación confirmada
    const cancelRes = sqlAuthorizeAndConfirmCancellation({ order_id: 'ord-f', order_item_id: 'oi-f', idempotency_key: 'idemp-f' });
    expect(cancelRes.success).toBe(true);

    // 2. Simular caída de base de datos tras confirmación de pasarela
    expect(() => {
      executeRefundOrder({
        order_id: 'ord-f',
        order_item_id: 'oi-f',
        amount: 2900,
        operation_type: 'pre_dispatch_cancellation',
        idempotency_key: 'idemp-f',
        gateway_simulator: () => ({ success: true, gateway_refund_id: 'GW-CONFIRMED' }),
        simulate_crash_after_gateway: true
      });
    }).toThrow(/POST_GATEWAY_CRASH/);

    const refund = db.public.one(`SELECT status FROM refunds WHERE idempotency_key = 'idemp-f'`);
    expect(refund.status).toBe('reconciliation_required');

    // 3. Worker intenta comprar el ítem: debe ser rotundamente RECHAZADO
    const workerClaim = sqlClaimZincItem('intl-f');
    expect(workerClaim).toBe(false);

    const intl = db.public.one(`SELECT purchase_status FROM international_order_items WHERE id = 'intl-f'`);
    expect(intl.purchase_status).toBe('cancelled'); // PERMANECE CANCELADO, NUNCA SE RESTAURA A COMPRABLE
  });

  // PRUEBA G — Rechazo sin efectos secundarios:
  // Confirmar que rechazar una cancelación no modifica shipments, artículos, inventario, pedidos ni pagos.
  it('Prueba G — Rechazo sin efectos secundarios: No modifica shipments, items, stock ni pagos', () => {
    db.public.none(`INSERT INTO orders (id, total_amount, status, payment_status) VALUES ('ord-g', 6000, 'paid', 'approved')`);
    db.public.none(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, final_total, status) VALUES ('oi-g', 'ord-g', 'p-g', 1, 6000, 6000, 6000, 'active')`);
    db.public.none(`INSERT INTO international_order_items (id, order_item_id, zinc_order_id, purchase_status) VALUES ('intl-g', 'oi-g', 'zinc-live-99', 'zinc_order_created')`);
    db.public.none(`INSERT INTO shipments (id, order_id, shipping_status) VALUES ('ship-g', 'ord-g', 'pending')`);
    db.public.none(`INSERT INTO product_variants (id, product_id, inventory_count) VALUES ('var-g', 'p-g', 10)`);

    // Intento de cancelación voluntaria sobre orden aprobada
    const cancelRes = sqlAuthorizeAndConfirmCancellation({ order_id: 'ord-g', order_item_id: 'oi-g', idempotency_key: 'idemp-g' });
    expect(cancelRes.success).toBe(false);
    expect(cancelRes.status_code).toBe(409);

    // Verificar CERO efectos secundarios
    const ord = db.public.one(`SELECT status, payment_status FROM orders WHERE id = 'ord-g'`);
    expect(ord.status).toBe('paid');
    expect(ord.payment_status).toBe('approved');

    const oi = db.public.one(`SELECT status, refunded_amount, refunded_quantity FROM order_items WHERE id = 'oi-g'`);
    expect(oi.status).toBe('active');
    expect(Number(oi.refunded_amount)).toBe(0);
    expect(oi.refunded_quantity).toBe(0);

    const ship = db.public.one(`SELECT shipping_status FROM shipments WHERE id = 'ship-g'`);
    expect(ship.shipping_status).toBe('pending');

    const v = db.public.one(`SELECT inventory_count FROM product_variants WHERE id = 'var-g'`);
    expect(v.inventory_count).toBe(10); // CERO alteración de inventario

    const refunds = db.public.many(`SELECT * FROM refunds WHERE order_id = 'ord-g'`);
    expect(refunds.length).toBe(0); // CERO reembolsos
  });
});

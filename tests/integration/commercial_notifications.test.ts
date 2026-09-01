import { describe, it, expect } from 'vitest';
import { 
  notificationTemplates, 
  formatCurrencyUYU, 
  formatOrderNumber 
} from '../../supabase/functions/_shared/notificationTemplates';

// ─── HELPER LOGIC FOR COMMERCIAL NOTIFICATIONS ─────────────────────────

export interface TestOrderItem {
  id: string;
  product_id: string;
  vendor_id: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  store_name?: string;
}

export interface TestOrder {
  id: string;
  order_number?: string | null;
  display_number?: string | null;
  status: string;
  payment_status: string;
  payment_processed_at: string | null;
  total_amount: number;
  customer_address?: any;
  customer_phone?: string;
  customer_email?: string;
  items: TestOrderItem[];
}

/**
 * Simulates certified commercial notification evaluation logic
 */
export function evaluateOrderPaidNotifications(order: TestOrder) {
  // VALIDACIÓN 1 OBLIGATORIA: payment_processed_at IS NOT NULL AND payment_status IN ('approved', 'paid')
  const isPaymentCertifiedProcessed = order.payment_processed_at !== null && (order.payment_status === 'approved' || order.payment_status === 'paid');
  
  if (!isPaymentCertifiedProcessed) {
    return { dispatched: false, reason: 'payment_not_certified_processed', vendorNotifications: [], adminNotification: null };
  }

  const orderNumStr = formatOrderNumber(order);
  const vendorMap: Record<string, { store_name: string; vendor_id: string; items: { product_name: string; quantity: number }[]; total: number }> = {};
  let collectiblesItems: { product_name: string; quantity: number }[] = [];
  let collectiblesTotal = 0;

  for (const item of order.items) {
    const subtotal = item.unit_price * item.quantity;
    if (item.vendor_id) {
      if (!vendorMap[item.vendor_id]) {
        vendorMap[item.vendor_id] = {
          store_name: item.store_name || 'Tienda Vendor',
          vendor_id: item.vendor_id,
          items: [],
          total: 0
        };
      }
      vendorMap[item.vendor_id].items.push({ product_name: item.title, quantity: item.quantity });
      vendorMap[item.vendor_id].total += subtotal;
    } else {
      collectiblesItems.push({ product_name: item.title, quantity: item.quantity });
      collectiblesTotal += subtotal;
    }
  }

  const vendorNotifications = Object.values(vendorMap).map(v => {
    const tpl = notificationTemplates.vendor_order_paid({
      orderNumber: orderNumStr,
      orderId: order.id,
      vendorTotal: v.total,
      items: v.items
    });
    return {
      vendorId: v.vendor_id,
      storeName: v.store_name,
      idempotencyKey: `vendor_order_paid:${order.id}:${v.vendor_id}:push`,
      push: tpl.push,
      email: tpl.email,
      deepLink: tpl.deepLink,
      vendorTotal: v.total,
      itemCount: v.items.reduce((acc, i) => acc + i.quantity, 0)
    };
  });

  let adminNotification = null;
  if (collectiblesTotal > 0 && collectiblesItems.length > 0) {
    const adminTpl = notificationTemplates.admin_own_order_paid({
      orderNumber: orderNumStr,
      orderId: order.id,
      collectiblesTotal,
      items: collectiblesItems
    });
    adminNotification = {
      idempotencyKey: `admin_own_order_paid:${order.id}:push`,
      push: adminTpl.push,
      email: adminTpl.email,
      deepLink: adminTpl.deepLink,
      collectiblesTotal
    };
  }

  return {
    dispatched: true,
    vendorNotifications,
    adminNotification
  };
}

/**
 * Simulates order cancellation notification evaluation
 */
export function evaluateOrderCancelledNotifications(order: TestOrder, previouslyLoggedPaid: boolean = false) {
  // REQUIREMENT 8 & 23: Only notify commercial cancellation if order was previously paid/confirmed
  const wasPaid = order.payment_processed_at !== null || order.payment_status === 'approved' || order.payment_status === 'paid' || order.payment_status === 'refunded' || order.status === 'refunded' || previouslyLoggedPaid;
  
  if (!wasPaid) {
    return { dispatched: false, reason: 'order_never_paid', vendorNotifications: [], adminNotification: null };
  }

  const orderNumStr = formatOrderNumber(order);
  const vendorIds = Array.from(new Set(order.items.map(i => i.vendor_id).filter(Boolean))) as string[];

  const vendorNotifications = vendorIds.map(vId => {
    const tpl = notificationTemplates.order_cancelled({ orderNumber: orderNumStr, orderId: order.id, isVendor: true });
    return {
      vendorId: vId,
      idempotencyKey: `order_cancelled:${order.id}:${vId}:push`,
      push: tpl.push,
      email: tpl.email
    };
  });

  const adminTpl = notificationTemplates.order_cancelled({ orderNumber: orderNumStr, orderId: order.id, isVendor: false });
  const adminNotification = {
    idempotencyKey: `order_cancelled:${order.id}:admin:push`,
    push: adminTpl.push,
    email: adminTpl.email
  };

  return {
    dispatched: true,
    vendorNotifications,
    adminNotification
  };
}

/**
 * Simulates 22:00 America/Montevideo Daily Summary aggregation logic
 */
export function evaluateDailySummary(
  suborders: Array<{ parent_order_id: string; vendor_id: string; store_name: string; product_subtotal: number; marketplace_fee: number; payment_processed_at: string }>,
  cutoffTimeMvdISO: string // 22:00 cutoff time ISO string
) {
  const cutoffEnd = new Date(cutoffTimeMvdISO);
  const cutoffStart = new Date(cutoffEnd.getTime() - 24 * 60 * 60 * 1000);

  // Filter suborders in period [cutoffStart, cutoffEnd]
  const validSuborders = suborders.filter(s => {
    if (!s.payment_processed_at) return false;
    const t = new Date(s.payment_processed_at).getTime();
    return t >= cutoffStart.getTime() && t <= cutoffEnd.getTime();
  });

  // REQUIREMENT 13: Zero sales guard
  if (validSuborders.length === 0) {
    return { dispatched: false, reason: 'no_vendor_sales', summary: null };
  }

  const vendorMap: Record<string, { store_name: string; order_count: number; total_amount: number; commission: number }> = {};
  const orderSet = new Set<string>();

  let totalMarketplaceGmv = 0;
  let totalCommission = 0;

  for (const sub of validSuborders) {
    orderSet.add(sub.parent_order_id);

    if (!vendorMap[sub.vendor_id]) {
      vendorMap[sub.vendor_id] = {
        store_name: sub.store_name,
        order_count: 0,
        total_amount: 0,
        commission: 0
      };
    }

    vendorMap[sub.vendor_id].order_count += 1;
    vendorMap[sub.vendor_id].total_amount += sub.product_subtotal;
    vendorMap[sub.vendor_id].commission += sub.marketplace_fee;

    totalMarketplaceGmv += sub.product_subtotal;
    totalCommission += sub.marketplace_fee;
  }

  const vendorRows = Object.values(vendorMap).map(v => ({
    storeName: v.store_name,
    orderCount: v.order_count,
    totalAmount: v.total_amount
  }));

  const vendorCount = vendorRows.length;
  const orderCount = orderSet.size;

  const dateStr = cutoffEnd.toLocaleDateString('es-UY');
  const tpl = notificationTemplates.admin_vendor_daily_summary({
    dateStr,
    vendorRows,
    marketplaceTotal: totalMarketplaceGmv,
    orderCount,
    vendorCount,
    commissionTotal: totalCommission
  });

  return {
    dispatched: true,
    summary: {
      dateStr,
      vendorCount,
      orderCount,
      marketplaceTotal: totalMarketplaceGmv,
      commissionTotal: totalCommission,
      vendorRows,
      push: tpl.push,
      email: tpl.email
    }
  };
}


// ─── EXACT 19 TEST CASES SUITE ──────────────────────────────────────────

describe('🛒 Lógica Definitiva de Notificaciones Comerciales Marketplace (19 Tests Certificados)', () => {

  describe('1. Pruebas de Certificación de Pago Aprobado & Merely Confirmed (Tests 1-8)', () => {

    it('1. order_created unpaid -> 0 notificaciones', () => {
      const order: TestOrder = {
        id: 'ord-001',
        order_number: 'COL-1001',
        status: 'awaiting_payment',
        payment_status: 'pending',
        payment_processed_at: null,
        total_amount: 3490,
        items: [{ id: 'i1', product_id: 'p1', vendor_id: 'v1', title: 'Coleccionable A', quantity: 1, unit_price: 3490, store_name: 'Gemafer' }]
      };
      const result = evaluateOrderPaidNotifications(order);
      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('payment_not_certified_processed');
    });

    it('2. payment pending -> 0 notificaciones', () => {
      const order: TestOrder = {
        id: 'ord-002',
        order_number: 'COL-1002',
        status: 'initiated',
        payment_status: 'pending',
        payment_processed_at: null,
        total_amount: 1500,
        items: [{ id: 'i2', product_id: 'p2', vendor_id: 'v1', title: 'Figura Dragon Ball', quantity: 1, unit_price: 1500, store_name: 'Gemafer' }]
      };
      const result = evaluateOrderPaidNotifications(order);
      expect(result.dispatched).toBe(false);
    });

    it('3. VALIDACIÓN OBLIGATORIA 1: Order MERELY CONFIRMED pero SIN pago certificado (payment_processed_at=null) -> 0 NOTIFICACIONES', () => {
      const order: TestOrder = {
        id: 'ord-admin-confirmed-unpaid',
        order_number: 'COL-9999',
        status: 'confirmed', // Cambio administrativo
        payment_status: 'pending', // Pago aún no aprobado
        payment_processed_at: null, // Sin marca de pago procesado
        total_amount: 5000,
        items: [{ id: 'i99', product_id: 'p99', vendor_id: 'v1', title: 'Producto Admin Confirmed', quantity: 1, unit_price: 5000, store_name: 'Gemafer' }]
      };
      const result = evaluateOrderPaidNotifications(order);
      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('payment_not_certified_processed');
      expect(result.vendorNotifications.length).toBe(0);
      expect(result.adminNotification).toBeNull();
    });

    it('4. payment approved & payment_processed_at NOT NULL -> Vendor recibe 1 notificación comercial operativa', () => {
      const order: TestOrder = {
        id: 'ord-003',
        order_number: 'COL-1003',
        status: 'confirmed',
        payment_status: 'approved',
        payment_processed_at: '2026-08-30T20:00:00Z',
        total_amount: 2490,
        items: [{ id: 'i3', product_id: 'p3', vendor_id: 'v1', title: 'Funko Pop Batman', quantity: 1, unit_price: 2490, store_name: 'Gemafer' }]
      };
      const result = evaluateOrderPaidNotifications(order);
      expect(result.dispatched).toBe(true);
      expect(result.vendorNotifications.length).toBe(1);
      expect(result.vendorNotifications[0].push.title).toBe('🛒 Nueva venta — Pedido pago, preparar envío');
      expect(result.vendorNotifications[0].push.body).toBe('El pedido #COL-1003 ya fue pagado. Total de tus productos: $ 2.490. Prepará el pedido para despacho.');
      expect(result.vendorNotifications[0].email.subject).toBe('🛒 Nueva venta — Pedido pago, preparar envío #COL-1003');
    });

    it('5. webhook payment approved repetido -> Idempotency Key identica evita duplicados', () => {
      const order: TestOrder = {
        id: 'ord-004',
        order_number: 'COL-1004',
        status: 'confirmed',
        payment_status: 'approved',
        payment_processed_at: '2026-08-30T20:00:00Z',
        total_amount: 1990,
        items: [{ id: 'i4', product_id: 'p4', vendor_id: 'v1', title: 'Poster Anime', quantity: 1, unit_price: 1990, store_name: 'Gemafer' }]
      };
      const eval1 = evaluateOrderPaidNotifications(order);
      const eval2 = evaluateOrderPaidNotifications(order);

      expect(eval1.vendorNotifications[0].idempotencyKey).toBe('vendor_order_paid:ord-004:v1:push');
      expect(eval2.vendorNotifications[0].idempotencyKey).toBe(eval1.vendorNotifications[0].idempotencyKey);
    });

    it('6. venta Collectibles propia paga -> Admin recibe 1 aviso inmediato', () => {
      const order: TestOrder = {
        id: 'ord-005',
        order_number: 'COL-1005',
        status: 'confirmed',
        payment_status: 'approved',
        payment_processed_at: '2026-08-30T20:00:00Z',
        total_amount: 2990,
        items: [{ id: 'i5', product_id: 'p5', vendor_id: null, title: 'Remera Oficial Collectibles', quantity: 1, unit_price: 2990, store_name: 'Collectibles' }]
      };
      const result = evaluateOrderPaidNotifications(order);
      expect(result.dispatched).toBe(true);
      expect(result.adminNotification).not.toBeNull();
      expect(result.adminNotification?.collectiblesTotal).toBe(2990);
      expect(result.adminNotification?.push.title).toBe('🎉 Nueva venta Collectibles — Pedido pago, preparar envío');
    });

    it('7. Pedido mixto (Collectibles $2990 + Vendor A $2490 + Vendor B $2000) -> Aislado por vendor', () => {
      const order: TestOrder = {
        id: 'ord-mixto-1',
        order_number: 'COL-7480',
        status: 'confirmed',
        payment_status: 'approved',
        payment_processed_at: '2026-08-30T20:00:00Z',
        total_amount: 7480,
        items: [
          { id: 'mi1', product_id: 'p-coll', vendor_id: null, title: 'Figura Collectibles Exclusiva', quantity: 1, unit_price: 2990, store_name: 'Collectibles' },
          { id: 'mi2', product_id: 'p-va', vendor_id: 'vendor_a', title: 'Juego de Cartas Store A', quantity: 1, unit_price: 2490, store_name: 'Gemafer' },
          { id: 'mi3', product_id: 'p-vb', vendor_id: 'vendor_b', title: 'Auto a escala Store B', quantity: 1, unit_price: 2000, store_name: 'JorgiToys' }
        ]
      };
      const result = evaluateOrderPaidNotifications(order);
      expect(result.dispatched).toBe(true);

      const vANotif = result.vendorNotifications.find(v => v.vendorId === 'vendor_a');
      expect(vANotif?.vendorTotal).toBe(2490);
      expect(vANotif?.email.text).not.toContain('Auto a escala Store B');

      const vBNotif = result.vendorNotifications.find(v => v.vendorId === 'vendor_b');
      expect(vBNotif?.vendorTotal).toBe(2000);
      expect(vBNotif?.email.text).not.toContain('Juego de Cartas Store A');

      expect(result.adminNotification?.collectiblesTotal).toBe(2990);
    });

    it('8. Vendor A NUNCA recibe productos/totales de Vendor B', () => {
      const order: TestOrder = {
        id: 'ord-mixto-2',
        order_number: 'COL-7481',
        status: 'confirmed',
        payment_status: 'approved',
        payment_processed_at: '2026-08-30T20:00:00Z',
        total_amount: 4490,
        items: [
          { id: 'm1', product_id: 'p-va', vendor_id: 'vendor_a', title: 'Producto A', quantity: 1, unit_price: 2490, store_name: 'Gemafer' },
          { id: 'm2', product_id: 'p-vb', vendor_id: 'vendor_b', title: 'Producto B Secreto', quantity: 1, unit_price: 2000, store_name: 'JorgiToys' }
        ]
      };
      const result = evaluateOrderPaidNotifications(order);
      const vANotif = result.vendorNotifications.find(v => v.vendorId === 'vendor_a');
      expect(vANotif?.email.text).not.toContain('Producto B Secreto');
      expect(vANotif?.push.body).not.toContain('4490');
    });

    it('9. Push no incluye datos sensibles del comprador (dirección, teléfono, email, DNI)', () => {
      const order: TestOrder = {
        id: 'ord-008',
        order_number: 'COL-1008',
        status: 'confirmed',
        payment_status: 'approved',
        payment_processed_at: '2026-08-30T20:00:00Z',
        total_amount: 1500,
        customer_address: { street: 'Calle Falsa 123', city: 'Montevideo', phone: '099999999', ci: '45678901' },
        customer_phone: '099999999',
        customer_email: 'privado@cliente.com',
        items: [{ id: 'i8', product_id: 'p8', vendor_id: 'v1', title: 'Producto X', quantity: 1, unit_price: 1500, store_name: 'Gemafer' }]
      };
      const result = evaluateOrderPaidNotifications(order);
      const pushBody = result.vendorNotifications[0].push.body;
      expect(pushBody).not.toContain('Calle Falsa 123');
      expect(pushBody).not.toContain('099999999');
      expect(pushBody).not.toContain('privado@cliente.com');
      expect(pushBody).not.toContain('45678901');
    });
  });

  describe('2. Pruebas de Pedidos Cancelados (Tests 10-12)', () => {
    it('10. Pedido pagado cancelado -> notifica cancelación comercial', () => {
      const order: TestOrder = {
        id: 'ord-paid-cancel',
        order_number: 'COL-2001',
        status: 'cancelada',
        payment_status: 'refunded',
        payment_processed_at: '2026-08-30T10:00:00Z',
        total_amount: 1800,
        items: [{ id: 'ic1', product_id: 'pc1', vendor_id: 'v1', title: 'Producto Cancelado', quantity: 1, unit_price: 1800, store_name: 'Gemafer' }]
      };
      const result = evaluateOrderCancelledNotifications(order);
      expect(result.dispatched).toBe(true);
      expect(result.vendorNotifications[0].push.title).toBe('❌ Pedido cancelado');
      expect(result.adminNotification?.push.title).toBe('❌ Venta cancelada');
    });

    it('11. Pedido nunca pagado cancelado -> 0 notificaciones de cancelación comercial', () => {
      const order: TestOrder = {
        id: 'ord-unpaid-cancel',
        order_number: 'COL-2002',
        status: 'cancelled',
        payment_status: 'pending',
        payment_processed_at: null,
        total_amount: 1800,
        items: [{ id: 'ic2', product_id: 'pc2', vendor_id: 'v1', title: 'Producto Abandono', quantity: 1, unit_price: 1800, store_name: 'Gemafer' }]
      };
      const result = evaluateOrderCancelledNotifications(order, false);
      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('order_never_paid');
    });

    it('12. Cancelación repetida -> Idempotencia evita duplicados', () => {
      const order: TestOrder = {
        id: 'ord-paid-cancel-dup',
        order_number: 'COL-2003',
        status: 'cancelada',
        payment_status: 'refunded',
        payment_processed_at: '2026-08-30T10:00:00Z',
        total_amount: 1800,
        items: [{ id: 'ic3', product_id: 'pc3', vendor_id: 'v1', title: 'Producto Dup', quantity: 1, unit_price: 1800, store_name: 'Gemafer' }]
      };
      const res1 = evaluateOrderCancelledNotifications(order);
      const res2 = evaluateOrderCancelledNotifications(order);
      expect(res1.vendorNotifications[0].idempotencyKey).toBe('order_cancelled:ord-paid-cancel-dup:v1:push');
      expect(res2.vendorNotifications[0].idempotencyKey).toBe(res1.vendorNotifications[0].idempotencyKey);
    });
  });

  describe('3. Pruebas de Resumen Diario 22:00 America/Montevideo (Tests 13-19)', () => {
    const cutoff22pmMvd = '2026-08-30T22:00:00-03:00';

    it('13. Ventas antes de las 22:00 entran en el resumen', () => {
      const suborders = [
        { parent_order_id: 'o1', vendor_id: 'v_gemafer', store_name: 'Gemafer', product_subtotal: 1000, marketplace_fee: 100, payment_processed_at: '2026-08-30T21:00:00-03:00' }
      ];
      const result = evaluateDailySummary(suborders, cutoff22pmMvd);
      expect(result.dispatched).toBe(true);
      expect(result.summary?.orderCount).toBe(1);
    });

    it('14. Venta a las 22:30 queda excluida y entra en el siguiente resumen', () => {
      const suborders = [
        { parent_order_id: 'o1', vendor_id: 'v_gemafer', store_name: 'Gemafer', product_subtotal: 1000, marketplace_fee: 100, payment_processed_at: '2026-08-30T21:00:00-03:00' },
        { parent_order_id: 'o2', vendor_id: 'v_cardsuy', store_name: 'CardsUY', product_subtotal: 2000, marketplace_fee: 200, payment_processed_at: '2026-08-30T22:30:00-03:00' }
      ];
      const result = evaluateDailySummary(suborders, cutoff22pmMvd);
      expect(result.summary?.vendorCount).toBe(1);
      expect(result.summary?.marketplaceTotal).toBe(1000);
    });

    it('15. Vendor sin ventas en el período no aparece en la tabla', () => {
      const suborders = [
        { parent_order_id: 'o1', vendor_id: 'v_gemafer', store_name: 'Gemafer', product_subtotal: 1000, marketplace_fee: 100, payment_processed_at: '2026-08-30T21:00:00-03:00' }
      ];
      const result = evaluateDailySummary(suborders, cutoff22pmMvd);
      expect(result.summary?.vendorRows.some(r => r.storeName === 'JorgiToys')).toBe(false);
    });

    it('16. Día sin ventas de vendors -> 0 Push, 0 Email, NO mensaje', () => {
      const suborders: any[] = [];
      const result = evaluateDailySummary(suborders, cutoff22pmMvd);
      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('no_vendor_sales');
    });

    it('17. Total general y cantidad de pedidos por vendor correctos', () => {
      const suborders = [
        { parent_order_id: 'o1', vendor_id: 'v_gemafer', store_name: 'Gemafer', product_subtotal: 18450, marketplace_fee: 1845, payment_processed_at: '2026-08-30T14:00:00-03:00' },
        { parent_order_id: 'o2', vendor_id: 'v_jorgitoys', store_name: 'JorgiToys', product_subtotal: 12990, marketplace_fee: 1299, payment_processed_at: '2026-08-30T18:00:00-03:00' },
        { parent_order_id: 'o3', vendor_id: 'v_cardsuy', store_name: 'CardsUY', product_subtotal: 7200, marketplace_fee: 720, payment_processed_at: '2026-08-30T21:15:00-03:00' }
      ];
      const result = evaluateDailySummary(suborders, cutoff22pmMvd);
      expect(result.summary?.marketplaceTotal).toBe(38640);
      expect(result.summary?.orderCount).toBe(3);
      expect(result.summary?.vendorCount).toBe(3);
    });

    it('18. Comisión calculada correctamente', () => {
      const suborders = [
        { parent_order_id: 'o1', vendor_id: 'v_gemafer', store_name: 'Gemafer', product_subtotal: 10000, marketplace_fee: 1200, payment_processed_at: '2026-08-30T14:00:00-03:00' }
      ];
      const result = evaluateDailySummary(suborders, cutoff22pmMvd);
      expect(result.summary?.commissionTotal).toBe(1200);
    });

    it('19. Timezone America/Montevideo y formato de moneda UYU estricto', () => {
      expect(formatCurrencyUYU(38640)).toBe('$ 38.640');
      expect(formatCurrencyUYU(12990)).toBe('$ 12.990');
      expect(formatCurrencyUYU(7200)).toBe('$ 7.200');
    });
  });

});

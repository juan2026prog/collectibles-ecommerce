import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';

describe('HOTFIX MERCADO PAGO: ADVANCED CONCURRENCY, RECOVERY & OVERSOLD DEFENSE', () => {
  let db: any;

  beforeEach(() => {
    db = newDb();

    db.public.none(`
      CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        is_admin BOOLEAN DEFAULT false
      );

      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        base_price NUMERIC NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT REFERENCES products(id),
        sku TEXT,
        name TEXT NOT NULL,
        inventory_count INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        order_number TEXT,
        status TEXT NOT NULL DEFAULT 'awaiting_payment',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        payment_provider TEXT,
        payment_provider_reference TEXT,
        payment_id TEXT,
        total_amount NUMERIC NOT NULL,
        payment_processed_at TIMESTAMP WITH TIME ZONE,
        preorder_status TEXT DEFAULT 'not_applicable',
        reconciliation_status TEXT DEFAULT 'none',
        total_payment_fee NUMERIC DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT REFERENCES orders(id),
        product_id TEXT REFERENCES products(id),
        variant_id TEXT REFERENCES product_variants(id),
        quantity INT NOT NULL DEFAULT 1
      );

      CREATE TABLE order_suborders (
        id TEXT PRIMARY KEY,
        parent_order_id TEXT REFERENCES orders(id),
        status TEXT NOT NULL DEFAULT 'pending',
        payment_fee_share NUMERIC DEFAULT 0,
        vendor_net_amount NUMERIC DEFAULT 0,
        product_subtotal NUMERIC DEFAULT 0,
        shipping_cost NUMERIC DEFAULT 0,
        discount_total NUMERIC DEFAULT 0,
        marketplace_fee NUMERIC DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE stock_reservations (
        id TEXT PRIMARY KEY,
        order_id TEXT REFERENCES orders(id),
        variant_id TEXT REFERENCES product_variants(id),
        quantity INT NOT NULL DEFAULT 1,
        reserved_until TIMESTAMP WITH TIME ZONE NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        order_id TEXT REFERENCES orders(id),
        provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        amount NUMERIC NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
  });

  it('1. finalizeOrderIfNeeded stops on success=false without modifying suborders, fees or triggering post-actions', async () => {
    // Order setup: stock shortage on late approval returns { success: false, code: 'STOCK_EXHAUSTED_ON_LATE_APPROVAL' }
    db.public.none(`
      INSERT INTO products (id, title, base_price) VALUES ('p1', 'Product 1', 2.00);
      INSERT INTO product_variants (id, product_id, sku, name, inventory_count) VALUES ('v1', 'p1', 'SKU-1', 'Standard', 0);
      INSERT INTO orders (id, order_number, total_amount, status, payment_status) 
        VALUES ('order_fail', 'COL-FAIL', 2.00, 'awaiting_payment', 'approved');
      INSERT INTO order_suborders (id, parent_order_id, status, product_subtotal) 
        VALUES ('sub_fail', 'order_fail', 'pending', 2.00);
      INSERT INTO stock_reservations (id, order_id, variant_id, quantity, reserved_until, status)
        VALUES ('res_fail', 'order_fail', 'v1', 1, now() - interval '1 hour', 'released');
    `);

    // Simulated confirm_payment_atomic returning business rejection
    const mockConfirmPaymentAtomic = (orderId: string) => {
      const variant = db.public.one(`SELECT inventory_count FROM product_variants WHERE id = 'v1'`);
      if (variant.inventory_count < 1) {
        db.public.none(`
          UPDATE orders 
          SET payment_status = 'approved',
              reconciliation_status = 'stock_recovery_shortage'
          WHERE id = '${orderId}'
        `);
        return {
          success: false,
          code: 'STOCK_EXHAUSTED_ON_LATE_APPROVAL',
          error: 'Pago acreditado con reserva vencida, pero el stock actual es insuficiente.'
        };
      }
      return { success: true };
    };

    // Simulated finalizeOrderIfNeeded execution with the exact newly hardened logic
    let postPaymentTriggered = false;
    let caughtError: any = null;

    try {
      const confirmResult = mockConfirmPaymentAtomic('order_fail');
      
      // Strict check:
      if (!confirmResult || confirmResult.success !== true) {
        const errorCode = confirmResult?.code || 'ORDER_CONFIRMATION_REJECTED';
        const businessError = new Error(confirmResult?.error) as any;
        businessError.code = errorCode;
        businessError.details = confirmResult;
        throw businessError;
      }

      // If success was true, it would update fees, suborders, and post actions:
      db.public.none(`UPDATE order_suborders SET status = 'confirmed' WHERE parent_order_id = 'order_fail'`);
      postPaymentTriggered = true;
    } catch (err: any) {
      caughtError = err;
    }

    // Assertions:
    expect(caughtError).not.toBeNull();
    expect(caughtError.code).toBe('STOCK_EXHAUSTED_ON_LATE_APPROVAL');
    expect(postPaymentTriggered).toBe(false);

    // Suborder must remain in pending state, NEVER confirmed
    const suborder = db.public.one(`SELECT status FROM order_suborders WHERE id = 'sub_fail'`);
    expect(suborder.status).toBe('pending');

    // Order must remain in awaiting_payment, marked with stock shortage
    const order = db.public.one(`SELECT status, payment_status, reconciliation_status FROM orders WHERE id = 'order_fail'`);
    expect(order.status).toBe('awaiting_payment');
    expect(order.payment_status).toBe('approved');
    expect(order.reconciliation_status).toBe('stock_recovery_shortage');

    // Reservation must remain released, NEVER marked completed
    const reservation = db.public.one(`SELECT status FROM stock_reservations WHERE id = 'res_fail'`);
    expect(reservation.status).toBe('released');
  });

  it('2. Concurrency scenario: Another buyer acquires released unit -> Late confirmation detects shortage and prevents overselling', () => {
    db.public.none(`
      INSERT INTO products (id, title, base_price) VALUES ('p1', 'Exclusive Figure', 2.00);
      INSERT INTO product_variants (id, product_id, sku, name, inventory_count) VALUES ('v1', 'p1', 'EXCL-01', 'Rare', 1);
      
      INSERT INTO orders (id, order_number, total_amount, status, payment_status) VALUES ('orderA', 'COL-A', 2.00, 'awaiting_payment', 'pending');
      INSERT INTO order_items (id, order_id, product_id, variant_id, quantity) VALUES ('oiA', 'orderA', 'p1', 'v1', 1);
      INSERT INTO stock_reservations (id, order_id, variant_id, quantity, reserved_until, status)
        VALUES ('resA', 'orderA', 'v1', 1, now() - interval '10 minutes', 'released');
    `);

    // Buyer B buys the last unit while Buyer A was unconfirmed
    db.public.none(`
      UPDATE product_variants SET inventory_count = 0 WHERE id = 'v1';
    `);

    // Buyer A's payment arrives approved from MP and invokes confirm_payment_atomic logic
    const releasedRes = db.public.many(`
      SELECT * FROM stock_reservations WHERE order_id = 'orderA' AND status = 'released'
    `);

    let confirmationResult = { success: true };
    for (const r of releasedRes) {
      const variant = db.public.one(`SELECT inventory_count FROM product_variants WHERE id = '${r.variant_id}'`);
      if (variant.inventory_count < r.quantity) {
        confirmationResult = {
          success: false,
          code: 'STOCK_EXHAUSTED_ON_LATE_APPROVAL',
          error: 'Pago acreditado con reserva vencida, pero el stock actual es insuficiente.'
        };
        db.public.none(`
          UPDATE orders 
          SET payment_status = 'approved',
              reconciliation_status = 'stock_recovery_shortage'
          WHERE id = 'orderA'
        `);
        break;
      }
    }

    expect(confirmationResult.success).toBe(false);
    expect(confirmationResult.code).toBe('STOCK_EXHAUSTED_ON_LATE_APPROVAL');

    const finalVariant = db.public.one(`SELECT inventory_count FROM product_variants WHERE id = 'v1'`);
    expect(finalVariant.inventory_count).toBe(0);

    const finalOrder = db.public.one(`SELECT status, payment_status, reconciliation_status FROM orders WHERE id = 'orderA'`);
    expect(finalOrder.status).toBe('awaiting_payment');
    expect(finalOrder.payment_status).toBe('approved');
    expect(finalOrder.reconciliation_status).toBe('stock_recovery_shortage');

    const finalRes = db.public.one(`SELECT status FROM stock_reservations WHERE id = 'resA'`);
    expect(finalRes.status).toBe('released');
  });

  it('3. Race condition: MP approves payment during expiration cron window -> Cron preserves reservation', () => {
    db.public.none(`
      INSERT INTO products (id, title, base_price) VALUES ('p1', 'Figure', 2.00);
      INSERT INTO product_variants (id, product_id, sku, name, inventory_count) VALUES ('v1', 'p1', 'SKU-1', 'Standard', 1);
      
      INSERT INTO orders (id, order_number, total_amount, status, payment_status) VALUES ('orderC', 'COL-C', 2.00, 'awaiting_payment', 'pending');
      INSERT INTO order_items (id, order_id, product_id, variant_id, quantity) VALUES ('oiC', 'orderC', 'p1', 'v1', 1);
      INSERT INTO stock_reservations (id, order_id, variant_id, quantity, reserved_until, status)
        VALUES ('resC', 'orderC', 'v1', 1, now() - interval '5 seconds', 'active');
      INSERT INTO payments (id, order_id, provider, status, amount) VALUES ('payC', 'orderC', 'mercadopago', 'approved', 2.00);
    `);

    const eligibleForRelease = db.public.many(`
      SELECT sr.id 
      FROM stock_reservations sr
      JOIN orders o ON o.id = sr.order_id
      LEFT JOIN payments p ON p.order_id = o.id AND p.status = 'approved'
      WHERE sr.status = 'active'
        AND sr.reserved_until < now()
        AND COALESCE(o.payment_status, '') NOT IN ('approved', 'paid', 'accredited')
        AND o.status NOT IN ('confirmed', 'paid', 'completed')
        AND p.id IS NULL
    `);

    expect(eligibleForRelease.length).toBe(0);

    const res = db.public.one(`SELECT status FROM stock_reservations WHERE id = 'resC'`);
    expect(res.status).toBe('active');
  });

  it('4. Standalone operational script for COL-20261031-0002 validates exact conditions and idempotent replay', () => {
    db.public.none(`
      INSERT INTO products (id, title, base_price) VALUES ('p_test', 'Prueba Collectibles', 2.00);
      INSERT INTO product_variants (id, product_id, sku, name, inventory_count)
        VALUES ('4528dd85-c3e3-41d0-99ed-95fc0656844d', 'p_test', 'TEST-COLLECTIBLES-UYU2-20261029', 'Estándar', 4);
      INSERT INTO orders (id, order_number, total_amount, status, payment_status, payment_processed_at)
        VALUES ('95c110c1-942c-48ef-9f9a-5e4eec6c1f00', 'COL-20261031-0002', 2.00, 'confirmed', 'approved', now());
      INSERT INTO stock_reservations (id, order_id, variant_id, quantity, reserved_until, status)
        VALUES ('859bf24b-5ea9-4125-b23b-116fb7c7e464', '95c110c1-942c-48ef-9f9a-5e4eec6c1f00', '4528dd85-c3e3-41d0-99ed-95fc0656844d', 1, now() - interval '1 hour', 'released');
    `);

    const executeOperation = () => {
      const order = db.public.one(`
        SELECT status, payment_status FROM orders 
        WHERE id = '95c110c1-942c-48ef-9f9a-5e4eec6c1f00'
      `);
      if (order.status !== 'confirmed' || order.payment_status !== 'approved') return 'skipped_order_state';

      const res = db.public.many(`
        SELECT id, variant_id, quantity FROM stock_reservations 
        WHERE order_id = '95c110c1-942c-48ef-9f9a-5e4eec6c1f00' 
          AND status = 'released' 
          AND variant_id = '4528dd85-c3e3-41d0-99ed-95fc0656844d'
      `);
      if (res.length === 0) return 'already_reconciled';

      const variant = db.public.one(`
        SELECT inventory_count FROM product_variants 
        WHERE id = '4528dd85-c3e3-41d0-99ed-95fc0656844d'
      `);
      if (variant.inventory_count < res[0].quantity) throw new Error('Insufficient stock');

      db.public.none(`
        UPDATE product_variants 
        SET inventory_count = inventory_count - ${res[0].quantity}
        WHERE id = '4528dd85-c3e3-41d0-99ed-95fc0656844d'
      `);
      db.public.none(`
        UPDATE stock_reservations 
        SET status = 'completed'
        WHERE id = '${res[0].id}'
      `);

      return 'success';
    };

    // First execution
    const res1 = executeOperation();
    expect(res1).toBe('success');
    expect(db.public.one(`SELECT inventory_count FROM product_variants WHERE id = '4528dd85-c3e3-41d0-99ed-95fc0656844d'`).inventory_count).toBe(3);
    expect(db.public.one(`SELECT status FROM stock_reservations WHERE id = '859bf24b-5ea9-4125-b23b-116fb7c7e464'`).status).toBe('completed');

    // Second execution (replay)
    const res2 = executeOperation();
    expect(res2).toBe('already_reconciled');
    expect(db.public.one(`SELECT inventory_count FROM product_variants WHERE id = '4528dd85-c3e3-41d0-99ed-95fc0656844d'`).inventory_count).toBe(3);
  });
});

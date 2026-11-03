import { describe, it, expect } from 'vitest';

/**
 * Unit & Contract Tests for create-order suborders & integrity validation
 * Reproduces the required scenarios for the atomic suborders items_count fix.
 */

describe('create-order suborders & atomic integrity contract', () => {
  // Pure helper simulating the suborders construction logic in create-order/index.ts
  function buildSubordersAndItems(payload: {
    items: Array<{
      product_id: string;
      quantity: number;
      price: number;
      vendor_id?: string | null;
      title: string;
    }>;
    selectedShippingMethod?: string;
  }) {
    // 1. Group items by vendor_id
    const groups = new Map<string, typeof payload.items>();
    for (const item of payload.items) {
      const groupKey = item.vendor_id || 'collectibles';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(item);
    }

    const subordersList: any[] = [];
    const orderItems: any[] = [];

    // 2. Build suborders with items_count (The exact fix)
    for (const [groupKey, groupItems] of groups.entries()) {
      const groupKeyStr = String(groupKey ?? 'null');
      const vendorId = groupKey === 'collectibles' ? null : groupKey;
      const groupSubtotal = groupItems.reduce((acc, it) => acc + it.price * it.quantity, 0);

      subordersList.push({
        group_key: groupKeyStr,
        items_count: groupItems.length, // FIX APPLIED HERE
        vendor_id: vendorId,
        is_collectibles_order: vendorId === null,
        product_subtotal: groupSubtotal,
        shipping_method: payload.selectedShippingMethod || 'pickup',
      });

      for (const item of groupItems) {
        orderItems.push({
          group_key: groupKeyStr,
          product_id: item.product_id,
          product_name: item.title,
          quantity: item.quantity,
          unit_price: item.price,
          subtotal: item.price * item.quantity,
        });
      }
    }

    // 3. Pre-flight defensive validation (The exact check added before RPC)
    const validateIntegrity = () => {
      const totalSuborderItemsCount = subordersList.reduce((acc: number, s: any) => acc + Number(s.items_count || 0), 0);
      if (subordersList.length > 0 && totalSuborderItemsCount !== orderItems.length) {
        throw new Error(`INTEGRITY_MISMATCH: La suma de items_count de las subórdenes (${totalSuborderItemsCount}) no coincide con la cantidad total de artículos (${orderItems.length}).`);
      }
      const suborderGroupKeys = new Set(subordersList.map((s: any) => s.group_key));
      for (const item of orderItems) {
        if (!suborderGroupKeys.has(item.group_key)) {
          throw new Error(`INTEGRITY_MISMATCH: El ítem ${item.product_name || item.product_id} tiene un group_key '${item.group_key}' que no existe en las subórdenes.`);
        }
      }
      return true;
    };

    return { subordersList, orderItems, validateIntegrity };
  }

  // Pure helper simulating the Postgres create_order_atomic_v2 SQL validation
  function simulatePostgresRpcV2(orderItems: any[], subordersList: any[]) {
    // Exact SQL check from 20271102090000_atomic_order_idempotency.sql lines 164-171:
    let v_expected_items_count = 0;
    for (const s of subordersList) {
      const itemsCount = Number(s.items_count);
      if (isNaN(itemsCount) || itemsCount === 0) {
        // In SQL: COALESCE(SUM((s->>'items_count')::integer), 0)
      } else {
        v_expected_items_count += itemsCount;
      }
    }

    if (v_expected_items_count !== orderItems.length) {
      throw new Error(`INTEGRITY_MISMATCH: La suma de items de las subórdenes (${v_expected_items_count}) no coincide con la cantidad total de artículos (${orderItems.length}).`);
    }

    // Check item matching to suborders (SQL lines 343-381)
    let v_inserted_items_count = 0;
    for (const suborder of subordersList) {
      let suborderMatched = 0;
      for (const item of orderItems) {
        if (item.group_key === suborder.group_key) {
          suborderMatched++;
        }
      }
      if (suborderMatched !== suborder.items_count) {
        throw new Error(`INTEGRITY_MISMATCH: Suborder ${suborder.group_key} expected ${suborder.items_count} items but found ${suborderMatched}`);
      }
      v_inserted_items_count += suborderMatched;
    }

    if (v_inserted_items_count !== v_expected_items_count) {
      throw new Error(`INTEGRITY_MISMATCH: Inserted items (${v_inserted_items_count}) did not match expected items (${v_expected_items_count}).`);
    }

    return { success: true, insertedSuborders: subordersList.length, insertedItems: v_inserted_items_count };
  }

  it('Scenario 1: 1 Collectibles product, 1 unit, pickup, UYU 2', () => {
    const payload = {
      items: [
        { product_id: 'prod-col-1', quantity: 1, price: 2, vendor_id: null, title: 'Item Collectibles 1' },
      ],
      selectedShippingMethod: 'pickup',
    };

    const { subordersList, orderItems, validateIntegrity } = buildSubordersAndItems(payload);

    expect(subordersList).toHaveLength(1);
    expect(subordersList[0].items_count).toBe(1);
    expect(subordersList[0].vendor_id).toBeNull();
    expect(subordersList[0].is_collectibles_order).toBe(true);
    expect(orderItems).toHaveLength(1);

    expect(() => validateIntegrity()).not.toThrow();
    const rpcResult = simulatePostgresRpcV2(orderItems, subordersList);
    expect(rpcResult.success).toBe(true);
    expect(rpcResult.insertedItems).toBe(1);
  });

  it('Scenario 2: 1 Collectibles product with quantity 3 (1 line item, qty 3)', () => {
    const payload = {
      items: [
        { product_id: 'prod-col-2', quantity: 3, price: 100, vendor_id: null, title: 'Item Collectibles Pack 3' },
      ],
      selectedShippingMethod: 'shipping',
    };

    const { subordersList, orderItems, validateIntegrity } = buildSubordersAndItems(payload);

    // 1 line item means orderItems has length 1
    expect(subordersList).toHaveLength(1);
    expect(subordersList[0].items_count).toBe(1);
    expect(orderItems).toHaveLength(1);
    expect(orderItems[0].quantity).toBe(3);

    expect(() => validateIntegrity()).not.toThrow();
    const rpcResult = simulatePostgresRpcV2(orderItems, subordersList);
    expect(rpcResult.success).toBe(true);
    expect(rpcResult.insertedItems).toBe(1);
  });

  it('Scenario 3: 2 products from the same vendor', () => {
    const payload = {
      items: [
        { product_id: 'p1', quantity: 1, price: 50, vendor_id: 'vendor-alpha', title: 'Card 1' },
        { product_id: 'p2', quantity: 2, price: 75, vendor_id: 'vendor-alpha', title: 'Card 2' },
      ],
      selectedShippingMethod: 'dac_agency',
    };

    const { subordersList, orderItems, validateIntegrity } = buildSubordersAndItems(payload);

    expect(subordersList).toHaveLength(1);
    expect(subordersList[0].group_key).toBe('vendor-alpha');
    expect(subordersList[0].items_count).toBe(2);
    expect(orderItems).toHaveLength(2);

    expect(() => validateIntegrity()).not.toThrow();
    const rpcResult = simulatePostgresRpcV2(orderItems, subordersList);
    expect(rpcResult.success).toBe(true);
    expect(rpcResult.insertedItems).toBe(2);
  });

  it('Scenario 4: Products from different vendors', () => {
    const payload = {
      items: [
        { product_id: 'p1', quantity: 1, price: 50, vendor_id: 'vendor-alpha', title: 'Alpha Card' },
        { product_id: 'p2', quantity: 1, price: 120, vendor_id: 'vendor-beta', title: 'Beta Figure' },
        { product_id: 'p3', quantity: 2, price: 15, vendor_id: null, title: 'Collectibles Sleeve' },
      ],
      selectedShippingMethod: 'shipping',
    };

    const { subordersList, orderItems, validateIntegrity } = buildSubordersAndItems(payload);

    expect(subordersList).toHaveLength(3);
    const alphaSub = subordersList.find(s => s.group_key === 'vendor-alpha');
    const betaSub = subordersList.find(s => s.group_key === 'vendor-beta');
    const colSub = subordersList.find(s => s.group_key === 'collectibles');

    expect(alphaSub.items_count).toBe(1);
    expect(betaSub.items_count).toBe(1);
    expect(colSub.items_count).toBe(1);

    expect(orderItems).toHaveLength(3);

    expect(() => validateIntegrity()).not.toThrow();
    const rpcResult = simulatePostgresRpcV2(orderItems, subordersList);
    expect(rpcResult.success).toBe(true);
    expect(rpcResult.insertedItems).toBe(3);
  });

  it('Scenario 5: Suborders with different shipping methods', () => {
    // Custom suborders with independent shipping methods
    const subordersList = [
      { group_key: 'vendor-1', items_count: 1, shipping_method: 'pickup' },
      { group_key: 'vendor-2', items_count: 1, shipping_method: 'dac_agency' }
    ];
    const orderItems = [
      { group_key: 'vendor-1', product_id: 'p1', product_name: 'P1' },
      { group_key: 'vendor-2', product_id: 'p2', product_name: 'P2' }
    ];

    const rpcResult = simulatePostgresRpcV2(orderItems, subordersList);
    expect(rpcResult.success).toBe(true);
    expect(rpcResult.insertedSuborders).toBe(2);
  });

  it('Scenario 6: Induced error of missing items_count reproduces the exact production bug', () => {
    // This is what was happening before our fix:
    const subordersList = [
      { group_key: 'null' /* items_count missing */ }
    ];
    const orderItems = [
      { group_key: 'null', product_id: 'p1', product_name: 'P1' }
    ];

    expect(() => simulatePostgresRpcV2(orderItems, subordersList)).toThrow(
      'INTEGRITY_MISMATCH: La suma de items de las subórdenes (0) no coincide con la cantidad total de artículos (1).'
    );
  });

  it('Scenario 7: Induced group_key mismatch is caught by defensive pre-flight check', () => {
    const subordersList = [
      { group_key: 'vendor-alpha', items_count: 1 }
    ];
    const orderItems = [
      { group_key: 'vendor-beta', product_id: 'p1', product_name: 'Unmapped Item' }
    ];

    // Pre-flight check
    expect(() => {
      const totalSuborderItemsCount = subordersList.reduce((acc: number, s: any) => acc + Number(s.items_count || 0), 0);
      if (subordersList.length > 0 && totalSuborderItemsCount !== orderItems.length) {
        throw new Error(`INTEGRITY_MISMATCH: La suma de items_count de las subórdenes (${totalSuborderItemsCount}) no coincide con la cantidad total de artículos (${orderItems.length}).`);
      }
      const suborderGroupKeys = new Set(subordersList.map((s: any) => s.group_key));
      for (const item of orderItems) {
        if (!suborderGroupKeys.has(item.group_key)) {
          throw new Error(`INTEGRITY_MISMATCH: El ítem ${item.product_name || item.product_id} tiene un group_key '${item.group_key}' que no existe en las subórdenes.`);
        }
      }
    }).toThrow(/tiene un group_key 'vendor-beta' que no existe en las subórdenes/);
  });
});

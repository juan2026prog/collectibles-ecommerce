import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ShipmentSummary from '../components/checkout/ShipmentSummary';
import { formatProductMoney } from '../lib/priceResolver';

function renderCheckoutSummary(input: {
  subtotal: number;
  finalTotal: number;
  shippingTotal?: number;
  vendors?: string[];
  costs?: Record<string, number>;
  selected?: Record<string, {method: string}>;
  currency?: 'UYU' | 'USD';
}) {
  const { subtotal, finalTotal, shippingTotal = 0, vendors = ['collectibles'],
    costs = { collectibles: 0 }, selected = { collectibles: { method: 'pickup' } },
    currency = 'UYU' } = input;
  return renderToStaticMarkup(React.createElement(ShipmentSummary, {
    items: [{ title: 'producto prueba collectibles', price: 2, quantity: 1 }],
    uniqueStoreKeys: vendors,
    getVendorName: (key: string) => key === 'collectibles' ? 'Collectibles.uy' : 'JorgiToys',
    subordersShipping: selected,
    vendorShippingCosts: costs,
    subtotal,
    shippingTotal,
    finalTotal,
    formatAmount: (amount: number) => formatProductMoney({ amount, currency }),
  }));
}

describe('Checkout — currency native and shipping price integrity', () => {
  it('shows UYU 2 without converting it to UYU 80 or inventing shipment savings', () => {
    const html = renderCheckoutSummary({ subtotal: 2, finalTotal: 2 });
    expect(html).toContain('$ 2 UYU');
    expect(html).toContain('Retiro en local');
    expect(html).toContain('GRATIS');
    expect(html).not.toContain('$ 80');
    expect(html).not.toContain('Ahorro en envíos');
    expect(html).not.toContain('8.818');
  });

  it('shows a 2 + 2490 UYU vendor cart as UYU 2492, not UYU 99888', () => {
    const html = renderCheckoutSummary({
      subtotal: 2492, finalTotal: 2492, shippingTotal: 0,
      vendors: ['collectibles','jorgitoys'],
      selected: { collectibles:{ method:'pickup' }, jorgitoys:{ method:'dac_home' } },
      costs: { collectibles:0, jorgitoys:0 },
    });
    expect(html).toContain('$ 2.492 UYU');
    expect(html).not.toContain('99.888');
    expect(html).not.toContain('Ahorro en envíos');
  });

  it('does not label a not-yet-priced vendor DAC delivery as free', () => {
    const html = renderCheckoutSummary({
      subtotal:2492, finalTotal:2492,
      vendors:['collectibles','jorgitoys'],
      selected:{collectibles:{method:'pickup'},jorgitoys:{method:'dac_home'}},
      costs:{collectibles:0},
    });
    expect(html).toContain('Por calcular');
    expect(html).toContain('Pendiente del costo de envío');
    expect(html).not.toContain('99.888');
  });

  it('includes confirmed shipping in native UYU rather than converting it from USD', () => {
    const html = renderCheckoutSummary({
      subtotal:2492, shippingTotal:180, finalTotal:2672,
      vendors:['collectibles','jorgitoys'],
      selected:{collectibles:{method:'pickup'},jorgitoys:{method:'dac_home'}},
      costs:{collectibles:0,jorgitoys:180}
    });
    expect(html).toContain('$ 180 UYU');
    expect(html).toContain('$ 2.672 UYU');
    expect(html).not.toContain('Pendiente del costo de envío');
  });

  it('keeps USD native for an international checkout', () => {
    const html = renderCheckoutSummary({
      subtotal:25, finalTotal:25, shippingTotal:0, currency:'USD',
      vendors:['international'], selected:{international:{method:'international_courier_direct'}}, costs:{}
    });
    expect(html).toContain('US$ 25');
    expect(html).not.toContain('2.125');
  });
});

import { describe, it, expect } from 'vitest';

// ─── Pure logic mirrored from calculate-commissions Edge Function ─────────────
function calculateVendorPayout(unitPrice: number, quantity: number, platformFeeRate: number) {
  const gross = unitPrice * quantity;
  const platformFee = gross * (platformFeeRate / 100);
  return {
    gross,
    platformFee: parseFloat(platformFee.toFixed(2)),
    netPayout: parseFloat((gross - platformFee).toFixed(2)),
  };
}

function calculateAffiliateCommission(orderTotal: number, commissionRate: number) {
  return parseFloat((orderTotal * (commissionRate / 100)).toFixed(2));
}

function calculateLoyaltyPoints(orderTotal: number, pointsPerUnit = 100) {
  return Math.floor(orderTotal / pointsPerUnit);
}

function calculateShipping(subtotal: number, freeAbove = 4000, fixedRate = 350) {
  return subtotal >= freeAbove ? 0 : fixedRate;
}

// ─── Commission Calculation ───────────────────────────────────────────────────
describe('💰 Cálculo de Comisiones de Vendedor', () => {
  it('10% fee: $150 × 2 = $300 bruto → $270 neto', () => {
    const result = calculateVendorPayout(150, 2, 10);
    expect(result.gross).toBe(300);
    expect(result.platformFee).toBe(30);
    expect(result.netPayout).toBe(270);
  });

  it('0% fee: vendedor retiene el 100%', () => {
    const result = calculateVendorPayout(50, 3, 0);
    expect(result.gross).toBe(150);
    expect(result.platformFee).toBe(0);
    expect(result.netPayout).toBe(150);
  });

  it('15% fee: $1000 producto → $850 neto', () => {
    const result = calculateVendorPayout(1000, 1, 15);
    expect(result.netPayout).toBe(850);
  });

  it('Redondeo correcto a 2 decimales', () => {
    const result = calculateVendorPayout(33.33, 1, 10);
    expect(result.platformFee).toBe(3.33);
    expect(result.netPayout).toBe(30);
  });
});

// ─── Affiliate Commission ─────────────────────────────────────────────────────
describe('🔗 Cálculo de Comisiones de Afiliado', () => {
  it('5% sobre $500 = $25', () => {
    expect(calculateAffiliateCommission(500, 5)).toBe(25);
  });

  it('10% sobre $1200 = $120', () => {
    expect(calculateAffiliateCommission(1200, 10)).toBe(120);
  });

  it('0% no genera comisión', () => {
    expect(calculateAffiliateCommission(999, 0)).toBe(0);
  });

  it('Redondeo correcto: 7% sobre $333 = $23.31', () => {
    expect(calculateAffiliateCommission(333, 7)).toBe(23.31);
  });
});

// ─── Loyalty Points ───────────────────────────────────────────────────────────
describe('⭐ Puntos de Lealtad', () => {
  it('$100 = 1 punto', () => {
    expect(calculateLoyaltyPoints(100)).toBe(1);
  });

  it('$450 = 4 puntos (floor)', () => {
    expect(calculateLoyaltyPoints(450)).toBe(4);
  });

  it('$99 = 0 puntos (menos del mínimo)', () => {
    expect(calculateLoyaltyPoints(99)).toBe(0);
  });

  it('$5000 = 50 puntos', () => {
    expect(calculateLoyaltyPoints(5000)).toBe(50);
  });
});

// ─── Shipping Calculation ─────────────────────────────────────────────────────
describe('🚚 Cálculo de Envío', () => {
  it('Envío gratis sobre $4000', () => {
    expect(calculateShipping(4000)).toBe(0);
    expect(calculateShipping(5000)).toBe(0);
  });

  it('Envío con costo bajo $4000', () => {
    expect(calculateShipping(3999)).toBe(350);
    expect(calculateShipping(0)).toBe(350);
  });

  it('Exactamente en el límite = gratis', () => {
    expect(calculateShipping(4000)).toBe(0);
  });
});

// ─── Grand Total Calculation ──────────────────────────────────────────────────
describe('🧾 Total Final del Pedido', () => {
  it('Subtotal + envío - descuento = total correcto', () => {
    const subtotal = 3000;
    const shipping = calculateShipping(subtotal); // 350
    const discount = 150;
    const total = subtotal + shipping - discount;
    expect(total).toBe(3200);
  });

  it('Total no puede ser negativo', () => {
    const subtotal = 100;
    const shipping = calculateShipping(subtotal); // 350
    const discount = 1000; // cupón enorme
    const total = Math.max(subtotal + shipping - discount, 0);
    expect(total).toBe(0);
  });

  it('Con envío gratis y sin cupón: subtotal = total', () => {
    const subtotal = 5000;
    const shipping = calculateShipping(subtotal); // 0
    const total = subtotal + shipping;
    expect(total).toBe(5000);
  });
});

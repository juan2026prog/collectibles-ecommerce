import { describe, it, expect } from 'vitest';

// ─── Mathematical Formulas for Marketplace P2 ───────────────────────────────

function calculatePaymentFeeShare(totalPaymentFee: number, suborderTotal: number, orderTotal: number) {
  return parseFloat((totalPaymentFee * suborderTotal / orderTotal).toFixed(2));
}

function calculateMarketplaceFee(productSubtotal: number, commissionRate: number) {
  return parseFloat((productSubtotal * (commissionRate / 100)).toFixed(2));
}

interface CalculateVendorNetParams {
  productSubtotal: number;
  shippingCost: number;
  marketplaceFee: number;
  paymentFeeShare: number;
  adjustments?: number;
}

function calculateVendorNet({
  productSubtotal,
  shippingCost,
  marketplaceFee,
  paymentFeeShare,
  adjustments = 0
}: CalculateVendorNetParams) {
  return parseFloat((productSubtotal + shippingCost - marketplaceFee - paymentFeeShare + adjustments).toFixed(2));
}

// ─── Marketplace P2 Calculations & Flows Test Suite ──────────────────────────

describe('🛒 Marketplace P2 - Cálculos de Multi-Vendedor y Liquidaciones', () => {

  describe('Caso del Usuario (FASE 18)', () => {
    // Inputs
    const orderTotal = 3350;
    const totalPaymentFee = 184;

    // Hasbro Package
    const hasbroProductSubtotal = 1000;
    const hasbroShippingCost = 200;
    const hasbroCommissionRate = 5; // 5% fallback

    // Collectibles Package (Internal Vendor)
    const collectiblesProductSubtotal = 2000;
    const collectiblesShippingCost = 150;

    it('Hasbro: gross = $1200, commission = $50, gateway = $66, net = $1084', () => {
      const suborderTotal = hasbroProductSubtotal + hasbroShippingCost; // 1200
      
      const gross = hasbroProductSubtotal + hasbroShippingCost;
      const marketplaceFee = calculateMarketplaceFee(hasbroProductSubtotal, hasbroCommissionRate);
      const paymentFeeShare = calculatePaymentFeeShare(totalPaymentFee, suborderTotal, orderTotal);
      const net = calculateVendorNet({
        productSubtotal: hasbroProductSubtotal,
        shippingCost: hasbroShippingCost,
        marketplaceFee,
        paymentFeeShare
      });

      expect(gross).toBe(1200);
      expect(marketplaceFee).toBe(50); // 5% of $1000
      // 184 * 1200 / 3350 = 65.9104... -> approx $65.91 (rounded to 2 decimals)
      expect(paymentFeeShare).toBe(65.91); 
      // 1200 - 50 - 65.91 = 1084.09 -> approx $1084.09
      expect(net).toBe(1084.09);
      
      // Checking user's approx values
      expect(Math.round(paymentFeeShare)).toBe(66);
      expect(Math.round(net)).toBe(1084);
    });

    it('Collectibles (Internal): gross = $2150, gateway = $118, net = $2032', () => {
      const suborderTotal = collectiblesProductSubtotal + collectiblesShippingCost; // 2150
      
      const gross = collectiblesProductSubtotal + collectiblesShippingCost;
      const marketplaceFee = 0; // Internal vendor pays 0 commission
      const paymentFeeShare = calculatePaymentFeeShare(totalPaymentFee, suborderTotal, orderTotal);
      const net = calculateVendorNet({
        productSubtotal: collectiblesProductSubtotal,
        shippingCost: collectiblesShippingCost,
        marketplaceFee,
        paymentFeeShare
      });

      expect(gross).toBe(2150);
      expect(marketplaceFee).toBe(0);
      // 184 * 2150 / 3350 = 118.0895... -> approx $118.09 (rounded to 2 decimals)
      expect(paymentFeeShare).toBe(118.09); 
      // 2150 - 118.09 = 2031.91
      expect(net).toBe(2031.91);

      // Checking user's approx values
      expect(Math.round(paymentFeeShare)).toBe(118);
      expect(Math.round(net)).toBe(2032);
    });

    it('Sum of fee shares equals total gateway fee', () => {
      const hasbroTotal = hasbroProductSubtotal + hasbroShippingCost; // 1200
      const collectiblesTotal = collectiblesProductSubtotal + collectiblesShippingCost; // 2150
      
      const hasbroShare = calculatePaymentFeeShare(totalPaymentFee, hasbroTotal, orderTotal);
      const collectiblesShare = calculatePaymentFeeShare(totalPaymentFee, collectiblesTotal, orderTotal);
      
      // 65.91 + 118.09 = 184.00
      expect(hasbroShare + collectiblesShare).toBe(totalPaymentFee);
    });
  });

  describe('Reglas de Comisiones por Antigüedad (FASE 5)', () => {
    it('Nuevos Vendors (primeros 2 meses): Comisión del 3%', () => {
      const productSubtotal = 1500;
      const commission = calculateMarketplaceFee(productSubtotal, 3);
      expect(commission).toBe(45); // 3% of 1500
    });

    it('Vendors Antiguos (más de 2 meses) / Fallback: Comisión del 5%', () => {
      const productSubtotal = 1500;
      const commission = calculateMarketplaceFee(productSubtotal, 5);
      expect(commission).toBe(75); // 5% of 1500
    });
  });

  describe('Cálculos de Liquidación Semanal (FASE 11 & 12)', () => {
    it('Liquidación neta es la suma de los netos de las subórdenes elegibles', () => {
      const suborders = [
        { productSubtotal: 1000, shippingCost: 200, marketplaceFee: 50, paymentFeeShare: 65.91 },
        { productSubtotal: 500, shippingCost: 100, marketplaceFee: 25, paymentFeeShare: 32.96 }
      ];

      const nets = suborders.map(s => 
        calculateVendorNet({
          productSubtotal: s.productSubtotal,
          shippingCost: s.shippingCost,
          marketplaceFee: s.marketplaceFee,
          paymentFeeShare: s.paymentFeeShare
        })
      );

      expect(nets[0]).toBe(1084.09);
      expect(nets[1]).toBe(542.04);

      const totalNetPayout = parseFloat((nets[0] + nets[1]).toFixed(2));
      expect(totalNetPayout).toBe(1626.13);
    });
  });
});

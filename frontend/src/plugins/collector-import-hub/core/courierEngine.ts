import type { ImportCourier, CourierCostBreakdown } from '../types';

export const DEFAULT_COURIERS: ImportCourier[] = [
  {
    id: 'puntomio',
    code: 'puntomio',
    name: 'PuntoMio',
    is_active: true,
    handling_fee_usd: 0,
    ursec_fee_percent: 0,
    insurance_fee_percent: 0,
    local_delivery_fee_usd: 0,
    min_charge_usd: 11.50,
    currency: 'USD',
    has_volumetric_weight: false,
    sort_order: 1,
    notes: 'Tarifas planas por rango y USD 10.50/kg sobre 5 kg. Sin handling.',
    rates: [
      { min_weight_kg: 0, max_weight_kg: 0.5, rate_type: 'FLAT_RATE', rate_usd: 11.50, label: '0 a 500g' },
      { min_weight_kg: 0.501, max_weight_kg: 1.0, rate_type: 'FLAT_RATE', rate_usd: 16.50, label: '500g a 1kg' },
      { min_weight_kg: 1.001, max_weight_kg: 2.0, rate_type: 'FLAT_RATE', rate_usd: 24.50, label: '1kg a 2kg' },
      { min_weight_kg: 2.001, max_weight_kg: 5.0, rate_type: 'PER_KG', rate_usd: 12.00, label: '2kg a 5kg (USD 12.00/kg)' },
      { min_weight_kg: 5.001, max_weight_kg: 20.0, rate_type: 'PER_KG', rate_usd: 10.50, label: '5kg a 20kg (USD 10.50/kg)' },
    ]
  },
  {
    id: 'urubox',
    code: 'urubox',
    name: 'Urubox',
    is_active: true,
    handling_fee_usd: 5.00,
    ursec_fee_percent: 10.0,
    insurance_fee_percent: 0,
    local_delivery_fee_usd: 0,
    min_charge_usd: 10.90,
    currency: 'USD',
    has_volumetric_weight: false,
    sort_order: 2,
    notes: 'Tarifas por tramos + USD 5 handling + 10% URSEC.',
    rates: [
      { min_weight_kg: 0, max_weight_kg: 0.2, rate_type: 'FLAT_RATE', rate_usd: 10.90, label: '0 a 200g' },
      { min_weight_kg: 0.201, max_weight_kg: 0.5, rate_type: 'FLAT_RATE', rate_usd: 15.90, label: '200g a 500g' },
      { min_weight_kg: 0.501, max_weight_kg: 0.7, rate_type: 'FLAT_RATE', rate_usd: 18.90, label: '500g a 700g' },
      { min_weight_kg: 0.701, max_weight_kg: 1.0, rate_type: 'FLAT_RATE', rate_usd: 20.90, label: '700g a 1kg' },
      { min_weight_kg: 1.001, max_weight_kg: 5.0, rate_type: 'PER_KG', rate_usd: 19.90, label: '1kg a 5kg (USD 19.90/kg)' },
      { min_weight_kg: 5.001, max_weight_kg: 10.0, rate_type: 'PER_KG', rate_usd: 17.90, label: '5kg a 10kg (USD 17.90/kg)' },
      { min_weight_kg: 10.001, max_weight_kg: 20.0, rate_type: 'PER_KG', rate_usd: 16.50, label: '10kg a 20kg (USD 16.50/kg)' },
    ]
  },
  {
    id: 'usx_cargo',
    code: 'usx_cargo',
    name: 'USX Cargo',
    is_active: true,
    handling_fee_usd: 3.50,
    ursec_fee_percent: 0,
    insurance_fee_percent: 0,
    local_delivery_fee_usd: 0,
    min_charge_usd: 17.00,
    currency: 'USD',
    has_volumetric_weight: false,
    sort_order: 3,
    notes: 'Tarifa preferencial para cajas y estatuas de coleccionista.',
    rates: [
      { min_weight_kg: 0, max_weight_kg: 1.0, rate_type: 'FLAT_RATE', rate_usd: 17.00, label: '0 a 1kg' },
      { min_weight_kg: 1.001, max_weight_kg: 5.0, rate_type: 'PER_KG', rate_usd: 14.50, label: '1kg a 5kg (USD 14.50/kg)' },
      { min_weight_kg: 5.001, max_weight_kg: 20.0, rate_type: 'PER_KG', rate_usd: 11.90, label: '5kg a 20kg (USD 11.90/kg)' },
    ]
  }
];

export function estimateProductWeight(categoryOrTitle?: string | null): { weightKg: number; isEstimated: boolean } {
  const text = (categoryOrTitle || '').toLowerCase();
  if (text.includes('funko')) return { weightKg: 0.35, isEstimated: true };
  if (text.includes('marvel legends') || text.includes('hasbro') || text.includes('star wars black series')) return { weightKg: 0.55, isEstimated: true };
  if (text.includes('neca') || text.includes('mcfarlane') || text.includes('mafex') || text.includes('figuarts')) return { weightKg: 0.85, isEstimated: true };
  if (text.includes('hot toys') || text.includes('sixth scale') || text.includes('1:6')) return { weightKg: 2.80, isEstimated: true };
  if (text.includes('estatua') || text.includes('statue') || text.includes('polystone') || text.includes('1:4') || text.includes('sideshow')) return { weightKg: 6.50, isEstimated: true };
  if (text.includes('lego')) return { weightKg: 1.80, isEstimated: true };
  if (text.includes('manga') || text.includes('comic') || text.includes('libro') || text.includes('book')) return { weightKg: 0.50, isEstimated: true };
  return { weightKg: 1.00, isEstimated: true };
}

export class CourierEngine {
  private couriers: ImportCourier[];

  constructor(couriers: ImportCourier[] = DEFAULT_COURIERS) {
    this.couriers = couriers.filter(c => c.is_active);
  }

  public calculateSingle(courier: ImportCourier, weightKg: number, isWeightEstimated = false): CourierCostBreakdown {
    const weight = Math.max(0.05, weightKg);
    const isOverweight = weight > 20.00;

    let baseFreight = 0;
    let tierLabel = 'Tarifa base';

    if (isOverweight) {
      return {
        courierCode: courier.code,
        courierName: courier.name,
        physicalWeightKg: weight,
        isWeightEstimated,
        baseFreightUsd: 0,
        handlingFeeUsd: 0,
        ursecFeeUsd: 0,
        insuranceFeeUsd: 0,
        localDeliveryFeeUsd: 0,
        otherFeesUsd: 0,
        totalCourierUsd: 0,
        effectiveCostPerKgUsd: 0,
        tierLabel: 'Excede peso máximo (20 kg)',
        isOverweight: true
      };
    }

    // Find matching rate tier
    const matchingTier = courier.rates?.find(r => weight >= r.min_weight_kg && weight <= r.max_weight_kg);

    if (matchingTier) {
      tierLabel = matchingTier.label;
      if (matchingTier.rate_type === 'FLAT_RATE') {
        baseFreight = matchingTier.rate_usd;
      } else {
        baseFreight = weight * matchingTier.rate_usd;
      }
    } else {
      // Fallback
      baseFreight = weight * 15.00;
      tierLabel = `${weight.toFixed(2)} kg x USD 15.00/kg`;
    }

    // Additional components
    const handling = courier.handling_fee_usd || 0;
    const ursec = Number((baseFreight * ((courier.ursec_fee_percent || 0) / 100)).toFixed(2));
    const insurance = Number((baseFreight * ((courier.insurance_fee_percent || 0) / 100)).toFixed(2));
    const localDelivery = courier.local_delivery_fee_usd || 0;
    const otherFees = ursec + insurance + localDelivery;

    const totalCourier = Number((baseFreight + handling + otherFees).toFixed(2));
    
    // FÓRMULA CLAVE: Costo total courier / peso físico = costo efectivo por kg
    const effectiveCostPerKg = Number((totalCourier / weight).toFixed(2));

    return {
      courierCode: courier.code,
      courierName: courier.name,
      physicalWeightKg: Number(weight.toFixed(2)),
      isWeightEstimated,
      baseFreightUsd: Number(baseFreight.toFixed(2)),
      handlingFeeUsd: handling,
      ursecFeeUsd: ursec,
      insuranceFeeUsd: insurance,
      localDeliveryFeeUsd: localDelivery,
      otherFeesUsd: Number(otherFees.toFixed(2)),
      totalCourierUsd: totalCourier,
      effectiveCostPerKgUsd: effectiveCostPerKg,
      tierLabel,
      isOverweight: false
    };
  }

  public compareAll(weightKg: number, isWeightEstimated = false): CourierCostBreakdown[] {
    return this.couriers
      .map(c => this.calculateSingle(c, weightKg, isWeightEstimated))
      .sort((a, b) => a.totalCourierUsd - b.totalCourierUsd);
  }

  public getCourierByCode(code: string): ImportCourier | undefined {
    return this.couriers.find(c => c.code.toLowerCase() === code.toLowerCase()) || this.couriers[0];
  }
}

export function calculateAllCouriersCost(
  couriers: ImportCourier[],
  weightKg: number,
  productPriceUsd: number,
  category = 'REGULAR',
  hasUrsecPermit = false
): CourierCostBreakdown[] {
  const engine = new CourierEngine(couriers);
  return engine.compareAll(weightKg, false);
}

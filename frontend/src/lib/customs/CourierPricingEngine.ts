/**
 * Courier Pricing Engine
 * 
 * Computes shipping and handling fees for couriers (PuntoMio, Urubox, USX).
 * STRICT LAW: NEVER calculate or accept volumetric weight (L * W * H / divisor).
 * Strictly evaluate actual weight in kilograms.
 */

export interface CourierRateDefinition {
  courierCode: 'puntomio' | 'urubox' | 'usx_cargo';
  courierName: string;
  minWeightKg: number;
  maxWeightKg: number;
  fixedPriceUsd?: number;
  ratePerKgUsd?: number;
  handlingFeeUsd: number;
  ursecFeePercent?: number; // Urubox 10%
}

export interface CourierCalculationResult {
  courierCode: string;
  courierName: string;
  weightKg: number;
  baseFreightUsd: number;
  handlingUsd: number;
  ursecUsd: number;
  totalCourierUsd: number;
  breakdownDescription: string;
  isOverweight: boolean;
}

export const KNOWN_COURIERS: Record<string, { code: string; name: string }> = {
  puntomio: { code: 'puntomio', name: 'PuntoMio' },
  urubox: { code: 'urubox', name: 'Urubox' },
  usx_cargo: { code: 'usx_cargo', name: 'USX Cargo' }
};

export class CourierPricingEngine {
  /**
   * Calculates rate for PuntoMio
   * Tiering:
   * 0 - 0.5 kg: USD 11.50
   * 0.5 - 1.0 kg: USD 16.50
   * 1.0 - 2.0 kg: USD 24.50
   * 2.0 - 5.0 kg: USD 12.00 / kg
   * 5.0 - 20.0 kg: USD 10.50 / kg
   */
  public static calculatePuntoMio(weightKg: number): CourierCalculationResult {
    const courierCode = 'puntomio';
    const courierName = 'PuntoMio';

    if (weightKg > 20) {
      return {
        courierCode,
        courierName,
        weightKg,
        baseFreightUsd: 0,
        handlingUsd: 0,
        ursecUsd: 0,
        totalCourierUsd: 0,
        breakdownDescription: 'Excede el peso máximo permitido (20 kg).',
        isOverweight: true
      };
    }

    let baseFreight = 0;
    let desc = '';

    if (weightKg <= 0.5) {
      baseFreight = 11.50;
      desc = 'Tarifa fija hasta 500g (USD 11.50)';
    } else if (weightKg <= 1.0) {
      baseFreight = 16.50;
      desc = 'Tarifa fija 500g a 1kg (USD 16.50)';
    } else if (weightKg <= 2.0) {
      baseFreight = 24.50;
      desc = 'Tarifa fija 1kg a 2kg (USD 24.50)';
    } else if (weightKg <= 5.0) {
      baseFreight = weightKg * 12.00;
      desc = `${weightKg.toFixed(2)} kg x USD 12.00/kg`;
    } else {
      baseFreight = weightKg * 10.50;
      desc = `${weightKg.toFixed(2)} kg x USD 10.50/kg`;
    }

    baseFreight = Number(baseFreight.toFixed(2));

    return {
      courierCode,
      courierName,
      weightKg,
      baseFreightUsd: baseFreight,
      handlingUsd: 0,
      ursecUsd: 0,
      totalCourierUsd: baseFreight,
      breakdownDescription: desc,
      isOverweight: false
    };
  }

  /**
   * Calculates rate for Urubox
   * 0 - 0.2 kg: USD 10.90
   * 0.2 - 0.5 kg: USD 15.90
   * 0.5 - 0.7 kg: USD 18.90
   * 0.7 - 1.0 kg: USD 20.90
   * 1.0 - 5.0 kg: USD 19.90 / kg
   * 5.0 - 10.0 kg: USD 17.90 / kg
   * 10.0 - 20.0 kg: USD 16.50 / kg
   * Plus handling: USD 5.00
   * Plus URSEC: 10% of base freight
   */
  public static calculateUrubox(weightKg: number): CourierCalculationResult {
    const courierCode = 'urubox';
    const courierName = 'Urubox';

    if (weightKg > 20) {
      return {
        courierCode,
        courierName,
        weightKg,
        baseFreightUsd: 0,
        handlingUsd: 0,
        ursecUsd: 0,
        totalCourierUsd: 0,
        breakdownDescription: 'Excede el peso máximo permitido (20 kg).',
        isOverweight: true
      };
    }

    let baseFreight = 0;
    let desc = '';

    if (weightKg <= 0.2) {
      baseFreight = 10.90;
      desc = '0 a 200g (USD 10.90)';
    } else if (weightKg <= 0.5) {
      baseFreight = 15.90;
      desc = '200g a 500g (USD 15.90)';
    } else if (weightKg <= 0.7) {
      baseFreight = 18.90;
      desc = '500g a 700g (USD 18.90)';
    } else if (weightKg <= 1.0) {
      baseFreight = 20.90;
      desc = '700g a 1kg (USD 20.90)';
    } else if (weightKg <= 5.0) {
      baseFreight = weightKg * 19.90;
      desc = `${weightKg.toFixed(2)} kg x USD 19.90/kg`;
    } else if (weightKg <= 10.0) {
      baseFreight = weightKg * 17.90;
      desc = `${weightKg.toFixed(2)} kg x USD 17.90/kg`;
    } else {
      baseFreight = weightKg * 16.50;
      desc = `${weightKg.toFixed(2)} kg x USD 16.50/kg`;
    }

    const handling = 5.00;
    const ursec = Number((baseFreight * 0.10).toFixed(2));
    const total = Number((baseFreight + handling + ursec).toFixed(2));

    return {
      courierCode,
      courierName,
      weightKg,
      baseFreightUsd: Number(baseFreight.toFixed(2)),
      handlingUsd: handling,
      ursecUsd: ursec,
      totalCourierUsd: total,
      breakdownDescription: `${desc} + USD 5 handling + 10% URSEC`,
      isOverweight: false
    };
  }

  /**
   * Generic entrypoint for any supported courier
   */
  public static calculate({
    courierCode,
    weightKg
  }: {
    courierCode: string;
    weightKg: number;
  }): CourierCalculationResult {
    const cleanCode = courierCode.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanCode.includes('urubox')) {
      return this.calculateUrubox(weightKg);
    }
    // Default to PuntoMio as leading cost-efficient courier
    return this.calculatePuntoMio(weightKg);
  }
}

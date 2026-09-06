/**
 * Courier Pricing Engine
 * 
 * Computes shipping and handling fees for couriers (PuntoMio, Urubox, USX).
 * STRICT LAW: NEVER calculate or accept volumetric weight (L * W * H / divisor).
 * Strictly evaluate actual weight in kilograms.
 */

export interface CourierRateDefinition {
  courierCode: 'puntomio' | 'urubox' | 'mbe' | 'usx_cargo';
  courierName: string;
  minWeightKg: number;
  maxWeightKg: number;
  fixedPriceUsd?: number;
  ratePerKgUsd?: number;
  handlingFeeUsd: number;
  estimatedDeliveryDays?: string;
  ursecFeePercent?: number;
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
  estimatedDeliveryDays: string;
  isOverweight: boolean;
}

export interface KnownCourierMeta {
  code: string;
  name: string;
  deliveryDays: string;
  defaultAddressLine1: string;
  defaultAddressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
}

export const KNOWN_COURIERS: Record<string, KnownCourierMeta> = {
  puntomio: { 
    code: 'puntomio', 
    name: 'PuntoMio', 
    deliveryDays: '4 a 6 días hábiles',
    defaultAddressLine1: '2200 NW 129th Ave',
    defaultAddressLine2: 'Suite UY',
    city: 'Doral',
    state: 'FL',
    postalCode: '33182',
    phone: '+1 (305) 477-2020'
  },
  urubox: { 
    code: 'urubox', 
    name: 'Urubox', 
    deliveryDays: '5 a 8 días hábiles',
    defaultAddressLine1: '2030 NW 95th Ave',
    defaultAddressLine2: 'Suite UY',
    city: 'Doral',
    state: 'FL',
    postalCode: '33172',
    phone: '+1 (786) 314-0977'
  },
  usx_cargo: { 
    code: 'usx_cargo', 
    name: 'USX Cargo', 
    deliveryDays: '4 a 7 días hábiles',
    defaultAddressLine1: '8400 NW 25th St',
    defaultAddressLine2: 'Suite USX',
    city: 'Doral',
    state: 'FL',
    postalCode: '33198',
    phone: '+1 (305) 592-7474'
  },
  buybox: { 
    code: 'buybox', 
    name: 'BuyBox Uruguay', 
    deliveryDays: '5 a 8 días hábiles',
    defaultAddressLine1: '8290 NW 66th St',
    defaultAddressLine2: 'Suite BUY',
    city: 'Miami',
    state: 'FL',
    postalCode: '33166',
    phone: '+1 (786) 693-8080'
  },
  mbe: { 
    code: 'mbe', 
    name: 'Mail Boxes Etc. (MBE)', 
    deliveryDays: '3 a 5 días hábiles',
    defaultAddressLine1: '8333 NW 53rd St',
    defaultAddressLine2: 'Suite 450',
    city: 'Doral',
    state: 'FL',
    postalCode: '33166',
    phone: '+1 (305) 436-1212'
  }
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
    const estimatedDeliveryDays = '4 a 6 días hábiles';

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
        estimatedDeliveryDays,
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
      estimatedDeliveryDays,
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
   * Plus handling: USD 4.90
   */
  public static calculateUrubox(weightKg: number): CourierCalculationResult {
    const courierCode = 'urubox';
    const courierName = 'Urubox';
    const estimatedDeliveryDays = '5 a 8 días hábiles';

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
        estimatedDeliveryDays,
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

    const handling = 4.90;
    const total = Number((baseFreight + handling).toFixed(2));

    return {
      courierCode,
      courierName,
      weightKg,
      baseFreightUsd: Number(baseFreight.toFixed(2)),
      handlingUsd: handling,
      ursecUsd: 0,
      totalCourierUsd: total,
      breakdownDescription: `${desc} + USD 4.90 handling`,
      estimatedDeliveryDays,
      isOverweight: false
    };
  }

  /**
   * Calculates rate for MBE (Mail Boxes Etc.)
   * Express Air freight: USD 13.50 / kg (min. 0.5 kg: USD 9.50) + USD 3.50 handling
   */
  public static calculateMBE(weightKg: number): CourierCalculationResult {
    const courierCode = 'mbe';
    const courierName = 'Mail Boxes Etc. (MBE)';
    const estimatedDeliveryDays = '3 a 5 días hábiles';

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
        estimatedDeliveryDays,
        isOverweight: true
      };
    }

    let baseFreight = 0;
    let desc = '';

    if (weightKg <= 0.5) {
      baseFreight = 9.50;
      desc = 'Tarifa base hasta 500g (USD 9.50)';
    } else {
      baseFreight = weightKg * 13.50;
      desc = `${weightKg.toFixed(2)} kg x USD 13.50/kg`;
    }

    const handling = 3.50;
    const total = Number((baseFreight + handling).toFixed(2));

    return {
      courierCode,
      courierName,
      weightKg,
      baseFreightUsd: Number(baseFreight.toFixed(2)),
      handlingUsd: handling,
      ursecUsd: 0,
      totalCourierUsd: total,
      breakdownDescription: `${desc} + USD 3.50 despacho y seguro`,
      estimatedDeliveryDays,
      isOverweight: false
    };
  }

  /**
   * Calculates rate for USX Cargo
   * USD 17.50 / kg (min. USD 9.90)
   */
  public static calculateUSX(weightKg: number): CourierCalculationResult {
    const courierCode = 'usx_cargo';
    const courierName = 'USX Cargo';
    const estimatedDeliveryDays = '4 a 7 días hábiles';

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
        estimatedDeliveryDays,
        isOverweight: true
      };
    }

    const baseFreight = Math.max(9.90, weightKg * 17.50);
    const total = Number(baseFreight.toFixed(2));

    return {
      courierCode,
      courierName,
      weightKg,
      baseFreightUsd: total,
      handlingUsd: 0,
      ursecUsd: 0,
      totalCourierUsd: total,
      breakdownDescription: `${weightKg.toFixed(2)} kg x USD 17.50/kg (mín. USD 9.90)`,
      estimatedDeliveryDays,
      isOverweight: false
    };
  }

  /**
   * Calculates rate for BuyBox Uruguay
   * USD 18.00 / kg (min. USD 10.00)
   */
  public static calculateBuyBox(weightKg: number): CourierCalculationResult {
    const courierCode = 'buybox';
    const courierName = 'BuyBox Uruguay';
    const estimatedDeliveryDays = '5 a 8 días hábiles';

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
        estimatedDeliveryDays,
        isOverweight: true
      };
    }

    const baseFreight = Math.max(10.00, weightKg * 18.00);
    const total = Number(baseFreight.toFixed(2));

    return {
      courierCode,
      courierName,
      weightKg,
      baseFreightUsd: total,
      handlingUsd: 0,
      ursecUsd: 0,
      totalCourierUsd: total,
      breakdownDescription: `${weightKg.toFixed(2)} kg x USD 18.00/kg (mín. USD 10.00)`,
      estimatedDeliveryDays,
      isOverweight: false
    };
  }

  /**
   * Generic entrypoint for any supported courier
   */
  public static calculate({
    courierCode,
    weightKg,
    customRatePerKgUsd = 18.00
  }: {
    courierCode: string;
    weightKg: number;
    customRatePerKgUsd?: number;
  }): CourierCalculationResult {
    const cleanCode = courierCode.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanCode.includes('urubox')) {
      return this.calculateUrubox(weightKg);
    }
    if (cleanCode.includes('mbe')) {
      return this.calculateMBE(weightKg);
    }
    if (cleanCode.includes('usx')) {
      return this.calculateUSX(weightKg);
    }
    if (cleanCode.includes('buybox')) {
      return this.calculateBuyBox(weightKg);
    }
    if (cleanCode.includes('puntomio')) {
      return this.calculatePuntoMio(weightKg);
    }

    // Custom or unrecognized courier
    const rate = customRatePerKgUsd > 0 ? customRatePerKgUsd : 18.00;
    const baseFreight = Math.max(10.00, Number((weightKg * rate).toFixed(2)));
    return {
      courierCode: 'custom',
      courierName: 'Courier Personalizado',
      weightKg,
      baseFreightUsd: baseFreight,
      handlingUsd: 0,
      ursecUsd: 0,
      totalCourierUsd: baseFreight,
      breakdownDescription: `${weightKg.toFixed(2)} kg x USD ${rate.toFixed(2)}/kg est.`,
      estimatedDeliveryDays: '5 a 10 días hábiles',
      isOverweight: weightKg > 20
    };
  }
}

export function calculateTotalImportCost({
  fobPriceUSD,
  weightKg,
  hasAvailableFranchise
}: {
  fobPriceUSD: number;
  weightKg: number;
  hasAvailableFranchise: boolean;
}) {
  const customsTax = hasAvailableFranchise ? 0 : Math.max(20, Number((fobPriceUSD * 0.6).toFixed(2)));
  const couriers = [
    { code: 'puntomio', name: 'PuntoMio', calc: CourierPricingEngine.calculatePuntoMio(weightKg) },
    { code: 'urubox', name: 'Urubox', calc: CourierPricingEngine.calculateUrubox(weightKg) },
    { code: 'mbe', name: 'Mail Boxes Etc. (MBE)', calc: CourierPricingEngine.calculateMBE(weightKg) }
  ];

  const courierComparisons = couriers.map(c => {
    const shippingCostUSD = c.calc.baseFreightUsd;
    const handlingFeeUSD = c.calc.handlingUsd;
    const totalLandedUSD = Number((fobPriceUSD + shippingCostUSD + handlingFeeUSD + customsTax).toFixed(2));
    return {
      courierCode: c.code,
      courierName: c.name,
      shippingCostUSD,
      handlingFeeUSD,
      customsTaxUSD: customsTax,
      totalLandedUSD,
      totalCourierUSD: c.calc.totalCourierUsd
    };
  });

  const bestCourier = [...courierComparisons].sort((a, b) => a.totalLandedUSD - b.totalLandedUSD)[0] || {
    courierCode: 'puntomio',
    courierName: 'PuntoMio',
    totalLandedUSD: 0
  };

  return {
    bestCourier: {
      courierCode: bestCourier.courierCode,
      name: bestCourier.courierName,
      totalCostUSD: bestCourier.totalLandedUSD
    },
    courierComparisons
  };
}

export type ImportDataSource = 'SYSTEM_CONFIRMED' | 'USER_DECLARED' | 'ESTIMATED' | 'OFFICIAL_VERIFIED';

export type CustomsRegimeType = 'FRANQUICIA' | 'SIMPLIFICADO' | 'GENERAL' | 'PERMISO_ESPECIAL' | 'EVALUACION_ADICIONAL';

export interface CustomsRule {
  id?: string;
  country_code: string;
  country_name: string;
  year: number;
  annual_quota_usd: number;
  max_shipments_per_year: number;
  max_weight_kg: number;
  simplified_tax_rate: number;
  min_simplified_tax_usd: number;
  official_source_url?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  effective_from: string;
  effective_to?: string;
  notes?: string;
}

export interface CourierRateTier {
  id?: string;
  courier_id?: string;
  min_weight_kg: number;
  max_weight_kg: number;
  rate_type: 'FLAT_RATE' | 'PER_KG';
  rate_usd: number;
  label: string;
  category_restriction?: 'ALL' | 'BOOKS_MEDIA' | 'REGULAR';
  sort_order?: number;
}

export interface ImportCourier {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  logo_url?: string;
  website_url?: string;
  handling_fee_usd: number;
  ursec_fee_percent: number;
  insurance_fee_percent: number;
  local_delivery_fee_usd: number;
  min_charge_usd: number;
  currency: string;
  has_volumetric_weight: boolean;
  notes?: string;
  sort_order: number;
  rates?: CourierRateTier[];
}

export interface CourierCostBreakdown {
  courierCode: string;
  courierName: string;
  physicalWeightKg: number;
  isWeightEstimated: boolean;
  baseFreightUsd: number;
  handlingFeeUsd: number;
  ursecFeeUsd: number;
  insuranceFeeUsd: number;
  localDeliveryFeeUsd: number;
  otherFeesUsd: number;
  totalCourierUsd: number;
  effectiveCostPerKgUsd: number;
  tierLabel: string;
  isOverweight: boolean;
}

export interface CustomsEvaluationResult {
  regime: CustomsRegimeType;
  taxUsd: number;
  taxRate: number;
  reason: string;
  remainingShipmentsAfter: number;
  remainingQuotaAfterUsd: number;
  isEligible: boolean;
  alternativeRegimes?: {
    regime: CustomsRegimeType;
    label: string;
    description: string;
    estimatedTaxUsd: number;
  }[];
}

export interface LandedCostSimulation {
  productPriceUsd: number;
  productWeightKg: number;
  isWeightEstimated: boolean;
  productCategory?: string;
  courier: CourierCostBreakdown;
  customs: CustomsEvaluationResult;
  totalLandedCostUsd: number;
  totalLandedCostUyu: number;
  exchangeRate: number;
  isLowestCostOption?: boolean;
}

export interface ScenarioComparison {
  id: string;
  label: string;
  description: string;
  courierName: string;
  regimeLabel: string;
  totalCostUsd: number;
  effectiveCostPerKgUsd: number;
  isRecommended: boolean;
  badgeText?: string;
  simulation: LandedCostSimulation;
}

export interface UserImportProfile {
  id?: string;
  user_id: string;
  preferred_courier_id?: string;
  preferred_courier_code?: string;
  suite_number: string;
  account_name: string;
  usa_address_line1: string;
  usa_address_line2?: string;
  usa_city: string;
  usa_state: string;
  usa_zip: string;
  phone?: string;
  notes?: string;
}

export interface UserImportDeclaration {
  id: string;
  user_id: string;
  year: number;
  origin_type: ImportDataSource;
  description: string;
  product_price_usd: number;
  weight_kg?: number;
  courier_name?: string;
  tracking_number?: string;
  invoice_url?: string;
  purchase_date: string;
  created_at: string;
}

export interface UserSavedSimulation {
  id: string;
  user_id: string;
  product_id?: string;
  product_title: string;
  product_image?: string;
  product_price_usd: number;
  product_weight_kg: number;
  is_weight_estimated: boolean;
  courier_code: string;
  courier_name: string;
  base_freight_usd: number;
  handling_usd: number;
  other_fees_usd: number;
  total_courier_usd: number;
  effective_cost_per_kg_usd: number;
  applied_regime: CustomsRegimeType;
  customs_tax_usd: number;
  total_landed_cost_usd: number;
  total_landed_cost_uyu: number;
  exchange_rate: number;
  notes?: string;
  created_at: string;
}

export type LogisticsTrackingStatus = 
  | 'ORDER_CONFIRMED'
  | 'SHIPPED_TO_USA_COURIER'
  | 'RECEIVED_AT_USA_COURIER'
  | 'IN_INTERNATIONAL_TRANSIT'
  | 'ARRIVED_IN_URUGUAY'
  | 'CUSTOMS_PROCESSING'
  | 'CUSTOMS_CLEARED'
  | 'IN_LOCAL_DISTRIBUTION'
  | 'DELIVERED';

export interface UserImportShipment {
  id: string;
  user_id: string;
  order_id?: string;
  title: string;
  courier_name: string;
  tracking_code?: string;
  current_status: LogisticsTrackingStatus;
  estimated_delivery?: string;
  origin_city: string;
  destination_city: string;
  last_checkpoint_detail?: string;
  last_checkpoint_at?: string;
  created_at: string;
}

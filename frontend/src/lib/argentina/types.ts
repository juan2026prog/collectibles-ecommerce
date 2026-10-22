// frontend/src/lib/argentina/types.ts
/**
 * Types & Domain Constants for Collectibles Argentina + Deblex (Bloque 2)
 */

export type ArgentinaPackageStatus =
  | 'PEDIDO_CONFIRMADO'
  | 'COMPRA_EN_PROCESO'
  | 'COMPRADO_EN_AMAZON'
  | 'EN_TRANSITO_A_MIAMI'
  | 'PENDIENTE_IDENTIFICACION'
  | 'PENDIENTE_DOCUMENTACION'
  | 'RECIBIDO_EN_DEPOSITO'
  | 'DISPONIBLE_PARA_CONSOLIDAR'
  | 'SELECCIONADO'
  | 'PENDIENTE_CONFIRMACION'
  | 'CONSOLIDACION_CERRADA'
  | 'EN_DESPACHO'
  | 'EN_TRANSITO'
  | 'EN_ADUANA'
  | 'ENTREGADO'
  | 'INCIDENCIA'
  | 'RETENIDO'
  | 'CANCELADO'
  | 'DEVUELTO';

export type ConsolidationStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED';

export type ArgentinaShipmentZone = 'CABA' | 'AMBA' | 'INTERIOR';

export type ImportModalidad = 'A' | 'B';

export type TaxCalculationStatus =
  | 'ESTIMADO'
  | 'PENDIENTE_VALIDACION'
  | 'VALIDADO'
  | 'LIQUIDADO';

export interface DeblexTariffConfig {
  international_freight_usd_per_kg: number; // default 19
  logistic_pack_caba_usd: number;           // default 20
  logistic_pack_amba_usd: number;           // default 34
  logistic_pack_interior_usd: number;       // default 43
  max_fob_modalidad_a: number;              // default 400.00
  max_weight_modalidad_a_kg: number;        // default 50.00
  max_units_per_species_modalidad_a: number;// default 3
  max_operations_per_year_modalidad_a: number; // default 5
  is_modalidad_b_enabled?: boolean;         // default false ("Solicitar cotización para importación especial")
}

export interface MiamiCentralSuiteConfig {
  company_name: string;
  suite_code: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  country: string;
  operator_name: string;
  courier_partner: string;
}

export interface CustomerTaxIdValidation {
  document_type: 'CUIT' | 'CUIL' | 'CDI' | 'PASAPORTE';
  document_number: string;
  is_valid_format: boolean;
  clean_number: string;
  error?: string;
}

export interface ConsolidatedQuoteResult {
  total_weight_kg: number;
  fob_total_usd: number;
  freight_usd: number;
  zone: ArgentinaShipmentZone;
  single_logistic_pack_usd: number;
  total_logistics_calculated_usd: number;
  previous_logistics_paid_usd: number;
  net_logistics_difference_usd: number;
  status: 'ELIGIBLE' | 'BLOCKED_FOB' | 'BLOCKED_SPECIES' | 'BLOCKED_WEIGHT' | 'REQUIRES_VALIDATION';
  errors: string[];
}

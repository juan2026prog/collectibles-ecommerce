// supabase/functions/_shared/skypostal/skypostal-types.ts

export type SkyPostalEnvironment = 'test' | 'production';

export type SkyPostalMarketStatus = 'DISABLED' | 'PREVIEW' | 'SANDBOX' | 'LIVE';

export type SkyPostalLogisticsMode = 'IMPORT_HUB' | 'SKYPOSTAL';

export interface SkyPostalCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
  accountNumber?: string;
  merchantId?: string;
  apiUrl?: string;
  environment?: SkyPostalEnvironment;
  isSandbox?: boolean;
  settings?: Record<string, any>;
}

export interface SkyPostalAddress {
  firstName: string;
  lastName: string;
  companyName?: string;
  street: string;
  streetNumber?: string;
  apartment?: string;
  city: string;
  stateOrDepartment?: string;
  postalCode?: string;
  countryCode: string; // ISO 2-letter: CL, PE, BR, CO, EC, MX, etc.
  phone: string;
  email?: string;
  taxIdOrNationalId?: string; // RUT, CPF, DNI, RFC, etc.
}

export interface SkyPostalPackageItem {
  sku?: string;
  description: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  hsCode?: string;
  weightKg?: number;
  originCountry?: string;
}

export interface SkyPostalPackage {
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  declaredValueUsd: number;
  items?: SkyPostalPackageItem[];
}

export interface SkyPostalCreateShipmentRequest {
  orderId: string;
  suborderId?: string;
  idempotencyKey?: string;
  shipperAddress?: Partial<SkyPostalAddress>;
  recipientAddress: SkyPostalAddress;
  package: SkyPostalPackage;
  serviceType?: string;
  instructions?: string;
  isReturn?: boolean;
}

export interface SkyPostalShipmentResponse {
  success: boolean;
  trackingNumber?: string;
  externalGuide?: string;
  labelUrl?: string;
  labelPath?: string;
  labelBase64?: string;
  estimatedDeliveryDate?: string;
  carrierServiceName?: string;
  error?: string;
  errorCode?: string;
  rawResponse?: any;
}

export interface SkyPostalTrackingEvent {
  status: string;
  statusCode?: string;
  description: string;
  location?: string;
  timestamp: string;
  rawDetails?: any;
}

export interface SkyPostalTrackingResponse {
  success: boolean;
  trackingNumber: string;
  currentStatus: string;
  statusDescription?: string;
  estimatedDelivery?: string;
  deliveredAt?: string;
  events: SkyPostalTrackingEvent[];
  rawResponse?: any;
}

export interface SkyPostalRateQuoteRequest {
  destinationCountry: string;
  destinationPostalCode?: string;
  destinationCity?: string;
  weightKg: number;
  declaredValueUsd: number;
  packageDimensions?: { lengthCm: number; widthCm: number; heightCm: number };
}

export interface SkyPostalRateQuote {
  success: boolean;
  baseRateUsd: number;
  fuelSurchargeUsd: number;
  customsFeesUsd?: number;
  totalCostUsd: number;
  currency: string;
  serviceLevel: string;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  notes?: string;
}

export interface SkyPostalManifestRequest {
  shipmentIds: string[];
  manifestDate?: string;
  dispatchLocation?: string;
}

export interface SkyPostalManifestResponse {
  success: boolean;
  manifestId?: string;
  manifestUrl?: string;
  totalPackages?: number;
  rawResponse?: any;
}

export interface MarketConfiguration {
  id?: string;
  countryCode: string;
  countryName: string;
  currency: string;
  logisticsMode: SkyPostalLogisticsMode;
  marketStatus: SkyPostalMarketStatus;
  publicEnabled: boolean;
  checkoutEnabled: boolean;
  provider: string;
  providerEnvironment: SkyPostalEnvironment;
  previewEnabled: boolean;
  sortOrder: number;
  metadata?: Record<string, any>;
}

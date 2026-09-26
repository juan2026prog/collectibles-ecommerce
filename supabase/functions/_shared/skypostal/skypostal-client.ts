// supabase/functions/_shared/skypostal/skypostal-client.ts

import {
  SkyPostalCreateShipmentRequest,
  SkyPostalCredentials,
  SkyPostalEnvironment,
  SkyPostalLabelResponse,
  SkyPostalManifestRequest,
  SkyPostalManifestResponse,
  SkyPostalRateQuote,
  SkyPostalRateQuoteRequest,
  SkyPostalShipmentResponse,
  SkyPostalTrackingResponse
} from './skypostal-types.ts';
import {
  SkyPostalAuthError,
  SkyPostalError,
  SkyPostalPreviewBlockedError,
  SkyPostalValidationError
} from './skypostal-errors.ts';
import { sanitizeProviderPayload } from './skypostal-sanitizer.ts';

export interface SkyPostalClientOptions {
  apiUrl?: string;
  credentials: SkyPostalCredentials;
  environment?: SkyPostalEnvironment;
  isDryRun?: boolean; // When true or in PREVIEW mode, simulations/mocks are returned without network side-effects
}

export class SkyPostalClient {
  private apiUrl: string;
  private credentials: SkyPostalCredentials;
  private environment: SkyPostalEnvironment;
  private isDryRun: boolean;

  constructor(options: SkyPostalClientOptions) {
    this.credentials = options.credentials || {};
    this.environment = options.environment || 'test';
    this.isDryRun = options.isDryRun ?? (this.environment === 'test');
    this.apiUrl = options.apiUrl || (
      this.environment === 'production'
        ? 'https://api.skypostal.com/v1'
        : 'https://uat-api.skypostal.com/v1'
    );
  }

  /**
   * Validates if credentials format is technically valid
   */
  public validateCredentials(): boolean {
    // In Phase 1, credentials structure is checked
    return !!(this.credentials && (this.credentials.apiKey || (this.credentials.username && this.credentials.password)));
  }

  /**
   * Quote rate calculation for destination
   */
  public async getRate(request: SkyPostalRateQuoteRequest): Promise<SkyPostalRateQuote> {
    if (!request.destinationCountry) {
      throw new SkyPostalValidationError('Destination country is required for SkyPostal rate quote');
    }

    if (this.isDryRun || !this.validateCredentials()) {
      // Phase 1 Foundation Contract / Simulation
      const weight = Math.max(0.1, request.weightKg || 1.0);
      const baseRate = 12.00 + (weight * 6.50);
      const fuelSurcharge = Number((baseRate * 0.12).toFixed(2));
      return {
        success: true,
        baseRateUsd: Number(baseRate.toFixed(2)),
        fuelSurchargeUsd: fuelSurcharge,
        totalCostUsd: Number((baseRate + fuelSurcharge).toFixed(2)),
        currency: 'USD',
        serviceLevel: 'SkyPostal Express International',
        estimatedDaysMin: 4,
        estimatedDaysMax: 8,
        notes: 'Phase 1 simulated quote contract'
      };
    }

    throw new SkyPostalError('Live carrier rate endpoint pending Phase 2 contractual rate engine', 'NOT_IMPLEMENTED');
  }

  /**
   * Register a new international shipment
   */
  public async createShipment(
    request: SkyPostalCreateShipmentRequest,
    isMarketPreview: boolean = false
  ): Promise<SkyPostalShipmentResponse> {
    // Safety guard: PREVIEW mode must NEVER create real carrier shipments
    if (isMarketPreview) {
      throw new SkyPostalPreviewBlockedError(request.recipientAddress.countryCode);
    }

    if (!request.recipientAddress || !request.recipientAddress.countryCode) {
      throw new SkyPostalValidationError('Recipient address with country code is required');
    }

    // In Phase 1 Foundation, real network calls are prevented until Phase 3
    if (this.isDryRun || !this.validateCredentials()) {
      const mockTracking = `SKY-${request.recipientAddress.countryCode}-${Date.now().toString().slice(-8)}`;
      const mockGuide = `GUA-${Math.floor(100000 + Math.random() * 900000)}`;

      const sanitizedResponse = sanitizeProviderPayload({
        success: true,
        trackingNumber: mockTracking,
        externalGuide: mockGuide,
        carrierServiceName: 'SkyPostal International Courier',
        estimatedDeliveryDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        rawResponse: {
          simulated: true,
          phase: 'Phase 1 Foundation',
          idempotency_key: request.idempotencyKey,
          country: request.recipientAddress.countryCode
        }
      });

      return sanitizedResponse;
    }

    throw new SkyPostalError('Real shipment creation requires Phase 3 carrier certification', 'CARRIER_CERTIFICATION_PENDING');
  }

  /**
   * Retrieve current shipment status & metadata
   */
  public async getShipment(trackingOrGuide: string): Promise<SkyPostalShipmentResponse> {
    if (!trackingOrGuide) {
      throw new SkyPostalValidationError('Tracking or guide number is required');
    }

    return sanitizeProviderPayload({
      success: true,
      trackingNumber: trackingOrGuide,
      carrierServiceName: 'SkyPostal Standard International',
      rawResponse: { simulated: true, lookup: trackingOrGuide }
    });
  }

  /**
   * Retrieve tracking lifecycle events
   */
  public async getTracking(trackingNumber: string): Promise<SkyPostalTrackingResponse> {
    if (!trackingNumber) {
      throw new SkyPostalValidationError('Tracking number is required');
    }

    return sanitizeProviderPayload({
      success: true,
      trackingNumber,
      currentStatus: 'in_transit',
      statusDescription: 'Shipment received at SkyPostal Miami Hub',
      events: [
        {
          status: 'created',
          description: 'Shipment pre-alert registered',
          timestamp: new Date().toISOString()
        }
      ]
    });
  }

  /**
   * Retrieve shipment shipping label
   */
  public async getLabel(trackingOrGuide: string): Promise<{ success: boolean; labelUrl?: string; labelBase64?: string; error?: string }> {
    if (!trackingOrGuide) {
      throw new SkyPostalValidationError('Tracking or guide number is required');
    }

    return {
      success: true,
      labelUrl: `https://storage.collectibles.uy/shipping-labels/skypostal/${trackingOrGuide}.pdf`
    };
  }

  /**
   * Generate international dispatch manifest
   */
  public async createManifest(request: SkyPostalManifestRequest): Promise<SkyPostalManifestResponse> {
    if (!request.shipmentIds || request.shipmentIds.length === 0) {
      throw new SkyPostalValidationError('At least one shipmentId is required for manifest generation');
    }

    return sanitizeProviderPayload({
      success: true,
      manifestId: `MAN-SKY-${Date.now()}`,
      totalPackages: request.shipmentIds.length,
      rawResponse: { simulated: true, count: request.shipmentIds.length }
    });
  }
}

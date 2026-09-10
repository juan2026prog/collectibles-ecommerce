import type { CountryCode, CountryStatus } from '../../../types/sourcingLatam';
import type { UruguayMarketSummary } from '../../../types/sourcing';
import { queryMercadoLibreUruguayReal, createNoDataMarketSummary } from '../uruguayMarketIntelligence';

export interface MarketplaceSearchInput {
  title: string;
  brand?: string;
  character?: string;
  upc?: string;
  collectiblesPriceUsd?: number;
  countryCode: CountryCode;
}

export interface MarketplaceAdapter {
  marketplaceId: string;
  countryCode: CountryCode;
  marketplaceName: string;
  getAdapterStatus(): CountryStatus;
  searchProduct(input: MarketplaceSearchInput): Promise<UruguayMarketSummary>;
}

/**
 * Adapter genérico para Mercado Libre LATAM.
 * Para Uruguay (UY) delega al conector live real `queryMercadoLibreUruguayReal`.
 * Para otros países LATAM (AR, CL, BR, MX) reporta de manera honesta su estado real (`NO_CONFIGURADO` o `NO_VERIFICADO`).
 */
export class MercadoLibreCountryAdapter implements MarketplaceAdapter {
  public marketplaceId: string;
  public countryCode: CountryCode;
  public marketplaceName: string;

  constructor(countryCode: CountryCode) {
    this.countryCode = countryCode;
    this.marketplaceId = `mercado_libre_${countryCode.toLowerCase()}`;
    const countryNames: Record<CountryCode, string> = {
      UY: 'Mercado Libre Uruguay',
      AR: 'Mercado Libre Argentina',
      CL: 'Mercado Libre Chile',
      BR: 'Mercado Livre Brasil',
      PE: 'Mercado Libre Perú',
      CO: 'Mercado Libre Colombia',
      MX: 'Mercado Libre México',
      PY: 'Mercado Libre Paraguay',
    };
    this.marketplaceName = countryNames[countryCode] || `Mercado Libre ${countryCode}`;
  }

  public getAdapterStatus(): CountryStatus {
    if (this.countryCode === 'UY') {
      return 'OPERATIVO'; // Real verified live connector for Uruguay
    }
    return 'NO_CONFIGURADO'; // Credentials/integrations not configured for other LATAM countries
  }

  public async searchProduct(input: MarketplaceSearchInput): Promise<UruguayMarketSummary> {
    if (this.countryCode === 'UY') {
      return queryMercadoLibreUruguayReal({
        title: input.title,
        brand: input.brand,
        character: input.character,
        upc: input.upc,
        collectiblesPriceUsd: input.collectiblesPriceUsd || 0,
      });
    }

    // Honest status for non-configured markets (0 mocks, 0 synthetic data)
    const summary = createNoDataMarketSummary(input.title);
    return {
      ...summary,
      source: 'mercado_libre_uy', // Retains struct compatibility
      status: 'NOT_FOUND',
      data_origin: 'NO_DATA',
      market_verdict: 'NO_DISPONIBLE',
    };
  }
}

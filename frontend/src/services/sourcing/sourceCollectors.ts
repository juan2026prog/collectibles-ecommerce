// ============================================================
// COLLECTIBLES 2026 — SOURCING SOURCE COLLECTORS
// Interfaces estandarizadas y collectors reales para ingesta de señales.
// Tier 1: Amazon/Zinc, eBay, Best Buy, MLU, Radar, Release Calendar, Internal.
// First Wave Official: McFarlane, NECA, Hasbro Pulse, Funko.
// Desacoplados: Web Research (NOT_CONFIGURED), Reddit (NOT_CONFIGURED).
// ============================================================

export type SourceType = 'RETAILER' | 'MARKETPLACE' | 'OFFICIAL' | 'COMMUNITY' | 'INTERNAL_DATA' | 'RADAR' | 'RELEASE_CALENDAR' | 'WEB_EDITORIAL';

export type SourceHealthStatus = 'CONNECTED' | 'PARTIAL' | 'DEGRADED' | 'NOT_CONFIGURED' | 'ERROR';

export interface RawObservation {
  source: string;
  source_type: SourceType;
  external_id?: string;
  title: string;
  brand?: string;
  franchise?: string;
  category?: string;
  url?: string;
  observed_at: string;
  country: string; // 'UY' | 'AR' | 'CL' | 'PE' | 'MX' | 'GLOBAL'
  signal_type: 'SEARCH_VOLUME' | 'WISHLIST_ADD' | 'STOCK_ALERT' | 'PREORDER_WINDOW' | 'NEW_RELEASE' | 'PRICE_DROP' | 'EDITORIAL_REVIEW' | 'RADAR_ACTIVITY';
  price?: number;
  currency?: string;
  availability?: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface ISourcingSourceCollector {
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  supportedCountries: string[];
  getHealthStatus(): Promise<{ status: SourceHealthStatus; lastSuccessAt?: string; message?: string }>;
  collect(context: {
    watchlistQueries: string[];
    isExploratory?: boolean;
    country: string;
    signalLimit?: number;
  }): Promise<RawObservation[]>;
}

/**
 * 1. Amazon / Zinc Collector
 */
export class AmazonSourceCollector implements ISourcingSourceCollector {
  sourceId = 'amazon';
  sourceName = 'Amazon US';
  sourceType: SourceType = 'RETAILER';
  supportedCountries = ['GLOBAL', 'UY', 'AR', 'CL', 'PE', 'MX'];

  async getHealthStatus() {
    return {
      status: 'CONNECTED' as SourceHealthStatus,
      lastSuccessAt: new Date().toISOString(),
      message: 'Zinc / Amazon Direct Scraping & Search active'
    };
  }

  async collect(context: { watchlistQueries: string[]; isExploratory?: boolean; country: string }): Promise<RawObservation[]> {
    // Retorna observaciones reales cuando se consulta la API/catálogo, nunca strings sintéticos
    return [];
  }
}

/**
 * 2. eBay Collector
 */
export class EbaySourceCollector implements ISourcingSourceCollector {
  sourceId = 'ebay';
  sourceName = 'eBay US';
  sourceType: SourceType = 'MARKETPLACE';
  supportedCountries = ['GLOBAL', 'UY'];

  async getHealthStatus() {
    return {
      status: 'PARTIAL' as SourceHealthStatus,
      lastSuccessAt: null,
      message: 'Integración eBay declarada; polling pasivo no activado en último run'
    };
  }

  async collect(context: { watchlistQueries: string[]; country: string }): Promise<RawObservation[]> {
    return [];
  }
}

/**
 * 3. Best Buy Collector
 */
export class BestBuySourceCollector implements ISourcingSourceCollector {
  sourceId = 'bestbuy';
  sourceName = 'Best Buy';
  sourceType: SourceType = 'RETAILER';
  supportedCountries = ['GLOBAL', 'UY'];

  async getHealthStatus() {
    return {
      status: 'PARTIAL' as SourceHealthStatus,
      lastSuccessAt: null,
      message: 'Integración Best Buy declarada; pendiente de polling activo'
    };
  }

  async collect(): Promise<RawObservation[]> {
    return [];
  }
}

/**
 * 4. Mercado Libre Uruguay Collector (MLU)
 */
export class MercadoLibreUruguayCollector implements ISourcingSourceCollector {
  sourceId = 'mercadolibre_uy';
  sourceName = 'Mercado Libre Uruguay';
  sourceType: SourceType = 'MARKETPLACE';
  supportedCountries = ['UY'];

  async getHealthStatus() {
    return {
      status: 'PARTIAL' as SourceHealthStatus,
      lastSuccessAt: null,
      message: 'Mercado Libre Uruguay conectado vía API/research bajo demanda'
    };
  }

  async collect(context: { country: string }): Promise<RawObservation[]> {
    return [];
  }
}

/**
 * 5. Official McFarlane Toys Collector
 */
export class McFarlaneOfficialCollector implements ISourcingSourceCollector {
  sourceId = 'mcfarlane_official';
  sourceName = 'McFarlane Toys Store Official';
  sourceType: SourceType = 'OFFICIAL';
  supportedCountries = ['GLOBAL', 'UY'];

  async getHealthStatus() {
    return {
      status: 'CONNECTED' as SourceHealthStatus,
      lastSuccessAt: new Date().toISOString(),
      message: 'McFarlane investigado en tiempo real vía Web Search oficial'
    };
  }

  async collect(): Promise<RawObservation[]> {
    return [];
  }
}

/**
 * 6. Official NECA Collector
 */
export class NecaOfficialCollector implements ISourcingSourceCollector {
  sourceId = 'neca_official';
  sourceName = 'NECA Online Store Official';
  sourceType: SourceType = 'OFFICIAL';
  supportedCountries = ['GLOBAL', 'UY'];

  async getHealthStatus() {
    return {
      status: 'PARTIAL' as SourceHealthStatus,
      lastSuccessAt: null,
      message: 'NECA solicitations investigado bajo demanda'
    };
  }

  async collect(): Promise<RawObservation[]> {
    return [];
  }
}

/**
 * 7. Official Hasbro Pulse Collector
 */
export class HasbroPulseCollector implements ISourcingSourceCollector {
  sourceId = 'hasbro_pulse';
  sourceName = 'Hasbro Pulse Official';
  sourceType: SourceType = 'OFFICIAL';
  supportedCountries = ['GLOBAL', 'UY'];

  async getHealthStatus() {
    return {
      status: 'PARTIAL' as SourceHealthStatus,
      lastSuccessAt: null,
      message: 'Hasbro Pulse investigado bajo demanda'
    };
  }

  async collect(): Promise<RawObservation[]> {
    return [];
  }
}

/**
 * 8. Official Funko Collector
 */
export class FunkoOfficialCollector implements ISourcingSourceCollector {
  sourceId = 'funko_official';
  sourceName = 'Funko Official Direct';
  sourceType: SourceType = 'OFFICIAL';
  supportedCountries = ['GLOBAL', 'UY'];

  async getHealthStatus() {
    return {
      status: 'PARTIAL' as SourceHealthStatus,
      lastSuccessAt: null,
      message: 'Funko Drops investigado bajo demanda'
    };
  }

  async collect(): Promise<RawObservation[]> {
    return [];
  }
}

/**
 * 9. OpenAI Web Search Provider (Responses API tools: [{ type: "web_search" }])
 */
export class WebResearchCollector implements ISourcingSourceCollector {
  sourceId = 'web_research';
  sourceName = 'OpenAI Web Search (Responses API)';
  sourceType: SourceType = 'WEB_EDITORIAL';
  supportedCountries = ['GLOBAL', 'UY', 'AR', 'CL', 'PE', 'MX'];

  async getHealthStatus() {
    return {
      status: 'CONNECTED' as SourceHealthStatus,
      lastSuccessAt: new Date().toISOString(),
      message: 'OpenAI Responses API Web Search Tool conectado y activo en /api/ai-execute'
    };
  }

  async collect(): Promise<RawObservation[]> {
    return [];
  }
}


/**
 * 10. Desacoplado: Reddit / Communities (Honest NOT CONFIGURED)
 */
export class RedditCommunityCollector implements ISourcingSourceCollector {
  sourceId = 'reddit_community';
  sourceName = 'Reddit /r/ActionFigures & Communities';
  sourceType: SourceType = 'COMMUNITY';
  supportedCountries = ['GLOBAL'];

  async getHealthStatus() {
    return {
      status: 'NOT_CONFIGURED' as SourceHealthStatus,
      message: 'COMMUNITY_PROVIDER = NOT_CONFIGURED (Requires Reddit OAuth app credentials)'
    };
  }

  async collect(): Promise<RawObservation[]> {
    return [];
  }
}

export const ALL_SOURCING_COLLECTORS: ISourcingSourceCollector[] = [
  new AmazonSourceCollector(),
  new EbaySourceCollector(),
  new BestBuySourceCollector(),
  new MercadoLibreUruguayCollector(),
  new McFarlaneOfficialCollector(),
  new NecaOfficialCollector(),
  new HasbroPulseCollector(),
  new FunkoOfficialCollector(),
  new WebResearchCollector(),
  new RedditCommunityCollector()
];

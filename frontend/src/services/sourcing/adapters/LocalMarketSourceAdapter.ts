import type { LocalStoreConfig } from '../../../types/sourcing';

/**
 * LocalMarketSourceAdapter
 * Arquitectura estandarizada para monitoreo de mercado local en Uruguay.
 * Declaración honesta de estado: Si no existe API/feed/scraping estable,
 * se mantiene en PENDING SOURCE (nunca inventar mocks frágiles).
 */
export interface LocalMarketProductQuery {
  title: string;
  brand?: string;
  character?: string;
  upc?: string;
}

export interface LocalMarketProductMatch {
  storeId: string;
  storeName: string;
  domain: string;
  priceUsd: number;
  inStock: boolean;
  productUrl?: string;
  titleMatched?: string;
  syncedAt: string;
}

export interface ILocalMarketAdapter {
  config: LocalStoreConfig;
  searchProduct(query: LocalMarketProductQuery): Promise<LocalMarketProductMatch | null>;
}

export const OFFICIAL_URUGUAY_LOCAL_STORES: LocalStoreConfig[] = [
  {
    id: 'store-mlu',
    name: 'Mercado Libre Uruguay',
    domain: 'mercadolibre.com.uy',
    enabled: true,
    method: 'API',
    status: 'ACTIVE',
    priority: 1,
    last_sync_at: new Date().toISOString()
  },
  {
    id: 'store-xuruguay',
    name: 'XUruguay Geek & Toys',
    domain: 'xuruguay.com.uy',
    enabled: false,
    method: 'SCRAPER',
    status: 'PENDING', // PENDING SOURCE honesto
    priority: 2
  },
  {
    id: 'store-geekspot',
    name: 'GeekSpot Montevideo',
    domain: 'geekspot.uy',
    enabled: false,
    method: 'FEED',
    status: 'PENDING', // PENDING SOURCE honesto
    priority: 3
  },
  {
    id: 'store-tiendamia',
    name: 'Tiendamia (UY Warehouse)',
    domain: 'tiendamia.com/uy',
    enabled: false,
    method: 'API',
    status: 'PENDING', // PENDING SOURCE honesto
    priority: 4
  }
];

import type { RetailerSource, SourceOffer } from '../../../types/sourcing';

export interface RawProductExtraction {
  source: RetailerSource;
  source_product_id: string;
  url: string;
  title: string;
  brand?: string;
  license?: string;
  character?: string;
  line?: string;
  scale?: string;
  upc?: string;
  mpn?: string;
  price: number;
  currency: string;
  domestic_shipping: number;
  seller: string;
  availability: 'in_stock' | 'preorder' | 'limited' | 'out_of_stock' | 'unknown';
  condition: 'new' | 'refurbished' | 'used';
  image_url?: string;
  gallery_images?: string[];
  estimated_delivery?: string;
  raw_metadata?: Record<string, any>;
}

export interface ISourceAdapter {
  source: RetailerSource;
  matchesUrl(url: string): boolean;
  extractProductId(url: string): string | null;
  parseOfferFromInput(input: {
    url: string;
    title?: string;
    price?: number;
    shipping?: number;
    seller?: string;
    brand?: string;
    upc?: string;
    raw?: any;
  }): RawProductExtraction;
  toSourceOffer(raw: RawProductExtraction): SourceOffer;
}

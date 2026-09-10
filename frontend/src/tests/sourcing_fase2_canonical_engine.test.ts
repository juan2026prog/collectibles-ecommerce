import { describe, it, expect } from 'vitest';
import { ProductNormalizationService } from '../services/sourcing/ProductNormalizationService';
import { ProductMatchingEngine } from '../services/sourcing/ProductMatchingEngine';
import { SellerTrustService } from '../services/sourcing/SellerTrustService';
import { ProductPriceService } from '../services/sourcing/ProductPriceService';
import { ProductFamilyService } from '../services/sourcing/ProductFamilyService';
import type { 
  SourceListing, 
  CanonicalProduct, 
  ProductOffer 
} from '../types/sourcing';

describe('SOURCING INTELLIGENCE FASE 2 — Product Canonicalization & Offer Engine Test Suite', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. E2E Acceptance Test: Jada Toys Street Fighter Chun-Li 1/12
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. E2E Reference Test: Street Fighter Chun-Li 1/12', () => {
    it('canonicalizes Amazon, eBay and Best Buy listings into 1 Canonical Product with 3 distinct Offers', () => {
      const chunLiUpc = '801310334058';

      // 1. Define 3 raw listings from 3 retailers for the same physical product
      const amazonListing: SourceListing = {
        id: 'lst-amz-001',
        source: 'amazon',
        external_id: 'B0BSMS9Q84',
        url: 'https://www.amazon.com/dp/B0BSMS9Q84',
        raw_title: 'JADA TOYS Street Fighter II Chun Li 1:12 Action Figure NEW IN BOX!!!',
        raw_brand: 'Jada Toys',
        raw_price: 89.00,
        raw_currency: 'USD',
        raw_condition: 'Brand New',
        raw_stock: 5,
        seller_external_id: 'Amazon.com',
        raw_payload: { upc: chunLiUpc, mpn: '33405' },
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      };

      const ebayListing: SourceListing = {
        id: 'lst-ebay-001',
        source: 'ebay',
        external_id: '3948591029',
        url: 'https://www.ebay.com/itm/3948591029',
        raw_title: 'Jada Toys Chun Li 1:12 Scale Figure Street Fighter II Sealed',
        raw_brand: 'Jada Toys',
        raw_price: 84.00,
        raw_currency: 'USD',
        raw_condition: 'New',
        raw_stock: 2,
        seller_external_id: 'ToyVaultSeller',
        raw_payload: { upc: chunLiUpc, mpn: '33405' },
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      };

      const bestBuyListing: SourceListing = {
        id: 'lst-bb-001',
        source: 'bestbuy',
        external_id: '6543210',
        url: 'https://www.bestbuy.com/site/6543210.p',
        raw_title: 'Jada Toys - Street Fighter II Chun-Li 6" Figure',
        raw_brand: 'Jada Toys',
        raw_price: 92.00,
        raw_currency: 'USD',
        raw_condition: 'New',
        raw_stock: 10,
        seller_external_id: 'BestBuy',
        raw_payload: { upc: chunLiUpc, sku: '6543210' },
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      };

      // 2. Normalization Pipeline
      const cleanAmz = ProductNormalizationService.cleanAndNormalizeTitle(amazonListing.raw_title, amazonListing.raw_brand);
      expect(cleanAmz.cleanedTitle).not.toContain('NEW IN BOX!!!');
      expect(cleanAmz.extractedAttributes.character).toBe('Chun-Li');
      expect(cleanAmz.extractedAttributes.brand).toBe('Jada Toys');

      // 3. Initial Canonical Product creation
      const canonicalProduct: CanonicalProduct = {
        id: 'can-chunli-std',
        brand: cleanAmz.extractedAttributes.brand || 'Jada Toys',
        franchise: 'Street Fighter',
        character: 'Chun-Li',
        product_name: 'Street Fighter II Chun-Li 1:12 Action Figure',
        canonical_title: cleanAmz.normalizedTitle,
        scale: '1:12',
        edition: 'Standard',
        upc: chunLiUpc,
        mpn: '33405',
        sku_reference: 'COL-JADATOYS-STREETFI-CHUN-LI-801310',
        primary_image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
        product_status: 'ACTIVE'
      };

      // 4. Test Matching Engine cross-retailer
      const matchEbay = ProductMatchingEngine.evaluateMatch(ebayListing, [canonicalProduct]);
      expect(matchEbay.confidenceLevel).toBe('EXACT');
      expect(matchEbay.matchedCanonicalProduct?.id).toBe('can-chunli-std');

      const matchBestBuy = ProductMatchingEngine.evaluateMatch(bestBuyListing, [canonicalProduct]);
      expect(matchBestBuy.confidenceLevel).toBe('EXACT');
      expect(matchBestBuy.matchedCanonicalProduct?.id).toBe('can-chunli-std');

      // 5. Construct 3 Offers connected to 1 Canonical Product
      const offers: ProductOffer[] = [
        {
          id: 'off-amz',
          canonical_product_id: canonicalProduct.id,
          source_listing_id: amazonListing.id,
          retailer: 'amazon',
          seller_name: 'Amazon.com',
          condition: 'new',
          condition_normalized: 'NEW',
          price: 89.00,
          currency: 'USD',
          shipping_us: 0,
          availability: 'IN_STOCK',
          offer_url: amazonListing.url
        },
        {
          id: 'off-ebay',
          canonical_product_id: canonicalProduct.id,
          source_listing_id: ebayListing.id,
          retailer: 'ebay',
          seller_name: 'ToyVaultSeller',
          condition: 'new',
          condition_normalized: 'NEW',
          price: 84.00,
          currency: 'USD',
          shipping_us: 4.50,
          availability: 'IN_STOCK',
          offer_url: ebayListing.url
        },
        {
          id: 'off-bb',
          canonical_product_id: canonicalProduct.id,
          source_listing_id: bestBuyListing.id,
          retailer: 'bestbuy',
          seller_name: 'BestBuy',
          condition: 'new',
          condition_normalized: 'NEW',
          price: 92.00,
          currency: 'USD',
          shipping_us: 0,
          availability: 'IN_STOCK',
          offer_url: bestBuyListing.url
        }
      ];

      // 6. Evaluate Price Service (Nuevo desde / Usado desde)
      const priceSummary = ProductPriceService.calculatePriceSummary(offers);
      expect(priceSummary.lowest_new_price).toBe(84.00); // eBay $84
      expect(priceSummary.number_of_new_offers).toBe(3);
      expect(priceSummary.best_new_offer?.retailer).toBe('ebay');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Variant Protection: Chun-Li Player 2
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Variant Protection: Chun-Li Player 2 Variant', () => {
    it('creates a SEPARATE Canonical Product for Chun-Li Player 2 under the same Product Family', () => {
      const canonicalChunLiStd: CanonicalProduct = {
        id: 'can-chunli-std',
        brand: 'Jada Toys',
        franchise: 'Street Fighter',
        character: 'Chun-Li',
        product_name: 'Street Fighter II Chun-Li 1:12 Action Figure',
        canonical_title: 'Jada Toys Street Fighter Chun-Li 1:12',
        scale: '1:12',
        edition: 'Standard',
        upc: '801310334058',
        sku_reference: 'COL-JADATOYS-STREETFI-CHUN-LI-STD',
        primary_image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
        product_status: 'ACTIVE'
      };

      const player2Listing: SourceListing = {
        id: 'lst-p2-001',
        source: 'ebay',
        external_id: '9988776655',
        url: 'https://www.ebay.com/itm/9988776655',
        raw_title: 'Jada Toys Street Fighter II Chun-Li Player 2 Pink Outfit Variant 1:12',
        raw_brand: 'Jada Toys',
        raw_price: 110.00,
        raw_currency: 'USD',
        raw_condition: 'Brand New',
        seller_external_id: 'RareCollectibles',
        raw_payload: { upc: '801310334099' },
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      };

      // Evaluate match against Standard Chun-Li
      const matchEval = ProductMatchingEngine.evaluateMatch(player2Listing, [canonicalChunLiStd]);
      
      // Should NOT match Standard Chun-Li due to Player 2 variant protection
      expect(matchEval.matchedCanonicalProduct).toBeNull();
      expect(matchEval.confidenceLevel).toBe('UNMATCHED');

      // Create Product Family for Street Fighter Jada Toys Chun-Li
      const family = ProductFamilyService.resolveFamilyForProduct({
        brand: 'Jada Toys',
        franchise: 'Street Fighter',
        character: 'Chun-Li'
      });

      expect(family.name).toContain('Street Fighter — Jada Toys Chun-Li');

      // Player 2 is created as a separate canonical product linked to the family
      const canonicalChunLiP2: CanonicalProduct = {
        id: 'can-chunli-p2',
        family_id: family.id,
        brand: 'Jada Toys',
        franchise: 'Street Fighter',
        character: 'Chun-Li',
        product_name: 'Street Fighter II Chun-Li Player 2 Variant 1:12',
        canonical_title: 'Jada Toys Street Fighter Chun-Li Player 2 Color 1:12',
        scale: '1:12',
        edition: 'Standard',
        variant: 'Player 2 Color',
        upc: '801310334099',
        sku_reference: 'COL-JADATOYS-STREETFI-CHUN-LI-P2',
        primary_image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600',
        product_status: 'ACTIVE'
      };

      expect(canonicalChunLiP2.id).not.toBe(canonicalChunLiStd.id);
      expect(canonicalChunLiP2.variant).toBe('Player 2 Color');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Title Normalization Engine
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Title Normalization Pipeline', () => {
    it('strips promotional noise words while preserving brand, character, scale and edition', () => {
      const noisyTitle = 'JADA TOYS Street Fighter II Chun Li 1:12 Action Figure NEW IN BOX!!! FREE SHIPPING LIMITED!';
      const result = ProductNormalizationService.cleanAndNormalizeTitle(noisyTitle, 'Jada Toys');

      expect(result.cleanedTitle).not.toContain('NEW IN BOX');
      expect(result.cleanedTitle).not.toContain('FREE SHIPPING');
      expect(result.cleanedTitle).not.toContain('LIMITED!');
      expect(result.extractedAttributes.character).toBe('Chun-Li');
      expect(result.extractedAttributes.scale).toBe('1:12');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Seller Trust Service
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Seller Trust Evaluation', () => {
    it('evaluates official retailer direct sellers as TRUSTED', () => {
      const evalAmz = SellerTrustService.evaluateSellerTrust({
        source: 'amazon',
        sellerName: 'Amazon.com',
        soldByRetailerDirectly: true,
        fulfilledByRetailerDirectly: true
      });

      expect(evalAmz.status).toBe('TRUSTED');
      expect(evalAmz.score).toBeGreaterThanOrEqual(90);
    });

    it('evaluates third party sellers with low ratings as RISKY', () => {
      const evalLow = SellerTrustService.evaluateSellerTrust({
        source: 'ebay',
        sellerName: 'ShadyDeals123',
        rating: 72,
        ratingCount: 15,
        positivePercentage: 78
      });

      expect(evalLow.status).toBe('RISKY');
      expect(evalLow.score).toBeLessThan(60);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Price Engine & Availability Filter
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Product Price Engine', () => {
    it('filters out OUT_OF_STOCK offers and separates NEW vs USED pricing', () => {
      const offers: ProductOffer[] = [
        {
          id: 'off-1',
          canonical_product_id: 'can-1',
          retailer: 'amazon',
          condition: 'new',
          condition_normalized: 'NEW',
          price: 50.00,
          currency: 'USD',
          shipping_us: 0,
          availability: 'IN_STOCK',
          offer_url: 'https://amazon.com/1'
        },
        {
          id: 'off-2',
          canonical_product_id: 'can-1',
          retailer: 'ebay',
          condition: 'used',
          condition_normalized: 'USED',
          price: 35.00,
          currency: 'USD',
          shipping_us: 5.00,
          availability: 'IN_STOCK',
          offer_url: 'https://ebay.com/2'
        },
        {
          id: 'off-out',
          canonical_product_id: 'can-1',
          retailer: 'bestbuy',
          condition: 'new',
          condition_normalized: 'NEW',
          price: 30.00, // Cheaper but OUT_OF_STOCK!
          currency: 'USD',
          shipping_us: 0,
          availability: 'OUT_OF_STOCK',
          offer_url: 'https://bestbuy.com/3'
        }
      ];

      const summary = ProductPriceService.calculatePriceSummary(offers);
      expect(summary.lowest_new_price).toBe(50.00); // Excludes $30 OUT_OF_STOCK
      expect(summary.lowest_used_price).toBe(35.00);
      expect(summary.number_of_new_offers).toBe(1);
      expect(summary.number_of_used_offers).toBe(1);
    });
  });
});

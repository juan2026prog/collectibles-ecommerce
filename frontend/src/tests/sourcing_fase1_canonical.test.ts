import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  groupOffersByCondition, 
  selectBestSourceBySeparatedCondition,
  calculateSellerReliabilityScore,
  selectBestSource
} from '../services/sourcing/bestSourceSelector';
import { 
  detectOfferChange, 
  recordOfferHistory 
} from '../services/sourcing/offerHistoryService';
import { 
  getRetailerCapabilities, 
  STATIC_RETAILER_CAPABILITIES,
  getCapabilityStatusBadge
} from '../services/sourcing/retailerCapabilities';
import { evaluateAuthenticityGate } from '../services/sourcing/authenticityGate';
import { amazonSourceAdapter } from '../services/sourcing/adapters/AmazonSourceAdapter';
import { ebaySourceAdapter } from '../services/sourcing/adapters/EbaySourceAdapter';
import { bestBuySourceAdapter } from '../services/sourcing/adapters/BestBuySourceAdapter';
import { normalizeAndDeduplicateOffers } from '../services/sourcing/normalizer';
import type { SourceOffer } from '../types/sourcing';

describe('SOURCING INTELLIGENCE FASE 1 — Canonical Graph & Multi-Source Test Suite', () => {

  // 1. Condition Normalization & NEW vs USED Separation
  describe('1. Condition Normalization (NEW vs USED)', () => {
    it('correctly separates NEW, OPEN_BOX and USED offers into distinct groups', () => {
      const offers: SourceOffer[] = [
        {
          id: 'off-1',
          source: 'amazon',
          source_product_id: 'B001',
          url: 'https://amazon.com/dp/B001',
          seller: 'Amazon',
          price: 24.99,
          currency: 'USD',
          domestic_shipping: 0,
          availability: 'in_stock',
          condition: 'new',
          condition_normalized: 'NEW',
          status: 'LIVE',
          is_zinc_compatible: true,
          reliability_score: 95,
          last_checked_at: new Date().toISOString()
        },
        {
          id: 'off-2',
          source: 'ebay',
          source_product_id: 'E001',
          url: 'https://ebay.com/itm/E001',
          seller: 'eBay Top Seller',
          price: 15.00,
          currency: 'USD',
          domestic_shipping: 4.00,
          availability: 'in_stock',
          condition: 'used',
          condition_normalized: 'USED',
          status: 'LIVE',
          is_zinc_compatible: true,
          reliability_score: 85,
          last_checked_at: new Date().toISOString()
        },
        {
          id: 'off-3',
          source: 'ebay',
          source_product_id: 'E002',
          url: 'https://ebay.com/itm/E002',
          seller: 'eBay Seller 2',
          price: 20.00,
          currency: 'USD',
          domestic_shipping: 0,
          availability: 'in_stock',
          condition: 'new',
          condition_normalized: 'OPEN_BOX',
          status: 'LIVE',
          is_zinc_compatible: true,
          reliability_score: 90,
          last_checked_at: new Date().toISOString()
        }
      ];

      const grouped = groupOffersByCondition(offers);
      expect(grouped.newOffers.length).toBe(1);
      expect(grouped.usedOffers.length).toBe(1);
      expect(grouped.openBoxOffers.length).toBe(1);
      expect(grouped.newOffers[0].id).toBe('off-1');
      expect(grouped.usedOffers[0].id).toBe('off-2');
    });

    it('selects best NEW source independently from best USED source', () => {
      const offers: SourceOffer[] = [
        {
          id: 'off-new-amazon',
          source: 'amazon',
          source_product_id: 'B001',
          url: 'https://amazon.com/dp/B001',
          seller: 'Amazon',
          price: 25.00,
          currency: 'USD',
          domestic_shipping: 0,
          availability: 'in_stock',
          condition: 'new',
          condition_normalized: 'NEW',
          status: 'LIVE',
          is_zinc_compatible: true,
          reliability_score: 95,
          last_checked_at: new Date().toISOString()
        },
        {
          id: 'off-used-ebay',
          source: 'ebay',
          source_product_id: 'E001',
          url: 'https://ebay.com/itm/E001',
          seller: 'Used Seller',
          price: 12.00,
          currency: 'USD',
          domestic_shipping: 3.00,
          availability: 'in_stock',
          condition: 'used',
          condition_normalized: 'USED',
          status: 'LIVE',
          is_zinc_compatible: true,
          reliability_score: 80,
          last_checked_at: new Date().toISOString()
        }
      ];

      const res = selectBestSourceBySeparatedCondition(offers);
      expect(res.bestNew).not.toBeNull();
      expect(res.bestUsed).not.toBeNull();
      expect(res.bestNew?.bestOffer.id).toBe('off-new-amazon');
      expect(res.bestUsed?.bestOffer.id).toBe('off-used-ebay');
      expect(res.newFromUsdMin).toBe(25.00);
      expect(res.usedFromUsdMin).toBe(12.00);
    });
  });

  // 2. Seller Reliability Layer
  describe('2. Seller Reliability Layer', () => {
    it('boosts reliability score for official sold and fulfilled retailer offers', () => {
      const offer: SourceOffer = {
        id: 'amz-official',
        source: 'amazon',
        source_product_id: 'B001',
        url: 'https://amazon.com/dp/B001',
        seller: 'Amazon.com',
        sold_by_retailer: true,
        fulfilled_by_retailer: true,
        seller_rating: 99,
        price: 25.00,
        currency: 'USD',
        domestic_shipping: 0,
        availability: 'in_stock',
        condition: 'new',
        status: 'LIVE',
        is_zinc_compatible: true,
        reliability_score: 85,
        last_checked_at: new Date().toISOString()
      };

      const score = calculateSellerReliabilityScore(offer);
      expect(score).toBeGreaterThanOrEqual(95);
    });

    it('penalizes sellers with low ratings or very few reviews', () => {
      const lowRatingOffer: SourceOffer = {
        id: 'ebay-low',
        source: 'ebay',
        source_product_id: 'E999',
        url: 'https://ebay.com/itm/E999',
        seller: 'UnknownSeller88',
        seller_rating: 75, // Low rating
        seller_reviews: 12, // Very few reviews
        price: 18.00,
        currency: 'USD',
        domestic_shipping: 5.00,
        availability: 'in_stock',
        condition: 'new',
        status: 'LIVE',
        is_zinc_compatible: true,
        reliability_score: 80,
        last_checked_at: new Date().toISOString()
      };

      const score = calculateSellerReliabilityScore(lowRatingOffer);
      expect(score).toBeLessThan(70);
    });
  });

  // 3. Offer History & Change Detection
  describe('3. Offer History & Change Detection', () => {
    it('detects INITIAL status when no previous history exists', () => {
      const offer: SourceOffer = {
        id: 'off-1',
        source: 'amazon',
        source_product_id: 'B001',
        url: 'https://amazon.com/dp/B001',
        seller: 'Amazon',
        price: 24.99,
        currency: 'USD',
        domestic_shipping: 0,
        availability: 'in_stock',
        condition: 'new',
        status: 'LIVE',
        is_zinc_compatible: true,
        reliability_score: 95,
        last_checked_at: new Date().toISOString()
      };

      const change = detectOfferChange(null, offer);
      expect(change.hasChange).toBe(true);
      expect(change.changeType).toBe('INITIAL');
    });

    it('detects PRICE_CHANGE when price changes beyond threshold (0.5%)', () => {
      const prev = { price: 25.00, availability_normalized: 'IN_STOCK', condition_normalized: 'NEW', seller: 'Amazon' };
      const current: SourceOffer = {
        id: 'off-1',
        source: 'amazon',
        source_product_id: 'B001',
        url: 'https://amazon.com/dp/B001',
        seller: 'Amazon',
        price: 28.00, // +$3.00 (> 0.5%)
        currency: 'USD',
        domestic_shipping: 0,
        availability: 'in_stock',
        availability_normalized: 'IN_STOCK',
        condition: 'new',
        condition_normalized: 'NEW',
        status: 'LIVE',
        is_zinc_compatible: true,
        reliability_score: 95,
        last_checked_at: new Date().toISOString()
      };

      const change = detectOfferChange(prev, current, 0.5);
      expect(change.hasChange).toBe(true);
      expect(change.changeType).toBe('PRICE_CHANGE');
      expect(change.newValue.price).toBe(28.00);
    });

    it('returns NO_CHANGE when price fluctuation is below threshold and attributes are identical', () => {
      const prev = { price: 25.00, availability_normalized: 'IN_STOCK', condition_normalized: 'NEW', seller: 'Amazon' };
      const current: SourceOffer = {
        id: 'off-1',
        source: 'amazon',
        source_product_id: 'B001',
        url: 'https://amazon.com/dp/B001',
        seller: 'Amazon',
        price: 25.05, // 0.2% change (below 0.5% threshold)
        currency: 'USD',
        domestic_shipping: 0,
        availability: 'in_stock',
        availability_normalized: 'IN_STOCK',
        condition: 'new',
        condition_normalized: 'NEW',
        status: 'LIVE',
        is_zinc_compatible: true,
        reliability_score: 95,
        last_checked_at: new Date().toISOString()
      };

      const change = detectOfferChange(prev, current, 0.5);
      expect(change.hasChange).toBe(false);
      expect(change.changeType).toBe('NO_CHANGE');
    });
  });

  // 4. Retailer Capabilities Declaration (Honest No-False-Greens)
  describe('4. Retailer Capabilities Declaration', () => {
    it('declares Amazon as LIVE and eBay/BestBuy as ADAPTER_READY in baseline static declaration', () => {
      const amazonCaps = STATIC_RETAILER_CAPABILITIES.amazon;
      const ebayCaps = STATIC_RETAILER_CAPABILITIES.ebay;
      const bestBuyCaps = STATIC_RETAILER_CAPABILITIES.bestbuy;

      expect(amazonCaps.search_status).toBe('LIVE');
      expect(amazonCaps.live_check_available).toBe(true);

      expect(ebayCaps.search_status).toBe('ADAPTER_READY');
      expect(ebayCaps.price_status).toBe('NOT_CONFIGURED');
      expect(ebayCaps.live_check_available).toBe(false);

      expect(bestBuyCaps.search_status).toBe('ADAPTER_READY');
      expect(bestBuyCaps.price_status).toBe('NOT_CONFIGURED');
    });

    it('provides correct badge parameters for UI rendering', () => {
      const liveBadge = getCapabilityStatusBadge('LIVE');
      expect(liveBadge.color).toBe('green');

      const readyBadge = getCapabilityStatusBadge('ADAPTER_READY');
      expect(readyBadge.color).toBe('yellow');

      const notConfiguredBadge = getCapabilityStatusBadge('NOT_CONFIGURED');
      expect(notConfiguredBadge.color).toBe('gray');
    });
  });

  // 5. E2E Acceptance Test: Street Fighter Ryu (Jada Toys 1/12)
  describe('5. E2E Validation: Street Fighter Ryu (Jada Toys 1/12)', () => {
    it('normalizes multi-source Ryu offers into a single Canonical Product with auditable identity', () => {
      const ryuUpc = '801310342176'; // Official Jada Toys Street Fighter Ryu UPC

      const extAmazon = {
        raw: amazonSourceAdapter.parseOfferFromInput({
          url: 'https://www.amazon.com/dp/B0C1DFRRYU',
          title: 'Jada Toys Street Fighter 1/12 Ryu 6 inch Action Figure',
          price: 24.99,
          shipping: 0,
          upc: ryuUpc,
          brand: 'Jada Toys'
        }),
        offer: amazonSourceAdapter.toSourceOffer({
          source: 'amazon',
          source_product_id: 'B0C1DFRRYU',
          url: 'https://www.amazon.com/dp/B0C1DFRRYU',
          title: 'Jada Toys Street Fighter 1/12 Ryu 6 inch Action Figure',
          price: 24.99,
          currency: 'USD',
          domestic_shipping: 0,
          seller: 'Amazon.com',
          availability: 'in_stock',
          condition: 'new'
        }),
        inputMeta: { brand: 'Jada Toys', license: 'Street Fighter', character: 'Ryu', upc: ryuUpc }
      };

      const extEbay = {
        raw: ebaySourceAdapter.parseOfferFromInput({
          url: 'https://www.ebay.com/itm/394829102938',
          title: 'Street Fighter Jada Toys Ryu Figure 1/12 Scale Sealed',
          price: 22.00,
          shipping: 5.50,
          upc: ryuUpc,
          brand: 'Jada Toys'
        }),
        offer: ebaySourceAdapter.toSourceOffer({
          source: 'ebay',
          source_product_id: '394829102938',
          url: 'https://www.ebay.com/itm/394829102938',
          title: 'Street Fighter Jada Toys Ryu Figure 1/12 Scale Sealed',
          price: 22.00,
          currency: 'USD',
          domestic_shipping: 5.50,
          seller: 'CollectorDeals',
          availability: 'in_stock',
          condition: 'new'
        }),
        inputMeta: { brand: 'Jada Toys', license: 'Street Fighter', character: 'Ryu', upc: ryuUpc }
      };

      // 1. Group into Canonical Product
      const normalized = normalizeAndDeduplicateOffers([extAmazon, extEbay]);
      expect(normalized.length).toBe(1);

      const ryuProduct = normalized[0];
      expect(ryuProduct.brand).toBe('Jada Toys');
      expect(ryuProduct.license).toBe('Street Fighter');
      expect(ryuProduct.offers.length).toBe(2);
      expect(ryuProduct.canonical_sku).toContain('COL-JADATOYS-STREETFI-RYU-');

      // 2. Evaluate Authenticity Gate for Street Fighter Ryu
      const authResult = evaluateAuthenticityGate({
        title: ryuProduct.title,
        brand: ryuProduct.brand,
        license: ryuProduct.license,
        retailer: 'amazon',
        seller: 'Amazon.com',
        price: 24.99,
        upc: ryuUpc
      });

      expect(authResult.status).toBe('VERIFIED_OFFICIAL');
      expect(authResult.score).toBeGreaterThanOrEqual(75);

      // 3. Best Source Selection: Amazon ($24.99 + $0) vs eBay ($22.00 + $5.50 = $27.50)
      // Amazon has lower total landed cost and LIVE status
      const bestEval = selectBestSource(ryuProduct.offers);
      expect(bestEval.bestOffer.source).toBe('amazon');
    });
  });
});

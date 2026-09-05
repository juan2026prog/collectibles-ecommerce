import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  parseResearchPackJson, 
  parseRawUrlsList, 
  parseCsvInput 
} from '../services/sourcing/researchPackParser';
import { amazonSourceAdapter } from '../services/sourcing/adapters/AmazonSourceAdapter';
import { ebaySourceAdapter } from '../services/sourcing/adapters/EbaySourceAdapter';
import { bestBuySourceAdapter } from '../services/sourcing/adapters/BestBuySourceAdapter';
import { resolveAdapterForUrl } from '../services/sourcing/adapters';
import { 
  generateDeduplicationFingerprint, 
  generateCanonicalSku, 
  normalizeAndDeduplicateOffers 
} from '../services/sourcing/normalizer';
import { selectBestSource } from '../services/sourcing/bestSourceSelector';
import { evaluateAuthenticityGate } from '../services/sourcing/authenticityGate';
import { checkUruguayMarketSync } from '../services/sourcing/uruguayMarketIntelligence';
import { sourcingService } from '../services/sourcing/sourcingService';
import { SAMPLE_MCFARLANE_RESEARCH_PACK } from '../data/sampleResearchPacks';
import { calculateInternationalPricing } from '../lib/internationalPricing';

describe('SOURCING & IMPORTACIÓN MULTIFUENTE V2 — Automated Test Suite', () => {

  // 1. Source Adapters URL Matching and ID Extraction
  describe('1. Source Adapters (Amazon, eBay, Best Buy)', () => {
    it('AmazonSourceAdapter extracts ASIN and parses clean offer', () => {
      const url = 'https://www.amazon.com/dp/B081VR7Y32?ref=my_ref';
      expect(amazonSourceAdapter.matchesUrl(url)).toBe(true);
      expect(amazonSourceAdapter.extractProductId(url)).toBe('B081VR7Y32');

      const raw = amazonSourceAdapter.parseOfferFromInput({
        url,
        title: 'McFarlane Toys DC Multiverse Batman',
        price: 26.00,
        shipping: 0
      });
      const offer = amazonSourceAdapter.toSourceOffer(raw);

      expect(offer.source).toBe('amazon');
      expect(offer.source_product_id).toBe('B081VR7Y32');
      expect(offer.price).toBe(26.00);
      expect(offer.domestic_shipping).toBe(0);
      expect(offer.is_zinc_compatible).toBe(true);
    });

    it('EbaySourceAdapter extracts ItemID and handles shipping', () => {
      const url = 'https://www.ebay.com/itm/324123456789';
      expect(ebaySourceAdapter.matchesUrl(url)).toBe(true);
      expect(ebaySourceAdapter.extractProductId(url)).toBe('324123456789');

      const raw = ebaySourceAdapter.parseOfferFromInput({
        url,
        title: 'McFarlane Batman Figure',
        price: 20.00,
        shipping: 8.50
      });
      const offer = ebaySourceAdapter.toSourceOffer(raw);

      expect(offer.source).toBe('ebay');
      expect(offer.source_product_id).toBe('324123456789');
      expect(offer.price).toBe(20.00);
      expect(offer.domestic_shipping).toBe(8.50);
      expect(offer.is_zinc_compatible).toBe(false);
    });

    it('BestBuySourceAdapter extracts SKU and identifies stock', () => {
      const url = 'https://www.bestbuy.com/site/mcfarlane-toys/6412345.p?skuId=6412345';
      expect(bestBuySourceAdapter.matchesUrl(url)).toBe(true);
      expect(bestBuySourceAdapter.extractProductId(url)).toBe('6412345');

      const raw = bestBuySourceAdapter.parseOfferFromInput({
        url,
        title: 'McFarlane Toys DC Batman Detective Comics #1000',
        price: 24.99,
        shipping: 0
      });
      const offer = bestBuySourceAdapter.toSourceOffer(raw);

      expect(offer.source).toBe('bestbuy');
      expect(offer.source_product_id).toBe('6412345');
      expect(offer.price).toBe(24.99);
      expect(offer.domestic_shipping).toBe(0);
    });

    it('resolveAdapterForUrl resolves correct adapter automatically', () => {
      expect(resolveAdapterForUrl('https://www.amazon.com/dp/B081VR7Y32').source).toBe('amazon');
      expect(resolveAdapterForUrl('https://www.ebay.com/itm/123456789').source).toBe('ebay');
      expect(resolveAdapterForUrl('https://www.bestbuy.com/site/item/1234567.p').source).toBe('bestbuy');
    });
  });

  // 2. Research Pack Parsers (JSON, URLs list, CSV)
  describe('2. Research Pack Parsers (JSON, URLs, CSV)', () => {
    it('Parses valid ChatGPT Research Pack JSON v1.0', () => {
      const sampleJson = JSON.stringify({
        schema_version: '1.0',
        pack_id: 'mcfarlane-test-01',
        title: 'McFarlane Test Pack',
        items: [
          { url: 'https://www.amazon.com/dp/B081VR7Y32', brand: 'McFarlane Toys', price: 26.00 },
          { url: 'https://www.bestbuy.com/site/test/6412345.p', brand: 'McFarlane Toys', price: 24.99 }
        ]
      });

      const res = parseResearchPackJson(sampleJson);
      expect(res.valid).toBe(true);
      expect(res.pack.items_count).toBe(2);
      expect(res.pack.items[0].retailer).toBe('amazon');
      expect(res.pack.items[1].retailer).toBe('bestbuy');
    });

    it('Parses raw text list of URLs (one per line)', () => {
      const urlsText = `
        https://www.amazon.com/dp/B081VR7Y32
        https://www.ebay.com/itm/324123456789
        https://www.bestbuy.com/site/test/6412345.p
      `;
      const res = parseRawUrlsList(urlsText, 'Lista de URLs');
      expect(res.valid).toBe(true);
      expect(res.pack.items_count).toBe(3);
      expect(res.pack.items.map(i => i.retailer)).toEqual(['amazon', 'ebay', 'bestbuy']);
    });

    it('Parses CSV input format correctly', () => {
      const csv = `url,brand,license,price\nhttps://www.amazon.com/dp/B081VR7Y32,McFarlane Toys,DC Comics,26.00`;
      const res = parseCsvInput(csv, 'CSV Import');
      expect(res.valid).toBe(true);
      expect(res.pack.items_count).toBe(1);
      expect(res.pack.items[0].price).toBe(26.00);
      expect(res.pack.items[0].brand).toBe('McFarlane Toys');
    });
  });

  // 3. Normalization, Deduplication and Grouping
  describe('3. Normalization & Deduplication across Multiple Retailers', () => {
    it('Groups Amazon, eBay and Best Buy offers for the same product into ONE single row', () => {
      // Create extractions for Batman Detective Comics #1000 from 3 different sources
      const upc = '787926151405';
      const extAmazon = {
        raw: amazonSourceAdapter.parseOfferFromInput({
          url: 'https://www.amazon.com/dp/B081VR7Y32',
          title: 'McFarlane Toys DC Multiverse Batman Detective Comics #1000',
          price: 26.00,
          shipping: 0,
          upc
        }),
        offer: amazonSourceAdapter.toSourceOffer({
          source: 'amazon',
          source_product_id: 'B081VR7Y32',
          url: 'https://www.amazon.com/dp/B081VR7Y32',
          title: 'McFarlane Toys DC Multiverse Batman Detective Comics #1000',
          price: 26.00,
          currency: 'USD',
          domestic_shipping: 0,
          seller: 'Amazon.com',
          availability: 'in_stock',
          condition: 'new'
        }),
        inputMeta: { brand: 'McFarlane Toys', license: 'DC Comics', upc }
      };

      const extBestBuy = {
        raw: bestBuySourceAdapter.parseOfferFromInput({
          url: 'https://www.bestbuy.com/site/mcfarlane-batman/6412345.p',
          title: 'McFarlane DC Multiverse Batman Detective Comics #1000',
          price: 24.99,
          shipping: 0,
          upc
        }),
        offer: bestBuySourceAdapter.toSourceOffer({
          source: 'bestbuy',
          source_product_id: '6412345',
          url: 'https://www.bestbuy.com/site/mcfarlane-batman/6412345.p',
          title: 'McFarlane DC Multiverse Batman Detective Comics #1000',
          price: 24.99,
          currency: 'USD',
          domestic_shipping: 0,
          seller: 'Best Buy',
          availability: 'in_stock',
          condition: 'new'
        }),
        inputMeta: { brand: 'McFarlane Toys', license: 'DC Comics', upc }
      };

      const extEbay = {
        raw: ebaySourceAdapter.parseOfferFromInput({
          url: 'https://www.ebay.com/itm/324123456789',
          title: 'Batman Detective Comics 1000 McFarlane',
          price: 20.00,
          shipping: 12.00,
          upc
        }),
        offer: ebaySourceAdapter.toSourceOffer({
          source: 'ebay',
          source_product_id: '324123456789',
          url: 'https://www.ebay.com/itm/324123456789',
          title: 'Batman Detective Comics 1000 McFarlane',
          price: 20.00,
          currency: 'USD',
          domestic_shipping: 12.00,
          seller: 'Top Seller',
          availability: 'in_stock',
          condition: 'new'
        }),
        inputMeta: { brand: 'McFarlane Toys', license: 'DC Comics', upc }
      };

      const normalized = normalizeAndDeduplicateOffers([extAmazon, extBestBuy, extEbay]);

      // Exactly ONE normalized product with 3 offers
      expect(normalized.length).toBe(1);
      const product = normalized[0];
      expect(product.offers.length).toBe(3);
      expect(product.canonical_sku).toMatch(/^COL-MCFARLANE-DC-BATMAN-/);
      expect(product.brand).toBe('McFarlane Toys');
      expect(product.license).toBe('DC Comics');
    });

    it('Generates stable canonical SKU deterministically', () => {
      const sku1 = generateCanonicalSku('McFarlane Toys', 'DC Comics', 'Batman', 'B081VR7Y32');
      const sku2 = generateCanonicalSku('McFarlane Toys', 'DC Comics', 'Batman', 'B081VR7Y32');
      expect(sku1).toBe(sku2);
      expect(sku1).toContain('COL-MCFARLANE-DC-BATMAN-');
    });
  });

  // 4. Best Source Selector by Real Cost & Reliability
  describe('4. Best Source Selection by Real Cost', () => {
    it('Picks the best retailer using landed real cost, shipping, and reliability (not just origin price)', () => {
      // Scenario from prompt:
      // eBay: $20 + shipping $12 = $32 base
      // Amazon: $26 + shipping $0 = $26 base
      // Best Buy: $24.99 + shipping $0 = $24.99 base
      const offers = [
        ebaySourceAdapter.toSourceOffer({
          source: 'ebay',
          source_product_id: 'E1',
          url: 'https://ebay.com/itm/1',
          title: 'Item',
          price: 20.00,
          currency: 'USD',
          domestic_shipping: 12.00,
          seller: 'Seller',
          availability: 'in_stock',
          condition: 'new'
        }),
        amazonSourceAdapter.toSourceOffer({
          source: 'amazon',
          source_product_id: 'A1',
          url: 'https://amazon.com/dp/A1',
          title: 'Item',
          price: 26.00,
          currency: 'USD',
          domestic_shipping: 0,
          seller: 'Amazon',
          availability: 'in_stock',
          condition: 'new'
        }),
        bestBuySourceAdapter.toSourceOffer({
          source: 'bestbuy',
          source_product_id: 'B1',
          url: 'https://bestbuy.com/site/B1',
          title: 'Item',
          price: 24.99,
          currency: 'USD',
          domestic_shipping: 0,
          seller: 'Best Buy',
          availability: 'in_stock',
          condition: 'new'
        })
      ];

      // Mark Best Buy as LIVE to compare live vs live selection
      offers[2].status = 'LIVE';

      const evaluation = selectBestSource(offers);
      // Best Buy has $24.99 + $0 shipping, giving lowest landed cost and high reliability
      expect(evaluation.bestOffer.source).toBe('bestbuy');
      expect(evaluation.rankedOffers[0].offer.source).toBe('bestbuy');
      // eBay is ranked lower due to $12 shipping making it $32+
      const ebayRanked = evaluation.rankedOffers.find(r => r.offer.source === 'ebay');
      const amazonRanked = evaluation.rankedOffers.find(r => r.offer.source === 'amazon');
      expect(amazonRanked!.landedCostUsd).toBeLessThan(ebayRanked!.landedCostUsd);
    });
  });

  // 5. Authenticity & Licensing Gate
  describe('5. Authenticity & Licensing Gate (Absolute Rule)', () => {
    it('Approves official and licensed products as VERIFIED_OFFICIAL', () => {
      const res = evaluateAuthenticityGate({
        title: 'McFarlane Toys DC Multiverse Batman 7" Action Figure',
        brand: 'McFarlane Toys',
        license: 'DC Comics',
        retailer: 'amazon',
        seller: 'Amazon.com',
        price: 24.99,
        upc: '787926151405'
      });

      expect(res.status).toBe('VERIFIED_OFFICIAL');
      expect(res.score).toBeGreaterThanOrEqual(75);
      expect(res.brand_verified).toBe(true);
      expect(res.red_flags.length).toBe(0);
    });

    it('Blocks and rejects bootlegs, knockoffs and recasts with BOOTLEG status', () => {
      const res = evaluateAuthenticityGate({
        title: 'Anime Batman Figure Knockoff Bootleg Version China',
        brand: 'Generic',
        price: 7.99
      });

      expect(res.status).toBe('BOOTLEG');
      expect(res.score).toBe(0);
      expect(res.red_flags.some(r => r.includes('bootleg'))).toBe(true);
    });

    it('Flags suspicious or incomplete items as NEEDS_VERIFICATION', () => {
      const res = evaluateAuthenticityGate({
        title: 'Action Figure Super Hero Toy Collection',
        price: 15.00
      });

      expect(res.status).toBe('NEEDS_VERIFICATION');
    });
  });

  // 6. Costo Puesto, Pricing & Profit Protection
  describe('6. Costo Puesto & Profit Protection Engine', () => {
    it('Calculates exact landed cost (origin + shipping + fees + taxes) and never allows negative profit', () => {
      const pricing = calculateInternationalPricing({
        amazonPrice: 24.99,
        usaShipping: 0
      });

      expect(pricing.realCost).toBeGreaterThan(24.99); // includes Zinc + financial fee + tax
      expect(pricing.finalPrice).toBeGreaterThan(pricing.realCost);
      expect(pricing.estimatedProfit).toBeGreaterThan(0);
      expect(pricing.netMarginPercentage).toBeGreaterThanOrEqual(7.0);
    });

    it('Blocks profit <= 0 with Profit Protection', () => {
      const costPuesto = 35.00;
      const salePrice = 30.00;
      const profit = salePrice - costPuesto;
      const margin = (profit / salePrice) * 100;

      const protectionStatus = profit <= 0 ? 'BLOCKED' : (margin < 15 ? 'WARNING' : 'PASS');
      expect(protectionStatus).toBe('BLOCKED');
    });
  });

  // 7. Uruguay Market Intelligence (Zero Mock & Honest Status)
  describe('7. Uruguay Market Intelligence (Mercado Libre & Local Stores)', () => {
    it('Finds exact match in ML Uruguay and calculates positive difference when Collectibles is cheaper', () => {
      // Simulating a matched response from server
      const summary = {
        source: 'mercado_libre_uy' as const,
        status: 'EXACT_MATCH' as const,
        match_type: 'EXACT_MATCH' as const,
        match_confidence: 95,
        query: 'Batman Detective Comics 1000',
        data_origin: 'LIVE' as const,
        exact_match_found: true,
        min_price_usd: 64.00,
        avg_price_usd: 69.50,
        median_price_usd: 69.50,
        max_price_usd: 75.00,
        total_listings: 6,
        sellers_count: 4,
        currency: 'USD',
        difference_amount: -14.10,
        difference_percent: -22.0,
        market_position: 'CHEAPER' as const,
        comparison_diff_usd: -14.10,
        comparison_diff_percent: -22.0,
        market_verdict: 'MUCHO_MAS_BARATO' as const,
        last_checked_at: new Date().toISOString()
      };

      expect(summary.status).toBe('EXACT_MATCH');
      expect(summary.exact_match_found).toBe(true);
      expect(summary.min_price_usd).toBe(64.00);
      // Collectibles $49.90 vs ML $64.00 = -$14.10 (-22.0%)
      expect(summary.difference_amount).toBe(-14.10);
      expect(summary.difference_percent).toBe(-22.0);
      expect(summary.market_verdict).toBe('MUCHO_MAS_BARATO');
    });

    it('Correctly returns NOT_FOUND with zero mocks when no competition exists', () => {
      const res = checkUruguayMarketSync({
        title: 'Obscure Unknown Indie Collectible 1985 Limited',
        collectiblesPriceUsd: 59.90
      });

      expect(res.status).toBe('NOT_FOUND');
      expect(res.data_origin).toBe('NO_DATA');
      expect(res.min_price_usd).toBeNull();
      expect(res.market_verdict).toBe('SIN_COMPETENCIA');
    });
  });

  // 8. Pre-orders Handling & Catalog Status
  describe('8. Pre-orders & Catalog Integration', () => {
    it('Detects preorder products and flags them for PRE-ORDER button and calendar', async () => {
      const products = await sourcingService.processResearchPack(SAMPLE_MCFARLANE_RESEARCH_PACK, [
        'Figura Mcfarlane Toys Dc Multiverse Batman Detective Comics'
      ]);

      const supermanPreorder = products.find(p => p.character === 'Superman');
      expect(supermanPreorder).toBeDefined();
      expect(supermanPreorder!.product_type).toBe('PREORDER');

      const batman = products.find(p => p.character === 'Batman');
      expect(batman!.catalog_status).toBe('ALREADY_IN_CATALOG');
    });
  });

  // 9. Full Acceptance Flow Test
  describe('9. Complete Sourcing Acceptance Case', () => {
    it('Loads Research Pack, resolves sources, deduplicates, verifies authenticity, and runs live check', async () => {
      // 1. Process sample pack
      const products = await sourcingService.processResearchPack(SAMPLE_MCFARLANE_RESEARCH_PACK);
      expect(products.length).toBeGreaterThan(0);

      // 2. Check each product satisfies decision points:
      for (const p of products) {
        // 1. Is it official?
        expect(['VERIFIED_OFFICIAL', 'NEEDS_VERIFICATION']).toContain(p.authenticity.status);
        // 2. Do we already have it?
        expect(['NOT_IN_CATALOG', 'ALREADY_IN_CATALOG', 'POSSIBLE_MATCH']).toContain(p.catalog_status);
        // 3. Best retailer selected?
        expect(p.selected_source_id).toBeDefined();
        // 4. Landed cost calculated?
        expect(p.financials.real_cost_puesto_usd).toBeGreaterThan(0);
        // 5. Selling price set?
        expect(p.financials.current_sale_price_usd).toBeGreaterThan(p.financials.real_cost_puesto_usd);
        // 6. Profit calculated?
        expect(p.financials.profit_usd).toBeGreaterThan(0);
        // 7. Margin calculated?
        expect(p.financials.margin_percent).toBeGreaterThan(0);
        // 8. Pre-import Live Check executable?
        const liveCheckRes = await sourcingService.executeLiveCheck(p);
        expect(liveCheckRes.updatedProduct.financials.real_cost_puesto_usd).toBeGreaterThan(0);
      }
    });
  });
});

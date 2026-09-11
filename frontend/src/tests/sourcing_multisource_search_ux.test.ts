import { describe, it, expect } from 'vitest';
import { ebaySourceAdapter } from '../services/sourcing/adapters/EbaySourceAdapter';
import { bestBuySourceAdapter } from '../services/sourcing/adapters/BestBuySourceAdapter';
import { 
  mapExternalConditionToCanonical, 
  detectRetroInBox, 
  CANONICAL_CONDITIONS_META 
} from '../services/sourcing/conditionMapper';
import { multiSourceSearchService } from '../services/sourcing/multiSourceSearchService';

describe('Sourcing Intelligence — Multi-Source Search & Import UX', () => {

  describe('1. eBay Adapter Clean-up & Lot/Auction Detection', () => {
    it('nunca debe inventar precios mock ($19.99) si no se provee precio', () => {
      const extraction = ebaySourceAdapter.parseOfferFromInput({
        url: 'https://www.ebay.com/itm/123456789012',
        title: 'NECA Predator Figure'
      });

      expect(extraction.price).toBe(0);
      expect(extraction.domestic_shipping).toBe(0);
      expect(extraction.seller).toBe('eBay Seller');
    });

    it('debe detectar lotes y bundles mediante regex excluyente', () => {
      const lotExtraction = ebaySourceAdapter.parseOfferFromInput({
        url: 'https://www.ebay.com/itm/987654321098',
        title: 'Lot of 5 Marvel Legends Spider-Man Figures Hasbro Loose',
        price: 55.00
      });

      expect(lotExtraction.raw_metadata?.is_lot).toBe(true);

      const offer = ebaySourceAdapter.toSourceOffer(lotExtraction);
      expect(offer.metadata?.is_lot).toBe(true);
    });

    it('debe distinguir subastas de precio fijo (Buy It Now)', () => {
      const auctionExtraction = ebaySourceAdapter.parseOfferFromInput({
        url: 'https://www.ebay.com/itm/112233445566',
        title: 'Vintage Kenner Boba Fett 1979',
        price: 15.00,
        raw: { listing_type: 'Auction', bid_count: 7 }
      });

      expect(auctionExtraction.raw_metadata?.is_auction).toBe(true);
      expect(auctionExtraction.raw_metadata?.listing_type).toBe('Auction');

      const fixedPriceExtraction = ebaySourceAdapter.parseOfferFromInput({
        url: 'https://www.ebay.com/itm/112233445577',
        title: 'Jada Toys Street Fighter Ryu',
        price: 24.99,
        raw: { listing_type: 'FixedPriceItem' }
      });

      expect(fixedPriceExtraction.raw_metadata?.is_auction).toBe(false);
      expect(fixedPriceExtraction.raw_metadata?.listing_type).toBe('FixedPriceItem');
    });

    it('debe preservar la reputación real del vendedor cuando esté disponible', () => {
      const extraction = ebaySourceAdapter.parseOfferFromInput({
        url: 'https://www.ebay.com/itm/334455667788',
        title: 'Star Wars Black Series Darth Vader',
        price: 30.00,
        raw: {
          seller_name: 'ToyGalaxyPro',
          feedback_percentage: 99.7,
          feedback_score: 18450
        }
      });

      const offer = ebaySourceAdapter.toSourceOffer(extraction);
      expect(offer.seller).toBe('ToyGalaxyPro');
      expect(offer.seller_rating).toBe(99.7);
      expect(offer.seller_reviews).toBe(18450);
    });
  });

  describe('2. Estandarización de 6 Condiciones Canónicas', () => {
    it('debe mapear con precisión quirúrgica a los 6 enums de products.condition', () => {
      expect(mapExternalConditionToCanonical('new', 'amazon').condition).toBe('new_sealed');
      expect(mapExternalConditionToCanonical('brand new', 'ebay').condition).toBe('new_sealed');
      expect(mapExternalConditionToCanonical('open box', 'ebay').condition).toBe('new_open_box');
      expect(mapExternalConditionToCanonical('used', 'ebay').condition).toBe('used_complete');
      expect(mapExternalConditionToCanonical('loose', 'ebay', 'Figure loose with accessories').condition).toBe('loose_complete');
      expect(mapExternalConditionToCanonical('loose', 'ebay', 'Figure loose missing hand and weapon parts').condition).toBe('loose_incomplete');
    });

    it('debe contener las 6 condiciones canónicas en CANONICAL_CONDITIONS_META', () => {
      const keys = Object.keys(CANONICAL_CONDITIONS_META);
      expect(keys).toEqual([
        'new_sealed',
        'new_open_box',
        'used_complete',
        'used_incomplete',
        'loose_complete',
        'loose_incomplete'
      ]);
    });
  });

  describe('3. Modo Editorial "Retro en Caja"', () => {
    it('debe detectar coleccionables vintage con empaque original', () => {
      const result = detectRetroInBox(
        'Star Wars Power of the Force Kenner Darth Vader 1997 MOC Mint on Card',
        'new_sealed',
        ['retro', 'star-wars']
      );

      expect(result.isRetroInBox).toBe(true);
      expect(result.reason).toContain('empaque original');
    });

    it('debe excluir categóricamente figuras loose, dañadas o sin caja', () => {
      const looseResult = detectRetroInBox(
        'Star Wars Vintage 1980 Kenner Boba Fett Loose No Box',
        'loose_complete',
        ['vintage']
      );

      expect(looseResult.isRetroInBox).toBe(false);

      const damagedResult = detectRetroInBox(
        'Kenner Batman 1989 Figure Broken for Parts',
        'used_incomplete',
        ['vintage']
      );

      expect(damagedResult.isRetroInBox).toBe(false);
    });
  });

  describe('4. Búsqueda Multifuente & Agregación Canónica (Modo TODOS)', () => {
    it('debe reportar honestamente Best Buy como NOT_CONFIGURED sin romper la búsqueda', async () => {
      const res = await multiSourceSearchService.searchProducts('Street Fighter', 'bestbuy');
      expect(res.sourceStatus.bestbuy.status).toBe('NOT_CONFIGURED');
      expect(res.sourceStatus.bestbuy.isAvailable).toBe(false);
      expect(res.sourceStatus.bestbuy.message).toContain('requiere API Key');
    });

    it('en modo TODOS debe agrupar ofertas de Amazon y eBay en 1 producto canónico', async () => {
      const res = await multiSourceSearchService.searchProducts('Street Fighter Jada Toys', 'all');

      expect(res.totalCanonicalCount).toBeGreaterThan(0);
      expect(res.totalOffersCount).toBeGreaterThan(res.totalCanonicalCount);

      const ryu = res.canonicalProducts.find(p => p.title.toLowerCase().includes('ryu'));
      expect(ryu).toBeDefined();

      // Debe contener múltiples ofertas agrupadas
      expect(ryu!.offers.length).toBeGreaterThanOrEqual(2);
      expect(ryu!.matched_sources).toContain('amazon');
      expect(ryu!.matched_sources).toContain('ebay');

      // Debe computar "Nuevo desde" y "Usado desde"
      expect(ryu!.lowest_new_price).toBeGreaterThan(0);
      expect(ryu!.lowest_new_retailer).toBeDefined();
    });

    it('debe marcar correctamente productos que ya existen en el catálogo', async () => {
      const catalogTitles = [
        'Jada Toys Capcom Ultra Street Fighter II Ryu 1:12',
        'McFarlane Toys DC Comics Batman'
      ];

      const res = await multiSourceSearchService.searchProducts('Street Fighter', 'all', catalogTitles);
      const ryu = res.canonicalProducts.find(p => p.title.toLowerCase().includes('ryu'));
      
      expect(ryu).toBeDefined();
      expect(ryu!.already_in_catalog).toBe(true);
      expect(ryu!.catalog_match_title).toBe('Jada Toys Capcom Ultra Street Fighter II Ryu 1:12');
    });
  });

});

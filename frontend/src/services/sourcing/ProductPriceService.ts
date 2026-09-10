import type { 
  ProductOffer, 
  ProductPriceSummary, 
  ConditionNormalized 
} from '../../types/sourcing';

export class ProductPriceService {
  /**
   * Obtiene la métrica de precios comerciales agregados para un conjunto de ofertas.
   * Separa estrictamente ofertas NUEVAS y USADAS y descarta las que no tienen stock o están vencidas.
   */
  static calculatePriceSummary(offers: ProductOffer[]): ProductPriceSummary {
    if (!offers || offers.length === 0) {
      return {
        lowest_new_price: null,
        lowest_used_price: null,
        average_new_price: null,
        median_new_price: null,
        number_of_new_offers: 0,
        number_of_used_offers: 0,
        best_new_offer: null,
        best_used_offer: null,
        delivery_range_min_days: null,
        delivery_range_max_days: null
      };
    }

    // Filtrar ofertas válidas disponibles (excluir OUT_OF_STOCK)
    const validOffers = offers.filter(o => 
      o.availability !== 'OUT_OF_STOCK' && 
      o.price > 0
    );

    // Filtrar por condición
    const newOffers = validOffers.filter(o => o.condition_normalized === 'NEW');
    const usedOffers = validOffers.filter(o => 
      o.condition_normalized === 'USED' || 
      o.condition_normalized === 'OPEN_BOX' || 
      o.condition_normalized === 'REFURBISHED'
    );

    // 1. Calcular para NUEVOS
    let lowestNewPrice: number | null = null;
    let avgNewPrice: number | null = null;
    let medianNewPrice: number | null = null;
    let bestNewOffer: ProductOffer | null = null;

    if (newOffers.length > 0) {
      const sortedNew = [...newOffers].sort((a, b) => (a.price + a.shipping_us) - (b.price + b.shipping_us));
      bestNewOffer = sortedNew[0];
      lowestNewPrice = bestNewOffer.price;

      const sumNew = newOffers.reduce((acc, curr) => acc + curr.price, 0);
      avgNewPrice = Number((sumNew / newOffers.length).toFixed(2));

      const pricesNewSorted = newOffers.map(o => o.price).sort((a, b) => a - b);
      const mid = Math.floor(pricesNewSorted.length / 2);
      medianNewPrice = pricesNewSorted.length % 2 !== 0
        ? pricesNewSorted[mid]
        : Number(((pricesNewSorted[mid - 1] + pricesNewSorted[mid]) / 2).toFixed(2));
    }

    // 2. Calcular para USADOS
    let lowestUsedPrice: number | null = null;
    let bestUsedOffer: ProductOffer | null = null;

    if (usedOffers.length > 0) {
      const sortedUsed = [...usedOffers].sort((a, b) => (a.price + a.shipping_us) - (b.price + b.shipping_us));
      bestUsedOffer = sortedUsed[0];
      lowestUsedPrice = bestUsedOffer.price;
    }

    // 3. Estimación de entrega combinada (días)
    let minDays: number | null = null;
    let maxDays: number | null = null;

    const deliveryValues = validOffers
      .map(o => o.shipping_estimated || (o.retailer === 'amazon' ? 3 : o.retailer === 'bestbuy' ? 4 : 6))
      .filter(Boolean);

    if (deliveryValues.length > 0) {
      minDays = Math.min(...deliveryValues);
      maxDays = Math.max(...deliveryValues) + 2; // Rango estimado
    }

    return {
      lowest_new_price: lowestNewPrice,
      lowest_used_price: lowestUsedPrice,
      average_new_price: avgNewPrice,
      median_new_price: medianNewPrice,
      number_of_new_offers: newOffers.length,
      number_of_used_offers: usedOffers.length,
      best_new_offer: bestNewOffer,
      best_used_offer: bestUsedOffer,
      delivery_range_min_days: minDays,
      delivery_range_max_days: maxDays
    };
  }
}

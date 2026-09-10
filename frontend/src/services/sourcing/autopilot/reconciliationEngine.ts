import type { NormalizedProduct, SourceOffer } from '../../../types/sourcing';
import type { AutopilotSettings, AutopilotRule } from '../../../types/sourcingAutopilot';
import { calculateInternationalPricing } from '../../../lib/internationalPricing';
import { selectBestSourceV1 } from '../bestSourceSelector';
import { auditService } from './auditService';
import { actionQueueManager } from './actionQueue';

export type PublicationMonitoredStatus = 
  | 'ACTIVE'
  | 'PAUSED'
  | 'OUT_OF_STOCK'
  | 'PRICE_CHANGED'
  | 'SOURCE_CHANGED'
  | 'REVIEW_REQUIRED'
  | 'ERROR';

export interface ReconciliationResult {
  productId: string;
  previousStatus: PublicationMonitoredStatus;
  newStatus: PublicationMonitoredStatus;
  actionTaken: 'NONE' | 'PRICE_UPDATED' | 'SOURCE_SWITCHED' | 'PUBLICATION_PAUSED' | 'PAUSE_PREVENTED_LOSS';
  details: string[];
  updatedProduct: NormalizedProduct;
}

export class AutopilotReconciliationEngine {
  /**
   * Reconciles a published/monitored product against new live source data.
   */
  async reconcileProduct(
    product: NormalizedProduct,
    freshLiveOffer: SourceOffer | null,
    settings: AutopilotSettings,
    rules: AutopilotRule[]
  ): Promise<ReconciliationResult> {
    const details: string[] = [];
    let previousStatus: PublicationMonitoredStatus = 'ACTIVE';
    let newStatus: PublicationMonitoredStatus = 'ACTIVE';
    let actionTaken: ReconciliationResult['actionTaken'] = 'NONE';
    let updatedProduct = { ...product };

    const currentOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];
    const targetOffer = freshLiveOffer || currentOffer;

    // 1. Stock Check & Alternative Source Switching
    const isOutOfStock = targetOffer.availability_normalized === 'OUT_OF_STOCK' || targetOffer.availability === 'out_of_stock' || (targetOffer.stock !== null && targetOffer.stock !== undefined && targetOffer.stock <= 0);

    if (isOutOfStock) {
      details.push(`Fuente actual (${targetOffer.source}) quedó SIN STOCK.`);
      previousStatus = 'OUT_OF_STOCK';

      // Search for alternative offers matching the canonical product condition (NEW -> NEW, never NEW -> USED)
      const currentCondition = targetOffer.condition_normalized || 'NEW';
      const alternativeOffers = product.offers.filter(o => 
        o.id !== targetOffer.id &&
        (o.condition_normalized === currentCondition || (currentCondition === 'NEW' && o.condition === 'new')) &&
        o.availability_normalized !== 'OUT_OF_STOCK' &&
        o.availability !== 'out_of_stock'
      );

      if (alternativeOffers.length > 0) {
        // Run Best Source Selector to pick the optimal alternative
        const bestAlt = alternativeOffers[0]; // best alternative
        details.push(`Fuente alternativa válida encontrada: ${bestAlt.source} ($${bestAlt.price} USD). Disparando SWITCH SOURCE.`);

        // Recalculate pricing with alternative offer
        const pricingAlt = calculateInternationalPricing({
          amazonPrice: bestAlt.price,
          usaShipping: bestAlt.domestic_shipping
        });

        const newRealCost = pricingAlt.realCost;
        const currentSalePrice = product.financials.current_sale_price_usd;
        const newProfit = Number((currentSalePrice - newRealCost).toFixed(2));
        const newMargin = currentSalePrice > 0 ? Number(((newProfit / currentSalePrice) * 100).toFixed(2)) : 0;

        updatedProduct = {
          ...product,
          selected_source_id: bestAlt.id,
          best_source_id: bestAlt.id,
          financials: {
            ...product.financials,
            origin_price_usd: bestAlt.price,
            usa_shipping_usd: bestAlt.domestic_shipping,
            real_cost_puesto_usd: newRealCost,
            profit_usd: newProfit,
            margin_percent: newMargin,
            profit_protection_status: newProfit <= 0 ? 'BLOCKED' : (newMargin < 15 ? 'WARNING' : 'PASS')
          }
        };

        newStatus = 'SOURCE_CHANGED';
        actionTaken = 'SOURCE_SWITCHED';

        await auditService.logAuditEntry({
          product_id: product.canonical_sku,
          opportunity_id: product.id,
          action: 'SWITCH_SOURCE',
          previous_state: targetOffer.source,
          new_state: bestAlt.source,
          reason: `Cambio de fuente por agotamiento de stock en ${targetOffer.source}. Nueva fuente: ${bestAlt.source}.`,
          source_name: bestAlt.source,
          source_price: bestAlt.price,
          landed_cost: newRealCost,
          selling_price: currentSalePrice,
          margin: newMargin,
          actor: 'AUTOPILOT',
          mode: settings.mode,
          result: 'SUCCESS'
        });
      } else {
        // No alternative source available -> PAUSE PUBLICATION to prevent selling without stock
        details.push('No existen fuentes alternativas válidas. Pausando publicación por falta de stock.');
        newStatus = 'PAUSED';
        actionTaken = 'PUBLICATION_PAUSED';

        await auditService.logAuditEntry({
          product_id: product.canonical_sku,
          opportunity_id: product.id,
          action: 'PAUSE_PRODUCT',
          previous_state: 'ACTIVE',
          new_state: 'PAUSED',
          reason: `Publicación pausada automáticamente: ${targetOffer.source} sin stock y sin alternativas.`,
          actor: 'AUTOPILOT',
          mode: settings.mode,
          result: 'SUCCESS'
        });
      }

      return {
        productId: product.id,
        previousStatus,
        newStatus,
        actionTaken,
        details,
        updatedProduct
      };
    }

    // 2. Price Change & Loss Protection Check
    const newPrice = targetOffer.price;
    const oldPrice = currentOffer.price;

    if (newPrice !== oldPrice) {
      details.push(`Precio en origen cambió: $${oldPrice} -> $${newPrice} USD.`);

      const pricingNew = calculateInternationalPricing({
        amazonPrice: newPrice,
        usaShipping: targetOffer.domestic_shipping
      });

      const newRealCost = pricingNew.realCost;
      const currentSalePrice = product.financials.current_sale_price_usd;
      const newProfit = Number((currentSalePrice - newRealCost).toFixed(2));
      const newMargin = currentSalePrice > 0 ? Number(((newProfit / currentSalePrice) * 100).toFixed(2)) : 0;

      // LOSS PROTECTION RULE: If new margin is <= 0 or profit is negative
      if (newProfit <= 0 || newMargin < 5) {
        details.push(`PROTECCIÓN CONTRA PÉRDIDAS DISPARADA: Margen (${newMargin}%) o utilidad ($${newProfit} USD) insostenible. Pausando publicación.`);
        newStatus = 'PAUSED';
        actionTaken = 'PAUSE_PREVENTED_LOSS';

        updatedProduct = {
          ...product,
          financials: {
            ...product.financials,
            origin_price_usd: newPrice,
            real_cost_puesto_usd: newRealCost,
            profit_usd: newProfit,
            margin_percent: newMargin,
            profit_protection_status: 'BLOCKED'
          }
        };

        await auditService.logAuditEntry({
          product_id: product.canonical_sku,
          opportunity_id: product.id,
          action: 'PAUSE_PRODUCT_LOSS_PROTECTION',
          previous_state: 'ACTIVE',
          new_state: 'PAUSED',
          reason: `Protección contra pérdidas: Aumento en origen ($${oldPrice} -> $${newPrice}) destruyó el margen (${newMargin}%).`,
          source_name: targetOffer.source,
          source_price: newPrice,
          landed_cost: newRealCost,
          selling_price: currentSalePrice,
          margin: newMargin,
          actor: 'AUTOPILOT',
          mode: settings.mode,
          result: 'SUCCESS'
        });
      } else {
        // Price update required to maintain standard margin
        const suggestedSalePrice = pricingNew.finalPrice;
        details.push(`Actualizando precio de venta sugerido: $${currentSalePrice} -> $${suggestedSalePrice} USD.`);
        newStatus = 'PRICE_CHANGED';
        actionTaken = 'PRICE_UPDATED';

        updatedProduct = {
          ...product,
          financials: {
            ...product.financials,
            origin_price_usd: newPrice,
            real_cost_puesto_usd: newRealCost,
            suggested_sale_price_usd: suggestedSalePrice,
            current_sale_price_usd: suggestedSalePrice,
            profit_usd: Number((suggestedSalePrice - newRealCost).toFixed(2)),
            margin_percent: Number((((suggestedSalePrice - newRealCost) / suggestedSalePrice) * 100).toFixed(2)),
            profit_protection_status: 'PASS'
          }
        };

        await auditService.logAuditEntry({
          product_id: product.canonical_sku,
          opportunity_id: product.id,
          action: 'UPDATE_PRICE',
          previous_state: `$${currentSalePrice}`,
          new_state: `$${suggestedSalePrice}`,
          reason: `Actualización de precio por cambio en origen ($${oldPrice} -> $${newPrice}).`,
          source_name: targetOffer.source,
          source_price: newPrice,
          landed_cost: newRealCost,
          selling_price: suggestedSalePrice,
          margin: updatedProduct.financials.margin_percent,
          actor: 'AUTOPILOT',
          mode: settings.mode,
          result: 'SUCCESS'
        });
      }
    }

    return {
      productId: product.id,
      previousStatus,
      newStatus,
      actionTaken,
      details,
      updatedProduct
    };
  }
}

export const autopilotReconciliationEngine = new AutopilotReconciliationEngine();

import type { NormalizedProduct, SourceOffer } from '../../../types/sourcing';
import type { 
  AutopilotSettings, 
  FinancialLimits, 
  AutopilotAuditEntry 
} from '../../../types/sourcingAutopilot';
import { auditService } from './auditService';
import { supabase } from '../../../lib/supabase';

export interface PurchaseValidationResult {
  authorized: boolean;
  blockReason?: string;
  code?: 'APPROVED' | 'LIVE_CHECK_FAILED' | 'PRICE_DRIFT' | 'FINANCIAL_LIMIT_EXCEEDED' | 'NOT_CONFIGURED' | 'DISABLED';
  expectedPrice: number;
  livePrice?: number;
  driftPercent?: number;
  financialLimitsStatus?: {
    singleOk: boolean;
    dailyOk: boolean;
    weeklyOk: boolean;
    monthlyOk: boolean;
  };
}

export class AutopilotPurchasingEngine {
  /**
   * Performs Live Purchase Check, Price Drift Protection & Financial Limit Checks before authorizing a purchase.
   */
  async validatePurchaseRequest(
    product: NormalizedProduct,
    expectedPriceUsd: number,
    settings: AutopilotSettings,
    limits: FinancialLimits,
    liveOfferFetcher?: () => Promise<SourceOffer | null>
  ): Promise<PurchaseValidationResult> {
    const activeOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];

    // 1. Auto-Purchase Toggle Check
    if (!settings.auto_purchase) {
      return {
        authorized: false,
        code: 'DISABLED',
        blockReason: 'Compra automática deshabilitada en la configuración de Autopilot.',
        expectedPrice: expectedPriceUsd
      };
    }

    // 2. Mandatory Live Check on Real Listing
    let liveOffer: SourceOffer | null = null;
    if (liveOfferFetcher) {
      try {
        liveOffer = await liveOfferFetcher();
      } catch (err: any) {
        return {
          authorized: false,
          code: 'LIVE_CHECK_FAILED',
          blockReason: `Falló el Live Check en tiempo real sobre el retailer origen: ${err.message}`,
          expectedPrice: expectedPriceUsd
        };
      }
    } else {
      liveOffer = activeOffer;
    }

    if (!liveOffer) {
      return {
        authorized: false,
        code: 'LIVE_CHECK_FAILED',
        blockReason: 'No se pudo obtener información del listing en tiempo real para verificar el producto.',
        expectedPrice: expectedPriceUsd
      };
    }

    // 3. Price Drift Protection
    const livePrice = liveOffer.price;
    const driftAmount = livePrice - expectedPriceUsd;
    const driftPercent = expectedPriceUsd > 0 ? Number(((driftAmount / expectedPriceUsd) * 100).toFixed(2)) : 0;
    const maxAllowedDrift = 5.0; // 5% max tolerance

    if (driftPercent > maxAllowedDrift) {
      const blockReason = `PRICE DRIFT DETECTADO: El precio en origen aumentó un ${driftPercent}% ($${expectedPriceUsd} -> $${livePrice} USD), superando la tolerancia permitida (${maxAllowedDrift}%).`;
      
      await auditService.logAuditEntry({
        product_id: product.canonical_sku,
        opportunity_id: product.id,
        action: 'PURCHASE_BLOCKED_PRICE_DRIFT',
        previous_state: `$${expectedPriceUsd}`,
        new_state: `$${livePrice}`,
        reason: blockReason,
        source_name: liveOffer.source,
        source_price: livePrice,
        actor: 'AUTOPILOT',
        mode: settings.mode,
        result: 'BLOCKED',
        error_message: blockReason
      });

      await auditService.createAlert({
        priority: 'WARNING',
        title: 'Compra Bloqueada por Price Drift',
        message: blockReason,
        code: 'PURCHASE_BLOCKED_PRICE_DRIFT',
        payload: { product_id: product.canonical_sku, expectedPriceUsd, livePrice, driftPercent }
      });

      return {
        authorized: false,
        code: 'PRICE_DRIFT',
        blockReason,
        expectedPrice: expectedPriceUsd,
        livePrice,
        driftPercent
      };
    }

    // 4. Financial Limiters Check
    const singleOk = livePrice <= limits.max_single_purchase_usd;
    const dailyOk = (limits.current_daily_expenditure_usd + livePrice) <= limits.max_daily_expenditure_usd;
    const weeklyOk = (limits.current_weekly_expenditure_usd + livePrice) <= limits.max_weekly_expenditure_usd;
    const monthlyOk = (limits.current_monthly_expenditure_usd + livePrice) <= limits.max_monthly_expenditure_usd;

    if (!singleOk || !dailyOk || !weeklyOk || !monthlyOk) {
      let limitReason = 'LÍMITE FINANCIERO SUPERADO: ';
      if (!singleOk) limitReason += `Compra individual ($${livePrice} USD) supera tope unitario ($${limits.max_single_purchase_usd} USD). `;
      if (!dailyOk) limitReason += `Gasto diario proyectado ($${limits.current_daily_expenditure_usd + livePrice} USD) supera el máximo ($${limits.max_daily_expenditure_usd} USD). `;
      if (!weeklyOk) limitReason += `Gasto semanal proyectado supera el máximo ($${limits.max_weekly_expenditure_usd} USD). `;
      if (!monthlyOk) limitReason += `Gasto mensual proyectado supera el máximo ($${limits.max_monthly_expenditure_usd} USD). `;

      limitReason += 'Requiere aprobación explícita del administrador.';

      await auditService.logAuditEntry({
        product_id: product.canonical_sku,
        opportunity_id: product.id,
        action: 'PURCHASE_BLOCKED_FINANCIAL_LIMIT',
        previous_state: 'PENDING',
        new_state: 'REQUIRES_APPROVAL',
        reason: limitReason,
        source_name: liveOffer.source,
        source_price: livePrice,
        actor: 'AUTOPILOT',
        mode: settings.mode,
        result: 'BLOCKED',
        error_message: limitReason
      });

      await auditService.createAlert({
        priority: 'WARNING',
        title: 'Compra Requiere Aprobación (Límite Financiero)',
        message: limitReason,
        code: 'PURCHASE_REQUIRES_APPROVAL',
        payload: { product_id: product.canonical_sku, livePrice, limits }
      });

      return {
        authorized: false,
        code: 'FINANCIAL_LIMIT_EXCEEDED',
        blockReason: limitReason,
        expectedPrice: expectedPriceUsd,
        livePrice,
        driftPercent,
        financialLimitsStatus: { singleOk, dailyOk, weeklyOk, monthlyOk }
      };
    }

    return {
      authorized: true,
      code: 'APPROVED',
      expectedPrice: expectedPriceUsd,
      livePrice,
      driftPercent,
      financialLimitsStatus: { singleOk: true, dailyOk: true, weeklyOk: true, monthlyOk: true }
    };
  }

  /**
   * Executes or routes purchase to Purchasing Adapter (Zinc / Custom Provider).
   */
  async executePurchaseOrder(
    product: NormalizedProduct,
    livePrice: number
  ): Promise<{ success: boolean; orderId?: string; status: string; message: string }> {
    // Execute purchase order securely via backend Edge Function / Server-side API.
    // ZINC_API_KEY lives exclusively in server environment (Deno.env / Supabase Vault).
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token;

      const response = await fetch('/api/zinc/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          product_id: product.offers[0]?.source_product_id,
          retailer: product.offers[0]?.source || 'amazon',
          max_price: livePrice
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.order_id) {
          return {
            success: true,
            orderId: data.order_id,
            status: 'EXECUTED',
            message: `Orden de compra enviada y confirmada con éxito. ID: ${data.order_id}`
          };
        }
      }
      
      const errBody = await response.json().catch(() => ({}));
      return {
        success: false,
        status: 'ERROR',
        message: `El proveedor rechazó la orden: ${errBody?.message || errBody?.error || 'Sin confirmación de Zinc'}`
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'ERROR',
        message: `No se pudo conectar con el proveedor de compras: ${err.message}`
      };
    }
  }
}

export const autopilotPurchasingEngine = new AutopilotPurchasingEngine();

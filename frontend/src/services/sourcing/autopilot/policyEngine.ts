import type { NormalizedProduct } from '../../../types/sourcing';
import type { 
  AutopilotSettings, 
  AutopilotRule, 
  PolicyEvaluationResult 
} from '../../../types/sourcingAutopilot';

export class AutopilotPolicyEngine {
  /**
   * Evaluates a Normalized Product against active Autopilot Settings and Rules.
   * Returns a deterministic PolicyEvaluationResult with explainability breakdown.
   */
  evaluateProduct(
    product: NormalizedProduct,
    settings: AutopilotSettings,
    rules: AutopilotRule[]
  ): PolicyEvaluationResult {
    const blockedReasons: string[] = [];
    const passedRules: string[] = [];

    const activeOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];
    const sourceName = activeOffer?.source || 'unknown';
    const originPrice = activeOffer?.price || 0;
    const sellerScore = activeOffer?.seller_rating ?? 95;
    const stock = activeOffer?.stock ?? (activeOffer?.availability === 'in_stock' ? 5 : 0);
    const condition = activeOffer?.condition_normalized || (activeOffer?.condition === 'new' ? 'NEW' : 'USED');
    
    const landedCost = product.financials.real_cost_puesto_usd || 0;
    const sellingPrice = product.financials.current_sale_price_usd || 0;
    const margin = product.financials.margin_percent || 0;
    const profit = product.financials.profit_usd || 0;
    const opportunityScore = product.opportunity_score || 50;

    // 1. Find applicable rules in order of specificity: BRAND/CATEGORY > RETAILER > GLOBAL
    const globalRule = rules.find(r => r.scope === 'GLOBAL' && r.is_active);
    const retailerRule = rules.find(r => r.scope === 'RETAILER' && r.identifier.toLowerCase() === sourceName.toLowerCase() && r.is_active);
    const categoryRule = rules.find(r => r.scope === 'CATEGORY' && product.category_name?.toLowerCase().includes(r.identifier.toLowerCase()) && r.is_active);
    const brandRule = rules.find(r => r.scope === 'BRAND' && product.brand?.toLowerCase().includes(r.identifier.toLowerCase()) && r.is_active);

    // Merge rule thresholds (most restrictive rule applies)
    const minMargin = Math.max(
      globalRule?.min_margin_percent ?? 15,
      retailerRule?.min_margin_percent ?? 0,
      categoryRule?.min_margin_percent ?? 0,
      brandRule?.min_margin_percent ?? 0
    );

    const minProfit = Math.max(
      globalRule?.min_profit_usd ?? 2.0,
      retailerRule?.min_profit_usd ?? 0,
      categoryRule?.min_profit_usd ?? 0,
      brandRule?.min_profit_usd ?? 0
    );

    const minScore = Math.max(
      globalRule?.min_opportunity_score ?? 80,
      retailerRule?.min_opportunity_score ?? 0,
      categoryRule?.min_opportunity_score ?? 0,
      brandRule?.min_opportunity_score ?? 0
    );

    const minSellerScore = Math.max(
      globalRule?.min_seller_score ?? 90,
      retailerRule?.min_seller_score ?? 0
    );

    const minStock = Math.max(
      globalRule?.min_stock ?? 1,
      retailerRule?.min_stock ?? 0
    );

    // 2. Strict Rule Evaluations
    // Authenticity Gate Check
    if (product.authenticity.status !== 'VERIFIED_OFFICIAL' && product.authenticity.status !== 'VERIFIED') {
      blockedReasons.push(`Autenticidad no verificada como oficial (Estado: ${product.authenticity.status}).`);
    } else {
      passedRules.push('Authenticity Gate OK');
    }

    // Profit Protection Check
    if (profit <= 0) {
      blockedReasons.push(`Profit Protection: Margen negativo o cero ($${profit} USD).`);
    } else if (margin < minMargin) {
      blockedReasons.push(`Margen insuficiente: ${margin}% (Requerido: ${minMargin}%).`);
    } else {
      passedRules.push(`Margen OK (${margin}% >= ${minMargin}%)`);
    }

    if (profit < minProfit) {
      blockedReasons.push(`Ganancia en USD insuficiente: $${profit} USD (Mínimo requerido: $${minProfit} USD).`);
    } else {
      passedRules.push(`Ganancia USD OK ($${profit} >= $${minProfit})`);
    }

    // Opportunity Score Check
    if (opportunityScore < minScore) {
      blockedReasons.push(`Opportunity Score bajo: ${opportunityScore} pts (Mínimo requerido: ${minScore} pts).`);
    } else {
      passedRules.push(`Opportunity Score OK (${opportunityScore} >= ${minScore})`);
    }

    // Seller Score Check
    if (sellerScore < minSellerScore) {
      blockedReasons.push(`Seller score de ${sourceName} insuficiente: ${sellerScore}% (Mínimo: ${minSellerScore}%).`);
    } else {
      passedRules.push(`Seller Score OK (${sellerScore}% >= ${minSellerScore}%)`);
    }

    // Stock Check
    if (stock < minStock && activeOffer?.availability !== 'preorder') {
      blockedReasons.push(`Stock en origen insuficiente: ${stock} unidades (Mínimo: ${minStock}).`);
    } else {
      passedRules.push(`Stock OK (${stock} unidades)`);
    }

    // Condition Safety Check
    if (condition === 'USED' && (categoryRule?.requires_manual_review || product.product_type === 'PREORDER')) {
      blockedReasons.push(`Condición USADO requiere revisión manual previa.`);
    }

    // 3. Determine Analytical Decision
    let decision: 'PUBLICAR' | 'COMPRAR' | 'VIGILAR' | 'DESCARTAR';
    const isViable = blockedReasons.length === 0;

    if (isViable) {
      if (product.catalog_status === 'ALREADY_IN_CATALOG') {
        decision = 'VIGILAR';
      } else {
        decision = 'PUBLICAR';
      }
    } else if (opportunityScore >= 70 && margin >= 8) {
      decision = 'VIGILAR';
    } else {
      decision = 'DESCARTAR';
    }

    // 4. Map Decision & Autopilot Settings to Execution Mode
    let executionMode: 'AUTO_EXECUTE' | 'REQUIRES_APPROVAL' | 'RECOMMENDATION_ONLY' | 'OFF_LOG_ONLY';

    if (settings.mode === 'OFF' || settings.is_kill_switch_active) {
      executionMode = 'OFF_LOG_ONLY';
    } else if (settings.mode === 'RECOMMENDATION') {
      executionMode = 'RECOMMENDATION_ONLY';
    } else if (settings.mode === 'SEMIAUTOMATIC') {
      executionMode = 'REQUIRES_APPROVAL';
    } else if (settings.mode === 'AUTOPILOT') {
      if (decision === 'PUBLICAR' && !settings.auto_publish) {
        executionMode = 'REQUIRES_APPROVAL';
      } else if (decision === 'COMPRAR' && !settings.auto_purchase) {
        executionMode = 'REQUIRES_APPROVAL';
      } else if (!isViable) {
        executionMode = 'RECOMMENDATION_ONLY';
      } else {
        executionMode = 'AUTO_EXECUTE';
      }
    } else {
      executionMode = 'RECOMMENDATION_ONLY';
    }

    // 5. Explainability Breakdown
    const mlListings = product.uruguay_market.total_listings || 0;
    const isCompetitive = product.uruguay_market.market_position === 'CHEAPER' || product.uruguay_market.market_position === 'SIMILAR';

    return {
      isViable,
      decision,
      blockedReasons,
      passedRules,
      explainability: {
        opportunityScore,
        expectedMargin: margin,
        expectedProfit: profit,
        mlCompetitorsCount: mlListings,
        isCompetitivePrice: isCompetitive,
        sourceStock: stock,
        sellerScore,
        trendScore: Math.min(100, opportunityScore + 5),
        reasonsSummary: isViable 
          ? [
              `Opportunity Score alto (${opportunityScore}/100)`,
              `Margen esperado (${margin}%) por encima del mínimo (${minMargin}%)`,
              `Ganancia estimada: $${profit.toFixed(2)} USD`,
              `Vendedor ${sourceName} confiable (${sellerScore}%)`,
              `Stock fuente disponible (${stock} un.)`
            ]
          : blockedReasons
      },
      executionMode
    };
  }
}

export const autopilotPolicyEngine = new AutopilotPolicyEngine();

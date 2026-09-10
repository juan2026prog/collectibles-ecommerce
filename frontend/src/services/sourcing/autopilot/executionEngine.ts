import type { NormalizedProduct } from '../../../types/sourcing';
import type { 
  AutopilotSettings, 
  AutopilotRule, 
  PolicyEvaluationResult, 
  DryRunReport, 
  ShadowModeRecord,
  ActionType
} from '../../../types/sourcingAutopilot';
import { autopilotPolicyEngine } from './policyEngine';
import { actionQueueManager } from './actionQueue';
import { auditService } from './auditService';
import { sourcingService } from '../sourcingService';

export class AutopilotExecutionEngine {
  /**
   * Evaluates a product and determines execution workflow based on active mode & rules.
   */
  async processProductExecution(
    product: NormalizedProduct,
    settings: AutopilotSettings,
    rules: AutopilotRule[],
    actor: 'USER' | 'ADMIN' | 'AUTOPILOT' | 'SYSTEM' = 'AUTOPILOT'
  ): Promise<{
    evaluation: PolicyEvaluationResult;
    executedAction: string;
    queueItemId?: string;
    message: string;
  }> {
    const evaluation = autopilotPolicyEngine.evaluateProduct(product, settings, rules);
    const activeOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];

    // If Kill Switch is active or mode is OFF
    if (settings.is_kill_switch_active || settings.mode === 'OFF') {
      await auditService.logAuditEntry({
        product_id: product.canonical_sku,
        opportunity_id: product.id,
        action: 'EVALUATION_OFF',
        previous_state: product.catalog_status,
        new_state: product.catalog_status,
        reason: settings.is_kill_switch_active ? 'Kill Switch ACTIVO: Ejecución suspendida.' : 'Autopilot OFF: Solamente análisis.',
        source_name: activeOffer?.source,
        source_price: activeOffer?.price,
        landed_cost: product.financials.real_cost_puesto_usd,
        selling_price: product.financials.current_sale_price_usd,
        margin: product.financials.margin_percent,
        confidence: product.uruguay_market.match_confidence,
        actor,
        mode: settings.mode,
        result: 'SKIPPED'
      });

      return {
        evaluation,
        executedAction: 'NO_ACTION_OFF',
        message: 'Autopilot está DESACTIVADO. No se ejecutó ninguna acción.'
      };
    }

    // Recommendation Mode
    if (settings.mode === 'RECOMMENDATION') {
      await auditService.logAuditEntry({
        product_id: product.canonical_sku,
        opportunity_id: product.id,
        action: `RECOMMENDATION_${evaluation.decision}`,
        previous_state: product.catalog_status,
        new_state: product.catalog_status,
        reason: `Recomendación generada: ${evaluation.decision}. ${evaluation.explainability.reasonsSummary.join(' | ')}`,
        source_name: activeOffer?.source,
        source_price: activeOffer?.price,
        landed_cost: product.financials.real_cost_puesto_usd,
        selling_price: product.financials.current_sale_price_usd,
        margin: product.financials.margin_percent,
        confidence: product.uruguay_market.match_confidence,
        actor,
        mode: settings.mode,
        result: 'SUCCESS'
      });

      return {
        evaluation,
        executedAction: `RECOMMENDED_${evaluation.decision}`,
        message: `Modo RECOMENDACIÓN: Sugerido ${evaluation.decision}.`
      };
    }

    // Semiautomatic Mode: Enqueue as REQUIRES_APPROVAL
    if (settings.mode === 'SEMIAUTOMATIC' || evaluation.executionMode === 'REQUIRES_APPROVAL') {
      const actionType: ActionType = evaluation.decision === 'PUBLICAR' ? 'PUBLISH_PRODUCT' : (evaluation.decision === 'COMPRAR' ? 'PURCHASE_PRODUCT' : 'REVIEW_PRODUCT');
      const idempotencyKey = `semiauto_${product.canonical_sku}_${actionType}_${Date.now()}`;

      const queueItem = await actionQueueManager.enqueueAction({
        action_type: actionType,
        canonical_sku: product.canonical_sku,
        product_id: product.id,
        payload: {
          product,
          evaluation
        },
        idempotency_key: idempotencyKey,
        status: 'REQUIRES_APPROVAL'
      });

      await auditService.logAuditEntry({
        product_id: product.canonical_sku,
        opportunity_id: product.id,
        action: `ENQUEUE_APPROVAL_${actionType}`,
        previous_state: product.catalog_status,
        new_state: 'PENDING_APPROVAL',
        reason: `Semiautomatic Mode: Acción ${actionType} requiere aprobación del administrador.`,
        source_name: activeOffer?.source,
        source_price: activeOffer?.price,
        landed_cost: product.financials.real_cost_puesto_usd,
        selling_price: product.financials.current_sale_price_usd,
        margin: product.financials.margin_percent,
        actor,
        mode: settings.mode,
        result: 'SUCCESS'
      });

      return {
        evaluation,
        executedAction: 'QUEUED_FOR_APPROVAL',
        queueItemId: queueItem.id,
        message: `Acción ${actionType} requiere aprobación administrativa.`
      };
    }

    // Autopilot Mode: Auto-execute authorized action
    if (settings.mode === 'AUTOPILOT' && evaluation.executionMode === 'AUTO_EXECUTE') {
      if (evaluation.decision === 'PUBLICAR' && settings.auto_publish) {
        // Execute publish via sourcing service
        const importRes = await sourcingService.importProductsToCatalog([product]);

        if (importRes.success) {
          await auditService.logAuditEntry({
            product_id: product.canonical_sku,
            opportunity_id: product.id,
            action: 'AUTO_PUBLISHED',
            previous_state: product.catalog_status,
            new_state: 'PUBLISHED',
            reason: `Autopilot auto-publicó el producto. Opportunity Score: ${product.opportunity_score}, Margen: ${product.financials.margin_percent}%.`,
            source_name: activeOffer?.source,
            source_price: activeOffer?.price,
            landed_cost: product.financials.real_cost_puesto_usd,
            selling_price: product.financials.current_sale_price_usd,
            margin: product.financials.margin_percent,
            actor,
            mode: settings.mode,
            result: 'SUCCESS'
          });

          return {
            evaluation,
            executedAction: 'AUTO_PUBLISHED',
            message: `Producto "${product.title}" publicado automáticamente por Autopilot.`
          };
        } else {
          await auditService.logAuditEntry({
            product_id: product.canonical_sku,
            opportunity_id: product.id,
            action: 'AUTO_PUBLISH_FAILED',
            previous_state: product.catalog_status,
            new_state: 'ERROR',
            reason: importRes.errors.join('; '),
            actor,
            mode: settings.mode,
            result: 'FAILED',
            error_message: importRes.errors.join('; ')
          });

          return {
            evaluation,
            executedAction: 'AUTO_PUBLISH_FAILED',
            message: `Falló la publicación automática: ${importRes.errors.join('; ')}`
          };
        }
      }
    }

    return {
      evaluation,
      executedAction: 'EVALUATED_NO_EXEC',
      message: `Producto evaluado. Decisión: ${evaluation.decision}.`
    };
  }

  /**
   * Executes DRY RUN: Simulates entire evaluation workflow without performing external mutations.
   */
  async runDryRun(
    products: NormalizedProduct[],
    settings: AutopilotSettings,
    rules: AutopilotRule[]
  ): Promise<DryRunReport> {
    const candidates: DryRunReport['candidates'] = [];
    let discoveredCount = products.length;
    let discardedCount = 0;
    let watchedCount = 0;
    let publishedCount = 0;
    let approvalRequiredCount = 0;
    let estimatedAutoPurchaseUsd = 0;

    for (const product of products) {
      const evaluation = autopilotPolicyEngine.evaluateProduct(product, settings, rules);
      const activeOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];

      if (evaluation.decision === 'DESCARTAR') {
        discardedCount++;
      } else if (evaluation.decision === 'VIGILAR') {
        watchedCount++;
      } else if (evaluation.decision === 'PUBLICAR') {
        if (settings.auto_publish) {
          publishedCount++;
        } else {
          approvalRequiredCount++;
        }
      } else if (evaluation.decision === 'COMPRAR') {
        if (settings.auto_purchase) {
          estimatedAutoPurchaseUsd += activeOffer?.price || 0;
        } else {
          approvalRequiredCount++;
        }
      }

      candidates.push({
        productTitle: product.title,
        decision: evaluation.decision,
        action: evaluation.executionMode,
        reason: evaluation.explainability.reasonsSummary.join(' | ')
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      discoveredCount,
      discardedCount,
      watchedCount,
      publishedCount,
      approvalRequiredCount,
      estimatedAutoPurchaseUsd: Number(estimatedAutoPurchaseUsd.toFixed(2)),
      candidates
    };
  }

  /**
   * Executes SHADOW MODE: Logs proposed actions to shadow records without external execution.
   */
  async runShadowMode(
    product: NormalizedProduct,
    settings: AutopilotSettings,
    rules: AutopilotRule[]
  ): Promise<ShadowModeRecord> {
    const evaluation = autopilotPolicyEngine.evaluateProduct(product, settings, rules);
    const actionType: ActionType = evaluation.decision === 'PUBLICAR' ? 'PUBLISH_PRODUCT' : (evaluation.decision === 'COMPRAR' ? 'PURCHASE_PRODUCT' : 'REVIEW_PRODUCT');

    const record: ShadowModeRecord = {
      id: `shadow_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      canonicalSku: product.canonical_sku,
      productTitle: product.title,
      proposedAction: actionType,
      reason: evaluation.explainability.reasonsSummary.join(' | '),
      expectedOutcome: `Decisión: ${evaluation.decision}. Modo: ${evaluation.executionMode}.`,
      modeAtTime: settings.mode
    };

    await auditService.logAuditEntry({
      product_id: product.canonical_sku,
      opportunity_id: product.id,
      action: `SHADOW_PROPOSED_${actionType}`,
      previous_state: product.catalog_status,
      new_state: 'SHADOW_EVALUATED',
      reason: `[SHADOW MODE] Acción propuesta: ${actionType}. ${record.reason}`,
      source_name: product.offers[0]?.source,
      source_price: product.offers[0]?.price,
      landed_cost: product.financials.real_cost_puesto_usd,
      selling_price: product.financials.current_sale_price_usd,
      margin: product.financials.margin_percent,
      actor: 'AUTOPILOT',
      mode: settings.mode,
      result: 'SUCCESS',
      metadata: { shadow_record: record }
    });

    return record;
  }
}

export const autopilotExecutionEngine = new AutopilotExecutionEngine();

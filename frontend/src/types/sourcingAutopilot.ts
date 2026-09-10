/**
 * SOURCING INTELLIGENCE FASE 5 — AUTOPILOT TYPES
 * Collectibles.uy / Collectibles2026
 */

export type AutopilotMode = 
  | 'OFF'
  | 'RECOMMENDATION'
  | 'SEMIAUTOMATIC'
  | 'AUTOPILOT';

export type AutopilotVisualStatus = 
  | 'OFF'
  | 'ACTIVE'
  | 'SUSPENDED';

export interface AutopilotSettings {
  id: string;
  mode: AutopilotMode;
  visual_status: AutopilotVisualStatus;
  discover_products: boolean;
  evaluate_opportunities: boolean;
  prepare_publications: boolean;
  auto_publish: boolean;
  auto_update_prices: boolean;
  auto_update_stock: boolean;
  auto_pause_publications: boolean;
  auto_reactivate_publications: boolean;
  auto_purchase: boolean;
  send_to_import_hub: boolean;
  is_kill_switch_active: boolean;
  updated_at: string;
}

export type RuleScope = 
  | 'GLOBAL'
  | 'RETAILER'
  | 'CATEGORY'
  | 'BRAND'
  | 'CONDITION';

export interface AutopilotRule {
  id: string;
  scope: RuleScope;
  identifier: string; // 'all', 'amazon', 'ebay', 'bestbuy', 'figures', etc.
  is_active: boolean;
  min_margin_percent: number;
  min_profit_usd: number;
  max_purchase_cost_usd: number;
  max_origin_price_usd: number;
  min_stock: number;
  min_seller_score: number;
  min_confidence_score: number;
  min_opportunity_score: number;
  max_active_publications: number;
  max_price_drift_percent: number;
  auto_purchase_enabled: boolean;
  requires_manual_review: boolean;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export type ActionType = 
  | 'PUBLISH_PRODUCT'
  | 'UPDATE_PRICE'
  | 'PAUSE_PRODUCT'
  | 'REACTIVATE_PRODUCT'
  | 'SWITCH_SOURCE'
  | 'PURCHASE_PRODUCT'
  | 'REVIEW_PRODUCT';

export type QueueStatus = 
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'CANCELLED'
  | 'REQUIRES_APPROVAL';

export interface AutopilotQueueItem {
  id: string;
  action_type: ActionType;
  status: QueueStatus;
  canonical_sku: string;
  product_id?: string;
  publication_id?: string;
  payload: Record<string, any>;
  idempotency_key: string;
  locked_at?: string;
  locked_by?: string;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  result?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type AuditActor = 'USER' | 'ADMIN' | 'AUTOPILOT' | 'SYSTEM';

export interface AutopilotAuditEntry {
  id: string;
  timestamp: string;
  country_code?: string;
  product_id?: string;
  opportunity_id?: string;
  publication_id?: string;
  order_id?: string;
  action: string;
  previous_state?: string;
  new_state?: string;
  reason: string;
  rule_applied?: string;
  source_name?: string;
  source_price?: number;
  landed_cost?: number;
  selling_price?: number;
  margin?: number;
  confidence?: number;
  actor: AuditActor;
  mode: AutopilotMode;
  result: 'SUCCESS' | 'BLOCKED' | 'ERROR' | 'FAILED' | 'SKIPPED';
  error_message?: string;
  metadata?: Record<string, any>;
}

export type AlertPriority = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AutopilotAlert {
  id: string;
  priority: AlertPriority;
  title: string;
  message: string;
  code: string;
  payload?: Record<string, any>;
  is_read: boolean;
  resolved_at?: string;
  created_at: string;
}

export interface FinancialLimits {
  id: string;
  max_single_purchase_usd: number;
  max_daily_expenditure_usd: number;
  max_weekly_expenditure_usd: number;
  max_monthly_expenditure_usd: number;
  current_daily_expenditure_usd: number;
  current_weekly_expenditure_usd: number;
  current_monthly_expenditure_usd: number;
  max_concurrent_orders: number;
  max_units_per_product: number;
  last_reset_date?: string;
}

export interface PublicationCandidate {
  canonicalProductId: string;
  sourceListingId: string;
  countryCode?: string;
  title: string;
  brand: string;
  manufacturer?: string;
  gtin?: string;
  ean?: string;
  upc?: string;
  mpn?: string;
  category: string;
  images: string[];
  description?: string;
  attributes?: Record<string, any>;
  sourcePrice: number;
  landedCost: number;
  sellingPrice: number;
  expectedMargin: number;
  expectedProfit: number;
  availability: string;
  source: string;
  confidence: number;
  opportunityScore: number;
}

export interface PolicyEvaluationResult {
  isViable: boolean;
  decision: 'PUBLICAR' | 'COMPRAR' | 'VIGILAR' | 'DESCARTAR';
  blockedReasons: string[];
  passedRules: string[];
  explainability: {
    opportunityScore: number;
    expectedMargin: number;
    expectedProfit: number;
    mlCompetitorsCount?: number;
    isCompetitivePrice?: boolean;
    sourceStock?: number;
    sellerScore?: number;
    trendScore?: number;
    reasonsSummary: string[];
  };
  executionMode: 'AUTO_EXECUTE' | 'REQUIRES_APPROVAL' | 'RECOMMENDATION_ONLY' | 'OFF_LOG_ONLY';
}

export interface DryRunReport {
  generatedAt: string;
  discoveredCount: number;
  discardedCount: number;
  watchedCount: number;
  publishedCount: number;
  approvalRequiredCount: number;
  estimatedAutoPurchaseUsd: number;
  candidates: {
    productTitle: string;
    decision: string;
    action: string;
    reason: string;
  }[];
}

export interface ShadowModeRecord {
  id: string;
  timestamp: string;
  canonicalSku: string;
  productTitle: string;
  proposedAction: ActionType;
  reason: string;
  expectedOutcome: string;
  modeAtTime: AutopilotMode;
}

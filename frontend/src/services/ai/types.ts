// ============================================================
// AI INFRASTRUCTURE TYPES — PHASE 2 HARDENING & TELEMETRY
// ============================================================

export type AIEngineKey = 
  | 'AI_SEARCH'
  | 'PRODUCT_DISCOVERY'
  | 'TREND_ANALYSIS'
  | 'PRODUCT_CURATION'
  | 'COUNTRY_INTELLIGENCE'
  | 'RADAR_INTELLIGENCE'
  | 'RELEASE_INTELLIGENCE'
  | 'RESEARCH_INTELLIGENCE';

export type AICountryCode = 'UY' | 'AR' | 'CL' | 'PE' | 'MX' | 'EC';

export type AIProviderKey = 'NONE' | 'OPENAI';

export type AICircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type AIExecutionStatus = 
  | 'AI_DISABLED'
  | 'COUNTRY_DISABLED'
  | 'ENGINE_DISABLED'
  | 'BUDGET_EXCEEDED'
  | 'CIRCUIT_OPEN'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'OPENAI_ERROR'
  | 'INVALID_OUTPUT'
  | 'MODEL_NOT_ALLOWED'
  | 'SUCCESS'
  | 'FALLBACK';

export interface AIPricingInfo {
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_cost_usd: number | null;
  output_cost_usd: number | null;
  estimated_cost_usd: number | null;
  pricing_status: 'PRICED' | 'UNKNOWN_PRICING';
  pricing_source?: string;
}

export interface AIUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AISystemConfig {
  id: string;
  global_enabled: boolean;
  provider: AIProviderKey;
  environment: string;
  default_timeout_ms: number;
  daily_budget_usd: number;
  monthly_budget_usd: number;
  circuit_breaker_enabled: boolean;
  circuit_breaker_state: AICircuitBreakerState;
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
}

export interface AIEngineConfig {
  id: string;
  engine_key: AIEngineKey;
  name: string;
  description?: string | null;
  enabled: boolean;
  provider: AIProviderKey;
  model: string;
  temperature: number;
  max_input_tokens: number;
  max_output_tokens: number;
  daily_request_limit: number;
  daily_budget_usd: number;
  monthly_budget_usd: number;
  timeout_ms: number;
  fallback_enabled: boolean;
  country_scope: string[];
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
}

export interface AICountryConfig {
  id: string;
  country_code: AICountryCode;
  country_name: string;
  ai_enabled: boolean;
  ai_search_enabled: boolean;
  product_discovery_enabled: boolean;
  trend_analysis_enabled: boolean;
  product_curation_enabled: boolean;
  country_intelligence_enabled: boolean;
  radar_intelligence_enabled: boolean;
  release_intelligence_enabled: boolean;
  daily_budget_usd: number;
  monthly_budget_usd: number;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PAUSED';
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
}

export interface AIUsageEvent {
  id: string;
  created_at: string;
  engine: AIEngineKey;
  country_code: string;
  provider: string;
  model: string;
  request_id: string;
  user_id?: string | null;
  session_id?: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  status: string;
  error_code?: string | null;
  fallback_used: boolean;
  metadata?: Record<string, any>;
}

export interface AIErrorEvent {
  id: string;
  created_at: string;
  engine: string;
  country_code: string;
  provider: string;
  model: string;
  error_type: string;
  error_code?: string | null;
  safe_message: string;
  latency_ms: number;
  request_id: string;
  metadata?: Record<string, any>;
}

export interface AIAuditLog {
  id: string;
  created_at: string;
  actor_id?: string | null;
  actor_email?: string | null;
  action: string;
  engine?: string | null;
  country_code?: string | null;
  old_value?: any;
  new_value?: any;
  metadata?: Record<string, any>;
}

export interface AIDashboardSummary {
  global_enabled: boolean;
  provider: string;
  environment: string;
  circuit_breaker_state: AICircuitBreakerState;
  requests_today: number;
  requests_month: number;
  cost_today_usd: number;
  cost_month_usd: number;
  errors_today: number;
  avg_latency_ms: number;
  last_activity: string | null;
}

export interface AIExecuteOptions<T = any> {
  engine: AIEngineKey;
  country?: AICountryCode;
  operation: string;
  payload?: any;
  context?: Record<string, any>;
  prompt?: string;
  systemPrompt?: string;
  fallbackHandler?: () => Promise<T> | T;
}

export interface AIExecuteResponse<T = any> {
  success: boolean;
  status: AIExecutionStatus;
  provider: string | null;
  model: string | null;
  data?: T;
  text?: string;
  sources?: any[];
  fallback_executed?: boolean;
  error?: string;
  latency_ms?: number;
  usage?: AIUsageInfo;
  pricing?: AIPricingInfo;
  request_id?: string;
  response_id?: string;
}

export interface AITestResult {
  ok: boolean;
  certified?: boolean;
  response?: string;
  expectedResponse?: string;
  provider?: string;
  model?: string;
  usage?: AIUsageInfo;
  pricing?: AIPricingInfo;
  latencyMs?: number;
  requestId?: string;
  responseId?: string;
  timestamp?: string;
  error?: string;
  errorType?: string;
}

export interface AIModelPricingDetail {
  model: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
  currency: string;
  unit: string;
  source: string;
  verified_at: string;
  age_days: number;
  max_age_days: number;
  status: 'VERIFIED' | 'STALE' | 'UNKNOWN';
}

export interface AIModelCapabilityInfo {
  id: string;
  display_name: string;
  badge: string;
  description: string;
  enabled: boolean;
  allowed: boolean;
  web_search: boolean;
  research_intelligence: boolean;
  structured_output: boolean;
  incompatible_reason?: string | null;
  pricing: {
    input_per_million: number;
    cached_input_per_million?: number;
    output_per_million: number;
    status: string;
  };
}

export interface AIModelsResponse {
  success: boolean;
  default: string;
  engine: string;
  models: AIModelCapabilityInfo[];
}

export type ResearchDepthMode = 'ECONOMICO' | 'ESTANDAR' | 'PROFUNDO';

export interface AIPreFlightEstimate {
  success: boolean;
  model: string;
  display_name?: string;
  requested_model?: string;
  is_manual_override?: boolean;
  fallback_model?: string;
  research_depth: ResearchDepthMode;
  research_depth_label: string;
  product_family?: string;
  product_family_label?: string;
  max_candidates: number;
  estimated_input_tokens: number;
  estimated_input_tokens_min?: number;
  estimated_input_tokens_max?: number;
  max_output_tokens: number;
  estimated_input_cost_usd: number;
  estimated_output_cost_usd: number;
  estimated_total_min_usd: number;
  estimated_total_max_usd: number;
  estimated_total_avg_usd: number;
  web_search_planned: boolean;
  cache: {
    status: 'HIT' | 'HIT_DISCOVERIES' | 'MISS';
    age_seconds: number | null;
    last_researched_at?: string | null;
    cached_items_count?: number;
    cached_model?: string;
    cached_cost_usd?: number;
  };
  requires_confirmation: boolean;
  hard_limit_exceeded: boolean;
  warning_threshold_usd: number;
  cheaper_alternative?: {
    mode: string;
    model: string;
    label?: string;
    estimated_max_cost_usd: number;
    cost_multiplier?: number;
    savings_percent: number;
  } | null;
  pricing_source: string;
  openai_calls_used: number;
}

export interface AIDiagnosticStatus {
  ok: boolean;
  configured: boolean;
  liveTestEnabled: boolean;
  supportedModels: string[];
  pricingDetails?: AIModelPricingDetail[];
  environment?: string;
}



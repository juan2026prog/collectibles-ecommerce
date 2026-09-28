// ============================================================
// AI INFRASTRUCTURE TYPES — PHASE 1
// ============================================================

export type AIEngineKey = 
  | 'AI_SEARCH'
  | 'PRODUCT_DISCOVERY'
  | 'TREND_ANALYSIS'
  | 'PRODUCT_CURATION'
  | 'COUNTRY_INTELLIGENCE'
  | 'RADAR_INTELLIGENCE'
  | 'RELEASE_INTELLIGENCE';

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
  | 'SUCCESS'
  | 'FALLBACK';

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
  fallbackHandler?: () => Promise<T> | T;
}

export interface AIExecuteResponse<T = any> {
  success: boolean;
  status: AIExecutionStatus;
  provider: string | null;
  model: string | null;
  data?: T;
  fallback_executed?: boolean;
  error?: string;
  latency_ms?: number;
}


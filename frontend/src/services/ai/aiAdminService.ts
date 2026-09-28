import { supabase } from '../../lib/supabase';
import type { 
  AISystemConfig, 
  AIEngineConfig, 
  AICountryConfig, 
  AIUsageEvent, 
  AIErrorEvent, 
  AIAuditLog, 
  AIDashboardSummary 
} from './types';

// ============================================================
// AI ADMIN SERVICE — SUPERADMIN EXCLUSIVE
// ============================================================

export class AIAdminService {
  /**
   * Fetches the overall high-level AI dashboard summary
   */
  static async getDashboardSummary(): Promise<AIDashboardSummary> {
    try {
      const { data, error } = await supabase.rpc('get_ai_dashboard_summary');
      if (error) {
        // Fallback calculation directly if RPC fails or permissions fallback
        const { data: systemData } = await supabase
          .from('ai_system_config')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        return {
          global_enabled: systemData?.global_enabled ?? false,
          provider: systemData?.provider ?? 'NONE',
          environment: systemData?.environment ?? 'PRODUCTION',
          circuit_breaker_state: systemData?.circuit_breaker_state ?? 'CLOSED',
          requests_today: 0,
          requests_month: 0,
          cost_today_usd: 0,
          cost_month_usd: 0,
          errors_today: 0,
          avg_latency_ms: 0,
          last_activity: null
        };
      }
      return data as AIDashboardSummary;
    } catch {
      return {
        global_enabled: false,
        provider: 'NONE',
        environment: 'PRODUCTION',
        circuit_breaker_state: 'CLOSED',
        requests_today: 0,
        requests_month: 0,
        cost_today_usd: 0,
        cost_month_usd: 0,
        errors_today: 0,
        avg_latency_ms: 0,
        last_activity: null
      };
    }
  }

  /**
   * Fetches global system configuration
   */
  static async getSystemConfig(): Promise<AISystemConfig | null> {
    const { data, error } = await supabase
      .from('ai_system_config')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as AISystemConfig;
  }

  /**
   * Updates global system configuration & writes audit log
   */
  static async updateSystemConfig(
    updates: Partial<AISystemConfig>, 
    actorEmail?: string
  ): Promise<AISystemConfig> {
    const current = await this.getSystemConfig();

    const { data, error } = await supabase
      .from('ai_system_config')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', current?.id)
      .select()
      .single();

    if (error) throw error;

    // Log audit event
    await this.logAuditEvent({
      action: updates.global_enabled !== undefined 
        ? (updates.global_enabled ? 'AI_GLOBAL_ENABLED' : 'AI_GLOBAL_DISABLED') 
        : 'AI_SYSTEM_CONFIG_UPDATED',
      actor_email: actorEmail,
      old_value: current,
      new_value: data,
      metadata: updates
    });

    return data as AISystemConfig;
  }

  /**
   * Fetches all engine configurations
   */
  static async getEngineConfigs(): Promise<AIEngineConfig[]> {
    const { data, error } = await supabase
      .from('ai_engine_config')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as AIEngineConfig[];
  }

  /**
   * Updates a specific engine configuration & writes audit log
   */
  static async updateEngineConfig(
    id: string, 
    updates: Partial<AIEngineConfig>, 
    actorEmail?: string
  ): Promise<AIEngineConfig> {
    const { data: oldData } = await supabase
      .from('ai_engine_config')
      .select('*')
      .eq('id', id)
      .single();

    const { data, error } = await supabase
      .from('ai_engine_config')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await this.logAuditEvent({
      action: 'AI_ENGINE_CONFIG_UPDATED',
      engine: oldData?.engine_key,
      actor_email: actorEmail,
      old_value: oldData,
      new_value: data,
      metadata: updates
    });

    return data as AIEngineConfig;
  }

  /**
   * Fetches all country configurations
   */
  static async getCountryConfigs(): Promise<AICountryConfig[]> {
    const { data, error } = await supabase
      .from('ai_country_config')
      .select('*')
      .order('country_name', { ascending: true });

    if (error) throw error;
    return (data || []) as AICountryConfig[];
  }

  /**
   * Updates a specific country configuration & writes audit log
   */
  static async updateCountryConfig(
    id: string, 
    updates: Partial<AICountryConfig>, 
    actorEmail?: string
  ): Promise<AICountryConfig> {
    const { data: oldData } = await supabase
      .from('ai_country_config')
      .select('*')
      .eq('id', id)
      .single();

    const { data, error } = await supabase
      .from('ai_country_config')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await this.logAuditEvent({
      action: 'AI_COUNTRY_CONFIG_UPDATED',
      country_code: oldData?.country_code,
      actor_email: actorEmail,
      old_value: oldData,
      new_value: data,
      metadata: updates
    });

    return data as AICountryConfig;
  }

  /**
   * Fetches AI usage events
   */
  static async getUsageEvents(limit: number = 50): Promise<AIUsageEvent[]> {
    const { data, error } = await supabase
      .from('ai_usage_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as AIUsageEvent[];
  }

  /**
   * Fetches AI error events
   */
  static async getErrorEvents(limit: number = 50): Promise<AIErrorEvent[]> {
    const { data, error } = await supabase
      .from('ai_error_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as AIErrorEvent[];
  }

  /**
   * Fetches AI audit logs
   */
  static async getAuditLogs(limit: number = 50): Promise<AIAuditLog[]> {
    const { data, error } = await supabase
      .from('ai_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as AIAuditLog[];
  }

  /**
   * Helper to write audit logs
   */
  private static async logAuditEvent(payload: Partial<AIAuditLog>): Promise<void> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('ai_audit_logs').insert({
        action: payload.action || 'AI_CONFIG_CHANGED',
        actor_id: userData?.user?.id || null,
        actor_email: payload.actor_email || userData?.user?.email || 'superadmin@collectibles.uy',
        engine: payload.engine || null,
        country_code: payload.country_code || null,
        old_value: payload.old_value || null,
        new_value: payload.new_value || null,
        metadata: payload.metadata || {}
      });
    } catch (err) {
      console.warn('[AIAdminService] Could not write audit log:', err);
    }
  }
}


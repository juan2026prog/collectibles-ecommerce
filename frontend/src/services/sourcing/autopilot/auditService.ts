import { supabase } from '../../../lib/supabase';
import type { 
  AutopilotAuditEntry, 
  AutopilotAlert, 
  AlertPriority 
} from '../../../types/sourcingAutopilot';

const LOCAL_AUDIT_STORAGE_KEY = 'collectibles_sourcing_autopilot_audit_v1';
const LOCAL_ALERTS_STORAGE_KEY = 'collectibles_sourcing_autopilot_alerts_v1';

// Helper for fast DB call timeout
function withTimeout<T>(promise: Promise<T>, ms = 300): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), ms))
  ]);
}

export class AutopilotAuditService {
  /**
   * Logs an immutable audit trail entry in Supabase DB with fast localStorage fallback.
   */
  async logAuditEntry(entry: Omit<AutopilotAuditEntry, 'id' | 'timestamp'>): Promise<AutopilotAuditEntry> {
    const fullEntry: AutopilotAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };

    try {
      const insertPromise = supabase
        .from('sourcing_autopilot_audit')
        .insert({
          timestamp: fullEntry.timestamp,
          product_id: fullEntry.product_id,
          opportunity_id: fullEntry.opportunity_id,
          publication_id: fullEntry.publication_id,
          order_id: fullEntry.order_id,
          action: fullEntry.action,
          previous_state: fullEntry.previous_state,
          new_state: fullEntry.new_state,
          reason: fullEntry.reason,
          rule_applied: fullEntry.rule_applied,
          source_name: fullEntry.source_name,
          source_price: fullEntry.source_price,
          landed_cost: fullEntry.landed_cost,
          selling_price: fullEntry.selling_price,
          margin: fullEntry.margin,
          confidence: fullEntry.confidence,
          actor: fullEntry.actor,
          mode: fullEntry.mode,
          result: fullEntry.result,
          error_message: fullEntry.error_message,
          metadata: fullEntry.metadata
        });

      await withTimeout(insertPromise, 300);
    } catch {
      // Local fallback
    }

    this.saveAuditLocally(fullEntry);
    return fullEntry;
  }

  /**
   * Fetches recent audit entries.
   */
  async getAuditEntries(limit = 100): Promise<AutopilotAuditEntry[]> {
    try {
      const queryPromise = supabase
        .from('sourcing_autopilot_audit')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      const { data, error } = await withTimeout(queryPromise, 300);

      if (!error && data && data.length > 0) {
        return data as AutopilotAuditEntry[];
      }
    } catch {
      // fallback
    }

    return this.getLocalAuditEntries().slice(0, limit);
  }

  /**
   * Creates a system alert.
   */
  async createAlert(params: {
    priority: AlertPriority;
    title: string;
    message: string;
    code: string;
    payload?: Record<string, any>;
  }): Promise<AutopilotAlert> {
    const alert: AutopilotAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      priority: params.priority,
      title: params.title,
      message: params.message,
      code: params.code,
      payload: params.payload,
      is_read: false,
      created_at: new Date().toISOString()
    };

    try {
      const insertPromise = supabase.from('sourcing_autopilot_alerts').insert({
        priority: alert.priority,
        title: alert.title,
        message: alert.message,
        code: alert.code,
        payload: alert.payload,
        is_read: false
      });
      await withTimeout(insertPromise, 300);
    } catch {
      // fallback
    }

    this.saveAlertLocally(alert);
    return alert;
  }

  /**
   * Fetches active alerts.
   */
  async getAlerts(limit = 50): Promise<AutopilotAlert[]> {
    try {
      const queryPromise = supabase
        .from('sourcing_autopilot_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      const { data, error } = await withTimeout(queryPromise, 300);

      if (!error && data && data.length > 0) {
        return data as AutopilotAlert[];
      }
    } catch {
      // fallback
    }

    return this.getLocalAlerts().slice(0, limit);
  }

  private saveAuditLocally(entry: AutopilotAuditEntry) {
    try {
      const current = this.getLocalAuditEntries();
      const updated = [entry, ...current].slice(0, 200);
      localStorage.setItem(LOCAL_AUDIT_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  private getLocalAuditEntries(): AutopilotAuditEntry[] {
    try {
      const raw = localStorage.getItem(LOCAL_AUDIT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveAlertLocally(alert: AutopilotAlert) {
    try {
      const current = this.getLocalAlerts();
      const updated = [alert, ...current].slice(0, 100);
      localStorage.setItem(LOCAL_ALERTS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  private getLocalAlerts(): AutopilotAlert[] {
    try {
      const raw = localStorage.getItem(LOCAL_ALERTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export const auditService = new AutopilotAuditService();

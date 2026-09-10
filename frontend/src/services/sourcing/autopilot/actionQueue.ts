import { supabase } from '../../../lib/supabase';
import type { 
  AutopilotQueueItem, 
  ActionType, 
  QueueStatus 
} from '../../../types/sourcingAutopilot';

const LOCAL_QUEUE_STORAGE_KEY = 'collectibles_sourcing_autopilot_queue_v1';

function withTimeout<T>(promise: Promise<T>, ms = 300): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), ms))
  ]);
}

export class AutopilotActionQueueManager {
  /**
   * Enqueues an action with idempotency protection.
   */
  async enqueueAction(params: {
    action_type: ActionType;
    canonical_sku: string;
    product_id?: string;
    publication_id?: string;
    payload: Record<string, any>;
    idempotency_key: string;
    status?: QueueStatus;
  }): Promise<AutopilotQueueItem> {
    const existing = await this.getQueueItemByIdempotencyKey(params.idempotency_key);
    if (existing) {
      return existing;
    }

    const item: AutopilotQueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action_type: params.action_type,
      status: params.status || 'PENDING',
      canonical_sku: params.canonical_sku,
      product_id: params.product_id,
      publication_id: params.publication_id,
      payload: params.payload,
      idempotency_key: params.idempotency_key,
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const insertPromise = supabase
        .from('sourcing_autopilot_queue')
        .insert({
          action_type: item.action_type,
          status: item.status,
          canonical_sku: item.canonical_sku,
          product_id: item.product_id,
          publication_id: item.publication_id,
          payload: item.payload,
          idempotency_key: item.idempotency_key,
          attempts: item.attempts,
          max_attempts: item.max_attempts
        })
        .select()
        .single();

      const { data, error } = await withTimeout(insertPromise, 300);

      if (!error && data) {
        this.saveQueueLocally(data as AutopilotQueueItem);
        return data as AutopilotQueueItem;
      }
    } catch {
      // fallback
    }

    this.saveQueueLocally(item);
    return item;
  }

  /**
   * Fetches active queue items.
   */
  async getQueueItems(statusFilter?: QueueStatus): Promise<AutopilotQueueItem[]> {
    try {
      let query = supabase.from('sourcing_autopilot_queue').select('*').order('created_at', { ascending: false });
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      const { data, error } = await withTimeout(query, 300);
      if (!error && data) {
        return data as AutopilotQueueItem[];
      }
    } catch {
      // fallback
    }

    const local = this.getLocalQueueItems();
    if (statusFilter) {
      return local.filter(i => i.status === statusFilter);
    }
    return local;
  }

  /**
   * Updates queue item status.
   */
  async updateQueueStatus(
    id: string, 
    status: QueueStatus, 
    resultOrError?: { result?: Record<string, any>; error_message?: string }
  ): Promise<void> {
    try {
      const updatePromise = supabase
        .from('sourcing_autopilot_queue')
        .update({
          status,
          result: resultOrError?.result,
          error_message: resultOrError?.error_message,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      await withTimeout(updatePromise, 300);
    } catch {
      // fallback
    }

    const local = this.getLocalQueueItems();
    const target = local.find(i => i.id === id);
    if (target) {
      target.status = status;
      if (resultOrError?.result) target.result = resultOrError.result;
      if (resultOrError?.error_message) target.error_message = resultOrError.error_message;
      target.updated_at = new Date().toISOString();
      localStorage.setItem(LOCAL_QUEUE_STORAGE_KEY, JSON.stringify(local));
    }
  }

  private async getQueueItemByIdempotencyKey(key: string): Promise<AutopilotQueueItem | null> {
    try {
      const queryPromise = supabase
        .from('sourcing_autopilot_queue')
        .select('*')
        .eq('idempotency_key', key)
        .single();
      const { data } = await withTimeout(queryPromise, 300);
      if (data) return data as AutopilotQueueItem;
    } catch {
      // fallback
    }

    const local = this.getLocalQueueItems();
    return local.find(i => i.idempotency_key === key) || null;
  }

  private saveQueueLocally(item: AutopilotQueueItem) {
    try {
      const local = this.getLocalQueueItems();
      const updated = [item, ...local.filter(i => i.id !== item.id)].slice(0, 100);
      localStorage.setItem(LOCAL_QUEUE_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  private getLocalQueueItems(): AutopilotQueueItem[] {
    try {
      const raw = localStorage.getItem(LOCAL_QUEUE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export const actionQueueManager = new AutopilotActionQueueManager();

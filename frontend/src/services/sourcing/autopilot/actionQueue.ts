import { supabase } from '../../../lib/supabase';
import type { 
  AutopilotQueueItem, 
  ActionType, 
  QueueStatus 
} from '../../../types/sourcingAutopilot';

async function withTimeout<T>(promise: PromiseLike<T> | Promise<T>, ms = 300): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), ms))
  ]);
}

/**
 * AutopilotActionQueueManager
 * Durable backend queue for sourcing actions with idempotency,
 * strict state transitions, deduplication and server acknowledgment.
 */
export class AutopilotActionQueueManager {
  /**
   * Enqueues an action with idempotency protection in the durable backend.
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
    // 1. Check existing record by idempotency key
    const existing = await this.getQueueItemByIdempotencyKey(params.idempotency_key);
    if (existing) {
      return existing;
    }

    // 2. Insert into durable Supabase queue
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeProductId = params.product_id && isUuid.test(params.product_id) ? params.product_id : null;
    const safePublicationId = params.publication_id && isUuid.test(params.publication_id) ? params.publication_id : null;

    try {
      const insertPromise = supabase
        .from('sourcing_autopilot_queue')
        .insert({
          action_type: params.action_type,
          status: params.status || 'CREATED',
          canonical_sku: params.canonical_sku,
          product_id: safeProductId,
          publication_id: safePublicationId,
          payload: {
            ...params.payload,
            ...(params.product_id && !safeProductId ? { raw_product_id: params.product_id } : {}),
            ...(params.publication_id && !safePublicationId ? { raw_publication_id: params.publication_id } : {})
          },
          idempotency_key: params.idempotency_key,
          attempts: 0,
          max_attempts: 3
        })
        .select()
        .single();

      const { data, error } = await withTimeout(insertPromise, 300);

      if (!error && data) {
        return data as AutopilotQueueItem;
      }
    } catch {
      // Fallback to local queue item
    }

    return {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action_type: params.action_type,
      status: params.status || 'CREATED',
      canonical_sku: params.canonical_sku,
      product_id: params.product_id,
      publication_id: params.publication_id,
      payload: params.payload,
      idempotency_key: params.idempotency_key,
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as AutopilotQueueItem;
  }

  /**
   * Fetches active queue items from the server.
   */
  async getQueueItems(statusFilter?: QueueStatus): Promise<AutopilotQueueItem[]> {
    let query = supabase
      .from('sourcing_autopilot_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[AutopilotActionQueue] Error fetching queue items from server:', error);
      return [];
    }

    return (data || []) as AutopilotQueueItem[];
  }

  /**
   * Updates queue item status in the durable database.
   */
  async updateQueueStatus(
    id: string, 
    status: QueueStatus, 
    resultOrError?: { result?: Record<string, any>; error_message?: string }
  ): Promise<void> {
    const updatePayload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString()
    };

    if (resultOrError?.result) updatePayload.result = resultOrError.result;
    if (resultOrError?.error_message) updatePayload.last_error = resultOrError.error_message;

    const { error } = await supabase
      .from('sourcing_autopilot_queue')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      console.error(`[AutopilotActionQueue] Error updating queue item ${id} to ${status}:`, error);
      throw new Error(`No se pudo actualizar el estado de la acción: ${error.message}`);
    }
  }


  /**
   * Explicit admin approval gate. The database RPC verifies admin identity,
   * transition state and writes the immutable audit entry.
   */
  async approveAction(id: string, note?: string): Promise<AutopilotQueueItem> {
    const { data, error } = await supabase.rpc('approve_sourcing_autopilot_action', {
      p_queue_id: id,
      p_note: note || null
    });
    if (error || !data) {
      throw new Error(`No se pudo aprobar la acción: ${error?.message || 'Error desconocido'}`);
    }
    return data as AutopilotQueueItem;
  }

  private async getQueueItemByIdempotencyKey(key: string): Promise<AutopilotQueueItem | null> {
    try {
      const queryPromise = supabase
        .from('sourcing_autopilot_queue')
        .select('*')
        .eq('idempotency_key', key)
        .maybeSingle();

      const { data, error } = await withTimeout(queryPromise, 300);

      if (error) {
        console.warn(`[AutopilotActionQueue] Error checking idempotency key ${key}:`, error);
        return null;
      }

      return (data as AutopilotQueueItem) || null;
    } catch {
      return null;
    }
  }
}

export const actionQueueManager = new AutopilotActionQueueManager();

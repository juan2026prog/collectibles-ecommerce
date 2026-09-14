import { supabase } from '../../../lib/supabase';
import type { 
  AutopilotQueueItem, 
  ActionType, 
  QueueStatus 
} from '../../../types/sourcingAutopilot';

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
    const { data, error } = await supabase
      .from('sourcing_autopilot_queue')
      .insert({
        action_type: params.action_type,
        status: params.status || 'CREATED',
        canonical_sku: params.canonical_sku,
        product_id: params.product_id || null,
        publication_id: params.publication_id || null,
        payload: params.payload,
        idempotency_key: params.idempotency_key,
        attempts: 0,
        max_attempts: 3
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[AutopilotActionQueue] Server error enqueueing action:', error);
      throw new Error(`Error encolando acción en el servidor: ${error?.message || 'Error desconocido'}`);
    }

    return data as AutopilotQueueItem;
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

  private async getQueueItemByIdempotencyKey(key: string): Promise<AutopilotQueueItem | null> {
    const { data, error } = await supabase
      .from('sourcing_autopilot_queue')
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (error) {
      console.warn(`[AutopilotActionQueue] Error checking idempotency key ${key}:`, error);
      return null;
    }

    return (data as AutopilotQueueItem) || null;
  }
}

export const actionQueueManager = new AutopilotActionQueueManager();

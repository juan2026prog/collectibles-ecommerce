import { supabase } from '../../lib/supabase';

// In-memory view deduplication set (prevents spamming views for the same ASIN in 30s)
const recentlyViewedAsins = new Map<string, number>();
const VIEW_DEBOUNCE_MS = 30000;

export interface ExternalInterestRecord {
  provider: string;
  external_product_id: string;
  wishlist_count: number;
  view_count: number;
  promoted_to_catalog: boolean;
  promoted_at?: string | null;
}

/**
 * Record a product view for an external Amazon/Zinc product safely without creating individual event rows.
 * Uses atomic debounced RPC `record_external_product_view`.
 */
export async function recordExternalProductView(externalProductId: string, provider: string = 'amazon'): Promise<void> {
  if (!externalProductId || typeof externalProductId !== 'string') return;
  const asin = externalProductId.trim().toUpperCase();
  if (!asin) return;

  const now = Date.now();
  const lastView = recentlyViewedAsins.get(asin);
  if (lastView && now - lastView < VIEW_DEBOUNCE_MS) {
    return; // Debounced
  }
  recentlyViewedAsins.set(asin, now);

  try {
    await supabase.rpc('record_external_product_view', {
      p_provider: provider.toLowerCase(),
      p_external_product_id: asin
    });
  } catch (err: any) {
    // Fail-safe non-blocking telemetry
    console.warn('[InterestTracking] recordExternalProductView skipped:', err?.message);
  }
}

/**
 * Toggle external product wishlist for authenticated user or guest local state.
 * Syncs minimal table `user_external_wishlist` and updates aggregate count in `external_product_interest`.
 */
export async function toggleExternalProductWishlist(
  externalProductId: string,
  provider: string = 'amazon'
): Promise<{
  isAdded: boolean;
  wishlistCount: number;
  shouldPromote: boolean;
}> {
  if (!externalProductId || typeof externalProductId !== 'string') {
    return { isAdded: false, wishlistCount: 0, shouldPromote: false };
  }
  const asin = externalProductId.trim().toUpperCase();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      // Guest fallback: maintain in localStorage without DB writes
      const key = 'guest_external_wishlist';
      const stored = localStorage.getItem(key);
      const list: string[] = stored ? JSON.parse(stored) : [];
      const isPresent = list.includes(asin);
      const nextList = isPresent ? list.filter(a => a !== asin) : [...list, asin];
      localStorage.setItem(key, JSON.stringify(nextList));
      return { isAdded: !isPresent, wishlistCount: isPresent ? 0 : 1, shouldPromote: false };
    }

    const { data, error } = await supabase.rpc('toggle_external_product_wishlist', {
      p_provider: provider.toLowerCase(),
      p_external_product_id: asin
    });

    if (error) throw error;

    return {
      isAdded: Boolean(data?.is_added),
      wishlistCount: Number(data?.wishlist_count || 0),
      shouldPromote: Boolean(data?.should_promote)
    };
  } catch (err: any) {
    console.error('[InterestTracking] toggleExternalProductWishlist error:', err);
    return { isAdded: false, wishlistCount: 0, shouldPromote: false };
  }
}

/**
 * Get aggregate interest metrics for a set of ASINs.
 */
export async function getExternalProductInterests(asins: string[], provider: string = 'amazon'): Promise<Record<string, ExternalInterestRecord>> {
  if (!asins || asins.length === 0) return {};
  const cleanAsins = asins.map(a => a.trim().toUpperCase()).filter(Boolean);

  try {
    const { data, error } = await supabase
      .from('external_product_interest')
      .select('provider, external_product_id, wishlist_count, view_count, promoted_to_catalog, promoted_at')
      .eq('provider', provider.toLowerCase())
      .in('external_product_id', cleanAsins);

    if (error || !data) return {};

    const map: Record<string, ExternalInterestRecord> = {};
    for (const r of data) {
      map[r.external_product_id] = r;
    }
    return map;
  } catch (err) {
    return {};
  }
}

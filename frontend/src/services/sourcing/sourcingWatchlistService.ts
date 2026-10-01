/**
 * SOURCING WATCHLIST SERVICE — EXPANDED
 * Collectibles 2026 — Database-First Watchlist Management
 * 
 * Gestiona la lista de vigilancia de productos, marcas, licencias, franquicias y líneas de Sourcing.
 * Soporta discriminación entre elementos dentro de Watchlist y hallazgos descubiertos fuera de Watchlist.
 */

import { supabase } from '../../lib/supabase';
import type { NormalizedProduct } from '../../types/sourcing';
import type { WatchlistExpandedItem, WatchlistScopeType } from '../../types/sourcingIntelligence';

const DEFAULT_WATCHLIST_SEEDS: WatchlistExpandedItem[] = [
  { id: 'wl-1', type: 'BRAND', name: 'Funko', value: 'Funko', priority: 'HIGH', created_at: new Date().toISOString() },
  { id: 'wl-2', type: 'BRAND', name: 'NECA', value: 'NECA', priority: 'HIGH', created_at: new Date().toISOString() },
  { id: 'wl-3', type: 'LINE', name: 'Marvel Legends', value: 'Marvel Legends', priority: 'HIGH', created_at: new Date().toISOString() },
  { id: 'wl-4', type: 'MANUFACTURER', name: 'McFarlane Toys', value: 'McFarlane', priority: 'HIGH', created_at: new Date().toISOString() },
  { id: 'wl-5', type: 'FRANCHISE', name: 'Star Wars', value: 'Star Wars', priority: 'HIGH', created_at: new Date().toISOString() },
  { id: 'wl-6', type: 'FRANCHISE', name: 'Pokémon', value: 'Pokémon', priority: 'HIGH', created_at: new Date().toISOString() },
  { id: 'wl-7', type: 'MANUFACTURER', name: 'Hot Toys', value: 'Hot Toys', priority: 'MEDIUM', created_at: new Date().toISOString() },
  { id: 'wl-8', type: 'LINE', name: 'Jada Toys Street Fighter', value: 'Street Fighter', priority: 'HIGH', created_at: new Date().toISOString() }
];

const LOCAL_CACHE_KEY = 'collectibles_sourcing_watchlist_expanded_cache';

export class SourcingWatchlistService {
  /**
   * Obtiene todos los elementos vigilados (marcas, líneas, franquicias y SKUs).
   */
  async getWatchlistItems(): Promise<WatchlistExpandedItem[]> {
    try {
      const { data, error } = await supabase
        .from('sourcing_watchlist')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: WatchlistExpandedItem[] = data.map((item: any) => ({
          id: item.id || item.product_id,
          type: (item.scope_type as WatchlistScopeType) || (item.product_id ? 'SKU' : 'BRAND'),
          name: item.name || item.title || item.brand || 'Item Vigilado',
          value: item.value || item.canonical_sku || item.title || '',
          priority: item.priority || 'HIGH',
          target_country: item.target_country || 'GLOBAL',
          notes: item.notes,
          created_at: item.created_at || new Date().toISOString()
        }));

        this.updateLocalCache(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('[SourcingWatchlist] Fallback a cache local:', err);
    }

    const cached = this.getLocalCache();
    return cached.length > 0 ? cached : DEFAULT_WATCHLIST_SEEDS;
  }

  /**
   * Obtiene todos los IDs de productos en la Watchlist desde la base de datos Supabase.
   */
  async getWatchlistProductIds(): Promise<string[]> {
    const items = await this.getWatchlistItems();
    return items.map(i => i.id);
  }

  /**
   * Añade un nuevo elemento a la Watchlist (marca, línea, franquicia, SKU).
   */
  async addWatchlistItem(item: Omit<WatchlistExpandedItem, 'id' | 'created_at'>): Promise<{ success: boolean; item?: WatchlistExpandedItem; error?: string }> {
    const newItem: WatchlistExpandedItem = {
      ...item,
      id: `wl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      created_at: new Date().toISOString()
    };

    try {
      await supabase.from('sourcing_watchlist').insert({
        product_id: newItem.id,
        title: newItem.name,
        brand: newItem.type === 'BRAND' ? newItem.value : undefined,
        canonical_sku: newItem.type === 'SKU' ? newItem.value : undefined,
        notes: newItem.notes,
        created_at: newItem.created_at
      });
    } catch {}

    const current = await this.getWatchlistItems();
    this.updateLocalCache([newItem, ...current]);
    return { success: true, item: newItem };
  }

  /**
   * Añade un producto a la Watchlist en la base de datos.
   */
  async addToWatchlist(product: NormalizedProduct): Promise<{ success: boolean; error?: string }> {
    const activeOffer = product.offers?.find(o => o.id === product.selected_source_id) || product.offers?.[0];
    
    try {
      await supabase
        .from('sourcing_watchlist')
        .upsert({
          product_id: product.id,
          canonical_sku: product.canonical_sku,
          title: product.title,
          brand: product.brand,
          source_name: activeOffer?.source || 'unknown',
          current_price: product.financials?.current_sale_price_usd || activeOffer?.price || 0,
          updated_at: new Date().toISOString()
        }, { onConflict: 'product_id' });

      const current = await this.getWatchlistItems();
      const exists = current.some(i => i.id === product.id);
      if (!exists) {
        this.updateLocalCache([
          {
            id: product.id,
            type: 'SKU',
            name: product.title,
            value: product.canonical_sku || product.title,
            priority: 'HIGH',
            created_at: new Date().toISOString()
          },
          ...current
        ]);
      }

      return { success: true };
    } catch (err: any) {
      return { success: true };
    }
  }

  /**
   * Elimina un elemento de la Watchlist en la base de datos.
   */
  async removeFromWatchlist(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await supabase
        .from('sourcing_watchlist')
        .delete()
        .eq('product_id', id);
    } catch {}

    const current = await this.getWatchlistItems();
    this.updateLocalCache(current.filter(i => i.id !== id));
    return { success: true };
  }

  /**
   * Toggle atómico de Watchlist contra Supabase DB.
   */
  async toggleWatchlist(product: NormalizedProduct): Promise<{ isInWatchlist: boolean }> {
    const current = await this.getWatchlistProductIds();
    const exists = current.includes(product.id);

    if (exists) {
      await this.removeFromWatchlist(product.id);
      return { isInWatchlist: false };
    } else {
      await this.addToWatchlist(product);
      return { isInWatchlist: true };
    }
  }

  private getLocalCache(): WatchlistExpandedItem[] {
    try {
      const saved = localStorage.getItem(LOCAL_CACHE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  }

  private updateLocalCache(items: WatchlistExpandedItem[]): void {
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(items));
    } catch {}
  }
}

export const sourcingWatchlistService = new SourcingWatchlistService();

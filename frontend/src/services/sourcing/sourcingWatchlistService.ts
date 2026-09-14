/**
 * SOURCING WATCHLIST SERVICE
 * Collectibles 2026 — Database-First Watchlist Management
 * 
 * Gestiona la lista de vigilancia de productos de Sourcing directamente en Supabase DB.
 * La base de datos es la única fuente de verdad; localStorage actúa únicamente como cache UX secundaria.
 */

import { supabase } from '../../lib/supabase';
import type { NormalizedProduct } from '../../types/sourcing';

export interface WatchlistRecord {
  id?: string;
  product_id: string;
  canonical_sku?: string;
  title: string;
  brand?: string;
  source_name?: string;
  target_price?: number;
  current_price?: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

const LOCAL_CACHE_KEY = 'collectibles_sourcing_watchlist_ids_cache';

export class SourcingWatchlistService {
  /**
   * Obtiene todos los IDs de productos en la Watchlist desde la base de datos Supabase.
   */
  async getWatchlistProductIds(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('sourcing_watchlist')
        .select('product_id')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const ids = data.map(item => item.product_id);
        this.updateLocalCache(ids);
        return ids;
      }
    } catch (err) {
      console.warn('[SourcingWatchlist] Fallback a cache local por error de conexión DB:', err);
    }

    return this.getLocalCache();
  }

  /**
   * Añade un producto a la Watchlist en la base de datos.
   */
  async addToWatchlist(product: NormalizedProduct): Promise<{ success: boolean; error?: string }> {
    const activeOffer = product.offers?.find(o => o.id === product.selected_source_id) || product.offers?.[0];
    
    try {
      const { error } = await supabase
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

      if (error) {
        console.warn('[SourcingWatchlist] Error insertando en DB:', error.message);
      }

      // Sincronizar cache local secundaria
      const current = this.getLocalCache();
      if (!current.includes(product.id)) {
        this.updateLocalCache([...current, product.id]);
      }

      return { success: !error };
    } catch (err: any) {
      console.warn('[SourcingWatchlist] Excepción al guardar en Watchlist DB:', err);
      const current = this.getLocalCache();
      if (!current.includes(product.id)) {
        this.updateLocalCache([...current, product.id]);
      }
      return { success: true };
    }
  }

  /**
   * Elimina un producto de la Watchlist en la base de datos.
   */
  async removeFromWatchlist(productId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('sourcing_watchlist')
        .delete()
        .eq('product_id', productId);

      if (error) {
        console.warn('[SourcingWatchlist] Error eliminando de DB:', error.message);
      }

      // Sincronizar cache local secundaria
      const current = this.getLocalCache();
      this.updateLocalCache(current.filter(id => id !== productId));

      return { success: !error };
    } catch (err: any) {
      console.warn('[SourcingWatchlist] Excepción al eliminar de Watchlist DB:', err);
      const current = this.getLocalCache();
      this.updateLocalCache(current.filter(id => id !== productId));
      return { success: true };
    }
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

  private getLocalCache(): string[] {
    try {
      const saved = localStorage.getItem(LOCAL_CACHE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  }

  private updateLocalCache(ids: string[]): void {
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(ids));
    } catch {}
  }
}

export const sourcingWatchlistService = new SourcingWatchlistService();

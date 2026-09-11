import type { CanonicalProduct } from '../../types/sourcing';
import { supabase } from '../../lib/supabase';

export interface RadarProductQueryParams {
  franchise?: string;
  series?: string;
  releaseYear?: number;
  category?: string;
  brand?: string;
  limit?: number;
}

export class RadarIntegrationService {
  /**
   * API/Servicio de consulta para integrar productos canónicos con el módulo Radar.
   * Permite buscar productos por franquicia, serie, año de lanzamiento, categoría y marca.
   */
  static async getCanonicalProductsForRadar(
    params: RadarProductQueryParams,
    localProducts: CanonicalProduct[] = []
  ): Promise<CanonicalProduct[]> {
    const { franchise, series, releaseYear, category, brand, limit = 50 } = params;

    // 1. Filtrar primero desde la colección local en memoria si existe
    let filtered = [...localProducts];

    if (franchise) {
      const fLower = franchise.toLowerCase();
      filtered = filtered.filter(p => (p.franchise || (p as any).license || '').toLowerCase().includes(fLower));
    }
    if (brand) {
      const bLower = brand.toLowerCase();
      filtered = filtered.filter(p => p.brand.toLowerCase().includes(bLower));
    }
    if (series) {
      const sLower = series.toLowerCase();
      filtered = filtered.filter(p => (p.series || '').toLowerCase().includes(sLower));
    }
    if (category) {
      const cLower = category.toLowerCase();
      filtered = filtered.filter(p => (p.category || '').toLowerCase().includes(cLower));
    }
    if (releaseYear) {
      filtered = filtered.filter(p => p.release_year === releaseYear);
    }

    if (filtered.length > 0) {
      return filtered.slice(0, limit);
    }

    // 2. Si no hay datos locales, intentar consulta a Supabase
    try {
      let query = supabase.from('canonical_products').select('*');

      if (franchise) query = query.ilike('franchise', `%${franchise}%`);
      if (brand) query = query.ilike('brand', `%${brand}%`);
      if (series) query = query.ilike('series', `%${series}%`);
      if (category) query = query.ilike('category', `%${category}%`);
      if (releaseYear) query = query.eq('release_year', releaseYear);

      const { data, error } = await query.limit(limit);
      if (!error && data) {
        return data as CanonicalProduct[];
      }
    } catch {
      // Fail silently if table not synced in remote yet
    }

    return [];
  }

  /**
   * Genera el desglose de señal de demanda LATAM por tema de tendencia (ej: Street Fighter)
   */
  static getLatamMarketBreakdown(topicName: string): Record<string, string> {
    const topicLower = topicName.toLowerCase();
    if (topicLower.includes('street fighter') || topicLower.includes('ryu')) {
      return {
        UY: 'Muy alta',
        CL: 'Alta',
        BR: 'Alta',
        AR: 'Media'
      };
    }
    return {
      UY: 'Alta',
      CL: 'Media',
      BR: 'Media',
      AR: 'Baja'
    };
  }
}

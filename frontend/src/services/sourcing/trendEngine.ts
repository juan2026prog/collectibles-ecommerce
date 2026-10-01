// ============================================================
// COLLECTIBLES 2026 — SOURCING TREND ENGINE
// Motor determinístico de cálculo de tendencias comerciales.
// REGLA FUNDAMENTAL: OpenAI NO inventa el Trend Score.
// ============================================================

import type {
  SourcingSignal,
  SourcingTrendCard,
  SourcingCandidateStatus,
  TrendDirection,
  SourcingConfidenceLevel
} from '../../types/sourcingIntelligence';

export interface TrendEvaluationInput {
  topic: string;
  category?: string;
  country: string; // 'UY' | 'AR' | 'CL' | 'PE' | 'MX' | 'GLOBAL'
  signals: SourcingSignal[];
  internalSearchesCount?: number;
  internalWishlistCount?: number;
  internalViewsCount?: number;
  marketplaceListingsCount?: number;
  marketplaceAvgPriceUsd?: number;
  isNewRelease?: boolean;
  isPreorder?: boolean;
  periodDays?: number;
}

export interface TrendEvaluationResult {
  market_trend_score: number; // 0 - 100
  collectibles_trend_score: number; // 0 - 100
  composite_trend_score: number; // 0 - 100
  trend_velocity: number; // e.g. +24.5%
  status: SourcingCandidateStatus;
  direction: TrendDirection;
  confidence: SourcingConfidenceLevel;
  drivers: string[];
  subtrends: string[];
  why_summary: string;
}

export class TrendEngine {
  /**
   * Evalúa determinísticamente un tópico o categoría y genera sus scores y clasificación.
   */
  public static evaluateTrend(input: TrendEvaluationInput): TrendEvaluationResult {
    const {
      country,
      signals = [],
      internalSearchesCount = 0,
      internalWishlistCount = 0,
      internalViewsCount = 0,
      marketplaceListingsCount = 0,
      isNewRelease = false,
      isPreorder = false
    } = input;

    const drivers: string[] = [];

    // 1. CÁLCULO DE COLLECTIBLES TREND SCORE (0 - 100)
    // Basado exclusivamente en comportamiento observable de usuarios dentro de Collectibles
    let internalScore = 30; // Base neutral
    if (internalSearchesCount > 0) {
      const searchPoints = Math.min(35, internalSearchesCount * 3.5);
      internalScore += searchPoints;
      drivers.push(`Búsquedas internas en ${country} (+${internalSearchesCount})`);
    }
    if (internalWishlistCount > 0) {
      const wishPoints = Math.min(25, internalWishlistCount * 5);
      internalScore += wishPoints;
      drivers.push(`Interés en Wishlist (+${internalWishlistCount})`);
    }
    if (internalViewsCount > 0) {
      const viewPoints = Math.min(10, internalViewsCount * 1.5);
      internalScore += viewPoints;
    }
    const collectibles_trend_score = Math.min(100, Math.max(10, Math.round(internalScore)));

    // 2. CÁLCULO DE MARKET TREND SCORE (0 - 100)
    // Basado en señales externas (Amazon, eBay, ML, Fabricantes, Comunidades)
    let marketScore = 40;
    const retailerSignals = signals.filter(s => s.source_type === 'RETAILER' || s.source_type === 'MARKETPLACE');
    const communitySignals = signals.filter(s => s.source_type === 'COMMUNITY' || s.source_type === 'WEB_EDITORIAL');
    const officialSignals = signals.filter(s => s.source_type === 'OFFICIAL' || s.source_type === 'RELEASE_CALENDAR');

    if (retailerSignals.length > 0) {
      marketScore += Math.min(25, retailerSignals.length * 8);
      drivers.push(`Disponibilidad/demanda en ${retailerSignals.length} retailers clave`);
    }

    if (officialSignals.length > 0) {
      marketScore += 15;
      drivers.push(`Confirmación oficial de fabricante/distribuidor`);
    }

    if (communitySignals.length > 0) {
      marketScore += Math.min(15, communitySignals.length * 5);
      drivers.push(`Volumen de conversación en comunidades especializadas`);
    }

    if (isPreorder) {
      marketScore += 10;
      drivers.push(`Ventana activa de Preventa oficial`);
    }

    if (marketplaceListingsCount > 0 && marketplaceListingsCount < 4) {
      // Mercado local con poca oferta y alta demanda = gap
      marketScore += 10;
      drivers.push(`Baja competencia en marketplace local de ${country}`);
    }

    const market_trend_score = Math.min(100, Math.max(15, Math.round(marketScore)));

    // 3. COMPOSITE TREND SCORE (Ponderación 60% Mercado + 40% Collectibles)
    const composite_trend_score = Math.round((market_trend_score * 0.6) + (collectibles_trend_score * 0.4));

    // 4. TREND VELOCITY & DIRECTION
    let trend_velocity = 15;
    if (composite_trend_score >= 80) trend_velocity = 38.5;
    else if (composite_trend_score >= 65) trend_velocity = 22.0;
    else if (composite_trend_score <= 40) trend_velocity = -8.0;

    const direction: TrendDirection = trend_velocity > 5 ? 'UP' : (trend_velocity < -5 ? 'DOWN' : 'STABLE');

    // 5. CLASIFICACIÓN DE ESTADO
    let status: SourcingCandidateStatus = 'GROWING';

    if (isPreorder) {
      status = 'PREORDER';
    } else if (isNewRelease && composite_trend_score < 75) {
      status = 'NEW';
    } else if (composite_trend_score >= 85) {
      status = 'TRENDING';
    } else if (trend_velocity >= 25 && collectibles_trend_score > 60 && market_trend_score < 80) {
      // EMERGING: señal temprana antes de saturación masiva
      status = 'EMERGING';
    } else if (market_trend_score >= 70 && collectibles_trend_score >= 70) {
      status = 'OPPORTUNITY';
    } else {
      status = 'GROWING';
    }

    // 6. CONFIDENCE LEVEL
    let confidence: SourcingConfidenceLevel = 'MEDIUM';
    if (signals.length >= 3 && (officialSignals.length > 0 || retailerSignals.length > 0)) {
      confidence = 'HIGH';
    } else if (signals.length <= 1) {
      confidence = 'LOW';
    }

    // 7. SUBTRENDS DEDUCCIÓN
    const subtrends: string[] = [];
    signals.forEach(s => {
      if (s.metadata?.subtrend && !subtrends.includes(s.metadata.subtrend)) {
        subtrends.push(s.metadata.subtrend);
      }
    });

    const why_summary = `Score global ${composite_trend_score}/100 impulsado por ${drivers.slice(0, 3).join(', ')}.`;

    return {
      market_trend_score,
      collectibles_trend_score,
      composite_trend_score,
      trend_velocity,
      status,
      direction,
      confidence,
      drivers: drivers.length > 0 ? drivers : ['Señales observadas en catálogo'],
      subtrends,
      why_summary
    };
  }

  /**
   * Genera las tarjetas de tendencias oficiales para el mercado objetivo a partir de tópicos con señales reales.
   * Si no se proporcionan tópicos con señales observables, retorna un array vacío [] (cero mock data).
   */
  public static buildTrendCards(
    country: string = 'UY',
    customTopics: Array<{ 
      topic: string; 
      category: string; 
      signals: SourcingSignal[]; 
      subtrends?: string[];
      internalSearchesCount?: number;
      internalWishlistCount?: number;
      isPreorder?: boolean;
      isNewRelease?: boolean;
    }> = []
  ): SourcingTrendCard[] {
    if (!customTopics || customTopics.length === 0) {
      return [];
    }

    return customTopics.map((t, index) => {
      const evalRes = TrendEngine.evaluateTrend({
        topic: t.topic,
        category: t.category,
        country,
        signals: t.signals || [],
        internalSearchesCount: t.internalSearchesCount || 0,
        internalWishlistCount: t.internalWishlistCount || 0,
        isPreorder: t.isPreorder ?? false,
        isNewRelease: t.isNewRelease ?? false
      });

      return {
        id: `trend-${country.toLowerCase()}-${index + 1}`,
        topic: t.topic,
        category: t.category,
        status: evalRes.status,
        direction: evalRes.direction,
        market_trend_score: evalRes.market_trend_score,
        collectibles_trend_score: evalRes.collectibles_trend_score,
        composite_trend_score: evalRes.composite_trend_score,
        confidence: evalRes.confidence,
        drivers: evalRes.drivers,
        subtrends: t.subtrends || [],
        country,
        evidence_count: (t.signals || []).length,
        observed_signals: t.signals || [],
        why_summary: evalRes.why_summary,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });
  }
}


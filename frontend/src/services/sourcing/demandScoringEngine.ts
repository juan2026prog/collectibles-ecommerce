/**
 * SOURCING INTELLIGENCE — FASE 4 — DEMAND SCORING ENGINE
 * Collectibles 2026
 * 
 * Algoritmo determinístico de Demand Score (0–100) con Time Decay,
 * Trend Velocity y desglose explicable.
 */

export interface DemandScoreBreakdown {
  score: number; // 0 - 100
  trendVelocity: number; // -100 to +100
  trendAcceleration: number; // rate of change
  reasons: string[];
  components: {
    searchFrequencyContribution: number;
    zeroResultContribution: number;
    uniqueUsersContribution: number;
    wishlistContribution: number;
    radarContribution: number;
    comparisonContribution: number;
    trendVelocityContribution: number;
    timeDecayMultiplier: number;
  };
}

export interface DemandMetricsInput {
  searchCount: number;
  zeroResultCount: number;
  uniqueUsers: number;
  wishlistInterest: number;
  radarInterest: number;
  comparisonInterest: number;
  productViews?: number;
  recentCount7d?: number;
  previousCount30d?: number;
  lastSignalAt?: string;
  releaseProximityDays?: number | null;
}

/**
 * Aplica la degradación temporal (time decay) basada en la vida media configurable (14 días por defecto).
 */
export function calculateTimeDecayMultiplier(lastSignalAt?: string, halfLifeDays: number = 14): number {
  if (!lastSignalAt) return 1.0;
  const nowMs = Date.now();
  const lastMs = new Date(lastSignalAt).getTime();
  const ageDays = Math.max(0, (nowMs - lastMs) / (1000 * 60 * 60 * 24));
  
  if (ageDays <= 1) return 1.0;
  if (ageDays > 90) return 0.1;
  
  const lambda = Math.LN2 / halfLifeDays;
  return Number(Math.exp(-lambda * ageDays).toFixed(4));
}

/**
 * Calcula la velocidad de tendencia (trend_velocity) comparando los últimos 7 días contra el período previo.
 */
export function calculateTrendVelocity(recent7d: number, previous30d: number): { velocity: number; acceleration: number } {
  if (previous30d === 0 && recent7d === 0) return { velocity: 0, acceleration: 0 };
  
  const expected7dFrom30d = previous30d / 4;
  if (expected7dFrom30d === 0) {
    return { velocity: 50.0, acceleration: 25.0 }; // Spike on new product
  }
  
  const ratio = recent7d / expected7dFrom30d; // > 1.0 means acceleration
  const velocityPct = Math.min(100, Math.max(-100, (ratio - 1.0) * 100));
  const acceleration = Number((velocityPct / 7.0).toFixed(2));
  
  return {
    velocity: Number(velocityPct.toFixed(2)),
    acceleration
  };
}

/**
 * Calcula el Demand Score explicable de 0 a 100.
 */
export function computeDemandScore(metrics: DemandMetricsInput, halfLifeDays: number = 14): DemandScoreBreakdown {
  const timeDecay = calculateTimeDecayMultiplier(metrics.lastSignalAt, halfLifeDays);
  
  const recent7d = metrics.recentCount7d ?? Math.round(metrics.searchCount * 0.7);
  const prev30d = metrics.previousCount30d ?? Math.max(0, metrics.searchCount - recent7d);
  const { velocity, acceleration } = calculateTrendVelocity(recent7d, prev30d);

  // Component weights (bounded limits)
  const searchContrib = Math.min(25, metrics.searchCount * 3.0);
  const zeroResultContrib = Math.min(30, metrics.zeroResultCount * 5.0);
  const usersContrib = Math.min(20, metrics.uniqueUsers * 4.0);
  const wishlistContrib = Math.min(15, metrics.wishlistInterest * 3.5);
  const radarContrib = Math.min(15, metrics.radarInterest * 3.0);
  const comparisonContrib = Math.min(10, metrics.comparisonInterest * 2.5);

  let velocityContrib = 0;
  if (velocity > 0) {
    velocityContrib = Math.min(15, (velocity / 100) * 15);
  }

  const rawSum = searchContrib + zeroResultContrib + usersContrib + wishlistContrib + radarContrib + comparisonContrib + velocityContrib;
  const decayedScore = Math.min(100, Math.max(0, Math.round(rawSum * timeDecay)));

  // Generate structured textual explanation
  const reasons: string[] = [];
  if (metrics.zeroResultCount > 0) {
    reasons.push(`${metrics.zeroResultCount} ${metrics.zeroResultCount === 1 ? 'búsqueda sin resultado' : 'búsquedas sin resultado'}`);
  }
  if (metrics.uniqueUsers > 1) {
    reasons.push(`${metrics.uniqueUsers} usuarios únicos interesados`);
  }
  if (metrics.searchCount >= 3) {
    reasons.push(`${metrics.searchCount} búsquedas acumuladas`);
  }
  if (metrics.wishlistInterest > 0) {
    reasons.push(`${metrics.wishlistInterest} veces agregado a wishlist/vault`);
  }
  if (metrics.radarInterest > 0) {
    reasons.push(`Interés vinculado a evento de Radar`);
  }
  if (velocity > 20) {
    reasons.push(`Demanda en aceleración (+${Math.round(velocity)}% últimos 7 días)`);
  }
  if (metrics.releaseProximityDays != null && metrics.releaseProximityDays <= 30) {
    reasons.push(`Lanzamiento oficial próximo (${metrics.releaseProximityDays} días)`);
  }

  if (reasons.length === 0) {
    reasons.push('Señal de búsqueda inicial registrada');
  }

  return {
    score: decayedScore,
    trendVelocity: velocity,
    trendAcceleration: acceleration,
    reasons,
    components: {
      searchFrequencyContribution: Number(searchContrib.toFixed(1)),
      zeroResultContribution: Number(zeroResultContrib.toFixed(1)),
      uniqueUsersContribution: Number(usersContrib.toFixed(1)),
      wishlistContribution: Number(wishlistContrib.toFixed(1)),
      radarContribution: Number(radarContrib.toFixed(1)),
      comparisonContribution: Number(comparisonContrib.toFixed(1)),
      trendVelocityContribution: Number(velocityContrib.toFixed(1)),
      timeDecayMultiplier: timeDecay
    }
  };
}

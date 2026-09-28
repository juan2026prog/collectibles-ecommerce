import { executeAI } from '../ai/aiGateway';
import type { AICountryCode, AIEngineKey } from '../ai/types';

export interface IntelligenceEvidence {
  products?: unknown[];
  offers?: unknown[];
  demandSignals?: unknown[];
  catalogGaps?: unknown[];
  radar?: unknown[];
  releases?: unknown[];
  market?: Record<string, unknown>;
  importRules?: Record<string, unknown>;
  competition?: unknown[];
}

export interface IntelligenceResult {
  summary: string;
  confidence: number;
  signals: string[];
  risks: string[];
  recommendations: string[];
  evidenceIds: string[];
  scoreAdjustment: number;
  action: 'REVIEW' | 'WATCH' | 'IGNORE';
}

const EMPTY_RESULT: IntelligenceResult = {
  summary: 'Sin evidencia suficiente para análisis IA.',
  confidence: 0,
  signals: [],
  risks: [],
  recommendations: [],
  evidenceIds: [],
  scoreAdjustment: 0,
  action: 'WATCH'
};

const ALLOWED_ENGINES: AIEngineKey[] = [
  'PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION',
  'COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE'
];

function compactEvidence(evidence: IntelligenceEvidence): IntelligenceEvidence {
  const trim = (v?: unknown[]) => Array.isArray(v) ? v.slice(0, 40) : [];
  return {
    products: trim(evidence.products),
    offers: trim(evidence.offers),
    demandSignals: trim(evidence.demandSignals),
    catalogGaps: trim(evidence.catalogGaps),
    radar: trim(evidence.radar),
    releases: trim(evidence.releases),
    market: evidence.market || {},
    importRules: evidence.importRules || {},
    competition: trim(evidence.competition)
  };
}

export async function runCollectiblesIntelligence(
  engine: AIEngineKey,
  country: AICountryCode,
  evidence: IntelligenceEvidence,
  objective: string
): Promise<IntelligenceResult> {
  if (!ALLOWED_ENGINES.includes(engine)) throw new Error(`Unsupported Part 3 engine: ${engine}`);

  const result = await executeAI<IntelligenceResult>({
    engine,
    country,
    operation: 'part3_intelligence',
    payload: {
      objective,
      evidence: compactEvidence(evidence),
      rules: {
        evidenceOnly: true,
        noInventedPriceStockOrAvailability: true,
        noAutonomousCommercialAction: true,
        adminApprovalRequired: true
      }
    },
    context: { part: 3, decisionMode: 'ADVISORY_ONLY' },
    fallbackHandler: () => EMPTY_RESULT
  });

  const data = result.data || EMPTY_RESULT;
  return {
    summary: String(data.summary || EMPTY_RESULT.summary),
    confidence: Math.max(0, Math.min(1, Number(data.confidence || 0))),
    signals: Array.isArray(data.signals) ? data.signals.map(String).slice(0, 12) : [],
    risks: Array.isArray(data.risks) ? data.risks.map(String).slice(0, 12) : [],
    recommendations: Array.isArray(data.recommendations) ? data.recommendations.map(String).slice(0, 8) : [],
    evidenceIds: Array.isArray(data.evidenceIds) ? data.evidenceIds.map(String).slice(0, 40) : [],
    scoreAdjustment: Math.max(-10, Math.min(10, Number(data.scoreAdjustment || 0))),
    action: ['REVIEW','WATCH','IGNORE'].includes(data.action) ? data.action : 'WATCH'
  };
}

export const productDiscoveryIntelligence = (country:AICountryCode,evidence:IntelligenceEvidence,objective='Detectar oportunidades de producto basadas exclusivamente en evidencia real.') =>
  runCollectiblesIntelligence('PRODUCT_DISCOVERY',country,evidence,objective);
export const trendAnalysisIntelligence = (country:AICountryCode,evidence:IntelligenceEvidence,objective='Detectar tendencias y aceleración de demanda sin inventar señales.') =>
  runCollectiblesIntelligence('TREND_ANALYSIS',country,evidence,objective);
export const productCurationIntelligence = (country:AICountryCode,evidence:IntelligenceEvidence,objective='Normalizar, clasificar y detectar inconsistencias del producto; no publicar.') =>
  runCollectiblesIntelligence('PRODUCT_CURATION',country,evidence,objective);
export const countryIntelligence = (country:AICountryCode,evidence:IntelligenceEvidence,objective='Analizar oportunidad específica del país usando costos, reglas y mercado suministrados.') =>
  runCollectiblesIntelligence('COUNTRY_INTELLIGENCE',country,evidence,objective);
export const radarIntelligence = (country:AICountryCode,evidence:IntelligenceEvidence,objective='Priorizar señales Radar según evidencia de demanda y disponibilidad.') =>
  runCollectiblesIntelligence('RADAR_INTELLIGENCE',country,evidence,objective);
export const releaseIntelligence = (country:AICountryCode,evidence:IntelligenceEvidence,objective='Analizar lanzamientos próximos y su potencial demanda usando solo releases y señales suministradas.') =>
  runCollectiblesIntelligence('RELEASE_INTELLIGENCE',country,evidence,objective);

import type { 
  CanonicalProduct, 
  SourceListing, 
  MatchConfidenceLevel, 
  MatchReviewStatus 
} from '../../types/sourcing';
import { ProductNormalizationService } from './ProductNormalizationService';

export interface MatchEvaluationResult {
  matchLevel: 1 | 2 | 3 | 4 | 0; // 0 = UNMATCHED
  confidenceScore: number; // 0.00 - 1.00
  confidenceLevel: MatchConfidenceLevel;
  matchedCanonicalProduct: CanonicalProduct | null;
  reasons: string[];
  variantConflictDetected: boolean;
  variantConflictReason?: string;
  reviewRequired: boolean;
}

export class ProductMatchingEngine {
  /**
   * Intenta vincular un SourceListing a un producto canónico existente de la base de datos.
   * Aplica la jerarquía determinística en 4 niveles con Protección de Variantes.
   */
  static evaluateMatch(
    listing: SourceListing, 
    existingCanonicalProducts: CanonicalProduct[]
  ): MatchEvaluationResult {
    const rawTitle = listing.raw_title;
    const cleanResult = ProductNormalizationService.cleanAndNormalizeTitle(rawTitle, listing.raw_brand);
    const attrs = cleanResult.extractedAttributes;

    // Extraer identificadores del listing (de raw_payload o campos explícitos si existen)
    const listingUpc = listing.raw_payload?.upc || listing.raw_payload?.gtin || listing.raw_payload?.ean;
    const listingMpn = listing.raw_payload?.mpn;
    const listingBrand = (listing.raw_brand || attrs.brand || '').toLowerCase().trim();

    // ──────────────────────────────────────────────────────────────────────────
    // NIVEL 1 — Identificadores Exactos (UPC, EAN, GTIN, MPN)
    // ──────────────────────────────────────────────────────────────────────────
    if (listingUpc && listingUpc.trim().length >= 8) {
      const cleanUpc = listingUpc.trim();
      const matchByUpc = existingCanonicalProducts.find(p => p.upc === cleanUpc || p.gtin === cleanUpc || p.ean === cleanUpc);
      if (matchByUpc) {
        // Verificar que no haya un conflicto directo de variantes
        const conflict = this.checkVariantConflict(attrs, matchByUpc);
        if (!conflict.hasConflict) {
          return {
            matchLevel: 1,
            confidenceScore: 1.0,
            confidenceLevel: 'EXACT',
            matchedCanonicalProduct: matchByUpc,
            reasons: [`EXACT_UPC_MATCH:${cleanUpc}`, 'NO_VARIANT_CONFLICT'],
            variantConflictDetected: false,
            reviewRequired: false
          };
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NIVEL 2 — Fabricante / Marca + MPN (Manufacturer Part Number)
    // ──────────────────────────────────────────────────────────────────────────
    if (listingMpn && listingMpn.trim().length >= 3 && listingBrand) {
      const cleanMpn = listingMpn.trim().toLowerCase();
      const matchByMpn = existingCanonicalProducts.find(p => 
        p.mpn && p.mpn.toLowerCase().trim() === cleanMpn &&
        (p.brand.toLowerCase().includes(listingBrand) || listingBrand.includes(p.brand.toLowerCase()))
      );
      if (matchByMpn) {
        const conflict = this.checkVariantConflict(attrs, matchByMpn);
        if (!conflict.hasConflict) {
          return {
            matchLevel: 2,
            confidenceScore: 0.95,
            confidenceLevel: 'HIGH',
            matchedCanonicalProduct: matchByMpn,
            reasons: [`MPN_MANUFACTURER_MATCH:${cleanMpn}`, 'BRAND_MATCH'],
            variantConflictDetected: false,
            reviewRequired: false
          };
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NIVEL 3 — Cruzar Datos Estructurados (Brand + Franchise + Character + Scale + Variant)
    // ──────────────────────────────────────────────────────────────────────────
    for (const canonical of existingCanonicalProducts) {
      // 1. Validar conflicto de variantes primero (Protección contra falsos matches)
      const conflict = this.checkVariantConflict(attrs, canonical);
      if (conflict.hasConflict) {
        continue; // Descartar este candidato inmediatamente si hay choque de variante
      }

      const matchBrand = (canonical.brand.toLowerCase().includes(listingBrand) || listingBrand.includes(canonical.brand.toLowerCase()));
      const matchFranchise = attrs.franchise && canonical.franchise.toLowerCase().includes(attrs.franchise.toLowerCase());
      const matchCharacter = attrs.character && canonical.character.toLowerCase().includes(attrs.character.toLowerCase());
      const matchScale = !attrs.scale || !canonical.scale || canonical.scale === attrs.scale;

      if (matchBrand && matchCharacter && matchScale) {
        // Coincidencia fuerte por atributos estructurados
        const isExactVariant = (!attrs.variant && !canonical.variant) || (attrs.variant === canonical.variant);
        const score = isExactVariant ? 0.88 : 0.75;
        const level: MatchConfidenceLevel = score >= 0.85 ? 'HIGH' : 'MEDIUM';

        return {
          matchLevel: 3,
          confidenceScore: score,
          confidenceLevel: level,
          matchedCanonicalProduct: canonical,
          reasons: ['STRUCTURED_DATA_MATCH', `BRAND:${canonical.brand}`, `CHARACTER:${canonical.character}`, `SCALE:${canonical.scale}`],
          variantConflictDetected: false,
          reviewRequired: score < 0.85
        };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NIVEL 4 — Similaridad Textual de Apoyo (Jaccard)
    // ──────────────────────────────────────────────────────────────────────────
    let bestCandidate: CanonicalProduct | null = null;
    let maxSim = 0;

    for (const canonical of existingCanonicalProducts) {
      const conflict = this.checkVariantConflict(attrs, canonical);
      if (conflict.hasConflict) continue;

      const sim = this.calculateTitleSimilarity(cleanResult.cleanedTitle, canonical.canonical_title);
      if (sim > maxSim) {
        maxSim = sim;
        bestCandidate = canonical;
      }
    }

    // NO hacer match automático si solo hay similaridad textual menor a 0.85
    if (bestCandidate && maxSim >= 0.80) {
      const score = Number((maxSim * 0.85).toFixed(2));
      return {
        matchLevel: 4,
        confidenceScore: score,
        confidenceLevel: score >= 0.80 ? 'MEDIUM' : 'LOW',
        matchedCanonicalProduct: bestCandidate,
        reasons: [`TEXT_SIMILARITY:${(maxSim * 100).toFixed(0)}%`],
        variantConflictDetected: false,
        reviewRequired: true // Siempre requiere revisión si proviene solo de similaridad textual
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // UNMATCHED — No se encontró ningún producto canónico adecuado
    // ──────────────────────────────────────────────────────────────────────────
    return {
      matchLevel: 0,
      confidenceScore: 0.0,
      confidenceLevel: 'UNMATCHED',
      matchedCanonicalProduct: null,
      reasons: ['NO_CANONICAL_MATCH_FOUND'],
      variantConflictDetected: false,
      reviewRequired: false
    };
  }

  /**
   * Regla Estricta de Protección de Variantes (variant_protection).
   * Evita fusiones incorrectas entre variantes comerciales:
   * - Ryu vs Ryu Player 2
   * - Standard Edition vs Exclusive Edition
   * - Blue Version vs Red Version
   * - 1:12 vs 1:10 vs 1/6
   */
  static checkVariantConflict(
    inputAttrs: ReturnType<typeof ProductNormalizationService.extractAttributesFromTitle>,
    canonical: CanonicalProduct
  ): { hasConflict: boolean; reason?: string } {
    // 1. Escalas diferentes
    if (inputAttrs.scale && canonical.scale) {
      const s1 = inputAttrs.scale.replace(/\s+/g, '').toLowerCase();
      const s2 = canonical.scale.replace(/\s+/g, '').toLowerCase();
      if (s1 !== s2 && (s1.includes('1:') || s2.includes('1:'))) {
        return {
          hasConflict: true,
          reason: `SCALE_MISMATCH: Input scale (${inputAttrs.scale}) vs Canonical scale (${canonical.scale})`
        };
      }
    }

    // 2. Variantes de color/jugador (e.g. Player 1 vs Player 2)
    const inputVar = (inputAttrs.variant || '').toLowerCase();
    const canVar = (canonical.variant || '').toLowerCase();

    if (inputVar.includes('player 2') && !canVar.includes('player 2')) {
      return { hasConflict: true, reason: 'PLAYER_2_VARIANT_MISMATCH' };
    }
    if (!inputVar.includes('player 2') && canVar.includes('player 2')) {
      return { hasConflict: true, reason: 'PLAYER_1_VS_PLAYER_2_MISMATCH' };
    }

    // 3. Edición Standard vs Exclusive / Deluxe
    const inputEd = (inputAttrs.edition || 'Standard').toLowerCase();
    const canEd = (canonical.edition || 'Standard').toLowerCase();

    if (inputEd.includes('exclusive') && !canEd.includes('exclusive')) {
      return { hasConflict: true, reason: 'EXCLUSIVE_VS_STANDARD_MISMATCH' };
    }
    if (!inputEd.includes('exclusive') && canEd.includes('exclusive')) {
      return { hasConflict: true, reason: 'STANDARD_VS_EXCLUSIVE_MISMATCH' };
    }

    return { hasConflict: false };
  }

  /**
   * Similitud Jaccard de n-gramas de palabras entre dos títulos.
   */
  private static calculateTitleSimilarity(t1: string, t2: string): number {
    const words1 = new Set(t1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(t2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    words1.forEach(w => {
      if (words2.has(w)) intersection++;
    });

    const union = new Set([...words1, ...words2]).size;
    return intersection / union;
  }
}

// Shared by the gateway, automatic discovery and persisted-candidate reader.
// Only the server's source verifier supplies observations. LLM fields are claims.
export const SOURCING_PURCHASE_CAPABILITY = 'NONE';
export const AUTO_PUBLISH = false;
export const CANDIDATE_VALIDATION_VERSION = 1;

export function finiteNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function publicUrl(value) {
  try {
    const u = new URL(typeof value === 'string' ? value.trim() : '');
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    if (/unsplash\.com|example\.(com|org)|placeholder/i.test(u.href)) return null;
    return u.href;
  } catch { return null; }
}

export function extractAmazonAsin(value) {
  const url = publicUrl(value);
  if (!url) return null;
  const u = new URL(url);
  if (!/(^|\.)amazon\.(com|co\.uk|ca|de|fr|es|it|com\.au|co\.jp)$/.test(u.hostname)) return null;
  return u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase() || null;
}

export function provenance(value = null, status = 'UNKNOWN', source = null, sourceUrl = null, observedAt = null, extra = {}) {
  return { value, status, source, source_url: publicUrl(sourceUrl), observed_at: observedAt, ...extra };
}

const normalize = v => String(v || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function validateCandidate(raw, context = {}) {
  const country = context.country || raw.country_code || raw.country || 'UY';
  const title = String(raw.title || raw.name || '').trim();
  const sourceUrl = publicUrl(raw.url || raw.source_url || raw.retailer_url);
  const observations = (context.observations || []).filter(o => o && o.status === 'OBSERVED' && publicUrl(o.source_url) && o.observed_at);
  const observed = field => observations.find(o => o.field === field) || provenance();
  const identity = observed('identity');
  const declaredAsin = typeof raw.asin === 'string' && /^[A-Z0-9]{10}$/i.test(raw.asin.trim()) ? raw.asin.trim().toUpperCase() : null;
  const extractedAsin = extractAmazonAsin(sourceUrl);
  const verifiedAsin = observed('asin');
  const asin = verifiedAsin.value || extractedAsin || declaredAsin;
  const identifier = verifiedAsin.value
    ? { ...verifiedAsin, verification: 'SOURCE_VERIFIED' }
    : provenance(asin, 'UNKNOWN', raw.retailer || raw.source_retailer || null, extractedAsin ? sourceUrl : null, null,
      { verification: extractedAsin ? 'SOURCE_EXTRACTED' : 'AI_DECLARED' });
  const image = observed('image');
  const origin = observed('origin_price');
  const originPrice = finiteNumber(origin.value);
  const marketChecks = context.marketChecks || {};
  const market = name => {
    const m = marketChecks[name];
    if (!m || !m.checked_at || !publicUrl(m.source_url) || !['PRESENT', 'VERIFIED_ABSENT', 'VERIFIED_LOW_SUPPLY'].includes(m.presence)) {
      return { presence: 'UNKNOWN', price: provenance(), reason: m?.reason || 'No verificado', checked_at: m?.checked_at || null };
    }
    return { ...m, price: m.price?.status === 'OBSERVED' ? m.price : provenance() };
  };
  const tiendamia = market('tiendamia');
  const mercadolibre = market('mercadolibre');
  // Sourcing has no second landed-cost formula. Import analysis supplies a
  // complete, versioned quote from the existing country/pricing engine.
  const quote = context.economic;
  const quoteInputs = quote?.inputs || [];
  const validQuote = quote?.engine === 'CANONICAL_LANDED_COST' && quote.country === country &&
    ['origin_price', 'shipping', 'customs', 'fees'].every(f => quoteInputs.some(i => i.field === f && i.status === 'OBSERVED' && finiteNumber(i.value) !== null && finiteNumber(i.value) >= 0)) &&
    originPrice !== null && quoteInputs.some(i => i.field === 'origin_price' && finiteNumber(i.value) === originPrice) && finiteNumber(quote.landed_cost) > 0;
  const landed = validQuote ? provenance(Number(quote.landed_cost), 'DERIVED', quote.engine, sourceUrl, quote.observed_at, { derived_from: quoteInputs }) : provenance();
  const sale = quote?.sale_price?.status === 'OBSERVED' && finiteNumber(quote.sale_price.value) > 0 ? quote.sale_price : provenance();
  const margin = landed.value !== null && sale.value !== null
    ? provenance(Math.round((sale.value - landed.value) / sale.value * 10000) / 100, 'DERIVED', 'Collectibles', sourceUrl, quote.observed_at, { derived_from: [landed, sale] }) : provenance();

  const demand = observed('local_demand');
  const momentum = observed('global_momentum');
  const release = observed('release');
  const positiveDemand = finiteNumber(demand.value) > 0;
  const positiveMomentum = finiteNumber(momentum.value) > 0;
  const supplyGap = [tiendamia, mercadolibre].some(m => ['VERIFIED_ABSENT', 'VERIFIED_LOW_SUPPLY'].includes(m.presence));
  const independentInterest = [demand, momentum].some(d => finiteNumber(d.value) > 0 && [tiendamia, mercadolibre].every(m => !m.source_url || new URL(d.source_url).hostname !== new URL(m.source_url).hostname));
  const domains = new Set(observations.filter(o => o.field === 'identity').map(o => new URL(o.source_url).hostname.replace(/^www\./, '')));
  const factor = (points, max, reason, evidence) => ({ points, max, reason, confidence: evidence.length ? 'OBSERVED' : 'UNKNOWN', evidence });
  const breakdown = {
    global_momentum: factor(positiveMomentum ? Math.min(25, Number(momentum.value)) : 0, 25, positiveMomentum ? 'Interés global observado' : 'Momentum no verificado; un listing o preorder no demuestra demanda', positiveMomentum ? [momentum] : []),
    novelty: factor(release.value ? (release.value === 'PREORDER' ? 18 : 14) : 0, 20, release.value ? 'Lanzamiento o preventa observado en fuente' : 'Novedad no verificada', release.value ? [release] : []),
    source_confidence: factor(identity.value ? 10 : 0, 15, identity.value ? 'Identidad corroborada en ficha de producto' : 'Identidad pendiente de corroboración', identity.value ? [identity] : []),
    local_supply_gap: factor(supplyGap && independentInterest ? 15 : 0, 15, supplyGap && independentInterest ? 'Brecha verificada y evidencia independiente de interés' : 'La ausencia o un fallo técnico por sí solos no crean oportunidad', supplyGap && independentInterest ? [demand, momentum].filter(d => d.status === 'OBSERVED') : []),
    import_margin: factor(margin.value !== null ? (margin.value >= 30 ? 15 : margin.value >= 20 ? 10 : margin.value >= 10 ? 5 : 0) : 0, 15, margin.value !== null ? 'Margen derivado de costo canónico y precio de venta observado' : 'Margen no calculable', margin.value !== null ? [margin] : []),
    local_demand: factor(positiveDemand ? 10 : 0, 10, positiveDemand ? 'Interés local observado' : 'Sin evidencia local; no equivale a ausencia de demanda', positiveDemand ? [demand] : []),
    corroboration: factor(domains.size >= 2 ? Math.min(5, domains.size) : 0, 5, `${domains.size} fuentes independientes de identidad`, observations.filter(o => o.field === 'identity'))
  };
  const score = Object.values(breakdown).reduce((s, f) => s + f.points, 0);
  // Evidence quality/completeness, independent of whether commercial signals are positive.
  const coverage = [identity.value !== null, image.value !== null, originPrice !== null, demand.status === 'OBSERVED', momentum.status === 'OBSERVED', tiendamia.presence !== 'UNKNOWN' || mercadolibre.presence !== 'UNKNOWN', validQuote].filter(Boolean).length;
  const confidence = coverage === 0 ? null : Math.round(coverage / 7 * 100);
  const confidenceLevel = confidence === null ? 'UNKNOWN' : confidence >= 70 ? 'HIGH' : confidence >= 40 ? 'MEDIUM' : 'LOW';
  const imageUrl = publicUrl(image.value);
  const availability = observed('availability');
  const retailer = raw.retailer || raw.source_retailer || raw.retailer_source || 'No verificado';
  const sourcePrices = { amazon_price_usd: null, ebay_price_usd: null, bestbuy_price_usd: null };
  if (originPrice !== null && origin.currency === 'USD' && sourceUrl) {
    const host = new URL(origin.source_url || sourceUrl).hostname;
    if (/(^|\.)amazon\./.test(host)) sourcePrices.amazon_price_usd = originPrice;
    if (/(^|\.)ebay\./.test(host)) sourcePrices.ebay_price_usd = originPrice;
    if (/(^|\.)bestbuy\.com$/.test(host)) sourcePrices.bestbuy_price_usd = originPrice;
  }
  return {
    validation_version: CANDIDATE_VALIDATION_VERSION,
    id: raw.id || `candidate-${context.index ?? 0}-${context.createdAt || Date.now()}`,
    title, brand: raw.brand || 'No verificado', franchise: raw.franchise || '', line: raw.line || '', character: raw.character || '',
    category: raw.category || 'Coleccionables', image_url: imageUrl, gallery_images: imageUrl ? [imageUrl] : [],
    status: release.value === 'PREORDER' ? 'PREORDER' : release.value === 'NEW' ? 'NEW' : supplyGap && independentInterest ? 'OPPORTUNITY' : 'EMERGING',
    discovered_from: context.origin || raw.discovered_from || 'MANUAL_RESEARCH', country_code: country,
    trend_score: breakdown.global_momentum.points + breakdown.local_demand.points, opportunity_score: score, confidence_score: confidence, confidence_level: confidenceLevel,
    retailer_source: retailer, retailer_url: sourceUrl || '', asin: asin || undefined, sku: observed('sku').value || undefined, upc: observed('gtin').value || undefined,
    stock_status: ['IN_STOCK', 'PREORDER', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(availability.value) ? availability.value : 'UNKNOWN',
    pricing: { ...sourcePrices, origin_price_usd: origin.currency === 'USD' ? originPrice : null, tiendamia_price_usd: tiendamia.price?.currency === 'USD' ? tiendamia.price.value : null,
      mercadolibre_price_local: mercadolibre.price.value, mercadolibre_currency: mercadolibre.price.currency,
      landed_cost_estimated_usd: landed.value, suggested_sale_price_usd: sale.value, estimated_margin_percent: margin.value, currency: 'USD' },
    provenance: { identity, asin: identifier, sku: observed('sku'), upc: observed('gtin'), image, origin_price: origin, local_price: mercadolibre.price,
      availability, demand, momentum, release, landed_cost: landed, sale_price: sale, margin },
    market_presence: { tiendamia, mercadolibre },
    why_explanation: {
      headline: `Índice de oportunidad ${score}/100; confianza ${confidenceLevel}`,
      opportunity_type: supplyGap && independentInterest ? (positiveDemand ? 'SUPPLY_GAP_OPPORTUNITY' : 'EARLY_MARKET_OPPORTUNITY') : positiveDemand ? 'VALIDATED_LOCAL_OPPORTUNITY' : positiveMomentum ? 'GLOBAL_TREND' : 'RESEARCH_CANDIDATE',
      scoring_breakdown: breakdown,
      confidence_reason: `${coverage}/7 dimensiones corroboradas; ${domains.size} fuentes de identidad. Los datos no verificados no aumentan la confianza.`,
      local_demand_summary: breakdown.local_demand.reason, market_differential: 'Precios y costos sujetos a evidencia y análisis de importación.',
      stock_verdict: availability.value ? `Disponibilidad observada: ${availability.value}` : 'Stock no verificado',
      internal_signals: demand.status === 'OBSERVED' ? demand.source : 'Sin evidencia interna disponible', local_supply_gap: breakdown.local_supply_gap.reason,
      evidence_sources: observations.map(o => ({ name: o.source || retailer, type: o.source_type || 'RETAILER', url: o.source_url, confidence: null, date: o.observed_at, field: o.field, status: o.status }))
    },
    raw_evidence: observations.map((o, i) => ({ ...o, id: `evidence-${i}`, source_type: o.source_type || 'RETAILER', country: o.country || 'GLOBAL', signal_name: o.field, confidence: null, url: o.source_url, evidence_text: o.evidence_text })),
    economic: validQuote ? quote : undefined,
    claims: { ...raw, canonical_candidate: undefined }, created_at: raw.created_at || raw.discovered_at || context.createdAt || new Date().toISOString()
  };
}

export function canonicalCandidateKey(candidate) {
  return [candidate.title, candidate.brand, candidate.line, candidate.character, candidate.claims?.manufacturer, candidate.claims?.sku, candidate.claims?.size,
    candidate.claims?.edition, candidate.claims?.color, candidate.claims?.wave, candidate.claims?.version, candidate.claims?.packaging,
    candidate.claims?.exclusive_retailer, candidate.claims?.release_date].map(normalize).join('|');
}

export function deduplicateCanonicalCandidates(candidates) {
  const result = [];
  for (const candidate of candidates) {
    // Exact titles plus variant attributes; no brand/franchise fuzzy matching.
    const variant = canonicalCandidateKey(candidate);
    const match = result.find(c => c.variant === variant &&
      (!c.candidate.provenance.asin.value || !candidate.provenance.asin.value || c.candidate.provenance.asin.value === candidate.provenance.asin.value) &&
      (!c.candidate.claims?.asin || !candidate.claims?.asin || normalize(c.candidate.claims.asin) === normalize(candidate.claims.asin)));
    if (!match) { result.push({ variant, candidate }); continue; }
    const allObservations = [...match.candidate.raw_evidence, ...candidate.raw_evidence];
    const unique = [...new Map(allObservations.map(e => [`${e.field}|${e.source_url}|${JSON.stringify(e.value)}`, e])).values()];
    const mergedClaims = { ...match.candidate.claims, id: match.candidate.id };
    match.candidate = validateCandidate(mergedClaims, { country: candidate.country_code, origin: match.candidate.discovered_from, observations: unique, economic: match.candidate.economic || candidate.economic,
      marketChecks: { tiendamia: match.candidate.market_presence.tiendamia.presence !== 'UNKNOWN' ? match.candidate.market_presence.tiendamia : candidate.market_presence.tiendamia,
        mercadolibre: match.candidate.market_presence.mercadolibre.presence !== 'UNKNOWN' ? match.candidate.market_presence.mercadolibre : candidate.market_presence.mercadolibre } });
  }
  return result.map(r => r.candidate);
}

export function validateStoredCandidate(row) {
  const saved = row.evidence?.canonical_candidate;
  // Legacy numbers remain in claims; only recorded source observations can validate them.
  return validateCandidate({ ...(saved?.claims || row), id: row.id, created_at: row.discovered_at || saved?.created_at }, { country: row.country || saved?.country_code, origin: row.discovered_from || saved?.discovered_from,
    observations: saved?.raw_evidence || [], marketChecks: saved?.market_presence || {}, economic: saved?.economic, createdAt: row.discovered_at, index: row.id });
}

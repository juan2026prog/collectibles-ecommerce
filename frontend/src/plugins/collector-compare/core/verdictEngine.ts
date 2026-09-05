import type { ComparedProduct, DeterministicFacts, CollectorVerdict } from '../types/index';

/**
 * Deterministic facts extractor for product comparison.
 * Extracts strictly numerical and categorical facts before formatting or AI summary.
 */
export function extractDeterministicFacts(products: ComparedProduct[]): DeterministicFacts {
  const facts: DeterministicFacts = {
    lowest_price_product_id: null,
    highest_price_product_id: null,
    largest_height_product_id: null,
    smallest_height_product_id: null,
    most_accessories_product_id: null,
    most_articulated_product_id: null,
    available_locally_ids: [],
    in_stock_ids: [],
    international_ids: [],
    confirmed_scales: {}
  };

  if (!products || products.length === 0) return facts;

  // 1. Price comparison (converting to normalized USD approx if necessary for comparison)
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const p of products) {
    const isIntl = Boolean(p.is_international);
    // Compare in USD: if local UYU, divide by ~40 as baseline reference
    const rawPrice = isIntl 
      ? (p.intl_final_price_usd || p.intl_base_price_usd || p.base_price) 
      : (p.base_price / 40);

    if (typeof rawPrice === 'number' && rawPrice > 0) {
      if (rawPrice < minPrice) {
        minPrice = rawPrice;
        facts.lowest_price_product_id = p.id;
      }
      if (rawPrice > maxPrice) {
        maxPrice = rawPrice;
        facts.highest_price_product_id = p.id;
      }
    }

    // Availability & Origin
    if (!p.is_international) {
      facts.available_locally_ids.push(p.id);
    } else {
      facts.international_ids.push(p.id);
    }

    if (p.status === 'active' || p.status === 'available') {
      facts.in_stock_ids.push(p.id);
    }

    // Scale
    const scale = p.normalized_attributes?.scale?.display;
    if (scale && scale !== 'No informado') {
      facts.confirmed_scales[p.id] = scale.replace('Escala ', '');
    }

    // Height
    const heightCm = p.normalized_attributes?.height?.numeric_value;
    if (typeof heightCm === 'number' && heightCm > 0) {
      if (!facts.largest_height_product_id || (p.normalized_attributes?.height?.numeric_value || 0) > 
          (products.find(x => x.id === facts.largest_height_product_id)?.normalized_attributes?.height?.numeric_value || 0)) {
        facts.largest_height_product_id = p.id;
      }
      if (!facts.smallest_height_product_id || (p.normalized_attributes?.height?.numeric_value || 0) < 
          (products.find(x => x.id === facts.smallest_height_product_id)?.normalized_attributes?.height?.numeric_value || Infinity)) {
        facts.smallest_height_product_id = p.id;
      }
    }

    // Articulations
    const arts = p.normalized_attributes?.articulation_points?.numeric_value;
    if (typeof arts === 'number' && arts > 0) {
      if (!facts.most_articulated_product_id || arts > 
          (products.find(x => x.id === facts.most_articulated_product_id)?.normalized_attributes?.articulation_points?.numeric_value || 0)) {
        facts.most_articulated_product_id = p.id;
      }
    }
  }

  // If all products have the same price, don't declare a lowest
  if (minPrice === maxPrice) {
    facts.lowest_price_product_id = null;
    facts.highest_price_product_id = null;
  }

  return facts;
}

/**
 * Builds factual collector badges and natural language verdict exclusively from calculated facts.
 * NO subjective opinions (e.g. "is better", "best investment").
 */
export function generateCollectorVerdict(products: ComparedProduct[]): CollectorVerdict {
  const facts = extractDeterministicFacts(products);
  const badges: Record<string, string[]> = {};
  const findings: string[] = [];

  for (const p of products) {
    badges[p.id] = [];

    // Lowest price badge
    if (facts.lowest_price_product_id === p.id) {
      badges[p.id].push('Mejor Precio');
      findings.push(`"${p.title}" es la opción de menor precio visible.`);
    }

    // Local availability badge
    if (facts.available_locally_ids.includes(p.id)) {
      badges[p.id].push('Disponible Localmente');
      findings.push(`"${p.title}" cuenta con stock en plaza uruguaya para retiro o envío inmediato.`);
    }

    // In stock now badge
    if (facts.in_stock_ids.includes(p.id) && !badges[p.id].includes('Disponible Localmente')) {
      badges[p.id].push('En Stock');
    }

    // Height badges
    if (facts.largest_height_product_id === p.id && products.length > 1) {
      badges[p.id].push('Mayor Tamaño');
      const h = p.normalized_attributes?.height?.display;
      if (h) findings.push(`"${p.title}" tiene la mayor altura registrada (${h}).`);
    }

    // Articulation badge
    if (facts.most_articulated_product_id === p.id && products.length > 1) {
      badges[p.id].push('Más Articulado');
      const pts = p.normalized_attributes?.articulation_points?.display;
      if (pts) findings.push(`"${p.title}" ofrece mayor rango de posabilidad confirmada (${pts}).`);
    }

    // Scale badge
    if (facts.confirmed_scales[p.id]) {
      badges[p.id].push(`Escala ${facts.confirmed_scales[p.id]}`);
    }
  }

  // Generate summary
  let summary = 'Comparativa basada en especificaciones técnicas de catálogo y disponibilidad.';
  if (findings.length > 0) {
    summary = findings.slice(0, 3).join(' ');
  }

  return {
    summary,
    key_findings: findings,
    badges_by_product: badges,
    generated_at: new Date().toISOString()
  };
}

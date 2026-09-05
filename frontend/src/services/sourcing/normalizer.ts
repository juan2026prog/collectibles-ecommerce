import type { 
  NormalizedProduct, 
  SourceOffer, 
  ProductType, 
  LandedCostBreakdown
} from '../../types/sourcing';
import type { RawProductExtraction } from './adapters/SourceAdapter';
import { evaluateAuthenticityGate } from './authenticityGate';
import { selectBestSource } from './bestSourceSelector';
import { calculateInternationalPricing } from '../../lib/internationalPricing';
import { checkUruguayMarketSync } from './uruguayMarketIntelligence';

/**
 * Limpia y estandariza cadenas de texto para deduplicación
 */
export function cleanKeyString(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Genera una huella digital para agrupar ofertas del mismo producto.
 * Si existe UPC/EAN, la huella es el UPC/EAN.
 * Si no, combina marca + personaje/línea + número/variante o título clave.
 */
export function generateDeduplicationFingerprint(item: {
  title: string;
  brand?: string;
  license?: string;
  character?: string;
  upc?: string;
  mpn?: string;
  asin?: string;
}): string {
  if (item.upc && item.upc.trim().length >= 8) {
    return `UPC_${cleanKeyString(item.upc)}`;
  }
  if (item.mpn && item.mpn.trim().length >= 4) {
    return `MPN_${cleanKeyString(item.brand)}_${cleanKeyString(item.mpn)}`;
  }

  // Extracción inteligente de entidades del título
  const titleNorm = (item.title || '').toLowerCase();
  
  let brandKey = cleanKeyString(item.brand);
  if (!brandKey) {
    if (titleNorm.includes('mcfarlane')) brandKey = 'mcfarlane';
    else if (titleNorm.includes('neca')) brandKey = 'neca';
    else if (titleNorm.includes('hasbro')) brandKey = 'hasbro';
    else if (titleNorm.includes('funko')) brandKey = 'funko';
    else brandKey = 'gen';
  }

  // Detectar personaje principal o línea
  let coreKey = '';
  const keyFigures = [
    'batman detective comics',
    'batman hush',
    'batman',
    'spawn',
    'superman',
    'joker',
    'flash',
    'wonder woman',
    'spider-man',
    'iron man',
    'wolverine',
    'darth vader',
    'mandalorian',
    'boba fett',
    'goku',
    'vegeta'
  ];

  for (const kf of keyFigures) {
    if (titleNorm.includes(kf)) {
      coreKey = cleanKeyString(kf);
      break;
    }
  }

  if (!coreKey) {
    // Si no coincide con ninguno conocido, tomar las primeras palabras significativas del título
    const words = item.title
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter(w => !['the', 'action', 'figure', 'inch', 'series', 'toys'].includes(w.toLowerCase()))
      .slice(0, 3)
      .join('');
    coreKey = cleanKeyString(words);
  }

  return `NORM_${brandKey}_${coreKey}`;
}

/**
 * Genera el SKU Canónico estable de Collectibles.
 * Formato: COL-[BRAND]-[LICENSE]-[KEY]-[HASH]
 */
export function generateCanonicalSku(
  brand: string, 
  license: string, 
  character: string, 
  sourceId: string
): string {
  let b = 'COL';
  const brandLower = (brand || '').toLowerCase();
  if (brandLower.includes('mcfarlane')) b = 'MCFARLANE';
  else if (brandLower.includes('neca')) b = 'NECA';
  else if (brandLower.includes('hasbro')) b = 'HASBRO';
  else if (brandLower.includes('bandai')) b = 'BANDAI';
  else if (brandLower.includes('funko')) b = 'FUNKO';
  else b = (cleanKeyString(brand) || 'BRAND').toUpperCase().slice(0, 10);

  let l = 'GEN';
  const licLower = (license || '').toLowerCase();
  if (licLower.includes('dc')) l = 'DC';
  else if (licLower.includes('marvel')) l = 'MARVEL';
  else if (licLower.includes('star wars')) l = 'STARWARS';
  else if (licLower.includes('pokemon')) l = 'POKEMON';
  else if (licLower.includes('spawn') || licLower.includes('image')) l = 'IMAGE';
  else l = (cleanKeyString(license) || 'LIC').toUpperCase().slice(0, 8);

  const c = (cleanKeyString(character) || 'ITEM').toUpperCase().slice(0, 12);
  const hash = Math.abs(
    (sourceId + b + c).split('').reduce((acc, char) => acc * 31 + char.charCodeAt(0), 7)
  ).toString(36).toUpperCase().slice(0, 6);

  return `COL-${b}-${l}-${c}-${hash}`;
}

/**
 * Infiere licencia, personaje y escala a partir del título y marca
 */
export function inferProductMetadata(title: string, brandHint?: string) {
  const lower = title.toLowerCase();
  
  let brand = brandHint || 'McFarlane Toys';
  if (lower.includes('mcfarlane')) brand = 'McFarlane Toys';
  else if (lower.includes('neca')) brand = 'NECA';
  else if (lower.includes('hasbro')) brand = 'Hasbro';
  else if (lower.includes('bandai')) brand = 'Bandai Spirits';
  else if (lower.includes('funko')) brand = 'Funko';

  let license = 'DC Comics';
  if (lower.includes('marvel') || lower.includes('spider-man') || lower.includes('avengers')) license = 'Marvel';
  else if (lower.includes('star wars') || lower.includes('black series')) license = 'Star Wars';
  else if (lower.includes('pokemon')) license = 'Pokémon';
  else if (lower.includes('dragon ball')) license = 'Dragon Ball';
  else if (lower.includes('spawn')) license = 'Image Comics';
  else if (lower.includes('ghostbusters')) license = 'Ghostbusters';

  let character = '';
  if (lower.includes('batman')) character = 'Batman';
  else if (lower.includes('superman')) character = 'Superman';
  else if (lower.includes('spawn')) character = 'Spawn';
  else if (lower.includes('joker')) character = 'The Joker';
  else if (lower.includes('spider-man')) character = 'Spider-Man';
  else if (lower.includes('darth vader')) character = 'Darth Vader';
  else character = title.split(' ')[0] || 'Character';

  let scale = '7"';
  if (lower.includes('1/6') || lower.includes('1:6')) scale = '1/6';
  else if (lower.includes('6 inch') || lower.includes('6"')) scale = '6"';
  else if (lower.includes('1/12') || lower.includes('1:12')) scale = '1/12';
  else if (lower.includes('7 inch') || lower.includes('7"')) scale = '7"';

  return { brand, license, character, scale };
}

/**
 * Normaliza y deduplica una lista de ofertas crudas agrupándolas en NormalizedProducts únicos.
 */
export function normalizeAndDeduplicateOffers(
  extractions: { raw: RawProductExtraction; offer: SourceOffer; inputMeta?: any }[]
): NormalizedProduct[] {
  const groups = new Map<string, { raw: RawProductExtraction; offer: SourceOffer; inputMeta?: any }[]>();

  // 1. Agrupar por huella digital
  for (const item of extractions) {
    const meta = inferProductMetadata(item.raw.title, item.raw.brand || item.inputMeta?.brand);
    const fp = generateDeduplicationFingerprint({
      title: item.raw.title,
      brand: item.raw.brand || meta.brand,
      license: item.inputMeta?.license || meta.license,
      character: meta.character,
      upc: item.raw.upc || item.inputMeta?.upc,
      mpn: item.raw.mpn || item.inputMeta?.mpn,
      asin: item.raw.source === 'amazon' ? item.raw.source_product_id : undefined
    });

    if (!groups.has(fp)) {
      groups.set(fp, []);
    }
    groups.get(fp)!.push(item);
  }

  const normalizedList: NormalizedProduct[] = [];

  // 2. Construir NormalizedProduct por cada grupo
  for (const [fingerprint, items] of groups.entries()) {
    const primary = items[0];
    const offers = items.map(it => it.offer);
    
    // Elegir la mejor oferta algorítmicamente
    const { bestOffer } = selectBestSource(offers);
    const selectedOffer = bestOffer;

    const meta = inferProductMetadata(primary.raw.title, primary.inputMeta?.brand || primary.raw.brand);
    const brand = primary.inputMeta?.brand || primary.raw.brand || meta.brand;
    const license = primary.inputMeta?.license || meta.license;
    const character = primary.inputMeta?.character || meta.character;
    const scale = primary.inputMeta?.scale || meta.scale;

    // Código Canónico
    const canonicalSku = generateCanonicalSku(
      brand, 
      license, 
      character, 
      primary.raw.source_product_id
    );

    // Calcular costos y rentabilidad sobre la oferta seleccionada
    const pricing = calculateInternationalPricing({
      amazonPrice: selectedOffer.price,
      usaShipping: selectedOffer.domestic_shipping
    });

    const financials: LandedCostBreakdown = {
      origin_price_usd: selectedOffer.price,
      usa_shipping_usd: selectedOffer.domestic_shipping,
      sales_tax_usd: pricing.salesTax,
      zinc_fee_usd: pricing.zincFee,
      financial_fee_usd: pricing.financialFeeTotal,
      urubox_courier_usd: 0, // Urubox base
      other_costs_usd: 0,
      real_cost_puesto_usd: pricing.realCost,
      suggested_sale_price_usd: pricing.finalPrice,
      current_sale_price_usd: pricing.finalPrice,
      profit_usd: pricing.estimatedProfit,
      margin_percent: pricing.netMarginPercentage,
      profit_protection_status: pricing.estimatedProfit <= 0 ? 'BLOCKED' : (pricing.profitProtectionTriggered ? 'WARNING' : 'PASS'),
      profit_protection_reason: pricing.pricingProtectionReason
    };

    // Authenticity Gate
    const authenticity = evaluateAuthenticityGate({
      title: primary.raw.title,
      brand,
      license,
      seller: selectedOffer.seller,
      retailer: selectedOffer.source,
      upc: primary.raw.upc || primary.inputMeta?.upc,
      price: selectedOffer.price
    });

    // Uruguay Market Intelligence
    const uruguayMarket = checkUruguayMarketSync({
      title: primary.raw.title,
      character,
      brand,
      collectiblesPriceUsd: financials.current_sale_price_usd
    });

    // Determinar tipo de producto
    let productType: ProductType = 'EVERGREEN';
    if (primary.inputMeta?.reason) {
      productType = primary.inputMeta.reason as ProductType;
    } else if (selectedOffer.availability === 'preorder') {
      productType = 'PREORDER';
    } else if (primary.raw.title.toLowerCase().includes('retro') || primary.raw.title.toLowerCase().includes('classic')) {
      productType = 'RETRO';
    } else if (primary.raw.title.toLowerCase().includes('exclusive') || brand.toLowerCase().includes('mcfarlane')) {
      productType = 'COLLECTIBLES_PICK';
    }

    // Opportunity Score (0-100)
    let oppScore = 65;
    if (uruguayMarket.market_verdict === 'MUCHO_MAS_BARATO') oppScore += 20;
    if (financials.margin_percent >= 25) oppScore += 15;
    if (authenticity.status === 'VERIFIED_OFFICIAL') oppScore += 10;
    if (selectedOffer.source === 'amazon') oppScore += 5;
    oppScore = Math.min(100, Math.max(10, oppScore));

    // Catalog Value Score (0-100)
    let catValScore = 80;
    if (brand.toLowerCase().includes('mcfarlane') || brand.toLowerCase().includes('neca')) catValScore += 15;
    if (license === 'DC Comics' || license === 'Marvel') catValScore += 5;
    catValScore = Math.min(100, catValScore);

    normalizedList.push({
      id: `norm-${fingerprint}`,
      canonical_sku: canonicalSku,
      title: primary.raw.title,
      brand,
      license,
      line: primary.inputMeta?.line || 'Collector Series',
      character,
      scale,
      category_name: 'Figuras de Acción',
      upc: primary.raw.upc || primary.inputMeta?.upc,
      asin: primary.raw.source === 'amazon' ? primary.raw.source_product_id : undefined,
      image_url: primary.raw.image_url || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop',
      gallery_images: primary.raw.gallery_images || [],
      offers,
      selected_source_id: selectedOffer.id,
      best_source_id: bestOffer.id,
      financials,
      authenticity,
      uruguay_market: uruguayMarket,
      catalog_status: 'NOT_IN_CATALOG', // se actualiza contra catálogo de Collectibles
      product_type: productType,
      tags: primary.inputMeta?.tags || ['evergreen', 'collector'],
      curation_reason: primary.inputMeta?.reason || 'Selección de catálogo internacional',
      opportunity_score: oppScore,
      catalog_value_score: catValScore,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_live_check_at: new Date().toISOString()
    });
  }

  return normalizedList;
}

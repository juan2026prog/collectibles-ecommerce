import type { ReleaseEvent, ReleaseStatus, ReleasePrecision, RadarSignal, ImageSemanticType, EditorialRelevanceType, SourceTier } from '../types';
import { supabase } from '../../../lib/supabase';
import { radarIntelligence, releaseIntelligence, type IntelligenceEvidence } from '../../../services/intelligence/collectiblesIntelligence';

export interface EditorialRelevanceResult {
  type: EditorialRelevanceType;
  score: number;
  reason: string;
  isPublishable: boolean;
}

/**
 * Clasifica y puntúa la relevancia editorial de una noticia o lanzamiento para coleccionistas.
 * - Score >= 80: Apto para auto-publicar (si tiene imagen válida).
 * - Score 60-79: DRAFT para revisión editorial humana.
 * - Score < 60: Rechazado / Irrelevante (DRAFT / descarte).
 */
export function classifyEditorialRelevance(
  title: string = '',
  summaryOrContent: string = '',
  sourceName: string = ''
): EditorialRelevanceResult {
  const combined = `${title} ${summaryOrContent} ${sourceName}`.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // 1. RECHAZO INMEDIATO: Temas irrelevantes para coleccionistas (música, empleo, corporativo, sorteos genéricos)
  if (/\b(mixtape|playlist|album|tracklist|music\s*video|spotify|apple\s*music|bandcamp)\b/i.test(combined)) {
    return {
      type: 'MUSIC_CONTENT',
      score: 15,
      reason: 'Contenido musical o playlist sin figuras ni coleccionables',
      isPublishable: false
    };
  }

  if (/\b(hiring|we'?re\s*hiring|careers?|job\s*opening|empleo|vacante|puesto\s*abierto|join\s*our\s*team)\b/i.test(combined)) {
    return {
      type: 'JOB_POST',
      score: 10,
      reason: 'Búsqueda laboral o post de reclutamiento corporativo',
      isPublishable: false
    };
  }

  if (/\b(giveaway|sweepstakes|concurso|sorteo|win\s*a\s*free|participa\s*para\s*ganar)\b/i.test(combined)) {
    return {
      type: 'GIVEAWAY',
      score: 35,
      reason: 'Concurso o sorteo promocional genérico',
      isPublishable: false
    };
  }

  if (/\b(store\s*hours|holiday\s*hours|warehouse\s*moving|corporate\s*announcement|annual\s*report|investor\s*relations|financial\s*results)\b/i.test(combined)) {
    return {
      type: 'CORPORATE_CONTENT',
      score: 25,
      reason: 'Anuncio corporativo, horarios o logística institucional',
      isPublishable: false
    };
  }

  if (/\b(t-?shirt|hoodie|apparel|sneaker|shoes|socks|beverage|coffee|recipe|lifestyle)\b/i.test(lowerTitle) && !/\b(figure|figura|statue|estatua|toy|collectible|hasbro|neca|funko)\b/i.test(combined)) {
    return {
      type: 'LIFESTYLE_CONTENT',
      score: 40,
      reason: 'Contenido de indumentaria o lifestyle no relacionado con coleccionables',
      isPublishable: false
    };
  }

  // 2. DETECCIÓN ALTA RELEVANCIA EDITORIAL (Score >= 80)
  // Licencias nuevas
  if (/\b(new\s*licenses?|nuevas?\s*licencias?|licensing\s*agreement|rights\s*acquired)\b/i.test(combined)) {
    return {
      type: 'NEW_LICENSE',
      score: 85,
      reason: 'Anuncio de nueva licencia oficial para coleccionables',
      isPublishable: true
    };
  }

  // Preventas / Pre-orders
  if (/\b(pre-?order|preventa|preorder\s*open|reserva|up\s*for\s*pre-?order)\b/i.test(combined)) {
    return {
      type: 'PREORDER',
      score: 95,
      reason: 'Apertura o disponibilidad de preventa de coleccionable',
      isPublishable: true
    };
  }

  // Restock / Reissue
  if (/\b(restock|re-?stock|reissue|re-?issue|reedici[oó]n|back\s*in\s*stock|vuelve\s*a\s*stock)\b/i.test(combined)) {
    return {
      type: 'RESTOCK',
      score: 90,
      reason: 'Restock o reedición oficial confirmada',
      isPublishable: true
    };
  }

  // Exclusivas / Convenciones
  if (/\b(exclusive|exclusiv[ao]|sdcc|nycc|hasbro\s*pulsecon|convention\s*exclusive|retailer\s*exclusive|haslab)\b/i.test(combined)) {
    return {
      type: 'EXCLUSIVE',
      score: 95,
      reason: 'Ítem exclusivo de convención, retailer o crowdfunding',
      isPublishable: true
    };
  }

  // Nuevas Waves o Líneas
  if (/\b(wave\s*\d+|nueva\s*wave|new\s*line|nueva\s*l[ií]nea|action\s*figure\s*line|series\s*\d+)\b/i.test(combined)) {
    return {
      type: 'NEW_WAVE',
      score: 90,
      reason: 'Presentación de nueva wave o serie de figuras',
      isPublishable: true
    };
  }

  // Anuncios de productos, figuras, estatuas, LEGO o juguetes coleccionables
  const hasProductKeywords = /\b(figure|figura|action\s*figure|statue|estatua|bust|busto|lego|set|funko|pop!|pop|hot\s*toys|ultimates|marvel\s*legends|transformers|g\.i\.\s*joe|mythic\s*legions|sh\s*figuarts|mafex|nendoroid|model\s*kit|gunpla|mecha|die-?cast|prop\s*replica)\b/i.test(combined);
  const hasActionVerb = /\b(revealed|reveal|unveiled|announced|announcement|first\s*look|first\s*look|preview|teaser|launched|available\s*now|released|in-?hand|shipping)\b/i.test(combined);

  if (hasProductKeywords && hasActionVerb) {
    return {
      type: 'PRODUCT_ANNOUNCEMENT',
      score: 92,
      reason: 'Anuncio o revelación formal de nuevo coleccionable',
      isPublishable: true
    };
  }

  if (hasProductKeywords) {
    return {
      type: 'PRODUCT_ANNOUNCEMENT',
      score: 82,
      reason: 'Coleccionable verificado en título o contenido',
      isPublishable: true
    };
  }

  // Colaboraciones
  if (/\b(collaboration|collab|crossover|x\s+super7|x\s+hasbro|x\s+neca)\b/i.test(combined)) {
    return {
      type: 'COLLABORATION',
      score: 80,
      reason: 'Colaboración o crossover oficial de marcas de coleccionables',
      isPublishable: true
    };
  }

  // Franquicia importante o tendencia de coleccionismo
  if (/\b(star\s*wars|marvel|dc\s*comics|batman|superman|transformers|tmnt|motu|dragon\s*ball|pokemon|one\s*piece|godzilla)\b/i.test(combined)) {
    return {
      type: 'FRANCHISE_NEWS',
      score: 75,
      reason: 'Noticia de franquicia coleccionable relevante (score medio, revisión recomendada)',
      isPublishable: false
    };
  }

  // Catch-all
  return {
    type: 'UNKNOWN',
    score: 50,
    reason: 'Sin palabras clave concluyentes de coleccionismo',
    isPublishable: false
  };
}

export interface RadarAIExtractedRelease {
  id?: string;
  title: string;
  slug: string;
  subtitle?: string | null;
  description?: string | null;
  summary?: string | null;
  brand_id?: string | null;
  license_id?: string | null;
  manufacturer: string;
  product_line?: string | null;
  franchise?: string | null;
  character?: string | null;
  category?: string | null;
  scale?: string | null;
  status: ReleaseStatus;
  msrp?: number | null;
  currency: string;
  region: string;
  announcement_date?: string | null;
  preorder_date?: string | null;
  estimated_release_date?: string | null;
  release_date_start?: string | null;
  release_date_end?: string | null;
  release_precision: ReleasePrecision;
  date_display_text?: string | null;
  catalog_product_id?: string | null;
  source_name: string;
  source_url: string;
  official_image_url?: string | null;
  image_source_url?: string | null;
  image_match_score: number;
  confidence_score: number;
  radar_signal: RadarSignal;
  radar_why: string;
  radar_context?: string | null;
  approval_status: 'DRAFT' | 'VERIFIED' | 'PUBLISHED' | 'ARCHIVED';
  is_verified: boolean;
  is_published: boolean;
  is_featured: boolean;
  image_semantic_type?: ImageSemanticType | null;
  raw_source_data?: any;
}

export interface ImageValidationResult {
  isValid: boolean;
  score: number;
  reason: string;
  finalImageUrl: string | null;
  provenance?: 'OFFICIAL_MANUFACTURER' | 'OFFICIAL_RETAILER' | 'AMAZON_PRODUCT' | 'SOURCE_PAGE' | 'MARKETPLACE' | 'NONE';
  semanticType: ImageSemanticType;
  isPublishable: boolean;
}

const KNOWN_MANUFACTURERS = [
  'NECA',
  'Hasbro',
  'Hasbro Pulse',
  'Bandai Spirits',
  'Tamashii Nations',
  'Hot Toys',
  'Mattel',
  'Mattel Creations',
  'McFarlane Toys',
  'Funko',
  'Super7',
  'Iron Studios',
  'Sideshow',
  'LEGO',
  'Good Smile Company',
  'Medicom Toy',
  'Mezco Toyz',
  'Playmates',
  'Jada Toys',
  'Jakks Pacific'
];

const KNOWN_FRANCHISES = [
  'Marvel',
  'DC Comics',
  'Star Wars',
  'Dragon Ball',
  'Godzilla',
  'Transformers',
  'Masters of the Universe',
  'MOTU',
  'Alien',
  'Predator',
  'Horror',
  'Halloween',
  'Friday the 13th',
  'Nightmare on Elm Street',
  'Chucky',
  'Scream',
  'Disney',
  'Batman',
  'Spider-Man',
  'X-Men',
  'Star Trek',
  'G.I. Joe',
  'Teenage Mutant Ninja Turtles',
  'TMNT',
  'Gundam',
  'Pokemon',
  'One Piece',
  'Naruto'
];

/**
 * Normaliza un string para slugs y deduplicación.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Valida y calcula el Match Score de una imagen para un release.
 * Evita asignar fotos de otros personajes o marcas.
 */
export function validateAndScoreImage(
  releaseInfo: { title: string; manufacturer?: string; franchise?: string; character?: string; variant?: string },
  imageUrl?: string | null,
  imageSourceUrl?: string | null
): ImageValidationResult {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return {
      isValid: false,
      score: 0,
      reason: 'Sin imagen provista',
      finalImageUrl: null
    };
  }

  const cleanUrl = imageUrl.trim();
  const lowerUrl = cleanUrl.toLowerCase();

  // Validación básica de URL
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('/')) {
    return {
      isValid: false,
      score: 0,
      reason: 'URL inválida',
      finalImageUrl: null
    };
  }

  // Validación semántica estricta de imagen:
  // Rechazo explícito de LOGOS, BANNERS, HEADERS, FAVICONS, SOCIAL SHARES y BRANDING.
  const isLogoOrBranding =
    /logo|brand-logo|site-logo|retailer-logo|icon|favicon|avatar|sprite/i.test(lowerUrl) ||
    /pulse-social|social-square|social-share|og-default|default-og|share-image|share_image/i.test(lowerUrl);

  const isBannerOrHero =
    /banner|header|masthead|hero-banner|category-banner|collection-banner|site-header|newsletter/i.test(lowerUrl);

  if (isLogoOrBranding) {
    return {
      isValid: false,
      score: 0,
      reason: 'La imagen es un logo o branding institucional, no el producto exacto',
      finalImageUrl: null,
      provenance: 'NONE',
      semanticType: 'BRAND_LOGO',
      isPublishable: false
    };
  }

  if (isBannerOrHero) {
    return {
      isValid: false,
      score: 0,
      reason: 'La imagen es un banner o header del sitio, no el producto exacto',
      finalImageUrl: null,
      provenance: 'NONE',
      semanticType: 'SITE_BANNER',
      isPublishable: false
    };
  }

  // Filtrar placeholders genéricos no confiables o imágenes aleatorias de Unsplash/Pexels/LoremFlickr
  const isGenericStock = 
    lowerUrl.includes('placeholder.com') || 
    lowerUrl.includes('via.placeholder') ||
    lowerUrl.includes('picsum.photos') ||
    lowerUrl.includes('unsplash.com') ||
    lowerUrl.includes('pexels.com');

  if (isGenericStock) {
    return {
      isValid: false,
      score: 0.1,
      reason: 'Imagen genérica de stock no autorizada para Radar',
      finalImageUrl: null,
      provenance: 'NONE',
      semanticType: 'FRANCHISE_GENERIC',
      isPublishable: false
    };
  }

  let score = 0.65;

  // Si se declara una página fuente, una imagen de un marketplace distinto no puede
  // hacerse pasar por "oficial". Mejor no mostrar imagen que mostrar otro producto.
  if (imageSourceUrl) {
    try {
      const imageHost = new URL(cleanUrl, 'https://collectibles.uy').hostname.toLowerCase().replace(/^www\./, '');
      const sourceHost = new URL(imageSourceUrl, 'https://collectibles.uy').hostname.toLowerCase().replace(/^www\./, '');
      const marketplaceImage = imageHost.includes('mlstatic.com') || imageHost.includes('amazon') || imageHost.includes('ebay');
      const sourceIsMarketplace = sourceHost.includes('mercadolibre') || sourceHost.includes('amazon') || sourceHost.includes('ebay');
      if (marketplaceImage && !sourceIsMarketplace) {
        return {
          isValid: false,
          score: 0,
          reason: 'La imagen pertenece a un marketplace distinto de la fuente declarada',
          finalImageUrl: null,
          provenance: 'MARKETPLACE',
          semanticType: 'WRONG_PRODUCT',
          isPublishable: false
        };
      }
    } catch {
      // La validación básica de URL ya se ejecutó arriba.
    }
  }

  // Si proviene de un dominio oficial del fabricante o CDN de producto oficial de Amazon
  const isAmazonProduct = lowerUrl.includes('media-amazon.com') || lowerUrl.includes('ssl-images-amazon.com');
  const isOfficialDomain = 
    lowerUrl.includes('hasbro') || 
    lowerUrl.includes('neca') || 
    lowerUrl.includes('tamashii') || 
    lowerUrl.includes('bandai') || 
    lowerUrl.includes('hottoys') || 
    lowerUrl.includes('mattel') || 
    lowerUrl.includes('mcfarlane') || 
    lowerUrl.includes('sideshow') ||
    lowerUrl.includes('super7') ||
    lowerUrl.includes('lego') ||
    lowerUrl.includes('funko');

  if (isOfficialDomain) {
    score = 0.98;
  } else if (isAmazonProduct && imageSourceUrl && imageSourceUrl.toLowerCase().includes('amazon')) {
    score = 0.95;
  }

  // Coherencia semántica básica con el nombre o personaje
  const titleWords = (releaseInfo.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const matchedWords = titleWords.filter(w => lowerUrl.includes(w));
  if (matchedWords.length > 0) {
    score = Math.min(1.0, score + 0.2);
  }

  // Una URL externa sin evidencia semántica ni dominio oficial queda por debajo
  // del umbral. Evita scores altos automáticos para fotos genéricas.
  if (!isOfficialDomain && !isAmazonProduct && matchedWords.length === 0) {
    score = Math.min(score, 0.65);
  }

  let provenance: ImageValidationResult['provenance'] = 'NONE';
  if (score >= 0.7) {
    if (isOfficialDomain) provenance = 'OFFICIAL_MANUFACTURER';
    else if (isAmazonProduct || lowerUrl.includes('amazon.com')) provenance = 'AMAZON_PRODUCT';
    else if (lowerUrl.includes('brickset.com') || lowerUrl.includes('bigbadtoystore.com')) provenance = 'OFFICIAL_RETAILER';
    else provenance = 'SOURCE_PAGE';
  }

  const isValid = score >= 0.7;
  let semanticType: ImageSemanticType = 'UNVERIFIED';

  // Si se especifica una variante pero la imagen menciona explícitamente otra distinta o wave discordante:
  const isDifferentWaveOrVariant = 
    /different-wave|other-wave|wrong-variant|different-character/i.test(lowerUrl) ||
    (releaseInfo.variant && /ultra-instinct|damage-ver|awakening/i.test(lowerUrl) && !releaseInfo.variant.toLowerCase().includes('ultra') && !releaseInfo.variant.toLowerCase().includes('awakening'));

  if (isDifferentWaveOrVariant) {
    semanticType = 'WRONG_VARIANT';
  } else if (isValid) {
    if (releaseInfo.variant && (lowerUrl.includes(releaseInfo.variant.toLowerCase().slice(0, 4)) || lowerUrl.includes('variant') || lowerUrl.includes('glow'))) {
      semanticType = 'PRODUCT_VARIANT_VERIFIED';
    } else {
      semanticType = 'PRODUCT_EXACT';
    }
  }

  const isPublishable = isValid && (semanticType === 'PRODUCT_EXACT' || semanticType === 'PRODUCT_VARIANT_VERIFIED');

  return {
    isValid: isPublishable,
    score: isPublishable ? score : Math.min(score, 0.4),
    reason: isPublishable ? 'Imagen verificada del producto' : (semanticType === 'WRONG_VARIANT' ? 'Variante incorrecta detectada en imagen' : 'Score insuficiente de coincidencia'),
    finalImageUrl: isPublishable ? cleanUrl : null,
    provenance: isPublishable ? provenance : 'NONE',
    semanticType,
    isPublishable
  };
}

/**
 * Deduplicador: detecta si un nuevo release coincide con uno ya existente en DB.
 */
export function deduplicateRelease(
  existingReleases: ReleaseEvent[],
  candidate: Partial<RadarAIExtractedRelease>
): { isDuplicate: boolean; matchedRelease?: ReleaseEvent; similarityReason?: string } {
  if (!candidate.title) return { isDuplicate: false };

  const candidateSlug = candidate.slug || slugify(candidate.title);
  const normTitle = candidate.title.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const item of existingReleases) {
    // 1. Coincidencia exacta de Slug o ID
    if (item.id === candidate.id || item.slug === candidateSlug) {
      return { isDuplicate: true, matchedRelease: item, similarityReason: 'Slug o ID idéntico' };
    }

    // 2. Coincidencia de Source URL idéntica
    if (candidate.source_url && item.source_url && candidate.source_url.toLowerCase().trim() === item.source_url.toLowerCase().trim()) {
      return { isDuplicate: true, matchedRelease: item, similarityReason: 'URL de fuente exacta' };
    }

    // 3. Coincidencia por fabricante + título normalizado
    const itemNormTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const itemManuf = (item.manufacturer || (item as any).brand?.name || '').toLowerCase();
    const candManuf = (candidate.manufacturer || (candidate as any).brand_name || '').toLowerCase();

    if (itemNormTitle === normTitle && (itemManuf === candManuf || !itemManuf || !candManuf)) {
      return { isDuplicate: true, matchedRelease: item, similarityReason: 'Mismo fabricante y título normalizado' };
    }
  }

  return { isDuplicate: false };
}

/**
 * Parser heurístico determinístico para extraer datos estructurados desde texto o URLs de novedades.
 */
export async function parseReleaseHeuristically(input: {
  text?: string;
  url?: string;
  sourceName?: string;
  manufacturerHint?: string;
}): Promise<RadarAIExtractedRelease[]> {
  const content = (input.text || '').trim();
  const sourceUrl = (input.url || '').trim();
  const sourceName = input.sourceName || 'Sitio Oficial';

  // Detección heurística estructurada
  const lower = (content + ' ' + sourceUrl).toLowerCase();

  // 1. Detectar Fabricante
  let manufacturer = input.manufacturerHint || 'Coleccionables';
  for (const m of KNOWN_MANUFACTURERS) {
    if (lower.includes(m.toLowerCase())) {
      manufacturer = m;
      break;
    }
  }

  // 2. Detectar Franquicia
  let franchise = 'General';
  for (const f of KNOWN_FRANCHISES) {
    if (lower.includes(f.toLowerCase())) {
      franchise = f;
      break;
    }
  }

  // 3. Detectar Escala
  let scale = '1:12';
  if (lower.includes('1:6') || lower.includes('sixth scale') || lower.includes('1/6')) scale = '1:6';
  else if (lower.includes('1:4') || lower.includes('quarter scale') || lower.includes('1/4')) scale = '1:4';
  else if (lower.includes('1:10') || lower.includes('7 inch') || lower.includes('7"')) scale = '1:10';
  else if (lower.includes('1:18') || lower.includes('3.75')) scale = '1:18';
  else if (lower.includes('1:12') || lower.includes('6 inch') || lower.includes('6"')) scale = '1:12';

  // 4. Detectar Estado y Señal
  let status: ReleaseStatus = 'ANNOUNCED';
  let radar_signal: RadarSignal = 'NUEVO_ANUNCIO';
  let radar_why = 'Nuevo lanzamiento anunciado para el universo de coleccionistas.';

  if (lower.includes('preorder') || lower.includes('preventa') || lower.includes('pre-order')) {
    status = 'PREORDER_OPEN';
    if (lower.includes('cerrando') || lower.includes('closing') || lower.includes('last chance')) {
      radar_signal = 'PREVENTA_CERRANDO';
      radar_why = 'Ventana de preventa oficial en su tramo final.';
    } else {
      radar_signal = 'PREVENTA_ABIERTA';
      radar_why = 'Preventa oficial abierta para reservas anticipadas.';
    }
  } else if (lower.includes('released') || lower.includes('disponible') || lower.includes('en stock') || lower.includes('in stock')) {
    status = 'RELEASED';
    radar_signal = 'ACABA_DE_SALIR';
    radar_why = 'Lanzamiento reciente disponible en distribución.';
  } else if (lower.includes('exclusive') || lower.includes('exclusivo') || lower.includes('haslab') || lower.includes('creations')) {
    radar_signal = 'EXCLUSIVO';
    radar_why = 'Pieza exclusiva para coleccionistas con tirada limitada.';
  } else if (lower.includes('sold out') || lower.includes('agotado')) {
    status = 'SOLD_OUT';
    radar_signal = 'AGOTADO';
    radar_why = 'Demanda masiva y disponibilidad agotada en preventa.';
  }

  // 5. Detectar Título
  let title = 'Nuevo Lanzamiento';
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0 && lines[0].length > 5) {
    title = lines[0].replace(/^#+\s*/, '');
  } else if (input.text) {
    title = input.text.slice(0, 60);
  }

  const slug = slugify(`${manufacturer} ${title}`);

  const item: RadarAIExtractedRelease = {
    title,
    slug,
    manufacturer,
    franchise,
    product_line: manufacturer === 'NECA' ? 'Ultimate' : manufacturer === 'Bandai Spirits' ? 'S.H.Figuarts' : 'Collector Line',
    scale,
    status,
    currency: 'USD',
    region: 'GLOBAL',
    release_precision: 'TBA',
    date_display_text: null,
    source_name: sourceName,
    source_url: sourceUrl || 'https://collectibles.uy',
    image_match_score: 0.50,
    confidence_score: 50,
    radar_signal,
    radar_why,
    radar_context: `${scale} · ${franchise}`,
    approval_status: 'DRAFT',
    is_verified: false,
    is_published: false,
    is_featured: false,
    raw_source_data: { input }
  };

  return [item];
}

/**
 * Alias de compatibilidad hacia parseReleaseHeuristically
 */
export const parseReleaseWithAI = parseReleaseHeuristically;

/**
 * Guarda o actualiza un lanzamiento en Supabase, registrando correcciones de auditoría cuando existan.
 */
export async function persistRadarRelease(
  release: Partial<RadarAIExtractedRelease>,
  auditCorrection?: { field: string; original: any; corrected: any; date: string; by?: string }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const slug = release.slug || slugify(release.title || 'release');
    
    // Obtener release existente si se actualiza
    let existingCorrections: any[] = [];
    if (release.id) {
      const { data: existing } = await supabase
        .from('release_events')
        .select('audit_corrections')
        .eq('id', release.id)
        .maybeSingle();
      if (existing?.audit_corrections && Array.isArray(existing.audit_corrections)) {
        existingCorrections = existing.audit_corrections;
      }
    }

    if (auditCorrection) {
      existingCorrections.push({
        ...auditCorrection,
        date: new Date().toISOString()
      });
    }

    // Regla editorial obligatoria: SIN IMAGEN VÁLIDA Y SIN RELEVANCIA EDITORIAL (>= 80), NO SE PUBLICA.
    const imageVal = validateAndScoreImage(
      { title: release.title, manufacturer: release.manufacturer, franchise: release.franchise, character: release.character },
      release.official_image_url,
      release.image_source_url || release.source_url
    );
    const hasValidImage = imageVal.isValid && Boolean(imageVal.finalImageUrl);

    const relevanceVal = classifyEditorialRelevance(
      release.title,
      release.description || release.summary || release.radar_why || '',
      release.source_name || ''
    );
    const hasValidRelevance = relevanceVal.score >= 80 && relevanceVal.isPublishable;

    const wantsPublished = release.is_published === true || release.approval_status === 'PUBLISHED';
    if (wantsPublished && (!hasValidImage || !hasValidRelevance)) {
      const reason = !hasValidImage
        ? 'Este registro no puede publicarse todavía porque no tiene una imagen válida y verificada.'
        : `Este registro no puede publicarse automáticamente porque su relevancia editorial es insuficiente (${relevanceVal.score}/100 - ${relevanceVal.reason}).`;
      return {
        success: false,
        error: reason
      };
    }

    const canAutoPublish = hasValidImage && hasValidRelevance;
    const isPublished = canAutoPublish ? (release.is_published ?? true) : false;
    const approvalStatus = isPublished ? 'PUBLISHED' : (canAutoPublish ? (release.approval_status || 'PUBLISHED') : 'DRAFT');

    const payload: any = {
      title: release.title,
      slug,
      subtitle: release.subtitle || null,
      description: release.description || null,
      summary: release.summary || release.radar_why || null,
      manufacturer: release.manufacturer || null,
      product_line: release.product_line || null,
      franchise: release.franchise || null,
      character: release.character || null,
      category: release.category || null,
      scale: release.scale || null,
      status: release.status || 'ANNOUNCED',
      msrp: release.msrp || null,
      currency: release.currency || 'USD',
      region: release.region || 'GLOBAL',
      announcement_date: release.announcement_date || null,
      preorder_date: release.preorder_date || null,
      estimated_release_date: release.estimated_release_date || null,
      release_date_start: release.release_date_start || null,
      release_precision: release.release_precision || 'QUARTER',
      date_display_text: release.date_display_text || null,
      catalog_product_id: release.catalog_product_id || null,
      source_name: release.source_name || 'Fuente Oficial',
      source_url: release.source_url || null,
      official_image_url: hasValidImage ? imageVal.finalImageUrl : null,
      image_source_url: release.image_source_url || null,
      image_match_score: hasValidImage ? imageVal.score : 0,
      confidence_score: release.confidence_score ?? 90,
      radar_signal: release.radar_signal || 'NUEVO_ANUNCIO',
      radar_why: release.radar_why || null,
      radar_context: release.radar_context || null,
      approval_status: approvalStatus,
      is_verified: release.is_verified ?? true,
      is_published: isPublished,
      is_featured: release.is_featured ?? false,
      image_semantic_type: imageVal.semanticType,
      raw_source_data: {
        ...(release.raw_source_data || {}),
        image_provenance: imageVal.provenance,
        image_semantic_type: imageVal.semanticType,
        editorial_relevance_type: relevanceVal.type,
        editorial_relevance_score: relevanceVal.score,
        editorial_relevance_reason: relevanceVal.reason
      },
      audit_corrections: existingCorrections,
      updated_at: new Date().toISOString()
    };

    if (release.brand_id) payload.brand_id = release.brand_id;
    if (release.license_id) payload.license_id = release.license_id;

    if (release.id) {
      const { data, error } = await supabase
        .from('release_events')
        .update(payload)
        .eq('id', release.id)
        .select()
        .single();
      if (error) throw error;
      return { success: true, data };
    } else {
      payload.created_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('release_events')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { success: true, data };
    }
  } catch (err: any) {
    console.error('Error persisting radar release:', err);
    return { success: false, error: err.message || 'Error al persistir release' };
  }
}


/**
 * Part 3 advisory reasoning for Radar. It never persists or publishes by itself.
 */
export async function analyzeRadarIntelligence(
  evidence: IntelligenceEvidence,
  country: 'UY' | 'AR' | 'CL' | 'PE' | 'MX' | 'EC' = 'UY'
) {
  return radarIntelligence(country, evidence);
}

/**
 * Part 3 advisory reasoning for Release Calendar. Source verification and
 * deterministic parsing remain authoritative; AI only prioritizes/explains.
 */
export async function analyzeReleaseIntelligence(
  evidence: IntelligenceEvidence,
  country: 'UY' | 'AR' | 'CL' | 'PE' | 'MX' | 'EC' = 'UY'
) {
  return releaseIntelligence(country, evidence);
}

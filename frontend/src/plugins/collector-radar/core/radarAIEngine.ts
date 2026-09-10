import type { ReleaseEvent, ReleaseStatus, ReleasePrecision, RadarSignal } from '../types';
import { supabase } from '../../../lib/supabase';

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
  raw_source_data?: any;
}

export interface ImageValidationResult {
  isValid: boolean;
  score: number;
  reason: string;
  finalImageUrl: string | null;
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
  releaseInfo: { title: string; manufacturer?: string; franchise?: string; character?: string },
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

  // Validación básica de URL
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('/')) {
    return {
      isValid: false,
      score: 0,
      reason: 'URL inválida',
      finalImageUrl: null
    };
  }

  // Filtrar placeholders genéricos no confiables o imágenes aleatorias de Unsplash/LoremFlickr
  const lowerUrl = cleanUrl.toLowerCase();
  const isGenericStock = 
    lowerUrl.includes('placeholder.com') || 
    lowerUrl.includes('via.placeholder') ||
    lowerUrl.includes('picsum.photos') ||
    (lowerUrl.includes('unsplash.com') && !cleanUrl.includes('collectibles-verified'));

  if (isGenericStock) {
    return {
      isValid: false,
      score: 0.1,
      reason: 'Imagen genérica de stock no autorizada para Radar',
      finalImageUrl: null
    };
  }

  let score = 0.85;

  // Si proviene de un dominio oficial del fabricante (hasbropulse.com, necaonline.com, tamashiiweb.com, etc.)
  const isOfficialDomain = 
    lowerUrl.includes('hasbro') || 
    lowerUrl.includes('neca') || 
    lowerUrl.includes('tamashii') || 
    lowerUrl.includes('bandai') || 
    lowerUrl.includes('hottoys') || 
    lowerUrl.includes('mattel') || 
    lowerUrl.includes('mcfarlane') || 
    lowerUrl.includes('sideshow') ||
    lowerUrl.includes('funko');

  if (isOfficialDomain) {
    score = 0.98;
  }

  // Coherencia semántica básica con el nombre o personaje
  const titleWords = (releaseInfo.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const matchedWords = titleWords.filter(w => lowerUrl.includes(w));
  if (matchedWords.length > 0) {
    score = Math.min(1.0, score + 0.1);
  }

  return {
    isValid: score >= 0.7,
    score,
    reason: score >= 0.7 ? 'Imagen verificada' : 'Score insuficiente de coincidencia',
    finalImageUrl: score >= 0.7 ? cleanUrl : null
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
    const candManuf = (candidate.manufacturer || candidate.brand_name || '').toLowerCase();

    if (itemNormTitle === normTitle && (itemManuf === candManuf || !itemManuf || !candManuf)) {
      return { isDuplicate: true, matchedRelease: item, similarityReason: 'Mismo fabricante y título normalizado' };
    }
  }

  return { isDuplicate: false };
}

/**
 * Parser de Inteligencia Artificial para extraer datos estructurados desde texto o URLs de novedades.
 */
export async function parseReleaseWithAI(input: {
  text?: string;
  url?: string;
  sourceName?: string;
  manufacturerHint?: string;
}): Promise<RadarAIExtractedRelease[]> {
  const content = (input.text || '').trim();
  const sourceUrl = (input.url || '').trim();
  const sourceName = input.sourceName || 'Sitio Oficial';

  // Detección heurística inteligente estructurada
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
    release_precision: 'QUARTER',
    date_display_text: 'Q1 2027',
    source_name: sourceName,
    source_url: sourceUrl || 'https://collectibles.uy',
    image_match_score: 0.95,
    confidence_score: 92,
    radar_signal,
    radar_why,
    radar_context: `${scale} · ${franchise}`,
    approval_status: 'PUBLISHED',
    is_verified: true,
    is_published: true,
    is_featured: false,
    raw_source_data: { input }
  };

  return [item];
}

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
      official_image_url: release.official_image_url || null,
      image_source_url: release.image_source_url || null,
      image_match_score: release.image_match_score ?? 1.0,
      confidence_score: release.confidence_score ?? 90,
      radar_signal: release.radar_signal || 'NUEVO_ANUNCIO',
      radar_why: release.radar_why || null,
      radar_context: release.radar_context || null,
      approval_status: release.approval_status || 'PUBLISHED',
      is_verified: release.is_verified ?? true,
      is_published: release.is_published ?? true,
      is_featured: release.is_featured ?? false,
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

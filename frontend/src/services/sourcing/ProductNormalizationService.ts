import type { 
  ConditionNormalized, 
  AvailabilityNormalized 
} from '../../types/sourcing';

export interface CleanedTitleResult {
  rawTitle: string;
  normalizedTitle: string;
  cleanedTitle: string;
  extractedAttributes: {
    brand?: string;
    manufacturer?: string;
    franchise?: string;
    character?: string;
    scale?: string;
    edition?: string;
    variant?: string;
    colorVariant?: string;
    year?: number;
  };
  noiseRemoved: string[];
}

/**
 * Noise words and promotional phrases that should be stripped during canonical title normalization.
 * DO NOT remove essential product differentiators (scale, character, variant, edition, color, line).
 */
const PROMOTIONAL_NOISE_PATTERNS = [
  /\bbrand\s+new\b/gi,
  /\bnew\s+in\s+box\b/gi,
  /\bnib\b/gi,
  /\bmib\b/gi,
  /\bsealed\b/gi,
  /\bfree\s+shipping\b/gi,
  /\bin\s+stock\b/gi,
  /\bsale\b/gi,
  /\blimited!*!*\b/gi,
  /\bfast\s+shipping\b/gi,
  /\bfast\s+ship\b/gi,
  /\bexcellent\s+condition\b/gi,
  /\baction\s+figure\b/gi,
  /\btoy\s+figure\b/gi,
  /\bcollectible\s+figure\b/gi,
  /\bships\s+fast\b/gi,
  /\bauthentic\b/gi,
  /\boriginal\b/gi,
  /\b100%\s+official\b/gi,
  /\bnever\s+opened\b/gi,
  /\bhot\b/gi,
  /\bmust\s+have\b/gi,
  /[!@#$%^&*()_+=\[\]{};:"\\|<>?]/g // Remove irrelevant noisy symbols, keep hyphens
];

export class ProductNormalizationService {
  /**
   * Pipeline determinístico para limpiar títulos de listings.
   * Elimina ruido publicitario (NEW, BRAND NEW, SALE, FREE SHIPPING)
   * pero PRESERVA atributos significativos (fabricante, personaje, escala, versión, edición, color, wave, modelo).
   */
  static cleanAndNormalizeTitle(title: string, brandHint?: string): CleanedTitleResult {
    if (!title) {
      return {
        rawTitle: '',
        normalizedTitle: '',
        cleanedTitle: '',
        extractedAttributes: {},
        noiseRemoved: []
      };
    }

    let cleaned = title.trim();
    const noiseRemoved: string[] = [];

    // 1. Identificar y remover ruido promocional
    for (const pattern of PROMOTIONAL_NOISE_PATTERNS) {
      const matches = cleaned.match(pattern);
      if (matches) {
        matches.forEach(m => noiseRemoved.push(m));
        cleaned = cleaned.replace(pattern, ' ');
      }
    }

    // 2. Normalizar espacios múltiples
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // 3. Extraer atributos clave preservados
    const extractedAttributes = this.extractAttributesFromTitle(cleaned, brandHint);

    // 4. Construir título canónico formateado: [Brand/Manufacturer] [Franchise] [Character] [Edition/Variant] [Scale]
    const parts: string[] = [];
    if (extractedAttributes.brand) parts.push(extractedAttributes.brand);
    if (extractedAttributes.franchise && !cleaned.toLowerCase().includes(extractedAttributes.franchise.toLowerCase())) {
      parts.push(extractedAttributes.franchise);
    }
    if (extractedAttributes.character) parts.push(extractedAttributes.character);
    if (extractedAttributes.variant && !parts.some(p => p.toLowerCase().includes(extractedAttributes.variant!.toLowerCase()))) {
      parts.push(extractedAttributes.variant);
    }
    if (extractedAttributes.edition && extractedAttributes.edition !== 'Standard' && !parts.some(p => p.toLowerCase().includes(extractedAttributes.edition!.toLowerCase()))) {
      parts.push(extractedAttributes.edition);
    }
    if (extractedAttributes.scale && !parts.some(p => p.toLowerCase().includes(extractedAttributes.scale!.toLowerCase()))) {
      parts.push(extractedAttributes.scale);
    }

    // Si el título limpiado tiene mejor información directa, lo combinamos adecuadamente
    const normalizedTitle = parts.length >= 2 ? parts.join(' ') : cleaned;

    return {
      rawTitle: title,
      normalizedTitle,
      cleanedTitle: cleaned,
      extractedAttributes,
      noiseRemoved
    };
  }

  /**
   * Infiere y extrae atributos estructurados a partir del título limpiado.
   */
  static extractAttributesFromTitle(title: string, brandHint?: string) {
    const lower = title.toLowerCase();

    // Fabricante / Marca
    let brand = brandHint || 'McFarlane Toys';
    if (lower.includes('jada') || lower.includes('jada toys')) brand = 'Jada Toys';
    else if (lower.includes('mcfarlane')) brand = 'McFarlane Toys';
    else if (lower.includes('neca')) brand = 'NECA';
    else if (lower.includes('hasbro')) brand = 'Hasbro';
    else if (lower.includes('bandai') || lower.includes('tamashii')) brand = 'Bandai Spirits';
    else if (lower.includes('funko')) brand = 'Funko';
    else if (lower.includes('good smile') || lower.includes('nendoroid')) brand = 'Good Smile Company';

    // Franquicia / Licencia
    let franchise = 'General Collectibles';
    if (lower.includes('street fighter')) franchise = 'Street Fighter';
    else if (lower.includes('dc comics') || lower.includes('dc multiverse') || lower.includes('batman') || lower.includes('superman')) franchise = 'DC Comics';
    else if (lower.includes('marvel') || lower.includes('spider-man') || lower.includes('avengers') || lower.includes('x-men')) franchise = 'Marvel';
    else if (lower.includes('star wars')) franchise = 'Star Wars';
    else if (lower.includes('dragon ball')) franchise = 'Dragon Ball';
    else if (lower.includes('pokemon') || lower.includes('pokémon')) franchise = 'Pokémon';
    else if (lower.includes('spawn')) franchise = 'Spawn / Image Comics';

    // Escala
    let scale = '1:12';
    if (lower.includes('1:12') || lower.includes('1/12')) scale = '1:12';
    else if (lower.includes('1:10') || lower.includes('1/10')) scale = '1:10';
    else if (lower.includes('1:6') || lower.includes('1/6')) scale = '1:6';
    else if (lower.includes('6 inch') || lower.includes('6"')) scale = '6"';
    else if (lower.includes('7 inch') || lower.includes('7"')) scale = '7"';

    // Personaje
    let character = '';
    if (lower.includes('chun-li') || lower.includes('chun li')) character = 'Chun-Li';
    else if (lower.includes('ryu')) character = 'Ryu';
    else if (lower.includes('ken')) character = 'Ken Masters';
    else if (lower.includes('guile')) character = 'Guile';
    else if (lower.includes('batman')) character = 'Batman';
    else if (lower.includes('superman')) character = 'Superman';
    else if (lower.includes('joker')) character = 'The Joker';
    else if (lower.includes('spawn')) character = 'Spawn';
    else {
      // Fallback: tomar las dos primeras palabras limpias
      const cleanWords = title.split(' ').filter(w => w.length > 2);
      character = cleanWords.slice(0, 2).join(' ') || 'Collector Item';
    }

    // Edición o Variante
    let edition = 'Standard';
    if (lower.includes('deluxe')) edition = 'Deluxe Edition';
    else if (lower.includes('exclusive') || lower.includes('sdcc')) edition = 'Exclusive Edition';
    else if (lower.includes('collector edition') || lower.includes('collectors edition')) edition = 'Collector Edition';

    let variant = undefined;
    if (lower.includes('player 2') || lower.includes('p2')) variant = 'Player 2 Color';
    else if (lower.includes('player 3')) variant = 'Player 3 Color';
    else if (lower.includes('blue version') || lower.includes('blue ver')) variant = 'Blue Version';
    else if (lower.includes('red version') || lower.includes('red ver')) variant = 'Red Version';
    else if (lower.includes('chase')) variant = 'Chase Variant';

    return {
      brand,
      manufacturer: brand,
      franchise,
      character,
      scale,
      edition,
      variant
    };
  }

  /**
   * Normaliza textos dispares de condición de retailers.
   * Brand New / New / Nuevo -> NEW
   * Pre-owned / Used / Used - Good -> USED_GOOD
   * Refurbished / Renewed -> REFURBISHED
   */
  static normalizeCondition(rawCondition?: string): ConditionNormalized {
    if (!rawCondition) return 'UNKNOWN';
    const lower = rawCondition.toLowerCase().trim();

    if (lower.includes('brand new') || lower.includes('new') || lower.includes('nuevo') || lower === 'n') {
      return 'NEW';
    }
    if (lower.includes('refurbished') || lower.includes('renewed') || lower.includes('reacondicionado')) {
      return 'REFURBISHED';
    }
    if (lower.includes('open box') || lower.includes('open-box') || lower.includes('caja abierta')) {
      return 'OPEN_BOX';
    }
    if (lower.includes('used') || lower.includes('pre-owned') || lower.includes('usado') || lower.includes('second hand')) {
      return 'USED';
    }

    return 'UNKNOWN';
  }

  /**
   * Normaliza textos de disponibilidad.
   */
  static normalizeAvailability(rawAvailability?: string): AvailabilityNormalized {
    if (!rawAvailability) return 'UNKNOWN';
    const lower = rawAvailability.toLowerCase().trim();

    if (lower.includes('in stock') || lower.includes('in_stock') || lower.includes('available') || lower.includes('disponible')) {
      return 'IN_STOCK';
    }
    if (lower.includes('preorder') || lower.includes('pre-order') || lower.includes('preventa')) {
      return 'PREORDER';
    }
    if (lower.includes('low stock') || lower.includes('limited') || lower.includes('pocas unidades')) {
      return 'LOW_STOCK';
    }
    if (lower.includes('backorder') || lower.includes('back-order')) {
      return 'BACKORDER';
    }
    if (lower.includes('out of stock') || lower.includes('out_of_stock') || lower.includes('agotado') || lower.includes('sold out')) {
      return 'OUT_OF_STOCK';
    }

    return 'UNKNOWN';
  }
}

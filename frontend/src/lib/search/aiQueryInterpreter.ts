export interface AISearchQueryInterpretation {
  rawQuery: string;
  cleanedQuery: string;
  detectedBrand?: string;
  detectedLicense?: string;
  detectedLine?: string;
  detectedScale?: string;
  detectedCategory?: string;
  excludedBrand?: string;
  isPreorder: boolean;
  isAvailable: boolean;
  isInternational: boolean;
  priceMin?: number;
  priceMax?: number;
  isQuestion: boolean;
  intent: 'search' | 'recommendation' | 'question' | 'comparison';
}

const SCALE_REGEX = /(1[:\/]12|1[:\/]6|1[:\/]4|1[:\/]10|1[:\/]18|1[:\/]24|1[:\/]43|1[:\/]64|sixth\s*scale|quarter\s*scale|one[:\s]*12)/i;

const BRANDS_MAP: Record<string, string> = {
  'hot toys': 'Hot Toys',
  'neca': 'NECA',
  'hasbro': 'Hasbro',
  'bandai': 'Bandai Spirits',
  'tamashii': 'Tamashii Nations',
  'mcfarlane': 'McFarlane Toys',
  'mezco': 'Mezco Toyz',
  'kotobukiya': 'Kotobukiya',
  'good smile': 'Good Smile Company',
  'funko': 'Funko',
  'sideshow': 'Sideshow',
  'iron studios': 'Iron Studios',
  'lego': 'LEGO',
  'mattel': 'Mattel'
};

const LICENSES_MAP: Record<string, string> = {
  'star wars': 'Star Wars',
  'marvel': 'Marvel',
  'dc': 'DC Comics',
  'dc multiverse': 'DC Multiverse',
  'batman': 'Batman',
  'spider-man': 'Spider-Man',
  'spiderman': 'Spider-Man',
  'dragon ball': 'Dragon Ball',
  'dragon ball z': 'Dragon Ball Z',
  'naruto': 'Naruto',
  'one piece': 'One Piece',
  'anime': 'Anime',
  'predator': 'Predator',
  'alien': 'Alien',
  'lord of the rings': 'Lord of the Rings',
  'godzilla': 'Godzilla',
  'transformers': 'Transformers',
  'motu': 'Masters of the Universe',
  'terror': 'Horror / Terror',
  'horror': 'Horror / Terror'
};

const LINES_LIST = [
  'S.H.Figuarts',
  'Marvel Legends',
  'DC Multiverse',
  'Ichibansho',
  'Figuarts ZERO',
  'Black Series',
  'Vintage Collection',
  'Ultimate',
  'Movie Masterpiece',
  'One:12 Collective',
  'Nendoroid',
  'Figma',
  'Pop!',
  'Myth Cloth EX',
  'HasLab',
  'Icons'
];

export function interpretUserQuery(query: string): AISearchQueryInterpretation {
  const trimmed = (query || '').trim();
  const lower = trimmed.toLowerCase();

  // 1. Detect Scale
  let detectedScale: string | undefined;
  const scaleMatch = lower.match(SCALE_REGEX);
  if (scaleMatch) {
    const rawScale = scaleMatch[1].toLowerCase();
    if (rawScale.includes('one') && rawScale.includes('12')) {
      detectedScale = '1:12';
    } else if (rawScale.includes('sixth')) {
      detectedScale = '1:6';
    } else if (rawScale.includes('quarter')) {
      detectedScale = '1:4';
    } else {
      detectedScale = rawScale.replace('/', ':');
    }
  }

  // 2. Detect Brand & Exclusions
  let detectedBrand: string | undefined;
  let excludedBrand: string | undefined;

  for (const [key, name] of Object.entries(BRANDS_MAP)) {
    if (lower.includes(`no sea ${key}`) || lower.includes(`sin ${key}`) || lower.includes(`que no sea ${key}`) || lower.includes(`not ${key}`)) {
      excludedBrand = name.toUpperCase();
    } else if (lower.includes(key)) {
      detectedBrand = name.toUpperCase();
    }
  }

  // 3. Detect License
  let detectedLicense: string | undefined;
  for (const [key, name] of Object.entries(LICENSES_MAP)) {
    if (lower.includes(key)) {
      detectedLicense = name.toUpperCase();
      break;
    }
  }

  // 4. Detect Line
  const detectedLine = LINES_LIST.find(l => lower.includes(l.toLowerCase()));

  // 5. Detect Preorder / Available / International Intents
  const isPreorder = /(preventa|preorder|pre-order|pre orden|reserva|pr[oó]ximamente|lanzamiento)/i.test(lower);
  const isAvailable = /(disponible|en stock|stock|entrega inmediata|comprar ya|ahora)/i.test(lower);
  const isInternational = /(traer|importar|miami|franquicia|internacional|usa|eeuu)/i.test(lower);

  // 6. Detect Price Hints
  let priceMax: number | undefined;
  let priceMin: number | undefined;
  const maxPriceMatch = lower.match(/(menos de|hasta|menor a|bajo|under|máximo|maximo)\s*\$?(\d+)/i);
  if (maxPriceMatch) {
    priceMax = parseInt(maxPriceMatch[2], 10);
  }
  const minPriceMatch = lower.match(/(mas de|más de|desde|mayor a|sobre|above|mínimo|minimo)\s*\$?(\d+)/i);
  if (minPriceMatch) {
    priceMin = parseInt(minPriceMatch[2], 10);
  }

  const isQuestion = /^[¿\s]*(qu[eé]|c[oó]mo|cu[aá]l|d[oó]nde|por qu[eé]|existe|tienen|hay|recomiendas|vale la pena)/i.test(lower) || lower.endsWith('?') || lower.includes('?');

  let intent: 'search' | 'recommendation' | 'question' | 'comparison' = 'search';
  if (isQuestion) {
    intent = 'question';
  } else if (lower.includes('recomiendas') || lower.includes('mejor') || lower.includes('regalo') || lower.includes('recomendar')) {
    intent = 'recommendation';
  } else if (lower.includes('vs') || lower.includes('comparar') || lower.includes('diferencia')) {
    intent = 'comparison';
  }

  // Build cleaned query removing stopwords and question prefixes
  let cleaned = trimmed
    .replace(/^(de la|de|del|en|para|mostrame|muéstrame|quiero una|quiero|busco|qué|que|cuáles|cuales|hay|tienen|tenés|tenes)\s+/i, '')
    .replace(/\?|\¿|\!|\¡/g, '');

  if (scaleMatch) cleaned = cleaned.replace(scaleMatch[0], '');
  if (maxPriceMatch) cleaned = cleaned.replace(maxPriceMatch[0], '');
  if (minPriceMatch) cleaned = cleaned.replace(minPriceMatch[0], '');
  if (excludedBrand) cleaned = cleaned.replace(new RegExp(`(que no sea|no sea|sin|no)\\s*${excludedBrand}`, 'gi'), '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return {
    rawQuery: trimmed,
    cleanedQuery: cleaned || trimmed,
    detectedBrand,
    detectedLicense,
    detectedLine,
    detectedScale,
    excludedBrand,
    isPreorder,
    isAvailable,
    isInternational,
    priceMin,
    priceMax,
    isQuestion,
    intent
  };
}

/**
 * Genera una respuesta editorial directa, natural y con desglose útil para el usuario.
 */
export function generateDirectEditorialAnswer(
  interp: AISearchQueryInterpretation,
  products: any[],
  radarDrops: any[] = []
): { headline: string; summary: string; breakdown: string[]; nextHighlight?: string } {
  const count = products.length;
  const topic = interp.detectedLicense || interp.detectedBrand || interp.detectedLine || interp.cleanedQuery || 'coleccionables';

  // 1. Caso 0 Resultados
  if (count === 0) {
    if (interp.isPreorder) {
      return {
        headline: `Preventas de ${topic}`,
        summary: `No encontramos preventas activas de ${topic} dentro del catálogo de Collectibles en este momento.`,
        breakdown: [
          'Podés explorar los próximos lanzamientos en Radar para activar avisos de preventa',
          'También podés buscar opciones disponibles en catálogo internacional'
        ],
        nextHighlight: radarDrops.length > 0 ? `Hay ${radarDrops.length} drops detectados en Radar para esta línea.` : undefined
      };
    }
    return {
      headline: `Búsqueda de ${topic}`,
      summary: `No encontramos coincidencias exactas para "${interp.rawQuery}" en nuestro catálogo local activo.`,
      breakdown: [
        'Explorá opciones similares disponibles en stock inmediato',
        'Podés consultar los lanzamientos oficiales en Radar o solicitar importación'
      ]
    };
  }

  // 2. Caso con Resultados
  // Analizar desglose por líneas / marcas
  const lineCounts: Record<string, number> = {};
  let preorderCount = 0;
  let inStockCount = 0;

  products.forEach(p => {
    if (p.is_preorder || p.status === 'preorder') preorderCount++;
    else inStockCount++;

    const titleLower = (p.title || '').toLowerCase();
    for (const l of LINES_LIST) {
      if (titleLower.includes(l.toLowerCase())) {
        lineCounts[l] = (lineCounts[l] || 0) + 1;
      }
    }
  });

  const breakdownBullets: string[] = [];
  const entries = Object.entries(lineCounts);
  if (entries.length > 0) {
    entries.slice(0, 4).forEach(([lineName, num]) => {
      breakdownBullets.push(`${num} ${lineName}`);
    });
  } else if (interp.detectedBrand) {
    breakdownBullets.push(`${count} piezas de ${interp.detectedBrand}`);
  }

  if (preorderCount > 0 && inStockCount > 0) {
    breakdownBullets.push(`${inStockCount} en stock inmediato y ${preorderCount} en preventa`);
  } else if (preorderCount > 0) {
    breakdownBullets.push(`${preorderCount} preventas activas`);
  }

  const headline = interp.isPreorder 
    ? `Preventas de ${topic}`
    : interp.intent === 'recommendation'
      ? `Recomendaciones para ${topic}`
      : `Resultados para ${topic}`;

  let summary = `Encontré ${count} ${count === 1 ? 'producto relacionado' : 'productos relacionados'}${interp.detectedBrand ? ` de ${interp.detectedBrand}` : ''}.`;
  if (interp.detectedScale) {
    summary += ` en escala ${interp.detectedScale}.`;
  }

  let nextHighlight: string | undefined;
  if (radarDrops.length > 0) {
    nextHighlight = `Próximo lanzamiento destacado en Radar: ${radarDrops[0].title}.`;
  }

  return {
    headline,
    summary,
    breakdown: breakdownBullets,
    nextHighlight
  };
}

/**
 * Genera de 2 a 4 preguntas contextuales relacionadas y clickeables.
 */
export function generateContextualQuestions(interp: AISearchQueryInterpretation): string[] {
  const topic = interp.detectedLicense || interp.detectedBrand || 'figuras';
  const questions: string[] = [];

  if (interp.detectedLicense?.includes('Dragon Ball')) {
    questions.push(
      '¿Qué S.H.Figuarts de Dragon Ball salen próximamente?',
      '¿Qué figuras de Dragon Ball están disponibles en stock ahora?',
      '¿Qué diferencias hay entre S.H.Figuarts e Ichibansho?',
      '¿Qué preventas de Bandai están abiertas?'
    );
  } else if (interp.detectedLicense?.includes('Batman') || interp.detectedLicense?.includes('DC')) {
    questions.push(
      'Quiero una figura de Batman de unos 18 cm, que no sea Funko y cueste menos de USD 80.',
      'De la Wave 3 de DC Multiverse de McFarlane, ¿qué tenés disponible?',
      '¿Qué estatuas de Batman en resina Polystone hay en catálogo?',
      'Mejor Batman 1:10 para empezar a coleccionar'
    );
  } else if (interp.detectedLicense?.includes('Marvel') || interp.detectedLicense?.includes('Spider-Man')) {
    questions.push(
      '¿Qué figuras 1:12 de Marvel tengo disponibles y cuáles combinan mejor entre sí?',
      '¿Qué Hot Toys de Marvel puedo comprar o traer actualmente?',
      'Marvel Legends vs S.H.Figuarts para Marvel',
      '¿Qué preventas de Marvel están abiertas?'
    );
  } else if (interp.detectedBrand?.includes('NECA') || interp.detectedLicense?.includes('Horror') || interp.detectedLicense?.includes('Terror')) {
    questions.push(
      'Mostrame figuras de terror de NECA Ultimate que estén disponibles en Uruguay.',
      'Algo parecido a NECA Ultimate Michael Myers',
      '¿Cómo detecto un bootleg en figuras NECA?',
      'Tengo esta figura de NECA. ¿Qué otras piezas de la misma línea me recomendarías mirar?'
    );
  } else if (interp.detectedBrand?.includes('Hot Toys') || interp.detectedLicense?.includes('Star Wars')) {
    questions.push(
      '¿Qué Hot Toys de Star Wars puedo comprar o traer actualmente?',
      '¿Qué escala es más grande, 1:6 o 1:10?',
      'Hot Toys que pueda traer usando franquicia',
      '¿Qué lanzamientos próximos coinciden con Star Wars?'
    );
  } else {
    questions.push(
      `¿Qué figuras de ${topic} están disponibles en stock ahora?`,
      `¿Qué preventas de ${topic} salen próximamente?`,
      `¿Qué escala es mejor para coleccionar ${topic}?`,
      `Tengo USD 150 de presupuesto total. ¿Qué figuras de ${topic} puedo comprar?`
    );
  }

  return questions.slice(0, 4);
}


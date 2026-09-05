export interface AISearchQueryInterpretation {
  rawQuery: string;
  cleanedQuery: string;
  detectedBrand?: string;
  detectedLicense?: string;
  detectedScale?: string;
  detectedCategory?: string;
  priceMin?: number;
  priceMax?: number;
  isQuestion: boolean;
  intent: 'search' | 'recommendation' | 'question' | 'comparison';
}

const SCALE_REGEX = /(1[:\/]12|1[:\/]6|1[:\/]4|1[:\/]10|1[:\/]18|1[:\/]24|1[:\/]43|1[:\/]64|sixth\s*scale|quarter\s*scale|one[:\s]*12)/i;
const BRANDS_LIST = ['hot toys', 'neca', 'hasbro', 'bandai', 'funko', 'tamashii', 'mcfarlane', 'mezco', 'kotobukiya', 'good smile'];
const LICENSES_LIST = ['star wars', 'marvel', 'dc', 'batman', 'spider-man', 'spiderman', 'dragon ball', 'anime', 'predator', 'alien', 'lord of the rings'];

export function interpretUserQuery(query: string): AISearchQueryInterpretation {
  const trimmed = (query || '').trim();
  const lower = trimmed.toLowerCase();

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

  const detectedBrand = BRANDS_LIST.find(b => lower.includes(b));
  const detectedLicense = LICENSES_LIST.find(l => lower.includes(l));

  // Detect price hints: "menos de 100", "bajo 50", "hasta 200"
  let priceMax: number | undefined;
  let priceMin: number | undefined;
  const maxPriceMatch = lower.match(/(menos de|hasta|menor a|bajo|under)\s*\$?(\d+)/i);
  if (maxPriceMatch) {
    priceMax = parseInt(maxPriceMatch[2], 10);
  }
  const minPriceMatch = lower.match(/(mas de|desde|mayor a|sobre|above)\s*\$?(\d+)/i);
  if (minPriceMatch) {
    priceMin = parseInt(minPriceMatch[2], 10);
  }

  const isQuestion = /^(qu[eé]|c[oó]mo|cu[aá]l|d[oó]nde|por qu[eé]|existe|tienen|hay|recomiendas|vale la pena)/i.test(lower) || lower.endsWith('?');

  let intent: 'search' | 'recommendation' | 'question' | 'comparison' = 'search';
  if (isQuestion) {
    intent = 'question';
  } else if (lower.includes('recomiendas') || lower.includes('mejor') || lower.includes('regalo')) {
    intent = 'recommendation';
  } else if (lower.includes('vs') || lower.includes('comparar') || lower.includes('diferencia')) {
    intent = 'comparison';
  }

  // Build cleaned query removing stopwords
  let cleaned = trimmed;
  if (scaleMatch) cleaned = cleaned.replace(scaleMatch[0], '');
  if (maxPriceMatch) cleaned = cleaned.replace(maxPriceMatch[0], '');
  if (minPriceMatch) cleaned = cleaned.replace(minPriceMatch[0], '');
  cleaned = cleaned.trim();

  return {
    rawQuery: trimmed,
    cleanedQuery: cleaned || trimmed,
    detectedBrand: detectedBrand ? detectedBrand.toUpperCase() : undefined,
    detectedLicense: detectedLicense ? detectedLicense.toUpperCase() : undefined,
    detectedScale,
    priceMin,
    priceMax,
    isQuestion,
    intent
  };
}

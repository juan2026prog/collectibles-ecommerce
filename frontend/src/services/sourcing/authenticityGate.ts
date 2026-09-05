import type { AuthenticityEvidence, AuthenticityStatus } from '../../types/sourcing';

// Oficialmente reconocidos y licenciados
export const RECOGNIZED_OFFICIAL_BRANDS = [
  'mcfarlane toys',
  'mcfarlane',
  'neca',
  'hasbro',
  'bandai',
  'bandai spirits',
  'tamashii nations',
  'hot toys',
  'good smile company',
  'funko',
  'super7',
  'mattel',
  'jazwares',
  'kotobukiya',
  'mezco',
  'mezco toyz',
  'iron studios',
  'sideshow',
  'sideshow collectibles',
  'diamond select',
  'diamond select toys',
  'threezero',
  'storm collectibles',
  'medicom toy',
  'mafex',
  'lego',
  'square enix',
  'play arts kai',
  'banpresto'
];

export const RECOGNIZED_MAJOR_LICENSES = [
  'dc comics',
  'batman',
  'superman',
  'spawn',
  'marvel',
  'spider-man',
  'avengers',
  'star wars',
  'pokemon',
  'dragon ball',
  'naruto',
  'one piece',
  'disney',
  'transformers',
  'ghostbusters',
  'jurassic park',
  'teenage mutant ninja turtles',
  'tmnt',
  'stranger things',
  'the witcher',
  'warhammer',
  'dune',
  'lord of the rings',
  'harry potter'
];

// Red flag terms strictly indicating bootlegs, replicas, or unlicensed knockoffs
export const RED_FLAG_KEYWORDS = [
  'bootleg',
  'knockoff',
  'ko version',
  'ko ver',
  'recast',
  're-cast',
  'fan made',
  'fan-made',
  'custom figure',
  'replica',
  'imitacion',
  'imitation',
  'unbranded',
  'sin marca',
  'chinese version',
  'china version',
  'oem version',
  'inspired by',
  'style figure',
  'no brand'
];

export interface AuthenticityCheckInput {
  title: string;
  brand?: string;
  license?: string;
  seller?: string;
  retailer?: string;
  upc?: string;
  mpn?: string;
  price?: number;
  condition?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export function evaluateAuthenticityGate(input: AuthenticityCheckInput): AuthenticityEvidence {
  const titleLower = (input.title || '').toLowerCase();
  const descLower = (input.description || '').toLowerCase();
  const brandLower = (input.brand || '').toLowerCase();
  const sellerLower = (input.seller || '').toLowerCase();
  const fullText = `${titleLower} ${descLower} ${sellerLower}`;

  const red_flags: string[] = [];
  const green_flags: string[] = [];
  const reasons: string[] = [];
  let score = 50;

  // 1. Immediate Red Flag Detection (Bootlegs, KO, Replicas, Unbranded)
  for (const red of RED_FLAG_KEYWORDS) {
    if (fullText.includes(red)) {
      red_flags.push(`Término no oficial detectado: "${red}"`);
      score -= 50;
    }
  }

  // If explicit bootleg terms found, classify immediately
  if (red_flags.some(r => r.includes('bootleg') || r.includes('knockoff') || r.includes('ko version') || r.includes('recast'))) {
    return {
      status: 'BOOTLEG',
      score: 0,
      confidence: 99,
      brand_verified: false,
      license_verified: false,
      official_distributor: false,
      has_valid_identifier: false,
      verification_method: 'MULTI_SIGNAL_HEURISTIC',
      verification_evidence: red_flags,
      verification_source: input.retailer || 'URL/Metadata',
      verified_at: new Date().toISOString(),
      red_flags,
      green_flags,
      reasons: ['Detectado como bootleg/knockoff por descripción o metadatos. IMPORTACIÓN PROHIBIDA.']
    };
  }

  if (red_flags.some(r => r.includes('replica') || r.includes('imitacion') || r.includes('imitation'))) {
    return {
      status: 'REPLICA',
      score: 5,
      confidence: 95,
      brand_verified: false,
      license_verified: false,
      official_distributor: false,
      has_valid_identifier: false,
      verification_method: 'MULTI_SIGNAL_HEURISTIC',
      verification_evidence: red_flags,
      verification_source: input.retailer || 'URL/Metadata',
      verified_at: new Date().toISOString(),
      red_flags,
      green_flags,
      reasons: ['Declarado como réplica o imitación. IMPORTACIÓN PROHIBIDA.']
    };
  }

  if (red_flags.some(r => r.includes('unbranded') || r.includes('sin marca') || r.includes('no brand'))) {
    return {
      status: 'UNBRANDED',
      score: 10,
      confidence: 90,
      brand_verified: false,
      license_verified: false,
      official_distributor: false,
      has_valid_identifier: false,
      verification_method: 'MULTI_SIGNAL_HEURISTIC',
      verification_evidence: red_flags,
      verification_source: input.retailer || 'URL/Metadata',
      verified_at: new Date().toISOString(),
      red_flags,
      green_flags,
      reasons: ['Producto genérico sin fabricante oficial (Unbranded). RECHAZADO.']
    };
  }

  // 2. Brand Verification
  const brandMatchesOfficial = RECOGNIZED_OFFICIAL_BRANDS.some(b => 
    brandLower.includes(b) || titleLower.startsWith(b) || titleLower.includes(`by ${b}`)
  );

  if (brandMatchesOfficial) {
    green_flags.push(`Fabricante oficial reconocido: "${input.brand || 'Verificado en catálogo'}"`);
    score += 25;
  } else if (!input.brand || input.brand.trim() === '') {
    red_flags.push('Falta marca o fabricante explícito');
    score -= 15;
  }

  // 3. License Verification
  const licenseMatchesOfficial = RECOGNIZED_MAJOR_LICENSES.some(l => 
    (input.license && input.license.toLowerCase().includes(l)) || titleLower.includes(l)
  );

  if (licenseMatchesOfficial) {
    green_flags.push('Licencia oficial identificada');
    score += 15;
  }

  // 4. Identifiers: UPC / EAN / MPN
  const hasValidIdentifier = Boolean(
    (input.upc && input.upc.length >= 8) || 
    (input.mpn && input.mpn.length >= 4)
  );

  if (hasValidIdentifier) {
    green_flags.push(`Código de barras/MPN fabricante registrado: ${input.upc || input.mpn}`);
    score += 20;
  }

  // 5. Retailer & Seller Trust
  const isOfficialRetailer = ['amazon', 'bestbuy'].includes((input.retailer || '').toLowerCase());
  const isDirectStore = sellerLower.includes('amazon.com') || sellerLower.includes('best buy') || sellerLower.includes('official');
  
  if (isOfficialRetailer && isDirectStore) {
    green_flags.push('Vendido y despachado directamente por retailer oficial');
    score += 15;
  }

  // 6. Abnormally low price suspicion for collectible figures (e.g. 7" figure under $8 is likely KO)
  if (input.price && input.price > 0 && input.price < 8.00 && !titleLower.includes('keychain') && !titleLower.includes('pin')) {
    red_flags.push(`Precio anormalmente bajo ($${input.price.toFixed(2)} USD) para una figura de colección`);
    score -= 25;
  }

  // Final Evaluation
  score = Math.max(0, Math.min(100, score));

  let status: AuthenticityStatus;
  let verificationMethod: AuthenticityEvidence['verification_method'] = 'MULTI_SIGNAL_HEURISTIC';

  // REGLA CRÍTICA: VERIFIED_OFFICIAL requiere EVIDENCIA FUERTE:
  // Fabricante oficial + (UPC/MPN válido O Despacho directo de retailer autorizado) + Cero red flags + score >= 75
  const hasStrongEvidence = hasValidIdentifier || isDirectStore;

  if (score >= 75 && brandMatchesOfficial && red_flags.length === 0 && hasStrongEvidence) {
    status = 'VERIFIED_OFFICIAL';
    verificationMethod = hasValidIdentifier ? 'DIRECT_IDENTIFIER_MATCH' : 'AUTHORIZED_RETAILER_DIRECT';
    reasons.push('Producto original y oficialmente licenciado validado con evidencia verificable.');
  } else if (brandMatchesOfficial && !hasStrongEvidence && red_flags.length === 0) {
    status = 'NEEDS_VERIFICATION';
    reasons.push('Marca identificada pero falta código identificador (UPC/EAN) o venta directa verificada de retailer. Requiere auditoría manual.');
  } else if (red_flags.length > 0 || score < 70) {
    status = 'NEEDS_VERIFICATION';
    reasons.push('Señales incompletas o advertencias detectadas. Requiere auditoría manual antes de habilitar importación.');
  } else {
    status = 'NEEDS_VERIFICATION';
    reasons.push('Evidencia insuficiente para certificar autenticidad oficial.');
  }

  return {
    status,
    score,
    confidence: score,
    brand_verified: brandMatchesOfficial,
    license_verified: licenseMatchesOfficial,
    official_distributor: isDirectStore,
    has_valid_identifier: hasValidIdentifier,
    verification_method: verificationMethod,
    verification_evidence: [...green_flags],
    verification_source: input.retailer ? `${input.retailer} (${input.seller || 'direct'})` : 'URL Metadata',
    verified_at: new Date().toISOString(),
    red_flags,
    green_flags,
    reasons
  };
}

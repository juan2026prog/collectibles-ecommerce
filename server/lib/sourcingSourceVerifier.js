import { validateCandidate, deduplicateCanonicalCandidates, extractAmazonAsin, publicUrl, provenance, finiteNumber } from '../../shared/sourcingCandidateValidation.js';
import { parseTiendamiaResponse } from '../../shared/sourcingMarketPresence.js';
import { sameProductTitle } from '../../shared/sourcingProductIdentity.js';
export { sameProductTitle } from '../../shared/sourcingProductIdentity.js';

// Verification never fetches arbitrary model/client hosts. Unknown domains stay UNKNOWN.
const PRODUCT_HOSTS = ['amazon.com', 'amazon.co.uk', 'amazon.ca', 'ebay.com', 'bestbuy.com', 'walmart.com', 'target.com',
  'mcfarlane.com', 'mcfarlanetoysstore.com', 'hasbropulse.com', 'necaonline.com', 'store.necaonline.com', 'bandai.com', 'tamashiiweb.com',
  'mattel.com', 'shop.mattel.com', 'bigbadtoystore.com', 'entertainmentearth.com', 'sideshow.com', 'hottopic.com', 'lego.com', 'pokemoncenter.com',
  'funko.com', 'youtooz.com', 'sanrio.com', 'basicfun.com', 'spinmaster.com', 'jazwares.com', 'tiendamia.com.uy'];
const IMAGE_HOSTS = [...PRODUCT_HOSTS, 'media-amazon.com', 'ssl-images-amazon.com', 'scene7.com', 'cdn.shopify.com', 'images.squarespace-cdn.com', 'shopify.com', 'cloudfront.net', 'walmartimages.com', 'necaonline.com'];
const allowed = (url, hosts) => {
  const clean = publicUrl(url);
  if (!clean) return false;
  const u = new URL(clean);
  return u.protocol === 'https:' && (!u.port || u.port === '443') && hosts.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
};

export async function fetchSource(url, { image = false, fetchImpl = fetch, deadline = Date.now() + 4000 } = {}) {
  const hosts = image ? IMAGE_HOSTS : PRODUCT_HOSTS;
  let target = publicUrl(url);
  for (let redirects = 0; redirects < 4; redirects++) {
    if (Date.now() >= deadline) throw new Error('VERIFICATION_BUDGET_EXHAUSTED');
    if (!allowed(target, hosts)) throw new Error('SOURCE_HOST_NOT_SUPPORTED');
    const response = await fetchImpl(target, { method: image ? 'HEAD' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(Math.max(1, Math.min(4000, deadline - Date.now()))), headers: { Accept: image ? 'image/*' : 'text/html,application/xhtml+xml' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      if (!next) throw new Error('INVALID_REDIRECT');
      target = new URL(next, target).href;
      continue;
    }
    const type = response.headers.get('content-type') || '';
    if (image) return { status: response.status, type, url: target };
    if (!response.ok || !/text\/html|application\/xhtml/.test(type)) return { status: response.status, type, url: target, html: '' };
    const reader = response.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2_000_000) { await reader.cancel(); throw new Error('SOURCE_TOO_LARGE'); }
        html += decoder.decode(value, { stream: true });
      }
    } else html = await response.text();
    return { status: response.status, type, url: target, html };
  }
  throw new Error('TOO_MANY_REDIRECTS');
}

export function productSignalContext(raw, country, signals = [], listings = []) {
  const title = raw.title || raw.name;
  const observations = [];
  for (const s of signals) {
    if (!sameProductTitle(s.product_identity, title) || !s.observed_at || finiteNumber(s.value) === null || finiteNumber(s.value) < 0) continue;
    const internal = s.source_type === 'INTERNAL_DATA' && s.country === country && ['SEARCH_VOLUME', 'WISHLIST_ADD', 'ORDER_COUNT', 'PRODUCT_VIEW'].includes(s.signal_type);
    const momentum = s.metadata?.status === 'OBSERVED' && s.metadata?.verification === 'SOURCE_VERIFIED' && s.signal_type === 'GLOBAL_MOMENTUM';
    if (!internal && !momentum) continue;
    observations.push({ field: internal ? 'local_demand' : 'global_momentum', ...provenance(Number(s.value), 'OBSERVED', s.source_name,
      s.source_url || (internal ? 'https://collectibles.uy/admin/sourcing' : null), s.observed_at, { source_type: s.source_type, evidence_text: s.evidence_text, signal_id: s.id }) });
  }
  const matching = listings.filter(m => sameProductTitle(m.title, title) && publicUrl(m.permalink));
  const first = matching.find(m => finiteNumber(m.price) > 0 && m.currency_id);
  // A partial retailer corpus can prove presence, never absence or low supply.
  const marketChecks = country === 'UY' && matching.length ? { mercadolibre: { presence: 'PRESENT', source_url: matching[0].permalink,
    checked_at: new Date().toISOString(), price: first ? provenance(Number(first.price), 'OBSERVED', 'Mercado Libre Uruguay', first.permalink, new Date().toISOString(), { currency: first.currency_id }) : provenance() } } : {};
  return { observations, marketChecks };
}

export function extractProductObservations(raw, page, now = new Date().toISOString()) {
  if (page.status !== 200 || !page.html || /captcha|robot check|access denied/i.test(page.html)) return [];
  const title = raw.title || raw.name;
  const nodes = [];
  const visit = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) n.forEach(visit); else { nodes.push(n); if (n['@graph']) visit(n['@graph']); } };
  for (const match of page.html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Malformed markup is not evidence. */ }
  }
  const product = nodes.find(n => (n['@type'] === 'Product' || Array.isArray(n['@type']) && n['@type'].includes('Product')) && sameProductTitle(n.name, title));
  if (!product) return [];
  const source = new URL(page.url).hostname;
  const record = (field, value, extra = {}) => ({ field, ...provenance(value, 'OBSERVED', source, page.url, now, { verification: 'SOURCE_VERIFIED', method: 'PRODUCT_JSON_LD', ...extra }) });
  const observations = [record('identity', product.name)];
  const asin = extractAmazonAsin(page.url);
  if (asin && (product.sku === asin || product.productID === asin || page.html.includes(`data-asin="${asin}"`))) observations.push(record('asin', asin));
  if (product.sku) observations.push(record('sku', String(product.sku)));
  if (product.gtin || product.gtin13 || product.gtin12) observations.push(record('gtin', String(product.gtin || product.gtin13 || product.gtin12)));
  // An aggregate price or another variant's offer is not an exact product price.
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  const offer = offers.find(o => o && o['@type'] !== 'AggregateOffer' && o.priceCurrency === 'USD' && finiteNumber(o.price) > 0);
  if (offer) observations.push(record('origin_price', Number(offer.price), { currency: 'USD' }));
  const state = offer?.availability?.split('/').pop();
  if (state === 'InStock') observations.push(record('availability', 'IN_STOCK'));
  if (state === 'OutOfStock' || state === 'SoldOut') observations.push(record('availability', 'OUT_OF_STOCK'));
  if (state === 'PreOrder') { observations.push(record('availability', 'PREORDER')); observations.push(record('release', 'PREORDER')); }
  const img = Array.isArray(product.image) ? product.image[0] : product.image;
  const imageUrl = publicUrl(typeof img === 'object' ? img?.url : img);
  if (imageUrl) observations.push(record('image', imageUrl, { verification: 'SOURCE_EXTRACTED', exact_product_relationship: true }));
  return observations;
}

export async function lookupVerifiedTiendamia(identifier, { fetchImpl = fetch, deadline = Date.now() + 4000 } = {}) {
  if (!['SOURCE_VERIFIED', 'SOURCE_CORROBORATED'].includes(identifier?.verification) || !/^[A-Z0-9]{10}$/.test(identifier?.value || '')) {
    return { presence: 'UNKNOWN', reason: 'Identificador no verificado ni corroborado', price: provenance() };
  }
  try {
    const page = await fetchSource(`https://tiendamia.com.uy/p/amz/${identifier.value.toLowerCase()}`, { fetchImpl, deadline });
    return parseTiendamiaResponse(page.html, identifier.value, page.status);
  } catch { return { presence: 'UNKNOWN', reason: 'Consulta no disponible; no demuestra ausencia', price: provenance() }; }
}

export async function verifyCandidateSources(raw, { country = 'UY', origin = 'MANUAL_RESEARCH', observations: trusted = [], fetchImpl = fetch, index = 0, marketChecks: trustedMarkets = {}, deadline = Date.now() + 12000 } = {}) {
  const urls = [...new Set([raw.url || raw.source_url, ...(Array.isArray(raw.evidence) ? raw.evidence.map(e => e.url) : [])].map(publicUrl).filter(Boolean))].slice(0, 3);
  const observations = [...trusted];
  const diagnostics = [];
  for (const url of urls) {
    if (Date.now() >= deadline) { diagnostics.push({ field: 'source', url, reason: 'VERIFICATION_BUDGET_EXHAUSTED' }); continue; }
    try {
      const page = await fetchSource(url, { fetchImpl, deadline });
      const extracted = extractProductObservations(raw, page);
      for (const o of extracted) {
        if (o.field === 'image') {
          try {
            const img = await fetchSource(o.value, { image: true, fetchImpl, deadline });
            diagnostics.push({ field: 'image', url: o.value, http_status: img.status, content_type: img.type });
            if (img.status !== 200 || !img.type.startsWith('image/')) continue;
            o.verification = 'SOURCE_VERIFIED'; o.http_status = img.status; o.content_type = img.type;
          } catch (e) { diagnostics.push({ field: 'image', url: o.value, reason: e.message }); continue; }
        }
        observations.push(o);
      }
      diagnostics.push({ field: 'source', url, http_status: page.status, identity_verified: extracted.some(o => o.field === 'identity') });
    } catch (e) { diagnostics.push({ field: 'source', url, reason: e.message }); }
  }
  let candidate = validateCandidate(raw, { country, origin, observations, index });
  const tm = country === 'UY' && Date.now() < deadline ? await lookupVerifiedTiendamia(candidate.provenance.asin, { fetchImpl, deadline }) : { presence: 'UNKNOWN', reason: 'Consulta pendiente' };
  candidate = validateCandidate(raw, { country, origin, observations, index, marketChecks: { ...trustedMarkets, tiendamia: tm } });
  candidate.validation_diagnostics = diagnostics;
  return candidate;
}

export async function validateCandidateBatch(items, context = {}) {
  const output = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      const signalContext = productSignalContext(items[i], context.country || 'UY', context.signalRows, context.marketRows);
      output[i] = await verifyCandidateSources(items[i], { ...context, ...signalContext, index: i });
    }
  }));
  return deduplicateCanonicalCandidates(output);
}

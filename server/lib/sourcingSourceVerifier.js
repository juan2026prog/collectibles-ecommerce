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

export function classifySourceDomain(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return 'UNKNOWN';
  try {
    const domain = new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
    if (domain.includes('mcfarlane') || domain.includes('necaonline') || domain.includes('hasbropulse') || 
        domain.includes('funko.com') || domain.includes('goodsmile') || domain.includes('sideshow') || 
        domain.includes('pokemon.com') || domain.includes('bandai') || domain.includes('tamashiiweb') || 
        domain.includes('mattel.com') || domain.includes('lego.com') || domain.includes('sanrio.com') || 
        domain.includes('basicfun.com') || domain.includes('spinmaster.com') || domain.includes('jazwares.com') ||
        domain.includes('youtooz.com')) {
      return 'OFFICIAL';
    }
    if (domain.includes('bigbadtoystore') || domain.includes('entertainmentearth') || domain.includes('bestbuy.') || 
        domain.includes('target.') || domain.includes('walmart.') || domain.includes('hottopic.com') || 
        domain.includes('gamestop.com')) {
      return 'RETAILER';
    }
    if (domain.includes('amazon.') || domain.includes('ebay.') || domain.includes('tiendamia.') || domain.includes('mercadolibre.')) {
      return 'MARKETPLACE';
    }
    if (domain.includes('toyark.com') || domain.includes('toynewsi.com') || domain.includes('figurerealm.com') || 
        domain.includes('bleedingcool.com') || domain.includes('ign.com') || domain.includes('gamespot.com') || 
        domain.includes('polygon.com') || domain.includes('screenrant.com') || domain.includes('marvelousnews.com') ||
        domain.includes('gamesradar.com')) {
      return 'EDITORIAL';
    }
    if (domain.includes('reddit.com') || domain.includes('twitter.com') || domain.includes('x.com') || 
        domain.includes('facebook.com') || domain.includes('instagram.com') || domain.includes('tiktok.com')) {
      return 'COMMUNITY';
    }
    if (domain.includes('youtube.com') || domain.includes('wikipedia.org') || domain.includes('fandom.com') || 
        domain.includes('vimeo.com')) {
      return 'MEDIA';
    }
    return 'OTHER';
  } catch {
    return 'UNKNOWN';
  }
}

export function matchProductCitation(item, srcTitle, srcUrl = '') {
  if (!item || (!srcTitle && !srcUrl)) return false;
  const norm = str => String(str || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  
  const itemAsin = (typeof item.asin === 'string' && /^[A-Z0-9]{10}$/i.test(item.asin.trim())) ? item.asin.trim().toUpperCase() : null;
  const srcAsin = srcUrl ? extractAmazonAsin(srcUrl) : null;
  if (itemAsin && srcAsin && itemAsin === srcAsin) return true;

  const itemUrl = publicUrl(item.url);
  const cleanSrcUrl = publicUrl(srcUrl);
  if (itemUrl && cleanSrcUrl && itemUrl === cleanSrcUrl) return true;

  const t1 = norm(item.title || item.name);
  const t2 = norm(srcTitle);
  if (t1 && t2 && t1 === t2) return true;

  // Extract core keywords
  const stopwords = new Set(['figura', 'figure', 'figures', 'action', 'scale', 'serie', 'series', 'line', 'coleccion', 'collection', 'edition', 'edicion', 'official', 'oficial', 'pack', 'set', 'the', 'del', 'por', 'from', 'with', 'and', 'para', 'item', 'inch', 'pulgadas', 'review', 'buy', 'online', 'store']);
  const getTokens = str => norm(str).split(/\s+/).filter(tok => tok.length > 2 && !stopwords.has(tok));
  
  const itemTokens = getTokens(t1);
  const srcTokens = new Set(getTokens(t2));

  if (itemTokens.length === 0 || srcTokens.size === 0) return false;

  // If brand is present, check brand token
  if (item.brand && item.brand.length > 2) {
    const brandTokens = getTokens(item.brand);
    const hasBrand = brandTokens.some(bt => srcTokens.has(bt));
    if (!hasBrand && !srcUrl.toLowerCase().includes(norm(item.brand).replace(/\s+/g, ''))) {
      return false;
    }
  }

  const matchedTokens = itemTokens.filter(tok => srcTokens.has(tok));
  const matchRatio = matchedTokens.length / itemTokens.length;
  return matchedTokens.length >= 2 && matchRatio >= 0.6;
}

export function associateSourcesToCandidates(items = [], globalSources = []) {
  if (!Array.isArray(items) || !items.length || !Array.isArray(globalSources) || !globalSources.length) {
    return items;
  }

  const cleanSources = globalSources.map(s => ({
    ...s,
    url: publicUrl(s.url),
    type: s.source_type || classifySourceDomain(s.url),
    domain: s.domain || (s.url ? (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '')
  })).filter(s => s.url);

  return items.map(item => {
    if (!item) return item;
    const enriched = { ...item };
    const commercialSources = Array.isArray(item.commercial_sources) ? [...item.commercial_sources] : [];
    const discoverySources = Array.isArray(item.discovery_sources) ? [...item.discovery_sources] : [];
    const itemEvidence = Array.isArray(item.evidence) ? [...item.evidence] : [];

    const itemUrl = publicUrl(item.url);

    for (const src of cleanSources) {
      const srcUrl = src.url;
      const srcAsin = extractAmazonAsin(srcUrl);
      const srcType = src.type;
      const srcTitle = String(src.title || src.name || src.cited_text || '');

      const isMatch = matchProductCitation(item, srcTitle, srcUrl) || commercialSources.some(cs => cs.product_url && publicUrl(cs.product_url) === srcUrl);

      if (isMatch) {
        // Disambiguate: ensure no other candidate has a strictly better match
        const otherMatches = items.filter(other => other !== item && matchProductCitation(other, srcTitle, srcUrl));
        if (otherMatches.length > 0) {
          continue; // Ambiguous citation rejected
        }

        const isCommercial = ['OFFICIAL', 'RETAILER', 'MARKETPLACE'].includes(srcType);
        if (isCommercial) {
          if (!commercialSources.some(cs => cs.product_url === srcUrl)) {
            commercialSources.push({
              retailer: src.retailer || src.domain || 'Retailer',
              product_url: srcUrl,
              price: finiteNumber(src.price) ?? finiteNumber(item.origin_price_usd) ?? null,
              currency: src.currency || 'USD',
              image_url: publicUrl(src.image_url) || null,
              identifier: srcAsin || null,
              identifier_type: srcAsin ? 'ASIN' : null,
              source_type: srcType
            });
          }
          // If candidate had an editorial primary URL, upgrade primary URL to commercial source
          if ((!item.url || !allowed(item.url, PRODUCT_HOSTS)) && allowed(srcUrl, PRODUCT_HOSTS)) {
            enriched.url = srcUrl;
            enriched.retailer = src.domain || 'Retailer';
            if (srcAsin && !enriched.asin) enriched.asin = srcAsin;
            if (src.image_url && !enriched.image_url) enriched.image_url = src.image_url;
            if (finiteNumber(src.price) && !finiteNumber(enriched.origin_price_usd)) enriched.origin_price_usd = Number(src.price);
          }
        } else {
          if (!discoverySources.some(ds => ds.url === srcUrl)) {
            discoverySources.push({
              name: src.title || src.domain || 'Discovery Source',
              url: srcUrl,
              type: srcType
            });
          }
        }

        if (!itemEvidence.some(e => e.url === srcUrl)) {
          itemEvidence.push({
            url: srcUrl,
            retailer: src.domain || null,
            snippet: src.cited_text || src.title || null,
            source_type: srcType,
            observed_at: src.observed_at || new Date().toISOString()
          });
        }
      }
    }

    enriched.commercial_sources = commercialSources;
    enriched.discovery_sources = discoverySources;
    enriched.evidence = itemEvidence;
    return enriched;
  });
}

export function corroborateCandidateEvidence(raw, { observations = [], rejectedFields = new Set(), now = new Date().toISOString() } = {}) {
  const result = [...observations];
  const isRejected = field => rejectedFields instanceof Set ? rejectedFields.has(field) : Array.isArray(rejectedFields) ? rejectedFields.includes(field) : false;
  const hasField = field => result.some(o => o.field === field) || isRejected(field);

  // Find all commercial sources: primary URL + any commercial_sources entries
  const commercialCandidates = [
    ...(raw.url ? [{ product_url: raw.url, retailer: raw.retailer, price: raw.origin_price_usd, image_url: raw.image_url }] : []),
    ...(Array.isArray(raw.commercial_sources) ? raw.commercial_sources : [])
  ];

  const validCommercial = commercialCandidates.find(cs => {
    const u = publicUrl(cs.product_url || cs.url);
    return u && allowed(u, PRODUCT_HOSTS);
  });

  const commUrl = publicUrl(validCommercial?.product_url || validCommercial?.url);
  const commRetailer = validCommercial?.retailer || (commUrl ? new URL(commUrl).hostname.replace(/^www\./, '') : null);

  // 1. Identity Corroboration (from allowed commercial source)
  if (!hasField('identity') && commUrl && typeof raw.title === 'string' && raw.title.trim().length > 0) {
    result.push({
      field: 'identity',
      ...provenance(raw.title.trim(), 'CORROBORATED', commRetailer, commUrl, now, {
        verification: 'SOURCE_CORROBORATED',
        method: 'WEB_SEARCH_CITATION'
      })
    });
  }

  // 2. Identifier (ASIN) Corroboration via Source URL
  if (!hasField('asin')) {
    const asinUrl = commUrl || publicUrl(raw.url);
    if (asinUrl) {
      const extractedAsin = extractAmazonAsin(asinUrl);
      if (extractedAsin) {
        result.push({
          field: 'asin',
          ...provenance(extractedAsin, 'CORROBORATED', 'Amazon', asinUrl, now, {
            verification: 'SOURCE_CORROBORATED',
            method: 'URL_EXTRACTION'
          })
        });
      }
    }
  }

  // 3. Price Corroboration (ONLY from allowed commercial sources, NEVER from editorial/news)
  if (!hasField('origin_price')) {
    const commWithPrice = commercialCandidates.find(cs => {
      const u = publicUrl(cs.product_url || cs.url);
      return u && allowed(u, PRODUCT_HOSTS) && finiteNumber(cs.price ?? raw.origin_price_usd ?? raw.price_usd ?? raw.price) !== null && Number(cs.price ?? raw.origin_price_usd ?? raw.price_usd ?? raw.price) > 0;
    });
    if (commWithPrice) {
      const pUrl = publicUrl(commWithPrice.product_url || commWithPrice.url);
      const pRetailer = commWithPrice.retailer || (pUrl ? new URL(pUrl).hostname.replace(/^www\./, '') : commRetailer);
      const rawPrice = Number(commWithPrice.price ?? raw.origin_price_usd ?? raw.price_usd ?? raw.price);
      result.push({
        field: 'origin_price',
        ...provenance(rawPrice, 'CORROBORATED', pRetailer, pUrl, now, {
          currency: 'USD',
          verification: 'SOURCE_CORROBORATED',
          method: 'WEB_SEARCH_CITATION'
        })
      });
    }
  }

  // 4. Image Corroboration (ONLY from allowed image hosts or commercial sources)
  if (!hasField('image')) {
    const commWithImage = commercialCandidates.find(cs => {
      const img = publicUrl(cs.image_url || raw.image_url || raw.image || raw.imageUrl || raw.thumbnail_url);
      return img && allowed(img, IMAGE_HOSTS) && !img.includes('unsplash.com');
    });
    const imgCandidate = publicUrl(commWithImage?.image_url || raw.image_url || raw.image || raw.imageUrl || raw.thumbnail_url);
    if (imgCandidate && allowed(imgCandidate, IMAGE_HOSTS) && !imgCandidate.includes('unsplash.com')) {
      const iUrl = publicUrl(commWithImage?.product_url || commWithImage?.url || commUrl || imgCandidate);
      const iRetailer = commWithImage?.retailer || (iUrl ? new URL(iUrl).hostname.replace(/^www\./, '') : commRetailer) || new URL(imgCandidate).hostname;
      result.push({
        field: 'image',
        ...provenance(imgCandidate, 'CORROBORATED', iRetailer, iUrl, now, {
          verification: 'SOURCE_CORROBORATED',
          exact_product_relationship: true,
          method: 'WEB_SEARCH_CITATION'
        })
      });
    }
  }

  // 5. Discovery / Release Corroboration (from discovery sources or editorial announcements)
  if (!hasField('release')) {
    const hasReleaseSignal = raw.is_preorder || raw.is_new || raw.release_date || (raw.discovery_source && raw.discovery_source.url);
    if (hasReleaseSignal) {
      const discoveryUrl = publicUrl(raw.discovery_source?.url || raw.url);
      const discoveryName = raw.discovery_source?.name || raw.retailer || 'Discovery Announcement';
      const releaseStatus = raw.is_preorder ? 'PREORDER' : 'NEW';
      result.push({
        field: 'release',
        ...provenance(releaseStatus, 'CORROBORATED', discoveryName, discoveryUrl, now, {
          source_type: raw.discovery_source?.type || 'EDITORIAL',
          verification: 'SOURCE_CORROBORATED',
          method: 'DISCOVERY_CITATION'
        })
      });
    }
  }

  return result;
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
  let observations = [...trusted];
  const diagnostics = [];
  const rejectedFields = new Set();
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
            if (img.status !== 200 || !img.type.startsWith('image/')) {
              rejectedFields.add('image');
              continue;
            }
            o.verification = 'SOURCE_VERIFIED'; o.http_status = img.status; o.content_type = img.type;
          } catch (e) {
            rejectedFields.add('image');
            diagnostics.push({ field: 'image', url: o.value, reason: e.message });
            continue;
          }
        }
        observations.push(o);
      }
      diagnostics.push({ field: 'source', url, http_status: page.status, identity_verified: extracted.some(o => o.field === 'identity') });
    } catch (e) { diagnostics.push({ field: 'source', url, reason: e.message }); }
  }

  // Corroborate structured evidence from verified web search citations for any fields not directly scraped (e.g. when blocked by retailer WAF)
  observations = corroborateCandidateEvidence(raw, { observations, rejectedFields });

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

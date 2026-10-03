import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { validateCandidate, validateStoredCandidate, deduplicateCanonicalCandidates, finiteNumber, SOURCING_PURCHASE_CAPABILITY, AUTO_PUBLISH } from '../../../shared/sourcingCandidateValidation.js';
import { parseTiendamiaResponse } from '../../../shared/sourcingMarketPresence.js';
import { verifyCandidateSources, extractProductObservations, lookupVerifiedTiendamia, productSignalContext, fetchSource } from '../../../server/lib/sourcingSourceVerifier.js';
import { ProductThumbnail, ProductCandidatesView } from '../components/admin/sourcing/ProductCandidatesView';
import { WhyExplainabilityModal } from '../components/admin/sourcing/WhyExplainabilityModal';
import { researchIntelligenceService } from '../services/sourcing/researchIntelligenceService';
import { aiGateway } from '../services/ai/aiGateway';
import { manualCandidates, storedCandidates } from '../services/sourcing/canonicalCandidateValidation';
import { checkTiendamiaByAsin } from '../services/sourcing/tiendamiaMatchingService';
import { calculateCandidateImportAnalysis } from '../services/sourcing/candidateImportAnalysis';

const title = 'Care Bears Cheer Bear 14 inch Plush';
const raw = { title, brand: 'Basic Fun', url: 'https://www.amazon.com/dp/B08552JGRF', asin: 'B08552JGRF', origin_price_usd: 26.99, image_url: 'https://m.media-amazon.com/images/I/product.jpg' };
const date = '2026-10-03T00:00:00Z';
const obs = (field: string, value: any, url = raw.url) => ({ field, value, status: 'OBSERVED', source: 'Amazon', source_url: url, observed_at: date, verification: 'SOURCE_VERIFIED', currency: 'USD' });
const presence = { presence: 'VERIFIED_ABSENT', source_url: 'https://tiendamia.com.uy/p/amz/b08552jgrf', checked_at: date };
const page = (overrides = {}) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: title, sku: raw.asin, image: raw.image_url, offers: { '@type': 'Offer', price: 26.99, priceCurrency: 'USD', availability: 'https://schema.org/InStock' }, ...overrides })}</script>`;
const mockFetch = () => vi.fn(async (url: any, options: any) => {
  if (options?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  if (String(url).includes('tiendamia')) return new Response('technical error', { status: 404, headers: { 'content-type': 'text/html' } });
  return new Response(page(), { status: 200, headers: { 'content-type': 'text/html' } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Canonical evidence and structural requirements', () => {
  it('A/M/N/O/P: unknown values stay null; no positive score or artificial confidence', () => {
    const c = validateCandidate({ title, price_usd: 0, confidence_score: 80 });
    expect(c.pricing.origin_price_usd).toBeNull(); expect(c.pricing.landed_cost_estimated_usd).toBeNull();
    expect(c.pricing.estimated_margin_percent).toBeNull(); expect(c.opportunity_score).toBe(0); expect(c.confidence_score).toBeNull();
    expect(finiteNumber(null)).toBeNull(); expect(finiteNumber(false)).toBeNull(); expect(finiteNumber(0)).toBe(0);
  });
  it('B/C: technical errors and unqueried markets never become absence or opportunity', async () => {
    for (const status of [403, 404, 429, 500]) {
      const m = parseTiendamiaResponse('No encontramos resultados para tu búsqueda', raw.asin, status);
      expect(m.presence).toBe('UNKNOWN');
      expect(validateCandidate(raw, { marketChecks: { tiendamia: m } }).why_explanation.scoring_breakdown.local_supply_gap.points).toBe(0);
    }
  });
  it('D: verified absence alone is not supply-gap opportunity', () => {
    const c = validateCandidate(raw, { marketChecks: { tiendamia: presence } });
    expect(c.why_explanation.scoring_breakdown.local_supply_gap.points).toBe(0); expect(c.status).not.toBe('OPPORTUNITY');
  });
  it('verified gap needs independent positive evidence', () => {
    const c = validateCandidate(raw, { observations: [obs('global_momentum', 12, 'https://www.reddit.com/r/toys/comments/1')], marketChecks: { tiendamia: presence } });
    expect(c.why_explanation.scoring_breakdown.local_supply_gap.points).toBe(15); expect(c.status).toBe('OPPORTUNITY');
  });
  it('preorder/listing and several identity sources never become momentum by themselves', () => {
    const c = validateCandidate(raw, { observations: [obs('identity', title), obs('identity', title, 'https://www.walmart.com/ip/1'), obs('release', 'PREORDER')] });
    expect(c.why_explanation.scoring_breakdown.global_momentum.points).toBe(0);
  });
  it('E: AI declared ID blocks downstream and client cannot elevate it', async () => {
    const fetchImpl = vi.fn(); const c = validateCandidate({ title, asin: raw.asin, identifier_verification: 'SOURCE_VERIFIED' });
    expect(c.provenance.asin.verification).toBe('AI_DECLARED');
    expect((await lookupVerifiedTiendamia(c.provenance.asin, { fetchImpl })).presence).toBe('UNKNOWN'); expect(fetchImpl).not.toHaveBeenCalled();
    expect((await checkTiendamiaByAsin(raw.asin)).presence).toBe('UNKNOWN');
  });
  it('an Amazon-looking path on an unrelated host is not source extracted', () => {
    expect(validateCandidate({ title, url: 'https://evil.example/dp/B08552JGRF', asin: raw.asin }).provenance.asin.verification).toBe('AI_DECLARED');
    expect(validateCandidate(raw).provenance.asin.verification).toBe('SOURCE_EXTRACTED');
  });
  it('F/G: actual matching product page verifies identifier, observed price and exact image', async () => {
    const fetchImpl = mockFetch(); const c = await verifyCandidateSources(raw, { fetchImpl });
    expect(c.provenance.asin.verification).toBe('SOURCE_VERIFIED'); expect(c.pricing.origin_price_usd).toBe(26.99);
    expect(c.image_url).toBe(raw.image_url); expect(c.provenance.image.content_type).toBe('image/jpeg');
    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes('tiendamia'))).toBe(true); expect(c.market_presence.tiendamia.presence).toBe('UNKNOWN');
  });
  it('another product/variant page cannot verify the image or identity', () => {
    expect(extractProductObservations(raw, { status: 200, html: page({ name: 'Care Bears Grumpy Bear 14 inch Plush' }), url: raw.url })).toEqual([]);
  });
  it('image status/content-type errors preserve candidate and yield null image', async () => {
    const fetchImpl = vi.fn(async (_: any, opts: any) => new Response(opts?.method === 'HEAD' ? null : page(), { status: 200, headers: { 'content-type': 'text/html' } }));
    const c = await verifyCandidateSources(raw, { fetchImpl }); expect(c.title).toBe(title); expect(c.image_url).toBeNull();
  });
  it('H/I/J: image failure preserves card and new image URL resets error', () => {
    const c = validateCandidate(raw, { observations: [obs('image', raw.image_url)] });
    const props = { country: 'UY', onOpenWhyModal: vi.fn(), onSendToImport: vi.fn(), onToggleWatchlist: vi.fn(), onIgnore: vi.fn() };
    const view = render(<ProductCandidatesView {...props} candidates={[c]} />);
    fireEvent.error(screen.getByRole('img')); expect(screen.getByText(title)).toBeInTheDocument(); expect(screen.getByText('Sin imagen')).toBeInTheDocument();
    view.rerender(<ProductCandidatesView {...props} candidates={[{ ...c, image_url: 'https://m.media-amazon.com/images/I/other.jpg' }]} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://m.media-amazon.com/images/I/other.jpg');
    view.rerender(<ProductCandidatesView {...props} candidates={[{ ...c, image_url: null }]} />); expect(screen.getByText(title)).toBeInTheDocument();
  });
  it('WHY renders factor objects, evidence and honest confidence without crashing', () => {
    render(<WhyExplainabilityModal candidate={validateCandidate(raw)} isOpen onClose={vi.fn()} onSendToImport={vi.fn()} />);
    expect(screen.getByText(/Confianza: UNKNOWN/)).toBeInTheDocument(); expect(screen.getAllByText(/No disponible/).length).toBeGreaterThan(0);
  });
  it('K: exact duplicates aggregate independently verified evidence', () => {
    const a = validateCandidate(raw, { observations: [obs('identity', title)] });
    const b = validateCandidate({ ...raw, url: 'https://www.walmart.com/ip/1', asin: undefined }, { observations: [obs('identity', title, 'https://www.walmart.com/ip/1')] });
    const [c] = deduplicateCanonicalCandidates([a, b]); expect(c.raw_evidence.filter(e => e.field === 'identity')).toHaveLength(2);
    expect(deduplicateCanonicalCandidates([a, b])).toHaveLength(1);
  });
  it('L: characters, sizes, editions and conflicting identifiers stay separate', () => {
    for (const variant of [{ title: 'Care Bears Grumpy Bear 14 inch Plush' }, { size: '9 inch' }, { edition: 'exclusive' }, { asin: 'B08553JXYZ' }]) {
      expect(deduplicateCanonicalCandidates([validateCandidate(raw), validateCandidate({ ...raw, ...variant })])).toHaveLength(2);
    }
  });
  it('cost and margin require complete observed inputs and a valid sale price', () => {
    const inputs = ['origin_price', 'shipping', 'customs', 'fees'].map((field, i) => ({ field, ...obs(field, i === 0 ? 26.99 : 5) }));
    const economic = { country: 'UY', engine: 'CANONICAL_LANDED_COST', landed_cost: 41.99, observed_at: date, inputs };
    const observations = [obs('origin_price', 26.99)];
    expect(validateCandidate(raw, { observations, economic }).pricing.estimated_margin_percent).toBeNull();
    expect(validateCandidate(raw, { observations, economic: { ...economic, inputs: inputs.slice(0, 2) } }).pricing.landed_cost_estimated_usd).toBeNull();
    const c = validateCandidate(raw, { observations, economic: { ...economic, sale_price: obs('sale_price', 60) } });
    expect(c.pricing.estimated_margin_percent).toBeCloseTo(30.02); expect(c.provenance.margin.derived_from).toHaveLength(2);
  });
  it('Q/R: manual and persisted discovery use identical canonical evaluation', async () => {
    const c = validateCandidate(raw, { observations: [obs('identity', title), obs('origin_price', 26.99)] });
    vi.spyOn(aiGateway, 'execute').mockResolvedValue({ success: true, data: { items: [raw], canonical_candidates: [c] } } as any);
    const manual = await researchIntelligenceService.research({ query: title, country: 'UY' });
    const stored = storedCandidates([{ id: 'db-id', country: 'UY', evidence: { canonical_candidate: c } }]);
    expect(manual.candidates[0].opportunity_score).toBe(stored[0].opportunity_score); expect(manual.candidates[0].pricing).toEqual(stored[0].pricing);
    expect(manualCandidates([raw], 'UY')[0].pricing.origin_price_usd).toBeNull();
  });
  it('legacy fabricated economics/confidence are quarantined without deleting candidate', () => {
    const c = validateStoredCandidate({ id: 'legacy', title, country: 'UY', source_url: raw.url, price_usd: 26.99, landed_cost_usd: 0, margin_percent: 176, confidence_score: 80 });
    expect(c.title).toBe(title); expect(c.pricing.estimated_margin_percent).toBeNull(); expect(c.confidence_score).toBeNull(); expect(c.claims.price_usd).toBe(26.99);
  });
  it('S/T/U: outside watchlist stays eligible, no buying or autopublishing capability', () => {
    expect(validateCandidate(raw, { origin: 'DISCOVERED_OUTSIDE_WATCHLIST' }).discovered_from).toBe('DISCOVERED_OUTSIDE_WATCHLIST');
    expect(SOURCING_PURCHASE_CAPABILITY).toBe('NONE'); expect(AUTO_PUBLISH).toBe(false);
  });
  it('partial ML corpus proves exact presence only; no hardcoded FX or absence', () => {
    const c = productSignalContext(raw, 'UY', [], [{ title, price: 2000, currency_id: 'UYU', permalink: 'https://articulo.mercadolibre.com.uy/MLU-1' }]);
    expect(c.marketChecks.mercadolibre.presence).toBe('PRESENT'); expect(c.marketChecks.mercadolibre.price.value).toBe(2000);
    expect(productSignalContext(raw, 'UY', [], []).marketChecks).toEqual({});
  });
  it('real internal counts are additional evidence, including observed zero', () => {
    const c = productSignalContext(raw, 'UY', [{ id: 'search', product_identity: title, value: 0, source_type: 'INTERNAL_DATA', country: 'UY', signal_type: 'SEARCH_VOLUME', observed_at: date }]);
    const evaluated = validateCandidate(raw, c); expect(evaluated.provenance.demand.status).toBe('OBSERVED'); expect(evaluated.provenance.demand.value).toBe(0);
    expect(evaluated.why_explanation.scoring_breakdown.local_demand.points).toBe(0);
  });
  it('verification does not request untrusted hosts or redirect to them', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    await expect(fetchSource('https://www.amazon.com/dp/B08552JGRF', { fetchImpl })).rejects.toThrow('SOURCE_HOST_NOT_SUPPORTED'); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('import analysis reuses the canonical pricing engine and requires quote and sale inputs', () => {
    const c = validateCandidate(raw, { observations: [obs('identity', title), obs('origin_price', 26.99)] });
    const item = { price_usd: 26.99, raw_data: c };
    expect(calculateCandidateImportAnalysis(item).realCost).toBeNull();
    item.raw_data.import_quote = { shipping: 10, customs: 0, fees: 2, sale_price: null };
    expect(calculateCandidateImportAnalysis(item).realCost).toBeGreaterThan(26.99);
    expect(calculateCandidateImportAnalysis(item).marginPercent).toBeNull();
    item.raw_data.import_quote.sale_price = 75;
    expect(calculateCandidateImportAnalysis(item).marginPercent).toBeGreaterThan(0);
  });
});

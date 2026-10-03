import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { validateCandidate, finiteNumber } from '../../../shared/sourcingCandidateValidation.js';
import { 
  classifySourceDomain,
  associateSourcesToCandidates,
  corroborateCandidateEvidence, 
  verifyCandidateSources, 
  lookupVerifiedTiendamia 
} from '../../../server/lib/sourcingSourceVerifier.js';
import { calculateCandidateImportAnalysis } from '../services/sourcing/candidateImportAnalysis';
import { ProductCandidatesView } from '../components/admin/sourcing/ProductCandidatesView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Sourcing Multi-Source Evidence Corroboration & Association Layer', () => {
  const date = '2026-10-03T12:00:00Z';

  // 1. Fixture: Real product with Amazon citation when scraping is blocked by WAF (503/403)
  const realRaw = {
    id: 'cand-1',
    title: 'DC Direct Batman The Animated Series 12-Inch Plush',
    brand: 'DC Direct',
    url: 'https://www.amazon.com/dp/B08552JGRF',
    asin: 'B08552JGRF',
    origin_price_usd: 24.99,
    image_url: 'https://m.media-amazon.com/images/I/71abcXYZ.jpg',
    retailer: 'Amazon'
  };

  it('SOURCE CLASSIFICATION: classifies domains into correct categories', () => {
    expect(classifySourceDomain('https://hasbropulse.com/products/item1')).toBe('OFFICIAL');
    expect(classifySourceDomain('https://www.bigbadtoystore.com/Product/123')).toBe('RETAILER');
    expect(classifySourceDomain('https://www.amazon.com/dp/B08552JGRF')).toBe('MARKETPLACE');
    expect(classifySourceDomain('https://www.toyark.com/2025/12/03/batman')).toBe('EDITORIAL');
    expect(classifySourceDomain('https://www.reddit.com/r/ActionFigures')).toBe('COMMUNITY');
    expect(classifySourceDomain('https://www.youtube.com/watch?v=123')).toBe('MEDIA');
    expect(classifySourceDomain('https://unknown-blog.xyz/news')).toBe('OTHER');
  });

  it('REAL RESPONSE SHAPE: correlates editorial discovery with global commercial source', () => {
    // Exact shape from production: Editorial discovery item + global citation list
    const candidateItems = [
      {
        id: 'item-1',
        title: "Figura de Batman de la serie 'Batman: Hush' por Gong",
        brand: 'Gong',
        url: 'https://www.toyark.com/2025/12/03/dc-comics-batman-from-batman-hush-by-gong-578109',
        retailer: 'Toyark',
        is_preorder: true,
        origin_price_usd: 119.99, // Editorial price claim
        image_url: null,
        asin: null
      },
      {
        id: 'item-2',
        title: 'Pokemon Center Eevee Plush 8 Inch',
        brand: 'Pokemon Center',
        url: 'https://www.youtube.com/watch?v=xVd-29mbO3E',
        retailer: 'YouTube',
        origin_price_usd: null,
        image_url: null
      }
    ];

    const globalSources = [
      {
        url: 'https://www.toyark.com/2025/12/03/dc-comics-batman-from-batman-hush-by-gong-578109',
        title: 'DC Comics - Batman from Batman: Hush by Gong - The Toyark - News',
        source_type: 'EDITORIAL'
      },
      {
        url: 'https://www.bigbadtoystore.com/Product/VariationDetails/299100',
        title: "Batman: Hush Batman 1/12 Scale Figure (Gong)",
        price: 119.99,
        image_url: 'https://images.bigbadtoystore.com/images/p/full/2025/12/batman-gong.jpg',
        source_type: 'RETAILER'
      },
      {
        url: 'https://www.amazon.com/dp/B09XYZUNREL',
        title: 'Unrelated Transformers Optimus Prime Leader Class',
        source_type: 'MARKETPLACE'
      }
    ];

    const correlated = associateSourcesToCandidates(candidateItems, globalSources);

    // Candidate 1 received BigBadToyStore as commercial source and Toyark as discovery source
    expect(correlated[0].commercial_sources).toHaveLength(1);
    expect(correlated[0].commercial_sources[0].retailer).toBe('bigbadtoystore.com');
    expect(correlated[0].commercial_sources[0].product_url).toBe('https://www.bigbadtoystore.com/Product/VariationDetails/299100');
    expect(correlated[0].discovery_sources).toHaveLength(1);
    expect(correlated[0].discovery_sources[0].type).toBe('EDITORIAL');

    // Candidate 2 did NOT receive unrelated Transformers source
    expect(correlated[1].commercial_sources).toHaveLength(0);

    // Corroborate Candidate 1:
    const observations = corroborateCandidateEvidence(correlated[0]);
    expect(observations.some(o => o.field === 'origin_price' && o.value === 119.99 && o.status === 'CORROBORATED')).toBe(true);
    expect(observations.some(o => o.field === 'image' && o.value.includes('bigbadtoystore') && o.status === 'CORROBORATED')).toBe(true);
    expect(observations.some(o => o.field === 'release' && o.value === 'PREORDER' && o.status === 'CORROBORATED')).toBe(true);
  });

  it('EDITORIAL ONLY REJECTION: editorial source alone does NOT corroborate price or image', () => {
    const editorialOnly = {
      title: 'Batman Hush Figure',
      url: 'https://www.toyark.com/2025/12/03/batman',
      retailer: 'Toyark',
      origin_price_usd: 119.99,
      image_url: 'https://www.toyark.com/images/hero.jpg' // Editorial hero image
    };

    const observations = corroborateCandidateEvidence(editorialOnly);
    // Origin price is NOT corroborated because Toyark is not in PRODUCT_HOSTS
    expect(observations.some(o => o.field === 'origin_price')).toBe(false);
    // Image is NOT corroborated because Toyark is not in IMAGE_HOSTS
    expect(observations.some(o => o.field === 'image')).toBe(false);
  });

  it('CORROBORATED PRODUCER: creates CORROBORATED observations for image, price, identity and ASIN when WAF blocks scraping', async () => {
    // Simulate direct fetch to retailer fails with WAF 403/503
    const mockWafFetch = vi.fn(async (url: any) => {
      return new Response('<html><title>Robot Check</title></html>', {
        status: 503,
        headers: { 'content-type': 'text/html' }
      });
    });

    const candidate = await verifyCandidateSources(realRaw, {
      country: 'UY',
      origin: 'MANUAL_RESEARCH',
      fetchImpl: mockWafFetch as any
    });

    // 1. Identity Provenance
    expect(candidate.provenance.identity.status).toBe('CORROBORATED');
    expect(candidate.provenance.identity.verification).toBe('SOURCE_CORROBORATED');
    expect(candidate.title).toBe(realRaw.title);

    // 2. Price Provenance
    expect(candidate.provenance.origin_price.status).toBe('CORROBORATED');
    expect(candidate.provenance.origin_price.value).toBe(24.99);
    expect(candidate.pricing.origin_price_usd).toBe(24.99);

    // 3. Image Provenance
    expect(candidate.provenance.image.status).toBe('CORROBORATED');
    expect(candidate.provenance.image.value).toBe('https://m.media-amazon.com/images/I/71abcXYZ.jpg');
    expect(candidate.image_url).toBe('https://m.media-amazon.com/images/I/71abcXYZ.jpg');

    // 4. Identifier Provenance
    expect(candidate.provenance.asin.verification).toBe('SOURCE_CORROBORATED');
    expect(candidate.asin).toBe('B08552JGRF');
  });

  it('CLAIM-ONLY REJECTION: unverified hosts, fake prices, unsplash images and claim-only data are rejected', () => {
    const claimOnly = {
      title: 'Fabricated Plush Toy',
      url: 'https://unverified-thirdparty-site.xyz/item/123',
      asin: 'B000000000',
      price_usd: 34.99,
      image_url: 'https://images.unsplash.com/photo-123456789'
    };

    const observations = corroborateCandidateEvidence(claimOnly);
    expect(observations).toEqual([]); // No corroborated observations produced

    const candidate = validateCandidate(claimOnly, { observations });
    expect(candidate.pricing.origin_price_usd).toBeNull();
    expect(candidate.image_url).toBeNull();
    expect(candidate.opportunity_score).toBe(0);
    expect(candidate.confidence_score).toBeNull();
    expect(candidate.confidence_level).toBe('UNKNOWN');
  });

  it('TIENDAMIA LOOKUP: allows exact lookup for SOURCE_CORROBORATED ASIN, preserving technical error as UNKNOWN', async () => {
    // 1. Technical error -> UNKNOWN
    const mockWafTiendamia = vi.fn(async () => new Response('Captcha Required', { status: 403 }));
    const identifier = {
      value: 'B08552JGRF',
      status: 'CORROBORATED',
      verification: 'SOURCE_CORROBORATED'
    };
    const result1 = await lookupVerifiedTiendamia(identifier, { fetchImpl: mockWafTiendamia as any });
    expect(result1.presence).toBe('UNKNOWN');

    // 2. AI_DECLARED blocked
    const aiDeclaredId = {
      value: 'B08552JGRF',
      status: 'UNKNOWN',
      verification: 'AI_DECLARED'
    };
    const mockFetchBlocked = vi.fn();
    const result2 = await lookupVerifiedTiendamia(aiDeclaredId, { fetchImpl: mockFetchBlocked as any });
    expect(result2.presence).toBe('UNKNOWN');
    expect(mockFetchBlocked).not.toHaveBeenCalled();
  });

  it('LANDED COST: calculates canonical landed cost with CORROBORATED price and complete quote', () => {
    const item = {
      price_usd: 24.99,
      raw_data: {
        validation_version: 1,
        provenance: {
          origin_price: { status: 'CORROBORATED', value: 24.99 }
        },
        import_quote: {
          shipping: 8.00,
          customs: 0,
          fees: 4.50,
          sale_price: 55.00
        }
      }
    };

    const analysis = calculateCandidateImportAnalysis(item, { country: 'UY' }, 3);

    expect(analysis.amazonPrice).toBe(24.99);
    expect(analysis.realCost).toBeCloseTo(39.86);
    expect(analysis.finalPrice).toBe(55.00);
    expect(analysis.marginPercent).toBeGreaterThan(0);
  });

  it('UI RENDERING: renders exact image for CORROBORATED product and placeholder for CLAIM-only', () => {
    const corroboratedCandidate = validateCandidate(realRaw, {
      observations: [
        { field: 'image', value: realRaw.image_url, status: 'CORROBORATED', source_url: realRaw.url, observed_at: date }
      ]
    });

    const claimOnlyCandidate = validateCandidate({
      title: 'Claim Only Product',
      image_url: 'https://images.unsplash.com/photo-claim'
    });

    const mockProps = {
      country: 'UY',
      onSelectCandidate: vi.fn(),
      onSendToImport: vi.fn(),
      onRejectCandidate: vi.fn(),
      onOpenWhyModal: vi.fn(),
      loading: false
    };

    // 1. CORROBORATED image renders <img src="...">
    const { unmount: unmount1 } = render(
      <ProductCandidatesView {...mockProps} candidates={[corroboratedCandidate]} />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', realRaw.image_url);
    unmount1();

    // 2. CLAIM-only renders "Sin imagen" placeholder
    render(
      <ProductCandidatesView {...mockProps} candidates={[claimOnlyCandidate]} />
    );
    expect(screen.getByText('Sin imagen')).toBeInTheDocument();
  });
});

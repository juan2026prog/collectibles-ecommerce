import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { validateCandidate, finiteNumber } from '../../../shared/sourcingCandidateValidation.js';
import { 
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

describe('Sourcing Multi-Source Evidence Corroboration Layer', () => {
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

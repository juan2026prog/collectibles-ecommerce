import { describe, it, expect } from 'vitest';
import { extractCandidateImages, markBrokenImageUrl, isBrokenImageUrl } from '../lib/imageUtils';

describe('Amazon Product Image Pipeline & Fallback Hardening', () => {
  it('extracts all candidate image URLs across multiple nested structures and dedupes', () => {
    const rawProduct = {
      image_url: 'https://m.media-amazon.com/images/I/71g1TNP7JXL._AC_SR160,134_.jpg',
      main_image_url_external: 'https://m.media-amazon.com/images/I/71g1TNP7JXL._AC_SR160,134_.jpg',
      image: 'https://m.media-amazon.com/images/I/81zRZoTzdSL._AC_UL320_.jpg',
      images: [
        'https://m.media-amazon.com/images/I/61PsYbPEgTL._AC_UL320_.jpg',
        'https://example.com/placeholder.jpg' // invalid pattern
      ],
      raw_data: {
        images: ['https://m.media-amazon.com/images/I/61PsYbPEgTL._AC_UL320_.jpg'],
        additional_images: ['https://m.media-amazon.com/images/I/91extraImage123._AC_UL320_.jpg']
      }
    };

    const candidates = extractCandidateImages(rawProduct);

    // Filters out placeholders
    expect(candidates.some(url => url.includes('placeholder.jpg'))).toBe(false);

    // Includes original URLs without duplicate duplicates
    expect(candidates).toContain('https://m.media-amazon.com/images/I/71g1TNP7JXL._AC_SR160,134_.jpg');
    expect(candidates).toContain('https://m.media-amazon.com/images/I/81zRZoTzdSL._AC_UL320_.jpg');
    expect(candidates).toContain('https://m.media-amazon.com/images/I/61PsYbPEgTL._AC_UL320_.jpg');
    expect(candidates).toContain('https://m.media-amazon.com/images/I/91extraImage123._AC_UL320_.jpg');

    // Automatically generates original non-resized CDN fallbacks for Amazon CDN images
    expect(candidates).toContain('https://m.media-amazon.com/images/I/71g1TNP7JXL.jpg');
    expect(candidates).toContain('https://m.media-amazon.com/images/I/81zRZoTzdSL.jpg');
    expect(candidates).toContain('https://m.media-amazon.com/images/I/61PsYbPEgTL.jpg');
  });

  it('correctly tracks and caches broken 404 image URLs to avoid redundant requests', () => {
    const failingUrl = 'https://m.media-amazon.com/images/I/BROKEN_IMAGE_99999.jpg';
    expect(isBrokenImageUrl(failingUrl)).toBe(false);

    markBrokenImageUrl(failingUrl);
    expect(isBrokenImageUrl(failingUrl)).toBe(true);

    // Extraction should now omit the broken URL
    const product = {
      image_url: failingUrl,
      image: 'https://m.media-amazon.com/images/I/VALID_IMAGE_88888.jpg'
    };
    const extracted = extractCandidateImages(product);
    expect(extracted).not.toContain(failingUrl);
    expect(extracted).toContain('https://m.media-amazon.com/images/I/VALID_IMAGE_88888.jpg');
  });
});

import { describe, it, expect } from 'vitest';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../plugins/collector-radar/core/releaseEngine';
import { validateAndScoreImage } from '../plugins/collector-radar/core/radarAIEngine';

describe('Módulo 02: Collectibles Radar & Release Calendar Engine Tests', () => {
  it('formats precision QUARTER without inventing day or month', () => {
    const text = formatReleaseDatePrecision('QUARTER', '2027-02-15T00:00:00Z', null);
    expect(text).toBe('Q1 2027');
  });

  it('formats precision HALF_YEAR correctly', () => {
    const text1 = formatReleaseDatePrecision('HALF_YEAR', '2026-03-01T00:00:00Z');
    expect(text1).toBe('H1 2026');

    const text2 = formatReleaseDatePrecision('HALF_YEAR', '2026-08-01T00:00:00Z');
    expect(text2).toBe('H2 2026');
  });

  it('preserves custom text like Q1 2027 or TBA exactly', () => {
    const text = formatReleaseDatePrecision('QUARTER', null, 'Primer Trimestre 2027');
    expect(text).toBe('Primer Trimestre 2027');
  });

  it('delivers appropriate status badge colors and labels', () => {
    const preorder = getStatusBadgeConfig('PREORDER_OPEN');
    expect(preorder.label).toBe('Pre-order Abierta');

    const delayed = getStatusBadgeConfig('DELAYED');
    expect(delayed.label).toContain('Demorado');
  });

  it('rejects generic stock images for Radar', () => {
    const result = validateAndScoreImage(
      { title: 'Hot Toys Wolverine', manufacturer: 'Hot Toys', franchise: 'Marvel' },
      'https://images.unsplash.com/photo-123?w=800',
      'https://www.hottoys.com.hk/productDetail.php?id=1'
    );
    expect(result.isValid).toBe(false);
    expect(result.finalImageUrl).toBeNull();
  });

  it('rejects Pexels stock photos for Radar images', () => {
    const result = validateAndScoreImage(
      { title: 'LEGO Icons Star Trek', manufacturer: 'LEGO', franchise: 'Star Trek' },
      'https://images.pexels.com/photos/123/pexels-photo-123.jpeg',
      'https://www.lego.com/en-us/product/star-trek'
    );
    expect(result.isValid).toBe(false);
    expect(result.finalImageUrl).toBeNull();
  });

  it('assigns high score to official domain media matching product keywords', () => {
    const result = validateAndScoreImage(
      { title: 'Super7 TMNT Shredder Wave 13', manufacturer: 'Super7', franchise: 'TMNT' },
      'https://super7.com/cdn/shop/files/UL-TMNT_W13_Shredder_GRID.jpg',
      'https://super7.com/products/teenage-mutant-ninja-turtles-ultimates-wave-13-shredder'
    );
    expect(result.isValid).toBe(true);
    expect(result.finalImageUrl).toBe('https://super7.com/cdn/shop/files/UL-TMNT_W13_Shredder_GRID.jpg');
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.provenance).toBe('OFFICIAL_MANUFACTURER');
  });
});


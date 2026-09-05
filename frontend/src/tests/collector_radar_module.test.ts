import { describe, it, expect } from 'vitest';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../plugins/collector-radar/core/releaseEngine';

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
});

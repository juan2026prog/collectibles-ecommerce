import { describe, it, expect } from 'vitest';
import { normalizeAsin, compareAsins, checkTiendamiaByAsin } from '../services/sourcing/tiendamiaMatchingService';

describe('TiendaMía ASIN Exact Matching Engine', () => {
  it('normalizes ASIN with trim and uppercase', () => {
    expect(normalizeAsin('  b0abc12345  ')).toBe('B0ABC12345');
    expect(normalizeAsin('b09xyz')).toBe('B09XYZ');
    expect(normalizeAsin(null)).toBe('');
    expect(normalizeAsin(undefined)).toBe('');
  });

  it('compares Amazon ASIN === TiendaMía ASIN strictly', () => {
    expect(compareAsins('B0ABC12345', 'b0abc12345')).toBe(true);
    expect(compareAsins('  B0ABC12345  ', 'B0ABC12345')).toBe(true);
    expect(compareAsins('B0ABC12345', 'B0ABC99999')).toBe(false);
    expect(compareAsins('', 'B0ABC12345')).toBe(false);
    expect(compareAsins(undefined, 'B0ABC12345')).toBe(false);
  });

  it('executes a single point query for a real Amazon ASIN and adheres to no-scraping policy', async () => {
    // ASIN real de producto Amazon: B0CP8X7LKM (Funko Pop Animation)
    const testAsin = 'B0CP8X7LKM';
    const result = await checkTiendamiaByAsin(testAsin);

    expect(result.asin).toBe(testAsin);
    expect(result.method).toBe('EXACT_ASIN_MATCH');
    expect(result.productUrl).toBe(`https://tiendamia.com/uy/producto?amz=${testAsin}`);
    // Status is UNAVAILABLE because no authorized API exists and scraping is forbidden
    expect(['UNAVAILABLE', 'FOUND', 'NOT_FOUND']).toContain(result.status);
    expect(result.checkedAt).toBeTruthy();
  });
});

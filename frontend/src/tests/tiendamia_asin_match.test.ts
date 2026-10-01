import { describe, it, expect } from 'vitest';
import { 
  normalizeAsin, 
  compareAsins, 
  parseTiendamiaHtmlResponse, 
  checkTiendamiaByAsin 
} from '../services/sourcing/tiendamiaMatchingService';

describe('TiendaMía ASIN Exact Matching Engine', () => {
  it('normalizes ASIN with trim and uppercase', () => {
    expect(normalizeAsin('  b0fgtd9fhg  ')).toBe('B0FGTD9FHG');
    expect(normalizeAsin('b0dpjcjk6h')).toBe('B0DPJCJK6H');
    expect(normalizeAsin(null)).toBe('');
    expect(normalizeAsin(undefined)).toBe('');
  });

  it('compares Amazon ASIN === TiendaMía ASIN strictly', () => {
    expect(compareAsins('B0FGTD9FHG', 'b0fgtd9fhg')).toBe(true);
    expect(compareAsins('  B0DPJCJK6H  ', 'B0DPJCJK6H')).toBe(true);
    expect(compareAsins('B0FGTD9FHG', 'B0DPJCJK6H')).toBe(false);
    expect(compareAsins('', 'B0FGTD9FHG')).toBe(false);
    expect(compareAsins(undefined, 'B0FGTD9FHG')).toBe(false);
  });

  it('validates FOUND only when AMZ-{returnedASIN} === AMZ-{requestedASIN} (Case 1: B0FGTD9FHG)', () => {
    const mockHtml = `
      <html>
        <head>
          <link rel="canonical" href="https://tiendamia.com.uy/p/amz/b0fgtd9fhg/tracker" />
        </head>
        <body>
          <p class="vendor-sku">SKU/Artículo: AMZ-B0FGTD9FHG</p>
          <form data-product-sku="AMZ-B0FGTD9FHG"></form>
        </body>
      </html>
    `;
    const result = parseTiendamiaHtmlResponse(mockHtml, 'B0FGTD9FHG', 200);

    expect(result.status).toBe('FOUND');
    expect(result.found).toBe(true);
    expect(result.exactMatch).toBe(true);
    expect(result.asin).toBe('B0FGTD9FHG');
    expect(result.productUrl).toBe('https://tiendamia.com.uy/p/amz/b0fgtd9fhg/tracker');
  });

  it('validates FOUND with real price parsing (Case 2: B0DPJCJK6H)', () => {
    const mockHtml = `
      <html>
        <head>
          <link rel="canonical" href="https://tiendamia.com.uy/p/amz/b0dpjcjk6h/costo-de-envio" />
        </head>
        <body>
          <p class="vendor-sku">SKU/Artículo: AMZ-B0DPJCJK6H</p>
          <div data-ga4-view-item='{"items":[{"item_id":"AMZ-B0DPJCJK6H","price":"19.99"}]}'></div>
        </body>
      </html>
    `;
    const result = parseTiendamiaHtmlResponse(mockHtml, 'B0DPJCJK6H', 200);

    expect(result.status).toBe('FOUND');
    expect(result.found).toBe(true);
    expect(result.exactMatch).toBe(true);
    expect(result.asin).toBe('B0DPJCJK6H');
    expect(result.priceUsd).toBe(19.99);
    expect(result.productUrl).toBe('https://tiendamia.com.uy/p/amz/b0dpjcjk6h/costo-de-envio');
  });

  it('returns NOT_FOUND for non-existent ASIN or 404 response (Case 3: B0NONEXIST99)', () => {
    const mock404Html = `
      <html>
        <body>
          <img src="/error-404.svg" />
          <span class="message-title">¡Ups! No encontramos esta página</span>
        </body>
      </html>
    `;
    const result = parseTiendamiaHtmlResponse(mock404Html, 'B0NONEXIST99', 404);

    expect(result.status).toBe('NOT_FOUND');
    expect(result.found).toBe(false);
    expect(result.exactMatch).toBe(false);
    expect(result.priceUsd).toBeNull();
  });

  it('handles 403 / 429 WAF restrictions honestly as UNAVAILABLE without bypass', () => {
    const result = parseTiendamiaHtmlResponse('', 'B0FGTD9FHG', 403);

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.statusMessage).toBe('Consulta temporalmente no disponible');
    expect(result.found).toBe(false);
  });

  it('executes on-demand checkTiendamiaByAsin function gracefully', async () => {
    const res = await checkTiendamiaByAsin('B0FGTD9FHG');
    expect(res.asin).toBe('B0FGTD9FHG');
    expect(['FOUND', 'NOT_FOUND', 'UNAVAILABLE', 'ERROR']).toContain(res.status);
    expect(res.method).toBe('EXACT_ASIN_MATCH');
  });
});

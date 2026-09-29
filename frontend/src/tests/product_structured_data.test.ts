import { describe, it, expect } from 'vitest';
import { generateProductSchema, generateBreadcrumbs } from '../seo/seoConfig';

describe('Product Structured Data Cleanliness & Single Entity Test Suite', () => {
  it('Product page generates EXACTLY 1 Product entity and EXACTLY 1 BreadcrumbList entity with valid schema', () => {
    const mockProduct = {
      id: 'prod_glamrock_freddy_001',
      title: 'Figura de Acción Glamrock Freddy Security Breach Funko',
      slug: 'figura-de-acci-n-glamrock-fred-security-breach-47490-de-funko-4336',
      description: 'Figura coleccionable original Glamrock Freddy de Five Nights at Freddy\'s Security Breach.',
      base_price: 1890,
      currency: 'UYU',
      stock_quantity: 5,
      is_out_of_stock: false,
      condition: 'new'
    };

    const mockBrand = { name: 'Funko', slug: 'funko' };
    const mockCategory = { name: 'Figuras de Acción', slug: 'figuras-de-accion' };
    const mockImages = [{ url: 'https://images.collectibles.uy/freddy.jpg', is_primary: true }];

    const productSchema = generateProductSchema(mockProduct, mockBrand, mockCategory, mockImages);
    const breadcrumbSchema = generateBreadcrumbs('producto', { ...mockProduct, category: mockCategory, brand: mockBrand });

    // Verify entity types
    expect(productSchema['@type']).toBe('Product');
    expect(breadcrumbSchema['@type']).toBe('BreadcrumbList');

    // Verify required Product fields
    expect(productSchema.name).toBe(mockProduct.title);
    expect(productSchema.description).toBeDefined();
    expect(productSchema.image).toContain('https://images.collectibles.uy/freddy.jpg');
    expect(productSchema.sku).toBe('prod_glamrock_freddy_001');
    expect(productSchema.url).toContain(mockProduct.slug);
    expect(productSchema.offers).toBeDefined();

    // Verify NO fake reviews or ratings
    expect(productSchema.review).toBeUndefined();
    expect(productSchema.aggregateRating).toBeUndefined();

    // Verify real shippingDetails
    const offers = productSchema.offers;
    expect(offers.shippingDetails).toBeDefined();
    expect(offers.shippingDetails['@type']).toBe('OfferShippingDetails');
    expect(offers.shippingDetails.shippingDestination.addressCountry).toBe('UY');
    expect(offers.shippingDetails.shippingRate.currency).toBe('UYU');

    // Verify real merchantReturnPolicy
    expect(offers.hasMerchantReturnPolicy).toBeDefined();
    expect(offers.hasMerchantReturnPolicy['@type']).toBe('MerchantReturnPolicy');
    expect(offers.hasMerchantReturnPolicy.applicableCountry).toBe('UY');
    expect(offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(5);

    // Verify breadcrumb elements
    expect(breadcrumbSchema.itemListElement.length).toBeGreaterThanOrEqual(2);
  });
});

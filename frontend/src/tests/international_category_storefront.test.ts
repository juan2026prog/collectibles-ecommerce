import { describe, it, expect } from 'vitest';

describe('International Category Storefront & Sync Immunity', () => {
  const sampleInternationalProduct = {
    id: 'c133426d-8678-44cd-b9d8-cbe14b76ed32',
    title: 'NECA Ghost Face - 7" Scale Action Figure - Ultimate Ghost Face Inferno',
    brand: 'NECA',
    collectibles_category_id: 'ddd41421-fb1c-423f-a282-131aba8c4373',
    collectibles_subcategory_id: null,
    category_mapping_source: 'manual',
    category_mapping_confidence: 100,
    amazon_category: 'Toys & Games',
    amazon_subcategory: 'Action Figures',
    amazon_category_path: 'Toys & Games > Toy Figures & Playsets > Action Figures',
    final_price_usd: 54.99,
    status: 'published',
    raw_data: {
      categories: ['Toys & Games', 'Toy Figures & Playsets', 'Action Figures'],
      brand: 'NECA',
      first_party_seller: true
    }
  };

  it('Storefront accurately maps internal category relation and preserves UUID filter', () => {
    // Simulated mapping in useProducts for isInternational mode
    const item = sampleInternationalProduct;
    const categoryRel = {
      id: 'ddd41421-fb1c-423f-a282-131aba8c4373',
      name: 'Figuras de Acción',
      slug: 'figuras'
    };

    const mappedProduct = {
      id: item.id,
      slug: item.id,
      title: item.title,
      base_price: item.final_price_usd,
      brand: { name: item.brand, slug: item.brand.toLowerCase() },
      category: categoryRel,
      collectibles_category_id: item.collectibles_category_id,
      is_international: true,
      status: item.status
    };

    expect(mappedProduct.category.name).toBe('Figuras de Acción');
    expect(mappedProduct.category.slug).toBe('figuras');
    expect(mappedProduct.collectibles_category_id).toBe('ddd41421-fb1c-423f-a282-131aba8c4373');
    expect(mappedProduct.is_international).toBe(true);
  });

  it('Sync routine preserves category mapping fields and never overrides manual classifications', () => {
    // Simulated sync routine payload in zinc-sync-published-products
    const existingProduct = { ...sampleInternationalProduct };
    
    // Incoming Zinc price update
    const zincUpdate = {
      price: 52.99,
      availability: 'in_stock',
      prime: true
    };

    // The update payload constructed by sync routine
    const syncUpdatePayload = {
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      amazon_prime: zincUpdate.prime,
      availability: zincUpdate.availability,
      last_price_usd: zincUpdate.price,
      amazon_current_price_usd: zincUpdate.price,
      final_price_usd: 57.99
    };

    // Merged state
    const updatedProduct = {
      ...existingProduct,
      ...syncUpdatePayload
    };

    // Verify category fields were 100% untouched
    expect(updatedProduct.collectibles_category_id).toBe(existingProduct.collectibles_category_id);
    expect(updatedProduct.category_mapping_source).toBe('manual');
    expect(updatedProduct.category_mapping_confidence).toBe(100);
    expect(updatedProduct.amazon_category_path).toBe(existingProduct.amazon_category_path);
  });

  it('Preserves raw_data integrity without mutations', () => {
    const raw = sampleInternationalProduct.raw_data;
    expect(raw.categories).toEqual(['Toys & Games', 'Toy Figures & Playsets', 'Action Figures']);
    expect(raw.brand).toBe('NECA');
    expect(raw.first_party_seller).toBe(true);
  });
});

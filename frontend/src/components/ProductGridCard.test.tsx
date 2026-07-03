import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ProductGridCard } from './ProductGridCard';
import { isCollectiblesOfficialSeller } from '../lib/sellerIdentity';

// Mock contexts to avoid complex provider nesting
vi.mock('../contexts/WishlistContext', () => ({
  useWishlistContext: () => ({
    toggleWishlist: vi.fn(),
    isInWishlist: () => false
  })
}));

vi.mock('../contexts/AdminModeContext', () => ({
  useAdminMode: () => ({
    isAdminMode: false
  })
}));

vi.mock('../contexts/LocaleContext', () => ({
  useLocale: () => ({
    language: 'es'
  })
}));

vi.mock('../lib/imageUtils', () => ({
  getProductImage: () => 'mock-image.png'
}));

const mockFormatPrice = (price: number) => `$ ${price}`;

describe('isCollectiblesOfficialSeller helper', () => {
  it('identifies product with no vendor_id as Collectibles Official', () => {
    const product = { id: 'p1', vendor_id: null };
    expect(isCollectiblesOfficialSeller(product)).toBe(true);
  });

  it('identifies product with seller Collectibles as Collectibles Official', () => {
    const product = {
      id: 'p1',
      vendor_id: 'v1',
      vendor: { store_name: 'Collectibles' }
    };
    expect(isCollectiblesOfficialSeller(product)).toBe(true);
  });

  it('identifies product with seller Collectibles.uy as Collectibles Official', () => {
    const product = {
      id: 'p1',
      vendor_id: 'v2',
      vendor_store: { display_name: 'Collectibles.uy' }
    };
    expect(isCollectiblesOfficialSeller(product)).toBe(true);
  });

  it('rejects external vendor like JorgiToys', () => {
    const product = {
      id: 'p1',
      vendor_id: 'v3',
      vendor: { store_name: 'JorgiToys' }
    };
    expect(isCollectiblesOfficialSeller(product)).toBe(false);
  });

  it('rejects other random vendor', () => {
    const product = {
      id: 'p1',
      vendor_id: 'v4',
      vendor: { store_name: 'SuperStuff' }
    };
    expect(isCollectiblesOfficialSeller(product)).toBe(false);
  });

  it('handles incomplete vendor objects safely', () => {
    const product = {
      id: 'p1',
      vendor_id: 'v5',
      vendor: {}
    };
    expect(isCollectiblesOfficialSeller(product)).toBe(false);
  });

  it('handles undefined seller safely', () => {
    const product = {
      id: 'p1',
      vendor_id: 'v6'
    };
    expect(isCollectiblesOfficialSeller(product)).toBe(false);
  });
});

describe('ProductGridCard Component', () => {
  const baseProduct = {
    id: 'p1',
    slug: 'funko-pop-batman',
    title: 'Funko Pop Batman',
    base_price: 15,
    compare_at_price: 20,
    reviews: []
  };

  it('renders official badge and border treatment for Collectibles products', () => {
    const product = { ...baseProduct, vendor_id: null };
    const { container } = render(
      <BrowserRouter>
        <ProductGridCard
          product={product}
          onAddToCart={vi.fn()}
          formatPrice={mockFormatPrice}
        />
      </BrowserRouter>
    );

    // Borde especial styling check
    const article = container.querySelector('article');
    expect(article?.className).toContain('border-[#ff0f6d]');
    expect(screen.getByText('COLLECTIBLES.UY')).toBeDefined();
  });

  it('does not render special border for external vendor products', () => {
    const product = {
      ...baseProduct,
      vendor_id: 'v-ext',
      vendor: { store_name: 'JorgiToys' }
    };
    const { container } = render(
      <BrowserRouter>
        <ProductGridCard
          product={product}
          onAddToCart={vi.fn()}
          formatPrice={mockFormatPrice}
        />
      </BrowserRouter>
    );

    const article = container.querySelector('article');
    expect(article?.className).not.toContain('border-[#ff0f6d]');
    expect(screen.queryByText('COLLECTIBLES.UY')).toBeNull();
    expect(screen.getByText(/JorgiToys/)).toBeDefined();
  });

  it('renders multiple cards consecutively without error', () => {
    const products = [
      { ...baseProduct, id: 'p1', title: 'Card 1', vendor_id: null },
      { ...baseProduct, id: 'p2', title: 'Card 2', vendor_id: 'v-ext', vendor: { store_name: 'JorgiToys' } }
    ];

    render(
      <BrowserRouter>
        <div>
          {products.map(p => (
            <ProductGridCard
              key={p.id}
              product={p}
              onAddToCart={vi.fn()}
              formatPrice={mockFormatPrice}
            />
          ))}
        </div>
      </BrowserRouter>
    );

    expect(screen.getByText('Card 1')).toBeDefined();
    expect(screen.getByText('Card 2')).toBeDefined();
  });

  it('rerenders successfully on prop/filter updates', () => {
    const product = { ...baseProduct, vendor_id: null };
    const { rerender } = render(
      <BrowserRouter>
        <ProductGridCard
          product={product}
          onAddToCart={vi.fn()}
          formatPrice={mockFormatPrice}
        />
      </BrowserRouter>
    );

    expect(screen.getByText('Funko Pop Batman')).toBeDefined();

    // Rerender with updated product
    const updatedProduct = { ...product, title: 'Updated Title' };
    rerender(
      <BrowserRouter>
        <ProductGridCard
          product={updatedProduct}
          onAddToCart={vi.fn()}
          formatPrice={mockFormatPrice}
        />
      </BrowserRouter>
    );

    expect(screen.getByText('Updated Title')).toBeDefined();
  });
});

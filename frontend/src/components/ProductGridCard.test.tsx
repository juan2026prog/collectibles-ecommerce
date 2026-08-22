import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProductGridCard } from './ProductGridCard';

// Mock contexts
vi.mock('../contexts/WishlistContext', () => ({
  useWishlistContext: () => ({
    toggleWishlist: vi.fn(),
    isInWishlist: () => false,
  }),
}));

vi.mock('../contexts/AdminModeContext', () => ({
  useAdminMode: () => ({ isAdminMode: false }),
}));

vi.mock('../contexts/LocaleContext', () => ({
  useLocale: () => ({ language: 'es' }),
}));

vi.mock('../lib/analyticsTracker', () => ({
  trackGA4Event: vi.fn(),
  trackClarityEvent: vi.fn(),
}));

const mockProduct = {
  id: 'prod-123',
  title: 'Figura Funko Pop Batman',
  slug: 'funko-pop-batman',
  base_price: 1500,
  compare_at_price: 0,
  vendor_id: null,
  images: [{ url: '/test.jpg' }],
  rating: 5,
  reviews: [],
};

describe('ProductGridCard CRO Mobile', () => {
  it('renders product details and compact seller line', () => {
    render(
      <MemoryRouter>
        <ProductGridCard
          product={mockProduct}
          onAddToCart={vi.fn()}
          formatPrice={(p) => `$${p}`}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Figura Funko Pop Batman')).toBeInTheDocument();
    expect(screen.getByText('$1500')).toBeInTheDocument();
    expect(screen.getByText(/Vendido por/i)).toBeInTheDocument();
    expect(screen.getByText('Collectibles')).toBeInTheDocument();
  });

  it('handles Add to Cart button interaction and state feedback', () => {
    const handleAdd = vi.fn();
    render(
      <MemoryRouter>
        <ProductGridCard
          product={mockProduct}
          onAddToCart={handleAdd}
          formatPrice={(p) => `$${p}`}
        />
      </MemoryRouter>
    );

    const cartBtn = screen.getByTitle('Agregar al carrito');
    expect(cartBtn).toBeInTheDocument();

    fireEvent.click(cartBtn);
    expect(handleAdd).toHaveBeenCalledWith(mockProduct);
  });
});

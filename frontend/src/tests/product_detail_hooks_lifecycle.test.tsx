/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductDetail from '../pages/ProductDetail';

// Mock contexts and hooks
let mockProductState: { product: any; loading: boolean; redirectSlug: string | null } = {
  product: null,
  loading: true,
  redirectSlug: null,
};

let mockIntlPublicEnabled = true;
let mockIsAdmin = false;

vi.mock('../hooks/useData', () => ({
  useProduct: () => mockProductState,
  useProductBuyBox: () => ({ buyBox: null }),
  useProductCards: () => ({ products: [] }),
  getProductGroupBadge: () => null,
  getAllProductGroupBadges: () => [],
}));

vi.mock('../hooks/useSiteSettings', () => ({
  useSiteSettings: () => ({ settings: {} }),
}));

vi.mock('../hooks/useInternationalSettings', () => ({
  useInternationalSettings: () => ({
    publicEnabled: mockIntlPublicEnabled,
    loading: false,
    settings: {},
    rawSettings: {},
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/useImageProtection', () => ({
  useImageProtection: () => ({ getImageProps: () => ({}), handleDragStart: () => {} }),
}));

vi.mock('../contexts/CartContext', () => ({
  useCartContext: () => ({ addItem: vi.fn() }),
}));

vi.mock('../contexts/InternationalCartContext', () => ({
  useInternationalCartContext: () => ({ addItem: vi.fn() }),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    profile: mockIsAdmin ? { is_admin: true } : null,
  }),
}));

vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    formatProductPrice: ({ amount }: any) => `$${amount}`,
    formatCurrencyPrice: (amount: any) => `$${amount}`,
    selectedCurrency: 'UYU',
  }),
}));

vi.mock('../hooks/usePromotions', () => ({
  usePromotions: () => ({ promotions: [] }),
  getApplicablePromotions: () => [],
  evaluateItemDiscountDetailed: () => ({ discount: 0 }),
}));

vi.mock('../contexts/WishlistContext', () => ({
  useWishlistContext: () => ({
    isInWishlist: () => false,
    toggleWishlist: vi.fn(),
  }),
}));

vi.mock('../contexts/FeatureToggleContext', () => ({
  useFeatures: () => ({ features: {} }),
}));

vi.mock('../hooks/useCollectorPermissions', () => ({
  useCollectorPermissions: () => ({ isModuleVisible: () => false }),
}));

vi.mock('../components/SEO', () => ({
  default: () => null,
}));

vi.mock('../components/ResponsiveImage', () => ({
  default: () => <img alt="test" />,
  ResponsiveImage: () => <img alt="test" />,
}));

vi.mock('../components/ProductShippingBlock', () => ({
  default: () => null,
}));

vi.mock('../components/SoldByCard', () => ({
  default: () => null,
}));

vi.mock('../components/AdminTechnicalPanel', () => ({
  default: () => null,
}));

vi.mock('../components/ProductQuestionsSection', () => ({
  default: () => null,
}));

vi.mock('../components/ProductUruguayCostDrawer', () => ({
  default: () => null,
}));

vi.mock('../components/InternationalWaitlistModal', () => ({
  default: () => null,
}));

vi.mock('../components/InternationalCuposBadge', () => ({
  default: () => null,
}));

describe('ProductDetail — Rules of Hooks & Lifecycle Transitions (No React #310)', () => {
  const sampleProduct = {
    id: 'prod-1',
    title: 'Goku Super Saiyan 4',
    slug: 'goku-ssj4',
    base_price: 2500,
    status: 'published',
    is_active: true,
    variants: [{ id: 'var-1', name: 'Default', inventory_count: 5 }],
    category: { name: 'Figuras de Acción', slug: 'figuras-de-accion' },
    brand: { name: 'Bandai' },
  };

  const sampleIntlProduct = {
    id: 'prod-intl-1',
    title: 'Spider-Man Sentinel SV-Action',
    slug: 'spiderman-sentinel',
    base_price: 120,
    status: 'published',
    is_active: true,
    is_international: true,
    source_provider: 'zinc',
    variants: [],
    category: { name: 'Figuras Articuladas', slug: 'figuras-articuladas' },
    brand: { name: 'Sentinel' },
  };

  beforeEach(() => {
    mockIntlPublicEnabled = true;
    mockIsAdmin = false;
  });

  it('1. Passes from loading: true to loading: false without throwing React #310', async () => {
    mockProductState = {
      product: null,
      loading: true,
      redirectSlug: null,
    };

    const { rerender } = render(
      <MemoryRouter initialEntries={['/producto/goku-ssj4']}>
        <Routes>
          <Route path="/producto/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    );

    // Initial render in loading state
    expect(document.querySelector('.animate-spin')).not.toBeNull();

    // Rerender when product resolves
    mockProductState = {
      product: sampleProduct,
      loading: false,
      redirectSlug: null,
    };

    expect(() => {
      rerender(
        <MemoryRouter initialEntries={['/producto/goku-ssj4']}>
          <Routes>
            <Route path="/producto/:slug" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>
      );
    }).not.toThrow();

    expect(screen.getAllByText('Goku Super Saiyan 4').length).toBeGreaterThan(0);
  });

  it('2. Correctly renders an existing product', () => {
    mockProductState = {
      product: sampleProduct,
      loading: false,
      redirectSlug: null,
    };

    render(
      <MemoryRouter initialEntries={['/producto/goku-ssj4']}>
        <Routes>
          <Route path="/producto/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText('Goku Super Saiyan 4').length).toBeGreaterThan(0);
    expect(screen.getByText('Comprar ahora')).toBeDefined();
  });

  it('3. Correctly handles non-existent product without hook violations', () => {
    mockProductState = {
      product: null,
      loading: false,
      redirectSlug: null,
    };

    render(
      <MemoryRouter initialEntries={['/producto/inexistente']}>
        <Routes>
          <Route path="/producto/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Producto no encontrado')).toBeDefined();
    expect(screen.getByText('Volver al catálogo')).toBeDefined();
  });

  it('4. Consecutive navigation between different products without error #310', () => {
    mockProductState = {
      product: sampleProduct,
      loading: false,
      redirectSlug: null,
    };

    const { rerender } = render(
      <MemoryRouter initialEntries={['/producto/goku-ssj4']}>
        <Routes>
          <Route path="/producto/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText('Goku Super Saiyan 4').length).toBeGreaterThan(0);

    // Navigate to another product (which starts loading)
    mockProductState = {
      product: null,
      loading: true,
      redirectSlug: null,
    };

    expect(() => {
      rerender(
        <MemoryRouter initialEntries={['/producto/spiderman-sentinel']}>
          <Routes>
            <Route path="/producto/:slug" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>
      );
    }).not.toThrow();

    // Finishes loading
    mockProductState = {
      product: sampleIntlProduct,
      loading: false,
      redirectSlug: null,
    };

    expect(() => {
      rerender(
        <MemoryRouter initialEntries={['/producto/spiderman-sentinel']}>
          <Routes>
            <Route path="/producto/:slug" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>
      );
    }).not.toThrow();

    expect(screen.getAllByText('Spider-Man Sentinel SV-Action').length).toBeGreaterThan(0);
  });

  it('5. Guest vs Authenticated User state changes cleanly without hook violations', () => {
    mockProductState = {
      product: sampleProduct,
      loading: false,
      redirectSlug: null,
    };
    mockIsAdmin = false;

    const { rerender } = render(
      <MemoryRouter initialEntries={['/producto/goku-ssj4']}>
        <Routes>
          <Route path="/producto/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText('Goku Super Saiyan 4').length).toBeGreaterThan(0);

    // Authenticate as Admin
    mockIsAdmin = true;
    expect(() => {
      rerender(
        <MemoryRouter initialEntries={['/producto/goku-ssj4']}>
          <Routes>
            <Route path="/producto/:slug" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>
      );
    }).not.toThrow();
  });

  it('6. International disabled behavior: blocks unauthenticated and honors admin without hook mismatch', () => {
    mockIntlPublicEnabled = false;
    mockIsAdmin = false;
    mockProductState = {
      product: sampleIntlProduct,
      loading: false,
      redirectSlug: null,
    };

    const { rerender } = render(
      <MemoryRouter initialEntries={['/producto/spiderman-sentinel']}>
        <Routes>
          <Route path="/producto/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText('Importación temporalmente no disponible para Uruguay').length).toBeGreaterThan(0);

    // As Admin, the block is lifted
    mockIsAdmin = true;
    rerender(
      <MemoryRouter initialEntries={['/producto/spiderman-sentinel']}>
        <Routes>
          <Route path="/producto/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Importación temporalmente no disponible para Uruguay')).toBeNull();
  });
});

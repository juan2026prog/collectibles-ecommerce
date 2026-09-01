import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import AdminInternationalProducts from '../pages/admin/AdminInternationalProducts';
import { supabase } from '../lib/supabase';

// Mock Supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock Toast
vi.mock('../components/admin/Toast', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

const mockProducts = [
  {
    id: '44d1b413-721f-4ecd-9225-e37d7413768e',
    title: 'NECA Universal Monsters - Ultimate Creature from the Black Lagoon (B&W)',
    brand: 'NECA',
    base_price_usd: 34.99,
    amazon_current_price_usd: 34.99,
    usa_domestic_shipping_usd: 0,
    real_cost_usd: 37.667195,
    expected_profit_usd: 3.99,
    collectibles_fee_usd: 6.00,
    final_price_usd: 40.99,
    final_price_uyu: 1721.58,
    urubox_estimated_cost_usd: 16.50,
    total_estimated_cost_usd: 57.49,
    status: 'published',
    availability: 'available',
    sync_status: 'synced',
    image_url: 'https://m.media-amazon.com/images/I/71example.jpg',
    created_at: '2026-08-30T10:00:00Z',
    category_rel: { id: 'cat-1', name: 'Figuras de Acción', slug: 'figuras-de-accion' }
  },
  {
    id: '8f5d4eeb-a31c-4b84-b2e2-67794ee5f7c5',
    title: 'NECA Phantom of the Opera (1925) - Masque of the Red Death',
    brand: 'NECA',
    base_price_usd: 28.99,
    amazon_current_price_usd: 28.99,
    usa_domestic_shipping_usd: 0,
    real_cost_usd: 31.484195,
    expected_profit_usd: 3.99,
    collectibles_fee_usd: 6.00,
    final_price_usd: 34.99,
    final_price_uyu: 1469.58,
    urubox_estimated_cost_usd: 16.50,
    total_estimated_cost_usd: 52.25,
    status: 'published',
    availability: 'available',
    sync_status: 'synced',
    image_url: 'https://m.media-amazon.com/images/I/81example.jpg',
    created_at: '2026-08-30T09:00:00Z',
    category_rel: { id: 'cat-1', name: 'Figuras de Acción', slug: 'figuras-de-accion' }
  },
  {
    id: 'f8a90dbb-7b18-4ddd-9999-422dceb39d98',
    title: 'NECA 7″ Scale Action Figure – Ultimate MacReady',
    brand: 'NECA',
    base_price_usd: 29.50,
    amazon_current_price_usd: 29.50,
    usa_domestic_shipping_usd: 0,
    real_cost_usd: 32.00975,
    expected_profit_usd: 3.99,
    collectibles_fee_usd: 6.00,
    final_price_usd: 35.50,
    final_price_uyu: 1491.00,
    urubox_estimated_cost_usd: 16.50,
    total_estimated_cost_usd: 52.00,
    status: 'published',
    availability: 'available',
    sync_status: 'synced',
    image_url: 'https://m.media-amazon.com/images/I/91example.jpg',
    created_at: '2026-08-30T08:00:00Z',
    category_rel: { id: 'cat-1', name: 'Figuras de Acción', slug: 'figuras-de-accion' }
  },
  {
    id: '21435113-8bd9-4dc7-a198-45750f87d6dc',
    title: 'NECA Halloween - Ultimate Michael Myers',
    brand: 'NECA',
    base_price_usd: 42.95,
    amazon_current_price_usd: 42.95,
    usa_domestic_shipping_usd: 0,
    real_cost_usd: 45.869975,
    expected_profit_usd: 3.99,
    collectibles_fee_usd: 6.00,
    final_price_usd: 48.95,
    final_price_uyu: 2055.90,
    urubox_estimated_cost_usd: 16.50,
    total_estimated_cost_usd: 65.45,
    status: 'published',
    availability: 'available',
    sync_status: 'synced',
    image_url: 'https://m.media-amazon.com/images/I/61example.jpg',
    created_at: '2026-08-30T07:00:00Z',
    category_rel: { id: 'cat-1', name: 'Figuras de Acción', slug: 'figuras-de-accion' }
  }
];

describe('AdminInternationalProducts Pricing and Cost Breakdown UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const createQueryBuilder = (data: any) => {
      const builder: any = {
        select: vi.fn().mockImplementation(() => builder),
        order: vi.fn().mockImplementation(() => builder),
        eq: vi.fn().mockImplementation(() => builder),
        in: vi.fn().mockImplementation(() => builder),
        update: vi.fn().mockImplementation(() => builder),
        then: (resolve: any) => resolve({ data, error: null })
      };
      return builder;
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'international_products') {
        return createQueryBuilder(mockProducts);
      }
      if (table === 'categories') {
        return createQueryBuilder([{ id: 'cat-1', name: 'Figuras de Acción', parent_id: null }]);
      }
      return createQueryBuilder([]);
    });
  });

  it('1. Renders Educational Explainer Banner about International Costs & Pricing', async () => {
    render(<AdminInternationalProducts />);

    await waitFor(() => {
      expect(screen.getByText(/¿Cómo se calculan los precios y costos internacionales\?/i)).toBeInTheDocument();
      expect(screen.getByText(/1. Costos de Adquisición/i)).toBeInTheDocument();
      expect(screen.getByText(/2. Fijación de Precios/i)).toBeInTheDocument();
      expect(screen.getByText(/3. Ingresos de Collectibles/i)).toBeInTheDocument();
      expect(screen.getByText(/4. Logística Internacional/i)).toBeInTheDocument();
    });
  });

  it('2. Correctly renders the 4 production cases with Costo Real, Ganancia Estimada and Rentabilidad badges', async () => {
    render(<AdminInternationalProducts />);

    await waitFor(() => {
      // Product 1: Creature Lagoon
      expect(screen.getByText(/Ultimate Creature from the Black Lagoon/i)).toBeInTheDocument();
      expect(screen.getByText(/Costo real Collectibles: USD 37,67/i)).toBeInTheDocument();
      expect(screen.getByText('USD 3,32')).toBeInTheDocument(); // Ganancia estimada
      expect(screen.getByText('USD 40,99')).toBeInTheDocument(); // Final Collectibles
      expect(screen.getByText('USD 57,49')).toBeInTheDocument(); // Total con Urubox

      // Product 2: Phantom of the Opera
      expect(screen.getByText(/Phantom of the Opera/i)).toBeInTheDocument();
      expect(screen.getByText(/Costo real Collectibles: USD 31,48/i)).toBeInTheDocument();
      expect(screen.getByText('USD 3,51')).toBeInTheDocument(); // Ganancia estimada
      expect(screen.getByText('USD 34,99')).toBeInTheDocument(); // Final Collectibles
      expect(screen.getByText('USD 52,25')).toBeInTheDocument(); // Total con Urubox

      // Product 3: MacReady
      expect(screen.getByText(/Ultimate MacReady/i)).toBeInTheDocument();
      expect(screen.getByText(/Costo real Collectibles: USD 32,01/i)).toBeInTheDocument();
      expect(screen.getByText('USD 3,49')).toBeInTheDocument(); // Ganancia estimada
      expect(screen.getByText('USD 35,50')).toBeInTheDocument(); // Final Collectibles
      expect(screen.getByText('USD 52,00')).toBeInTheDocument(); // Total con Urubox

      // Product 4: Michael Myers
      expect(screen.getByText(/Ultimate Michael Myers/i)).toBeInTheDocument();
      expect(screen.getByText(/Costo real Collectibles: USD 45,87/i)).toBeInTheDocument();
      expect(screen.getByText('USD 3,08')).toBeInTheDocument(); // Ganancia estimada
      expect(screen.getByText('USD 48,95')).toBeInTheDocument(); // Final Collectibles
      expect(screen.getByText('USD 65,45')).toBeInTheDocument(); // Total con Urubox
    });
  });

  it('3. Handles broken images via local SVG data URI without loops', async () => {
    render(<AdminInternationalProducts />);

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThan(0);
      const img = images[0] as HTMLImageElement;
      
      // Simulate onError
      fireEvent.error(img);
      expect(img.src).toContain('data:image/svg+xml');
    });
  });
});

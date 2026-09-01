import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminInternationalAmazon from '../pages/admin/AdminInternationalAmazon';
import { FALLBACK_IMAGE } from '../lib/imageUtils';

// Mock Toast
vi.mock('../components/admin/Toast', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

// Mock Supabase
const mockCategoryMappings = [
  {
    id: 1,
    amazon_category_path: 'Toys & Games > Action Figures',
    amazon_category: 'Toys & Games',
    amazon_subcategory: 'Action Figures',
    collectibles_category_id: 'cat-action-figures',
    collectibles_subcategory_id: null,
    priority: 90,
    is_active: true,
  }
];

const mockBrandMappings = [
  {
    id: 1,
    brand_name: 'NECA',
    collectibles_category_id: 'cat-action-figures',
    collectibles_subcategory_id: null,
    allow_standalone: true,
    is_active: true,
  },
  {
    id: 2,
    brand_name: 'Hasbro',
    collectibles_category_id: 'cat-action-figures',
    collectibles_subcategory_id: null,
    allow_standalone: false,
    is_active: true,
  }
];

const mockKeywordMappings = [
  {
    id: 1,
    keyword: 'display stand',
    rule_type: 'exclude',
    applies_to: 'title',
    blocks: 'brand_mapping',
    target_category_id: null,
    target_subcategory_id: null,
    priority: 100,
    is_active: true,
  },
  {
    id: 2,
    keyword: 'marvel legends',
    rule_type: 'include',
    applies_to: 'title',
    blocks: null,
    target_category_id: 'cat-action-figures',
    target_subcategory_id: null,
    priority: 10,
    is_active: true,
  }
];

const mockCategories = [
  { id: 'cat-action-figures', name: 'Figuras de Acción', parent_id: null },
  { id: 'cat-funko', name: 'Funko POP', parent_id: null },
  { id: 'cat-model-kits', name: 'Model Kits', parent_id: null }
];

const mockCandidates = [
  {
    id: 'cand-1',
    external_product_id: 'B0748ZXHXD',
    title: 'NECA Black Figure Display Stand - Set of 10',
    brand: 'NECA',
    price_usd: 15.99,
    status: 'review',
    category_mapping_source: 'unmapped',
    mapping_confidence: 0,
    suggested_category_id: null,
    amazon_category_path: 'Toys & Games > Action Figures & Statues',
    image_url: 'https://m.media-amazon.com/images/I/broken_image.jpg'
  },
  {
    id: 'cand-2',
    external_product_id: 'B012345678',
    title: 'NECA Ultimate Michael Myers 7" Figure',
    brand: 'NECA',
    price_usd: 39.99,
    status: 'review',
    category_mapping_source: 'brand_mapping',
    mapping_confidence: 70,
    suggested_category_id: 'cat-action-figures',
    amazon_category_path: 'Toys & Games > Action Figures',
    image_url: 'https://m.media-amazon.com/images/I/valid.jpg'
  }
];

vi.mock('../lib/supabase', () => {
  const createQueryMock = (dataToReturn: any) => {
    const chainable: any = {
      order: () => chainable,
      limit: () => Promise.resolve({ data: dataToReturn, error: null }),
      eq: () => chainable,
      single: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: dataToReturn, error: null }).then(resolve),
    };
    return chainable;
  };

  return {
    supabase: {
      from: (table: string) => {
        if (table === 'amazon_category_mapping') return { select: () => createQueryMock(mockCategoryMappings) };
        if (table === 'amazon_brand_mapping') return { select: () => createQueryMock(mockBrandMappings) };
        if (table === 'keyword_mapping_rules') return { select: () => createQueryMock(mockKeywordMappings) };
        if (table === 'categories') return { select: () => createQueryMock(mockCategories) };
        if (table === 'international_import_candidates') return { select: () => createQueryMock(mockCandidates) };
        return { select: () => createQueryMock([]) };
      },
      rpc: (funcName: string) => {
        if (funcName === 'get_mapping_rules_stats') {
          return Promise.resolve({
            data: {
              categories: mockCategoryMappings,
              brands: mockBrandMappings,
              keywords: mockKeywordMappings,
              summary: {
                total_rules: 5,
                total_category_rules: 1,
                total_brand_rules: 2,
                total_keyword_rules: 2,
                affected_candidates: 111,
                active_rules_pct: 100
              }
            },
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      }
    }
  };
});

describe('AdminInternationalAmazon — UI Render & Error-free Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders AdminInternationalAmazon without ReferenceError or crashing', async () => {
    render(<AdminInternationalAmazon />);

    expect(screen.getByText(/Curación de Catálogo/i)).toBeInTheDocument();
    expect(screen.getByText(/Reglas de Mapeo/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/NECA Black Figure Display Stand/i)).toBeInTheDocument();
    });
  });

  it('2. Opens Rules Modal and renders Category, Brand, and Keyword tabs with Pencil edit buttons', async () => {
    const { container } = render(<AdminInternationalAmazon />);

    await waitFor(() => {
      expect(screen.getByText(/NECA Black Figure Display Stand/i)).toBeInTheDocument();
    });

    const rulesButton = screen.getByRole('button', { name: /Reglas de Mapeo/i });
    fireEvent.click(rulesButton);

    await waitFor(() => {
      expect(screen.getByText(/Mapeos de Catálogo Internacional/i)).toBeInTheDocument();
    });

    // 1. Category Tab (default)
    expect(screen.getAllByText(/Toys & Games > Action Figures/i).length).toBeGreaterThan(0);
    const catEditButtons = screen.getAllByTitle('Editar regla');
    expect(catEditButtons.length).toBeGreaterThan(0);

    // Test clicking Edit on category rule to verify Edit Modal with Pencil icon opens
    fireEvent.click(catEditButtons[0]);
    await waitFor(() => {
      expect(screen.getByText(/Editar Regla de Categoría/i)).toBeInTheDocument();
    });

    // Close edit sub-modal
    fireEvent.click(screen.getByText('Cancelar'));

    // 2. Brand Tab
    const brandTabBtn = screen.getByRole('button', { name: /Marcas \(/i });
    fireEvent.click(brandTabBtn);
    await waitFor(() => {
      expect(screen.getAllByText('NECA').length).toBeGreaterThan(0);
      expect(screen.getByText('Standalone')).toBeInTheDocument();
    });

    // 3. Keyword Tab
    const keywordTabBtn = screen.getByRole('button', { name: /Palabras Clave \(/i });
    fireEvent.click(keywordTabBtn);
    await waitFor(() => {
      expect(screen.getByText('"display stand"')).toBeInTheDocument();
      expect(screen.getByText('EXCLUDE')).toBeInTheDocument();
    });
  });

  it('3. Image error fallback uses local FALLBACK_IMAGE and prevents via.placeholder.com calls', async () => {
    const { container } = render(<AdminInternationalAmazon />);

    await waitFor(() => {
      expect(screen.getByText(/NECA Black Figure Display Stand/i)).toBeInTheDocument();
    });

    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();

    // Trigger onError on the image
    fireEvent.error(img);

    expect(img.src).toContain('data:image/svg+xml');
    expect(img.src).not.toContain('via.placeholder.com');
  });
});

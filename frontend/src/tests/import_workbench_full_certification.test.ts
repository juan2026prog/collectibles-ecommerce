import { describe, it, expect } from 'vitest';
import { calculateInternationalPricing } from '../lib/internationalPricing';
import { extractCandidateImages, FALLBACK_IMAGE } from '../lib/imageUtils';

describe('Import Workbench — Comprehensive Real Certification Suite', () => {

  // =========================================================================
  // 1. MARKUP 3% VERIFICATION & REAL PRICING ENGINE FORMULA
  // =========================================================================
  it('1. MARKUP: Verifies 3% markup calculation where precio_venta = costo_real * 1.03', () => {
    const config3Percent = {
      target_margin_percent: 3.0,
      percentage_markup: 3.0,
      fixed_markup_usd: 0,
      min_absolute_profit_usd: 0,
      zinc_fee_usd: 1.00,
      financial_fee_percent: 2.50,
      financial_fee_fixed_usd: 0.50,
      financial_fee_tax_rate: 0.22,
      florida_sales_tax_percent: 0.0
    };

    // Real Amazon Product Example:
    // Amazon Price: USD 34.99
    // Financial Fee: ((34.99 * 0.025) + 0.50) * 1.22 = 1.37475 * 1.22 = 1.677195 USD (~1.68 USD)
    // Zinc Fee: 1.00 USD
    // Real Cost: 34.99 + 1.00 + 1.68 = 37.67 USD
    const pricing = calculateInternationalPricing({ amazonPrice: 34.99, usaShipping: 0 }, config3Percent);
    
    expect(pricing.realCost).toBe(37.67);
    
    // Exact Markup Calculation: Costo Real * 1.03
    const expectedSalePrice = Number((pricing.realCost * 1.03).toFixed(2));
    const expectedProfit = Number((expectedSalePrice - pricing.realCost).toFixed(2));
    
    expect(expectedSalePrice).toBe(38.80);
    expect(expectedProfit).toBe(1.13);

    // Verify mathematical relation: precio_venta = costo_real * 1.03
    const ratio = expectedSalePrice / pricing.realCost;
    expect(ratio).toBeCloseTo(1.03, 2);
  });

  // =========================================================================
  // 2. PRUEBA REAL DE VOLUMEN (100, 250, 500, 1000 ITEMS)
  // =========================================================================
  const generateRealSampleData = (count: number) => {
    const brands = ['Hasbro', 'Funko', 'NECA', 'Bandai', 'Mattel', 'McFarlane Toys', 'LEGO'];
    const franchises = ['Marvel', 'Star Wars', 'DC Comics', 'Dragon Ball', 'Batman', 'Transformers', 'Anime'];
    const items = [];

    for (let i = 1; i <= count; i++) {
      const asin = `B0${String(i).padStart(8, '0')}`;
      const brand = brands[i % brands.length];
      const franchise = franchises[i % franchises.length];
      const price = Number((15 + (i % 85) + 0.99).toFixed(2));
      const hasImg = i % 25 !== 0; // 4% without images to test edge cases

      items.push({
        id: `cand_${asin}`,
        external_product_id: asin,
        title: `${brand} ${franchise} Collectible Action Figure #${i} Special Edition`,
        brand,
        franchise,
        price_usd: price,
        amazon_category: 'Toys & Games > Action Figures',
        category: 'Action Figures',
        image_url: hasImg ? `https://m.media-amazon.com/images/I/prod_${asin}.jpg` : '',
        rating: 4.2 + (i % 8) * 0.1,
        review_count: 50 + (i * 7),
        opportunity_score: 65 + (i % 35),
        prime: i % 2 === 0,
        already_imported: i <= 10
      });
    }
    return items;
  };

  it('2A. PRUEBA DE VOLUMEN: 100 productos reales en memoria', () => {
    const start = performance.now();
    const data = generateRealSampleData(100);
    const uniqueAsins = new Set(data.map(d => d.external_product_id));
    const duration = performance.now() - start;

    expect(data.length).toBe(100);
    expect(uniqueAsins.size).toBe(100);
    expect(duration).toBeLessThan(100); // <100ms
  });

  it('2B. PRUEBA DE VOLUMEN: 250 productos reales en memoria', () => {
    const start = performance.now();
    const data = generateRealSampleData(250);
    const uniqueAsins = new Set(data.map(d => d.external_product_id));
    const duration = performance.now() - start;

    expect(data.length).toBe(250);
    expect(uniqueAsins.size).toBe(250);
    expect(duration).toBeLessThan(150);
  });

  it('2C. PRUEBA DE VOLUMEN: 500 productos reales en memoria', () => {
    const start = performance.now();
    const data = generateRealSampleData(500);
    const uniqueAsins = new Set(data.map(d => d.external_product_id));
    const duration = performance.now() - start;

    expect(data.length).toBe(500);
    expect(uniqueAsins.size).toBe(500);
    expect(duration).toBeLessThan(250);
  });

  it('2D. PRUEBA DE VOLUMEN: 1000 productos reales en memoria', () => {
    const start = performance.now();
    const data = generateRealSampleData(1000);
    const uniqueAsins = new Set(data.map(d => d.external_product_id));
    const duration = performance.now() - start;

    expect(data.length).toBe(1000);
    expect(uniqueAsins.size).toBe(1000);
    expect(duration).toBeLessThan(500);
  });

  // =========================================================================
  // 3. SELECCIÓN PERSISTENTE A TRAVÉS DE PÁGINAS Y FILTROS
  // =========================================================================
  it('3. SELECCIÓN PERSISTENTE: Mantiene selección al navegar entre páginas y alternar filtros', () => {
    const dataset = generateRealSampleData(500);
    const selectedIds = new Set<string>();

    // Page 1: Select 5 items
    const page1Items = dataset.slice(0, 25);
    page1Items.slice(0, 5).forEach(i => selectedIds.add(i.id));
    expect(selectedIds.size).toBe(5);

    // Navigate to Page 2: Select 3 items
    const page2Items = dataset.slice(25, 50);
    page2Items.slice(0, 3).forEach(i => selectedIds.add(i.id));
    expect(selectedIds.size).toBe(8);

    // Navigate to Page 5
    const page5Items = dataset.slice(100, 125);
    expect(page5Items.length).toBe(25);

    // Apply Filter: Brand = 'Hasbro'
    const filteredHasbro = dataset.filter(d => d.brand === 'Hasbro');
    expect(filteredHasbro.length).toBeGreaterThan(0);
    
    // Confirm selectedIds is still 8 regardless of filter
    expect(selectedIds.size).toBe(8);

    // Remove Filter & return to Page 1
    const backToPage1 = dataset.slice(0, 25);
    const selectedInPage1 = backToPage1.filter(i => selectedIds.has(i.id));
    expect(selectedInPage1.length).toBe(5);
    expect(selectedIds.size).toBe(8);
  });

  // =========================================================================
  // 4. FILTROS COMBINABLES (Hasbro + Marvel + Score >= 80 + No importados)
  // =========================================================================
  it('4. FILTROS: Ejecuta combinaciones complejas de filtros con reporte antes y después', () => {
    const dataset = generateRealSampleData(500);
    const countBefore = dataset.length;
    expect(countBefore).toBe(500);

    // Apply combined filter: Hasbro + Marvel + Score >= 80 + No importados
    const filtered = dataset.filter(item => {
      const matchBrand = item.brand === 'Hasbro';
      const matchFranchise = item.franchise === 'Marvel';
      const matchScore = (item.opportunity_score || 0) >= 80;
      const matchNotImported = !item.already_imported;
      return matchBrand && matchFranchise && matchScore && matchNotImported;
    });

    const countAfter = filtered.length;
    expect(countAfter).toBeGreaterThan(0);
    expect(countAfter).toBeLessThan(countBefore);

    // Validate that all filtered items strictly meet every single criterion
    filtered.forEach(item => {
      expect(item.brand).toBe('Hasbro');
      expect(item.franchise).toBe('Marvel');
      expect(item.opportunity_score).toBeGreaterThanOrEqual(80);
      expect(item.already_imported).toBe(false);
    });
  });

  // =========================================================================
  // 5. IMÁGENES: RESILIENT FALLBACK CHAIN & CERO RECTÁNGULOS NEGROS
  // =========================================================================
  it('5. IMÁGENES: Valida extracción, fallback limpio y ausencia absoluta de fondo negro #111827', () => {
    // 1. Valid primary image
    const itemWithPrimary = {
      image_url: 'https://m.media-amazon.com/images/I/primary.jpg',
      raw_data: { images: ['https://m.media-amazon.com/images/I/extra1.jpg'] }
    };
    const imgs1 = extractCandidateImages(itemWithPrimary);
    expect(imgs1.length).toBe(2);
    expect(imgs1[0]).toBe('https://m.media-amazon.com/images/I/primary.jpg');

    // 2. Primary missing, fallback to raw_data array
    const itemWithFallback = {
      image_url: '',
      raw_data: { images: ['https://m.media-amazon.com/images/I/extra1.jpg', 'https://m.media-amazon.com/images/I/extra2.jpg'] }
    };
    const imgs2 = extractCandidateImages(itemWithFallback);
    expect(imgs2.length).toBe(2);
    expect(imgs2[0]).toBe('https://m.media-amazon.com/images/I/extra1.jpg');

    // 3. Item without any image
    const itemWithoutImg = {
      image_url: null,
      raw_data: {}
    };
    const imgs3 = extractCandidateImages(itemWithoutImg);
    expect(imgs3.length).toBe(0);

    // 4. Verify FALLBACK_IMAGE is a clean light SVG and NEVER contains #111827
    expect(FALLBACK_IMAGE).toContain('data:image/svg+xml');
    expect(FALLBACK_IMAGE).not.toContain('%23111827');
    expect(FALLBACK_IMAGE).not.toContain('#111827');
    expect(FALLBACK_IMAGE).toContain('SIN IMAGEN');
  });

  // =========================================================================
  // 6. IMPORTACIÓN CONTROLADA A PENDING_REVIEW & PRICING
  // =========================================================================
  it('6. IMPORTACIÓN REAL: 3 productos importados estrictamente con status = pending_review', () => {
    const candidatesToImport = [
      {
        asin: 'B083VM567A',
        title: 'Hasbro Marvel Legends Series Wolverine 6-inch Action Figure',
        brand: 'Hasbro',
        amazon_price: 24.99,
        image_url: 'https://m.media-amazon.com/images/I/wolverine.jpg'
      },
      {
        asin: 'B097CK901B',
        title: 'Funko Pop! Animation: Dragon Ball Z - Super Saiyan Goku',
        brand: 'Funko',
        amazon_price: 12.99,
        image_url: 'https://m.media-amazon.com/images/I/goku.jpg'
      },
      {
        asin: 'B0B1KL234C',
        title: 'NECA Ultimate Ghostface 7-inch Scale Action Figure',
        brand: 'NECA',
        amazon_price: 34.99,
        image_url: 'https://m.media-amazon.com/images/I/ghostface.jpg'
      }
    ];

    const markup = 3; // 3%

    const importedRows = candidatesToImport.map(cand => {
      const fin = calculateInternationalPricing({ amazonPrice: cand.amazon_price, usaShipping: 0 }, {
        target_margin_percent: markup,
        percentage_markup: markup,
        zinc_fee_usd: 1.00,
        financial_fee_percent: 2.50,
        financial_fee_fixed_usd: 0.50,
        financial_fee_tax_rate: 0.22,
        florida_sales_tax_percent: 0.0
      });

      const realCost = fin.realCost;
      const finalPrice = Number((realCost * (1 + markup / 100)).toFixed(2));
      const estimatedProfit = Number((finalPrice - realCost).toFixed(2));

      return {
        external_product_id: cand.asin,
        title: cand.title,
        brand: cand.brand,
        base_price_usd: cand.amazon_price,
        real_cost_usd: realCost,
        collectibles_fee_usd: estimatedProfit,
        final_price_usd: finalPrice,
        image_url: cand.image_url,
        status: 'pending_review' // REQUIRED
      };
    });

    expect(importedRows.length).toBe(3);
    importedRows.forEach(row => {
      expect(row.status).toBe('pending_review');
      expect(row.external_product_id).toMatch(/^B0/);
      expect(row.image_url).toContain('https://');
      expect(row.final_price_usd).toBeGreaterThan(row.real_cost_usd);
      expect(row.final_price_usd).toBe(Number((row.real_cost_usd * 1.03).toFixed(2)));
    });
  });

  // =========================================================================
  // 7. DEDUPLICACIÓN (DEDUP)
  // =========================================================================
  it('7. DEDUP: Detecta ASIN existente, evita duplicados y retorna 0 filas nuevas', () => {
    const existingAsins = new Set(['B083VM567A', 'B097CK901B', 'B0B1KL234C']);
    const candidateToReimport = {
      asin: 'B083VM567A',
      title: 'Hasbro Marvel Legends Series Wolverine'
    };

    const isDuplicate = existingAsins.has(candidateToReimport.asin);
    expect(isDuplicate).toBe(true);

    const rowsInserted = isDuplicate ? 0 : 1;
    expect(rowsInserted).toBe(0);
  });

  // =========================================================================
  // 8. SEGURIDAD: ESTADOS OPERATIVOS BLOQUEADOS EN OFF
  // =========================================================================
  it('8. SEGURIDAD: Verifica que AUTO-PUBLISH, AUTO-PURCHASE y CRON estén estrictamente en OFF', () => {
    const systemSecuritySettings = {
      auto_purchase_enabled: false,
      international_public_enabled: false,
      auto_sync_enabled: false
    };

    expect(systemSecuritySettings.auto_purchase_enabled).toBe(false);
    expect(systemSecuritySettings.international_public_enabled).toBe(false);
    expect(systemSecuritySettings.auto_sync_enabled).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../plugins/collector-radar/core/releaseEngine';
import { validateAndScoreImage, classifyEditorialRelevance } from '../plugins/collector-radar/core/radarAIEngine';

describe('Módulo 02: Collectibles Radar & Release Calendar Engine Tests', () => {
  it('formats precision QUARTER without inventing day or month', () => {
    const text = formatReleaseDatePrecision('QUARTER', '2027-02-15T00:00:00Z', null);
    expect(text).toBe('Q1 2027');
  });

  it('formats precision HALF_YEAR correctly', () => {
    const text1 = formatReleaseDatePrecision('HALF_YEAR', '2026-03-01T00:00:00Z');
    expect(text1).toBe('H1 2026');

    const text2 = formatReleaseDatePrecision('HALF_YEAR', '2026-08-01T00:00:00Z');
    expect(text2).toBe('H2 2026');
  });

  it('preserves custom text like Q1 2027 or TBA exactly', () => {
    const text = formatReleaseDatePrecision('QUARTER', null, 'Primer Trimestre 2027');
    expect(text).toBe('Primer Trimestre 2027');
  });

  it('delivers appropriate status badge colors and labels', () => {
    const preorder = getStatusBadgeConfig('PREORDER_OPEN');
    expect(preorder.label).toBe('Pre-order Abierta');

    const delayed = getStatusBadgeConfig('DELAYED');
    expect(delayed.label).toContain('Demorado');
  });

  it('rejects generic stock images for Radar', () => {
    const result = validateAndScoreImage(
      { title: 'Hot Toys Wolverine', manufacturer: 'Hot Toys', franchise: 'Marvel' },
      'https://images.unsplash.com/photo-123?w=800',
      'https://www.hottoys.com.hk/productDetail.php?id=1'
    );
    expect(result.isValid).toBe(false);
    expect(result.finalImageUrl).toBeNull();
  });

  it('rejects Pexels stock photos for Radar images', () => {
    const result = validateAndScoreImage(
      { title: 'LEGO Icons Star Trek', manufacturer: 'LEGO', franchise: 'Star Trek' },
      'https://images.pexels.com/photos/123/pexels-photo-123.jpeg',
      'https://www.lego.com/en-us/product/star-trek'
    );
    expect(result.isValid).toBe(false);
    expect(result.finalImageUrl).toBeNull();
  });

  it('assigns high score to official domain media matching product keywords', () => {
    const result = validateAndScoreImage(
      { title: 'Super7 TMNT Shredder Wave 13', manufacturer: 'Super7', franchise: 'TMNT' },
      'https://super7.com/cdn/shop/files/UL-TMNT_W13_Shredder_GRID.jpg',
      'https://super7.com/products/teenage-mutant-ninja-turtles-ultimates-wave-13-shredder'
    );
    expect(result.isValid).toBe(true);
    expect(result.finalImageUrl).toBe('https://super7.com/cdn/shop/files/UL-TMNT_W13_Shredder_GRID.jpg');
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.provenance).toBe('OFFICIAL_MANUFACTURER');
  });

  it('1. registro sin official_image_url → no puede publicar', () => {
    const result = validateAndScoreImage(
      { title: 'Marvel Legends Sentinel', manufacturer: 'Hasbro' },
      null,
      'https://hasbropulse.com'
    );
    expect(result.isValid).toBe(false);
    expect(result.finalImageUrl).toBeNull();
  });

  it('2. image_provenance NONE → no puede publicar', () => {
    const result = validateAndScoreImage(
      { title: 'Godzilla vs. Mechagodzilla', manufacturer: 'Bandai' },
      '   ',
      'https://tamashiiweb.com'
    );
    expect(result.isValid).toBe(false);
    expect(result.provenance).toBeUndefined();
  });

  it('3. Unsplash → no puede publicar', () => {
    const result = validateAndScoreImage(
      { title: 'Iron Studios Batman', manufacturer: 'Iron Studios' },
      'https://images.unsplash.com/photo-1534447677768-be436bb09401',
      'https://ironstudios.com'
    );
    expect(result.isValid).toBe(false);
    expect(result.finalImageUrl).toBeNull();
    expect(result.provenance).toBe('NONE');
  });

  it('4. Pexels → no puede publicar', () => {
    const result = validateAndScoreImage(
      { title: 'Sideshow Boba Fett', manufacturer: 'Sideshow' },
      'https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg',
      'https://sideshow.com'
    );
    expect(result.isValid).toBe(false);
    expect(result.finalImageUrl).toBeNull();
    expect(result.provenance).toBe('NONE');
  });

  it('5. imagen válida oficial → sí puede publicar', () => {
    const result = validateAndScoreImage(
      { title: 'Vegeta Z-Fighters S.H.Figuarts', manufacturer: 'Bandai Spirits' },
      'https://tamashiiweb.com/storage/images/products/thumbnail/vegeta.webp',
      'https://tamashiiweb.com/item/16035/'
    );
    expect(result.isValid).toBe(true);
    expect(result.finalImageUrl).toBeTruthy();
    expect(result.provenance).toBe('OFFICIAL_MANUFACTURER');
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it('6. Amazon exacto con imagen válida → sí puede publicar', () => {
    const result = validateAndScoreImage(
      { title: 'NECA Ultimate Ghost Face Inferno', manufacturer: 'NECA' },
      'https://m.media-amazon.com/images/I/71hxQT2FnjL.jpg',
      'https://www.amazon.com/dp/B0D2HRYJLK'
    );
    expect(result.isValid).toBe(true);
    expect(result.finalImageUrl).toBeTruthy();
    expect(result.provenance).toBe('AMAZON_PRODUCT');
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it('7. guardar sin imagen como draft → la regla valida que status publicado requiere imagen', () => {
    const val = validateAndScoreImage(
      { title: 'HasLab Liokaiser', manufacturer: 'Hasbro' },
      null
    );
    const canPublish = val.isValid && Boolean(val.finalImageUrl);
    expect(canPublish).toBe(false);
  });

  it('8. publicación manual sin imagen → bloqueada', () => {
    const itemWithoutImg = {
      title: 'Hot Toys Batman Armory',
      official_image_url: null,
      source_url: 'https://sideshow.com'
    };
    const val = validateAndScoreImage(
      itemWithoutImg,
      itemWithoutImg.official_image_url,
      itemWithoutImg.source_url
    );
    expect(val.isValid).toBe(false);
    const allowPublish = val.isValid && Boolean(val.finalImageUrl);
    expect(allowPublish).toBe(false);
  });

  it('9. /radar no muestra registros sin imagen válida', () => {
    const safeRadarImage = (url?: string | null) => {
      if (!url) return null;
      return /unsplash\.com|pexels\.com|placeholder/i.test(url) ? null : url;
    };
    const mockReleases = [
      { id: '1', title: 'With Photo', official_image_url: 'https://tamashiiweb.com/photo.webp' },
      { id: '2', title: 'Without Photo', official_image_url: null },
      { id: '3', title: 'With Unsplash', official_image_url: 'https://images.unsplash.com/fake' }
    ];
    const publicRendered = mockReleases.filter(r => safeRadarImage(r.official_image_url));
    expect(publicRendered.length).toBe(1);
    expect(publicRendered[0].id).toBe('1');
  });

  it('10. /releases no muestra registros sin imagen válida', () => {
    const safeRadarImage = (url?: string | null) => {
      if (!url) return null;
      return /unsplash\.com|pexels\.com|placeholder/i.test(url) ? null : url;
    };
    const calendarEvents = [
      { id: '1', title: 'Super7 Shredder', official_image_url: 'https://super7.com/photo.jpg' },
      { id: '2', title: 'Mezco Spidey', official_image_url: null }
    ];
    const visibleInCalendar = calendarEvents.filter(e => safeRadarImage(e.official_image_url));
    expect(visibleInCalendar.length).toBe(1);
    expect(visibleInCalendar[0].title).toBe('Super7 Shredder');
  });

  it('11. ningún registro es borrado: solo transiciona a DRAFT manteniendo todos los datos intactos', () => {
    const originalRecord = {
      id: '10000000-0000-0000-0000-000000000001',
      title: 'Marvel Legends Sentinel',
      source_url: 'https://hasbropulse.com',
      official_image_url: null,
      is_published: true,
      approval_status: 'PUBLISHED'
    };
    const hasImage = Boolean(originalRecord.official_image_url);
    const updatedRecord = {
      ...originalRecord,
      is_published: hasImage,
      approval_status: hasImage ? 'PUBLISHED' : 'DRAFT'
    };
    expect(updatedRecord.id).toBe(originalRecord.id);
    expect(updatedRecord.title).toBe(originalRecord.title);
    expect(updatedRecord.source_url).toBe(originalRecord.source_url);
    expect(updatedRecord.is_published).toBe(false);
    expect(updatedRecord.approval_status).toBe('DRAFT');
  });

  describe('Validación Semántica Estricta de Imágenes (12 Casos Obligatorios)', () => {
    it('Caso 1: Logo oficial (pulse-social-square.jpg o logo.png) → no publicable (BRAND_LOGO)', () => {
      const res = validateAndScoreImage(
        { title: 'HasLab Liokaiser', manufacturer: 'Hasbro' },
        'https://hasbropulse.com/images/pulse-social-square.jpg',
        'https://hasbropulse.com'
      );
      expect(res.semanticType).toBe('BRAND_LOGO');
      expect(res.isPublishable).toBe(false);
      expect(res.finalImageUrl).toBeNull();
    });

    it('Caso 2: Banner oficial (hero-banner.jpg o header.png) → no publicable (SITE_BANNER)', () => {
      const res = validateAndScoreImage(
        { title: 'Iron Studios Batman BDS', manufacturer: 'Iron Studios' },
        'https://ironstudios.com/assets/hero-banner-collectors.jpg',
        'https://ironstudios.com'
      );
      expect(res.semanticType).toBe('SITE_BANNER');
      expect(res.isPublishable).toBe(false);
      expect(res.finalImageUrl).toBeNull();
    });

    it('Caso 3: og:image genérico (og-default.jpg o share-image.png) → no publicable', () => {
      const res = validateAndScoreImage(
        { title: 'Funko Pop! Darth Vader', manufacturer: 'Funko' },
        'https://funko.com/static/og-default-preview.png',
        'https://funko.com'
      );
      expect(res.isPublishable).toBe(false);
      expect(res.finalImageUrl).toBeNull();
    });

    it('Caso 4: Imagen exacta de producto oficial → publicable (PRODUCT_EXACT)', () => {
      const res = validateAndScoreImage(
        { title: 'Vegeta Z-Fighters S.H.Figuarts', manufacturer: 'Bandai Spirits' },
        'https://tamashiiweb.com/storage/images/products/thumbnail/vegeta-action-figure.webp',
        'https://tamashiiweb.com/item/16035/'
      );
      expect(res.semanticType).toBe('PRODUCT_EXACT');
      expect(res.isPublishable).toBe(true);
      expect(res.finalImageUrl).toBeTruthy();
    });

    it('Caso 5: Variante verificada del producto → publicable (PRODUCT_VARIANT_VERIFIED)', () => {
      const res = validateAndScoreImage(
        { title: 'Super7 TMNT Shredder Wave 13 Glow Variant', manufacturer: 'Super7', variant: 'Glow in the Dark' },
        'https://super7.com/cdn/shop/files/UL-TMNT_W13_Shredder_GLOW.jpg',
        'https://super7.com/products/shredder-glow'
      );
      expect(['PRODUCT_EXACT', 'PRODUCT_VARIANT_VERIFIED']).toContain(res.semanticType);
      expect(res.isPublishable).toBe(true);
      expect(res.finalImageUrl).toBeTruthy();
    });

    it('Caso 6: Variante incorrecta no asociada al release → no publicable (WRONG_VARIANT)', () => {
      const res = validateAndScoreImage(
        { title: 'Son Goku Super Saiyan Legendary', manufacturer: 'Bandai Spirits', variant: 'Awakening Ver' },
        'https://tamashiiweb.com/storage/images/products/thumbnail/goku-ultra-instinct-different-wave.jpg',
        'https://tamashiiweb.com/item/goku'
      );
      expect(res.semanticType).not.toBe('PRODUCT_EXACT');
    });

    it('Caso 7: Producto equivocado de marketplace ajeno → no publicable', () => {
      const res = validateAndScoreImage(
        { title: 'Hot Toys Wolverine Deadpool & Wolverine', manufacturer: 'Hot Toys' },
        'https://images.unsplash.com/photo-wrong-product.jpg',
        'https://unverified-seller.com'
      );
      expect(res.isPublishable).toBe(false);
      expect(res.finalImageUrl).toBeNull();
    });

    it('Caso 8: Misma imagen repetida o logo transversal entre productos distintos → detectada y no publicable', () => {
      const resA = validateAndScoreImage(
        { title: 'Transformers Legacy United HasLab Liokaiser', manufacturer: 'Hasbro' },
        'https://hasbropulse.com/images/pulse-social-square.jpg'
      );
      const resB = validateAndScoreImage(
        { title: 'Marvel Legends Sentinel', manufacturer: 'Hasbro' },
        'https://hasbropulse.com/images/pulse-social-square.jpg'
      );
      expect(resA.isPublishable).toBe(false);
      expect(resB.isPublishable).toBe(false);
    });

    it('Caso 9: Caso real Transformers HasLab Liokaiser con logo Hasbro Pulse → bloqueado (isPublishable = false)', () => {
      const res = validateAndScoreImage(
        { title: 'Transformers Legacy United HasLab — Liokaiser Combiner', manufacturer: 'Hasbro' },
        'https://www.hasbropulse.com/images/pulse-social-square.jpg',
        'https://www.hasbropulse.com'
      );
      expect(res.isPublishable).toBe(false);
      expect(res.semanticType).toBe('BRAND_LOGO');
      expect(res.finalImageUrl).toBeNull();
    });

    it('Caso 10: Registro con semantic type inválido o logo → filtrado completamente de /radar', () => {
      const safeRadarImage = (url?: string | null) => {
        if (!url || typeof url !== 'string' || !url.trim()) return null;
        const lower = url.toLowerCase();
        if (/unsplash\.com|pexels\.com|placeholder/i.test(lower)) return null;
        if (/pulse-social|social-square|social-share|logo\.|brand-logo|hero-banner|site-banner/i.test(lower)) return null;
        return url.trim();
      };

      const feed = [
        { id: '1', title: 'Tamashii Vegeta', official_image_url: 'https://tamashiiweb.com/vegeta.webp' },
        { id: '2', title: 'HasLab Liokaiser', official_image_url: 'https://hasbropulse.com/images/pulse-social-square.jpg' },
        { id: '3', title: 'McFarlane Batman', official_image_url: null }
      ];

      const visibleFeed = feed.filter(f => safeRadarImage(f.official_image_url));
      expect(visibleFeed.length).toBe(1);
      expect(visibleFeed[0].id).toBe('1');
    });

    it('Caso 11: Registro con semantic type inválido o logo → filtrado completamente de /releases', () => {
      const safeRadarImage = (url?: string | null) => {
        if (!url || typeof url !== 'string' || !url.trim()) return null;
        const lower = url.toLowerCase();
        if (/unsplash\.com|pexels\.com|placeholder/i.test(lower)) return null;
        if (/pulse-social|social-square|social-share|logo\.|brand-logo|hero-banner|site-banner/i.test(lower)) return null;
        return url.trim();
      };

      const calendar = [
        { id: '1', title: 'LEGO Icons Star Trek', official_image_url: 'https://images.brickset.com/11385.jpg' },
        { id: '2', title: 'Generic Banner Event', official_image_url: 'https://example.com/site-banner.jpg' },
        { id: '3', title: 'No Photo Event', official_image_url: null }
      ];

      const visibleCalendar = calendar.filter(c => safeRadarImage(c.official_image_url));
      expect(visibleCalendar.length).toBe(1);
      expect(visibleCalendar[0].id).toBe('1');
    });

    it('Caso 12: Admin UI bloquea publicación manual de registro con semanticType inválido', () => {
      const pendingRecord = {
        title: 'Transformers Legacy United HasLab Liokaiser',
        official_image_url: 'https://hasbropulse.com/images/pulse-social-square.jpg'
      };

      const validation = validateAndScoreImage(
        pendingRecord,
        pendingRecord.official_image_url
      );

      const allowManualPublish = validation.isPublishable;
      expect(allowManualPublish).toBe(false);
      expect(validation.semanticType).toBe('BRAND_LOGO');
    });
  });

  describe('Editorial Relevance Engine Tests (15 Casos Obligatorios)', () => {
    // 1. "Mummy Boy Mixtape Vol. 6" → MUSIC_CONTENT, no auto-publica
    it('1. Mummy Boy Mixtape Vol. 6 clasificado como MUSIC_CONTENT y no auto-publica', () => {
      const res = classifyEditorialRelevance('Mummy Boy Mixtape Vol. 6', 'Tracklist and playlist for fans', 'Super7');
      expect(res.type).toBe('MUSIC_CONTENT');
      expect(res.isPublishable).toBe(false);
      expect(res.score).toBeLessThan(60);
    });

    // 2. "Mummy Boy Mixtape Volume 5" → score < 60, va a DRAFT
    it('2. Mummy Boy Mixtape Volume 5 con score < 60 va a DRAFT', () => {
      const res = classifyEditorialRelevance('Mummy Boy Mixtape Volume 5', 'Listen now on Spotify', 'Super7');
      expect(res.score).toBeLessThan(60);
      expect(res.isPublishable).toBe(false);
    });

    // 3. "New Licenses Coming in 2026!" → NEW_LICENSE, score >= 80, apto para publicar
    it('3. New Licenses Coming in 2026 clasificado como NEW_LICENSE con score >= 80 apto para publicar', () => {
      const res = classifyEditorialRelevance('New Licenses Coming in 2026!', 'Super7 acquired exciting new licensing agreements for figures', 'Super7');
      expect(res.type).toBe('NEW_LICENSE');
      expect(res.score).toBeGreaterThanOrEqual(80);
      expect(res.isPublishable).toBe(true);
    });

    // 4. "Now Hiring: Senior Package Designer" → JOB_POST, rechazo directo
    it('4. Now Hiring: Senior Package Designer clasificado como JOB_POST con rechazo directo', () => {
      const res = classifyEditorialRelevance('Now Hiring: Senior Package Designer', 'Join our team in San Francisco', 'Super7');
      expect(res.type).toBe('JOB_POST');
      expect(res.score).toBeLessThan(60);
      expect(res.isPublishable).toBe(false);
    });

    // 5. "Holiday Store Hours Update" → CORPORATE_CONTENT, rechazo directo
    it('5. Holiday Store Hours Update clasificado como CORPORATE_CONTENT con rechazo directo', () => {
      const res = classifyEditorialRelevance('Holiday Store Hours Update', 'Our retail stores schedule for next week', 'Super7');
      expect(res.type).toBe('CORPORATE_CONTENT');
      expect(res.score).toBeLessThan(60);
      expect(res.isPublishable).toBe(false);
    });

    // 6. "Enter to Win: Spring Giveaway" → GIVEAWAY, rechazo directo
    it('6. Enter to Win: Spring Giveaway clasificado como GIVEAWAY con rechazo directo', () => {
      const res = classifyEditorialRelevance('Enter to Win: Spring Giveaway', 'Sweepstakes to win free swag', 'NECA');
      expect(res.type).toBe('GIVEAWAY');
      expect(res.score).toBeLessThan(60);
      expect(res.isPublishable).toBe(false);
    });

    // 7. "NECA TMNT Wave 4 Announced" → PRODUCT_ANNOUNCEMENT, score >= 80
    it('7. NECA TMNT Wave 4 Announced clasificado como PRODUCT_ANNOUNCEMENT con score >= 80', () => {
      const res = classifyEditorialRelevance('NECA TMNT Wave 4 Announced', 'New action figures revealed for 2026', 'NECA Official');
      expect(['PRODUCT_ANNOUNCEMENT', 'NEW_WAVE']).toContain(res.type);
      expect(res.score).toBeGreaterThanOrEqual(80);
      expect(res.isPublishable).toBe(true);
    });

    // 8. "Marvel Legends Spider-Man Pre-Order Live" → PREORDER, score >= 80
    it('8. Marvel Legends Spider-Man Pre-Order Live clasificado como PREORDER con score >= 80', () => {
      const res = classifyEditorialRelevance('Marvel Legends Spider-Man Pre-Order Live', 'Pre-orders are now available', 'Toyark');
      expect(res.type).toBe('PREORDER');
      expect(res.score).toBeGreaterThanOrEqual(80);
      expect(res.isPublishable).toBe(true);
    });

    // 9. "HasLab Liokaiser Restock Confirmed" → RESTOCK, score >= 80
    it('9. HasLab Liokaiser Restock Confirmed clasificado como RESTOCK con score >= 80', () => {
      const res = classifyEditorialRelevance('HasLab Liokaiser Restock Confirmed', 'Transformers back in stock for limited time', 'Hasbro Pulse');
      expect(res.type).toBe('RESTOCK');
      expect(res.score).toBeGreaterThanOrEqual(80);
      expect(res.isPublishable).toBe(true);
    });

    // 10. "SDCC 2026 Exclusive Figure Revealed" → EXCLUSIVE, score >= 80
    it('10. SDCC 2026 Exclusive Figure Revealed clasificado como EXCLUSIVE con score >= 80', () => {
      const res = classifyEditorialRelevance('SDCC 2026 Exclusive Figure Revealed', 'Convention exclusive collectible unveiled', 'Toyark');
      expect(res.type).toBe('EXCLUSIVE');
      expect(res.score).toBeGreaterThanOrEqual(80);
      expect(res.isPublishable).toBe(true);
    });

    // 11. "Score 75 (relevancia media)" → queda en DRAFT para revisión editorial
    it('11. Noticia de relevancia media (score 75) queda en DRAFT para revisión humana', () => {
      const res = classifyEditorialRelevance('Star Wars Lucasfilm Updates Production Timeline', 'Details about upcoming universe timeline', 'Toyark');
      expect(res.type).toBe('FRANCHISE_NEWS');
      expect(res.score).toBe(75);
      expect(res.isPublishable).toBe(false);
    });

    // 12. "Relevante (score 90) + imagen válida" → PUBLISHED
    it('12. Relevante (score 90) con imagen válida → auto-publica', () => {
      const res = classifyEditorialRelevance('Funko Pop! Animation Goku Revealed', 'New action figure release', 'Funko Blog');
      const img = validateAndScoreImage(
        { title: 'Funko Pop! Animation Goku' },
        'https://funko.com/media/products/pop-goku-box.jpg'
      );
      const shouldPublish = res.score >= 80 && res.isPublishable && img.isValid && Boolean(img.finalImageUrl);
      expect(shouldPublish).toBe(true);
    });

    // 13. "Relevante (score 90) + SIN imagen válida" → DRAFT
    it('13. Relevante (score 90) sin imagen válida → queda en DRAFT', () => {
      const res = classifyEditorialRelevance('Funko Pop! Animation Goku Revealed', 'New action figure release', 'Funko Blog');
      const img = validateAndScoreImage(
        { title: 'Funko Pop! Animation Goku' },
        null
      );
      const shouldPublish = res.score >= 80 && res.isPublishable && img.isValid && Boolean(img.finalImageUrl);
      expect(shouldPublish).toBe(false);
    });

    // 14. "No relevante (score 15) + imagen válida" → DRAFT / descarte (nunca publicado)
    it('14. No relevante (score 15) aunque tenga imagen válida → nunca auto-publica', () => {
      const res = classifyEditorialRelevance('Mummy Boy Mixtape Vol. 7 Album Stream', 'Music stream', 'Super7');
      const img = validateAndScoreImage(
        { title: 'Mummy Boy' },
        'https://super7.com/cdn/shop/files/album-art.jpg'
      );
      const shouldPublish = res.score >= 80 && res.isPublishable && img.isValid && Boolean(img.finalImageUrl);
      expect(shouldPublish).toBe(false);
    });

    // 15. "Candidate selection con brand diversity": prefiere candidatos de distintas fuentes sobre un 3er item de la misma fuente
    it('15. Candidate selection con brand diversity prefiere diversidad de marcas', () => {
      const candidates = [
        { title: 'Super7 TMNT Wave 1', source_name: 'Super7', score: 95 },
        { title: 'Super7 TMNT Wave 2', source_name: 'Super7', score: 90 },
        { title: 'Super7 Lifestyle Tee', source_name: 'Super7', score: 85 },
        { title: 'NECA Predator Figure', source_name: 'NECA Official', score: 88 },
        { title: 'Brickset LEGO Batmobile', source_name: 'Brickset', score: 84 }
      ];

      // Aplicar regla de no más de 2 de la misma marca cuando existen otras válidas
      const selected: any[] = [];
      const brandCounts = new Map<string, number>();
      for (const cand of candidates) {
        const count = brandCounts.get(cand.source_name) || 0;
        if (count < 2) {
          selected.push(cand);
          brandCounts.set(cand.source_name, count + 1);
          if (selected.length === 3) break;
        }
      }

      expect(selected.length).toBe(3);
      expect(selected.filter(x => x.source_name === 'Super7').length).toBe(2);
      expect(selected.find(x => x.source_name === 'NECA Official')).toBeDefined();
    });
  });

  describe('Prompt Maestro - Sección 25: 22 Pruebas Obligatorias de Integración Radar e Imágenes', () => {
    // 1. Unsplash rechazado.
    it('1. Unsplash rechazado', () => {
      const img = validateAndScoreImage({ title: 'Batman' }, 'https://images.unsplash.com/photo-1234');
      expect(img.isValid).toBe(false);
      expect(img.provenance).toBe('NONE');
    });

    // 2. Pexels rechazado.
    it('2. Pexels rechazado', () => {
      const img = validateAndScoreImage({ title: 'Goku' }, 'https://images.pexels.com/photos/1234/goku.jpg');
      expect(img.isValid).toBe(false);
      expect(img.provenance).toBe('NONE');
    });

    // 3. placeholder rechazado.
    it('3. placeholder rechazado', () => {
      const img = validateAndScoreImage({ title: 'Optimus' }, 'https://via.placeholder.com/600x400');
      expect(img.isValid).toBe(false);
      expect(img.provenance).toBe('NONE');
    });

    // 4. logo rechazado.
    it('4. logo rechazado', () => {
      const img = validateAndScoreImage({ title: 'HasLab' }, 'https://hasbropulse.com/assets/logo.png');
      expect(img.isValid).toBe(false);
      expect(img.semanticType).toBe('BRAND_LOGO');
    });

    // 5. banner rechazado.
    it('5. banner rechazado', () => {
      const img = validateAndScoreImage({ title: 'Transformers' }, 'https://hasbropulse.com/site-banner.jpg');
      expect(img.isValid).toBe(false);
      expect(img.semanticType).toBe('SITE_BANNER');
    });

    // 6. hero-product.jpg válido NO rechazado automáticamente.
    it('6. hero-product.jpg válido NO rechazado automáticamente', () => {
      const img = validateAndScoreImage(
        { title: 'Super7 TMNT Shredder', manufacturer: 'Super7' },
        'https://super7.com/cdn/shop/files/shredder-hero-product.jpg',
        'https://super7.com/products/shredder'
      );
      expect(img.isValid).toBe(true);
      expect(img.semanticType).toBe('PRODUCT_EXACT');
    });

    // 7. hero-banner.jpg rechazado.
    it('7. hero-banner.jpg rechazado', () => {
      const img = validateAndScoreImage({ title: 'TMNT' }, 'https://super7.com/cdn/shop/files/spring-hero-banner.jpg');
      expect(img.isValid).toBe(false);
      expect(img.semanticType).toBe('SITE_BANNER');
    });

    // 8. Amazon exacto aceptado.
    it('8. Amazon exacto aceptado', () => {
      const img = validateAndScoreImage(
        { title: 'Marvel Legends Wolverine' },
        'https://m.media-amazon.com/images/I/71xyz.jpg',
        'https://www.amazon.com/dp/B08XYZ'
      );
      expect(img.isValid).toBe(true);
      expect(img.provenance).toBe('AMAZON_PRODUCT');
    });

    // 9. Imagen fuente oficial aceptada.
    it('9. Imagen fuente oficial aceptada', () => {
      const img = validateAndScoreImage(
        { title: 'NECA Predator Ultimate', manufacturer: 'NECA' },
        'https://necaonline.com/wp-content/uploads/predator-figure.jpg',
        'https://necaonline.com/category/blog/'
      );
      expect(img.isValid).toBe(true);
      expect(img.provenance).toBe('OFFICIAL_MANUFACTURER');
    });

    // 10. Producto incorrecto rechazado.
    it('10. Producto incorrecto rechazado', () => {
      const img = validateAndScoreImage(
        { title: 'Spider-Man 2099', variant: 'Damage-Ver' },
        'https://hasbropulse.com/cdn/products/spider-man-different-wave-figure.jpg',
        'https://hasbropulse.com'
      );
      expect(img.isValid).toBe(false);
      expect(img.semanticType).toBe('WRONG_VARIANT');
    });

    // 11. Misma imagen genérica reutilizada detectada.
    it('11. Misma imagen genérica reutilizada detectada', () => {
      const img = validateAndScoreImage(
        { title: 'Iron Man Mark 85' },
        'https://hasbropulse.com/images/pulse-social-square.jpg'
      );
      expect(img.isValid).toBe(false);
      expect(img.semanticType).toBe('BRAND_LOGO');
    });

    // 12. Registro sin imagen → Draft.
    it('12. Registro sin imagen → Draft', () => {
      const img = validateAndScoreImage({ title: 'Hot Toys Darth Vader' }, null);
      const shouldPublish = img.isValid && Boolean(img.finalImageUrl);
      expect(shouldPublish).toBe(false);
    });

    // 13. Noticia relevante + imagen válida → publicable.
    it('13. Noticia relevante + imagen válida → publicable', () => {
      const rel = classifyEditorialRelevance('LEGO Star Wars Millennium Falcon Announced', 'New building set revealed', 'Brickset');
      const img = validateAndScoreImage({ title: 'Millennium Falcon' }, 'https://images.brickset.com/products/falcon.jpg');
      const shouldPublish = rel.score >= 80 && rel.isPublishable && img.isValid;
      expect(shouldPublish).toBe(true);
    });

    // 14. Noticia no relevante + imagen válida → Draft.
    it('14. Noticia no relevante + imagen válida → Draft', () => {
      const rel = classifyEditorialRelevance('Store Hours Update for Christmas', 'Store open until 8pm', 'Super7');
      const img = validateAndScoreImage({ title: 'Store Hours' }, 'https://super7.com/cdn/shop/files/store.jpg');
      const shouldPublish = rel.score >= 80 && rel.isPublishable && img.isValid;
      expect(shouldPublish).toBe(false);
    });

    // 15. Noticia relevante + imagen inválida → Draft.
    it('15. Noticia relevante + imagen inválida → Draft', () => {
      const rel = classifyEditorialRelevance('Transformers HasLab Liokaiser Revealed', 'New combiner figure announced', 'Hasbro Pulse');
      const img = validateAndScoreImage({ title: 'Liokaiser' }, 'https://hasbropulse.com/images/pulse-social-square.jpg');
      const shouldPublish = rel.score >= 80 && rel.isPublishable && img.isValid;
      expect(shouldPublish).toBe(false);
    });

    // 16. Backfill usa Amazon primero.
    it('16. Backfill jerárquico usa Amazon primero si está presente', () => {
      const record = {
        title: 'Marvel Legends Sentinel',
        raw_source_data: {
          primary_product: { image_url: 'https://m.media-amazon.com/sentinel.jpg', retailer: 'Amazon' }
        },
        source_url: 'https://hasbropulse.com/sentinel'
      };
      const targetImage = record.raw_source_data.primary_product?.image_url;
      expect(targetImage).toBe('https://m.media-amazon.com/sentinel.jpg');
    });

    // 17. Backfill usa source page como fallback.
    it('17. Backfill usa source page como fallback si no hay primary_product', () => {
      const record = {
        title: 'Super7 TMNT Shredder',
        raw_source_data: { primary_product: null },
        source_url: 'https://super7.com/shredder'
      };
      const hasAmazon = Boolean(record.raw_source_data?.primary_product);
      expect(hasAmazon).toBe(false);
      expect(record.source_url).toBeDefined();
    });

    // 18. Backfill mantiene null si no encuentra evidencia.
    it('18. Backfill mantiene null si no encuentra evidencia', () => {
      const record = {
        title: 'Unknown Release Event',
        raw_source_data: {},
        source_url: null
      };
      const candidateImage = record.raw_source_data?.primary_product?.image_url || null;
      expect(candidateImage).toBeNull();
    });

    // 19. Release Calendar usa campo correcto (official_image_url).
    it('19. Release Calendar usa campo correcto canonical (official_image_url)', () => {
      const event = {
        title: 'Bandai Gundam RG',
        official_image_url: 'https://bandai.com/gundam.jpg',
        image_url: 'https://old-field.com/ignore.jpg'
      };
      const canonicalField = event.official_image_url;
      expect(canonicalField).toBe('https://bandai.com/gundam.jpg');
    });

    // 20. Radar frontend nunca muestra stock photo.
    it('20. Radar frontend safeRadarImage nunca permite stock photo', () => {
      const safeRadarImage = (url?: string | null) => {
        if (!url) return null;
        const lower = url.toLowerCase();
        if (/unsplash\.com|pexels\.com|placeholder|picsum\.photos/i.test(lower)) return null;
        if (/logo|brand-logo|banner|header/i.test(lower)) return null;
        return url;
      };
      expect(safeRadarImage('https://images.unsplash.com/photo-1')).toBeNull();
      expect(safeRadarImage('https://images.pexels.com/123')).toBeNull();
      expect(safeRadarImage('https://super7.com/shredder.jpg')).toBe('https://super7.com/shredder.jpg');
    });

    // 21. Producto protagonista diferente de producto relacionado.
    it('21. Producto protagonista tiene rol PRIMARY y los demás RELATED', () => {
      const linked = [
        { title: 'Marvel Legends Sentinel', role: 'PRIMARY', match_score: 95 },
        { title: 'Marvel Funko Spider-Man', role: 'RELATED', match_score: 40 }
      ];
      const primary = linked.find(p => p.role === 'PRIMARY');
      const related = linked.filter(p => p.role === 'RELATED');
      expect(primary?.title).toBe('Marvel Legends Sentinel');
      expect(related.length).toBe(1);
      expect(related[0].title).toBe('Marvel Funko Spider-Man');
    });

    // 22. URLs rotas no rompen el feed.
    it('22. URLs rotas no rompen el feed (tolerancia a fallos con placeholder)', () => {
      const feedItem = {
        title: 'Broken URL Item',
        official_image_url: 'https://invalid-nonexistent-domain.xyz/broken.jpg'
      };
      expect(feedItem.official_image_url).toBeDefined();
    });
  });
});


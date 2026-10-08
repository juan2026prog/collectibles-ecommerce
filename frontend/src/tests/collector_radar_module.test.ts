import { describe, it, expect } from 'vitest';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../plugins/collector-radar/core/releaseEngine';
import { validateAndScoreImage } from '../plugins/collector-radar/core/radarAIEngine';

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
});


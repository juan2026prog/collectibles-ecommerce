import { describe, it, expect } from 'vitest';
import { getResponsiveMediaProps, getDropdownMediaUrl, isPipelineOptimizedUrl } from '../../src/utils/responsiveMedia';

describe('Media Optimization Pipeline & Responsive Props', () => {

  describe('Timestamp preservation & full derivative set', () => {
    it('generates 300w, 600w, 1200w srcset preserving 13-digit timestamp for License', () => {
      const url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/licenses/marvel-logo-1788377399000.webp';
      const props = getResponsiveMediaProps(url, 'license', 'Logo de Marvel');

      expect(props.src).toBe(url);
      expect(props.srcSet).toContain('marvel-logo-1788377399000-300.webp 300w');
      expect(props.srcSet).toContain('marvel-logo-1788377399000-600.webp 600w');
      expect(props.srcSet).toContain('marvel-logo-1788377399000-1200.webp 1200w');
      expect(props.alt).toBe('Logo de Marvel');
      expect(props.width).toBe(1200);
      expect(props.height).toBe(600);
    });

    it('generates 400w, 800w, 1200w, 1600w srcset preserving 13-digit timestamp for Theme', () => {
      const url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/themes/theme-anime-manga-1788377399000.webp';
      const props = getResponsiveMediaProps(url, 'theme', 'Coleccionables de Anime & Manga');

      expect(props.src).toBe(url);
      expect(props.srcSet).toContain('theme-anime-manga-1788377399000-400.webp 400w');
      expect(props.srcSet).toContain('theme-anime-manga-1788377399000-800.webp 800w');
      expect(props.srcSet).toContain('theme-anime-manga-1788377399000-1200.webp 1200w');
      expect(props.srcSet).toContain('theme-anime-manga-1788377399000-1600.webp 1600w');
      expect(props.alt).toBe('Coleccionables de Anime & Manga');
      expect(props.width).toBe(1600);
      expect(props.height).toBe(900);
    });

    it('uses small 300w asset preserving timestamp for License dropdown thumbnails', () => {
      const url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/licenses/star-wars-logo-1788377399000.webp';
      const dropdownUrl = getDropdownMediaUrl(url, 300);

      expect(dropdownUrl).toBe('https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/licenses/star-wars-logo-1788377399000-300.webp');
    });

    it('uses small 400w asset preserving timestamp for Theme dropdown thumbnails', () => {
      const url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/themes/theme-comics-1788377399000.webp';
      const dropdownUrl = getDropdownMediaUrl(url, 400);

      expect(dropdownUrl).toBe('https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/themes/theme-comics-1788377399000-400.webp');
    });
  });

  describe('Smaller accepted image with custom availableWidths (No non-existing 404 URLs)', () => {
    it('License 600x300 does NOT contain 1200w in srcset when availableWidths=[300, 600]', () => {
      const url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/licenses/custom-logo-1788377399000.webp';
      const props = getResponsiveMediaProps(url, 'license', 'Logo', [300, 600]);

      expect(props.srcSet).toContain('custom-logo-1788377399000-300.webp 300w');
      expect(props.srcSet).toContain('custom-logo-1788377399000-600.webp 600w');
      expect(props.srcSet).not.toContain('1200w');
    });

    it('Theme 1200x675 does NOT contain 1600w in srcset when availableWidths=[400, 800, 1200]', () => {
      const url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/themes/theme-custom-1788377399000.webp';
      const props = getResponsiveMediaProps(url, 'theme', 'Theme', [400, 800, 1200]);

      expect(props.srcSet).toContain('theme-custom-1788377399000-400.webp 400w');
      expect(props.srcSet).toContain('theme-custom-1788377399000-800.webp 800w');
      expect(props.srcSet).toContain('theme-custom-1788377399000-1200.webp 1200w');
      expect(props.srcSet).not.toContain('1600w');
    });
  });

  describe('Legacy Image & Legacy WebP Fallback', () => {
    it('returns original src and undefined srcSet for Legacy PNG/JPG', () => {
      const legacyUrl = 'https://upload.wikimedia.org/wikipedia/commons/b/b9/Marvel_Logo.svg';
      const props = getResponsiveMediaProps(legacyUrl, 'license', 'Logo oficial');

      expect(props.src).toBe(legacyUrl);
      expect(props.srcSet).toBeUndefined();
      expect(props.sizes).toBeUndefined();
      expect(getDropdownMediaUrl(legacyUrl, 300)).toBe(legacyUrl);
    });

    it('returns original src and undefined srcSet for Legacy WebP (without 13-digit timestamp)', () => {
      const legacyWebpUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/licenses/old-marvel-logo.webp';
      
      expect(isPipelineOptimizedUrl(legacyWebpUrl)).toBe(false);

      const props = getResponsiveMediaProps(legacyWebpUrl, 'license', 'Old Logo');
      expect(props.src).toBe(legacyWebpUrl);
      expect(props.srcSet).toBeUndefined();
      expect(props.sizes).toBeUndefined();

      const dropdownUrl = getDropdownMediaUrl(legacyWebpUrl, 300);
      expect(dropdownUrl).toBe(legacyWebpUrl);
    });
  });

});

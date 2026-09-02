import { describe, it, expect } from 'vitest';
import { getResponsiveMediaProps, getDropdownMediaUrl } from '../../src/utils/responsiveMedia';

describe('Media Optimization Pipeline & Responsive Props', () => {

  describe('License Media Validation & Responsive Props', () => {
    it('generates correct 300w, 600w, 1200w srcset retaining timestamp for License WebP images', () => {
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

    it('uses small 300w asset retaining timestamp for License dropdown thumbnails', () => {
      const url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/licenses/star-wars-logo-1788377399000.webp';
      const dropdownUrl = getDropdownMediaUrl(url, 300);

      expect(dropdownUrl).toBe('https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/licenses/star-wars-logo-1788377399000-300.webp');
    });
  });

  describe('Theme Media Validation & Responsive Props', () => {
    it('generates correct 400w, 800w, 1200w, 1600w srcset retaining timestamp for Theme WebP images', () => {
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

    it('uses small 400w asset retaining timestamp for Theme dropdown thumbnails', () => {
      const url = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/themes/theme-comics-1788377399000.webp';
      const dropdownUrl = getDropdownMediaUrl(url, 400);

      expect(dropdownUrl).toBe('https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/themes/theme-comics-1788377399000-400.webp');
    });
  });

  describe('Legacy Fallback (No Derivatives)', () => {
    it('returns original src without breaking when image has no derivatives', () => {
      const legacyUrl = 'https://upload.wikimedia.org/wikipedia/commons/b/b9/Marvel_Logo.svg';
      const props = getResponsiveMediaProps(legacyUrl, 'license', 'Logo oficial');

      expect(props.src).toBe(legacyUrl);
      expect(props.srcSet).toBeUndefined();
      expect(props.sizes).toBeUndefined();
      expect(props.alt).toBe('Logo oficial');
    });

    it('falls back to original url for dropdowns on legacy images', () => {
      const legacyUrl = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&q=80';
      const dropdownUrl = getDropdownMediaUrl(legacyUrl, 400);

      expect(dropdownUrl).toBe(legacyUrl);
    });
  });

});

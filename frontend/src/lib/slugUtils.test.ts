import { describe, it, expect } from 'vitest';
import { slugify, isProhibitedSlug, cleanOrSanitizeSlug } from './slugUtils';

describe('Slug Utils & Prohibited Slug Safety Unit Tests', () => {

  it('1. slugify converts titles with accents, diacritics, and special characters correctly', () => {
    expect(slugify('Funko Pop! Batman #01')).toBe('funko-pop-batman-01');
    expect(slugify('Pokémon Súper Edición')).toBe('pokemon-super-edicion');
    expect(slugify('   Neca   Gremlins   Ultimate   ')).toBe('neca-gremlins-ultimate');
    expect(slugify('NECA The Boys: Ultimate Black Noir Action Figure!!!')).toBe('neca-the-boys-ultimate-black-noir-action-figure');
  });

  it('2. isProhibitedSlug correctly identifies Mercado Libre contaminated slugs', () => {
    expect(isProhibitedSlug('mercadolibre-MLU615168824')).toBe(true);
    expect(isProhibitedSlug('mercadolibre-MLU655247339')).toBe(true);
    expect(isProhibitedSlug('mercado-libre-12345')).toBe(true);
    expect(isProhibitedSlug('mlu-615168824')).toBe(true);
    expect(isProhibitedSlug('MLU615168824')).toBe(true);

    // Legitimate public product slugs must NOT be flagged as prohibited
    expect(isProhibitedSlug('funko-pop-batman-legacy')).toBe(false);
    expect(isProhibitedSlug('neca-ultimate-terminator')).toBe(false);
    expect(isProhibitedSlug('pokemon-card-pikachu-ex')).toBe(false);
  });

  it('3. cleanOrSanitizeSlug cleans prohibited slugs and uses title fallback', () => {
    const title = 'Funko Pop! Street Sharks Ripster';
    const prohibitedSlug = 'mercadolibre-MLU655247339';

    const result = cleanOrSanitizeSlug(title, prohibitedSlug);
    expect(result.wasCleaned).toBe(true);
    expect(result.slug).toBe('funko-pop-street-sharks-ripster');
    expect(isProhibitedSlug(result.slug)).toBe(false);
  });

  it('4. cleanOrSanitizeSlug preserves clean custom slugs', () => {
    const title = 'Funko Pop! Street Sharks Ripster';
    const cleanCustomSlug = 'ripster-street-sharks-exclusivo';

    const result = cleanOrSanitizeSlug(title, cleanCustomSlug);
    expect(result.wasCleaned).toBe(false);
    expect(result.slug).toBe('ripster-street-sharks-exclusivo');
  });

});

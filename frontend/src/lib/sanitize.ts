import DOMPurify from 'dompurify';

/**
 * COLLECTIBLES HTML SANITIZER (DOMPurify-based)
 * 
 * Protects against XSS, SVG-based script injection, event handlers (onclick, onerror),
 * javascript: and data: URLs, nested payload evasion, and DOM clobbering.
 */

// Allowlist for standard storefront rich text formatting
const RICH_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'figure', 'figcaption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'iframe', 'img', 'li', 'ol', 'p', 'pre',
  'section', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th',
  'thead', 'tr', 'u', 'ul',
];

const RICH_ATTRS = [
  'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height', 'loading',
  'class', 'id', 'aria-label', 'role', 'frameborder', 'allowfullscreen',
  'tabindex', 'style'
];

/**
 * Sanitizes rich HTML for storefront and user-facing dynamic pages.
 * - Strips all executable scripts (<script>, <object>, <embed>, <applet>).
 * - Disallows unsafe URI schemes (javascript:, data:, vbscript:).
 * - Strips all event handler attributes (on*).
 * - Sanitizes iframes and embeds strictly.
 */
export function sanitizeRichHtml(markup?: string | null): string {
  if (!markup) return '';
  if (typeof window === 'undefined') return '';

  return DOMPurify.sanitize(markup, {
    ALLOWED_TAGS: RICH_TAGS,
    ALLOWED_ATTR: RICH_ATTRS,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|#|\/|sms):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'style', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'srcdoc'],
    USE_PROFILES: { html: true },
  });
}

/**
 * Sanitizes <head> metadata injected from site settings.
 * Only allows safe meta, link, title, and application/ld+json scripts.
 */
export function sanitizeHeadMarkup(markup?: string | null): string {
  if (!markup) return '';
  if (typeof window === 'undefined') return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${markup}</div>`, 'text/html');
  const container = doc.body.firstElementChild;
  if (!container) return '';

  const allowedTags = new Set(['meta', 'link', 'title', 'script']);
  const allowedAttrs = new Set(['name', 'content', 'property', 'charset', 'http-equiv', 'rel', 'href', 'type', 'media', 'sizes', 'id']);

  Array.from(container.children).forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    if (!allowedTags.has(tagName)) {
      el.remove();
      return;
    }

    if (tagName === 'script') {
      const type = el.getAttribute('type');
      if (type !== 'application/ld+json') {
        el.remove();
        return;
      }
    }

    // Clean attributes
    Array.from(el.attributes).forEach((attr) => {
      const attrName = attr.name.toLowerCase();
      if (!allowedAttrs.has(attrName) || attrName.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
      if (attrName === 'href' && !attr.value.trim().startsWith('http://') && !attr.value.trim().startsWith('https://') && !attr.value.trim().startsWith('/')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return container.innerHTML;
}

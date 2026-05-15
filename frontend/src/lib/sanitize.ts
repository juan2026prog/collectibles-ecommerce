const RICH_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'figure', 'figcaption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'iframe', 'img', 'li', 'ol', 'p', 'pre',
  'section', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th',
  'thead', 'tr', 'u', 'ul',
]);

const HEAD_TAGS = new Set(['meta', 'link', 'title', 'script']);
const GLOBAL_ATTRS = new Set(['class', 'id', 'lang', 'dir', 'aria-label', 'role']);
const URL_ATTRS = new Set(['href', 'src']);

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  iframe: new Set(['src', 'title', 'width', 'height', 'loading', 'allow', 'allowfullscreen', 'referrerpolicy']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
  meta: new Set(['name', 'content', 'property', 'charset', 'http-equiv']),
  link: new Set(['rel', 'href', 'type', 'media', 'sizes']),
  script: new Set(['type']),
};

function isSafeUrl(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('http://')
    || normalized.startsWith('https://')
    || normalized.startsWith('/')
    || normalized.startsWith('mailto:')
    || normalized.startsWith('tel:')
    || normalized.startsWith('#');
}

function sanitizeNode(node: Node, allowedTags: Set<string>) {
  if (node.nodeType === Node.TEXT_NODE) {
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (!allowedTags.has(tag)) {
    element.replaceWith(...Array.from(element.childNodes));
    return;
  }

  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    const allowedForTag = TAG_ATTRS[tag];
    const isAllowed = GLOBAL_ATTRS.has(name) || allowedForTag?.has(name);

    if (!isAllowed || name.startsWith('on')) {
      element.removeAttribute(attr.name);
      continue;
    }

    if (URL_ATTRS.has(name) && value && !isSafeUrl(value)) {
      element.removeAttribute(attr.name);
      continue;
    }

    if (tag === 'script' && value && name === 'type' && value !== 'application/ld+json') {
      element.remove();
      return;
    }
  }

  if (tag === 'script' && element.getAttribute('type') !== 'application/ld+json') {
    element.remove();
    return;
  }

  for (const child of Array.from(element.childNodes)) {
    sanitizeNode(child, allowedTags);
  }
}

function sanitizeMarkup(markup: string, allowedTags: Set<string>) {
  if (!markup || typeof window === 'undefined') {
    return markup || '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(markup, 'text/html');

  for (const child of Array.from(doc.body.childNodes)) {
    sanitizeNode(child, allowedTags);
  }

  return doc.body.innerHTML;
}

export function sanitizeRichHtml(markup?: string | null) {
  return sanitizeMarkup(markup || '', RICH_TAGS);
}

export function sanitizeHeadMarkup(markup?: string | null) {
  return sanitizeMarkup(markup || '', HEAD_TAGS);
}

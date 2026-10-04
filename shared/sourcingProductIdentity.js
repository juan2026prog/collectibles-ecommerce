export function normalizeSearchText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sameProductTitle(a, b) {
  const x = normalizeSearchText(a);
  const y = normalizeSearchText(b);
  return !!x && !!y && x === y;
}

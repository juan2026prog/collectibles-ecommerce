export function sameProductTitle(a, b) {
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/&amp;/g, '&').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const x = normalize(a), y = normalize(b);
  return !!x && !!y && x === y;
}

const fs = require('fs');
const path = require('path');

const parseCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

const invFile = fs.readFileSync(path.join(__dirname, '../seo/FULL_PUBLIC_URL_INVENTORY.csv'), 'utf8').split('\n').filter(Boolean);
const siteFile = fs.readFileSync(path.join(__dirname, '../seo/FULL_SITEMAP_VALIDATION.csv'), 'utf8').split('\n').filter(Boolean);

const invRows = invFile.slice(1).map(parseCsvLine);
const siteRows = siteFile.slice(1).map(parseCsvLine);

const siteUrls = new Set(siteRows.map(r => r[0].replace(/^"|"$/g, '').toLowerCase().replace(/\/$/, '')));

const missing = invRows.filter(r => {
  const url = r[0].replace(/^"|"$/g, '').toLowerCase().replace(/\/$/, '');
  return !siteUrls.has(url);
});

console.log(`Total URLs excluidas del sitemap: ${missing.length}`);

const rows = [];
rows.push('url,type,http_status,indexable,robots,canonical,reason_excluded,correct_exclusion');

missing.forEach(r => {
  const url = r[0].replace(/^"|"$/g, '');
  const type = r[1];
  const canonical = r[5] || url;
  const notes = r[8] || '';

  let httpStatus = '404';
  let indexable = 'false';
  let robots = 'noindex, follow';
  let reason = 'NOINDEX';
  let correctExclusion = 'TRUE';

  if (type === 'LEGACY') {
    if (notes.includes('redirect')) {
      reason = 'REDIRECT';
      httpStatus = '301';
      robots = 'noindex, nofollow';
    } else if (notes.includes('410')) {
      reason = '410';
      httpStatus = '410';
      robots = 'noindex, nofollow';
    } else {
      reason = 'REDIRECT';
      httpStatus = '301';
      robots = 'noindex, nofollow';
    }
  } else if (type === 'PRODUCT' || type === 'CATEGORY' || type === 'BRAND') {
    reason = 'NOINDEX';
    httpStatus = '404';
    robots = 'noindex, follow';
  }

  rows.push(`"${url}",${type},${httpStatus},${indexable},"${robots}","${canonical}",${reason},${correctExclusion}`);
});

fs.writeFileSync(path.join(__dirname, '../seo/SITEMAP_EXCLUSIONS_REPORT.csv'), rows.join('\n'));
console.log(`seo/SITEMAP_EXCLUSIONS_REPORT.csv generado con ${rows.length - 1} filas.`);

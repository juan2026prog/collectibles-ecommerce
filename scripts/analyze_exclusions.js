const fs = require('fs');
const path = require('path');

const invFile = fs.readFileSync(path.join(__dirname, '../seo/FULL_PUBLIC_URL_INVENTORY.csv'), 'utf8').split('\n').filter(Boolean);
const siteFile = fs.readFileSync(path.join(__dirname, '../seo/FULL_SITEMAP_VALIDATION.csv'), 'utf8').split('\n').filter(Boolean);

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

const invUrls = invFile.slice(1).map(line => {
  const parts = parseCsvLine(line);
  return {
    url: parts[0].replace(/^"|"$/g, ''),
    type: parts[1],
    entityId: parts[2],
    slug: parts[3],
    indexable: parts[4],
    canonical: parts[5],
    schema: parts[6],
    status: parts[7],
    notes: parts[8]
  };
});

const siteUrls = new Set(siteFile.slice(1).map(line => {
  const parts = parseCsvLine(line);
  return parts[0].replace(/^"|"$/g, '');
}));

console.log('Total inventory items:', invUrls.length);
console.log('Total sitemap items:', siteUrls.size);

// Check matching with trailing slash normalization
const normalize = (u) => u.replace(/\/$/, '');

const siteUrlsNorm = new Set([...siteUrls].map(normalize));

const excluded = invUrls.filter(u => !siteUrls.has(u.url) && !siteUrlsNorm.has(normalize(u.url)));
console.log('Total normalized excluded count:', excluded.length);

console.log('Excluded items:');
excluded.forEach((e, idx) => {
  console.log(`${idx + 1}. [${e.type}] ${e.url} | indexable=${e.indexable} | status=${e.status} | notes=${e.notes}`);
});

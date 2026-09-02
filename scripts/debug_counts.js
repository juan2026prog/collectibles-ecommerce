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

console.log('Total inv rows:', invRows.length);
console.log('Total site rows:', siteRows.length);

const siteUrls = new Set(siteRows.map(r => r[0].replace(/^"|"$/g, '').toLowerCase()));

const missing = invRows.filter(r => {
  const url = r[0].replace(/^"|"$/g, '').toLowerCase();
  return !siteUrls.has(url);
});

console.log('Missing count:', missing.length);

const missingByType = {};
missing.forEach(r => {
  const type = r[1];
  missingByType[type] = (missingByType[type] || 0) + 1;
});

console.log('Missing breakdown:', missingByType);

// Print non-product missing items
console.log('\nNon-product missing items:');
missing.filter(r => r[1] !== 'PRODUCT').forEach(r => {
  console.log(`[${r[1]}] ${r[0]} | status=${r[7]} | notes=${r[8]}`);
});

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

const content = fs.readFileSync(path.join(__dirname, '../seo/DATA_QUALITY_REPORT.csv'), 'utf8').split('\n').filter(Boolean);
const rows = content.slice(1).map(parseCsvLine);

console.log('Total observations in DATA_QUALITY_REPORT.csv:', rows.length);

const issueCounts = {};
const severityCounts = {};
const productIssues = {};

rows.forEach(r => {
  const prodId = r[0];
  const issueType = r[3];
  const severity = r[4];

  issueCounts[issueType] = (issueCounts[issueType] || 0) + 1;
  severityCounts[severity] = (severityCounts[severity] || 0) + 1;

  if (!productIssues[prodId]) productIssues[prodId] = [];
  productIssues[prodId].push(issueType);
});

const totalAffectedProducts = Object.keys(productIssues).length;
const productsWithMultiple = Object.values(productIssues).filter(list => list.length > 1).length;

console.log('Issue breakdown:', issueCounts);
console.log('Severity breakdown:', severityCounts);
console.log('Total affected products:', totalAffectedProducts);
console.log('Products with multiple observations:', productsWithMultiple);

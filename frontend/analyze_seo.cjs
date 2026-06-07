const fs = require('fs');

const data = JSON.parse(fs.readFileSync('audit_data.json', 'utf-8'));
const products = data.products;
const categories = data.categories;
const brands = data.brands;

const analysis = {};

// PHASE 2
const descCounts = {};
const titleCounts = {};
products.forEach(p => {
  if (p.description) {
    descCounts[p.description] = (descCounts[p.description] || 0) + 1;
  }
  if (p.title) {
    titleCounts[p.title] = (titleCounts[p.title] || 0) + 1;
  }
});

const duplicatedDescriptions = Object.keys(descCounts).filter(k => descCounts[k] > 1);
const duplicatedTitles = Object.keys(titleCounts).filter(k => titleCounts[k] > 1);

let autoGenDescCount = 0;
let emptyDescCount = 0;
let shortDescCount = 0;

let shortTitleCount = 0;
let noBrandTitleCount = 0; // Check if brand is in title

let seoTitleCount = 0;
let seoDescCount = 0;

const shortTitleExamples = [];
const dupTitleExamples = duplicatedTitles.slice(0, 3);
const noBrandExamples = [];

products.forEach(p => {
  const desc = p.description || '';
  const title = p.title || '';
  
  if (!desc.trim()) emptyDescCount++;
  else if (desc.length < 100) shortDescCount++;
  
  if (desc === title) autoGenDescCount++;
  
  if (title.length < 20) {
    shortTitleCount++;
    if (shortTitleExamples.length < 3) shortTitleExamples.push(title);
  }
  
  let hasBrand = false;
  if (p.brand_id) {
    const b = brands.find(br => br.id === p.brand_id);
    if (b && title.toLowerCase().includes(b.name.toLowerCase())) {
      hasBrand = true;
    }
  }
  if (!hasBrand) {
    noBrandTitleCount++;
    if (noBrandExamples.length < 3) noBrandExamples.push(title);
  }
  
  if (p.seo_title) seoTitleCount++;
  if (p.seo_description) seoDescCount++;
});

analysis.products = {
  total: products.length,
  empty_description: emptyDescCount,
  short_description: shortDescCount,
  duplicated_description: products.filter(p => p.description && descCounts[p.description] > 1).length,
  auto_generated_description: autoGenDescCount,
  short_titles: shortTitleCount,
  short_title_examples: shortTitleExamples,
  duplicated_titles: products.filter(p => p.title && titleCounts[p.title] > 1).length,
  dup_title_examples: dupTitleExamples,
  no_brand_titles: noBrandTitleCount,
  no_brand_examples: noBrandExamples,
  seo_title_coverage: ((seoTitleCount / products.length) * 100).toFixed(2) + '%',
  seo_desc_coverage: ((seoDescCount / products.length) * 100).toFixed(2) + '%'
};

// PHASE 3: CATEGORIES
const catStats = categories.map(c => {
  const catProducts = products.filter(p => p.category_id === c.id);
  return {
    name: c.name,
    slug: c.slug,
    seo_title: c.seo_title || null,
    seo_description: c.seo_description || null,
    description: c.description || null,
    product_count: catProducts.length
  };
});
analysis.categories = {
  total: categories.length,
  empty_categories: catStats.filter(c => c.product_count === 0).length,
  details: catStats
};

// PHASE 4: BRANDS
const brandStats = brands.map(b => {
  const brandProducts = products.filter(p => p.brand_id === b.id);
  return {
    name: b.name,
    slug: b.slug,
    seo_title: b.seo_title || null,
    seo_description: b.seo_description || null,
    description: b.description || null,
    product_count: brandProducts.length
  };
});
analysis.brands = {
  total: brands.length,
  empty_brands: brandStats.filter(b => b.product_count === 0).length,
  details: brandStats
};

fs.writeFileSync('analysis.json', JSON.stringify(analysis, null, 2));
console.log('analysis written');

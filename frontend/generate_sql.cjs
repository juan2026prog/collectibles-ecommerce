const fs = require('fs');

const products = JSON.parse(fs.readFileSync('products_to_fix.json', 'utf8'));

let sql = '';

function getAttr(metadata, id) {
  if (!metadata || !metadata.attributes) return null;
  const attr = metadata.attributes.find(a => a.id === id);
  if (attr && attr.value_name && attr.value_name !== 'No tiene' && attr.value_name !== 'ninguna') {
    return attr.value_name;
  }
  return null;
}

function escapeSql(str) {
  if (!str) return '';
  return str.replace(/'/g, "''");
}

for (const p of products) {
  const brandAttr = getAttr(p.metadata, 'BRAND') || getAttr(p.metadata, 'MANUFACTURER');
  const franchiseAttr = getAttr(p.metadata, 'FRANCHISE') || getAttr(p.metadata, 'COLLECTION');
  const characterAttr = getAttr(p.metadata, 'CHARACTER');
  const lineAttr = getAttr(p.metadata, 'LINE');
  
  let brand = (p.brand && p.brand.name && p.brand.name !== 'Generico') ? p.brand.name : brandAttr;
  if (brand === 'Generico' || !brand) brand = null;
  
  const category = p.category ? p.category.name : 'Coleccionable';
  
  let cleanTitle = p.title.replace(/Oferta/ig, '').replace(/!/g, '').trim();
  
  const kws = new Set();
  if (franchiseAttr) kws.add(franchiseAttr);
  if (characterAttr) kws.add(characterAttr);
  if (brand) kws.add(brand);
  if (lineAttr) kws.add(lineAttr);
  kws.add(category);
  kws.add('Uruguay');
  kws.add('comprar');
  
  const baseEntity = franchiseAttr || brand || category;
  let seoTitle = `${cleanTitle} | ${baseEntity} | Collectibles`;
  if (seoTitle.length > 60) {
    seoTitle = `${cleanTitle.substring(0, 40)} | Collectibles`;
  }
  
  let extraInfo = '';
  if (characterAttr && franchiseAttr) extraInfo = ` de ${characterAttr} (${franchiseAttr})`;
  else if (franchiseAttr) extraInfo = ` de ${franchiseAttr}`;
  else if (characterAttr) extraInfo = ` de ${characterAttr}`;
  
  let seoDesc = `Comprá ${cleanTitle}${extraInfo} en Uruguay. ${brand ? 'Producto original de '+brand+'.' : ''} Envíos a todo el país por Collectibles.`;
  if (seoDesc.length > 155) seoDesc = seoDesc.substring(0, 152) + '...';
  
  const kwsStr = Array.from(kws).join(', ');
  
  sql += `UPDATE products SET seo_title = '${escapeSql(seoTitle)}', seo_description = '${escapeSql(seoDesc)}', keywords = '${escapeSql(kwsStr)}' WHERE id = '${p.id}';\n`;
}

fs.writeFileSync('fix_updates.sql', sql);
console.log('Generated fix_updates.sql');

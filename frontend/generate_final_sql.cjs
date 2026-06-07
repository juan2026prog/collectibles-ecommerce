const fs = require('fs');

const products = JSON.parse(fs.readFileSync('all_products.json', 'utf8'));

let sqlUpdates = [];
let requiresReview = [];

function getAttr(metadata, id) {
  if (!metadata || !metadata.attributes) return null;
  const attr = metadata.attributes.find(a => a.id === id);
  if (attr && attr.value_name && attr.value_name !== 'No tiene' && attr.value_name !== 'ninguna' && attr.value_name !== 'Generico') {
    return attr.value_name;
  }
  return null;
}

for (const p of products) {
  const brandAttr = getAttr(p.metadata, 'BRAND') || getAttr(p.metadata, 'MANUFACTURER');
  const franchiseAttr = getAttr(p.metadata, 'FRANCHISE') || getAttr(p.metadata, 'COLLECTION');
  const characterAttr = getAttr(p.metadata, 'CHARACTER');
  const conditionAttr = getAttr(p.metadata, 'ITEM_CONDITION');
  const isCollectible = getAttr(p.metadata, 'IS_COLLECTIBLE') === 'Sí';
  
  let brand = (p.brand && p.brand.name && p.brand.name !== 'Generico') ? p.brand.name : brandAttr;
  if (brand === 'Generico') brand = null;
  
  const category = p.category ? p.category.name : 'Coleccionable';
  const isNew = conditionAttr === 'Nuevo';
  
  let confidence = 40;
  if (p.metadata && p.metadata.attributes && p.metadata.attributes.length > 5) {
    confidence = 80;
  }
  
  let cleanTitle = p.title.replace(/Oferta/ig, '').replace(/!/g, '').trim();
  const baseEntity = franchiseAttr || brand || category;
  let seoTitle = `${cleanTitle} | ${baseEntity} | Collectibles`;
  if (seoTitle.length > 60) seoTitle = `${cleanTitle.substring(0, 40)} | Collectibles`;
  
  let extraInfo = '';
  if (characterAttr && franchiseAttr) extraInfo = ` de ${characterAttr} (${franchiseAttr})`;
  else if (franchiseAttr) extraInfo = ` de ${franchiseAttr}`;
  else if (characterAttr) extraInfo = ` de ${characterAttr}`;
  
  let productWord = isCollectible ? 'Artículo coleccionable' : 'Producto';
  let newWord = isNew ? 'nuevo ' : '';
  
  let seoDesc = `Comprá ${cleanTitle}${extraInfo} en Uruguay. ${productWord} ${newWord}${brand ? 'de la marca '+brand+'.' : ''} Envíos a todo el país.`;
  if (seoDesc.length > 155) seoDesc = seoDesc.substring(0, 152) + '...';
  
  if (confidence >= 70) {
    let safeTitle = seoTitle.replace(/'/g, "''");
    let safeDesc = seoDesc.replace(/'/g, "''");
    sqlUpdates.push(`UPDATE products SET seo_title = '${safeTitle}', seo_description = '${safeDesc}' WHERE id = '${p.id}';`);
  } else {
    requiresReview.push({
      id: p.id,
      title: p.title,
      confidence,
      brand,
      franchise: franchiseAttr,
      character: characterAttr,
      seoTitleNeutral: seoTitle,
      seoDescNeutral: seoDesc
    });
  }
}

fs.writeFileSync('final_updates.sql', sqlUpdates.join('\n'));
fs.writeFileSync('requires_review.json', JSON.stringify(requiresReview, null, 2));

console.log(`Generated ${sqlUpdates.length} SQL updates.`);
console.log(`Saved ${requiresReview.length} products to requires_review.json`);

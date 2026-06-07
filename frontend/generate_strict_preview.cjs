const fs = require('fs');

const products = JSON.parse(fs.readFileSync('products_to_fix.json', 'utf8'));

let md = `## 3. Previsualización del Piloto (20 Productos)\n\n`;
let avgScore = 0;

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
  const lineAttr = getAttr(p.metadata, 'LINE');
  const materialAttr = getAttr(p.metadata, 'MATERIALS');
  const heightAttr = getAttr(p.metadata, 'HEIGHT');
  const conditionAttr = getAttr(p.metadata, 'ITEM_CONDITION');
  const gtinAttr = getAttr(p.metadata, 'GTIN');
  const isCollectible = getAttr(p.metadata, 'IS_COLLECTIBLE') === 'Sí';
  
  let brand = (p.brand && p.brand.name && p.brand.name !== 'Generico') ? p.brand.name : brandAttr;
  if (brand === 'Generico') brand = null;
  
  const hasBrand = !!brand;
  const category = p.category ? p.category.name : 'Coleccionable';
  
  // Confidence Score
  let confidence = 40; // Base: Internal data only
  const sourcesUsed = [{ type: 'mercadolibre', field: 'metadata.attributes', confidence: 80 }];
  if (p.metadata && p.metadata.attributes && p.metadata.attributes.length > 5) {
    confidence = 80;
  }
  
  // Collectible verification
  const isNew = conditionAttr === 'Nuevo';
  
  // Verified fields
  const verified = [];
  const omitted = [];
  
  if (brand) verified.push('Marca'); else omitted.push('Marca');
  if (franchiseAttr) verified.push('Franquicia'); else omitted.push('Franquicia');
  if (characterAttr) verified.push('Personaje'); else omitted.push('Personaje');
  if (materialAttr) verified.push('Material'); else omitted.push('Material');
  if (heightAttr) verified.push('Altura'); else omitted.push('Altura');
  if (gtinAttr) verified.push('UPC/EAN'); else omitted.push('UPC/EAN');
  if (isNew) verified.push('Condición'); else omitted.push('Condición');
  if (isCollectible) verified.push('Coleccionable'); else omitted.push('Coleccionable');
  
  omitted.push('Licencia oficial', 'Edición Limitada', 'Exclusivo'); // Unless we check the title
  
  const requiresReview = confidence < 70;
  
  // Titles & descriptions without forbidden words unless verified
  let cleanTitle = p.title.replace(/Oferta/ig, '').replace(/!/g, '').trim();
  const baseEntity = franchiseAttr || brand || category;
  let seoTitle = `${cleanTitle} | ${baseEntity} | Collectibles`;
  if (seoTitle.length > 60) seoTitle = `${cleanTitle.substring(0, 40)} | Collectibles`;
  
  let extraInfo = '';
  if (characterAttr && franchiseAttr) extraInfo = ` de ${characterAttr} (${franchiseAttr})`;
  else if (franchiseAttr) extraInfo = ` de ${franchiseAttr}`;
  else if (characterAttr) extraInfo = ` de ${characterAttr}`;
  
  // Safe words
  let productWord = isCollectible ? 'Artículo coleccionable' : 'Producto';
  let newWord = isNew ? 'nuevo ' : '';
  
  let seoDesc = `Comprá ${cleanTitle}${extraInfo} en Uruguay. ${productWord} ${newWord}${brand ? 'de la marca '+brand+'.' : ''} Envíos a todo el país.`;
  if (seoDesc.length > 155) seoDesc = seoDesc.substring(0, 152) + '...';
  
  // Enhanced description
  let enhancedDesc = `Figura ${cleanTitle}${extraInfo}.`;
  if (brand) enhancedDesc += ` Fabricado por ${brand}.`;
  if (materialAttr) enhancedDesc += ` Hecho en ${materialAttr}.`;
  if (heightAttr) enhancedDesc += ` Altura aproximada: ${heightAttr}.`;
  if (isNew) enhancedDesc += ` Estado: Nuevo.`;
  enhancedDesc += ` Ideal para fans de la saga y coleccionistas.`;
  
  // Keywords
  const kws = new Set();
  if (franchiseAttr) kws.add(franchiseAttr);
  if (characterAttr) kws.add(characterAttr);
  if (brand) kws.add(brand);
  if (lineAttr) kws.add(lineAttr);
  kws.add(category);
  kws.add('Uruguay');
  kws.add('comprar');
  
  // FAQ
  let faq = `**¿Es nuevo?** ${isNew ? 'Sí, es nuevo.' : 'No especificado.'}\n**¿Qué material es?** ${materialAttr ? materialAttr : 'No especificado.'}\n**¿Cuál es la altura?** ${heightAttr ? heightAttr : 'No especificado.'}`;
  
  avgScore += confidence;
  
  md += `### ${p.title}\n`;
  md += `- **Confidence Score:** ${confidence}/100\n`;
  md += `- **Requiere Revisión:** ${requiresReview ? 'SÍ' : 'NO'}\n`;
  md += `- **Sources Used:** \`${JSON.stringify(sourcesUsed)}\`\n`;
  md += `- **Fields Verified:** ${verified.join(', ')}\n`;
  md += `- **Fields Omitted:** ${omitted.join(', ')}\n\n`;
  md += `| Campo | Contenido Propuesto |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **SEO Title** | \`${seoTitle}\` |\n`;
  md += `| **SEO Desc** | \`${seoDesc}\` |\n`;
  md += `| **Keywords** | \`${Array.from(kws).join(', ')}\` |\n`;
  md += `| **Enhanced Desc** | \`${enhancedDesc}\` |\n`;
  md += `| **FAQ** | <pre>${faq}</pre> |\n\n`;
}

md += `---\n\n### Resumen\n**Score Promedio:** ${avgScore / products.length} / 100\n`;
fs.writeFileSync('preview_strict.md', md);
console.log('Done');

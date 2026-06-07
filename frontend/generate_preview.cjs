const fs = require('fs');

const products = JSON.parse(fs.readFileSync('products_to_fix.json', 'utf8'));

let md = `# Propuesta de Corrección SEO-3A (Algoritmo Dinámico)\n\n`;
let totalScore = 0;

function getAttr(metadata, id) {
  if (!metadata || !metadata.attributes) return null;
  const attr = metadata.attributes.find(a => a.id === id);
  if (attr && attr.value_name && attr.value_name !== 'No tiene' && attr.value_name !== 'ninguna') {
    return attr.value_name;
  }
  return null;
}

for (const p of products) {
  const brandAttr = getAttr(p.metadata, 'BRAND') || getAttr(p.metadata, 'MANUFACTURER');
  const franchiseAttr = getAttr(p.metadata, 'FRANCHISE') || getAttr(p.metadata, 'COLLECTION');
  const characterAttr = getAttr(p.metadata, 'CHARACTER');
  const lineAttr = getAttr(p.metadata, 'LINE');
  
  let brand = (p.brand && p.brand.name && p.brand.name !== 'Generico') ? p.brand.name : brandAttr;
  if (brand === 'Generico' || !brand) brand = null;
  
  const category = p.category ? p.category.name : 'Coleccionable';
  
  // Clean title
  let cleanTitle = p.title.replace(/Oferta/ig, '').replace(/!/g, '').trim();
  
  // Build keywords
  const kws = new Set();
  if (franchiseAttr) kws.add(franchiseAttr);
  if (characterAttr) kws.add(characterAttr);
  if (brand) kws.add(brand);
  if (lineAttr) kws.add(lineAttr);
  kws.add(category);
  kws.add('Uruguay');
  kws.add('comprar');
  
  // Build title (max 60)
  const baseEntity = franchiseAttr || brand || category;
  let seoTitle = `${cleanTitle} | ${baseEntity} | Collectibles`;
  if (seoTitle.length > 60) {
    seoTitle = `${cleanTitle.substring(0, 40)} | Collectibles`;
  }
  
  // Build description (max 155)
  let extraInfo = '';
  if (characterAttr && franchiseAttr) extraInfo = ` de ${characterAttr} (${franchiseAttr})`;
  else if (franchiseAttr) extraInfo = ` de ${franchiseAttr}`;
  else if (characterAttr) extraInfo = ` de ${characterAttr}`;
  
  let seoDesc = `Comprá ${cleanTitle}${extraInfo} en Uruguay. ${brand ? 'Producto original de '+brand+'.' : ''} Envíos a todo el país por Collectibles.`;
  if (seoDesc.length > 155) seoDesc = seoDesc.substring(0, 152) + '...';
  
  // Scoring
  let score = 50; // base
  if (seoTitle.length <= 60 && seoTitle.length > 10) score += 10;
  if (seoDesc.length <= 155 && seoDesc.length > 50) score += 10;
  if (!seoTitle.includes('Generico')) score += 10;
  if (kws.size >= 5) score += 10;
  if (franchiseAttr || characterAttr) score += 10;
  
  totalScore += score;
  
  md += `### ${p.title}\n`;
  md += `- **ID:** \`${p.id}\`\n`;
  md += `- **Entidades Extraídas:** Franquicia: *${franchiseAttr || 'N/A'}* | Personaje: *${characterAttr || 'N/A'}* | Marca: *${brand || 'N/A'}*\n`;
  md += `- **Score SEO:** ${score}/100\n\n`;
  md += `| Campo | ANTES (Algoritmo Fallido) | DESPUÉS (Algoritmo Dinámico) |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| **SEO Title** | \`[Plantilla Fallida]\` | \`${seoTitle}\` |\n`;
  md += `| **SEO Desc** | \`Compra [X] original en Uruguay...\` | \`${seoDesc}\` |\n`;
  md += `| **Keywords** | \`Generico, Uruguay...\` | \`${Array.from(kws).join(', ')}\` |\n\n`;
}

md += `---\n\n### Resumen\n**Score Promedio:** ${totalScore / products.length} / 100\n`;
fs.writeFileSync('preview.md', md);
console.log('Done');

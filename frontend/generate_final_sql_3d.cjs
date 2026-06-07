const fs = require('fs');

const products = JSON.parse(fs.readFileSync('all_products.json', 'utf8'));

function getAttr(metadata, id) {
  if (!metadata || !metadata.attributes) return null;
  const attr = metadata.attributes.find(a => a.id === id);
  if (attr && attr.value_name && !['No tiene', 'ninguna', 'Generico'].includes(attr.value_name)) {
    return attr.value_name;
  }
  return null;
}

const redundantWordsRegex = /(Figura de Acción|Action Figure|Juguete|Original|Coleccionable|Réplica Oficial|Producto|De Vinilo|Articulada|Deluxe|Edition|Exclusiv[eo]|En Vinilo)/gi;

let sqlUpdates = [];

for (const p of products) {
  let brand = (p.brand && p.brand.name && p.brand.name !== 'Generico') ? p.brand.name : (getAttr(p.metadata, 'BRAND') || getAttr(p.metadata, 'MANUFACTURER'));
  if (brand === 'Generico') brand = null;
  
  const franchiseAttr = getAttr(p.metadata, 'FRANCHISE') || getAttr(p.metadata, 'COLLECTION');
  const characterAttr = getAttr(p.metadata, 'CHARACTER');
  const category = p.category ? p.category.name : 'Coleccionable';
  
  let confidence = 40;
  if (p.metadata && p.metadata.attributes && p.metadata.attributes.length > 5) {
    confidence = 80;
  }

  // Only products that were affected by the previous run
  if (confidence < 70) continue;

  let cleanTitle = p.title.replace(/Oferta/ig, '').replace(/!/g, '').trim();
  
  let proposedTitle = '';
  let brandSafe = brand && brand !== 'Genérica' && brand !== 'Generico' ? brand : '';
  let franchiseSafe = franchiseAttr || '';
  let charSafe = characterAttr || '';

  let isFunko = brandSafe.toLowerCase().includes('funko');
  let isMarvelLegends = cleanTitle.toLowerCase().includes('marvel legends');
  let isNeca = brandSafe.toLowerCase().includes('neca') || cleanTitle.toLowerCase().includes('neca');

  if (isFunko) {
      brandSafe = 'Funko';
      let funkoType = cleanTitle.toLowerCase().includes('plush') ? 'Funko Plush' : 'Funko Pop';
      if (charSafe && franchiseSafe) {
          proposedTitle = `${funkoType} ${charSafe} | ${franchiseSafe} | Collectibles`;
      } else if (charSafe) {
          proposedTitle = `${funkoType} ${charSafe} | Collectibles`;
      } else {
          let stripped = cleanTitle.replace(/funko pop/ig, '').replace(/funko/ig, '').trim();
          proposedTitle = `${funkoType} ${stripped} | ${franchiseSafe || 'Collectibles'}`;
          if (!proposedTitle.endsWith('Collectibles')) proposedTitle += ' | Collectibles';
      }
  } else if (isMarvelLegends) {
      brandSafe = 'Marvel';
      franchiseSafe = 'Marvel';
      if (charSafe) {
          proposedTitle = `Marvel Legends ${charSafe} | Marvel | Collectibles`;
      } else {
          let stripped = cleanTitle.replace(/marvel legends/ig, '').trim();
          proposedTitle = `Marvel Legends ${stripped} | Marvel | Collectibles`;
      }
  } else if (isNeca) {
      brandSafe = 'NECA';
      let prod = charSafe || cleanTitle.replace(/neca/ig, '').trim();
      if (franchiseSafe) {
          proposedTitle = `NECA ${prod} | ${franchiseSafe} | Collectibles`;
      } else {
          proposedTitle = `NECA ${prod} | Collectibles`;
      }
  } else {
      if (charSafe && franchiseSafe && brandSafe) {
          proposedTitle = `${charSafe} ${franchiseSafe} | ${brandSafe} | Collectibles`;
      } else if (charSafe && franchiseSafe) {
          proposedTitle = `${charSafe} ${franchiseSafe} | Collectibles`;
      } else if (franchiseSafe && brandSafe) {
          proposedTitle = `${franchiseSafe} | ${brandSafe} | Collectibles`;
      } else {
          proposedTitle = `${cleanTitle} | ${franchiseSafe || brandSafe || 'Collectibles'}`;
          if (!proposedTitle.endsWith('Collectibles')) proposedTitle += ' | Collectibles';
      }
  }

  proposedTitle = proposedTitle.replace(/\s+/g, ' ').replace(/\s-\s?\|/g, ' |').replace(/\|\s*\|/g, '|').trim();

  if (proposedTitle.length > 70) {
      proposedTitle = proposedTitle.replace(redundantWordsRegex, '').replace(/\s+/g, ' ').replace(/\s-\s?\|/g, ' |').trim();
      
      if (proposedTitle.length > 70 && charSafe && franchiseSafe) {
          proposedTitle = `${charSafe} | ${franchiseSafe} | Collectibles`;
      }

      if (proposedTitle.length > 70 && charSafe) {
          let charShort = charSafe;
          if (charShort.length > 40) {
              charShort = charShort.substring(0, 40).replace(/\s+\S*$/, '') + '...';
          }
          proposedTitle = `${charShort} | Collectibles`;
      }

      if (proposedTitle.length > 70) {
         let stripped = proposedTitle.replace(' | Collectibles', '');
         if (stripped.length > 50) {
             stripped = stripped.substring(0, 50).replace(/\s+\S*$/, '');
         }
         proposedTitle = `${stripped} | Collectibles`;
      }
  }

  proposedTitle = proposedTitle.replace(/\s+/g, ' ').replace(/\s-\s?\|/g, ' |').replace(/\|\s*\|/g, '|').replace(/\|\s*Collectibles$/, '| Collectibles').trim();

  let safeTitle = proposedTitle.replace(/'/g, "''");
  sqlUpdates.push(`UPDATE products SET seo_title = '${safeTitle}' WHERE id = '${p.id}';`);
}

console.log(`Generated ${sqlUpdates.length} SQL updates for Phase 3D.`);

// We have 378 updates, so we can split them into 4 batches again
const batchSize = Math.ceil(sqlUpdates.length / 4);
for (let i = 0; i < 4; i++) {
    const batch = sqlUpdates.slice(i * batchSize, (i + 1) * batchSize);
    fs.writeFileSync(`batch_3d_${i+1}.sql`, batch.join('\n'));
}

console.log('Successfully wrote 4 batch SQL files.');

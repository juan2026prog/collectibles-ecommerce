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

// Redundant words to remove if title is too long
const redundantWordsRegex = /(Figura de Acción|Action Figure|Juguete|Original|Coleccionable|Réplica Oficial|Producto|De Vinilo|Articulada|Deluxe|Edition|Exclusiv[eo]|En Vinilo)/gi;

let previewData = [];

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

  // If confidence is < 70, this product wasn't updated in Phase 3B. We skip it, 
  // but wait, we need to correct the ones that were updated. So only confidence >= 70.
  if (confidence < 70) continue;

  let cleanTitle = p.title.replace(/Oferta/ig, '').replace(/!/g, '').trim();
  const baseEntity = franchiseAttr || brand || category;
  
  // CURRENT SEO TITLE LOGIC
  let currentSeoTitle = `${cleanTitle} | ${baseEntity} | Collectibles`;
  let wasTruncated = false;
  if (currentSeoTitle.length > 60) {
      currentSeoTitle = `${cleanTitle.substring(0, 40)} | Collectibles`;
      wasTruncated = true;
  }

  // NEW LOGIC
  let proposedTitle = '';
  let brandSafe = brand && brand !== 'Genérica' && brand !== 'Generico' ? brand : '';
  let franchiseSafe = franchiseAttr || '';
  let charSafe = characterAttr || '';

  // Brand-specific structures
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
          // clean title minus funko pop
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

  // Remove duplicate spaces, trailing hyphens before pipes
  proposedTitle = proposedTitle.replace(/\s+/g, ' ').replace(/\s-\s?\|/g, ' |').replace(/\|\s*\|/g, '|').trim();

  // Length optimization loop (Max 70)
  if (proposedTitle.length > 70) {
      // 1. Remove redundant words
      proposedTitle = proposedTitle.replace(redundantWordsRegex, '').replace(/\s+/g, ' ').replace(/\s-\s?\|/g, ' |').trim();
      
      // 2. If still > 70, try to just use: [Char] | [Franchise] | Collectibles (drop brand)
      if (proposedTitle.length > 70 && charSafe && franchiseSafe) {
          proposedTitle = `${charSafe} | ${franchiseSafe} | Collectibles`;
      }

      // 3. If still > 70, just Char | Collectibles
      if (proposedTitle.length > 70 && charSafe) {
          let charShort = charSafe;
          if (charShort.length > 40) {
              // We must truncate character, but not mid-word
              charShort = charShort.substring(0, 40).replace(/\s+\S*$/, '') + '...';
          }
          proposedTitle = `${charShort} | Collectibles`;
      }

      // 4. Fallback: clean title truncated at word boundary + | Collectibles
      if (proposedTitle.length > 70) {
         let stripped = proposedTitle.replace(' | Collectibles', '');
         // Cut at 50 to leave room for ' | Collectibles'
         if (stripped.length > 50) {
             stripped = stripped.substring(0, 50).replace(/\s+\S*$/, '');
         }
         proposedTitle = `${stripped} | Collectibles`;
      }
  }

  // Cleanup one more time
  proposedTitle = proposedTitle.replace(/\s+/g, ' ').replace(/\s-\s?\|/g, ' |').replace(/\|\s*\|/g, '|').replace(/\|\s*Collectibles$/, '| Collectibles').trim();

  const isTruncated = wasTruncated || currentSeoTitle.includes('- | Collectibles') || currentSeoTitle.match(/\w\s?\|\s?Collectibles/);

  previewData.push({
    id: p.id,
    slug: p.slug,
    titleActual: p.title,
    seoTitleActual: currentSeoTitle,
    seoTitlePropuesto: proposedTitle,
    longitudActual: currentSeoTitle.length,
    longitudNueva: proposedTitle.length,
    esTruncado: !!isTruncated,
    entidades: {
      personaje: charSafe,
      franquicia: franchiseSafe,
      marca: brandSafe
    },
    razon: 'Regla de formato específica o limpieza de truncamiento.'
  });
}

const truncatedProducts = previewData.filter(p => p.esTruncado);
const selectedPreview = previewData.filter(p => p.esTruncado).slice(0, 100);

let score = 100;
let cutWords = 0;
let genericoCount = 0;
let over70Count = 0;
let validEntityCount = 0;

previewData.forEach(p => {
    if (p.seoTitlePropuesto.toLowerCase().includes('generico')) genericoCount++;
    if (p.seoTitlePropuesto.length > 70) over70Count++;
    if (p.entidades.franquicia || p.entidades.personaje || p.entidades.marca) validEntityCount++;
    // cut words check -> ...
    if (p.seoTitlePropuesto.includes('...')) cutWords++; // our algorithm adds ... if forced
});

if (cutWords > 0) score -= (cutWords / previewData.length) * 100;
if (genericoCount > 0) score -= (genericoCount / previewData.length) * 100;
if ((over70Count / previewData.length) > 0.05) score -= 20;
if ((validEntityCount / previewData.length) < 0.80) score -= 30;

const resultData = {
    totalAfectados: previewData.length,
    totalTruncadosViejos: truncatedProducts.length,
    scoreEstimado: Math.round(score),
    metricas: {
        cortadas: cutWords,
        generico: genericoCount,
        mayor70: over70Count,
        conEntidad: validEntityCount,
        porcentajeMayor70: (over70Count / previewData.length * 100).toFixed(1) + '%',
        porcentajeConEntidad: (validEntityCount / previewData.length * 100).toFixed(1) + '%'
    },
    preview: selectedPreview
};

fs.writeFileSync('preview_3d.json', JSON.stringify(resultData, null, 2));
console.log('Preview generated in preview_3d.json');

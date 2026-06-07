const fs = require('fs');

const products = JSON.parse(fs.readFileSync('all_products.json', 'utf8'));

const getAttr = (metadata, id) => {
    if (!metadata || !metadata.attributes) return null;
    const attr = metadata.attributes.find(a => a.id === id);
    if (attr && attr.value_name && !['No tiene', 'ninguna', 'Generico', 'Genérica', 'Varios', 'Desconocida'].includes(attr.value_name)) {
        return attr.value_name.trim();
    }
    return null;
};

const cleanString = (str) => {
    if (!str) return null;
    return str.replace(/\([^)]*\)/g, '').trim();
};

const affected = [];

for (const p of products) {
    let currentCat = p.category ? p.category.name : null;
    let currentBrand = p.brand ? p.brand.name : null;
    
    // Identify issues
    const isCatBad = !currentCat || currentCat === 'Varios' || currentCat.toLowerCase().includes('otros');
    const isBrandBad = !currentBrand || currentBrand === 'Generico' || currentBrand === 'Genérica';
    const isFranchiseBad = !getAttr(p.metadata, 'FRANCHISE') && !getAttr(p.metadata, 'COLLECTION');

    if (isCatBad || isBrandBad || isFranchiseBad) {
        
        let sugCat = null;
        let sugBrand = null;
        let sugFranchise = null;
        let score = 50;

        const lowerTitle = p.title.toLowerCase();

        // Infer Category
        if (isCatBad) {
            if (lowerTitle.includes('funko pop')) sugCat = 'Funko Pop';
            else if (lowerTitle.includes('peluche') || lowerTitle.includes('plush')) sugCat = 'Peluches';
            else if (lowerTitle.includes('figura')) sugCat = 'Figuras de Acción';
            else if (lowerTitle.includes('estatua') || lowerTitle.includes('iron studios')) sugCat = 'Esculturas y Estatuas';
            else if (lowerTitle.includes('camiseta') || lowerTitle.includes('body ') || lowerTitle.includes('gorro') || lowerTitle.includes('guantes') || lowerTitle.includes('pijama') || lowerTitle.includes('canguro')) sugCat = 'Ropa & Accesorios';
            else if (lowerTitle.includes('cuaderno') || lowerTitle.includes('goma') || lowerTitle.includes('set escolar')) sugCat = 'Papelería';
            else if (lowerTitle.includes('taza') || lowerTitle.includes('vaso')) sugCat = 'Home & Decor';
            else if (lowerTitle.includes('tcg') || lowerTitle.includes('card game') || lowerTitle.includes('cartas')) sugCat = 'TCG & Boardgames';
            else if (lowerTitle.includes('auto') || lowerTitle.includes('vehículo') || lowerTitle.includes('majorette')) sugCat = 'Vehículos a Escala';
            
            if (sugCat) score += 15;
        }

        // Infer Brand
        if (isBrandBad) {
            sugBrand = getAttr(p.metadata, 'BRAND') || getAttr(p.metadata, 'MANUFACTURER');
            if (!sugBrand) {
                if (lowerTitle.includes('funko')) sugBrand = 'Funko';
                else if (lowerTitle.includes('hasbro')) sugBrand = 'Hasbro';
                else if (lowerTitle.includes('neCA')) sugBrand = 'NECA';
                else if (lowerTitle.includes('bandai')) sugBrand = 'Bandai';
                else if (lowerTitle.includes('iron studios')) sugBrand = 'Iron Studios';
                else if (lowerTitle.includes('mcfarlane')) sugBrand = 'McFarlane';
                else if (lowerTitle.includes('cinereplicas')) sugBrand = 'Cinereplicas';
                else if (lowerTitle.includes('figgyz')) sugBrand = 'Figgyz';
                else if (lowerTitle.includes('majorette')) sugBrand = 'Majorette';
            }
            if (sugBrand) {
                sugBrand = cleanString(sugBrand);
                score += 20;
            }
        }

        // Infer Franchise
        if (isFranchiseBad) {
            sugFranchise = getAttr(p.metadata, 'FRANCHISE') || getAttr(p.metadata, 'COLLECTION');
            if (!sugFranchise) {
                if (lowerTitle.includes('marvel')) sugFranchise = 'Marvel';
                else if (lowerTitle.includes('star wars')) sugFranchise = 'Star Wars';
                else if (lowerTitle.includes('harry potter')) sugFranchise = 'Harry Potter';
                else if (lowerTitle.includes('dragon ball')) sugFranchise = 'Dragon Ball';
                else if (lowerTitle.includes('pokemon') || lowerTitle.includes('pokémon')) sugFranchise = 'Pokémon';
                else if (lowerTitle.includes('batman') || lowerTitle.includes('superman') || lowerTitle.includes('dc comics')) sugFranchise = 'DC Comics';
                else if (lowerTitle.includes('sonic')) sugFranchise = 'Sonic';
                else if (lowerTitle.includes('disney')) sugFranchise = 'Disney';
                else if (lowerTitle.includes('street fighter')) sugFranchise = 'Street Fighter';
                else if (lowerTitle.includes('mortal kombat')) sugFranchise = 'Mortal Kombat';
                else if (lowerTitle.includes('naruto')) sugFranchise = 'Naruto';
                else if (lowerTitle.includes('one piece')) sugFranchise = 'One Piece';
            }
            if (sugFranchise) {
                sugFranchise = cleanString(sugFranchise);
                score += 15;
            }
        }

        if (sugCat || sugBrand || sugFranchise) {
            affected.push({
                id: p.id,
                title: p.title,
                issues: {
                    category: isCatBad ? 'Mala/Varios' : 'OK',
                    brand: isBrandBad ? 'Generico' : 'OK',
                    franchise: isFranchiseBad ? 'Vacia' : 'OK'
                },
                suggestions: {
                    category: sugCat,
                    brand: sugBrand,
                    franchise: sugFranchise
                },
                confidenceScore: Math.min(score, 100)
            });
        }
    }
}

// Group for report
const report = {
    totalAfectados: affected.length,
    highConfidence: affected.filter(a => a.confidenceScore >= 70).length,
    mediumConfidence: affected.filter(a => a.confidenceScore >= 50 && a.confidenceScore < 70).length,
    lowConfidence: affected.filter(a => a.confidenceScore < 50).length,
    samples: affected.slice(0, 20) // show 20 examples
};

fs.writeFileSync('audit_reclassification.json', JSON.stringify(report, null, 2));
console.log('Reclassification audit complete.');

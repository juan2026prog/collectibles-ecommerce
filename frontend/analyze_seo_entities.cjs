const fs = require('fs');

const products = JSON.parse(fs.readFileSync('all_products.json', 'utf8'));

const getAttr = (metadata, id) => {
    if (!metadata || !metadata.attributes) return null;
    const attr = metadata.attributes.find(a => a.id === id);
    if (attr && attr.value_name && !['No tiene', 'ninguna', 'Generico', 'Genérica', 'Varios'].includes(attr.value_name)) {
        return attr.value_name.trim();
    }
    return null;
};

const brandsMap = new Map();
const categoriesMap = new Map();
const franchisesMap = new Map();
const charactersMap = new Map();
const combinationsMap = new Map();

const cleanString = (str) => {
    return str.replace(/\([^)]*\)/g, '').trim().toUpperCase();
};

for (const p of products) {
    let brand = (p.brand && p.brand.name && p.brand.name !== 'Generico') ? p.brand.name : getAttr(p.metadata, 'BRAND') || getAttr(p.metadata, 'MANUFACTURER');
    if (!brand || ['Generico', 'Genérica'].includes(brand)) brand = 'Desconocida';
    brand = brand.trim();

    let category = p.category ? p.category.name : 'Varios';
    if (!category) category = 'Varios';
    
    // Attempt to standardize categories a bit based on title
    if (p.title.toLowerCase().includes('funko pop')) category = 'Funko Pop';
    else if (p.title.toLowerCase().includes('peluche') || p.title.toLowerCase().includes('plush')) category = 'Peluches';
    else if (p.title.toLowerCase().includes('figura')) category = 'Figuras de Acción';

    let franchise = getAttr(p.metadata, 'FRANCHISE') || getAttr(p.metadata, 'COLLECTION');
    let character = getAttr(p.metadata, 'CHARACTER');

    // Basic extraction from title if missing
    if (!franchise) {
        const lowerTitle = p.title.toLowerCase();
        if (lowerTitle.includes('marvel')) franchise = 'Marvel';
        else if (lowerTitle.includes('star wars')) franchise = 'Star Wars';
        else if (lowerTitle.includes('harry potter')) franchise = 'Harry Potter';
        else if (lowerTitle.includes('dragon ball')) franchise = 'Dragon Ball';
        else if (lowerTitle.includes('pokemon') || lowerTitle.includes('pokémon')) franchise = 'Pokémon';
        else if (lowerTitle.includes('dc comics') || lowerTitle.includes('batman') || lowerTitle.includes('superman')) franchise = 'DC Comics';
        else if (lowerTitle.includes('sonic')) franchise = 'Sonic';
        else if (lowerTitle.includes('disney')) franchise = 'Disney';
        else if (lowerTitle.includes('naruto')) franchise = 'Naruto';
        else if (lowerTitle.includes('one piece')) franchise = 'One Piece';
        else if (lowerTitle.includes('stranger things')) franchise = 'Stranger Things';
        else if (lowerTitle.includes('mortal kombat')) franchise = 'Mortal Kombat';
    }

    if (franchise) {
        let cleanF = cleanString(franchise);
        if (cleanF === 'DC' || cleanF === 'DC COMICS') cleanF = 'DC Comics';
        if (cleanF === 'STAR WARS' || cleanF === 'STARWARS') cleanF = 'Star Wars';
        if (cleanF === 'MARVEL' || cleanF === 'MARVEL COMICS') cleanF = 'Marvel';
        if (cleanF === 'HARRY POTTER') cleanF = 'Harry Potter';
        franchisesMap.set(cleanF, (franchisesMap.get(cleanF) || 0) + 1);
    }

    if (character) {
        let cleanC = cleanString(character);
        charactersMap.set(cleanC, (charactersMap.get(cleanC) || 0) + 1);
    }

    let cleanB = cleanString(brand);
    brandsMap.set(cleanB, (brandsMap.get(cleanB) || 0) + 1);
    
    let cleanCat = cleanString(category);
    categoriesMap.set(cleanCat, (categoriesMap.get(cleanCat) || 0) + 1);

    if (franchise && brand !== 'Desconocida') {
        const f = cleanString(franchise);
        const combo = `${f} + ${cleanB}`;
        combinationsMap.set(combo, (combinationsMap.get(combo) || 0) + 1);
    }
    
    if (franchise && category !== 'Varios') {
        const f = cleanString(franchise);
        const combo = `${f} + ${cleanCat}`;
        combinationsMap.set(combo, (combinationsMap.get(combo) || 0) + 1);
    }
}

const sortMap = (map) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]);

const report = {
    totalProducts: products.length,
    brands: sortMap(brandsMap).slice(0, 20),
    categories: sortMap(categoriesMap).slice(0, 20),
    franchises: sortMap(franchisesMap).slice(0, 50),
    characters: sortMap(charactersMap).slice(0, 50),
    combinations: sortMap(combinationsMap).slice(0, 50),
};

fs.writeFileSync('audit_entities.json', JSON.stringify(report, null, 2));
console.log('Done generating audit_entities.json');

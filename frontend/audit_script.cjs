const fs = require('fs');

const dataRaw = fs.readFileSync('C:\\Users\\juanm\\.gemini\\antigravity\\brain\\1ea1ab6a-bd38-4b7e-9228-8df13a88b1ef\\.system_generated\\steps\\850\\output.txt', 'utf8');

const jsonObj = JSON.parse(dataRaw);
const resultStr = jsonObj.result;

const match = resultStr.match(/<untrusted-data-[^>]+>\n([\s\S]+?)\n<\/untrusted-data-/);

if (!match) {
    console.log("No JSON found");
    process.exit(1);
}

const products = JSON.parse(match[1]);

let stats = {
    title: {
        avg_length: 0,
        truncated: 0,
        has_brand: 0,
        has_franchise_or_char: 0,
    },
    desc: {
        avg_length: 0,
        commercial_utility: 0, // "Comprá... en Uruguay. Envíos a todo el país."
        has_context: 0
    },
    bad_keywords: 0,
    worst: [],
    best: []
};

products.forEach(p => {
    // Title Analysis
    stats.title.avg_length += p.seo_title.length;
    
    // Detect truncation (if it ends with " | Collectibles" and the part before is exactly 40 chars, or ends abruptly)
    const titleBeforeSuffix = p.seo_title.replace(' | Collectibles', '').trim();
    if (titleBeforeSuffix.length === 40 && p.title.length > 40) {
        stats.title.truncated++;
    } else if (p.seo_title.split('|').length < 3) {
        // Only one pipe -> truncated before brand
        stats.title.truncated++;
    }

    let hasBrandOrContext = false;
    if (p.seo_title.split('|').length > 2) {
        stats.title.has_brand++;
        hasBrandOrContext = true;
    }

    // Desc Analysis
    stats.desc.avg_length += p.seo_description.length;
    if (p.seo_description.includes("Comprá") && p.seo_description.includes("Envíos a todo el país")) {
        stats.desc.commercial_utility++;
    }
    if (p.seo_description.includes(" de ")) {
        stats.desc.has_context++;
    }

    const badWords = ['Generico', 'Coleccionables', 'Producto', 'Item', 'Accesorio'];
    let hasBad = badWords.some(w => p.seo_title.toLowerCase().includes(w.toLowerCase()) || p.seo_description.toLowerCase().includes(w.toLowerCase()));
    
    if (hasBad) stats.bad_keywords++;

    // Calculate score
    let score = 100;
    let penaltyReason = [];
    if (titleBeforeSuffix.length === 40 || !hasBrandOrContext) {
        score -= 40;
        penaltyReason.push('Truncated Title / No Brand or Franchise in Title');
    }
    if (hasBad) {
        score -= 30;
        penaltyReason.push('Bad Keywords');
    }
    if (p.seo_description.length < 50) {
        score -= 20;
        penaltyReason.push('Thin Description');
    }
    if (!p.seo_description.includes(" de ")) {
        score -= 20;
        penaltyReason.push('Description lacks semantic context (de [franquicia/personaje])');
    }

    if (score <= 60) {
        stats.worst.push({ id: p.id, title: p.seo_title, reason: penaltyReason.join(', ') });
    } else if (score >= 80) {
        stats.best.push({ id: p.id, title: p.seo_title, desc: p.seo_description });
    }
});

stats.title.avg_length /= products.length;
stats.desc.avg_length /= products.length;

console.log(JSON.stringify({
    total: products.length,
    stats,
    worst_count: stats.worst.length,
    best_count: stats.best.length,
    worst: stats.worst.slice(0, 20),
    best: stats.best.slice(0, 20)
}, null, 2));

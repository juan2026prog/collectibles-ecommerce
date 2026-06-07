const fs = require('fs');
const https = require('https');

async function fetchUrl(url, userAgent) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {}
        };
        if (userAgent) {
            options.headers['User-Agent'] = userAgent;
        }

        const req = https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        
        req.on('error', e => reject(e));
        req.end();
    });
}

function parseHTML(html) {
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]*)"/i) || html.match(/<meta name="og:title" content="([^"]*)"/i);
    const ogDescMatch = html.match(/<meta property="og:description" content="([^"]*)"/i) || html.match(/<meta name="og:description" content="([^"]*)"/i);
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]*)"/i) || html.match(/<meta name="og:image" content="([^"]*)"/i);
    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]*)"/i);
    const jsonldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    const hasSpaRoot = html.includes('id="root"') || html.includes('id="app"') || html.includes('<script type="module"');

    return {
        title: titleMatch ? titleMatch[1] : null,
        ogTitle: ogTitleMatch ? ogTitleMatch[1] : null,
        ogDesc: ogDescMatch ? ogDescMatch[1] : null,
        ogImage: ogImageMatch ? ogImageMatch[1] : null,
        canonical: canonicalMatch ? canonicalMatch[1] : null,
        jsonld: jsonldMatch ? JSON.parse(jsonldMatch[1]) : null,
        hasSpaRoot
    };
}

async function main() {
    console.log("Loading preview data...");
    const previewData = JSON.parse(fs.readFileSync('preview_3d.json', 'utf8'));
    
    // The JSON output of preview was just `{ totalAfectados, preview: [...] }`
    const items = previewData.preview || [];
    if (items.length === 0) {
        console.error("No preview items found.");
        return;
    }

    // Pick 10 random
    const shuffled = items.sort(() => 0.5 - Math.random());
    const sample = shuffled.slice(0, 10);

    const report = [];
    
    for (const item of sample) {
        const id = item.id;
        const slug = item.slug;
        const expectedTitle = item.seoTitlePropuesto;
        const expectedDesc = item.seoDescription; // assume it didn't change
        
        const url = `https://collectibles.uy/p/${slug}`;
        console.log(`\nTesting: ${url}`);
        
        let success = true;
        let errors = [];

        // DB Verification
        // Since we can't easily query DB in pure Node without credentials/MCP directly inside this script reliably,
        // we'll rely on the API response! Wait, social.js reads directly from the DB!
        // So the API response IS the DB value!

        // 1. Normal curl
        console.log("  -> Normal request...");
        const normalRes = await fetchUrl(url, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
        const normalParsed = parseHTML(normalRes.data);
        
        if (!normalParsed.hasSpaRoot) {
            errors.push("Normal request did not return SPA root.");
            success = false;
        }
        if (normalParsed.ogTitle && normalParsed.ogTitle === expectedTitle) {
            // Usually Vite index.html doesn't have the dynamic expectedTitle, it has a generic one.
            // If it has expectedTitle, maybe SSR is enabled? 
            // In phase 2, normal users get SPA, bots get social.js
        }

        // 2. FacebookBot curl
        console.log("  -> FacebookBot request...");
        const fbRes = await fetchUrl(url, 'facebookexternalhit/1.1');
        const fbParsed = parseHTML(fbRes.data);

        if (fbRes.status !== 200) {
            errors.push(`FB Bot got status ${fbRes.status}`);
            success = false;
        }
        if (fbParsed.title !== expectedTitle) {
            errors.push(`FB Bot Title mismatch. Expected: "${expectedTitle}", Got: "${fbParsed.title}"`);
            success = false;
        }
        if (fbParsed.ogTitle !== expectedTitle) {
             errors.push(`FB Bot OG:Title mismatch. Expected: "${expectedTitle}", Got: "${fbParsed.ogTitle}"`);
             success = false;
        }
        if (!fbParsed.ogDesc || fbParsed.ogDesc.length < 10) {
            errors.push(`FB Bot OG:Desc missing or too short.`);
            success = false;
        }
        if (!fbParsed.ogImage || !fbParsed.ogImage.startsWith('http')) {
            errors.push(`FB Bot OG:Image missing or invalid.`);
            success = false;
        }
        if (!fbParsed.canonical || fbParsed.canonical !== url) {
             errors.push(`FB Bot Canonical mismatch. Expected: ${url}, Got: ${fbParsed.canonical}`);
             success = false;
        }
        if (!fbParsed.jsonld || fbParsed.jsonld["@type"] !== "Product") {
             errors.push(`FB Bot JSON-LD missing or invalid.`);
             success = false;
        }

        // 3. WhatsApp curl
        console.log("  -> WhatsApp request...");
        const waRes = await fetchUrl(url, 'WhatsApp/2.21.12.21 A');
        const waParsed = parseHTML(waRes.data);

        if (waRes.status !== 200) {
             errors.push(`WA Bot got status ${waRes.status}`);
             success = false;
        }
        if (waParsed.title !== expectedTitle) {
            errors.push(`WA Bot Title mismatch. Expected: "${expectedTitle}", Got: "${waParsed.title}"`);
            success = false;
        }
        if (waParsed.ogTitle !== expectedTitle) {
             errors.push(`WA Bot OG:Title mismatch. Expected: "${expectedTitle}", Got: "${waParsed.ogTitle}"`);
             success = false;
        }

        report.push({
            id,
            slug,
            url,
            expectedTitle,
            status: success ? 'OK' : 'ERROR',
            errors
        });
    }

    // 4. Check robots.txt
    console.log("\nTesting robots.txt...");
    const robotsRes = await fetchUrl('https://collectibles.uy/robots.txt');
    const robotsOk = robotsRes.status === 200 && robotsRes.data.includes('User-agent');

    // 5. Check sitemap.xml
    console.log("Testing sitemap.xml...");
    const sitemapRes = await fetchUrl('https://collectibles.uy/sitemap.xml');
    const sitemapOk = sitemapRes.status === 200 && sitemapRes.data.includes('<urlset');
    
    let sitemapHasOptimized = false;
    if (sitemapOk) {
       sitemapHasOptimized = sample.some(item => sitemapRes.data.includes(`/p/${item.slug}`));
    }

    const finalResult = {
        sampleSize: 10,
        okCount: report.filter(r => r.status === 'OK').length,
        robotsOk,
        sitemapOk,
        sitemapHasOptimized,
        report
    };

    fs.writeFileSync('audit_results_3d.json', JSON.stringify(finalResult, null, 2));
    console.log("\nAudit complete. Results written to audit_results_3d.json");
}

main().catch(console.error);

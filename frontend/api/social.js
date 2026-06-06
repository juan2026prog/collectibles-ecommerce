import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  try {
    const originalPathUrl = req.query.originalPath;
    if (!originalPathUrl) {
      return res.status(400).send('Missing originalPath');
    }

    const url = new URL(originalPathUrl);
    const pathname = url.pathname;
    
    let title = 'Collectibles Store';
    let description = 'Tu Tienda de Coleccionables Premium';
    let image = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg';
    let urlCanonical = `https://collectibles.uy${pathname}`;
    let jsonLd = '';

    const segments = pathname.split('/').filter(Boolean);
    const type = segments[0];
    const slug = segments[1];

    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    if ((type === 'p' || type === 'producto') && slug) {
      const { data: product } = await supabase
        .from('products')
        .select(`id, title, seo_title, description, seo_description, short_description, base_price, compare_at_price, product_images(url, is_primary), brand:brands(name), category:categories(name)`)
        .eq('slug', slug)
        .single();

      if (product) {
        title = product.seo_title || `${product.title} | Collectibles Uruguay`;
        description = product.seo_description || product.short_description || product.title;
        
        let foundImage = image;
        if (product.product_images && product.product_images.length > 0) {
          const primary = product.product_images.find(img => img.is_primary);
          foundImage = primary ? primary.url : product.product_images[0].url;
        }
        image = foundImage.startsWith('http') ? foundImage : `${supabaseUrl}/storage/v1/object/public/products/${foundImage}`;
        
        const finalPrice = product.compare_at_price > 0 ? product.compare_at_price : product.base_price;

        const productSchema = {
          "@context": "https://schema.org/",
          "@type": "Product",
          "name": title,
          "image": [image],
          "description": description,
          "sku": product.id,
          "brand": { "@type": "Brand", "name": product.brand?.name || "Generic" },
          "url": urlCanonical,
          "offers": {
            "@type": "Offer",
            "url": urlCanonical,
            "priceCurrency": "UYU",
            "price": finalPrice || 0,
            "availability": "https://schema.org/InStock",
            "itemCondition": "https://schema.org/NewCondition",
            "seller": { "@type": "Organization", "name": "Collectibles Uruguay" }
          }
        };
        jsonLd = JSON.stringify(productSchema);
      }
    } else if (type === 'categoria' && slug) {
      const { data: category } = await supabase.from('categories').select('name, description, seo_title, seo_description, image_url').eq('slug', slug).single();
      if (category) {
        title = category.seo_title || `${category.name} | Collectibles Uruguay`;
        description = category.seo_description || category.description || `Explora nuestra colección de ${category.name}`;
        image = category.image_url ? (category.image_url.startsWith('http') ? category.image_url : `${supabaseUrl}/storage/v1/object/public/categories/${category.image_url}`) : image;
      }
    } else if (type === 'marca' && slug) {
      const { data: brand } = await supabase.from('brands').select('name, description, seo_title, seo_description, logo_url').eq('slug', slug).single();
      if (brand) {
        title = brand.seo_title || `${brand.name} | Collectibles Uruguay`;
        description = brand.seo_description || brand.description || `Coleccionables de ${brand.name}`;
        image = brand.logo_url ? (brand.logo_url.startsWith('http') ? brand.logo_url : `${supabaseUrl}/storage/v1/object/public/brands/${brand.logo_url}`) : image;
      }
    }

    const safeTitle = escapeHtml(title);
    const safeDesc = escapeHtml(description);

    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}">
  <link rel="canonical" href="${urlCanonical}">
  
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Collectibles Store">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:url" content="${urlCanonical}">
  <meta property="og:image" content="${image}">
  
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${image}">
  
  ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body>
  <div style="display:none">
    <h1>${safeTitle}</h1>
    <p>${safeDesc}</p>
    <img src="${image}" alt="${safeTitle}">
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(200).send(html);
  } catch (error) {
    console.error('Social API Error:', error);
    res.status(500).send('Internal Server Error');
  }
}

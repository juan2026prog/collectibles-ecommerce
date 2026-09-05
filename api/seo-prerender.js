import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://collectibles.uy';

function cleanText(str) {
  if (!str) return '';
  return String(str).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateCanonical(type, slug) {
  if (type === 'home' || !type) return BASE_URL;
  if (type === 'shop') return `${BASE_URL}/shop`;
  if (type === 'licencias' || type === 'licenses') return `${BASE_URL}/licencias`;
  if (type === 'themes' || type === 'temas') return `${BASE_URL}/themes`;
  if (type === 'producto' || type === 'product') return `${BASE_URL}/producto/${slug}`;
  if (type === 'categoria' || type === 'category') return `${BASE_URL}/categoria/${slug}`;
  if (type === 'marca' || type === 'brand') return `${BASE_URL}/marca/${slug}`;
  if (type === 'page') return `${BASE_URL}/page/${slug}`;
  if (type === 'static') return `${BASE_URL}/${slug}`;
  return `${BASE_URL}/${slug || ''}`;
}

function generateMetaTitle(type, name) {
  if (type === 'home' || !type) return 'Juguetes Retro Uruguay & Coleccionables | Collectibles Store';
  if (type === 'shop') return 'Catálogo de Coleccionables en Uruguay | Collectibles';
  if (type === 'licencias') return 'Licencias Oficiales de Coleccionables | Collectibles Uruguay';
  if (type === 'themes') return 'Universos y Temas Geek | Collectibles Uruguay';
  if (type === 'producto' || type === 'product') return `${name} | Collectibles Uruguay`;
  if (type === 'marca' || type === 'brand') return `${name} en Uruguay | Collectibles`;
  if (type === 'categoria' || type === 'category') return `${name} en Uruguay | Collectibles`;
  if (type === 'static' || type === 'page') return `${name} | Collectibles`;
  return `${name} | Collectibles Uruguay`;
}

function generateMetaDescription(type, rawDesc, name) {
  const cleaned = cleanText(rawDesc);
  if (cleaned && cleaned.length > 10) {
    return cleaned.length > 160 ? cleaned.slice(0, 157) + '...' : cleaned;
  }

  if (type === 'home' || !type) {
    return 'Tu tienda N°1 de juguetes retro en Uruguay, figuras vintage, cartas de colección, merchandising geek y figuras de acción. Envíos a todo el país.';
  }
  if (type === 'shop') {
    return 'Explora nuestro catálogo completo de figuras de acción, Funkos, cómics y coleccionables en Uruguay.';
  }
  if (type === 'licencias') {
    return 'Explora todas las franquicias y licencias oficiales disponibles en Collectibles Uruguay: Marvel, Star Wars, DC Comics, Funko, Disney y más.';
  }
  if (type === 'themes') {
    return 'Descubre coleccionables por universo, temática y sagas: Anime, Terror, Cine, Series, Deportes y Gaming en Collectibles Uruguay.';
  }
  if (type === 'producto' || type === 'product') {
    return `Comprar ${name} en Collectibles Uruguay. Envíos a todo el país.`;
  }
  if (type === 'categoria' || type === 'category') {
    return `Explora nuestra colección de ${name} en Collectibles Uruguay. Figuras de colección y merchandising con envíos a todo el país.`;
  }
  if (type === 'marca' || type === 'brand') {
    return `Comprar productos oficiales de ${name} en Collectibles Uruguay. Figuras y coleccionables con envíos a todo el país.`;
  }
  return `Collectibles Uruguay - ${name}`;
}

function generateBreadcrumbs(type, entity) {
  const itemListElement = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Inicio',
      item: `${BASE_URL}/`
    }
  ];

  if (type === 'shop') {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Catálogo',
      item: `${BASE_URL}/shop`
    });
  } else if ((type === 'categoria' || type === 'category') && entity && entity.slug) {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: entity.name || 'Categoría',
      item: `${BASE_URL}/categoria/${entity.slug}`
    });
  } else if ((type === 'marca' || type === 'brand') && entity && entity.slug) {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: entity.name || 'Marca',
      item: `${BASE_URL}/marca/${entity.slug}`
    });
  } else if ((type === 'producto' || type === 'product') && entity) {
    let currentPos = 2;
    if (entity.category && entity.category.slug && entity.category.name) {
      itemListElement.push({
        '@type': 'ListItem',
        position: currentPos,
        name: entity.category.name,
        item: `${BASE_URL}/categoria/${entity.category.slug}`
      });
      currentPos++;
    }
    itemListElement.push({
      '@type': 'ListItem',
      position: currentPos,
      name: entity.title || entity.name,
      item: `${BASE_URL}/producto/${entity.slug}`
    });
  } else if (type === 'static' || type === 'page') {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: entity.name || 'Página',
      item: `${BASE_URL}/${entity.path || entity.slug}`
    });
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement
  };
}

function validateGtin(gtin) {
  if (!gtin) return null;
  const str = String(gtin).trim();
  if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(str)) {
    return str;
  }
  return null;
}

function generateProductSchema(product, brand, category, images) {
  const canonicalUrl = `${BASE_URL}/producto/${product.slug}`;
  const description = generateMetaDescription('producto', product.description || product.short_description || product.seo_description, product.title);
  
  const mainImage = (images && images.length > 0)
    ? (images.find(img => img.is_primary)?.url || images[0].url || images[0])
    : 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg';

  const imageUrls = (images && images.length > 0)
    ? images.map(i => (typeof i === 'string' ? i : i.url))
    : [mainImage];

  const currency = product.currency || 'UYU';
  const price = Number(product.base_price || 0);

  let availability = 'https://schema.org/InStock';
  if (product.stock_quantity === 0 || product.is_out_of_stock) {
    availability = 'https://schema.org/OutOfStock';
  } else if (product.is_preorder) {
    availability = 'https://schema.org/PreOrder';
  }

  let condition = 'https://schema.org/NewCondition';
  if (product.condition) {
    const cLower = String(product.condition).toLowerCase();
    if (cLower.includes('usad') || cLower.includes('used')) {
      condition = 'https://schema.org/UsedCondition';
    }
  }

  const shippingPrice = price >= 4000 ? 0 : 350;

  const schema = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    'name': product.title,
    'description': description,
    'image': imageUrls,
    'sku': product.id,
    'url': canonicalUrl,
    'offers': {
      '@type': 'Offer',
      'price': price,
      'priceCurrency': currency,
      'availability': availability,
      'itemCondition': condition,
      'url': canonicalUrl,
      'shippingDetails': {
        '@type': 'OfferShippingDetails',
        'shippingDestination': {
          '@type': 'DefinedRegion',
          'addressCountry': 'UY'
        },
        'shippingRate': {
          '@type': 'MonetaryAmount',
          'value': shippingPrice,
          'currency': currency
        },
        'deliveryTime': {
          '@type': 'ShippingDeliveryTime',
          'handlingTime': {
            '@type': 'QuantitativeValue',
            'minValue': 0,
            'maxValue': 1,
            'unitCode': 'DAY'
          },
          'transitTime': {
            '@type': 'QuantitativeValue',
            'minValue': 1,
            'maxValue': 3,
            'unitCode': 'DAY'
          }
        }
      },
      'hasMerchantReturnPolicy': {
        '@type': 'MerchantReturnPolicy',
        'applicableCountry': 'UY',
        'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
        'merchantReturnDays': 5,
        'returnMethod': 'https://schema.org/ReturnByMail',
        'returnFees': 'https://schema.org/ReturnShippingFees',
        'refundType': 'https://schema.org/FullRefund',
        'merchantReturnLink': `${BASE_URL}/page/envios-devoluciones`
      }
    }
  };

  if (brand && (brand.name || typeof brand === 'string')) {
    schema.brand = {
      '@type': 'Brand',
      'name': typeof brand === 'string' ? brand : brand.name
    };
  }

  const rawGtin = product.metadata?.gtin || product.metadata?.ean || product.gtin || product.ean;
  const validGtin = validateGtin(rawGtin);
  if (validGtin) {
    if (validGtin.length === 8) schema.gtin8 = validGtin;
    else if (validGtin.length === 12) schema.gtin12 = validGtin;
    else if (validGtin.length === 13) schema.gtin13 = validGtin;
    else if (validGtin.length === 14) schema.gtin14 = validGtin;
    else schema.gtin = validGtin;
  }

  return schema;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function getBaseTemplate() {
  const possiblePaths = [
    path.join(process.cwd(), 'frontend', 'dist', 'index.html'),
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(process.cwd(), 'frontend', 'index.html'),
    path.join(process.cwd(), 'index.html')
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    } catch (e) {
      // Ignore
    }
  }

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Collectibles Uruguay</title>
    <meta name="robots" content="index, follow" />
    <link rel="icon" type="image/jpeg" href="https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}

function renderNotFoundPage(res, htmlTemplate, type, slug) {
  let renderedHtml = htmlTemplate || getBaseTemplate();
  const canonicalUrl = `${BASE_URL}/${type}/${slug}`;
  const notFoundTitle = 'Página no encontrada | Collectibles Uruguay';

  renderedHtml = renderedHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(notFoundTitle)}</title>`);
  renderedHtml = renderedHtml.replace(/<meta[^>]*name=["']robots["'][^>]*\/?>/i, '<meta name="robots" content="noindex, follow" />');
  
  if (renderedHtml.includes('rel="canonical"')) {
    renderedHtml = renderedHtml.replace(/<link[^>]*rel=["']canonical["'][^>]*href=["'][\s\S]*?["'][^>]*\/?>/i, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`);
  } else {
    renderedHtml = renderedHtml.replace('</head>', `  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />\n</head>`);
  }

  const notFoundBody = `
    <div style="padding: 40px 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; text-align: center;">
      <h1 style="font-size: 36px; font-weight: bold; color: #ef4444; margin-bottom: 15px;">404 - Página No Encontrada</h1>
      <p style="font-size: 18px; color: #4b5563; margin-bottom: 25px;">El elemento solicitado ("${escapeHtml(slug)}") no existe o ha sido despublicado.</p>
      <a href="${BASE_URL}/shop" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Ver Catálogo de Productos</a>
    </div>
  `;

  if (renderedHtml.includes('<div id="root"></div>')) {
    renderedHtml = renderedHtml.replace('<div id="root"></div>', `<div id="root">${notFoundBody}</div>`);
  } else if (renderedHtml.includes('<div id="root">')) {
    renderedHtml = renderedHtml.replace(/<div id="root">[\s\S]*?<\/div>/i, `<div id="root">${notFoundBody}</div>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.status(404).send(renderedHtml);
}

function extractMluId(rawSlug) {
  if (!rawSlug) return null;
  const match = String(rawSlug).match(/(MLU\s*[-_]?\s*\d+)/i);
  if (match) {
    return match[1].toUpperCase().replace(/[-_\s]/g, '');
  }
  return null;
}

async function resolveCanonicalProduct(slug) {
  if (!slug) return null;

  const selectFields = `
    id,
    title,
    slug,
    description,
    short_description,
    base_price,
    compare_at_price,
    is_active,
    status,
    category_id,
    brand_id,
    seo_title,
    seo_description,
    meta_title,
    meta_description,
    metadata,
    ml_item_id
  `;

  // Layer 1: Direct match on products.slug
  const { data: directProduct } = await supabase
    .from('products')
    .select(selectFields)
    .eq('slug', slug)
    .maybeSingle();

  if (directProduct && directProduct.is_active && directProduct.status === 'published') {
    return { product: directProduct, isRedirect: false, canonicalSlug: directProduct.slug };
  }

  // Layer 2: Match on product_slug_redirects.old_slug
  const { data: redirect } = await supabase
    .from('product_slug_redirects')
    .select('new_slug, product_id')
    .eq('old_slug', slug)
    .maybeSingle();

  if (redirect?.new_slug) {
    const { data: redirectedProduct } = await supabase
      .from('products')
      .select(selectFields)
      .eq('slug', redirect.new_slug)
      .maybeSingle();

    if (redirectedProduct && redirectedProduct.is_active && redirectedProduct.status === 'published') {
      return { product: redirectedProduct, isRedirect: true, canonicalSlug: redirectedProduct.slug };
    }
  }

  // Layer 3: Match on products.ml_item_id or extracted MLU ID
  const mluId = extractMluId(slug);
  if (mluId) {
    const { data: mluProduct } = await supabase
      .from('products')
      .select(selectFields)
      .eq('ml_item_id', mluId)
      .maybeSingle();

    if (mluProduct && mluProduct.is_active && mluProduct.status === 'published') {
      return { product: mluProduct, isRedirect: true, canonicalSlug: mluProduct.slug };
    }
  }

  // Layer 4: Match on products.id (UUID)
  const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(slug);
  if (isUUID) {
    const { data: uuidProduct } = await supabase
      .from('products')
      .select(selectFields)
      .eq('id', slug)
      .maybeSingle();

    if (uuidProduct && uuidProduct.is_active && uuidProduct.status === 'published') {
      return { product: uuidProduct, isRedirect: true, canonicalSlug: uuidProduct.slug };
    }
  }

  return null;
}

export default async function handler(req, res) {
  try {
    let { type, slug } = req.query || {};
    const reqUrl = req.url || '';
    const xForwardedUri = req.headers?.['x-forwarded-uri'] || req.headers?.['x-matched-path'] || '';
    const combinedUri = (reqUrl + ' ' + xForwardedUri).toLowerCase();

    // Extract type & slug from URI if query parameters are missing from Vercel rewrite
    if (!type || !slug) {
      if (combinedUri.includes('/marca/')) {
        type = 'marca';
        const match = combinedUri.match(/\/marca\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/categoria/')) {
        type = 'categoria';
        const match = combinedUri.match(/\/categoria\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/producto/')) {
        type = 'producto';
        const match = combinedUri.match(/\/producto\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/product/')) {
        type = 'product';
        const match = combinedUri.match(/\/product\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/p/')) {
        type = 'p';
        const match = combinedUri.match(/\/p\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/page/')) {
        type = 'page';
        const match = combinedUri.match(/\/page\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/licencias')) {
        type = 'licencias';
      } else if (combinedUri.includes('/themes') || combinedUri.includes('/temas')) {
        type = 'themes';
      } else if (combinedUri.includes('/contact')) {
        type = 'page';
        slug = 'contact';
      } else if (combinedUri.includes('/shop')) {
        type = 'shop';
      } else if (combinedUri.includes('type=home') || reqUrl === '/' || xForwardedUri === '/') {
        type = 'home';
      }
    }

    let htmlTemplate = getBaseTemplate();

    let title = generateMetaTitle('home');
    let description = generateMetaDescription('home');
    let canonical = generateCanonical('home');
    let ogType = 'website';
    let ogImage = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg';
    let jsonLdScripts = [];
    let bodyContent = '';

    if ((type === 'producto' || type === 'product' || type === 'p') && slug) {
      const resolved = await resolveCanonicalProduct(slug);

      if (!resolved || !resolved.product) {
        return renderNotFoundPage(res, htmlTemplate, 'producto', slug);
      }

      const { product, isRedirect, canonicalSlug } = resolved;

      // Rule: If legacy route (/p/ or /product/) OR if requested slug is different from canonicalSlug -> 301 Redirect!
      if (type === 'p' || type === 'product' || isRedirect || slug !== canonicalSlug) {
        res.setHeader('Location', `${BASE_URL}/producto/${canonicalSlug}`);
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        return res.status(301).end();
      }

      const [{ data: images }, { data: category }, { data: brand }, { data: related }] = await Promise.all([
        supabase.from('product_images').select('url, alt_text, is_primary').eq('product_id', product.id).order('sort_order', { ascending: true }),
        product.category_id ? supabase.from('categories').select('name, slug').eq('id', product.category_id).maybeSingle() : Promise.resolve({ data: null }),
        product.brand_id ? supabase.from('brands').select('name, slug').eq('id', product.brand_id).maybeSingle() : Promise.resolve({ data: null }),
        product.category_id ? supabase.from('products').select('title, slug, base_price').eq('category_id', product.category_id).eq('is_active', true).eq('status', 'published').neq('id', product.id).limit(6) : Promise.resolve({ data: [] })
      ]);

      const prodTitle = product.seo_title || product.meta_title || product.title;
      title = generateMetaTitle('producto', prodTitle);
      description = generateMetaDescription('producto', product.seo_description || product.meta_description || product.description || product.short_description, product.title);
      canonical = generateCanonical('producto', product.slug);
      ogType = 'product';

      const mainImage = (images && images.length > 0) ? (images.find(img => img.is_primary)?.url || images[0].url) : ogImage;
      ogImage = mainImage;

      const productSchema = generateProductSchema(product, brand, category, images);
      const breadcrumbSchema = generateBreadcrumbs('producto', { ...product, category, brand });

      jsonLdScripts.push(productSchema);
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; 
            ${category ? `<a href="${BASE_URL}/categoria/${category.slug}">${escapeHtml(category.name)}</a> &gt; ` : ''}
            <span>${escapeHtml(product.title)}</span>
          </nav>
          <article>
            <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">${escapeHtml(product.title)}</h1>
            ${brand ? `<p><strong>Marca:</strong> <a href="${BASE_URL}/marca/${brand.slug}">${escapeHtml(brand.name)}</a></p>` : ''}
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 15px;">
              <div>
                <img src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.title)}" style="max-width: 400px; width: 100%; height: auto; border-radius: 8px;" />
              </div>
              <div style="flex: 1; min-width: 280px;">
                <p style="font-size: 24px; color: #16a34a; font-weight: bold;">$${product.base_price} UYU</p>
                <p style="margin-top: 15px; line-height: 1.6;">${escapeHtml(description)}</p>
              </div>
            </div>
          </article>
          ${related && related.length > 0 ? `
            <section style="margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
              <h2 style="font-size: 20px; font-weight: bold;">Productos Relacionados</h2>
              <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
                ${related.map(r => `
                  <li style="border: 1px solid #eee; padding: 10px; border-radius: 6px;">
                    <a href="${BASE_URL}/producto/${r.slug}" style="text-decoration: none; color: #2563eb; font-weight: 500;">${escapeHtml(r.title)}</a>
                    <p style="color: #16a34a; margin-top: 5px;">$${r.base_price} UYU</p>
                  </li>
                `).join('')}
              </ul>
            </section>
          ` : ''}
        </div>
      `;

    } else if (type === 'categoria' && slug) {
      const { data: category } = await supabase
        .from('categories')
        .select('id, name, slug, is_active, status')
        .eq('slug', slug)
        .maybeSingle();

      if (!category || !category.is_active || category.status !== 'approved') {
        return renderNotFoundPage(res, htmlTemplate, 'categoria', slug);
      }

      title = generateMetaTitle('categoria', category.name);
      description = generateMetaDescription('categoria', null, category.name);
      canonical = generateCanonical('categoria', category.slug);

      const breadcrumbSchema = generateBreadcrumbs('categoria', category);
      jsonLdScripts.push(breadcrumbSchema);

      const { data: catProducts } = await supabase
        .from('products')
        .select('title, slug, base_price')
        .eq('category_id', category.id)
        .eq('is_active', true)
        .eq('status', 'published')
        .limit(16);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>${escapeHtml(category.name)}</span>
          </nav>
          <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">${escapeHtml(category.name)} en Uruguay</h1>
          <p>${escapeHtml(description)}</p>
          ${catProducts && catProducts.length > 0 ? `
            <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; margin-top: 20px;">
              ${catProducts.map(p => `
                <li style="border: 1px solid #eee; padding: 12px; border-radius: 6px;">
                  <a href="${BASE_URL}/producto/${p.slug}" style="text-decoration: none; color: #2563eb; font-weight: bold;">${escapeHtml(p.title)}</a>
                  <p style="color: #16a34a; font-weight: 600; margin-top: 5px;">$${p.base_price} UYU</p>
                </li>
              `).join('')}
            </ul>
          ` : '<p>No hay productos disponibles en esta categoría actualmente.</p>'}
        </div>
      `;

    } else if (type === 'marca' && slug) {
      const { data: brand } = await supabase
        .from('brands')
        .select('id, name, slug, description, is_active, status')
        .eq('slug', slug)
        .maybeSingle();

      if (!brand || !brand.is_active || brand.status !== 'approved') {
        return renderNotFoundPage(res, htmlTemplate, 'marca', slug);
      }

      title = generateMetaTitle('marca', brand.name);
      description = generateMetaDescription('marca', brand.description, brand.name);
      canonical = generateCanonical('marca', brand.slug);

      const breadcrumbSchema = generateBreadcrumbs('marca', brand);
      jsonLdScripts.push(breadcrumbSchema);

      const { data: brandProducts } = await supabase
        .from('products')
        .select('title, slug, base_price')
        .eq('brand_id', brand.id)
        .eq('is_active', true)
        .eq('status', 'published')
        .limit(16);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>${escapeHtml(brand.name)}</span>
          </nav>
          <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">${escapeHtml(brand.name)} en Uruguay</h1>
          <p>${escapeHtml(description)}</p>
          ${brandProducts && brandProducts.length > 0 ? `
            <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; margin-top: 20px;">
              ${brandProducts.map(p => `
                <li style="border: 1px solid #eee; padding: 12px; border-radius: 6px;">
                  <a href="${BASE_URL}/producto/${p.slug}" style="text-decoration: none; color: #2563eb; font-weight: bold;">${escapeHtml(p.title)}</a>
                  <p style="color: #16a34a; font-weight: 600; margin-top: 5px;">$${p.base_price} UYU</p>
                </li>
              `).join('')}
            </ul>
          ` : '<p>No hay productos disponibles de esta marca actualmente.</p>'}
        </div>
      `;

    } else if (type === 'static' || type === 'page') {
      const pageSlug = slug || '';
      const pageTitles = {
        'nosotros': 'Nosotros',
        'terminos': 'Términos y Condiciones',
        'pol-ticas-de-privacidad': 'Políticas de Privacidad',
        'condiciones-de-compra': 'Condiciones de Compra',
        'envios-devoluciones': 'Envíos y Devoluciones',
        'contact': 'Contacto'
      };
      const pageName = pageTitles[pageSlug] || pageSlug || 'Página';
      title = generateMetaTitle('static', pageName);
      description = generateMetaDescription('static', null, pageName);
      canonical = generateCanonical('static', pageSlug.startsWith('page/') ? pageSlug : (pageSlug === 'contact' ? 'contact' : `page/${pageSlug}`));

      const breadcrumbSchema = generateBreadcrumbs('static', { name: pageName, path: canonical.replace(`${BASE_URL}/`, '') });
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>${escapeHtml(pageName)}</span>
          </nav>
          <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">${escapeHtml(pageName)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
      `;

    } else if (type === 'licencias') {
      title = generateMetaTitle('licencias');
      description = generateMetaDescription('licencias');
      canonical = generateCanonical('licencias');

      const breadcrumbSchema = generateBreadcrumbs('static', { name: 'Licencias Oficiales', path: 'licencias' });
      jsonLdScripts.push(breadcrumbSchema);

      const { data: allLicenses } = await supabase
        .from('licenses')
        .select('name, slug')
        .eq('is_active', true)
        .order('name', { ascending: true });

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>Licencias Oficiales</span>
          </nav>
          <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">Licencias y Franquicias Oficiales</h1>
          <p>${escapeHtml(description)}</p>
          ${allLicenses && allLicenses.length > 0 ? `
            <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 20px;">
              ${allLicenses.map(l => `
                <li style="border: 1px solid #eee; padding: 12px; border-radius: 6px;">
                  <a href="${BASE_URL}/licencias/${l.slug}" style="text-decoration: none; color: #2563eb; font-weight: 600;">${escapeHtml(l.name)}</a>
                </li>
              `).join('')}
            </ul>
          ` : ''}
        </div>
      `;

    } else if (type === 'themes') {
      title = generateMetaTitle('themes');
      description = generateMetaDescription('themes');
      canonical = generateCanonical('themes');

      const breadcrumbSchema = generateBreadcrumbs('static', { name: 'Temas y Universos', path: 'themes' });
      jsonLdScripts.push(breadcrumbSchema);

      const { data: allThemes } = await supabase
        .from('themes')
        .select('name, slug')
        .eq('is_active', true)
        .order('name', { ascending: true });

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>Temas y Universos</span>
          </nav>
          <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">Temas y Universos Geek</h1>
          <p>${escapeHtml(description)}</p>
          ${allThemes && allThemes.length > 0 ? `
            <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 20px;">
              ${allThemes.map(t => `
                <li style="border: 1px solid #eee; padding: 12px; border-radius: 6px;">
                  <a href="${BASE_URL}/themes/${t.slug}" style="text-decoration: none; color: #2563eb; font-weight: 600;">${escapeHtml(t.name)}</a>
                </li>
              `).join('')}
            </ul>
          ` : ''}
        </div>
      `;

    } else if (type === 'shop') {
      title = generateMetaTitle('shop');
      description = generateMetaDescription('shop');
      canonical = generateCanonical('shop');

      const breadcrumbSchema = generateBreadcrumbs('shop');
      jsonLdScripts.push(breadcrumbSchema);

      const { data: shopProducts } = await supabase
        .from('products')
        .select('title, slug, base_price')
        .eq('is_active', true)
        .eq('status', 'published')
        .limit(20);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">Catálogo de Coleccionables en Uruguay</h1>
          <p>${escapeHtml(description)}</p>
          ${shopProducts && shopProducts.length > 0 ? `
            <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; margin-top: 20px;">
              ${shopProducts.map(p => `
                <li style="border: 1px solid #eee; padding: 12px; border-radius: 6px;">
                  <a href="${BASE_URL}/producto/${p.slug}" style="text-decoration: none; color: #2563eb; font-weight: bold;">${escapeHtml(p.title)}</a>
                  <p style="color: #16a34a; font-weight: 600; margin-top: 5px;">$${p.base_price} UYU</p>
                </li>
              `).join('')}
            </ul>
          ` : ''}
        </div>
      `;

    } else if (type === 'home' || reqUrl === '/' || combinedUri.includes('type=home')) {
      // HOME
      title = generateMetaTitle('home');
      description = generateMetaDescription('home');
      canonical = generateCanonical('home');

      const [{ data: featuredProducts }, { data: topCategories }, { data: topBrands }] = await Promise.all([
        supabase.from('products').select('title, slug, base_price').eq('is_active', true).eq('status', 'published').limit(12),
        supabase.from('categories').select('name, slug').eq('is_active', true).eq('status', 'approved').limit(10),
        supabase.from('brands').select('name, slug').eq('is_active', true).eq('status', 'approved').limit(10)
      ]);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">Juguetes, Figuras y Coleccionables en Uruguay</h1>
          <p>${escapeHtml(description)}</p>
          
          ${topCategories && topCategories.length > 0 ? `
            <section style="margin-top: 30px;">
              <h2 style="font-size: 20px; font-weight: bold;">Categorías Principales</h2>
              <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
                ${topCategories.map(c => `<a href="${BASE_URL}/categoria/${c.slug}" style="padding: 6px 12px; background: #f3f4f6; border-radius: 20px; text-decoration: none; color: #374151; font-weight: 500;">${escapeHtml(c.name)}</a>`).join('')}
              </div>
            </section>
          ` : ''}

          ${topBrands && topBrands.length > 0 ? `
            <section style="margin-top: 30px;">
              <h2 style="font-size: 20px; font-weight: bold;">Marcas Destacadas</h2>
              <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
                ${topBrands.map(b => `<a href="${BASE_URL}/marca/${b.slug}" style="padding: 6px 12px; background: #eef2ff; border-radius: 20px; text-decoration: none; color: #4f46e5; font-weight: 500;">${escapeHtml(b.name)}</a>`).join('')}
              </div>
            </section>
          ` : ''}

          ${featuredProducts && featuredProducts.length > 0 ? `
            <section style="margin-top: 30px;">
              <h2 style="font-size: 20px; font-weight: bold;">Productos Destacados</h2>
              <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; margin-top: 15px;">
                ${featuredProducts.map(p => `
                  <li style="border: 1px solid #eee; padding: 12px; border-radius: 6px;">
                    <a href="${BASE_URL}/producto/${p.slug}" style="text-decoration: none; color: #2563eb; font-weight: bold;">${escapeHtml(p.title)}</a>
                    <p style="color: #16a34a; font-weight: 600; margin-top: 5px;">$${p.base_price} UYU</p>
                  </li>
                `).join('')}
              </ul>
            </section>
          ` : ''}
        </div>
      `;
    } else {
      // Unknown internal route -> 404
      return renderNotFoundPage(res, htmlTemplate, 'page', slug || 'not-found');
    }

    // Replace Head elements
    let renderedHtml = htmlTemplate;

    // 1. Title
    renderedHtml = renderedHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);

    // 2. Meta description
    if (renderedHtml.includes('name="description"')) {
      renderedHtml = renderedHtml.replace(/<meta[^>]*name=["']description["'][^>]*content=["'][\s\S]*?["'][^>]*\/?>/i, `<meta name="description" content="${escapeHtml(description)}" />`);
    } else {
      renderedHtml = renderedHtml.replace('</head>', `  <meta name="description" content="${escapeHtml(description)}" />\n</head>`);
    }

    // 3. Canonical
    if (renderedHtml.includes('rel="canonical"')) {
      renderedHtml = renderedHtml.replace(/<link[^>]*rel=["']canonical["'][^>]*href=["'][\s\S]*?["'][^>]*\/?>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`);
    } else {
      renderedHtml = renderedHtml.replace('</head>', `  <link rel="canonical" href="${escapeHtml(canonical)}" />\n</head>`);
    }

    // 4. OpenGraph Tags
    const ogTagsHtml = `
  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="Collectibles Store Uruguay" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
    `;

    renderedHtml = renderedHtml.replace(/<meta[^>]*property=["']og:[^"']+["'][^>]*\/?>/gi, '');
    renderedHtml = renderedHtml.replace('</head>', `${ogTagsHtml}\n</head>`);

    // 5. JSON-LD Schemas
    if (jsonLdScripts.length > 0) {
      const scriptsHtml = jsonLdScripts.map(s => `  <script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`).join('\n');
      renderedHtml = renderedHtml.replace('</head>', `${scriptsHtml}\n</head>`);
    }

    // 6. Body Content in <div id="root"> (Only for Search Crawlers and Social Bots to avoid hydration flash in browsers)
    const userAgent = (req.headers && (req.headers['user-agent'] || req.headers['User-Agent'])) || '';
    const isBrowser = /Mozilla\/5\.0.*(Chrome|Safari|Firefox|Edge|Mobile|Opera)/i.test(userAgent) && !/Googlebot|bingbot|Baiduspider|facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|TelegramBot|Discordbot|rogerbot|outbrain|pinterest|slackbot|vkshare|w3c_validator/i.test(userAgent);
    const isBot = !isBrowser;

    if (isBot && bodyContent) {
      if (renderedHtml.includes('<div id="root"></div>')) {
        renderedHtml = renderedHtml.replace('<div id="root"></div>', `<div id="root">${bodyContent}</div>`);
      } else if (renderedHtml.includes('<div id="root">')) {
        renderedHtml = renderedHtml.replace(/<div id="root">[\s\S]*?<\/div>/i, `<div id="root">${bodyContent}</div>`);
      }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (isBot) {
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    res.status(200).send(renderedHtml);
  } catch (error) {
    console.error('Error in SEO Prerender handler:', error);
    res.status(500).send('Server Error');
  }
}

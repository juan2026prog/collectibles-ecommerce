export const BASE_URL = 'https://collectibles.uy';

export function cleanText(str?: string | null): string {
  if (!str) return '';
  return String(str).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateCanonical(type: string, slug?: string): string {
  if (type === 'home' || !type) return BASE_URL;
  if (type === 'shop') return `${BASE_URL}/shop`;
  if (type === 'producto' || type === 'product') return `${BASE_URL}/producto/${slug}`;
  if (type === 'categoria' || type === 'category') return `${BASE_URL}/categoria/${slug}`;
  if (type === 'marca' || type === 'brand') return `${BASE_URL}/marca/${slug}`;
  if (type === 'page') return `${BASE_URL}/page/${slug}`;
  if (type === 'static') return `${BASE_URL}/${slug}`;
  return `${BASE_URL}/${slug || ''}`;
}

export function generateMetaTitle(type: string, name?: string): string {
  if (type === 'home' || !type) return 'Juguetes, Figuras y Coleccionables en Uruguay | Collectibles';
  if (type === 'shop') return 'Catálogo de Coleccionables en Uruguay | Collectibles';
  if (type === 'producto' || type === 'product') return `${name} | Collectibles Uruguay`;
  if (type === 'marca' || type === 'brand') return `${name} en Uruguay | Collectibles`;
  if (type === 'categoria' || type === 'category') return `${name} en Uruguay | Collectibles`;
  if (type === 'static' || type === 'page') return `${name} | Collectibles`;
  return `${name} | Collectibles Uruguay`;
}

export function generateMetaDescription(type: string, rawDesc?: string | null, name?: string): string {
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

export function generateBreadcrumbs(type: string, entity?: any): Record<string, any> {
  const itemListElement: any[] = [
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

export function validateGtin(gtin?: string | null): string | null {
  if (!gtin) return null;
  const str = String(gtin).trim();
  if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(str)) {
    return str;
  }
  return null;
}

export function generateProductSchema(product: any, brand?: any, category?: any, images?: any[]): Record<string, any> {
  const canonicalUrl = `${BASE_URL}/producto/${product.slug}`;
  const description = generateMetaDescription('producto', product.description || product.short_description || product.seo_description, product.title);
  
  const mainImage = (images && images.length > 0)
    ? (images.find(img => img.is_primary)?.url || images[0].url || images[0])
    : 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg';

  const imageUrls = (images && images.length > 0)
    ? images.map(i => (typeof i === 'string' ? i : i.url))
    : [mainImage];

  const currency = product.currency || 'UYU';

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

  const schema: Record<string, any> = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    'name': product.title,
    'description': description,
    'image': imageUrls,
    'sku': product.id,
    'url': canonicalUrl,
    'offers': {
      '@type': 'Offer',
      'price': Number(product.base_price || 0),
      'priceCurrency': currency,
      'availability': availability,
      'itemCondition': condition,
      'url': canonicalUrl
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

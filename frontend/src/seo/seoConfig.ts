export const BASE_URL = 'https://collectibles.uy';

export interface SeoConfig {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  noIndex: boolean;
  type: 'website' | 'article' | 'product';
}

export const SEO_INDEXABILITY = {
  home: true,
  shop: true,
  product: true,
  brand: true,
  category: true,
  academy: true,
  radar: true,
  compare: true,
  licenses: true,
  themes: true,
  page: true,
  contact: true,
  // Non-indexable / Protected / Search / Dynamic query pages
  search: false,
  cart: false,
  checkout: false,
  wishlist: false,
  account: false,
  admin: false,
  vendor: false,
  auth: false,
} as const;

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
  if (type === 'licencias' || type === 'license') return slug ? `${BASE_URL}/licencias/${slug}` : `${BASE_URL}/licencias`;
  if (type === 'themes' || type === 'theme') return slug ? `${BASE_URL}/themes/${slug}` : `${BASE_URL}/themes`;
  if (type === 'producto' || type === 'product' || type === 'p') return `${BASE_URL}/producto/${slug}`;
  if (type === 'categoria' || type === 'category' || type === 'product-category') return `${BASE_URL}/categoria/${slug}`;
  if (type === 'marca' || type === 'brand') return `${BASE_URL}/marca/${slug}`;
  if (type === 'academy') return slug ? `${BASE_URL}/academy/${slug}` : `${BASE_URL}/academy`;
  if (type === 'radar') return slug ? `${BASE_URL}/radar/${slug}` : `${BASE_URL}/radar`;
  if (type === 'releases') return `${BASE_URL}/releases`;
  if (type === 'compare') return `${BASE_URL}/compare`;
  if (type === 'import-hub' || type === 'importhub') return `${BASE_URL}/import-hub`;
  if (type === 'contact') return `${BASE_URL}/contact`;
  if (type === 'page') {
    if (!slug) return `${BASE_URL}/`;
    if (slug === 'contact') return `${BASE_URL}/contact`;
    return `${BASE_URL}/page/${slug.replace(/^page\//, '')}`;
  }
  if (type === 'static') return `${BASE_URL}/${slug}`;
  return `${BASE_URL}/${slug || ''}`;
}

export function generateMetaTitle(type: string, name?: string): string {
  if (type === 'home' || !type) return 'Juguetes Retro Uruguay & Coleccionables | Collectibles Store';
  if (type === 'shop') return 'Catálogo de Coleccionables en Uruguay | Collectibles';
  if (type === 'licencias') return name ? `${name} | Licencias Oficiales | Collectibles Uruguay` : 'Licencias Oficiales de Coleccionables | Collectibles Uruguay';
  if (type === 'themes') return name ? `${name} | Universos Geek | Collectibles Uruguay` : 'Universos y Temas Geek | Collectibles Uruguay';
  if (type === 'producto' || type === 'product' || type === 'p') return `${name} | Collectibles Uruguay`;
  if (type === 'marca' || type === 'brand') return `${name} en Uruguay | Collectibles`;
  if (type === 'categoria' || type === 'category' || type === 'product-category') return `${name} en Uruguay | Collectibles`;
  if (type === 'academy') return name ? `${name} | Collector Academy Uruguay` : 'Collector Academy — Guías de Coleccionismo y Conservación | Collectibles Uruguay';
  if (type === 'radar') return name ? `${name} | Radar de Coleccionables Uruguay` : 'Collectibles Radar — Qué está pasando ahora en coleccionismo | Collectibles Uruguay';
  if (type === 'releases') return 'Calendario de Lanzamientos 2026 / 2027 | Collectibles Uruguay';
  if (type === 'compare') return 'Comparador de Figuras y Coleccionables | Collectibles Uruguay';
  if (type === 'import-hub' || type === 'importhub') return 'Collectibles Import Hub — Casilla y Franquicias en Uruguay';
  if (type === 'contact') return 'Contacto | Collectibles Uruguay';
  if (type === 'static' || type === 'page') return `${name} | Collectibles Uruguay`;
  return `${name} | Collectibles Uruguay`;
}

export function generateMetaDescription(type: string, rawDesc?: string | null, name?: string): string {
  const cleaned = cleanText(rawDesc);
  if (cleaned && cleaned.length > 15) {
    return cleaned.length > 160 ? cleaned.slice(0, 157) + '...' : cleaned;
  }

  if (type === 'home' || !type) {
    return 'Tu tienda N°1 de juguetes retro en Uruguay, figuras vintage, cartas de colección, merchandising geek y figuras de acción. Envíos a todo el país.';
  }
  if (type === 'shop') {
    return 'Explora nuestro catálogo completo de figuras de acción, Funkos, cómics y coleccionables en Uruguay con envíos a todo el país.';
  }
  if (type === 'licencias') {
    return name 
      ? `Explora todas las figuras y coleccionables oficiales de ${name} en Collectibles Uruguay. Envíos a todo el país.`
      : 'Explora todas las franquicias y licencias oficiales disponibles en Collectibles Uruguay: Marvel, Star Wars, DC Comics, Funko, Disney y más.';
  }
  if (type === 'themes') {
    return name
      ? `Descubre figuras y coleccionables del universo ${name} en Collectibles Uruguay. Envíos garantizados.`
      : 'Descubre coleccionables por universo, temática y sagas: Anime, Terror, Cine, Series, Deportes y Gaming en Collectibles Uruguay.';
  }
  if (type === 'producto' || type === 'product' || type === 'p') {
    return `Comprar ${name} en Collectibles Uruguay. Pieza 100% oficial con garantía de autenticidad y envíos a todo el país.`;
  }
  if (type === 'categoria' || type === 'category' || type === 'product-category') {
    return `Explora nuestra colección de ${name} en Collectibles Uruguay. Figuras de colección, merchandising oficial y envíos a todo el país.`;
  }
  if (type === 'marca' || type === 'brand') {
    return `Comprar productos oficiales de ${name} en Collectibles Uruguay. Figuras, estatuas y coleccionables con envíos a todo el país.`;
  }
  if (type === 'academy') {
    return name
      ? `Guía editorial: ${name}. Aprende sobre autenticidad, escalas y conservación en Collector Academy.`
      : 'Collector Academy: el portal educativo definitivo para coleccionistas en Uruguay. Guías técnicas sobre escalas, detección de bootlegs y preservación.';
  }
  if (type === 'radar') {
    return name
      ? `Seguimiento de preventa y lanzamiento: ${name} en Collectibles Radar.`
      : 'Seguimiento en tiempo real de preventas cerrando, nuevos anuncios, exclusivos y alta demanda en figuras de colección.';
  }
  if (type === 'releases') {
    return 'Cronograma mensual de lanzamientos de figuras de colección, fechas estimadas de entrega y preórdenes para coleccionistas.';
  }
  if (type === 'compare') {
    return 'Compara especificaciones técnicas de figuras de acción, escalas, puntos de articulación y accesorios cara a cara.';
  }
  if (type === 'import-hub' || type === 'importhub') {
    return 'Calculadora y simulador de costos de importación para coleccionistas en Uruguay bajo el régimen de franquicia USD 200.';
  }
  if (type === 'contact') {
    return 'Contacta con el equipo de Collectibles Uruguay. Atención personalizada por WhatsApp, teléfono y correo electrónico.';
  }
  return `Collectibles Uruguay - ${name || 'Coleccionables y Figuras Oficiales'}`;
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
  } else if ((type === 'licencia' || type === 'licencias') && entity && entity.slug) {
    itemListElement.push(
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Licencias',
        item: `${BASE_URL}/licencias`
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: entity.name || 'Licencia',
        item: `${BASE_URL}/licencias/${entity.slug}`
      }
    );
  } else if ((type === 'theme' || type === 'themes') && entity && entity.slug) {
    itemListElement.push(
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Themes',
        item: `${BASE_URL}/themes`
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: entity.name || 'Theme',
        item: `${BASE_URL}/themes/${entity.slug}`
      }
    );
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
  } else if (type === 'academy') {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Collector Academy',
      item: `${BASE_URL}/academy`
    });
    if (entity && entity.slug) {
      itemListElement.push({
        '@type': 'ListItem',
        position: 3,
        name: entity.title || entity.name,
        item: `${BASE_URL}/academy/${entity.slug}`
      });
    }
  } else if (type === 'radar') {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Radar',
      item: `${BASE_URL}/radar`
    });
    if (entity && entity.slug) {
      itemListElement.push({
        '@type': 'ListItem',
        position: 3,
        name: entity.title || entity.name,
        item: `${BASE_URL}/radar/${entity.slug}`
      });
    }
  } else if (type === 'static' || type === 'page') {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: entity?.name || 'Página',
      item: `${BASE_URL}/${entity?.path || entity?.slug || ''}`
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
    ? (images.find(img => img.is_primary)?.url || images[0].url || (typeof images[0] === 'string' ? images[0] : ''))
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
    if (cLower.includes('usad') || cLower.includes('used') || cLower.includes('loose')) {
      condition = 'https://schema.org/UsedCondition';
    }
  }

  const shippingPrice = price >= 4000 ? 0 : 350;

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

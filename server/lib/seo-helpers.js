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
  if (type === 'producto' || type === 'product') return `${BASE_URL}/producto/${slug}`;
  if (type === 'categoria' || type === 'category') return `${BASE_URL}/categoria/${slug}`;
  if (type === 'marca' || type === 'brand') return `${BASE_URL}/marca/${slug}`;
  if (type === 'page') return `${BASE_URL}/page/${slug}`;
  if (type === 'static') return `${BASE_URL}/${slug}`;
  return `${BASE_URL}/${slug || ''}`;
}

function generateMetaTitle(type, name) {
  if (type === 'home' || !type) return 'Collectibles Uruguay | Figuras de Acción, Funko y Coleccionables';
  if (type === 'shop') return 'Catálogo de Coleccionables en Uruguay | Collectibles';
  if (type === 'ai-search' || type === 'ai_search') return 'Buscador con Inteligencia Artificial para Coleccionistas | Collectibles Uruguay';
  if (type === 'licencias' || type === 'license') return name ? `${name} | Licencias Oficiales | Collectibles Uruguay` : 'Licencias Oficiales de Coleccionables | Collectibles Uruguay';
  if (type === 'themes' || type === 'theme') return name ? `${name} | Universos Geek | Collectibles Uruguay` : 'Universos y Temas Geek | Collectibles Uruguay';
  if (type === 'producto' || type === 'product') return `${name} | Collectibles Uruguay`;
  if (type === 'marca' || type === 'brand') {
    const lower = (name || '').toLowerCase();
    if (lower === 'funko') return 'Funko Pop Uruguay | Figuras y Coleccionables Funko | Collectibles';
    if (lower === 'neca') return 'NECA Uruguay | Figuras de Acción NECA | Collectibles';
    if (lower === 'bandai') return 'Bandai Uruguay | Figuras Anime y Model Kits | Collectibles';
    if (lower.includes('mcfarlane')) return 'McFarlane Toys Uruguay | DC Multiverse y Figuras | Collectibles';
    if (lower === 'hasbro') return 'Hasbro Uruguay | Marvel Legends, Star Wars | Collectibles';
    if (lower.includes('iron studios')) return 'Iron Studios Uruguay | Estatuas de Colección | Collectibles';
    return `${name} en Uruguay | Figuras y Coleccionables | Collectibles`;
  }
  if (type === 'categoria' || type === 'category') {
    const lower = (name || '').toLowerCase();
    if (lower.includes('figura')) return 'Figuras de Acción en Uruguay | NECA, Bandai y más | Collectibles';
    if (lower.includes('funko')) return 'Funko Pop Uruguay | Figuras y Coleccionables | Collectibles';
    if (lower === 'tcg' || lower.includes('carta')) return 'Cartas Coleccionables TCG en Uruguay | Collectibles';
    if (lower.includes('estatua')) return 'Estatuas de Colección en Uruguay | Collectibles';
    return `${name} en Uruguay | Figuras y Coleccionables | Collectibles`;
  }
  if (type === 'static' || type === 'page') return `${name} | Collectibles Uruguay`;
  return `${name} | Collectibles Uruguay`;
}

function generateMetaDescription(type, rawDesc, name) {
  const cleaned = cleanText(rawDesc);
  if (cleaned && cleaned.length > 20) {
    return cleaned.length > 160 ? cleaned.slice(0, 157) + '...' : cleaned;
  }

  if (type === 'home' || !type) {
    return 'Collectibles Uruguay. Figuras de acción, Funko Pop, NECA y coleccionables de tus personajes y franquicias favoritas. Stock local y envíos a todo Uruguay. Figuras que cuentan historias.';
  }
  if (type === 'shop') {
    return 'Explorá nuestro catálogo de figuras de acción, Funko Pop, NECA y coleccionables en Uruguay con stock local y envíos a todo el país.';
  }
  if (type === 'producto' || type === 'product') {
    return `Comprar ${name} en Collectibles Uruguay. Pieza 100% oficial con garantía de autenticidad, stock local y envíos a todo el país.`;
  }
  if (type === 'categoria' || type === 'category') {
    const lower = (name || '').toLowerCase();
    if (lower.includes('figura')) {
      return 'Explorá la mayor colección de figuras de acción en Uruguay: NECA, Bandai, McFarlane, Marvel Legends y más. Figuras originales con envíos a todo el país.';
    }
    if (lower.includes('funko')) {
      return 'Catálogo oficial de Funko Pop en Uruguay. Figuras coleccionables de tus series, películas, anime y videojuegos favoritos con envíos a todo el país.';
    }
    if (lower === 'tcg' || lower.includes('carta')) {
      return 'Cartas coleccionables y TCG en Uruguay: Pokémon, Magic: The Gathering, Yu-Gi-Oh! y accesorios para coleccionistas con envíos a todo el país.';
    }
    return `Explorá nuestra colección de ${name} en Collectibles Uruguay. Figuras de colección, merchandising oficial y envíos a todo el país.`;
  }
  if (type === 'marca' || type === 'brand') {
    const lower = (name || '').toLowerCase();
    if (lower === 'funko') {
      return 'Comprar Funko Pop originales en Uruguay. Gran catálogo de figuras de vinilo Funko, ediciones exclusivas y lanzamientos en Collectibles Uruguay.';
    }
    if (lower === 'neca') {
      return 'Figuras de acción NECA oficiales en Uruguay. Líneas Ultimate, Reel Toys, Terror, Sci-Fi y clásicos del cine con stock y envíos a todo el país.';
    }
    if (lower === 'bandai') {
      return 'Figuras oficiales Bandai, Gunpla y coleccionables de anime en Uruguay. Dragon Ball, One Piece, Saint Seiya y más con envíos a todo el país.';
    }
    return `Comprar productos oficiales de ${name} en Collectibles Uruguay. Figuras, estatuas y coleccionables con stock local y envíos a todo el país.`;
  }
  return `Collectibles Uruguay - ${name || 'Figuras de Acción y Coleccionables'}`;
}

/**
 * Genera el esquema BreadcrumbList cumpliendo estrictamente la regla de Google Search Console:
 * Todo elemento intermedio DEBE incluir el campo 'item' con una URL 200 valida.
 * No se crean niveles huérfanos como "Marcas" o "Categorías" que no posean landing HTTP 200.
 */
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

/**
 * Valida si una cadena es un GTIN/EAN/UPC valido (8, 12, 13 o 14 digitos numericos).
 */
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

  // GTIN Validation
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BASE_URL,
    cleanText,
    escapeHtml,
    generateCanonical,
    generateMetaTitle,
    generateMetaDescription,
    generateBreadcrumbs,
    validateGtin,
    generateProductSchema
  };
}

export {
  BASE_URL,
  cleanText,
  escapeHtml,
  generateCanonical,
  generateMetaTitle,
  generateMetaDescription,
  generateBreadcrumbs,
  validateGtin,
  generateProductSchema
};

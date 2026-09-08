import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://collectibles.uy';

// Curated & static editorial academy guides list (fully indexable 200 OK)
const ACADEMY_ARTICLES_MAP = {
  "como-empezar-coleccion-figuras": {
    title: "Cómo Empezar una Colección sin Comprar Todo lo que Ves",
    excerpt: "Una guía práctica para definir tu colección, controlar el presupuesto y evitar compras impulsivas. El punto de partida de todo coleccionista.",
    type: "INICIO"
  },
  "figuras-accion-vs-estatuas": {
    title: "Figuras de Acción vs Estatuas: ¿Qué Tipo de Colección es para Ti?",
    excerpt: "Articulación, tamaño, materiales y precio: descubre las principales diferencias antes de elegir.",
    type: "GUÍA"
  },
  "el-arte-del-foco-como-elegir-linea-coleccion": {
    title: "El Arte del Foco: Cómo Elegir una Sola Línea y Dominarla sin Dispersarse",
    excerpt: "La dispersión es la enemiga número uno del coleccionista. Descubre cómo definir un foco temático fuerte y dominar una línea con criterio y coherencia visual.",
    type: "INICIO"
  },
  "completismo-vs-curaduria-coleccionismo": {
    title: "Completismo vs Curaduría: Por Qué Intentar Tener Todo Arruina el Disfrute",
    excerpt: "El síndrome de la wave completa genera fatiga y repisas saturadas. Aprende a aplicar curaduría estética para que cada figura destaque como una obra de arte.",
    type: "INICIO"
  },
  "presupuesto-real-coleccionista-costos-ocultos": {
    title: "Presupuesto Real del Coleccionista: Costo Oculto de Envíos, Aduana y Exhibición",
    excerpt: "El precio de la figura es solo la mitad de la historia. Guía financiera para calcular fletes internacionales, franquicias aduaneras, vitrinas y accesorios.",
    type: "COMPRA"
  },
  "sindrome-caja-cerrada-open-box-vs-sellado": {
    title: "El Síndrome de la Caja Cerrada: Debate Definitivo entre Open-Box y Conservación Sellada",
    excerpt: "Analizamos el valor de reventa, degradación del plástico en caja y disfrute personal entre conservar sellado o abrir.",
    type: "INICIO"
  },
  "guia-escalas-figuras-coleccion": {
    title: "Guía de Escalas en Figuras de Colección: de 1:18 a 1:4",
    excerpt: "Aprende qué significan las escalas 1:18, 1:12, 1:10, 1:6 y 1:4, cuánto mide cada figura y cuáles pueden exhibirse juntas.",
    type: "GUÍA"
  },
  "el-salto-a-escala-1-6-requisitos-espacio-vitrinas": {
    title: "El Salto a 1:6: Requisitos de Espacio, Peso y Soporte Antes de Comprar tu Primera Pieza",
    excerpt: "Una figura de 30 cm con metal diecast y base dinámica no entra en cualquier estante. Lo que debes preparar en tu habitación antes de recibir tu primer Hot Toys o InArt.",
    type: "GUÍA"
  },
  "micro-escalas-miniaturas-figuras-1-18-y-1-24": {
    title: "Micro-Escalas y Miniaturas: Guía para Integrar Figuras 1:18 y 1:24 en tu Repisa",
    excerpt: "De Star Wars Vintage Collection a JoyToy Warhammer 40K: el renacimiento de las 3.75 pulgadas.",
    type: "GUÍA"
  },
  "batalla-escala-1-12-import-japones-vs-retail-americano": {
    title: "Batalla en Escala 1:12: Diferencias Reales entre Import Japonés y Retail Americano",
    excerpt: "MAFEX y S.H.Figuarts frente a Marvel Legends y DC Multiverse: comparativa milimétrica de articulación, accesorios, escala real y relación calidad-precio.",
    type: "GUÍA"
  },
  "frontera-18-cm-escala-1-10-mcfarlane-neca": {
    title: "La Frontera de los 18 cm: Por Qué la Escala 1:10 de McFarlane y NECA No Encaja con Todo",
    excerpt: "Las 7 pulgadas tienen una presencia imponente pero generan pesadillas de escala al mezclarse.",
    type: "GUÍA"
  },
  "lineas-entrada-vs-alta-gama-fabricantes-coleccionismo": {
    title: "Líneas de Entrada vs Alta Gama: Bandai Spirits, Good Smile Company y Medicom Explicadas",
    excerpt: "Ichibansho vs Figuarts ZERO, Pop Up Parade vs Scale Figures y MAFEX vs Figma.",
    type: "AUTENTICIDAD"
  },
  "guerra-titanes-1-6-hot-toys-vs-inart-ingenieria": {
    title: "Guerra de Titanes 1:6: Ingeniería de Hot Toys frente a la Silicona y Pelo Enraizado de InArt",
    excerpt: "La revolución del hiperrealismo: articulaciones magnéticas, trajes a medida y ojos móviles independientes.",
    type: "AUTENTICIDAD"
  },
  "como-reconocer-figura-original-bootleg": {
    title: "Cómo Reconocer una Figura Original y Evitar Bootlegs",
    excerpt: "Aprende a identificar señales comunes de falsificaciones y qué revisar antes de comprar.",
    type: "AUTENTICIDAD"
  },
  "mercado-cabezas-custom-escultura-3d-pintura": {
    title: "El Mercado de las Cabezas Custom: Escultura 3D, Pintura a Mano y Licencias no Oficiales",
    excerpt: "El auge del aftermarket artístico: escultores digitales y pintores independientes.",
    type: "AUTENTICIDAD"
  },
  "resinas-estudio-licencia-oficial-vs-garages-custom": {
    title: "El Universo de las Resinas de Estudio: Licencia Oficial frente a Garages No Autorizados",
    excerpt: "Prime 1 Studio, Tsume y XM Studios frente a los estudios independientes sin licencia.",
    type: "AUTENTICIDAD"
  },
  "materiales-figuras-pvc-abs-resina-diecast": {
    title: "PVC, ABS, Resina y Die-Cast: Materiales de las Figuras Explicados",
    excerpt: "Qué diferencias existen entre PVC, ABS, resina y metal die-cast y cómo afectan peso, detalle y resistencia.",
    type: "MATERIALES"
  },
  "como-cuidar-exhibir-figuras-coleccion": {
    title: "Cómo Cuidar y Exhibir tus Figuras sin Dañarlas",
    excerpt: "Luz, polvo, humedad y temperatura: las reglas esenciales para conservar una colección durante años.",
    type: "CUIDADO"
  },
  "articulaciones-rigidas-clavijas-quebradas-tecnicas-calor": {
    title: "Articulaciones Rígidas y Clavijas Quebradas: Técnicas Seguras con Calor para No Romper Figuras",
    excerpt: "El método del baño de agua caliente a 60°C y el secador de pelo para aflojar articulaciones duras.",
    type: "CUIDADO"
  },
  "articulaciones-flojas-devolver-firmeza-rotulas-sin-pegamento": {
    title: "Articulaciones Flojas y Desgaste: Cómo Devolverle Firmeza a Rótulas y Ball-Joints sin Pegamento",
    excerpt: "El uso correcto de polímeros acrílicos al agua para engrosar rótulas gastadas sin soldar la articulación.",
    type: "CUIDADO"
  },
  "centro-gravedad-balance-posa-dinamica-sin-stands": {
    title: "Centro de Gravedad y Balance: Principios de Posa Dinámica sin Depender de Stands Visibles",
    excerpt: "Línea de acción, distribución del peso en tobillos y rotación de cadera.",
    type: "CUIDADO"
  },
  "cuidado-ropa-tela-cuerina-pleather-evitar-cuarteado": {
    title: "Ropa de Tela y Cuerina (Pleather): Cómo Evitar el Cuarteado y Descascarillado con los Años",
    excerpt: "La hidrólisis en chaquetas de cuerina y trajes de vinilo: productos hidratantes y humedad ideal.",
    type: "MATERIALES"
  },
  "edicion-limitada-exclusive-chase-preorder": {
    title: "Edición Limitada, Exclusive, Chase y Pre-Order: Qué Significan",
    excerpt: "Aprende la diferencia entre edición limitada, exclusiva, chase, preventa y reedición antes de comprar.",
    type: "COMPRA"
  },
  "fomo-aftermarket-reventa-vs-esperar-reissue": {
    title: "El Fenómeno FOMO y el Aftermarket: Cuándo Pagar Precio de Reventa y Cuándo Esperar un Reissue",
    excerpt: "Psicología del mercado coleccionista: análisis de patrones de reedición de Bandai, MAFEX y Hot Toys.",
    type: "COMPRA"
  },
  "preventas-depositos-reserva-ciclo-produccion-retrasos": {
    title: "Preventas y Depósitos de Reserva: Ciclo de Producción, Retrasos Habituales y Cancelaciones",
    excerpt: "De la fase de prototipo a la aprobación de licencias y el flete marítimo.",
    type: "COMPRA"
  },
  "guia-importacion-uruguay-franquicia-usd-200-figuras": {
    title: "Guía de Importación en Uruguay: Cómo Usar la Franquicia de USD 200 para Coleccionables sin Pagar Recargos",
    excerpt: "El manual definitivo para coleccionistas uruguayos: reglas de Aduana, facturas comerciales y límite de 3 envíos anuales.",
    type: "COMPRA"
  },
  "misb-mib-loose-glosario-coleccionismo": {
    title: "MISB, MIB, Loose y otros términos del coleccionismo",
    excerpt: "¿MISB? ¿MIB? ¿Loose? Aprende los términos utilizados para describir el estado de figuras y coleccionables.",
    type: "GLOSARIO"
  },
  "grading-figuras-accion-afa-cas-certificacion": {
    title: "Grading en Figuras de Acción: Qué Hacen AFA y CAS y Cuándo Vale la Pena Certificar",
    excerpt: "Sub-grados de burbuja, figura y cartón. Cuándo el encapsulado en acrílico agrega valor real.",
    type: "GLOSARIO"
  },
  "guia-de-escalas-coleccionables": {
    title: "Guía Definitiva de Escalas: 1:12 vs 1:10 vs 1:6 en Figuras de Acción",
    excerpt: "Descubre las diferencias reales de tamaño, articulación y compatibilidad de vitrinas.",
    type: "GUÍA TÉCNICA"
  },
  "como-detectar-bootlegs-figuras-originales": {
    title: "Cómo Detectar Bootlegs y Copias No Oficiales vs Figuras Originales",
    excerpt: "Aprende a identificar sellos holográficos de Toei/Bandai, calidades de pintura defectuosas y empaques sospechosos.",
    type: "AUTENTICIDAD"
  },
  "pvc-vs-resina-vs-diecast-cuidados": {
    title: "PVC vs Resina Polystone vs Diecast: Cuidados y Conservación",
    excerpt: "Por qué la resina no tolera caídas, cómo evitar el efecto sudor plástico en PVC y la protección anticorrosión.",
    type: "PRESERVACIÓN"
  },
  "vitrinas-iluminacion-led-y-control-uv": {
    title: "Vitrinas para Coleccionistas: Iluminación LED, Polvo y Control UV",
    excerpt: "La luz solar directa y las lámparas halógenas amarillean los plásticos. Configura vitrinas con LEDs fríos sin emisión UV.",
    type: "CONSERVACIÓN"
  }
};

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
  if (type === 'licencias') return slug ? `${BASE_URL}/licencias/${slug}` : `${BASE_URL}/licencias`;
  if (type === 'themes') return slug ? `${BASE_URL}/themes/${slug}` : `${BASE_URL}/themes`;
  if (type === 'producto' || type === 'product' || type === 'p') return `${BASE_URL}/producto/${slug}`;
  if (type === 'categoria' || type === 'category') return `${BASE_URL}/categoria/${slug}`;
  if (type === 'marca' || type === 'brand') return `${BASE_URL}/marca/${slug}`;
  if (type === 'academy') return slug ? `${BASE_URL}/academy/${slug}` : `${BASE_URL}/academy`;
  if (type === 'radar') return slug ? `${BASE_URL}/radar/${slug}` : `${BASE_URL}/radar`;
  if (type === 'releases') return `${BASE_URL}/releases`;
  if (type === 'compare') return `${BASE_URL}/compare`;
  if (type === 'import-hub') return `${BASE_URL}/import-hub`;
  if (type === 'contact') return `${BASE_URL}/contact`;
  if (type === 'ai-search' || type === 'ai_search') return `${BASE_URL}/ai-search`;
  if (type === 'page') return `${BASE_URL}/page/${slug}`;
  if (type === 'static') return `${BASE_URL}/${slug}`;
  return `${BASE_URL}/${slug || ''}`;
}

function generateMetaTitle(type, name) {
  if (type === 'home' || !type) return 'Juguetes Retro Uruguay & Coleccionables | Collectibles Store';
  if (type === 'shop') return 'Catálogo de Coleccionables en Uruguay | Collectibles';
  if (type === 'ai-search' || type === 'ai_search') return 'Buscador con Inteligencia Artificial para Coleccionistas | Collectibles Uruguay';
  if (type === 'licencias') return name ? `${name} | Licencias Oficiales | Collectibles Uruguay` : 'Licencias Oficiales de Coleccionables | Collectibles Uruguay';
  if (type === 'themes') return name ? `${name} | Universos Geek | Collectibles Uruguay` : 'Universos y Temas Geek | Collectibles Uruguay';
  if (type === 'producto' || type === 'product' || type === 'p') return `${name} | Collectibles Uruguay`;
  if (type === 'marca' || type === 'brand') return `${name} en Uruguay | Collectibles`;
  if (type === 'categoria' || type === 'category') return `${name} en Uruguay | Collectibles`;
  if (type === 'academy') return name ? `${name} | Collector Academy Uruguay` : 'Collector Academy — Guías de Coleccionismo y Conservación | Collectibles Uruguay';
  if (type === 'radar') return name ? `${name} | Radar de Coleccionables Uruguay` : 'Collectibles Radar — Qué está pasando ahora en coleccionismo | Collectibles Uruguay';
  if (type === 'releases') return 'Calendario de Lanzamientos 2026 / 2027 | Collectibles Uruguay';
  if (type === 'compare') return 'Comparador de Figuras y Coleccionables | Collectibles Uruguay';
  if (type === 'import-hub') return 'Collectibles Import Hub — Casilla y Franquicias en Uruguay';
  if (type === 'contact') return 'Contacto | Collectibles Uruguay';
  if (type === 'static' || type === 'page') return `${name} | Collectibles Uruguay`;
  return `${name} | Collectibles Uruguay`;
}

function generateMetaDescription(type, rawDesc, name) {
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
  if (type === 'ai-search' || type === 'ai_search') {
    return 'Encuentra figuras, escalas, líneas y piezas de colección en Uruguay utilizando búsqueda asistida por IA especializada en coleccionismo.';
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
  if (type === 'categoria' || type === 'category') {
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
  if (type === 'import-hub') {
    return 'Calculadora y simulador de costos de importación para coleccionistas en Uruguay bajo el régimen de franquicia USD 200.';
  }
  if (type === 'contact') {
    return 'Contacta con el equipo de Collectibles Uruguay. Atención personalizada por WhatsApp, teléfono y correo electrónico.';
  }
  return `Collectibles Uruguay - ${name || 'Coleccionables y Figuras Oficiales'}`;
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
  } else if (type === 'licencias' && entity && entity.slug) {
    itemListElement.push(
      { '@type': 'ListItem', position: 2, name: 'Licencias', item: `${BASE_URL}/licencias` },
      { '@type': 'ListItem', position: 3, name: entity.name || 'Licencia', item: `${BASE_URL}/licencias/${entity.slug}` }
    );
  } else if (type === 'themes' && entity && entity.slug) {
    itemListElement.push(
      { '@type': 'ListItem', position: 2, name: 'Themes', item: `${BASE_URL}/themes` },
      { '@type': 'ListItem', position: 3, name: entity.name || 'Theme', item: `${BASE_URL}/themes/${entity.slug}` }
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
  } else if (type === 'ai-search' || type === 'ai_search') {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Buscador con IA',
      item: `${BASE_URL}/ai-search`
    });
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
    if (cLower.includes('usad') || cLower.includes('used') || cLower.includes('loose')) {
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
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

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

function renderGonePage(res, htmlTemplate, reason) {
  let renderedHtml = htmlTemplate || getBaseTemplate();
  const goneTitle = '410 - Contenido Eliminado Definitivamente | Collectibles Uruguay';

  renderedHtml = renderedHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(goneTitle)}</title>`);
  renderedHtml = renderedHtml.replace(/<meta[^>]*name=["']robots["'][^>]*\/?>/i, '<meta name="robots" content="noindex, nofollow" />');

  const goneBody = `
    <div style="padding: 40px 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; text-align: center;">
      <h1 style="font-size: 36px; font-weight: bold; color: #64748b; margin-bottom: 15px;">410 - Contenido Eliminado</h1>
      <p style="font-size: 18px; color: #4b5563; margin-bottom: 25px;">El recurso solicitado (${escapeHtml(reason)}) fue retirado definitivamente y ya no está disponible.</p>
      <a href="${BASE_URL}/" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Ir al Inicio</a>
    </div>
  `;

  if (renderedHtml.includes('<div id="root"></div>')) {
    renderedHtml = renderedHtml.replace('<div id="root"></div>', `<div id="root">${goneBody}</div>`);
  } else if (renderedHtml.includes('<div id="root">')) {
    renderedHtml = renderedHtml.replace(/<div id="root">[\s\S]*?<\/div>/i, `<div id="root">${goneBody}</div>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  return res.status(410).send(renderedHtml);
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
    const rawUrl = req.url || '';
    const parsed = new URL(rawUrl, 'https://collectibles.uy');
    const xForwardedUri = req.headers?.['x-forwarded-uri'] || req.headers?.['x-matched-path'] || '';
    const combinedUri = (parsed.pathname + ' ' + rawUrl + ' ' + xForwardedUri).toLowerCase();

    let type = parsed.searchParams.get('type') || req.query?.type;
    let slug = parsed.searchParams.get('slug') || req.query?.slug;

    // 0. HANDLE 410 FOR RESIDUAL WORDPRESS / JS TRACE / GARBAGE URLS
    if (type === 'wp_garbage' || combinedUri.includes('sample-page') || combinedUri.includes('/wp-') || combinedUri.includes('/feed') || combinedUri.includes('/author/') || combinedUri.includes('/blog/') || combinedUri.includes('/2024/') || combinedUri.includes('/2025/')) {
      return renderGonePage(res, getBaseTemplate(), 'Ruta heredada de WordPress');
    }

    if (type === 'asset_garbage' || (combinedUri.includes('/assets/') && (combinedUri.includes('.js:') || combinedUri.includes('.css:')))) {
      return renderGonePage(res, getBaseTemplate(), 'Traza de ejecución JavaScript interna');
    }

    if (type === 'page_garbage' || combinedUri.includes('/page=')) {
      // 301 to clean shop
      res.setHeader('Location', `${BASE_URL}/shop`);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(301).end();
    }

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
      } else if (combinedUri.includes('/academy/')) {
        type = 'academy_article';
        const match = combinedUri.match(/\/academy\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/academy')) {
        type = 'academy';
      } else if (combinedUri.includes('/radar/')) {
        type = 'radar_item';
        const match = combinedUri.match(/\/radar\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/radar')) {
        type = 'radar';
      } else if (combinedUri.includes('/releases')) {
        type = 'releases';
      } else if (combinedUri.includes('/compare')) {
        type = 'compare';
      } else if (combinedUri.includes('/import-hub')) {
        type = 'import-hub';
      } else if (combinedUri.includes('/licencias/')) {
        type = 'licencia_detail';
        const match = combinedUri.match(/\/licencias\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/licencias')) {
        type = 'licencias';
      } else if (combinedUri.includes('/themes/') || combinedUri.includes('/temas/')) {
        type = 'theme_detail';
        const match = combinedUri.match(/\/(?:themes|temas)\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/themes') || combinedUri.includes('/temas')) {
        type = 'themes';
      } else if (combinedUri.includes('/page/')) {
        type = 'page';
        const match = combinedUri.match(/\/page\/([^\/\?\s]+)/);
        if (match) slug = match[1];
      } else if (combinedUri.includes('/contact')) {
        type = 'contact';
      } else if (combinedUri.includes('/shop')) {
        type = 'shop';
      } else if (combinedUri.includes('type=home') || parsed.pathname === '/' || xForwardedUri === '/') {
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

    // 1. PRODUCT
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

    // 2. CATEGORY
    } else if (type === 'categoria' && slug) {
      const { data: category } = await supabase
        .from('categories')
        .select('id, name, slug, is_active, status')
        .eq('slug', slug)
        .maybeSingle();

      if (!category || !category.is_active || (category.status && category.status !== 'approved' && category.status !== 'active')) {
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

    // 3. BRAND
    } else if (type === 'marca' && slug) {
      const { data: brand } = await supabase
        .from('brands')
        .select('id, name, slug, description, is_active, status')
        .eq('slug', slug)
        .maybeSingle();

      if (!brand || !brand.is_active || (brand.status && brand.status !== 'approved' && brand.status !== 'active')) {
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

    // 4. ACADEMY ARTICLE
    } else if (type === 'academy_article' && slug) {
      const guideData = ACADEMY_ARTICLES_MAP[slug];
      let articleTitle = guideData ? guideData.title : 'Guía de Coleccionismo';
      let articleExcerpt = guideData ? guideData.excerpt : '';

      if (!guideData) {
        const { data: dbArticle } = await supabase
          .from('academy_content')
          .select('title, excerpt, featured_image')
          .eq('slug', slug)
          .maybeSingle();

        if (dbArticle) {
          articleTitle = dbArticle.title;
          articleExcerpt = dbArticle.excerpt;
        } else {
          return renderNotFoundPage(res, htmlTemplate, 'academy', slug);
        }
      }

      title = generateMetaTitle('academy', articleTitle);
      description = generateMetaDescription('academy', articleExcerpt, articleTitle);
      canonical = generateCanonical('academy', slug);

      const breadcrumbSchema = generateBreadcrumbs('academy', { title: articleTitle, slug });
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <a href="${BASE_URL}/academy">Collector Academy</a> &gt; <span>${escapeHtml(articleTitle)}</span>
          </nav>
          <article>
            <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 15px;">${escapeHtml(articleTitle)}</h1>
            <p style="font-size: 18px; color: #4b5563; line-height: 1.6;">${escapeHtml(description)}</p>
          </article>
        </div>
      `;

    // 5. ACADEMY HOME
    } else if (type === 'academy') {
      title = generateMetaTitle('academy');
      description = generateMetaDescription('academy');
      canonical = generateCanonical('academy');

      const breadcrumbSchema = generateBreadcrumbs('academy');
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>Collector Academy</span>
          </nav>
          <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">Collector Academy Uruguay</h1>
          <p style="font-size: 16px; color: #4b5563;">${escapeHtml(description)}</p>
        </div>
      `;

    // 6. RADAR
    } else if (type === 'radar' || type === 'releases') {
      title = generateMetaTitle(type);
      description = generateMetaDescription(type);
      canonical = generateCanonical(type);

      const breadcrumbSchema = generateBreadcrumbs(type);
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>Radar de Lanzamientos</span>
          </nav>
          <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">Collectibles Radar & Lanzamientos</h1>
          <p>${escapeHtml(description)}</p>
        </div>
      `;

    // 7. COMPARE
    } else if (type === 'compare') {
      title = generateMetaTitle('compare');
      description = generateMetaDescription('compare');
      canonical = generateCanonical('compare');

      const breadcrumbSchema = generateBreadcrumbs('compare');
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>Comparador</span>
          </nav>
          <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">Comparador de Figuras y Coleccionables</h1>
          <p>${escapeHtml(description)}</p>
        </div>
      `;

    // 8. IMPORT HUB
    } else if (type === 'import-hub') {
      title = generateMetaTitle('import-hub');
      description = generateMetaDescription('import-hub');
      canonical = generateCanonical('import-hub');

      const breadcrumbSchema = generateBreadcrumbs('import-hub');
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>Import Hub</span>
          </nav>
          <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">Collectibles Import Hub Uruguay</h1>
          <p>${escapeHtml(description)}</p>
        </div>
      `;

    // 8b. AI SEARCH
    } else if (type === 'ai-search' || type === 'ai_search' || fullPath.includes('/ai-search') || fullPath.includes('/search/ai')) {
      title = generateMetaTitle('ai-search');
      description = generateMetaDescription('ai-search');
      canonical = generateCanonical('ai-search');

      const breadcrumbSchema = generateBreadcrumbs('ai-search');
      const webAppSchema = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Collectibles AI Search',
        applicationCategory: 'SearchApplication',
        operatingSystem: 'All',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'UYU'
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${BASE_URL}/ai-search?q={search_term_string}`
          },
          'query-input': 'required name=search_term_string'
        }
      };
      jsonLdScripts.push(webAppSchema);
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <span>Buscador con IA</span>
          </nav>
          <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">Buscador de Coleccionables con IA</h1>
          <p style="font-size: 18px; color: #4b5563; margin-bottom: 25px;">${escapeHtml(description)}</p>
          
          <section style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
            <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 12px; color: #1e293b;">Búsquedas y Consultas Asistidas por Inteligencia Artificial</h2>
            <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
              <li style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; font-size: 14px; color: #334155;">
                "De la Wave 3 de DC Multiverse de McFarlane, ¿qué tenés disponible?"
              </li>
              <li style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; font-size: 14px; color: #334155;">
                "Mostrame figuras de terror de NECA Ultimate disponibles en Uruguay."
              </li>
              <li style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; font-size: 14px; color: #334155;">
                "Quiero una figura de Batman de unos 18 cm, que no sea Funko y cueste menos de USD 80."
              </li>
              <li style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; font-size: 14px; color: #334155;">
                "¿Qué figuras 1:12 de Marvel tengo disponibles y cuáles combinan mejor entre sí?"
              </li>
            </ul>
          </section>

          <section style="margin-top: 30px;">
            <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 12px;">Explorar Catálogo y Módulos de Coleccionismo</h2>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <a href="${BASE_URL}/shop" style="padding: 8px 16px; background: #2563eb; color: #ffffff; border-radius: 6px; text-decoration: none; font-weight: 500;">Ver Catálogo</a>
              <a href="${BASE_URL}/academy" style="padding: 8px 16px; background: #f1f5f9; color: #1e293b; border-radius: 6px; text-decoration: none; font-weight: 500;">Collector Academy</a>
              <a href="${BASE_URL}/radar" style="padding: 8px 16px; background: #f1f5f9; color: #1e293b; border-radius: 6px; text-decoration: none; font-weight: 500;">Radar de Preventas</a>
              <a href="${BASE_URL}/releases" style="padding: 8px 16px; background: #f1f5f9; color: #1e293b; border-radius: 6px; text-decoration: none; font-weight: 500;">Calendario de Lanzamientos</a>
              <a href="${BASE_URL}/compare" style="padding: 8px 16px; background: #f1f5f9; color: #1e293b; border-radius: 6px; text-decoration: none; font-weight: 500;">Comparador</a>
              <a href="${BASE_URL}/import-hub" style="padding: 8px 16px; background: #f1f5f9; color: #1e293b; border-radius: 6px; text-decoration: none; font-weight: 500;">Import Hub</a>
              <a href="${BASE_URL}/licencias" style="padding: 8px 16px; background: #f1f5f9; color: #1e293b; border-radius: 6px; text-decoration: none; font-weight: 500;">Licencias</a>
              <a href="${BASE_URL}/themes" style="padding: 8px 16px; background: #f1f5f9; color: #1e293b; border-radius: 6px; text-decoration: none; font-weight: 500;">Temas Geek</a>
            </div>
          </section>
        </div>
      `;

    // 9. LICENCIAS & THEMES
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

    // 9b. LICENCIA DETAIL
    } else if (type === 'licencia_detail' && slug) {
      const { data: license } = await supabase
        .from('licenses')
        .select('name, slug')
        .eq('slug', slug)
        .maybeSingle();

      const licName = license?.name || slug;
      title = generateMetaTitle('licencias', licName);
      description = generateMetaDescription('licencias', null, licName);
      canonical = generateCanonical('licencias', slug);

      const breadcrumbSchema = generateBreadcrumbs('licencias', { name: licName, slug });
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <a href="${BASE_URL}/licencias">Licencias</a> &gt; <span>${escapeHtml(licName)}</span>
          </nav>
          <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">${escapeHtml(licName)} en Uruguay</h1>
          <p>${escapeHtml(description)}</p>
        </div>
      `;

    // 9c. THEME DETAIL
    } else if (type === 'theme_detail' && slug) {
      const { data: theme } = await supabase
        .from('themes')
        .select('name, slug')
        .eq('slug', slug)
        .maybeSingle();

      const themeName = theme?.name || slug;
      title = generateMetaTitle('themes', themeName);
      description = generateMetaDescription('themes', null, themeName);
      canonical = generateCanonical('themes', slug);

      const breadcrumbSchema = generateBreadcrumbs('themes', { name: themeName, slug });
      jsonLdScripts.push(breadcrumbSchema);

      bodyContent = `
        <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;">
          <nav style="font-size: 14px; margin-bottom: 15px;">
            <a href="${BASE_URL}/">Inicio</a> &gt; <a href="${BASE_URL}/themes">Temas</a> &gt; <span>${escapeHtml(themeName)}</span>
          </nav>
          <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">${escapeHtml(themeName)} en Uruguay</h1>
          <p>${escapeHtml(description)}</p>
        </div>
      `;

    // 10. SHOP
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

    // 11. STATIC / LEGAL / CONTACT
    } else if (type === 'static' || type === 'page' || type === 'contact') {
      const pageSlug = type === 'contact' ? 'contact' : (slug || '');
      const pageTitles = {
        'nosotros': 'Nosotros',
        'terminos': 'Términos y Condiciones',
        'pol-ticas-de-privacidad': 'Políticas de Privacidad',
        'condiciones-de-compra': 'Condiciones de Compra',
        'envios-devoluciones': 'Envíos y Devoluciones',
        'contact': 'Contacto'
      };
      let pageName = pageTitles[pageSlug];
      if (!pageName && type === 'page') {
        const { data: pageData } = await supabase
          .from('pages')
          .select('title, slug, is_active')
          .eq('slug', pageSlug)
          .maybeSingle();

        if (pageData && pageData.is_active) {
          pageName = pageData.title;
        } else {
          return renderNotFoundPage(res, htmlTemplate, 'page', pageSlug);
        }
      } else if (!pageName && type !== 'contact') {
        return renderNotFoundPage(res, htmlTemplate, 'page', pageSlug || 'not-found');
      }
      pageName = pageName || 'Contacto';
      title = generateMetaTitle('static', pageName);
      description = generateMetaDescription('static', null, pageName);
      canonical = generateCanonical(pageSlug === 'contact' ? 'contact' : 'page', pageSlug);

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

    // 12. HOME
    } else if (type === 'home' || parsed.pathname === '/' || combinedUri.includes('type=home')) {
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
    res.setHeader('X-SEO-Version', '2026.09.07-v4');
    if (isBot) {
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    return res.status(200).send(renderedHtml);
  } catch (error) {
    console.error('Error in SEO Prerender handler:', error);
    res.status(500).send('Server Error');
  }
}

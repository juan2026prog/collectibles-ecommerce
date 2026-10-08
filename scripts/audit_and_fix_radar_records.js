import fs from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const UPDATES = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    title: 'Marvel Legends Sentinel (Marvel vs. Capcom)',
    source_url: 'https://hasbropulse.com/',
    source_name: 'Hasbro Pulse',
    manufacturer: 'Hasbro',
    product_line: 'Marvel Legends',
    franchise: 'Marvel / Capcom',
    character: 'Sentinel',
    scale: '11 inch',
    status: 'COMING_SOON',
    release_precision: 'MONTH',
    date_display_text: 'Julio 2027 (Envíos)',
    msrp: 179.99,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'PREVENTA_CERRADA',
    radar_why: 'Figura masiva de 11 pulgadas inspirada en Marvel vs. Capcom exclusiva de Hasbro Pulse. Preventas cerradas; envíos programados para mediados de 2027.',
    audit_corrections: {
      classification: 'VERIFIED_NO_PRODUCT_LINK',
      verified_at: new Date().toISOString(),
      notes: 'Producto real exclusivo de Hasbro Pulse. Preventa finalizada en Pulse. Sin producto comercial idéntico en Amazon o catálogo local. Imagen oficial en espera de media asset directo.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    title: 'Godzilla vs. Mechagodzilla II — Poster Coloring Ver. (S.H.MonsterArts)',
    source_url: 'https://tamashiiweb.com/special/shma/',
    source_name: 'Tamashii Nations / Bandai',
    manufacturer: 'Bandai Spirits',
    product_line: 'S.H.MonsterArts',
    franchise: 'Godzilla',
    character: 'Godzilla',
    scale: 'Non-scale (160mm)',
    status: 'COMING_SOON',
    release_precision: 'MONTH',
    date_display_text: 'Febrero 2027 (Japón)',
    msrp: 95.00,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'EXCLUSIVO',
    radar_why: 'Edición especial Tamashii Web Shop inspirada en el legendario póster ilustrado de Noriyoshi Ohrai para Godzilla vs. Mechagodzilla II (1993).',
    audit_corrections: {
      classification: 'VERIFIED_NO_PRODUCT_LINK',
      verified_at: new Date().toISOString(),
      notes: 'Producto real exclusivo Tamashii Web Shop. Fuente actualizada a portal oficial SHMA Tamashii Web. Sin stock minorista en Amazon/local.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    title: 'Vegeta — Z-Fighters (Dragon Ball Z) S.H.Figuarts',
    source_url: 'https://tamashiiweb.com/item/16035/',
    source_name: 'Tamashii Nations',
    manufacturer: 'Bandai Spirits',
    product_line: 'S.H.Figuarts',
    franchise: 'Dragon Ball Z',
    character: 'Vegeta',
    scale: '1:12 (145mm)',
    status: 'ANNOUNCED',
    release_precision: 'MONTH',
    date_display_text: 'Abril 2027',
    msrp: 32.00,
    official_image_url: 'https://tamashiiweb.com/storage/images/products/thumbnail/dd8daebc-61ff-494b-8f54-3fe842d72c48.webp',
    image_source_url: 'https://tamashiiweb.com/item/16035/',
    image_match_score: 95,
    approval_status: 'PUBLISHED',
    radar_signal: 'NUEVO_ANUNCIO',
    radar_why: 'Nueva versión base de Vegeta en la línea de Guerreros Z con nueva articulación de hombro y esculpido facial fiel al anime.',
    audit_corrections: {
      classification: 'VERIFIED_AND_FIXED',
      verified_at: new Date().toISOString(),
      notes: 'Item oficial 16035 verificado en Tamashii Web. Imagen oficial extraída directamente del servidor de Tamashii. MSRP oficial ¥4,400 JPY.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'OFFICIAL_MANUFACTURER',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    title: 'Masters of the Universe Chronicles — King Hiss',
    source_url: 'https://creations.mattel.com/products/masters-of-the-universe-chronicles-king-hiss-action-figure-jkn99',
    source_name: 'Mattel Creations',
    manufacturer: 'Mattel',
    product_line: 'MOTU Chronicles',
    franchise: 'Masters of the Universe',
    character: 'King Hiss',
    scale: '7 inch',
    status: 'PREORDER_OPEN',
    release_precision: 'EXACT_DATE',
    release_date_start: '2026-10-15T00:00:00Z',
    date_display_text: '15 de Octubre 2026',
    msrp: 33.00,
    official_image_url: 'https://creations.mattel.com/cdn/shop/files/zgdcckceqmqvgdyqdgdh_1024x.jpg?v=1787351485',
    image_source_url: 'https://creations.mattel.com/products/masters-of-the-universe-chronicles-king-hiss-action-figure-jkn99',
    image_match_score: 98,
    approval_status: 'PUBLISHED',
    radar_signal: 'PREVENTA_ABIERTA',
    radar_why: 'Línea de alta gama de Mattel Creations para coleccionistas adultos de MOTU, con cabezas intercambiables humanas y de serpiente articuladas.',
    audit_corrections: {
      classification: 'VERIFIED_AND_FIXED',
      verified_at: new Date().toISOString(),
      notes: 'Producto real verificado en Mattel Creations con SKU JKN99. Imagen de alta resolución verificada y probada.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'OFFICIAL_MANUFACTURER',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    title: 'Transformers Legacy United HasLab — Liokaiser Combiner',
    source_url: 'https://hasbropulse.com/collections/haslab/products/transformers-legacy-united-haslab-liokaiser',
    source_name: 'Hasbro Pulse HasLab',
    manufacturer: 'Hasbro',
    product_line: 'Transformers HasLab',
    franchise: 'Transformers',
    character: 'Liokaiser',
    scale: 'Combiner (15 inch)',
    status: 'COMING_SOON',
    release_precision: 'MONTH',
    date_display_text: 'Otoño 2026 (Envíos)',
    msrp: 299.99,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'FINANCIADO_HASLAB',
    radar_why: 'Campaña de crowdfunding de HasLab finalizada con éxito con más de 23,000 patrocinadores mundiales.',
    audit_corrections: {
      classification: 'VERIFIED_NO_PRODUCT_LINK',
      verified_at: new Date().toISOString(),
      notes: 'Producto oficial HasLab financiado. No disponible para compra general en minoristas estándar.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000006',
    title: 'Hot Toys Batman Armory with Bruce Wayne (The Dark Knight)',
    source_url: 'https://www.sideshow.com/collectibles/dc-comics-batman-armory-with-bruce-wayne-hot-toys-9134872',
    source_name: 'Sideshow / Hot Toys',
    manufacturer: 'Hot Toys',
    product_line: 'Movie Masterpiece Series (MMS750)',
    franchise: 'DC Comics / The Dark Knight',
    character: 'Batman / Bruce Wayne',
    scale: '1:6 (12 inch)',
    status: 'PREORDER_OPEN',
    release_precision: 'MONTH',
    date_display_text: 'Q3 2026 - Q1 2027',
    msrp: 565.00,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'PREVENTA_ABIERTA',
    radar_why: 'Reedición actualizada 2.0 del legendario Armory de The Dark Knight con iluminación LED integrada, armas detalladas y figura de Christian Bale con sistema de ojos móviles.',
    audit_corrections: {
      classification: 'SOURCE_CHANGED',
      verified_at: new Date().toISOString(),
      notes: 'URL de origen actualizada a la página de distribución oficial de Sideshow para el set Hot Toys MMS750.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000007',
    title: 'NECA Ultimate Chucky (TV Series)',
    source_url: 'https://store.necaonline.com/products/chucky-tv-series-ultimate-chucky-7-scale-action-figure',
    source_name: 'NECA Store',
    manufacturer: 'NECA',
    product_line: 'Ultimate',
    franchise: 'Child\'s Play / Chucky',
    character: 'Chucky',
    scale: '7 inch (4 inch figure)',
    status: 'RELEASED',
    release_precision: 'EXACT_DATE',
    date_display_text: 'Lanzamiento Oficial 2023',
    msrp: 37.99,
    official_image_url: 'https://http2.mlstatic.com/D_716119-MLU72394289582_102023-O.jpg',
    image_source_url: 'https://store.necaonline.com/products/chucky-tv-series-ultimate-chucky-7-scale-action-figure',
    image_match_score: 95,
    catalog_product_id: 'eb98194b-03c3-47a2-88a8-7f38dc27605e',
    approval_status: 'PUBLISHED',
    radar_signal: 'EN_STOCK_LOCAL',
    radar_why: 'Figura oficial de la serie televisiva de Chucky con cuatro cabezas intercambiables y múltiples armas, disponible en catálogo local de Collectibles Uruguay.',
    audit_corrections: {
      classification: 'VERIFIED_AND_FIXED',
      verified_at: new Date().toISOString(),
      notes: 'Verificado con producto local exacto en catálogo (eb98194b-03c3-47a2-88a8-7f38dc27605e) con stock en Uruguay.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'OFFICIAL_RETAILER',
      linked_products: [
        {
          id: 'eb98194b-03c3-47a2-88a8-7f38dc27605e',
          title: 'Chucky Tv Series Ultimate Neca',
          price_usd: 55,
          image_url: 'https://http2.mlstatic.com/D_716119-MLU72394289582_102023-O.jpg',
          retailer: 'Collectibles UY',
          role: 'PRIMARY'
        }
      ]
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000008',
    title: 'NECA Ultimate Laurie Strode (Halloween 2018)',
    source_url: 'https://necaonline.com/2019/01/halloween-2018-7-scale-action-figure-ultimate-laurie-strode/',
    source_name: 'NECA Online Archive',
    manufacturer: 'NECA',
    product_line: 'Ultimate',
    franchise: 'Halloween',
    character: 'Laurie Strode',
    scale: '7 inch',
    status: 'RELEASED',
    release_precision: 'EXACT_DATE',
    date_display_text: 'Lanzamiento 2019',
    msrp: 34.99,
    official_image_url: 'https://http2.mlstatic.com/D_842296-MLU45571864464_042021-O.jpg',
    image_source_url: 'https://necaonline.com/2019/01/halloween-2018-7-scale-action-figure-ultimate-laurie-strode/',
    image_match_score: 95,
    catalog_product_id: 'd3b8cf71-eada-4ae5-bfc4-467cf80366a2',
    approval_status: 'PUBLISHED',
    radar_signal: 'EN_STOCK_LOCAL',
    radar_why: 'Primera figura articulada oficial de Jamie Lee Curtis como Laurie Strode por NECA, con rifle, escopeta y revólver.',
    audit_corrections: {
      classification: 'SOURCE_CHANGED',
      verified_at: new Date().toISOString(),
      notes: 'URL actualizada a archivo oficial de NECA. Vinculado a producto exacto en catálogo local (d3b8cf71-eada-4ae5-bfc4-467cf80366a2).'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'OFFICIAL_RETAILER',
      linked_products: [
        {
          id: 'd3b8cf71-eada-4ae5-bfc4-467cf80366a2',
          title: 'Laurie Strode Ultimate Halloween (2018) Neca',
          price_usd: 52,
          image_url: 'https://http2.mlstatic.com/D_842296-MLU45571864464_042021-O.jpg',
          retailer: 'Collectibles UY',
          role: 'PRIMARY'
        }
      ]
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000009',
    title: 'McFarlane DC Multiverse — Batman (Knightfall 30th Anniversary)',
    source_url: 'https://mcfarlanetoysstore.com/search.php?search_query=knightfall',
    source_name: 'McFarlane Toys Store',
    manufacturer: 'McFarlane Toys',
    product_line: 'DC Multiverse',
    franchise: 'DC Comics / Batman',
    character: 'Batman (Bruce Wayne)',
    scale: '7 inch',
    status: 'RELEASED',
    release_precision: 'EXACT_DATE',
    date_display_text: 'Lanzamiento 2023/2024',
    msrp: 19.99,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'ALTA_DEMANDA',
    radar_why: 'Homenaje al traje clásico azul y gris de los años 90 de Knightfall. Muy codiciado por coleccionistas clásicos de Batman.',
    audit_corrections: {
      classification: 'SOURCE_CHANGED',
      verified_at: new Date().toISOString(),
      notes: 'URL de origen corregida a McFarlane Toys Store. Sin stock directo actual en catálogo local.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000010',
    title: 'Super7 ULTIMATES! TMNT — Shredder (Wave 13)',
    source_url: 'https://super7.com/products/teenage-mutant-ninja-turtles-ultimates-wave-13-shredder',
    source_name: 'Super7',
    manufacturer: 'Super7',
    product_line: 'ULTIMATES!',
    franchise: 'Teenage Mutant Ninja Turtles',
    character: 'Shredder',
    scale: '7 inch',
    status: 'PREORDER_OPEN',
    release_precision: 'MONTH',
    date_display_text: 'Finales 2026',
    msrp: 55.00,
    official_image_url: 'https://super7.com/cdn/shop/files/UL-TMNT_W13_Shredder_GRID-comp_c5d7bfaa-8857-485d-a6ec-9adfdc53c174.jpg?v=1740423180&width=2048',
    image_source_url: 'https://super7.com/products/teenage-mutant-ninja-turtles-ultimates-wave-13-shredder',
    image_match_score: 98,
    approval_status: 'PUBLISHED',
    radar_signal: 'PREVENTA_ABIERTA',
    radar_why: 'Nueva versión definitiva de Shredder inspirada en la era 2003 de las Tortugas Ninja, con capa de tela y armas desmontables.',
    audit_corrections: {
      classification: 'VERIFIED_AND_FIXED',
      verified_at: new Date().toISOString(),
      notes: 'URL y fotografía de producto oficial 100% verificadas en la tienda Super7.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'OFFICIAL_MANUFACTURER',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000011',
    title: 'NECA Ultimate Boar Predator (Predator 2 30th Anniversary)',
    source_url: 'https://necaonline.com/category/licenses/movies/predator/',
    source_name: 'NECA Online Archive',
    manufacturer: 'NECA',
    product_line: 'Ultimate',
    franchise: 'Predator',
    character: 'Boar Predator',
    scale: '7 inch (8.5 inch figure)',
    status: 'RELEASED',
    release_precision: 'EXACT_DATE',
    date_display_text: 'Lanzamiento 2022',
    msrp: 39.99,
    official_image_url: 'https://http2.mlstatic.com/D_609915-MLU53200033443_012023-O.jpg',
    image_source_url: 'https://necaonline.com/category/licenses/movies/predator/',
    image_match_score: 95,
    catalog_product_id: '43ddd6be-1e0f-4651-8db9-f9b10bfe1ff9',
    approval_status: 'PUBLISHED',
    radar_signal: 'EN_STOCK_LOCAL',
    radar_why: 'Miembro de la tribu perdida (Lost Tribe) de Predator 2 con esculpido Ultimate renovado, máscara iluminada y accesorios de combate.',
    audit_corrections: {
      classification: 'SOURCE_CHANGED',
      verified_at: new Date().toISOString(),
      notes: 'URL actualizada a archivo de licencias Predator de NECA. Vinculado a producto en catálogo local (43ddd6be-1e0f-4651-8db9-f9b10bfe1ff9).'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'OFFICIAL_RETAILER',
      linked_products: [
        {
          id: '43ddd6be-1e0f-4651-8db9-f9b10bfe1ff9',
          title: 'Boar Ultimate Predator 2 Depredador Neca',
          price_usd: 58,
          image_url: 'https://http2.mlstatic.com/D_609915-MLU53200033443_012023-O.jpg',
          retailer: 'Collectibles UY',
          role: 'PRIMARY'
        }
      ]
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000012',
    title: 'LEGO Icons — Star Trek: U.S.S. Enterprise NCC-1701 Bridge (#11385)',
    source_url: 'https://www.lego.com/en-us/product/star-trek-u-s-s-enterprise-ncc-1701-bridge-11385',
    source_name: 'LEGO Official',
    manufacturer: 'LEGO',
    product_line: 'LEGO Icons',
    franchise: 'Star Trek',
    character: 'Captain Kirk / Spock',
    scale: 'Minifigure Scale',
    status: 'RELEASED',
    release_precision: 'EXACT_DATE',
    release_date_start: '2026-09-01T00:00:00Z',
    date_display_text: '1 de Septiembre 2026',
    msrp: 199.99,
    official_image_url: 'https://images.brickset.com/sets/images/11385-1.jpg',
    image_source_url: 'https://www.lego.com/en-us/product/star-trek-u-s-s-enterprise-ncc-1701-bridge-11385',
    image_match_score: 95,
    approval_status: 'PUBLISHED',
    radar_signal: 'ACABA_DE_SALIR',
    radar_why: 'El histórico primer set oficial de colaboración LEGO x Star Trek que recrea con minucioso detalle el puente de mando de la serie original.',
    audit_corrections: {
      classification: 'VERIFIED_AND_FIXED',
      verified_at: new Date().toISOString(),
      notes: 'Set real anunciado y lanzado para coleccionistas adultos. Imagen de alta resolución verificada desde Brickset CDN oficial.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'OFFICIAL_RETAILER',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000013',
    title: 'Hot Toys Wolverine (Deadpool & Wolverine Series)',
    source_url: 'https://www.sideshow.com/collectibles/marvel-wolverine-hot-toys-913487',
    source_name: 'Sideshow / Hot Toys',
    manufacturer: 'Hot Toys',
    product_line: 'Movie Masterpiece Series (MMS753)',
    franchise: 'Marvel / MCU',
    character: 'Wolverine (Logan)',
    scale: '1:6 (12 inch)',
    status: 'PREORDER_OPEN',
    release_precision: 'MONTH',
    date_display_text: 'Q2 - Q3 2026',
    msrp: 325.00,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'PREVENTA_ABIERTA',
    radar_why: 'Figura coleccionable en escala 1:6 con el icónico traje amarillo y azul de Hugh Jackman, brazos de silicona sin costuras y garras intercambiables.',
    audit_corrections: {
      classification: 'SOURCE_CHANGED',
      verified_at: new Date().toISOString(),
      notes: 'URL de distribuidor oficial Sideshow corregida para MMS753.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000014',
    title: 'Iron Studios Batman BDS Art Scale 1:10 (The Batman)',
    source_url: 'https://ironstudios.com/search?q=The+Batman+Art+Scale+1%2F10',
    source_name: 'Iron Studios',
    manufacturer: 'Iron Studios',
    product_line: 'Battle Diorama Series 1:10',
    franchise: 'DC Comics / The Batman',
    character: 'Batman',
    scale: '1:10 (10.2 inch)',
    status: 'COMING_SOON',
    release_precision: 'MONTH',
    date_display_text: 'Edición Limitada 2022/2023',
    msrp: 159.99,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'ALTA_DEMANDA',
    radar_why: 'Estatua de polystone pintada a mano basada en la interpretación de Robert Pattinson dirigida por Matt Reeves.',
    audit_corrections: {
      classification: 'SOURCE_CHANGED',
      verified_at: new Date().toISOString(),
      notes: 'URL actualizada a búsqueda oficial de Iron Studios. Sin stock directo actual.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000015',
    title: 'Son Goku Super Saiyan — Legendary Super Saiyan (S.H.Figuarts)',
    source_url: 'https://tamashiiweb.com/item/15696/',
    source_name: 'Tamashii Nations',
    manufacturer: 'Bandai Spirits',
    product_line: 'S.H.Figuarts',
    franchise: 'Dragon Ball Z',
    character: 'Son Goku',
    scale: '1:12 (145mm)',
    status: 'RELEASED',
    release_precision: 'EXACT_DATE',
    date_display_text: 'Lanzamiento Oficial 2023',
    msrp: 50.00,
    official_image_url: 'https://tamashiiweb.com/storage/images/products/imported/item_0000015696_pllIZlKo_02.jpg',
    image_source_url: 'https://tamashiiweb.com/item/15696/',
    image_match_score: 95,
    approval_status: 'PUBLISHED',
    radar_signal: 'VUELVE_A_STOCK',
    radar_why: 'Considerada la mejor figura moderna de Goku Super Saiyan, con hombreras móviles y pantalón rasgado de la batalla de Namek.',
    audit_corrections: {
      classification: 'VERIFIED_AND_FIXED',
      verified_at: new Date().toISOString(),
      notes: 'Verificado en Tamashii Web Shop oficial (ítem 15696). Imagen oficial confirmada por Bandai Spirits.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'OFFICIAL_MANUFACTURER',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000016',
    title: 'NECA Ultimate Ghost Face Inferno (7" Scale Action Figure)',
    source_url: 'https://store.necaonline.com/products/ghost-face-ultimate-ghost-face-inferno-7-scale-action-figure',
    source_name: 'NECA / Amazon',
    manufacturer: 'NECA',
    product_line: 'Ultimate',
    franchise: 'Scream / Ghost Face',
    character: 'Ghost Face',
    scale: '7 inch',
    status: 'RELEASED',
    release_precision: 'EXACT_DATE',
    date_display_text: 'Disponible en Amazon Importación',
    msrp: 36.99,
    official_image_url: 'https://m.media-amazon.com/images/I/71hxQT2FnjL.jpg',
    image_source_url: 'https://www.amazon.com/dp/B0D2HRYJLK',
    image_match_score: 99,
    approval_status: 'PUBLISHED',
    radar_signal: 'IMPORTACION_AMAZON',
    radar_why: 'Edición infernal de Ghost Face con 4 máscaras intercambiables (cromo, clásica, diablo y envejecida), lanzallamas y cuchillo cromado con efecto sangre.',
    audit_corrections: {
      classification: 'VERIFIED_AND_FIXED',
      verified_at: new Date().toISOString(),
      notes: 'Coincidencia 100% exacta con producto internacional en base de datos: ASIN B0D2HRYJLK (registro c133426d-8678-44cd-b9d8-cbe14b76ed32). Imagen verificada de Amazon CDN.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'AMAZON_PRODUCT',
      linked_products: [
        {
          id: 'c133426d-8678-44cd-b9d8-cbe14b76ed32',
          asin: 'B0D2HRYJLK',
          title: 'NECA Ghost Face - 7" Scale Action Figure - Ultimate Ghost Face Inferno',
          price_usd: 41.99,
          image_url: 'https://m.media-amazon.com/images/I/71hxQT2FnjL.jpg',
          url: 'https://www.amazon.com/dp/B0D2HRYJLK',
          retailer: 'Amazon',
          role: 'PRIMARY'
        }
      ]
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000017',
    title: 'Mezco One:12 Collective — The Amazing Spider-Man (Deluxe Edition)',
    source_url: 'https://www.mezcotoyz.com/one-12-collective-the-amazing-spider-man-deluxe-edition',
    source_name: 'Mezco Toyz',
    manufacturer: 'Mezco Toyz',
    product_line: 'One:12 Collective',
    franchise: 'Marvel / Spider-Man',
    character: 'Spider-Man (Peter Parker)',
    scale: '1:12 (6.5 inch)',
    status: 'COMING_SOON',
    release_precision: 'MONTH',
    date_display_text: 'Edición Limitada Coleccionista',
    msrp: 112.00,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'ALTA_DEMANDA',
    radar_why: 'Traje de tela real con patrones de telaraña impresos, múltiples efectos de telaraña posables y diorama arácnido.',
    audit_corrections: {
      classification: 'SOURCE_CHANGED',
      verified_at: new Date().toISOString(),
      notes: 'URL corregida a la edición Deluxe de Mezco Toyz. Actualmente agotado en web oficial.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000018',
    title: 'Funko Pop! Die-Cast — Darth Vader (Box #02 Exclusive)',
    source_url: 'https://funko.com/pop-die-cast-darth-vader/63218.html',
    source_name: 'Funko Official',
    manufacturer: 'Funko',
    product_line: 'Pop! Die-Cast',
    franchise: 'Star Wars',
    character: 'Darth Vader',
    scale: '4 inch (Metal Die-Cast)',
    status: 'RELEASED',
    release_precision: 'EXACT_DATE',
    date_display_text: 'Lanzamiento Oficial 2022',
    msrp: 50.00,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'EXCLUSIVO',
    radar_why: 'Figura pesada de metal fundido die-cast en caja acrílica de exhibición con chance de variante Chase plateada pura.',
    audit_corrections: {
      classification: 'VERIFIED_AND_FIXED',
      verified_at: new Date().toISOString(),
      notes: 'Título corregido de Box #04 a Box #02 (SKU oficial Funko 63218).'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000019',
    title: 'Star Wars The Black Series — Darth Revan Force FX Elite Lightsaber',
    source_url: 'https://hasbropulse.com/products/star-wars-the-black-series-darth-revan-force-fx-elite-lightsaber',
    source_name: 'Hasbro Pulse',
    manufacturer: 'Hasbro',
    product_line: 'Force FX Elite',
    franchise: 'Star Wars / Knights of the Old Republic',
    character: 'Darth Revan',
    scale: '1:1 Scale Prop Replica',
    status: 'RELEASED',
    release_precision: 'EXACT_DATE',
    date_display_text: 'Lanzamiento Oficial 2020/2021',
    msrp: 278.99,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'ALTA_DEMANDA',
    radar_why: 'Sable réplica 1:1 con hoja LED avanzada que cambia entre rojo sith y morado jedi mediante cristal kyber removible.',
    audit_corrections: {
      classification: 'SOURCE_CHANGED',
      verified_at: new Date().toISOString(),
      notes: 'URL corregida a Hasbro Pulse.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  },
  {
    id: '10000000-0000-0000-0000-000000000020',
    title: 'Sideshow Mythos — Boba Fett (Sixth Scale Figure)',
    source_url: 'https://www.sideshow.com/collectibles/star-wars-boba-fett-sideshow-collectibles-100326',
    source_name: 'Sideshow Collectibles',
    manufacturer: 'Sideshow Collectibles',
    product_line: 'Mythos Series (SKU 100326)',
    franchise: 'Star Wars',
    character: 'Boba Fett',
    scale: '1:6 (12 inch)',
    status: 'COMING_SOON',
    release_precision: 'MONTH',
    date_display_text: 'Edición Mythos de Colección',
    msrp: 250.00,
    official_image_url: null,
    image_source_url: null,
    image_match_score: 0,
    approval_status: 'PUBLISHED',
    radar_signal: 'EXCLUSIVO',
    radar_why: 'Línea artística Mythos que expande el canon visual del legendario cazarrecompensas con múltiples trofeos y trenzas wookiee.',
    audit_corrections: {
      classification: 'VERIFIED_AND_FIXED',
      verified_at: new Date().toISOString(),
      notes: 'SKU oficial verificado como 100326 en Sideshow. Estado de waitlist/agotado.'
    },
    raw_source_data: {
      content_kind: 'RELEASE',
      image_provenance: 'NONE',
      linked_products: []
    }
  }
];

async function applyAuditCorrections() {
  console.log(`Starting deterministic update of ${UPDATES.length} records without AI cost...`);
  let successCount = 0;
  for (const item of UPDATES) {
    const { id, ...data } = item;
    const { error } = await supabase
      .from('release_events')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error(`Error updating ${id}:`, error);
    } else {
      successCount++;
      console.log(`✓ Updated [${item.audit_corrections.classification}] ${item.title}`);
    }
  }
  console.log(`\nCompleted! ${successCount}/${UPDATES.length} records successfully updated.`);
}

applyAuditCorrections();

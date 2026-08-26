import { CONDITION_OPTIONS, getConditionLabel } from '../config/conditionConfig';
import { getMbePackagingLabel, calculateArgentinaShippingStatus } from './mbeLogisticsUtils';
import { getCanonicalProductStock } from './canonicalStock';

export type FieldDataType = 
  | 'text' 
  | 'number' 
  | 'decimal' 
  | 'boolean' 
  | 'enum' 
  | 'relation' 
  | 'array' 
  | 'url' 
  | 'date';

export type ControlledSourceType =
  | 'brands'
  | 'categories'
  | 'subcategories'
  | 'licenses'
  | 'vendors'
  | 'badges'
  | 'tags'
  | 'conditions'
  | 'mbe_packaging'
  | 'destacado'
  | 'status';

export interface ControlledValidationSource {
  type: 'list' | 'dependent-list';
  source: ControlledSourceType;
  dependsOnKey?: string;
}

export interface ProductFieldDefinition {
  key: string;
  label: string;
  description: string;
  order: number;
  type: FieldDataType;
  
  exportable: boolean;
  importable: boolean;
  
  requiredForCreate?: boolean;
  requiredForPublish?: boolean;
  
  adminOnly?: boolean;
  nullable?: boolean;
  blankBehavior?: 'ignore' | 'erase';
  
  relationSource?: 'brands' | 'categories' | 'subcategories' | 'licenses' | 'vendors';
  relationValueField?: string;
  relationLabelField?: string;
  dependsOn?: string;

  controlledValidation?: ControlledValidationSource;
  
  allowedValues?: { value: string; label: string }[];
  example: string;
  
  synonyms?: string[];
  
  exportResolver?: (product: any) => string;
  importResolver?: (val: string, metadata?: any) => any;
}

export const PRODUCT_MASTER_FIELDS: ProductFieldDefinition[] = [
  // --- IDENTIFICACIÓN TÉCNICA ---
  {
    key: '_product_id',
    label: '_product_id',
    description: 'Identificador técnico UUID interno del producto (Solo lectura para round-trip e importaciones exactas).',
    order: 0,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: true,
    nullable: true,
    blankBehavior: 'ignore',
    example: '00055f0d-645e-43f3-b533-35681cd65c81',
    synonyms: ['_product_id', 'product_id', 'id_producto', 'id_tecnico', 'id'],
    exportResolver: p => p.id || ''
  },
  // --- IDENTIFICACIÓN COMERCIAL ---
  {
    key: 'sku',
    label: 'SKU',
    description: 'Código único de identificación del producto. Esencial para actualizar productos existentes por importación.',
    order: 1,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: false,
    blankBehavior: 'ignore',
    example: 'HAS-G2054',
    synonyms: ['sku', 'codigo', 'código', 'referencia', 'item_code'],
    exportResolver: p => p.sku || p.variants?.[0]?.sku || p.metadata?.sku || ''
  },
  {
    key: 'title',
    label: 'Título',
    description: 'Nombre o título principal del producto en la tienda.',
    order: 2,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: true,
    requiredForPublish: true,
    adminOnly: false,
    nullable: false,
    blankBehavior: 'ignore',
    example: 'Figura Batman Legacy 6 Pulgadas Edición Coleccionista',
    synonyms: ['title', 'título', 'titulo', 'nombre', 'producto', 'name', 'articulo', 'artículo'],
    exportResolver: p => p.title || ''
  },
  {
    key: 'slug',
    label: 'Slug / URL Friendly',
    description: 'Identificador amigable para URL (ej: figura-batman-legacy). Se genera automáticamente si se deja vacío.',
    order: 3,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: 'figura-batman-legacy',
    synonyms: ['slug', 'url_slug', 'handle', 'permalink'],
    exportResolver: p => p.slug || ''
  },
  {
    key: 'product_url',
    label: 'URL del producto',
    description: 'URL pública completa del producto en Collectibles.uy (Campo calculado de solo lectura).',
    order: 4,
    type: 'url',
    exportable: true,
    importable: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: 'https://collectibles.uy/p/figura-batman-legacy',
    synonyms: ['product_url', 'url_producto', 'link', 'enlace'],
    exportResolver: p => p.slug ? `https://collectibles.uy/p/${p.slug}` : ''
  },

  // --- CONTENIDO ---
  {
    key: 'description',
    label: 'Descripción',
    description: 'Descripción principal en texto plano del producto.',
    order: 5,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: 'Figura articulada de 15 cm con accesorios intercambiables.',
    synonyms: ['description', 'descripción', 'descripcion', 'detalle', 'observaciones'],
    exportResolver: p => p.description || ''
  },
  {
    key: 'short_description',
    label: 'Descripción corta',
    description: 'Resumen conciso del producto para tarjetas y listados.',
    order: 6,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: 'Edición limitada con 20 puntos de articulación.',
    synonyms: ['short_description', 'descripción corta', 'descripcion corta', 'resumen'],
    exportResolver: p => p.short_description || ''
  },
  {
    key: 'content',
    label: 'Contenido',
    description: 'Contenido completo o especificaciones en formato texto/HTML. Se preserva el formato estructurado.',
    order: 7,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: '<p>Incluye 3 cabezas intercambiables y base de exhibición.</p>',
    synonyms: ['content', 'contenido', 'body', 'body_html', 'long_description', 'detalles'],
    exportResolver: p => p.content || p.metadata?.content || p.metadata?.description_html || ''
  },

  // --- CLASIFICACIÓN ---
  {
    key: 'category_name',
    label: 'Categoría',
    description: 'Nombre de la categoría principal del producto.',
    order: 8,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: true,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    relationSource: 'categories',
    relationValueField: 'id',
    relationLabelField: 'name',
    controlledValidation: { type: 'list', source: 'categories' },
    example: 'Figuras de Acción',
    synonyms: ['category', 'category_name', 'categoría', 'categoria', 'rubro'],
    exportResolver: p => p.category?.name || p.metadata?.category_name || ''
  },
  {
    key: 'subcategory_name',
    label: 'Subcategoría',
    description: 'Nombre de la subcategoría dependiente de la categoría principal.',
    order: 9,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    relationSource: 'subcategories',
    relationValueField: 'id',
    relationLabelField: 'name',
    dependsOn: 'category_name',
    controlledValidation: { type: 'dependent-list', source: 'subcategories', dependsOnKey: 'category_name' },
    example: '6 Pulgadas',
    synonyms: ['subcategory', 'subcategory_name', 'subcategoría', 'subcategoria', 'subrubro'],
    exportResolver: p => p.subcategory?.name || p.metadata?.subcategory_name || ''
  },
  {
    key: 'brand_name',
    label: 'Marca',
    description: 'Marca o fabricante del producto.',
    order: 10,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: true,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    relationSource: 'brands',
    relationValueField: 'id',
    relationLabelField: 'name',
    controlledValidation: { type: 'list', source: 'brands' },
    example: 'Hasbro',
    synonyms: ['brand', 'brand_name', 'marca', 'fabricante', 'linea'],
    exportResolver: p => p.brand?.name || p.metadata?.brand_name || ''
  },
  {
    key: 'license_name',
    label: 'Licencia',
    description: 'Franquicia o licencia oficial del producto.',
    order: 11,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    relationSource: 'licenses',
    relationValueField: 'id',
    relationLabelField: 'name',
    controlledValidation: { type: 'list', source: 'licenses' },
    example: 'DC Comics',
    synonyms: ['license', 'license_name', 'licencia', 'franquicia'],
    exportResolver: p => p.license?.name || p.metadata?.license_name || ''
  },

  // --- COMERCIAL ---
  {
    key: 'base_price',
    label: 'Precio',
    description: 'Precio de venta al público en la moneda local (UYU).',
    order: 12,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: true,
    requiredForPublish: true,
    adminOnly: false,
    nullable: false,
    blankBehavior: 'ignore',
    example: '2990.00',
    synonyms: ['base_price', 'precio', 'price', 'pvp', 'monto'],
    exportResolver: p => p.base_price !== undefined && p.base_price !== null ? Number(p.base_price).toFixed(2) : '0.00'
  },
  {
    key: 'compare_at_price',
    label: 'Precio anterior',
    description: 'Precio anterior o tachado para mostrar descuentos visuales.',
    order: 13,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'erase',
    example: '3500.00',
    synonyms: ['compare_at_price', 'precio anterior', 'precio oferta', 'precio tachado', 'precio comparacion', 'original_price'],
    exportResolver: p => p.compare_at_price !== undefined && p.compare_at_price !== null ? Number(p.compare_at_price).toFixed(2) : ''
  },
  {
    key: 'cost_price',
    label: 'Costo',
    description: 'Costo de adquisición del producto (Visible únicamente para Administradores).',
    order: 14,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: true,
    nullable: true,
    blankBehavior: 'erase',
    example: '1800.00',
    synonyms: ['cost_price', 'costo', 'cost', 'precio_costo'],
    exportResolver: p => p.cost_price !== undefined && p.cost_price !== null ? Number(p.cost_price).toFixed(2) : ''
  },
  {
    key: 'stock',
    label: 'Stock',
    description: 'Cantidad de unidades disponibles en inventario.',
    order: 15,
    type: 'number',
    exportable: true,
    importable: true,
    requiredForCreate: true,
    requiredForPublish: true,
    adminOnly: false,
    nullable: false,
    blankBehavior: 'ignore',
    example: '15',
    synonyms: ['stock', 'cantidad', 'inventory', 'unidades', 'disponible'],
    exportResolver: p => String(getCanonicalProductStock(p))
  },
  {
    key: 'is_featured',
    label: 'Destacado',
    description: 'Indica si el producto se destaca en la tienda principal (Sí / No).',
    order: 16,
    type: 'enum',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    allowedValues: [
      { value: 'true', label: 'Sí' },
      { value: 'false', label: 'No' }
    ],
    controlledValidation: { type: 'list', source: 'destacado' },
    example: 'No',
    synonyms: ['is_featured', 'destacado', 'featured'],
    exportResolver: p => p.is_featured ? 'Sí' : 'No'
  },

  // --- CONDICIÓN ---
  {
    key: 'condition',
    label: 'Condición',
    description: 'Estado del producto (ej: Nuevo Sellado, Usado Impecable).',
    order: 17,
    type: 'enum',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    allowedValues: CONDITION_OPTIONS.map(c => ({ value: c.value, label: `${c.label} (${c.value})` })),
    controlledValidation: { type: 'list', source: 'conditions' },
    example: 'Nuevo Sellado (new_sealed)',
    synonyms: ['condition', 'condición', 'condicion', 'estado_producto'],
    exportResolver: p => getConditionLabel(p.condition)
  },
  {
    key: 'condition_notes',
    label: 'Notas de condición',
    description: 'Observaciones o detalles sobre el estado específico de la pieza o caja.',
    order: 18,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'erase',
    example: 'Caja con ligero desgaste en esquina superior derecha.',
    synonyms: ['condition_notes', 'notas de condición', 'notas de condicion', 'detalles_condicion'],
    exportResolver: p => p.condition_notes || ''
  },

  // --- IDENTIFICADORES ---
  {
    key: 'ean_upc',
    label: 'EAN / UPC',
    description: 'Código de barras universal EAN-13, UPC o GTIN del fabricante.',
    order: 19,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: '5010993792054',
    synonyms: ['ean_upc', 'ean', 'upc', 'gtin', 'codigo_barras', 'barcode'],
    exportResolver: p => p.ean_upc || p.metadata?.gtin || p.metadata?.ean_upc || ''
  },

  // --- LOGÍSTICA ---
  {
    key: 'weight_kg',
    label: 'Peso (kg)',
    description: 'Peso físico del producto empaquetado en kilogramos.',
    order: 20,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: '0.45',
    synonyms: ['weight_kg', 'peso', 'weight', 'peso_kg'],
    exportResolver: p => p.weight_kg !== undefined && p.weight_kg !== null ? Number(p.weight_kg).toFixed(3) : ''
  },
  {
    key: 'dimensions_length',
    label: 'Largo (cm)',
    description: 'Largo del paquete en centímetros.',
    order: 21,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: '25.0',
    synonyms: ['dimensions_length', 'largo', 'length', 'largo_cm'],
    exportResolver: p => p.dimensions_length !== undefined && p.dimensions_length !== null ? Number(p.dimensions_length).toFixed(1) : ''
  },
  {
    key: 'dimensions_width',
    label: 'Ancho (cm)',
    description: 'Ancho del paquete en centímetros.',
    order: 22,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: '15.0',
    synonyms: ['dimensions_width', 'ancho', 'width', 'ancho_cm'],
    exportResolver: p => p.dimensions_width !== undefined && p.dimensions_width !== null ? Number(p.dimensions_width).toFixed(1) : ''
  },
  {
    key: 'dimensions_height',
    label: 'Alto (cm)',
    description: 'Alto del paquete en centímetros.',
    order: 23,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: '10.0',
    synonyms: ['dimensions_height', 'alto', 'height', 'alto_cm'],
    exportResolver: p => p.dimensions_height !== undefined && p.dimensions_height !== null ? Number(p.dimensions_height).toFixed(1) : ''
  },
  {
    key: 'mbe_packaging_type',
    label: 'Tipo MBE',
    description: 'Tipo de empaque para logística MBE (MBE PAK, MBE Caja o Sin definir).',
    order: 24,
    type: 'enum',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    allowedValues: [
      { value: 'mbe_pak', label: 'MBE PAK' },
      { value: 'mbe_caja', label: 'MBE Caja' },
      { value: 'unclassified', label: 'Sin definir' }
    ],
    controlledValidation: { type: 'list', source: 'mbe_packaging' },
    example: 'MBE PAK',
    synonyms: ['mbe_packaging_type', 'tipo mbe', 'mbe_type', 'empaque mbe', 'mbe_packaging'],
    exportResolver: p => getMbePackagingLabel(p.metadata?.packaging_type || p.metadata?.mbe_service_type)
  },
  {
    key: 'argentina_shipping_status',
    label: 'Estado AR',
    description: 'Estado de elegibilidad para envíos a Argentina (Calculado automáticamente).',
    order: 25,
    type: 'enum',
    exportable: true,
    importable: false,
    adminOnly: false,
    nullable: false,
    blankBehavior: 'ignore',
    allowedValues: [
      { value: 'auto', label: 'Envío automático' },
      { value: 'quote', label: 'Requiere cotización' }
    ],
    example: 'Envío automático',
    synonyms: ['argentina_shipping_status', 'estado ar', 'argentina_status', 'envio_argentina'],
    exportResolver: p => {
      const status = calculateArgentinaShippingStatus(p);
      return status.isEligible ? 'Envío automático' : 'Requiere cotización';
    }
  },

  // --- MARKETPLACE & SEO ---
  {
    key: 'vendor_store_name',
    label: 'Vendedor',
    description: 'Vendedor o tienda responsable del producto (Visible únicamente para Administradores).',
    order: 26,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: true,
    nullable: true,
    blankBehavior: 'ignore',
    relationSource: 'vendors',
    relationValueField: 'id',
    relationLabelField: 'store_name',
    controlledValidation: { type: 'list', source: 'vendors' },
    example: 'Collectibles Oficial',
    synonyms: ['vendor', 'vendor_store_name', 'vendedor', 'tienda', 'seller'],
    exportResolver: p => p.vendor?.store_name || p.vendor?.company_name || 'Collectibles Oficial'
  },
  {
    key: 'seo_title',
    label: 'Título SEO',
    description: 'Título optimizado para motores de búsqueda (Google).',
    order: 27,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'erase',
    example: 'Comprar Figura Batman Legacy 6 Pulgadas | Collectibles Uruguay',
    synonyms: ['seo_title', 'meta_title', 'título seo', 'titulo seo'],
    exportResolver: p => p.seo_title || p.meta_title || ''
  },
  {
    key: 'seo_description',
    label: 'Descripción SEO',
    description: 'Meta descripción para los resultados de búsqueda de Google.',
    order: 28,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'erase',
    example: 'Figura coleccionable original de Batman Legacy. Envíos a todo Uruguay y Argentina.',
    synonyms: ['seo_description', 'meta_description', 'descripción seo', 'descripcion seo'],
    exportResolver: p => p.seo_description || p.meta_description || ''
  },

  // --- ORGANIZACIÓN ---
  {
    key: 'tags',
    label: 'Etiquetas',
    description: 'Etiquetas organizativas separadas por comas.',
    order: 29,
    type: 'array',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'erase',
    controlledValidation: { type: 'list', source: 'tags' },
    example: 'Batman, DC, Coleccionable, Exclusivo',
    synonyms: ['tags', 'etiquetas', 'keywords', 'tags_array'],
    exportResolver: p => Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || '')
  },
  {
    key: 'badge',
    label: 'Cocarda',
    description: 'Insignia o etiqueta promocional (ej: NUEVO, OFERTA, PREORDER).',
    order: 30,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'erase',
    controlledValidation: { type: 'list', source: 'badges' },
    example: 'NUEVO',
    synonyms: ['badge', 'cocarda', 'insignia', 'etiqueta_promocional', 'tag_badge'],
    exportResolver: p => p.badge || p.metadata?.badge || ''
  },

  // --- MULTIMEDIA ---
  {
    key: 'image_url',
    label: 'Imagen principal',
    description: 'URL pública directa de la imagen principal del producto.',
    order: 31,
    type: 'url',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: true,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'ignore',
    example: 'https://collectibles.uy/images/batman-1.jpg',
    synonyms: ['image_url', 'imagen_principal', 'foto', 'image', 'url_imagen', 'img'],
    exportResolver: p => p.image_url || p.metadata?.image_url || ''
  },
  {
    key: 'additional_images',
    label: 'Imágenes adicionales',
    description: 'URLs adicionales separadas por la barra vertical | o comas.',
    order: 32,
    type: 'array',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'erase',
    example: 'https://collectibles.uy/images/batman-2.jpg | https://collectibles.uy/images/batman-3.jpg',
    synonyms: ['additional_images', 'imagenes_adicionales', 'galeria', 'gallery_urls', 'fotos_secundarias'],
    exportResolver: p => Array.isArray(p.gallery) ? p.gallery.map((g: any) => typeof g === 'string' ? g : g.url).filter(Boolean).join(' | ') : ''
  },
  {
    key: 'video_url',
    label: 'URL del Video',
    description: 'Enlace a YouTube o MP4 promocional del producto.',
    order: 33,
    type: 'url',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    nullable: true,
    blankBehavior: 'erase',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    synonyms: ['video_url', 'video_id', 'youtube_url', 'url de video'],
    exportResolver: p => p.video_url || p.metadata?.video_url || (p.metadata?.video_id ? `https://www.youtube.com/watch?v=${p.metadata.video_id}` : '')
  },

  // --- SISTEMA ---
  {
    key: 'status',
    label: 'Estado',
    description: 'Estado de publicación en la plataforma (published, draft, archived).',
    order: 34,
    type: 'enum',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: true,
    adminOnly: false,
    nullable: false,
    blankBehavior: 'ignore',
    allowedValues: [
      { value: 'published', label: 'published (Publicado)' },
      { value: 'draft', label: 'draft (Borrador)' },
      { value: 'archived', label: 'archived (Archivado / Inactivo)' }
    ],
    controlledValidation: { type: 'list', source: 'status' },
    example: 'published',
    synonyms: ['status', 'estado', 'estado_publicacion'],
    exportResolver: p => p.status || 'draft'
  },
  {
    key: 'created_at',
    label: 'Fecha creación',
    description: 'Fecha de registro original del producto en el sistema (Solo lectura en exportaciones).',
    order: 35,
    type: 'date',
    exportable: true,
    importable: false,
    adminOnly: false,
    nullable: false,
    blankBehavior: 'ignore',
    example: '2026-08-20',
    synonyms: ['created_at', 'fecha_creacion', 'creado'],
    exportResolver: p => p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : ''
  },
  {
    key: 'updated_at',
    label: 'Última actualización',
    description: 'Fecha de última modificación registrada (Solo lectura en exportaciones).',
    order: 36,
    type: 'date',
    exportable: true,
    importable: false,
    adminOnly: false,
    nullable: false,
    blankBehavior: 'ignore',
    example: '2026-08-22',
    synonyms: ['updated_at', 'ultima_actualizacion', 'modificado'],
    exportResolver: p => p.updated_at ? new Date(p.updated_at).toISOString().split('T')[0] : ''
  }
];

/**
 * Returns the active fields ordered strictly by `order`.
 * Filters out adminOnly fields if userRole is 'vendor'.
 */
export function getMasterFields(userRole: 'admin' | 'vendor' = 'admin'): ProductFieldDefinition[] {
  return PRODUCT_MASTER_FIELDS
    .filter(f => userRole === 'admin' || !f.adminOnly)
    .sort((a, b) => a.order - b.order);
}

/**
 * Resolves a header string to a master field definition by key, label or synonym.
 * Prioritizes exact key or label match before falling back to synonyms.
 */
export function findFieldDefinition(header: string): ProductFieldDefinition | undefined {
  const norm = header.trim().toLowerCase();
  
  // 1. Exact key or label match first
  const exact = PRODUCT_MASTER_FIELDS.find(f => 
    f.key.toLowerCase() === norm ||
    f.label.toLowerCase() === norm
  );
  if (exact) return exact;

  // 2. Synonym match fallback
  return PRODUCT_MASTER_FIELDS.find(f => 
    f.synonyms && f.synonyms.some(syn => syn.toLowerCase() === norm)
  );
}

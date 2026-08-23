import { CONDITION_OPTIONS, getConditionLabel } from '../config/conditionConfig';
import { getMbePackagingLabel, calculateArgentinaShippingStatus } from './mbeLogisticsUtils';

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
  
  relationSource?: 'brands' | 'categories' | 'subcategories' | 'licenses' | 'vendors';
  relationValueField?: string;
  relationLabelField?: string;
  dependsOn?: string;
  
  allowedValues?: { value: string; label: string }[];
  example: string;
  
  synonyms?: string[];
  
  exportResolver?: (product: any) => string;
}

export const PRODUCT_MASTER_FIELDS: ProductFieldDefinition[] = [
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
    example: 'Figura Batman Legacy 6 Pulgadas Edición Coleccionista',
    synonyms: ['title', 'título', 'titulo', 'nombre', 'producto', 'name', 'articulo', 'artículo'],
    exportResolver: p => p.title || ''
  },
  {
    key: 'description',
    label: 'Descripción',
    description: 'Descripción detallada en formato texto o HTML del producto.',
    order: 3,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: 'Figura articulada de 15 cm con accesorios intercambiables.',
    synonyms: ['description', 'descripción', 'descripcion', 'detalle', 'observaciones'],
    exportResolver: p => p.description || ''
  },
  {
    key: 'short_description',
    label: 'Descripción corta',
    description: 'Resumen conciso del producto para vistas rápidas.',
    order: 4,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: 'Edición exclusiva para coleccionistas.',
    synonyms: ['short_description', 'descripción corta', 'descripcion corta', 'resumen'],
    exportResolver: p => p.short_description || ''
  },
  {
    key: 'brand_name',
    label: 'Marca',
    description: 'Nombre del fabricante o marca real del producto. Seleccionable desde lista vigente.',
    order: 5,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: true,
    adminOnly: false,
    relationSource: 'brands',
    relationValueField: 'id',
    relationLabelField: 'name',
    example: 'Hasbro',
    synonyms: ['brand', 'brand_name', 'marca', 'fabricante', 'manufacturer'],
    exportResolver: p => p.brand?.name || p.metadata?.brand_name || ''
  },
  {
    key: 'category_name',
    label: 'Categoría',
    description: 'Categoría principal del catálogo.',
    order: 6,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: true,
    adminOnly: false,
    relationSource: 'categories',
    relationValueField: 'id',
    relationLabelField: 'name',
    example: 'Figuras de Acción',
    synonyms: ['category', 'category_name', 'categoría', 'categoria', 'rubro', 'grupo'],
    exportResolver: p => p.category?.name || p.metadata?.category_name || ''
  },
  {
    key: 'subcategory_name',
    label: 'Subcategoría',
    description: 'Subcategoría vinculada a la Categoría seleccionada.',
    order: 7,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    relationSource: 'subcategories',
    relationValueField: 'id',
    relationLabelField: 'name',
    dependsOn: 'category_name',
    example: '6 Pulgadas',
    synonyms: ['subcategory', 'subcategory_name', 'subcategoría', 'subcategoria', 'subrubro'],
    exportResolver: p => p.subcategory?.name || p.metadata?.subcategory_name || ''
  },
  {
    key: 'license_name',
    label: 'Licencia',
    description: 'Franquicia o propiedad intelectual asociada al producto (ej. Marvel, DC Comics, Star Wars).',
    order: 8,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    relationSource: 'licenses',
    relationValueField: 'id',
    relationLabelField: 'name',
    example: 'DC Comics',
    synonyms: ['license', 'license_name', 'licencia', 'franquicia', 'franchise', 'propiedad'],
    exportResolver: p => p.license?.name || p.metadata?.license_name || ''
  },
  {
    key: 'base_price',
    label: 'Precio',
    description: 'Precio de venta al público en pesos uruguayos (UYU). Debe ser mayor a 0 para publicar.',
    order: 9,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: true,
    adminOnly: false,
    example: '2990.00',
    synonyms: ['base_price', 'precio', 'price', 'precio base', 'precio de venta', 'unit price'],
    exportResolver: p => p.base_price !== undefined && p.base_price !== null ? Number(p.base_price).toFixed(2) : '0.00'
  },
  {
    key: 'compare_at_price',
    label: 'Precio oferta',
    description: 'Precio anterior o de lista para mostrar descuento (opcional).',
    order: 10,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: '3500.00',
    synonyms: ['compare_at_price', 'precio_comparacion', 'precio anterior', 'precio oferta', 'precio lista'],
    exportResolver: p => p.compare_at_price !== undefined && p.compare_at_price !== null ? Number(p.compare_at_price).toFixed(2) : ''
  },
  {
    key: 'cost_price',
    label: 'Costo',
    description: 'Costo interno de adquisición. Campo administrativo confidencial.',
    order: 11,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: true,
    example: '1800.00',
    synonyms: ['cost_price', 'costo', 'cost', 'precio_costo', 'costo unitario'],
    exportResolver: p => p.cost_price !== undefined && p.cost_price !== null ? Number(p.cost_price).toFixed(2) : (p.metadata?.cost_price ? Number(p.metadata.cost_price).toFixed(2) : '')
  },
  {
    key: 'stock',
    label: 'Stock',
    description: 'Unidades disponibles en inventario. Número entero no negativo.',
    order: 12,
    type: 'number',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: true,
    adminOnly: false,
    example: '15',
    synonyms: ['stock', 'cantidad', 'inventario', 'qty', 'quantity', 'unidades'],
    exportResolver: p => String(p.stock ?? p.variants?.[0]?.inventory_count ?? 0)
  },
  {
    key: 'condition',
    label: 'Condición',
    description: 'Estado físico del producto (New / Sealed, Open Box, Loose, etc.).',
    order: 13,
    type: 'enum',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    allowedValues: CONDITION_OPTIONS.map(c => ({ value: c.value, label: `${c.value} (${c.label})` })),
    example: 'new_sealed',
    synonyms: ['condition', 'condición', 'product_condition', 'estado_fisico'],
    exportResolver: p => p.condition || ''
  },
  {
    key: 'condition_notes',
    label: 'Notas de condición',
    description: 'Detalles específicos del estado o empaque (ej. caja golpeada, incompleto).',
    order: 14,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: 'Caja en excelente estado 9/10 sin abrir.',
    synonyms: ['condition_notes', 'notas_estado', 'observaciones_estado', 'detalles_condicion'],
    exportResolver: p => p.condition_notes || p.metadata?.condition_notes || ''
  },
  {
    key: 'ean_upc',
    label: 'EAN / UPC',
    description: 'Código de barras oficial (GTIN / EAN / UPC).',
    order: 15,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: '5010993792054',
    synonyms: ['ean_upc', 'gtin', 'upc', 'ean', 'codigo_barras', 'barcode'],
    exportResolver: p => p.ean_upc || p.metadata?.ean_upc || p.metadata?.gtin || ''
  },
  {
    key: 'weight_kg',
    label: 'Peso',
    description: 'Peso del paquete en kilogramos (kg). Ejemplo: 0.450',
    order: 16,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: '0.450',
    synonyms: ['weight_kg', 'peso', 'weight', 'peso_kg', 'peso (kg)'],
    exportResolver: p => p.weight_kg !== undefined && p.weight_kg !== null ? String(p.weight_kg) : ''
  },
  {
    key: 'dimensions_length',
    label: 'Largo',
    description: 'Largo del empaque en centímetros (cm).',
    order: 17,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: '25.0',
    synonyms: ['dimensions_length', 'largo', 'length', 'largo_cm'],
    exportResolver: p => p.dimensions_length !== null && p.dimensions_length !== undefined ? String(p.dimensions_length) : ''
  },
  {
    key: 'dimensions_width',
    label: 'Ancho',
    description: 'Ancho del empaque en centímetros (cm).',
    order: 18,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: '15.0',
    synonyms: ['dimensions_width', 'ancho', 'width', 'ancho_cm'],
    exportResolver: p => p.dimensions_width !== null && p.dimensions_width !== undefined ? String(p.dimensions_width) : ''
  },
  {
    key: 'dimensions_height',
    label: 'Alto',
    description: 'Alto del empaque en centímetros (cm).',
    order: 19,
    type: 'decimal',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: '10.0',
    synonyms: ['dimensions_height', 'alto', 'height', 'alto_cm'],
    exportResolver: p => p.dimensions_height !== null && p.dimensions_height !== undefined ? String(p.dimensions_height) : ''
  },
  {
    key: 'mbe_packaging_type',
    label: 'Tipo MBE',
    description: 'Tipo de paquete/empaque MBE asignado (MBE PAK, MBE Caja o Sin definir).',
    order: 20,
    type: 'enum',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    allowedValues: [
      { value: 'mbe_pak', label: 'MBE PAK' },
      { value: 'mbe_caja', label: 'MBE Caja' },
      { value: 'none', label: 'Sin definir' }
    ],
    example: 'MBE PAK',
    synonyms: ['mbe_packaging_type', 'tipo mbe', 'tipo_mbe', 'mbe_type', 'mbe_service_type', 'packaging_type', 'empaque_mbe', 'mbe'],
    exportResolver: p => getMbePackagingLabel(p.metadata?.packaging_type || p.metadata?.mbe_service_type || p.mbe_packaging_type)
  },
  {
    key: 'argentina_shipping_status',
    label: 'Estado AR',
    description: 'Estado de logística e idoneidad para envío a Argentina (Envío automático o Requiere cotización).',
    order: 21,
    type: 'enum',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    allowedValues: [
      { value: 'auto', label: 'Envío automático' },
      { value: 'quote', label: 'Requiere cotización' }
    ],
    example: 'Envío automático',
    synonyms: ['argentina_shipping_status', 'estado ar', 'estado_ar', 'ar_status', 'argentina_status', 'envio_ar', 'envio_argentina'],
    exportResolver: p => calculateArgentinaShippingStatus(p).isEligible ? 'Envío automático' : 'Requiere cotización'
  },
  {
    key: 'vendor_store_name',
    label: 'Vendedor',
    description: 'Nombre comercial de la tienda o vendedor propietario. Campo restringido a administradores.',
    order: 22,
    type: 'relation',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: true,
    relationSource: 'vendors',
    relationValueField: 'id',
    relationLabelField: 'store_name',
    example: 'Collectibles Oficial',
    synonyms: ['vendor_store_name', 'vendedor', 'vendor', 'tienda', 'store'],
    exportResolver: p => p.vendor?.store_name || p.metadata?.vendor_name || 'Collectibles Oficial'
  },
  {
    key: 'tags',
    label: 'Etiquetas',
    description: 'Etiquetas separadas por la barra vertical | o comas.',
    order: 23,
    type: 'array',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: 'Edición Limitada | Exclusivo | Vintage',
    synonyms: ['tags', 'etiquetas', 'tags_list'],
    exportResolver: p => Array.isArray(p.tags) ? p.tags.map((t: any) => typeof t === 'string' ? t : t.name).join(' | ') : (p.metadata?.tags ? (Array.isArray(p.metadata.tags) ? p.metadata.tags.join(' | ') : String(p.metadata.tags)) : '')
  },
  {
    key: 'badge',
    label: 'Cocarda',
    description: 'Texto promocional o distintivo en la tarjeta del producto (ej: Novedad, Destacado).',
    order: 24,
    type: 'text',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: 'Novedad',
    synonyms: ['badge', 'cocarda', 'distintivo', 'insignia'],
    exportResolver: p => p.badge || p.metadata?.badge || ''
  },
  {
    key: 'status',
    label: 'Estado',
    description: 'Estado de publicación (published = publicado/activo, draft = borrador, archived = archivado/inactivo).',
    order: 25,
    type: 'enum',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    allowedValues: [
      { value: 'published', label: 'published (Publicado / Activo)' },
      { value: 'draft', label: 'draft (Borrador)' },
      { value: 'archived', label: 'archived (Archivado / Inactivo)' }
    ],
    example: 'published',
    synonyms: ['status', 'estado', 'estado_publicacion'],
    exportResolver: p => p.status || 'draft'
  },
  {
    key: 'image_url',
    label: 'Imagen principal',
    description: 'URL pública directa de la imagen principal del producto.',
    order: 26,
    type: 'url',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: true,
    adminOnly: false,
    example: 'https://collectibles.uy/images/batman-1.jpg',
    synonyms: ['image_url', 'imagen_principal', 'foto', 'image', 'url_imagen', 'img'],
    exportResolver: p => p.image_url || p.metadata?.image_url || ''
  },
  {
    key: 'additional_images',
    label: 'Imágenes adicionales',
    description: 'URLs adicionales separadas por la barra vertical | o comas.',
    order: 27,
    type: 'array',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: 'https://collectibles.uy/images/batman-2.jpg | https://collectibles.uy/images/batman-3.jpg',
    synonyms: ['additional_images', 'imagenes_adicionales', 'galeria', 'gallery_urls', 'fotos_secundarias'],
    exportResolver: p => Array.isArray(p.gallery) ? p.gallery.map((g: any) => typeof g === 'string' ? g : g.url).join(' | ') : ''
  },
  {
    key: 'created_at',
    label: 'Fecha creación',
    description: 'Fecha de registro original del producto en el sistema (Solo lectura en exportaciones).',
    order: 28,
    type: 'date',
    exportable: true,
    importable: false,
    adminOnly: false,
    example: '2026-08-20',
    synonyms: ['created_at', 'fecha_creacion', 'creado'],
    exportResolver: p => p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : ''
  },
  {
    key: 'updated_at',
    label: 'Última actualización',
    description: 'Fecha de última modificación registrada (Solo lectura en exportaciones).',
    order: 29,
    type: 'date',
    exportable: true,
    importable: false,
    adminOnly: false,
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

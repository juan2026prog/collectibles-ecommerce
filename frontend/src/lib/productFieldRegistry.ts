import { CONDITION_OPTIONS, getConditionLabel } from '../config/conditionConfig';
import { getMbePackagingLabel } from './mbeLogisticsUtils';

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
    synonyms: ['sku', 'codigo', 'código', 'referencia', 'item_code']
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
    synonyms: ['title', 'título', 'titulo', 'nombre', 'producto', 'name', 'articulo', 'artículo']
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
    synonyms: ['description', 'descripción', 'descripcion', 'detalle', 'observaciones']
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
    synonyms: ['short_description', 'descripción corta', 'descripcion corta', 'resumen']
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
    synonyms: ['brand', 'brand_name', 'marca', 'fabricante', 'manufacturer']
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
    synonyms: ['category', 'category_name', 'categoría', 'categoria', 'rubro', 'grupo']
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
    synonyms: ['subcategory', 'subcategory_name', 'subcategoría', 'subcategoria', 'subrubro']
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
    synonyms: ['license', 'license_name', 'licencia', 'franquicia', 'franchise', 'propiedad']
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
    synonyms: ['base_price', 'precio', 'price', 'precio base', 'precio de venta', 'unit price']
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
    synonyms: ['compare_at_price', 'precio_comparacion', 'precio anterior', 'precio oferta', 'precio lista']
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
    synonyms: ['cost_price', 'costo', 'cost', 'precio_costo', 'costo unitario']
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
    synonyms: ['stock', 'cantidad', 'inventario', 'qty', 'quantity', 'unidades']
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
    synonyms: ['condition', 'estado', 'condición', 'product_condition', 'estado_fisico']
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
    synonyms: ['condition_notes', 'notas_estado', 'observaciones_estado', 'detalles_condicion']
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
    synonyms: ['ean_upc', 'gtin', 'upc', 'ean', 'codigo_barras', 'barcode']
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
    synonyms: ['weight_kg', 'peso', 'weight', 'peso_kg', 'peso (kg)']
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
    synonyms: ['dimensions_length', 'largo', 'length', 'largo_cm']
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
    synonyms: ['dimensions_width', 'ancho', 'width', 'ancho_cm']
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
    synonyms: ['dimensions_height', 'alto', 'height', 'alto_cm']
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
    synonyms: ['mbe_packaging_type', 'tipo mbe', 'tipo_mbe', 'mbe_type', 'mbe_service_type', 'packaging_type', 'empaque_mbe', 'mbe']
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
    synonyms: ['argentina_shipping_status', 'estado ar', 'estado_ar', 'ar_status', 'argentina_status', 'envio_ar', 'envio_argentina']
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
    synonyms: ['vendor_store_name', 'vendedor', 'vendor', 'tienda', 'store']
  },
  {
    key: 'tags',
    label: 'Etiquetas',
    description: 'Etiquetas separadas por comas (ej: Edición Limitada, Vintage).',
    order: 23,
    type: 'array',
    exportable: true,
    importable: true,
    requiredForCreate: false,
    requiredForPublish: false,
    adminOnly: false,
    example: 'Edición Limitada, Exclusivo, Vintage',
    synonyms: ['tags', 'etiquetas', 'tags_list']
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
    synonyms: ['badge', 'cocarda', 'distintivo', 'insignia']
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
    synonyms: ['status', 'estado', 'estado_publicacion']
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
    synonyms: ['image_url', 'imagen_principal', 'foto', 'image', 'url_imagen', 'img']
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
    synonyms: ['additional_images', 'imagenes_adicionales', 'galeria', 'gallery_urls', 'fotos_secundarias']
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
    synonyms: ['created_at', 'fecha_creacion', 'creado']
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
    synonyms: ['updated_at', 'ultima_actualizacion', 'modificado']
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
  return PRODUCT_MASTER_FIELDS.find(f => 
    f.key.toLowerCase() === norm ||
    f.label.toLowerCase() === norm ||
    (f.synonyms && f.synonyms.some(syn => syn.toLowerCase() === norm))
  );
}

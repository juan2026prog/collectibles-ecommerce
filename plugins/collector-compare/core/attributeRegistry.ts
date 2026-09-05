import type { AttributeDefinition, ComparedProduct, NormalizedAttributeValue } from '../types/index';
import { normalizeScale, normalizeHeight, normalizeWeight, formatOrFallback } from './normalizationEngine';

export const DEFAULT_ATTRIBUTES: AttributeDefinition[] = [
  {
    attribute_key: 'price',
    label: 'Precio',
    category_scope: 'all',
    data_type: 'currency',
    unit: 'usd',
    priority: 'critical',
    sort_order: 1,
    is_visible: true,
    description: 'Precio comercial de venta al público'
  },
  {
    attribute_key: 'availability',
    label: 'Disponibilidad',
    category_scope: 'all',
    data_type: 'text',
    priority: 'critical',
    sort_order: 2,
    is_visible: true,
    description: 'Stock inmediato, preventa o importación'
  },
  {
    attribute_key: 'origin_type',
    label: 'Origen',
    category_scope: 'all',
    data_type: 'text',
    priority: 'high',
    sort_order: 3,
    is_visible: true,
    description: 'Local en plaza vs Internacional por encargo'
  },
  {
    attribute_key: 'brand',
    label: 'Fabricante',
    category_scope: 'all',
    data_type: 'text',
    priority: 'critical',
    sort_order: 4,
    is_visible: true,
    description: 'Marca fabricante oficial'
  },
  {
    attribute_key: 'license',
    label: 'Franquicia / Saga',
    category_scope: 'all',
    data_type: 'text',
    priority: 'critical',
    sort_order: 5,
    is_visible: true,
    description: 'Propiedad intelectual'
  },
  {
    attribute_key: 'product_line',
    label: 'Línea',
    category_scope: 'all',
    data_type: 'text',
    priority: 'high',
    sort_order: 6,
    is_visible: true,
    description: 'Línea de colección'
  },
  {
    attribute_key: 'scale',
    label: 'Escala',
    category_scope: 'figuras-de-accion',
    data_type: 'scale',
    unit: 'ratio',
    priority: 'critical',
    sort_order: 7,
    is_visible: true,
    description: 'Escala de la figura (1:12, 1:6, 1:4)'
  },
  {
    attribute_key: 'height',
    label: 'Altura',
    category_scope: 'figuras-de-accion',
    data_type: 'dimension',
    unit: 'cm',
    priority: 'high',
    sort_order: 8,
    is_visible: true,
    description: 'Altura estimada en cm y pulgadas'
  },
  {
    attribute_key: 'dimensions',
    label: 'Dimensiones',
    category_scope: 'all',
    data_type: 'dimension',
    unit: 'cm',
    priority: 'medium',
    sort_order: 9,
    is_visible: true,
    description: 'Dimensiones físicas'
  },
  {
    attribute_key: 'weight',
    label: 'Peso',
    category_scope: 'all',
    data_type: 'number',
    unit: 'kg',
    priority: 'high',
    sort_order: 10,
    is_visible: true,
    description: 'Peso del producto'
  },
  {
    attribute_key: 'material',
    label: 'Material',
    category_scope: 'all',
    data_type: 'text',
    priority: 'medium',
    sort_order: 11,
    is_visible: true,
    description: 'PVC, ABS, Polystone, etc.'
  },
  {
    attribute_key: 'articulation_points',
    label: 'Puntos de Articulación',
    category_scope: 'figuras-de-accion',
    data_type: 'number',
    unit: 'pts',
    priority: 'high',
    sort_order: 12,
    is_visible: true,
    description: 'Cantidad de articulaciones'
  },
  {
    attribute_key: 'accessories',
    label: 'Accesorios',
    category_scope: 'figuras-de-accion',
    data_type: 'text',
    priority: 'high',
    sort_order: 13,
    is_visible: true,
    description: 'Accesorios incluidos'
  },
  {
    attribute_key: 'edition_type',
    label: 'Edición',
    category_scope: 'all',
    data_type: 'text',
    priority: 'medium',
    sort_order: 14,
    is_visible: true,
    description: 'Regular, Deluxe, Exclusiva'
  },
  {
    attribute_key: 'release_year',
    label: 'Año',
    category_scope: 'all',
    data_type: 'number',
    unit: 'year',
    priority: 'medium',
    sort_order: 15,
    is_visible: true,
    description: 'Año de lanzamiento'
  },
  {
    attribute_key: 'condition',
    label: 'Condición',
    category_scope: 'all',
    data_type: 'text',
    priority: 'high',
    sort_order: 16,
    is_visible: true,
    description: 'Nuevo sellado vs Usado'
  },
  {
    attribute_key: 'seller_name',
    label: 'Vendedor',
    category_scope: 'all',
    data_type: 'text',
    priority: 'medium',
    sort_order: 17,
    is_visible: true,
    description: 'Collectibles Oficial o Vendor'
  }
];

/**
 * Extracts a specific attribute from a product and returns a NormalizedAttributeValue.
 */
export function resolveProductAttribute(product: ComparedProduct, attrKey: string): NormalizedAttributeValue {
  const meta = product.metadata || {};
  const mlAttrs = product.ml_attributes || [];

  const getMlAttr = (nameOrId: string): string | null => {
    const found = mlAttrs.find(a => 
      a.id?.toLowerCase() === nameOrId.toLowerCase() || 
      a.name?.toLowerCase() === nameOrId.toLowerCase()
    );
    return found ? found.value_name : null;
  };

  switch (attrKey) {
    case 'price': {
      const isIntl = Boolean(product.is_international);
      const priceVal = isIntl 
        ? (product.intl_final_price_usd || product.intl_base_price_usd || product.base_price)
        : product.base_price;
      const currency = isIntl ? 'USD' : 'UYU';
      return {
        raw: priceVal,
        numeric_value: Number(priceVal) || 0,
        display: isIntl ? `USD ${priceVal}` : `$ ${priceVal}`,
        unit: currency,
        is_informed: typeof priceVal === 'number' && priceVal > 0
      };
    }

    case 'availability': {
      const isPreorder = product.status === 'preorder' || meta.is_preorder;
      const isAvailable = product.status === 'active' || product.status === 'available';
      let label = 'No disponible';
      if (isPreorder) label = 'Preventa';
      else if (isAvailable) label = product.is_international ? 'Disponible (Importación)' : 'En Stock Inmediato';

      return {
        raw: product.status,
        display: label,
        is_informed: true
      };
    }

    case 'origin_type': {
      return {
        raw: product.is_international ? 'INTERNACIONAL' : 'LOCAL',
        display: product.is_international ? 'Internacional (Miami → UY)' : 'Local (En Plaza UY)',
        is_informed: true
      };
    }

    case 'brand': {
      const val = product.brand_name || meta.brand || getMlAttr('BRAND') || getMlAttr('FABRICANTE');
      return {
        raw: val,
        display: formatOrFallback(val),
        is_informed: Boolean(val)
      };
    }

    case 'license': {
      const val = product.license_name || meta.license || getMlAttr('FRANCHISE') || getMlAttr('PERSONAJE');
      return {
        raw: val,
        display: formatOrFallback(val),
        is_informed: Boolean(val)
      };
    }

    case 'product_line': {
      const val = meta.product_line || meta.line || getMlAttr('LINEA') || getMlAttr('COLLECTION');
      return {
        raw: val,
        display: formatOrFallback(val),
        is_informed: Boolean(val)
      };
    }

    case 'scale': {
      // 1. From meta or ML attrs or title
      const raw = meta.scale || getMlAttr('ESCALA') || getMlAttr('SCALE');
      const normalized = normalizeScale(raw) || normalizeScale(product.title);
      return {
        raw: raw || normalized,
        display: normalized ? `Escala ${normalized}` : (raw ? String(raw) : 'No informado'),
        unit: 'ratio',
        is_informed: Boolean(normalized || raw)
      };
    }

    case 'height': {
      const raw = meta.height_cm || meta.height || getMlAttr('ALTURA') || product.dimensions?.height;
      const normalized = normalizeHeight(raw) || normalizeHeight(product.title);
      return {
        raw: raw || normalized?.cm,
        numeric_value: normalized?.cm || null,
        display: normalized ? normalized.display : (raw ? `${raw} cm` : 'No informado'),
        unit: 'cm',
        is_informed: Boolean(normalized)
      };
    }

    case 'dimensions': {
      const d = product.dimensions;
      if (d && (d.height || d.length || d.width)) {
        const h = d.height || '-';
        const w = d.width || '-';
        const l = d.length || '-';
        return {
          raw: d,
          display: `${l} x ${w} x ${h} cm`,
          unit: 'cm',
          is_informed: true
        };
      }
      return {
        raw: null,
        display: 'No informado',
        is_informed: false
      };
    }

    case 'weight': {
      const raw = product.weight_kg || (product.intl_weight_grams ? product.intl_weight_grams / 1000 : null) || meta.weight;
      const normalized = normalizeWeight(raw);
      return {
        raw: raw,
        numeric_value: normalized?.kg || null,
        display: normalized ? normalized.display : 'No informado',
        unit: 'kg',
        is_informed: Boolean(normalized)
      };
    }

    case 'material': {
      const val = meta.material || getMlAttr('MATERIAL');
      return {
        raw: val,
        display: formatOrFallback(val),
        is_informed: Boolean(val)
      };
    }

    case 'articulation_points': {
      const raw = meta.articulation_points || meta.articulations || getMlAttr('PUNTOS_ARTICULACION');
      const num = raw ? parseInt(String(raw), 10) : null;
      return {
        raw: raw,
        numeric_value: !isNaN(num as number) ? num : null,
        display: num !== null && !isNaN(num) ? `${num} puntos` : (raw ? String(raw) : 'No informado'),
        unit: 'pts',
        is_informed: num !== null && !isNaN(num)
      };
    }

    case 'accessories': {
      const val = meta.accessories || meta.included_items || getMlAttr('ACCESORIOS');
      return {
        raw: val,
        display: formatOrFallback(val),
        is_informed: Boolean(val)
      };
    }

    case 'edition_type': {
      const val = meta.edition || meta.edition_type || getMlAttr('EDICION');
      return {
        raw: val,
        display: formatOrFallback(val),
        is_informed: Boolean(val)
      };
    }

    case 'release_year': {
      const raw = meta.release_year || meta.year || getMlAttr('ANIO');
      const year = raw ? parseInt(String(raw), 10) : null;
      return {
        raw: raw,
        numeric_value: year,
        display: year ? String(year) : 'No informado',
        is_informed: Boolean(year)
      };
    }

    case 'condition': {
      const c = (product.condition || 'nuevo').toLowerCase();
      let label = 'Nuevo sellado';
      if (c.includes('used') || c.includes('usado')) label = 'Usado / Exhibición';
      if (c.includes('refurbished') || c.includes('reacondicionado')) label = 'Reacondicionado';
      return {
        raw: product.condition,
        display: label,
        is_informed: true
      };
    }

    case 'seller_name': {
      const name = product.seller_store_name || (product.is_international ? 'Collectibles Global' : 'Collectibles Oficial');
      return {
        raw: name,
        display: name,
        is_informed: true
      };
    }

    default: {
      const generic = meta[attrKey] || getMlAttr(attrKey);
      return {
        raw: generic,
        display: formatOrFallback(generic),
        is_informed: Boolean(generic)
      };
    }
  }
}

/**
 * Hydrates a list of products with their normalized attributes map.
 */
export function hydrateProductAttributes(
  products: ComparedProduct[],
  attributes: AttributeDefinition[]
): ComparedProduct[] {
  return products.map(p => {
    const normalized: Record<string, NormalizedAttributeValue> = {};
    for (const attr of attributes) {
      normalized[attr.attribute_key] = resolveProductAttribute(p, attr.attribute_key);
    }
    return {
      ...p,
      normalized_attributes: normalized
    };
  });
}

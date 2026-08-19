/**
 * Centralized Database Error Mapper
 * Maps raw PostgreSQL / Supabase exception objects to clear, human-friendly UX messages.
 * Collectibles.uy / Collectibles2026
 */

export function mapDatabaseErrorToUserMessage(error: any): string {
  if (!error) return 'Ocurrió un error insospechado al procesar el producto.';

  // Log raw technical error for developer/admin debugging in browser console
  console.error('[DB_ERROR_AUDIT]', error);

  const code = typeof error === 'object' ? error.code : undefined;
  const message = typeof error === 'object' ? (error.message || error.details || '') : String(error);

  // 1. PostgreSQL Check Constraint Violations (code 23514)
  if (code === '23514' || message.includes('check constraint')) {
    if (message.includes('check_product_condition')) {
      return 'El estado de conservación seleccionado no es válido para este producto.';
    }
    if (message.includes('products_brand_audit_status_check')) {
      return 'El estado de auditoría de marca del producto no cumple con las reglas del catálogo.';
    }
    return 'Un valor ingresado no cumple con los formatos o restricciones aceptadas por el sistema.';
  }

  // 2. PostgreSQL Unique Constraint Violations (code 23505)
  if (code === '23505' || message.includes('unique constraint') || message.includes('already exists')) {
    if (message.includes('products_slug_key')) {
      return 'Ya existe un producto registrado con una dirección idéntica. Se ajustará el enlace automáticamente.';
    }
    if (message.includes('products_ml_item_id_unique')) {
      return 'Esta publicación de Mercado Libre ya se encuentra vinculada a otro producto en la plataforma.';
    }
    if (message.includes('product_variants_sku_key') || message.includes('sku')) {
      return 'El código SKU ingresado ya está asignado a otro producto o variante activa.';
    }
    return 'Ya existe otro producto con los mismos datos identificadores registrados.';
  }

  // 3. PostgreSQL Foreign Key Violations (code 23503)
  if (code === '23503' || message.includes('foreign key constraint')) {
    if (message.includes('products_brand_id_fkey')) {
      return 'La marca seleccionada no se encuentra disponible en la base oficial de marcas.';
    }
    if (message.includes('products_category_id_fkey')) {
      return 'La categoría seleccionada ya no existe en el catálogo activo.';
    }
    if (message.includes('products_vendor_store_id_fkey')) {
      return 'La tienda seleccionada no existe o fue deshabilitada.';
    }
    return 'Uno de los elementos asociados (marca, categoría o tienda) no existe en la base de datos.';
  }

  // 4. Supabase Row Level Security (RLS) / Permission Violations (code 42501)
  if (code === '42501' || message.includes('row-level security') || message.includes('violates row-level security policy')) {
    return 'No tenés permisos para realizar modificaciones sobre esta tienda o producto.';
  }

  // 5. Trigger-launched Custom Exceptions & Server-Side Guardrails
  if (message.includes('PRODUCT_PUBLISHED_TITLE_REQUIRED')) {
    return 'El título del producto es obligatorio para publicar.';
  }
  if (message.includes('PRODUCT_PUBLISHED_PRICE_REQUIRED')) {
    return 'Ingresá un precio mayor a $0 para publicar.';
  }
  if (message.includes('PRODUCT_PUBLISHED_CATEGORY_REQUIRED')) {
    return 'Seleccioná al menos una categoría.';
  }
  if (message.includes('PRODUCT_PUBLISHED_BRAND_REQUIRED')) {
    return 'Seleccioná la marca o fabricante del producto.';
  }
  if (message.includes('PRODUCT_PUBLISHED_IMAGE_REQUIRED')) {
    return 'Agregá al menos una foto principal.';
  }
  if (message.includes('PRODUCT_PUBLISHED_CONDITION_REQUIRED')) {
    return 'Seleccioná el estado del producto antes de publicar.';
  }
  if (message.includes('PRODUCT_NEGATIVE_STOCK')) {
    return 'El stock no puede ser negativo.';
  }
  if (message.includes('PRODUCT_VENDOR_GENERIC_BRAND_FORBIDDEN')) {
    return 'Los vendedores deben seleccionar una marca oficial o solicitar una nueva.';
  }
  if (message.includes('PRODUCT_VENDOR_LICENSE_AS_BRAND_FORBIDDEN')) {
    return 'Debes seleccionar una marca fabricante oficial (no una franquicia o licencia).';
  }
  if (message.includes('La tienda seleccionada no pertenece a tu cuenta')) {
    return 'La tienda seleccionada no pertenece a tu cuenta de vendedor.';
  }
  if (message.includes('La tienda seleccionada no existe')) {
    return 'La tienda seleccionada no existe en el sistema.';
  }

  // Fallback for user display: strip internal technical SQL jargon
  if (typeof message === 'string') {
    const cleanMsg = message
      .replace(/^GraphQL error:\s*/i, '')
      .replace(/^PostgREST error:\s*/i, '')
      .replace(/new row for relation.*violates.*/i, 'Los datos no cumplen con los requisitos de validación.')
      .replace(/violates check constraint.*/i, 'El valor ingresado no es válido.')
      .replace(/violates unique constraint.*/i, 'Registro duplicado.');
    return cleanMsg;
  }

  return 'No se pudo guardar el producto. Por favor verificá los datos e intentá nuevamente.';
}

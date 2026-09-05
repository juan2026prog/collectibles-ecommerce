import type { VaultItem, VaultPublicShowcaseItem, VaultUserProfile } from '../types/index';

/**
 * Strips private financial, transaction, and note fields from a VaultItem
 * for secure public sharing or showcase pages.
 */
export function sanitizeVaultItemForPublic(item: VaultItem): VaultPublicShowcaseItem | null {
  // If item is marked private, never expose it
  if (item.visibility === 'PRIVATE') {
    return null;
  }

  const isCatalog = Boolean(item.product_id && item.product);
  const title = isCatalog
    ? item.product?.title || 'Pieza de Catálogo'
    : item.external_item?.name || 'Pieza Coleccionable';

  const brand = isCatalog 
    ? (item.product?.brand_name || item.product?.brand?.name) 
    : item.external_item?.brand_name;
  const license = isCatalog 
    ? (item.product?.license_name || item.product?.license?.name) 
    : item.external_item?.license_name;
  const character = item.external_item?.character || null;
  const scale = item.external_item?.scale || null;

  const imageUrl =
    item.custom_image_url ||
    (isCatalog ? (item.product?.primary_image_url || item.product?.images?.[0]?.url) : item.external_item?.image_url) ||
    '';

  return {
    id: item.id,
    title,
    brand_name: brand || null,
    license_name: license || null,
    character,
    scale,
    condition: item.condition,
    box_condition: item.box_condition,
    image_url: imageUrl,
    edition_number: item.edition_number || null,
    is_catalog: isCatalog,
    slug: isCatalog ? item.product?.slug : undefined
    // NOTICE: purchase_price, purchase_source, purchase_date, notes, user_id are strictly OMITTED.
  };
}

/**
 * Batch sanitizes an array of items for public collection showcase
 */
export function sanitizeCollectionForPublic(items: any[], itemCount?: number): any {
  if (typeof itemCount === 'number' && items && !Array.isArray(items)) {
    // Single collection object passed
    const col = items as any;
    return {
      id: col.id,
      name: col.name,
      slug: col.slug,
      description: col.description,
      cover_image: col.cover_image,
      item_count: itemCount
    };
  }

  if (Array.isArray(items)) {
    const result: VaultPublicShowcaseItem[] = [];
    for (const it of items) {
      const pub = sanitizeVaultItemForPublic(it);
      if (pub) {
        result.push(pub);
      }
    }
    return result;
  }

  return [];
}

/**
 * Sanitizes user profile to expose only public safe showcase fields
 */
export function sanitizeUserProfileForPublic(profile: Partial<VaultUserProfile> | any): {
  handle: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
} {
  return {
    handle: profile.handle || '',
    display_name: profile.display_name || profile.handle || 'Coleccionista',
    bio: profile.bio || undefined,
    avatar_url: profile.avatar_url || undefined
  };
}

/**
 * Verifies that an object does NOT contain any private financial or secret keys.
 */
export function assertFinancialPrivacy(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return true;
  const forbiddenKeys = [
    'purchase_price',
    'purchase_date',
    'purchase_currency',
    'purchase_store',
    'notes',
    'user_id',
    'receipt_url'
  ];

  for (const key of forbiddenKeys) {
    if (key in obj && obj[key] !== undefined) {
      return false;
    }
  }
  return true;
}

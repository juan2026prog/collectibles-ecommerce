import type { ProductFamily, CanonicalProduct } from '../../types/sourcing';

export class ProductFamilyService {
  /**
   * Crea o resuelve la entidad ProductFamily para un grupo de productos canónicos.
   */
  static resolveFamilyForProduct(
    product: { brand: string; franchise: string; character: string; line?: string },
    existingFamilies: ProductFamily[] = []
  ): ProductFamily {
    const familyName = `${product.franchise} — ${product.brand} ${product.character}`.trim();
    
    const existing = existingFamilies.find(f => 
      f.name.toLowerCase() === familyName.toLowerCase() ||
      (f.franchise.toLowerCase() === product.franchise.toLowerCase() && f.brand.toLowerCase() === product.brand.toLowerCase())
    );

    if (existing) {
      return existing;
    }

    return {
      id: `fam-${Math.random().toString(36).substring(2, 9)}`,
      name: familyName,
      franchise: product.franchise,
      brand: product.brand,
      description: `Familia de productos de ${product.character} en ${product.franchise} de ${product.brand}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Agrupa productos canónicos por su familia de productos.
   */
  static groupCanonicalProductsByFamily(products: CanonicalProduct[]): Map<string, CanonicalProduct[]> {
    const grouped = new Map<string, CanonicalProduct[]>();

    for (const prod of products) {
      const familyKey = prod.family_id || `${prod.franchise}_${prod.brand}_${prod.character}`;
      if (!grouped.has(familyKey)) {
        grouped.set(familyKey, []);
      }
      grouped.get(familyKey)!.push(prod);
    }

    return grouped;
  }
}

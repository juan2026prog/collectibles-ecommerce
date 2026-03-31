import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ═══ useProducts ═══
interface ProductFilters {
  category?: string;
  brand?: string;
  search?: string;
  badge?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

export function useProducts(filters: ProductFilters = {}) {
  const [products, setProducts] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);

    // ── Step 1: resolve slug → id (Supabase can't filter on join paths) ──
    let categoryId: string | null = null;
    let brandId: string | null = null;

    if (filters.category) {
      const { data } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', filters.category)
        .single();
      categoryId = data?.id ?? null;
      // If slug not found → no results
      if (!categoryId) { setProducts([]); setCount(0); setLoading(false); return; }
    }

    if (filters.brand) {
      const { data } = await supabase
        .from('brands')
        .select('id')
        .eq('slug', filters.brand)
        .single();
      brandId = data?.id ?? null;
      if (!brandId) { setProducts([]); setCount(0); setLoading(false); return; }
    }

    // ── Step 2: main product query ──
    let query = supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, slug),
        brand:brands(id, name, slug, logo_url),
        images:product_images(id, url, alt_text, sort_order, is_primary),
        variants:product_variants(id, sku, name, price_adjustment, inventory_count)
      `, { count: 'exact' })
      .eq('status', 'published');

    if (categoryId) query = query.eq('category_id', categoryId);
    if (brandId) query = query.eq('brand_id', brandId);
    if (filters.badge) query = query.eq('badge', filters.badge);
    if (filters.featured) query = query.eq('is_featured', true);
    if (filters.minPrice) query = query.gte('base_price', filters.minPrice);
    if (filters.maxPrice) query = query.lte('base_price', filters.maxPrice);
    if (filters.search) {
      // Use ilike for simple search, fallback from textSearch if vector unavailable
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    // Sort
    switch (filters.sortBy) {
      case 'price-low': query = query.order('base_price', { ascending: true }); break;
      case 'price-high': query = query.order('base_price', { ascending: false }); break;
      case 'newest': query = query.order('created_at', { ascending: false }); break;
      case 'name': query = query.order('title', { ascending: true }); break;
      default: query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false });
    }

    const limit = filters.limit || 12;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count: totalCount, error } = await query;
    if (!error && data) {
      setProducts(data);
      setCount(totalCount || 0);
    }
    setLoading(false);
  }, [JSON.stringify(filters)]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  return { products, count, loading, refetch: fetchProducts };
}

// ═══ useProduct (single) ═══
export function useProduct(slug: string | undefined) {
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(id, name, slug),
          brand:brands(id, name, slug),
          images:product_images(id, url, alt_text, sort_order, is_primary),
          variants:product_variants(id, sku, name, price_adjustment, inventory_count),
          reviews:reviews(id, rating, title, body, created_at, user:profiles(first_name, last_name))
        `)
        .eq('slug', slug)
        .single();
      setProduct(data);
      setLoading(false);
    }
    fetch();
  }, [slug]);

  return { product, loading };
}

// ═══ useCategories ═══
export function useCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      setCategories(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { categories, loading };
}

// ═══ useBrands ═══
export function useBrands() {
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('brands')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      setBrands(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { brands, loading };
}

// ═══ useBanners ═══
export function useBanners() {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('banners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      setBanners(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { banners, loading };
}

// ═══ useCart (localStorage + DB sync) ═══
export interface CartItem {
  product_id: string;
  variant_id: string;
  quantity: number;
  title: string;
  price: number;
  image: string;
  variant_name: string;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem('cart');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

  const addItem = (item: CartItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.variant_id === item.variant_id);
      if (existing) {
        return prev.map(i => i.variant_id === item.variant_id ? { ...i, quantity: i.quantity + item.quantity } : i);
      }
      return [...prev, item];
    });
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.variant_id !== variantId));
    } else {
      setItems(prev => prev.map(i => i.variant_id === variantId ? { ...i, quantity } : i));
    }
  };

  const removeItem = (variantId: string) => {
    setItems(prev => prev.filter(i => i.variant_id !== variantId));
  };

  const clearCart = () => setItems([]);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, addItem, updateQuantity, removeItem, clearCart, total, count };
}

// ═══ useWishlist ═══
export function useWishlist(userId: string | undefined) {
  const [wishlist, setWishlist] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    async function fetch() {
      const { data } = await supabase
        .from('wishlists')
        .select('product_id')
        .eq('user_id', userId);
      setWishlist((data || []).map(w => w.product_id));
    }
    fetch();
  }, [userId]);

  const toggleWishlist = async (productId: string) => {
    if (!userId) return;
    if (wishlist.includes(productId)) {
      await supabase.from('wishlists').delete().eq('user_id', userId).eq('product_id', productId);
      setWishlist(prev => prev.filter(id => id !== productId));
    } else {
      await supabase.from('wishlists').insert({ user_id: userId, product_id: productId });
      setWishlist(prev => [...prev, productId]);
    }
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  return { wishlist, toggleWishlist, isInWishlist };
}

// ═══ useProductGroups ═══
export function useProductGroups() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('product_groups')
        .select(`
          id, name, slug, description, type, rules_json,
          product_group_items (
            product:products (
              *,
              category:categories(id, name, slug),
              brand:brands(id, name, slug),
              images:product_images(id, url, alt_text, sort_order, is_primary),
              variants:product_variants(id, sku, name, price_adjustment, inventory_count)
            )
          )
        `)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
        
      setGroups(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { groups, loading };
}

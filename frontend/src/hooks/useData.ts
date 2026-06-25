import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAnalytics } from '../contexts/AnalyticsContext';

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
  group?: string;
  isInternational?: boolean;
  includeDrafts?: boolean;
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
    let productIds: string[] | null = null;

    if (filters.group) {
      const { data: groupData } = await supabase
        .from('product_groups')
        .select('id')
        .eq('slug', filters.group)
        .eq('is_active', true)
        .single();

      if (groupData) {
        const { data: items } = await supabase
          .from('product_group_items')
          .select('product_id')
          .eq('group_id', groupData.id);
        
        if (items && items.length > 0) {
          productIds = items.map(x => x.product_id);
        } else {
          setProducts([]);
          setCount(0);
          setLoading(false);
          return;
        }
      } else {
        setProducts([]);
        setCount(0);
        setLoading(false);
        return;
      }
    }

    if (filters.category) {
      const { data } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', filters.category)
        .eq('is_active', true)
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
        .eq('status', 'approved')
        .eq('is_active', true)
        .eq('is_public', true)
        .single();
      brandId = data?.id ?? null;
      if (!brandId) { setProducts([]); setCount(0); setLoading(false); return; }
    }

    // ── Step 2: main product query ──
    if (filters.isInternational) {
      let query = supabase
        .from('international_products')
        .select('*', { count: 'exact' });

      if (!filters.includeDrafts) {
        query = query.eq('status', 'published');
      } else {
        query = query.in('status', ['published', 'draft']);
      }

      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      switch (filters.sortBy) {
        case 'price-low': query = query.order('final_price_usd', { ascending: true }); break;
        case 'price-high': query = query.order('final_price_usd', { ascending: false }); break;
        case 'newest': query = query.order('created_at', { ascending: false }); break;
        case 'name': query = query.order('title', { ascending: true }); break;
        default: query = query.order('created_at', { ascending: false });
      }

      const limit = filters.limit || 12;
      const offset = filters.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, count: totalCount, error } = await query;
      if (!error && data) {
        const mappedProducts = data.map((item: any) => ({
          id: item.id,
          slug: item.id, // we use ID as slug for international products
          title: item.title,
          description: item.description,
          base_price: item.final_price_usd,
          compare_at_price: item.amazon_list_price_usd || item.final_price_usd,
          images: [{ url: item.image_url, is_primary: true }],
          brand: { name: item.brand, slug: item.brand },
          category: { name: item.category, slug: item.category },
          source_provider: 'zinc',
          is_active: true,
          status: item.status,
          raw_international_data: item
        }));
        setProducts(mappedProducts);
        setCount(totalCount || 0);
      }
      setLoading(false);
      return;
    }

    const selectStr = `
        *,
        category:categories(id, name, slug),
        brand:brands(id, name, slug, logo_url),
        images:product_images(id, url, alt_text, sort_order, is_primary),
        variants:product_variants(id, sku, name, price_adjustment, inventory_count),
        product_tags:product_tags(tag_id),
        vendor:vendors(id, store_name, slug, logo_url)
        ${categoryId ? ', product_categories!inner(category_id)' : ''}
    `;

    let query = supabase
      .from('products')
      .select(selectStr, { count: 'exact' })
      .eq('status', 'published')
      .eq('is_active', true);

    if (categoryId) query = query.eq('product_categories.category_id', categoryId);
    if (brandId) query = query.eq('brand_id', brandId);
    if (productIds) query = query.in('id', productIds);
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
          product_tags:product_tags(tag_id),
          vendor:vendors(id, store_name, slug, logo_url),
          reviews:reviews(id, rating, title, body, created_at, user:profiles(first_name, last_name))
        `)
        .eq('slug', slug)
        .single();
        
      if (data) {
        setProduct(data);
      } else {
        // Fallback for international products (slug is UUID)
        const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(slug);
        if (isUUID) {
          const { data: intlData } = await supabase
            .from('international_products')
            .select('*')
            .eq('id', slug)
            .single();
            
          if (intlData) {
            setProduct({
              id: intlData.id,
              slug: intlData.id,
              title: intlData.title,
              description: intlData.description,
              base_price: intlData.final_price_usd,
              compare_at_price: intlData.amazon_list_price_usd || intlData.final_price_usd,
              images: [{ url: intlData.image_url, is_primary: true }],
              brand: { name: intlData.brand, slug: intlData.brand },
              category: { name: intlData.category, slug: intlData.category },
              source_provider: 'zinc',
              is_active: true,
              status: intlData.status,
              raw_international_data: intlData,
              international_products: [intlData]
            });
          } else {
            setProduct(null);
          }
        } else {
          setProduct(null);
        }
      }
      setLoading(false);
    }
    fetch();
  }, [slug]);

  return { product, loading };
}

// --------------------------------------------------------------------------------
// useProductBuyBox (Buy Box V2)
// --------------------------------------------------------------------------------
export function useProductBuyBox(productId: string | undefined) {
  const [buyBox, setBuyBox] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) {
      setBuyBox(null);
      setLoading(false);
      return;
    }
    
    async function fetch() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_product_buybox', { p_product_id: productId });
        if (error) {
          console.error('Error fetching buy box:', error);
          setBuyBox(null);
        } else {
          setBuyBox(data);
        }
      } catch (err) {
        console.error('Exception fetching buy box:', err);
        setBuyBox(null);
      }
      setLoading(false);
    }
    fetch();
  }, [productId]);

  return { buyBox, loading };
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
        .order('sort_order')
        .order('name');
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
        .eq('status', 'approved')
        .eq('is_active', true)
        .eq('is_public', true)
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
  category_id?: string;
  brand_id?: string;
  vendor_id?: string;
  vendor_name?: string;
  vendor_slug?: string;
  vendor_logo?: string;
  tag_ids?: string[];
  is_international?: boolean;
  urubox_estimate?: number;
  weight_kg?: number;
  category_name?: string;
}

export function useCart() {
  const { trackEvent } = useAnalytics();
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem('cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Filter out broken items that might have NaN, null or undefined prices
          return parsed.filter(item => typeof item.price === 'number' && !isNaN(item.price));
        }
      }
      return [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

  const addItem = (item: CartItem) => {
    const numericPrice = Number(item.price);
    if (isNaN(numericPrice) || item.price === null || item.price === undefined) {
      console.warn('[Cart] Rejected item with invalid price:', item);
      return; // Do not add broken items
    }
    
    // Ensure the item always stores the price as a number type
    const safeItem = { ...item, price: numericPrice };

    // 📊 Track Analytics (Non-blocking)
    try {
      if (typeof trackEvent === 'function') {
        trackEvent('AddToCart', {
          content_name: safeItem.title,
          content_ids: [safeItem.product_id],
          value: safeItem.price * safeItem.quantity,
          currency: 'UYU'
        });
      }
    } catch (err) {
      console.warn('[Cart] Analytics failed, but item will be added:', err);
    }

    setItems(prev => {
      const existing = prev.find(i => i.variant_id === safeItem.variant_id);
      if (existing) {
        return prev.map(i => i.variant_id === safeItem.variant_id ? { ...i, quantity: i.quantity + safeItem.quantity } : i);
      }
      return [...prev, safeItem];
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


// ═══ useProductGroups ═══
export function useProductGroups() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('product_groups')
        .select(`
          id, name, slug, description, type, rules_json, show_on_home,
          product_group_items (
            product:products (
              *,
              category:categories(id, name, slug),
              brand:brands(id, name, slug),
              images:product_images(id, url, alt_text, sort_order, is_primary),
              variants:product_variants(id, sku, name, price_adjustment, inventory_count),
              product_tags:product_tags(tag_id),
              vendor:vendors(id, store_name, slug, logo_url)
            )
          )
        `)
        .eq('is_active', true)
        .eq('show_on_home', true)
        .order('sort_order', { ascending: true });
        
      setGroups(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { groups, loading };
}

// ═══ useProductGroup (single) ═══
export function useProductGroup(slug: string | undefined) {
  const [group, setGroup] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    async function fetch() {
      setLoading(true);
      const { data, error } = await supabase
        .from('product_groups')
        .select(`
          id, name, slug, description, type, rules_json, is_active, show_on_home,
          product_group_items (
            product:products (
              *,
              category:categories(id, name, slug),
              brand:brands(id, name, slug),
              images:product_images(id, url, alt_text, sort_order, is_primary),
              variants:product_variants(id, sku, name, price_adjustment, inventory_count),
              product_tags:product_tags(tag_id),
              vendor:vendors(id, store_name, slug, logo_url)
            )
          )
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (!error && data) {
        setGroup(data);
        const mappedProducts = (data.product_group_items || [])
          .map((item: any) => item.product)
          .filter((p: any) => p && p.status === 'published' && p.is_active !== false);
        setProducts(mappedProducts);
      } else {
        setGroup(null);
        setProducts([]);
      }
      setLoading(false);
    }
    fetch();
  }, [slug]);

  return { group, products, loading };
}

// ═══ useProductGroupMetadata (single) ═══
export function useProductGroupMetadata(slug: string | undefined) {
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setGroup(null);
      setLoading(false);
      return;
    }
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('product_groups')
        .select('id, name, slug, description, is_active, show_on_home')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();
      setGroup(data || null);
      setLoading(false);
    }
    fetch();
  }, [slug]);


  return { group, loading };
}

// ═══ useFilterMappings ═══
export function useFilterMappings() {
  const [mappings, setMappings] = useState<{ category_id: string; brand_id: string }[]>([]);

  useEffect(() => {
    async function fetchMappings() {
      const { data } = await supabase
        .from('products')
        .select('brand_id, product_categories!inner(category_id)')
        .eq('status', 'published')
        .eq('is_active', true);
        
      if (data) {
        const pairs: { category_id: string; brand_id: string }[] = [];
        data.forEach((p: any) => {
          if (p.brand_id && p.product_categories) {
            const cats = Array.isArray(p.product_categories) ? p.product_categories : [p.product_categories];
            cats.forEach((c: any) => {
              if (c.category_id) pairs.push({ category_id: c.category_id, brand_id: p.brand_id });
            });
          }
        });
        setMappings(pairs);
      }
    }
    fetchMappings();
  }, []);

  return mappings;
}

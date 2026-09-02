import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAnalytics } from '../contexts/AnalyticsContext';

// ═══ useProducts ═══
interface ProductFilters {
  category?: string;
  brand?: string;
  license?: string;
  theme?: string;
  search?: string;
  badge?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
  group?: string;
  isInternational?: boolean;
  availability?: 'all' | 'local' | 'international';
  exchangeRate?: number;
  includeDrafts?: boolean;
  vendor_store_id?: string;
  collection_id?: string;
  skipCount?: boolean;
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

    let categoryIds: string[] | null = null;
    if (filters.category) {
      const { data } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', filters.category)
        .eq('is_active', true)
        .single();
      categoryId = data?.id ?? null;
      if (!categoryId) { setProducts([]); setCount(0); setLoading(false); return; }
      
      // Fetch subcategories
      const { data: subcats } = await supabase
        .from('categories')
        .select('id')
        .eq('parent_id', categoryId)
        .eq('is_active', true);
      
      if (subcats && subcats.length > 0) {
        categoryIds = [categoryId, ...subcats.map(x => x.id)];
      } else {
        categoryIds = [categoryId];
      }
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

    if (filters.license) {
      const { data: licData } = await supabase
        .from('licenses')
        .select('id')
        .eq('slug', filters.license)
        .eq('is_active', true)
        .maybeSingle();

      if (licData) {
        const { data: directProds } = await supabase
          .from('products')
          .select('id')
          .eq('license_id', licData.id);
        
        const licProdIds = directProds?.map(x => x.id) || [];

        if (licProdIds.length > 0) {
          if (productIds) {
            productIds = productIds.filter(id => licProdIds.includes(id));
          } else {
            productIds = licProdIds;
          }
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

    if (filters.theme) {
      const { data: themeData } = await supabase
        .from('themes')
        .select('id')
        .eq('slug', filters.theme)
        .eq('is_active', true)
        .maybeSingle();

      if (themeData) {
        const { data: ltItems } = await supabase
          .from('license_themes')
          .select('license_id')
          .eq('theme_id', themeData.id);

        const licIds = ltItems?.map(x => x.license_id) || [];
        if (licIds.length > 0) {
          const { data: directProds } = await supabase
            .from('products')
            .select('id')
            .in('license_id', licIds);

          const themeProdIds = directProds?.map(x => x.id) || [];

          if (themeProdIds.length > 0) {
            if (productIds) {
              productIds = productIds.filter(id => themeProdIds.includes(id));
            } else {
              productIds = themeProdIds;
            }
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
      } else {
        setProducts([]);
        setCount(0);
        setLoading(false);
        return;
      }
    }

    if (filters.collection_id) {
      const { data: colProds } = await supabase
        .from('vendor_store_collection_products')
        .select('product_id')
        .eq('collection_id', filters.collection_id);
      
      const collectionProductIds = colProds?.map(x => x.product_id) || [];
      if (collectionProductIds.length === 0) {
        setProducts([]);
        setCount(0);
        setLoading(false);
        return;
      }

      if (productIds) {
        productIds = productIds.filter(x => collectionProductIds.includes(x));
        if (productIds.length === 0) {
          setProducts([]);
          setCount(0);
          setLoading(false);
          return;
        }
      } else {
        productIds = collectionProductIds;
      }
    }

    // ── Step 2: main product query based on availability ──
    const availMode = filters.availability || (filters.isInternational ? 'international' : 'local');

    if (availMode === 'international') {
      let query = supabase
        .from('international_products')
        .select('*, category_rel:categories!collectibles_category_id(id, name, slug), subcategory_rel:categories!collectibles_subcategory_id(id, name, slug)', { count: 'exact' });

      if (!filters.includeDrafts) {
        query = query.eq('status', 'published');
      } else {
        query = query.in('status', ['published', 'draft']);
      }

      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,brand.ilike.%${filters.search}%`);
      }

      if (filters.brand) {
        query = query.ilike('brand', `%${filters.brand}%`);
      }

      if (filters.category) {
        const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(filters.category);
        if (isUUID) {
          query = query.or(`collectibles_category_id.eq.${filters.category},collectibles_subcategory_id.eq.${filters.category}`);
        } else {
          const { data: catRecord } = await supabase
            .from('categories')
            .select('id')
            .eq('slug', filters.category)
            .maybeSingle();

          if (catRecord) {
            query = query.or(`collectibles_category_id.eq.${catRecord.id},collectibles_subcategory_id.eq.${catRecord.id}`);
          }
        }
      }

      if (filters.minPrice) {
        query = query.gte('final_price_usd', filters.minPrice);
      }

      if (filters.maxPrice) {
        query = query.lte('final_price_usd', filters.maxPrice);
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
          slug: item.id,
          title: item.title,
          description: item.description,
          base_price: Number(item.final_price_usd),
          compare_at_price: Number(item.amazon_list_price_usd || item.final_price_usd),
          images: [{ id: item.id, url: item.image_url, is_primary: true }],
          image_url: item.image_url,
          brand: { name: item.brand || 'Importado', slug: item.brand ? item.brand.toLowerCase() : 'importado' },
          category: item.category_rel || { name: item.category || 'Coleccionables', slug: item.category ? item.category.toLowerCase() : 'coleccionables' },
          subcategory: item.subcategory_rel || null,
          collectibles_category_id: item.collectibles_category_id,
          collectibles_subcategory_id: item.collectibles_subcategory_id,
          source_provider: 'zinc',
          is_international: true,
          is_active: true,
          status: item.status,
          raw_international_data: item,
          international_products: [item]
        }));
        setProducts(mappedProducts);
        setCount(totalCount || 0);
      }
      setLoading(false);
      return;
    }

    if (availMode === 'all') {
      const selectStr = `
          id, title, slug, base_price, compare_at_price, badge, is_featured, is_active, status, vendor_id, vendor_store_id, brand_id, category_id, condition, condition_notes, created_at,
          category:categories(id, name, slug),
          brand:brands!products_brand_id_fkey(id, name, slug, logo_url),
          images:product_images(id, url, alt_text, is_primary),
          variants:product_variants(id, sku, price_adjustment, inventory_count),
          vendor:vendors(id, store_name, slug, logo_url),
          vendor_store:vendor_stores(id, store_name, slug, logo_url, is_official),
          product_group_items(group_id, group:product_groups(id, name, slug, is_active, sort_order, badge_image_url, badge_storage_path, badge_alt_text, allowed_payment_providers, payment_method_restriction))
          ${categoryId ? ', product_categories!inner(category_id)' : ''}
      `;

      const limit = filters.limit || 12;
      const offset = filters.offset || 0;
      const required = offset + limit;
      const fxRate = filters.exchangeRate;

      let localQuery = supabase
        .from('products')
        .select(selectStr, { count: 'exact' })
        .eq('status', 'published')
        .eq('is_active', true);

      if (categoryIds && categoryIds.length > 0) localQuery = localQuery.in('product_categories.category_id', categoryIds);
      if (brandId) localQuery = localQuery.eq('brand_id', brandId);
      if (productIds) localQuery = localQuery.in('id', productIds);
      if (filters.vendor_store_id) localQuery = localQuery.eq('vendor_store_id', filters.vendor_store_id);
      if (filters.badge) localQuery = localQuery.eq('badge', filters.badge);
      if (filters.featured) localQuery = localQuery.eq('is_featured', true);

      if (filters.condition) {
        if (filters.condition === 'new') {
          localQuery = localQuery.or('condition.eq.new_sealed,condition.eq.new_open_box,condition.is.null');
        } else if (filters.condition === 'used') {
          localQuery = localQuery.in('condition', ['used_complete', 'used_incomplete']);
        } else if (filters.condition === 'loose') {
          localQuery = localQuery.in('condition', ['loose_complete', 'loose_incomplete']);
        }
      }

      if (filters.minPrice) localQuery = localQuery.gte('base_price', filters.minPrice);
      if (filters.maxPrice) localQuery = localQuery.lte('base_price', filters.maxPrice);
      if (filters.search) {
        localQuery = localQuery.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      let intlQuery: any = null;
      if (!filters.license && !filters.theme && !filters.vendor_store_id && !filters.badge && (!filters.condition || filters.condition === 'new')) {
        intlQuery = supabase
          .from('international_products')
          .select('*, category_rel:categories!collectibles_category_id(id, name, slug), subcategory_rel:categories!collectibles_subcategory_id(id, name, slug)', { count: 'exact' })
          .eq('status', 'published');

        if (filters.search) {
          intlQuery = intlQuery.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,brand.ilike.%${filters.search}%`);
        }
        if (filters.brand) {
          intlQuery = intlQuery.ilike('brand', `%${filters.brand}%`);
        }
        if (filters.category) {
          const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(filters.category);
          if (isUUID) {
            intlQuery = intlQuery.or(`collectibles_category_id.eq.${filters.category},collectibles_subcategory_id.eq.${filters.category}`);
          } else {
            const { data: catRecord } = await supabase
              .from('categories')
              .select('id')
              .eq('slug', filters.category)
              .maybeSingle();

            if (catRecord) {
              intlQuery = intlQuery.or(`collectibles_category_id.eq.${catRecord.id},collectibles_subcategory_id.eq.${catRecord.id}`);
            }
          }
        }

        // Convert UYU min/max filter to USD for SQL international products query
        if (fxRate && fxRate > 0) {
          if (filters.minPrice) intlQuery = intlQuery.gte('final_price_usd', filters.minPrice / fxRate);
          if (filters.maxPrice) intlQuery = intlQuery.lte('final_price_usd', filters.maxPrice / fxRate);
        }
      }

      // Order origins in SQL before range slicing to ensure true global page N
      switch (filters.sortBy) {
        case 'price-low':
          localQuery = localQuery.order('base_price', { ascending: true }).order('id', { ascending: true });
          if (intlQuery) intlQuery = intlQuery.order('final_price_usd', { ascending: true }).order('id', { ascending: true });
          break;
        case 'price-high':
          localQuery = localQuery.order('base_price', { ascending: false }).order('id', { ascending: true });
          if (intlQuery) intlQuery = intlQuery.order('final_price_usd', { ascending: false }).order('id', { ascending: true });
          break;
        case 'newest':
          localQuery = localQuery.order('created_at', { ascending: false }).order('id', { ascending: true });
          if (intlQuery) intlQuery = intlQuery.order('id', { ascending: false });
          break;
        case 'name':
          localQuery = localQuery.order('title', { ascending: true }).order('id', { ascending: true });
          if (intlQuery) intlQuery = intlQuery.order('title', { ascending: true }).order('id', { ascending: true });
          break;
        default:
          localQuery = localQuery.order('vendor_id', { ascending: true, nullsFirst: true }).order('created_at', { ascending: false }).order('id', { ascending: true });
          if (intlQuery) intlQuery = intlQuery.order('id', { ascending: true });
      }

      // Range slicing: fetch up to 'required' items from EACH origin
      localQuery = localQuery.range(0, required - 1);
      if (intlQuery) intlQuery = intlQuery.range(0, required - 1);

      const [localRes, intlRes] = await Promise.all([
        localQuery,
        intlQuery ? intlQuery : Promise.resolve({ data: [], count: 0, error: null })
      ]);

      const localData = localRes.data || [];
      const localCount = localRes.count || 0;
      const intlData = intlRes.data || [];
      const intlCount = intlRes.count || 0;

      const mappedIntl = intlData.map((item: any) => {
        const usdPrice = Number(item.final_price_usd);
        const compPrice = fxRate && fxRate > 0 ? usdPrice * fxRate : usdPrice;
        return {
          id: item.id,
          slug: item.id,
          title: item.title,
          description: item.description,
          base_price: usdPrice,
          catalog_comparison_price: compPrice,
          compare_at_price: Number(item.amazon_list_price_usd || item.final_price_usd),
          images: [{ id: item.id, url: item.image_url, is_primary: true }],
          image_url: item.image_url,
          brand: { name: item.brand || 'Importado', slug: item.brand ? item.brand.toLowerCase() : 'importado' },
          category: item.category_rel || { name: item.category || 'Coleccionables', slug: item.category ? item.category.toLowerCase() : 'coleccionables' },
          subcategory: item.subcategory_rel || null,
          collectibles_category_id: item.collectibles_category_id,
          collectibles_subcategory_id: item.collectibles_subcategory_id,
          source_provider: 'zinc',
          is_international: true,
          is_active: true,
          status: item.status,
          raw_international_data: item,
          international_products: [item]
        };
      });

      const mappedLocal = localData.map((item: any) => ({
        ...item,
        catalog_comparison_price: Number(item.base_price || 0)
      }));

      let combined = [...mappedLocal, ...mappedIntl];

      switch (filters.sortBy) {
        case 'price-low':
          combined.sort((a, b) => (a.catalog_comparison_price - b.catalog_comparison_price) || (a.id || '').localeCompare(b.id || ''));
          break;
        case 'price-high':
          combined.sort((a, b) => (b.catalog_comparison_price - a.catalog_comparison_price) || (a.id || '').localeCompare(b.id || ''));
          break;
        case 'newest':
          combined.sort((a, b) => (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()) || (a.id || '').localeCompare(b.id || ''));
          break;
        case 'name':
          combined.sort((a, b) => (a.title || '').localeCompare(b.title || '') || (a.id || '').localeCompare(b.id || ''));
          break;
        default:
          combined.sort((a, b) => {
            const intlA = a.is_international ? 1 : 0;
            const intlB = b.is_international ? 1 : 0;
            if (intlA !== intlB) return intlA - intlB;
            return (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()) || (a.id || '').localeCompare(b.id || '');
          });
      }

      setProducts(combined.slice(offset, offset + limit));
      setCount(localCount + intlCount);
      setLoading(false);
      return;
    }

    const selectStr = `
        id, title, slug, base_price, compare_at_price, badge, is_featured, is_active, status, vendor_id, vendor_store_id, brand_id, category_id, condition, condition_notes, created_at,
        category:categories(id, name, slug),
        brand:brands!products_brand_id_fkey(id, name, slug, logo_url),
        images:product_images(id, url, alt_text, is_primary),
        variants:product_variants(id, sku, price_adjustment, inventory_count),
        vendor:vendors(id, store_name, slug, logo_url),
        vendor_store:vendor_stores(id, store_name, slug, logo_url, is_official),
        product_group_items(group_id, group:product_groups(id, name, slug, is_active, sort_order, badge_image_url, badge_storage_path, badge_alt_text, allowed_payment_providers, payment_method_restriction))
        ${categoryId ? ', product_categories!inner(category_id)' : ''}
    `;

    const shouldCount = !filters.skipCount && !filters.featured;
    let query = supabase
      .from('products')
      .select(selectStr, shouldCount ? { count: 'exact' } : undefined)
      .eq('status', 'published')
      .eq('is_active', true);

    if (categoryIds && categoryIds.length > 0) query = query.in('product_categories.category_id', categoryIds);
    if (brandId) query = query.eq('brand_id', brandId);
    if (productIds) query = query.in('id', productIds);
    if (filters.vendor_store_id) query = query.eq('vendor_store_id', filters.vendor_store_id);
    if (filters.badge) query = query.eq('badge', filters.badge);
    if (filters.featured) query = query.eq('is_featured', true);

    // Condition filter (New, Used, Loose)
    if (filters.condition) {
      if (filters.condition === 'new') {
        query = query.or('condition.eq.new_sealed,condition.eq.new_open_box,condition.is.null');
      } else if (filters.condition === 'used') {
        query = query.in('condition', ['used_complete', 'used_incomplete']);
      } else if (filters.condition === 'loose') {
        query = query.in('condition', ['loose_complete', 'loose_incomplete']);
      }
    }

    if (filters.minPrice) query = query.gte('base_price', filters.minPrice);
    if (filters.maxPrice) query = query.lte('base_price', filters.maxPrice);
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    query = query.order('vendor_id', { ascending: true, nullsFirst: true });

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
    if (error) {
      console.error('[USE_PRODUCTS_QUERY_ERROR]', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      setProducts([]);
      setCount(0);
    } else if (data) {
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
    if (!slug) {
      setLoading(false);
      return;
    }

    async function fetch() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('products')
          .select(`
            *,
            category:categories(id, name, slug),
            brand:brands!products_brand_id_fkey(id, name, slug),
            images:product_images(id, url, alt_text, sort_order, is_primary),
            variants:product_variants(id, sku, legacy_sku, name, price_adjustment, inventory_count),
            product_tags:product_tags(tag_id),
            vendor:vendors(id, store_name, slug, logo_url, promotions_opt_in, company_name, shipping_settings),
            vendor_store:vendor_stores(id, store_name, slug, logo_url, status, is_official, approved_by, approved_at, vendor_store_badge_assignments(status, approved_by, approved_at, vendor_store_badges(*))),
            reviews:reviews(id, rating, title, body, created_at),
            product_group_items(group_id, group:product_groups(id, name, slug, badge_image_url, badge_storage_path, badge_alt_text, badge_updated_at, is_active, sort_order))
          `)
          .eq('slug', slug)
          .maybeSingle();
          
        if (data) {
          setProduct(data);
        } else {
          // Check 301 redirects table for legacy/migrated slugs
          const { data: redirect } = await supabase
            .from('product_slug_redirects')
            .select('new_slug, product_id')
            .eq('old_slug', slug)
            .maybeSingle();

          if (redirect?.new_slug) {
            const { data: redirectedProduct } = await supabase
              .from('products')
              .select(`
                *,
                category:categories(id, name, slug),
                brand:brands!products_brand_id_fkey(id, name, slug),
                images:product_images(id, url, alt_text, sort_order, is_primary),
                variants:product_variants(id, sku, legacy_sku, name, price_adjustment, inventory_count),
                product_tags:product_tags(tag_id),
                vendor:vendors(id, store_name, slug, logo_url, promotions_opt_in, company_name, shipping_settings),
                vendor_store:vendor_stores(id, store_name, slug, logo_url, status, is_official, approved_by, approved_at, vendor_store_badge_assignments(status, approved_by, approved_at, vendor_store_badges(*))),
                reviews:reviews(id, rating, title, body, created_at),
                product_group_items(group_id, group:product_groups(id, name, slug, badge_image_url, badge_storage_path, badge_alt_text, badge_updated_at, is_active, sort_order))
              `)
              .eq('slug', redirect.new_slug)
              .maybeSingle();

            if (redirectedProduct) {
              setProduct({ ...redirectedProduct, _redirectSlug: redirect.new_slug });
              return;
            }
          }

          // Fallback for international products (slug is UUID)
          const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(slug);
          if (isUUID) {
            const { data: intlData } = await supabase
              .from('international_products')
              .select('*, category_rel:categories!collectibles_category_id(id, name, slug), subcategory_rel:categories!collectibles_subcategory_id(id, name, slug)')
              .eq('id', slug)
              .maybeSingle();
              
            if (intlData) {
              setProduct({
                id: intlData.id,
                slug: intlData.id,
                title: intlData.title,
                description: intlData.description,
                base_price: intlData.final_price_usd,
                compare_at_price: intlData.amazon_list_price_usd || intlData.final_price_usd,
                images: [{ url: intlData.image_url, is_primary: true }],
                brand: { name: intlData.brand, slug: intlData.brand ? intlData.brand.toLowerCase() : 'importado' },
                category: intlData.category_rel || { name: intlData.category || 'Coleccionables', slug: intlData.category ? intlData.category.toLowerCase() : 'coleccionables' },
                subcategory: intlData.subcategory_rel || null,
                collectibles_category_id: intlData.collectibles_category_id,
                collectibles_subcategory_id: intlData.collectibles_subcategory_id,
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
      } catch (err) {
        console.error('[useProduct] Error loading product:', err);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [slug]);

  return { product, redirectSlug: product?._redirectSlug, loading };
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

// ═══ Global Caches for Site-wide Hooks (10-min TTL) ═══
const CACHE_TTL_MS = 10 * 60 * 1000;

function readSessionCache(key: string): { data: any[]; isStale: boolean } | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = Array.isArray(parsed) ? parsed : parsed.data;
    const ts = parsed.ts || 0;
    const isStale = Date.now() - ts > CACHE_TTL_MS;
    return { data: Array.isArray(data) ? data : [], isStale };
  } catch {
    return null;
  }
}

function writeSessionCache(key: string, data: any[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

const _initialCategories = readSessionCache('app_categories_cache');
let _categoriesCache: any[] | null = _initialCategories?.data || null;
let _categoriesPromise: Promise<any[]> | null = null;

const _initialBrands = readSessionCache('app_brands_cache');
let _brandsCache: any[] | null = _initialBrands?.data || null;
let _brandsPromise: Promise<any[]> | null = null;

// ═══ useCategories ═══
export function useCategories() {
  const [categories, setCategories] = useState<any[]>(_categoriesCache || []);
  const [loading, setLoading] = useState(!_categoriesCache);

  useEffect(() => {
    const cacheObj = readSessionCache('app_categories_cache');
    const hasValidCache = cacheObj && !cacheObj.isStale;

    if (_categoriesCache) {
      setCategories(_categoriesCache);
      setLoading(false);
    }

    if (!hasValidCache && !_categoriesPromise) {
      _categoriesPromise = supabase
        .from('categories')
        .select('id, name, slug, parent_id, sort_order, status, is_active, metadata, image_url, products(count)')
        .eq('is_active', true)
        .eq('status', 'approved')
        .order('sort_order')
        .order('name')
        .then(({ data, error }) => {
          if (!error && data) {
            const formatted = data.map((cat: any) => ({
              ...cat,
              published_products_count: cat.products?.[0]?.count ?? 0
            }));
            _categoriesCache = formatted;
            writeSessionCache('app_categories_cache', formatted);
          } else {
            console.error('[useCategories] fetch error:', error);
          }
          _categoriesPromise = null;
          return _categoriesCache || [];
        })
        .catch(() => {
          _categoriesPromise = null;
          return _categoriesCache || [];
        });
    }

    if (_categoriesPromise) {
      _categoriesPromise.then(cats => {
        setCategories(cats);
        setLoading(false);
      });
    }
  }, []);

  return { categories, loading };
}

// ═══ useBrands ═══
export function useBrands() {
  const [brands, setBrands] = useState<any[]>(_brandsCache || []);
  const [loading, setLoading] = useState(!_brandsCache);

  useEffect(() => {
    const cacheObj = readSessionCache('app_brands_cache');
    const hasValidCache = cacheObj && !cacheObj.isStale;

    if (_brandsCache) {
      setBrands(_brandsCache);
      setLoading(false);
    }

    if (!hasValidCache && !_brandsPromise) {
      _brandsPromise = supabase
        .from('brands')
        .select('*')
        .eq('status', 'approved')
        .eq('is_active', true)
        .eq('is_public', true)
        .order('sort_order')
        .then(({ data, error }) => {
          if (!error && data) {
            _brandsCache = data;
            writeSessionCache('app_brands_cache', data);
          } else {
            console.error('[useBrands] fetch error:', error);
          }
          _brandsPromise = null;
          return _brandsCache || [];
        })
        .catch(() => {
          _brandsPromise = null;
          return _brandsCache || [];
        });
    }

    if (_brandsPromise) {
      _brandsPromise.then(b => {
        setBrands(b);
        setLoading(false);
      });
    }
  }, []);

  return { brands, loading };
}

// ═══ useBrandFacets ═══
interface BrandFacetFilters {
  category?: string;
  search?: string;
  vendor_store_id?: string;
  group?: string;
  isInternational?: boolean;
}

export function useBrandFacets(filters: BrandFacetFilters = {}) {
  const [brandFacets, setBrandFacets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchFacets() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_brand_facets', {
          p_category_slug: filters.category || null,
          p_search_query: filters.search || null,
          p_vendor_store_id: filters.vendor_store_id || null,
          p_group_slug: filters.group || null,
          p_is_international: filters.isInternational || false
        });

        if (active) {
          if (!error && data) {
            setBrandFacets(data);
          } else {
            console.error('Error fetching brand facets:', error);
            setBrandFacets([]);
          }
          setLoading(false);
        }
      } catch (e) {
        console.error('Exception fetching brand facets:', e);
        if (active) {
          setBrandFacets([]);
          setLoading(false);
        }
      }
    }

    fetchFacets();

    return () => {
      active = false;
    };
  }, [
    filters.category,
    filters.search,
    filters.vendor_store_id,
    filters.group,
    filters.isInternational
  ]);

  return { brandFacets, loading };
}

// ═══ useInternationalCategoryFacets ═══
interface IntlCategoryFacetFilters {
  brand?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
}

export function useInternationalCategoryFacets(filters: IntlCategoryFacetFilters = {}) {
  const [facets, setFacets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchFacets() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_international_category_facets', {
          p_brand_slug: filters.brand || null,
          p_search_query: filters.search || null,
          p_min_price: filters.minPrice != null ? filters.minPrice : null,
          p_max_price: filters.maxPrice != null ? filters.maxPrice : null
        });

        if (active) {
          if (!error && data) {
            setFacets(data);
          } else {
            console.error('Error fetching international category facets:', error);
            setFacets([]);
          }
          setLoading(false);
        }
      } catch (e) {
        console.error('Exception fetching international category facets:', e);
        if (active) {
          setFacets([]);
          setLoading(false);
        }
      }
    }

    fetchFacets();

    return () => {
      active = false;
    };
  }, [filters.brand, filters.search, filters.minPrice, filters.maxPrice]);

  return { facets, loading };
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
  // Hotfix Fields
  vendor_store_id?: string;
  vendor_store_name?: string;
  vendor_store_slug?: string;
  sku?: string;
  unit_price?: number;
  image_url?: string;
  vendor_store_badges?: any[];
  promotions_opt_in?: boolean;
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
    if (isNaN(numericPrice) || item.price === null || item.price === undefined || numericPrice <= 0) {
      console.warn('[Cart] Rejected item with invalid price:', item);
      alert("Este producto no tiene precio configurado.");
      return; // Do not add broken items
    }
    
    // Ensure the item always stores the price as a number type
    const safeItem = { ...item, price: numericPrice };

    setItems(prev => {
      const existing = prev.find(i => i.variant_id === safeItem.variant_id && i.vendor_id === safeItem.vendor_id);
      if (existing) {
        return prev.map(i => i.variant_id === safeItem.variant_id && i.vendor_id === safeItem.vendor_id ? { ...i, quantity: i.quantity + safeItem.quantity } : i);
      }
      return [...prev, safeItem];
    });
  };

  const updateQuantity = (variantId: string, vendorId: string | undefined, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => !(i.variant_id === variantId && i.vendor_id === vendorId)));
    } else {
      setItems(prev => prev.map(i => i.variant_id === variantId && i.vendor_id === vendorId ? { ...i, quantity } : i));
    }
  };

  const removeItem = (variantId: string, vendorId?: string) => {
    setItems(prev => prev.filter(i => !(i.variant_id === variantId && i.vendor_id === vendorId)));
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
          id, name, slug, type, show_on_home, badge_image_url, badge_storage_path, badge_alt_text, badge_updated_at,
          product_group_items (
            group_id,
            product_id
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
          id, name, slug, description, type, rules_json, is_active, show_on_home, badge_image_url, badge_storage_path, badge_alt_text, badge_updated_at,
          product_group_items (
            product:products (
              *,
              category:categories(id, name, slug),
              brand:brands!products_brand_id_fkey(id, name, slug),
              images:product_images(id, url, alt_text, sort_order, is_primary),
              variants:product_variants(id, sku, legacy_sku, name, price_adjustment, inventory_count),
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
        .select('id, name, slug, description, is_active, show_on_home, badge_image_url, badge_storage_path, badge_alt_text, badge_updated_at')
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
export function useFilterMappings(brandId?: string) {
  const [mappings, setMappings] = useState<{ category_id: string; brand_id: string }[]>([]);

  useEffect(() => {
    if (!brandId) {
      setMappings([]);
      return;
    }

    async function fetchMappings() {
      const { data } = await supabase
        .from('product_categories')
        .select('category_id, products!inner(brand_id)')
        .eq('products.brand_id', brandId)
        .eq('products.status', 'published')
        .eq('products.is_active', true);
        
      if (data) {
        const pairs: { category_id: string; brand_id: string }[] = [];
        data.forEach((item: any) => {
          if (item.category_id && item.products?.brand_id) {
            pairs.push({
              category_id: item.category_id,
              brand_id: item.products.brand_id
            });
          }
        });
        setMappings(pairs);
      }
    }
    fetchMappings();
  }, [brandId]);

  return mappings;
}

// ═══ useStoreCollections ═══
export function useStoreCollections(storeId: string | undefined) {
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) {
      setCollections([]);
      setLoading(false);
      return;
    }

    async function fetchCollections() {
      setLoading(true);
      const { data } = await supabase
        .from('vendor_store_collections')
        .select('*')
        .eq('vendor_store_id', storeId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      setCollections(data || []);
      setLoading(false);
    }
    fetchCollections();
  }, [storeId]);

  return { collections, loading };
}

// ═══ useStoreFollowers ═══
export function useStoreFollowers(storeId: string | undefined) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchFollowState = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      // 1. Get total follower count directly from store
      const { data: store } = await supabase
        .from('vendor_stores')
        .select('followers_count')
        .eq('id', storeId)
        .single();
      
      if (store) {
        setFollowersCount(store.followers_count);
      }

      // 2. Check if current user is following
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from('vendor_store_followers')
          .select('id')
          .eq('vendor_store_id', storeId)
          .eq('customer_id', session.user.id)
          .maybeSingle();
        
        setIsFollowing(!!data);
      } else {
        setIsFollowing(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchFollowState();
  }, [fetchFollowState]);

  const toggleFollow = async () => {
    if (!storeId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error("Debes iniciar sesión para seguir esta tienda.");
    }

    if (isFollowing) {
      await supabase
        .from('vendor_store_followers')
        .delete()
        .eq('vendor_store_id', storeId)
        .eq('customer_id', session.user.id);
      setIsFollowing(false);
      setFollowersCount(prev => Math.max(0, prev - 1));
    } else {
      await supabase
        .from('vendor_store_followers')
        .insert({
          vendor_store_id: storeId,
          customer_id: session.user.id
        });
      setIsFollowing(true);
      setFollowersCount(prev => prev + 1);
    }
  };

  return { isFollowing, followersCount, loading, toggleFollow, refetch: fetchFollowState };
}

// ═══ useStoreBadges ═══
export function useStoreBadges(storeId: string | undefined) {
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) {
      setBadges([]);
      setLoading(false);
      return;
    }

    async function fetchBadges() {
      setLoading(true);
      const { data } = await supabase
        .from('vendor_store_badge_assignments')
        .select('status, approved_by, approved_at, vendor_store_badges(*)')
        .eq('vendor_store_id', storeId);

      const list = data
        ?.filter((x: any) => x.status === 'active' && x.approved_by && x.approved_at)
        ?.map((x: any) => x.vendor_store_badges)
        .filter(Boolean) || [];
      setBadges(list);
      setLoading(false);
    }
    fetchBadges();
  }, [storeId]);

  return { badges, loading };
}

// Helper to resolve primary product group badge based on priority rules
export function getProductGroupBadge(product: any) {
  const badges = getAllProductGroupBadges(product);
  return badges.length > 0 ? badges[0] : null;
}

// Helper to resolve all active product group badges (deduplicated by image URL)
export function getAllProductGroupBadges(product: any) {
  if (!product || !product.product_group_items) return [];
  const items = Array.isArray(product.product_group_items) ? product.product_group_items : [];

  // Find active group badges, filter by active status & presence of badge image, and sort by group sort_order ascending
  const activeGroupBadges = items
    .map((item: any) => item.group)
    .filter((g: any) => g && g.is_active && g.badge_image_url)
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

  const seenUrls = new Set<string>();
  const badges: { url: string; alt: string; groupName: string }[] = [];

  for (const g of activeGroupBadges) {
    if (g.badge_image_url && !seenUrls.has(g.badge_image_url)) {
      seenUrls.add(g.badge_image_url);
      badges.push({
        url: g.badge_image_url,
        alt: g.badge_alt_text || g.name || 'Cocarda de colección',
        groupName: g.name
      });
    }
  }

  return badges;
}

// Helper to resolve payment restrictions from all active groups a product belongs to
export function getProductPaymentRestrictions(product: any) {
  if (!product || !product.product_group_items) {
    return { allowedProviders: null, restrictionType: 'all' };
  }
  const items = Array.isArray(product.product_group_items) ? product.product_group_items : [];
  const activeGroups = items.map((item: any) => item.group).filter((g: any) => g && g.is_active);

  if (activeGroups.length === 0) {
    return { allowedProviders: null, restrictionType: 'all' };
  }

  let allowedProviders: string[] | null = null;
  let restrictionType = 'all';

  for (const g of activeGroups) {
    // Intersect allowed payment providers
    if (Array.isArray(g.allowed_payment_providers) && g.allowed_payment_providers.length > 0) {
      if (allowedProviders === null) {
        allowedProviders = [...g.allowed_payment_providers];
      } else {
        allowedProviders = allowedProviders.filter(p => g.allowed_payment_providers.includes(p));
      }
    }

    // Precedence: transfer_only > cards_only > all
    if (g.payment_method_restriction === 'transfer_only') {
      restrictionType = 'transfer_only';
    } else if (g.payment_method_restriction === 'cards_only' && restrictionType !== 'transfer_only') {
      restrictionType = 'cards_only';
    }
  }

  return { allowedProviders, restrictionType };
}

// ═══ useLicenses ═══
export function useLicenses(onlyPublicWithProducts = false) {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      let res = await supabase
        .from('licenses_with_counts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (res.error || !res.data) {
        res = await supabase
          .from('licenses')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });
      }

      let list = res.data || [];
      if (onlyPublicWithProducts) {
        list = list.filter((l: any) => l.is_active !== false && (l.published_product_count === undefined || l.published_product_count > 0));
      }

      list.sort((a: any, b: any) => {
        const featA = a.is_featured ? 1 : 0;
        const featB = b.is_featured ? 1 : 0;
        if (featA !== featB) return featB - featA;

        const sortA = a.sort_order ?? 999;
        const sortB = b.sort_order ?? 999;
        if (sortA !== sortB) return sortA - sortB;

        const countA = a.published_product_count ?? 0;
        const countB = b.published_product_count ?? 0;
        if (countA !== countB) return countB - countA;

        return (a.name || '').localeCompare(b.name || '');
      });

      setLicenses(list);
      setLoading(false);
    }
    fetch();
  }, [onlyPublicWithProducts]);

  return { licenses, loading };
}

// ═══ useThemes ═══
export function useThemes(onlyPublicWithProducts = false) {
  const [themes, setThemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      let res = await supabase
        .from('themes_with_counts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (res.error || !res.data) {
        res = await supabase
          .from('themes')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });
      }

      let list = res.data || [];
      if (onlyPublicWithProducts) {
        list = list.filter((t: any) => t.is_active !== false && (t.published_product_count === undefined || t.published_product_count > 0));
      }
      setThemes(list);
      setLoading(false);
    }
    fetch();
  }, [onlyPublicWithProducts]);

  return { themes, loading };
}

// ═══ useLicense (single item by slug) ═══
export function useLicense(slug?: string) {
  const [license, setLicense] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setLicense(null);
      setLoading(false);
      return;
    }
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('licenses')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      setLicense(data || null);
      setLoading(false);
    }
    fetch();
  }, [slug]);

  return { license, loading };
}

// ═══ useTheme (single item by slug) ═══
export function useTheme(slug?: string) {
  const [theme, setTheme] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setTheme(null);
      setLoading(false);
      return;
    }
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('themes')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      setTheme(data || null);
      setLoading(false);
    }
    fetch();
  }, [slug]);

  return { theme, loading };
}

// ═══ useCatalogFacets ═══
export interface CatalogFacetFilters {
  category?: string;
  brand?: string;
  license?: string;
  theme?: string;
  availability?: string; // 'all' | 'local' | 'international'
  search?: string;
  condition?: string;
  group?: string;
  isInternationalEnabled?: boolean;
}

export function useCatalogFacets(filters: CatalogFacetFilters = {}) {
  const [facets, setFacets] = useState<{
    categoryFacets: Record<string, number>;
    brandFacets: any[];
    licenseFacets: any[];
    themeFacets: any[];
    availabilityCounts: { all: number; local: number; international: number };
    conditionCounts: { all: number; new: number; used: number; loose: number };
    totalCatalogProducts: number;
  }>({
    categoryFacets: {},
    brandFacets: [],
    licenseFacets: [],
    themeFacets: [],
    availabilityCounts: { all: 0, local: 0, international: 0 },
    conditionCounts: { all: 0, new: 0, used: 0, loose: 0 },
    totalCatalogProducts: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function calculateFacets() {
      setLoading(true);

      try {
        const [
          { data: categoriesData },
          { data: brandsData },
          { data: licensesData },
          { data: themesData },
          { data: ltData },
          { data: localProductsData },
          intlRes
        ] = await Promise.all([
          supabase.from('categories').select('id, name, slug, parent_id, is_active, status').eq('is_active', true),
          supabase.from('brands').select('id, name, slug, is_active, is_public, status').eq('is_active', true).eq('is_public', true),
          supabase.from('licenses').select('id, name, slug, is_active, is_featured, sort_order').eq('is_active', true),
          supabase.from('themes').select('id, name, slug, is_active, sort_order').eq('is_active', true),
          supabase.from('license_themes').select('license_id, theme_id'),
          supabase.from('products').select(`
            id, brand_id, license_id, category_id, condition, title, description, base_price, status, is_active,
            product_categories(category_id)
          `).eq('status', 'published').eq('is_active', true),
          filters.isInternationalEnabled !== false
            ? supabase.from('international_products').select('id, brand, collectibles_category_id, collectibles_subcategory_id, final_price_usd, title, description, status').eq('status', 'published')
            : Promise.resolve({ data: [] })
        ]);

        if (!active) return;

        const categories = categoriesData || [];
        const brands = brandsData || [];
        const licenses = licensesData || [];
        const themes = themesData || [];
        const licenseThemes = ltData || [];
        const localProducts = localProductsData || [];
        const intlProducts = intlRes.data || [];

        const catSlugToIdMap = new Map<string, string>();
        categories.forEach(c => catSlugToIdMap.set(c.slug, c.id));

        const brandSlugToIdMap = new Map<string, string>();
        brands.forEach(b => brandSlugToIdMap.set(b.slug, b.id));

        const licSlugToIdMap = new Map<string, string>();
        licenses.forEach(l => licSlugToIdMap.set(l.slug, l.id));

        const themeSlugToIdMap = new Map<string, string>();
        themes.forEach(t => themeSlugToIdMap.set(t.slug, t.id));

        const licToThemesMap = new Map<string, Set<string>>();
        licenseThemes.forEach(lt => {
          if (!licToThemesMap.has(lt.license_id)) licToThemesMap.set(lt.license_id, new Set());
          licToThemesMap.get(lt.license_id)!.add(lt.theme_id);
        });

        const catSubcatMap = new Map<string, Set<string>>();
        categories.forEach(c => {
          if (c.parent_id) {
            if (!catSubcatMap.has(c.parent_id)) catSubcatMap.set(c.parent_id, new Set());
            catSubcatMap.get(c.parent_id)!.add(c.id);
          }
        });

        const matchItem = (item: any, isIntl: boolean, f: CatalogFacetFilters, excludeDim?: string) => {
          if (excludeDim !== 'availability') {
            const avail = f.availability || 'all';
            if (avail === 'local' && isIntl) return false;
            if (avail === 'international' && !isIntl) return false;
          }

          if (excludeDim !== 'category' && f.category) {
            const targetCatId = catSlugToIdMap.get(f.category) || f.category;
            const validCatIds = new Set<string>([targetCatId]);
            const children = catSubcatMap.get(targetCatId);
            if (children) children.forEach(cId => validCatIds.add(cId));

            if (!isIntl) {
              const pCatIds = new Set<string>();
              if (item.category_id) pCatIds.add(item.category_id);
              if (item.product_categories) {
                item.product_categories.forEach((pc: any) => pCatIds.add(pc.category_id));
              }
              let hasCatMatch = false;
              for (const cId of pCatIds) {
                if (validCatIds.has(cId)) { hasCatMatch = true; break; }
              }
              if (!hasCatMatch) return false;
            } else {
              const intlCat1 = item.collectibles_category_id;
              const intlCat2 = item.collectibles_subcategory_id;
              if (!validCatIds.has(intlCat1) && !validCatIds.has(intlCat2)) return false;
            }
          }

          if (excludeDim !== 'brand' && f.brand) {
            const targetBrandId = brandSlugToIdMap.get(f.brand) || f.brand;
            if (!isIntl) {
              if (item.brand_id !== targetBrandId) return false;
            } else {
              const brandObj = brands.find(b => b.id === targetBrandId || b.slug === f.brand);
              if (!brandObj || !item.brand || !item.brand.toLowerCase().includes(brandObj.name.toLowerCase())) {
                return false;
              }
            }
          }

          if (excludeDim !== 'license' && f.license) {
            if (isIntl) return false;
            const targetLicId = licSlugToIdMap.get(f.license) || f.license;
            if (item.license_id !== targetLicId) return false;
          }

          if (excludeDim !== 'theme' && f.theme) {
            if (isIntl) return false;
            const targetThemeId = themeSlugToIdMap.get(f.theme) || f.theme;
            if (!item.license_id) return false;
            const themesForLic = licToThemesMap.get(item.license_id);
            if (!themesForLic || !themesForLic.has(targetThemeId)) return false;
          }

          if (f.search && f.search.trim()) {
            const q = f.search.toLowerCase().trim();
            const title = (item.title || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            const brandName = isIntl ? (item.brand || '').toLowerCase() : '';
            if (!title.includes(q) && !desc.includes(q) && !brandName.includes(q)) {
              return false;
            }
          }

          if (excludeDim !== 'condition' && f.condition) {
            if (isIntl) {
              if (f.condition !== 'new') return false;
            } else {
              const cond = item.condition;
              if (f.condition === 'new' && (cond && cond !== 'new_sealed' && cond !== 'new_open_box')) return false;
              if (f.condition === 'used' && (!cond || (cond !== 'used_complete' && cond !== 'used_incomplete'))) return false;
              if (f.condition === 'loose' && (!cond || (cond !== 'loose_complete' && cond !== 'loose_incomplete'))) return false;
            }
          }

          return true;
        };

        // Category Facets — Distinct Set Union Logic (COUNT DISTINCT product_id)
        const catCounts: Record<string, number> = {};
        categories.forEach(cat => {
          const familyCatIds = new Set<string>([cat.id]);
          if (!cat.parent_id) {
            const children = categories.filter(c => c.parent_id === cat.id);
            children.forEach(ch => {
              familyCatIds.add(ch.id);
              const grandChildren = categories.filter(g => g.parent_id === ch.id);
              grandChildren.forEach(g => familyCatIds.add(g.id));
            });
          }

          const distinctProdIds = new Set<string>();

          localProducts.forEach(item => {
            if (matchItem(item, false, filters, 'category')) {
              const pCatIds = new Set<string>();
              if (item.category_id) pCatIds.add(item.category_id);
              if (item.product_categories) {
                item.product_categories.forEach((pc: any) => pCatIds.add(pc.category_id));
              }
              for (const cId of pCatIds) {
                if (familyCatIds.has(cId)) {
                  distinctProdIds.add(item.id);
                  break;
                }
              }
            }
          });

          intlProducts.forEach(item => {
            if (matchItem(item, true, filters, 'category')) {
              if (familyCatIds.has(item.collectibles_category_id) || familyCatIds.has(item.collectibles_subcategory_id)) {
                distinctProdIds.add(`intl_${item.id}`);
              }
            }
          });

          catCounts[cat.id] = distinctProdIds.size;
        });

        // Brand Facets
        const brandCounts: Record<string, number> = {};
        localProducts.forEach(item => {
          if (matchItem(item, false, filters, 'brand') && item.brand_id) {
            brandCounts[item.brand_id] = (brandCounts[item.brand_id] || 0) + 1;
          }
        });
        intlProducts.forEach(item => {
          if (matchItem(item, true, filters, 'brand') && item.brand) {
            const bObj = brands.find(b => b.name.toLowerCase() === item.brand.toLowerCase() || b.slug === item.brand.toLowerCase());
            if (bObj) brandCounts[bObj.id] = (brandCounts[bObj.id] || 0) + 1;
          }
        });
        const computedBrandFacets = brands
          .map(b => ({
            brand_id: b.id,
            brand_name: b.name,
            brand_slug: b.slug,
            product_count: brandCounts[b.id] || 0
          }))
          .filter(b => b.product_count > 0)
          .sort((a, b) => b.product_count - a.product_count || a.brand_name.localeCompare(b.brand_name));

        // License Facets (rely ONLY on products.license_id)
        const licCounts: Record<string, number> = {};
        localProducts.forEach(item => {
          if (matchItem(item, false, filters, 'license') && item.license_id) {
            licCounts[item.license_id] = (licCounts[item.license_id] || 0) + 1;
          }
        });
        const computedLicenseFacets = licenses
          .map(l => ({
            id: l.id,
            name: l.name,
            slug: l.slug,
            published_product_count: licCounts[l.id] || 0,
            is_featured: l.is_featured,
            sort_order: l.sort_order
          }))
          .filter(l => l.published_product_count > 0)
          .sort((a, b) => {
            if (b.is_featured !== a.is_featured) return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
            return b.published_product_count - a.published_product_count || a.name.localeCompare(b.name);
          });

        // Theme Facets (products.license_id -> license_themes -> theme)
        const themeCounts: Record<string, number> = {};
        localProducts.forEach(item => {
          if (matchItem(item, false, filters, 'theme') && item.license_id) {
            const ths = licToThemesMap.get(item.license_id);
            if (ths) {
              ths.forEach(tId => { themeCounts[tId] = (themeCounts[tId] || 0) + 1; });
            }
          }
        });
        const computedThemeFacets = themes
          .map(t => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            published_product_count: themeCounts[t.id] || 0,
            sort_order: t.sort_order
          }))
          .filter(t => t.published_product_count > 0)
          .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || b.published_product_count - a.published_product_count);

        // Availability Counts
        let localCount = 0;
        localProducts.forEach(item => { if (matchItem(item, false, filters, 'availability')) localCount++; });
        let intlCount = 0;
        intlProducts.forEach(item => { if (matchItem(item, true, filters, 'availability')) intlCount++; });

        // Condition Counts with Self-Exclusion
        const condCounts = { all: 0, new: 0, used: 0, loose: 0 };
        localProducts.forEach(item => {
          if (matchItem(item, false, filters, 'condition')) {
            condCounts.all++;
            const cond = item.condition;
            if (!cond || cond === 'new_sealed' || cond === 'new_open_box') {
              condCounts.new++;
            } else if (cond === 'used_complete' || cond === 'used_incomplete') {
              condCounts.used++;
            } else if (cond === 'loose_complete' || cond === 'loose_incomplete') {
              condCounts.loose++;
            }
          }
        });
        intlProducts.forEach(item => {
          if (matchItem(item, true, filters, 'condition')) {
            condCounts.all++;
            condCounts.new++;
          }
        });

        const currentAvail = filters.availability || 'all';
        let totalCombined = 0;
        if (currentAvail === 'local') totalCombined = localCount;
        else if (currentAvail === 'international') totalCombined = intlCount;
        else totalCombined = localCount + intlCount;

        setFacets({
          categoryFacets: catCounts,
          brandFacets: computedBrandFacets,
          licenseFacets: computedLicenseFacets,
          themeFacets: computedThemeFacets,
          availabilityCounts: {
            all: localCount + intlCount,
            local: localCount,
            international: intlCount
          },
          conditionCounts: condCounts,
          totalCatalogProducts: totalCombined
        });
        setLoading(false);
      } catch (err) {
        console.error('Error calculating catalog facets:', err);
        if (active) setLoading(false);
      }
    }

    calculateFacets();
    return () => { active = false; };
  }, [
    filters.category,
    filters.brand,
    filters.license,
    filters.theme,
    filters.availability,
    filters.search,
    filters.condition,
    filters.group,
    filters.isInternationalEnabled
  ]);

  return { ...facets, loading };
}


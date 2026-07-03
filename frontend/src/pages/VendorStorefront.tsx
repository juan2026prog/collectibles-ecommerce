import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Store, MapPin, Mail, Globe, Users, Star, 
  ChevronLeft, ChevronRight, Search, SlidersHorizontal, X
} from 'lucide-react';
import { ProductGridCard } from '../components/ProductGridCard';
import { useCartContext } from '../contexts/CartContext';
import { getProductImage } from '../lib/imageUtils';
import { Helmet } from 'react-helmet-async';
import { 
  useStoreCollections, 
  useStoreFollowers, 
  useStoreBadges,
  useProducts,
  useCategories,
  useBrandFacets
} from '../hooks/useData';

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function VendorStorefront() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [store, setStore] = useState<any>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [promotionsOptIn, setPromotionsOptIn] = useState<boolean>(false);
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Filter States from URL search params
  const categorySlug = searchParams.get('category') || '';
  const brandSlug = searchParams.get('brand') || '';
  const searchQ = searchParams.get('q') || '';
  const priceMin = searchParams.get('minPrice') || '';
  const priceMax = searchParams.get('maxPrice') || '';
  const sortBy = searchParams.get('sort') || 'default';
  const pageParam = searchParams.get('page') || '1';
  const page = parseInt(pageParam, 10) || 1;

  // Local Search & UI states
  const [searchInput, setSearchInput] = useState(searchQ);
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'new' | 'featured'>('all');
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [brandsExpanded, setBrandsExpanded] = useState(false);
  const [searchBrandQuery, setSearchBrandQuery] = useState('');
  const [mobileFilters, setMobileFilters] = useState(false);

  const pageSize = 24;
  const cart = useCartContext();

  // Reset inputs when search query in URL changes (e.g. cleared externally)
  useEffect(() => {
    setSearchInput(searchQ);
  }, [searchQ]);

  // Load store data
  useEffect(() => {
    if (!slug) return;
    setStore(null);
    setKycStatus(null);
    setPickupAddress('');
    loadStoreData();
  }, [slug]);

  async function loadStoreData() {
    setLoading(true);
    try {
      const { data: storeData, error: storeErr } = await supabase
        .from('vendor_stores')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .single();

      if (storeErr || !storeData) {
        setStore(null);
        setLoading(false);
        return;
      }

      setStore(storeData);

      const { data: vendorKyc } = await supabase
        .from('vendors')
        .select('kyc_status, promotions_opt_in')
        .eq('id', storeData.vendor_id)
        .maybeSingle();

      if (vendorKyc) {
        setKycStatus(vendorKyc.kyc_status);
        setPromotionsOptIn(vendorKyc.promotions_opt_in || false);
      }

      const { data: storeAddr } = await supabase
        .from('vendor_dispatch_addresses')
        .select('address, city, department')
        .eq('vendor_store_id', storeData.id)
        .eq('is_default', true)
        .maybeSingle();

      let finalAddr = storeAddr;
      if (!finalAddr) {
        const { data: vendorAddr } = await supabase
          .from('vendor_dispatch_addresses')
          .select('address, city, department')
          .eq('vendor_id', storeData.vendor_id)
          .is('vendor_store_id', null)
          .eq('is_default', true)
          .maybeSingle();
        finalAddr = vendorAddr;
      }

      if (finalAddr) {
        setPickupAddress(`${finalAddr.address}, ${finalAddr.city}, ${finalAddr.department}`);
      }

    } catch (err) {
      console.error('Error loading store data:', err);
    }
    setLoading(false);
  }

  // Follow State
  const { isFollowing, followersCount, toggleFollow, loading: followLoading } = useStoreFollowers(store?.id);

  // Collections & Badges
  const { collections } = useStoreCollections(store?.id);
  const { badges } = useStoreBadges(store?.id);

  // Dynamic Categories with product counts for this vendor
  const { categories: allCategories } = useCategories();
  const [vendorCategories, setVendorCategories] = useState<any[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  useEffect(() => {
    if (!store?.id) return;
    async function loadCategories() {
      setCategoriesLoading(true);
      try {
        const { data, error } = await supabase
          .from('categories')
          .select(`
            id, name, slug, parent_id,
            product_categories!inner(
              product:products!inner(id)
            )
          `)
          .eq('product_categories.product.vendor_store_id', store.id)
          .eq('product_categories.product.is_active', true)
          .eq('product_categories.product.status', 'published');

        if (!error && data) {
          const list = data.map((cat: any) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            parent_id: cat.parent_id,
            count: cat.product_categories?.length || 0
          }));
          setVendorCategories(list);
        } else {
          console.error('Error fetching categories:', error);
          setVendorCategories([]);
        }
      } catch (e) {
        console.error('Exception fetching categories:', e);
        setVendorCategories([]);
      }
      setCategoriesLoading(false);
    }
    loadCategories();
  }, [store?.id]);

  // Hierarchical categories builder
  const visibleCategories = useMemo(() => {
    const activeMap = new Map<string, any>();
    vendorCategories.forEach(c => {
      activeMap.set(c.id, { ...c, count: c.count });
    });

    // Make sure all parent categories of active categories are also included
    vendorCategories.forEach(c => {
      if (c.parent_id) {
        let parent = activeMap.get(c.parent_id);
        if (!parent) {
          const originalParent = allCategories.find(ac => ac.id === c.parent_id);
          if (originalParent) {
            activeMap.set(c.parent_id, {
              id: originalParent.id,
              name: originalParent.name,
              slug: originalParent.slug,
              parent_id: originalParent.parent_id,
              count: 0
            });
          }
        }
      }
    });

    return Array.from(activeMap.values());
  }, [vendorCategories, allCategories]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    visibleCategories.forEach(c => {
      counts[c.id] = c.count;
    });

    const getRollupCount = (catId: string) => {
      const direct = counts[catId] || 0;
      const children = visibleCategories.filter(c => c.parent_id === catId);
      const childrenSum = children.reduce((sum, child) => sum + child.count, 0);
      return direct + childrenSum;
    };

    const rollup: Record<string, number> = {};
    visibleCategories.forEach(c => {
      rollup[c.id] = getRollupCount(c.id);
    });
    return rollup;
  }, [visibleCategories]);

  const currentCategory = useMemo(() => {
    return visibleCategories.find(c => c.slug === categorySlug);
  }, [visibleCategories, categorySlug]);

  // Brand Facets
  const brandFacetsFilters = useMemo(() => ({
    category: categorySlug || undefined,
    search: searchQ || undefined,
    vendor_store_id: store?.id || undefined
  }), [categorySlug, searchQ, store?.id]);

  const { brandFacets, loading: facetsLoading } = useBrandFacets(brandFacetsFilters);

  const currentBrand = useMemo(() => {
    return brandFacets.find(b => b.brand_slug === brandSlug);
  }, [brandFacets, brandSlug]);

  // Fetch Products using official useProducts hook
  const productFilters = useMemo(() => ({
    vendor_store_id: store?.id,
    search: searchQ || undefined,
    category_id: currentCategory?.id || undefined,
    brand_id: currentBrand?.brand_id || undefined,
    minPrice: priceMin ? Number(priceMin) : undefined,
    maxPrice: priceMax ? Number(priceMax) : undefined,
    sortBy: sortBy === 'default' ? undefined : sortBy,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    featured: activeFilterTab === 'featured' ? true : undefined,
    badge: activeFilterTab === 'new' ? 'new' : undefined
  }), [store?.id, searchQ, currentCategory?.id, currentBrand?.brand_id, priceMin, priceMax, sortBy, page, activeFilterTab]);

  const { products, count: totalProducts, loading: loadingProducts } = useProducts(productFilters);

  // Selection handlers
  const handleCategorySelect = (slugStr: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (slugStr) {
      params.set('category', slugStr);
    } else {
      params.delete('category');
    }
    setSearchParams(params);
  };

  const handleBrandSelect = (slugStr: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (slugStr) {
      params.set('brand', slugStr);
    } else {
      params.delete('brand');
    }
    setSearchParams(params);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (searchInput) {
      params.set('q', searchInput);
    } else {
      params.delete('q');
    }
    setSearchParams(params);
  };

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (value && value !== 'default') {
      params.set('sort', value);
    } else {
      params.delete('sort');
    }
    setSearchParams(params);
  };

  const handlePriceApply = (e: React.FormEvent, min: string, max: string) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (min) params.set('minPrice', min); else params.delete('minPrice');
    if (max) params.set('maxPrice', max); else params.delete('maxPrice');
    setSearchParams(params);
  };

  const clearAllFilters = () => {
    setSearchParams({});
    setSearchInput('');
    setSearchBrandQuery('');
  };

  const handleAddToCart = (p: any) => {
    const variant = p.variants?.[0];
    if (!variant) return;
    cart.addItem({ 
      product_id: p.id, 
      variant_id: variant.id, 
      quantity: 1, 
      title: p.title, 
      price: p.base_price + (variant.price_adjustment || 0), 
      image: getProductImage(p), 
      variant_name: variant.name || 'Única', 
      category_id: p.category_id, 
      brand_id: p.brand_id, 
      vendor_id: p.vendor_id, 
      vendor_store_id: p.vendor_store_id || store?.id || null,
      vendor_name: store?.store_name || p.vendor?.store_name || 'Vendedor',
      vendor_store_name: store?.store_name || p.vendor?.store_name || 'Vendedor',
      vendor_slug: store?.slug || p.vendor?.slug || slug,
      vendor_store_slug: store?.slug || p.vendor?.slug || slug,
      vendor_logo: store?.logo_url || p.vendor?.logo_url,
      sku: variant.sku || null,
      unit_price: p.base_price + (variant.price_adjustment || 0),
      image_url: getProductImage(p),
      promotions_opt_in: promotionsOptIn,
      tag_ids: p.product_tags?.map((pt: any) => pt.tag_id) || [] 
    });
  };

  const formatPrice = (p: number) => `$${p.toLocaleString('es-UY')}`;

  const handleFollowClick = async () => {
    try {
      await toggleFollow();
    } catch (e: any) {
      alert(e.message || "Error al seguir la tienda.");
    }
  };

  // Price input states for the price form
  const [tempPriceMin, setTempPriceMin] = useState(priceMin);
  const [tempPriceMax, setTempPriceMax] = useState(priceMax);

  useEffect(() => {
    setTempPriceMin(priceMin);
    setTempPriceMax(priceMax);
  }, [priceMin, priceMax]);

  // Sidebar shared markup
  const FilterContent = () => (
    <div className="space-y-5">
      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="pb-1">
        <label className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-1.5 block">Buscar</label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-[#f00856] placeholder:text-slate-500 rounded-lg transition-all duration-200 focus:bg-white/10"
          />
        </div>
      </form>

      {/* Categories */}
      <div>
        <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Categoría</h3>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => handleCategorySelect('')}
            className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
              !categorySlug
                ? 'text-[#f00856] font-bold'
                : 'text-slate-400 hover:text-white font-medium'
            }`}
          >
            <span className="truncate pr-2">Todos los productos</span>
            <span className="text-[10px] font-mono shrink-0 ml-2">[{totalProducts}]</span>
          </button>

          {categoriesLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />)
          ) : (
            (() => {
              const parentCategories = visibleCategories.filter(c => c.parent_id === null);
              return parentCategories.map(parent => {
                const subcategories = visibleCategories.filter(sub => sub.parent_id === parent.id);
                const isParentActive = categorySlug === parent.slug;
                const isAnySubActive = subcategories.some(sub => categorySlug === sub.slug);
                const isExpanded = expandedCategoryId === parent.id;
                const count = categoryCounts[parent.id] || 0;

                return (
                  <div key={parent.id} className="flex flex-col">
                    <button
                      onClick={() => {
                        setExpandedCategoryId(prev => prev === parent.id ? null : parent.id);
                        handleCategorySelect(parent.slug);
                      }}
                      className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
                        isParentActive || isAnySubActive
                          ? 'text-white font-bold'
                          : 'text-slate-400 hover:text-white font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-1 min-w-0 pr-2">
                        <span className="truncate">{parent.name}</span>
                        {subcategories.length > 0 && (
                          <ChevronRight 
                            className={`w-3 h-3 text-slate-500 shrink-0 transition-transform duration-200 ${
                              isExpanded ? 'rotate-90 text-white' : ''
                            }`} 
                          />
                        )}
                      </div>
                      <span className={`text-[10px] font-mono shrink-0 ml-2 ${isParentActive || isAnySubActive ? 'text-[#f00856]' : 'text-slate-500'}`}>
                        [{count}]
                      </span>
                    </button>

                    <div className={`category-accordion-wrapper ${isExpanded ? 'category-accordion-wrapper--open' : ''}`}>
                      <div className="category-accordion-content">
                        {isExpanded && subcategories.length > 0 && (
                          <div className="pl-3 flex flex-col gap-1 border-l border-white/5 ml-1.5 mt-0.5 mb-1">
                            {subcategories.map((sub, index) => {
                              const isSubActive = categorySlug === sub.slug;
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => handleCategorySelect(sub.slug)}
                                  className={`subcategory-stagger-item w-full flex items-center justify-between text-left text-xs py-0.5 transition-all ${
                                    isSubActive
                                      ? 'text-[#f00856] font-bold'
                                      : 'text-slate-400 hover:text-white font-medium'
                                  }`}
                                  style={{ animationDelay: `${index * 15}ms` }}
                                >
                                  <span className="text-[11px] truncate pr-2">{sub.name}</span>
                                  <span className="text-[10px] font-mono shrink-0 text-slate-500">
                                    [{sub.count}]
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>

      {/* Brands */}
      <div>
        <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Marca</h3>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => handleBrandSelect('')}
            className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
              !brandSlug
                ? 'text-[#f00856] font-bold'
                : 'text-slate-400 hover:text-white font-medium'
            }`}
          >
            <span>Todas las marcas</span>
          </button>

          {facetsLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />)
          ) : (
            (() => {
              const activeFacet = brandFacets.find(f => f.brand_slug === brandSlug);
              
              let topFacets = brandFacets.slice(0, 8);
              if (activeFacet && !topFacets.some(f => f.brand_id === activeFacet.brand_id)) {
                topFacets.push(activeFacet);
              }

              const normalizedSearch = normalizeText(searchBrandQuery);
              const filteredFacets = brandFacets.filter(f => 
                normalizeText(f.brand_name).includes(normalizedSearch)
              );

              return (
                <div className="flex flex-col">
                  {!brandsExpanded ? (
                    <div className="flex flex-col gap-1">
                      {topFacets.map(b => {
                        const isBrandActive = brandSlug === b.brand_slug;
                        return (
                          <button
                            key={b.brand_id}
                            onClick={() => handleBrandSelect(b.brand_slug)}
                            className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
                              isBrandActive
                                ? 'text-[#f00856] font-bold'
                                : 'text-slate-400 hover:text-white font-medium'
                            }`}
                          >
                            <span className="truncate pr-2">{b.brand_name}</span>
                            <span className={`text-[10px] font-mono shrink-0 ml-2 ${isBrandActive ? 'text-[#f00856]' : 'text-slate-500'}`}>
                              [{b.product_count}]
                            </span>
                          </button>
                        );
                      })}
                      
                      {brandFacets.length > 8 && (
                        <button
                          onClick={() => setBrandsExpanded(true)}
                          className="text-[11px] font-bold text-[#f00856] hover:underline text-left mt-1 py-0.5"
                        >
                          Ver todas las marcas ({brandFacets.length})
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="relative mb-2 mt-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                        <input
                          type="text"
                          placeholder="Buscar marca..."
                          value={searchBrandQuery}
                          onChange={e => setSearchBrandQuery(e.target.value)}
                          className="w-full pl-7 pr-3 py-1.5 text-[11px] border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-[#f00856] placeholder:text-slate-500 rounded-lg transition-all duration-200 focus:bg-white/10"
                        />
                      </div>

                      <div className="brand-accordion-wrapper brand-accordion-wrapper--open">
                        <div className="brand-accordion-content">
                          <div className="max-h-[320px] overflow-y-auto pr-1 flex flex-col gap-1 premium-scrollbar">
                            {filteredFacets.length === 0 ? (
                              <span className="text-[11px] text-slate-500 py-2 block">No se encontraron marcas</span>
                            ) : (
                              filteredFacets.map(b => {
                                const isBrandActive = brandSlug === b.brand_slug;
                                return (
                                  <button
                                    key={b.brand_id}
                                    onClick={() => handleBrandSelect(b.brand_slug)}
                                    className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
                                      isBrandActive
                                        ? 'text-[#f00856] font-bold'
                                        : 'text-slate-400 hover:text-white font-medium'
                                    }`}
                                  >
                                    <span className="truncate pr-2">{b.brand_name}</span>
                                    <span className={`text-[10px] font-mono shrink-0 ml-2 ${isBrandActive ? 'text-[#f00856]' : 'text-slate-500'}`}>
                                      [{b.product_count}]
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setBrandsExpanded(false);
                          setSearchBrandQuery('');
                        }}
                        className="text-[11px] font-bold text-slate-500 hover:text-white text-left mt-2 py-0.5"
                      >
                        Mostrar menos
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Precio</h3>
        <form onSubmit={e => handlePriceApply(e, tempPriceMin, tempPriceMax)} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Mín"
              value={tempPriceMin}
              onChange={e => setTempPriceMin(e.target.value)}
              className="w-1/2 border border-white/10 px-2 py-1.5 text-xs bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-[#f00856] placeholder:text-slate-500 rounded-lg"
            />
            <input
              type="number"
              placeholder="Máx"
              value={tempPriceMax}
              onChange={e => setTempPriceMax(e.target.value)}
              className="w-1/2 border border-white/10 px-2 py-1.5 text-xs bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-[#f00856] placeholder:text-slate-500 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="w-full py-1.5 text-xs font-bold bg-[#f00856] text-white rounded-lg hover:bg-[#d0074a] transition-colors"
          >
            Aplicar
          </button>
        </form>
      </div>

      {/* Clear Filters */}
      {(categorySlug || brandSlug || searchQ || priceMin || priceMax) && (
        <button
          onClick={clearAllFilters}
          className="w-full py-1.5 text-xs font-bold text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/5 transition-colors"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-[#05070f]">
        <Store className="w-12 h-12 text-[#f00856] animate-pulse" />
        <p className="font-bold text-gray-500 uppercase tracking-widest text-sm">Cargando tienda...</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-[#05070f]">
        <Store className="w-16 h-16 text-gray-700" />
        <h1 className="text-2xl font-black text-white">Tienda no encontrada</h1>
        <p className="text-gray-500 font-bold">La tienda oficial que buscas no existe o está inactiva.</p>
        <Link to="/shop" className="mt-4 bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-[#f00856] hover:text-white transition-colors">
          Volver al Catálogo
        </Link>
      </div>
    );
  }

  const totalPages = Math.ceil(totalProducts / pageSize);
  const memberSinceYear = store.created_at ? new Date(store.created_at).getFullYear() : '2025';

  const seoTitle = store.seo_title || `${store.store_name} - Tienda Oficial | Collectibles`;
  const seoDesc = store.seo_description || store.description || `Encuentra los productos de ${store.store_name} en Collectibles Uruguay.`;
  const canonicalUrl = `https://collectibles.uy/store/${slug}`;

  // Trust metrics helpers
  const showRating = store.reviews_count > 0;
  const showResponseRate = store.response_rate > 0;
  const showCompletedOrders = store.completed_orders > 0 || store.sales_count > 0;

  return (
    <div className="min-h-screen bg-[#05070f] pb-20 pt-20">
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        {store.logo_url && <meta property="og:image" content={store.logo_url} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDesc} />
        {store.logo_url && <meta name="twitter:image" content={store.logo_url} />}
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Store",
            "name": store.store_name,
            "description": seoDesc,
            "url": canonicalUrl,
            "image": store.logo_url || "https://collectibles.uy/logo.png",
            "telephone": store.contact_phone || undefined,
            "email": store.contact_email || undefined,
            "address": pickupAddress ? {
              "@type": "PostalAddress",
              "streetAddress": pickupAddress,
              "addressLocality": store.city || "Montevideo",
              "addressCountry": "UY"
            } : undefined,
            "aggregateRating": store.reviews_count > 0 ? {
              "@type": "AggregateRating",
              "ratingValue": store.rating,
              "reviewCount": store.reviews_count
            } : undefined
          })}
        </script>
      </Helmet>

      {/* Main Layout Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Desktop Sidebar */}
          <aside className="w-64 shrink-0 hidden lg:block space-y-6">
            <div className="glass p-6 rounded-[20px] border border-white/5 shadow-xl">
              <FilterContent />
            </div>
          </aside>

          {/* Main Storefront Area */}
          <main className="flex-1 min-w-0 space-y-6">
            
            {/* Store Header Card */}
            <div className="glass rounded-[24px] border border-white/5 p-6 relative overflow-hidden shadow-2xl">
              {/* Background Glow */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#f00856]/5 to-indigo-500/5 rounded-full blur-3xl -z-10" />
              
              <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                {/* Store Logo */}
                <div className="w-24 h-24 rounded-2xl border border-white/10 bg-[#0a0d16] overflow-hidden flex-shrink-0 flex items-center justify-center p-2">
                  {store.logo_url ? (
                    <img src={store.logo_url} alt={store.store_name} className="w-full h-full object-contain" />
                  ) : (
                    <Store className="w-10 h-10 text-white/20" />
                  )}
                </div>

                {/* Info Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
                      {store.store_name}
                    </h1>

                    {/* Official & Verification Badges */}
                    {store.is_official &&
                     store.status === 'active' &&
                     store.approved_by &&
                     store.approved_at && (
                      <span className="text-[8px] bg-red-500 border border-red-400 text-white px-2.5 py-1 rounded-full uppercase tracking-wider font-black">
                        TIENDA OFICIAL
                      </span>
                    )}

                    {kycStatus === 'approved' && (
                      <span className="text-[8px] bg-[#f00856]/10 border border-[#f00856]/20 text-[#f00856] px-2.5 py-1 rounded-full uppercase tracking-wider font-black">
                        VERIFICADO
                      </span>
                    )}

                    {badges && badges.map((b: any) => (
                      <span key={b.id} className="text-[8px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-full uppercase tracking-wider font-black">
                        {b.name}
                      </span>
                    ))}
                  </div>

                  <p className="text-slate-400 mt-2 text-xs font-semibold leading-relaxed max-w-xl">
                    {store.description || 'Tienda oficial certificada en el ecosistema de Collectibles Uruguay.'}
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    <span>Miembro desde {memberSinceYear}</span>
                    <span>•</span>
                    <span>{totalProducts} productos disponibles</span>
                    {pickupAddress && (
                      <>
                        <span>•</span>
                        <span className="text-[#f00856] truncate max-w-xs">{pickupAddress}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Follow Button */}
                <div className="w-full md:w-auto self-stretch md:self-center flex flex-col justify-center">
                  <button
                    onClick={handleFollowClick}
                    disabled={followLoading}
                    className={`w-full md:w-auto py-3 px-6 rounded-xl font-black text-xs uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${
                      isFollowing 
                        ? 'bg-white/10 hover:bg-red-500/20 text-red-500 border border-red-500/30' 
                        : 'bg-white hover:bg-[#f00856] text-black hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    {isFollowing ? 'Siguiendo' : 'Seguir tienda'}
                  </button>
                </div>
              </div>
            </div>

            {/* Trust Metrics Section */}
            <div className="bg-[#0b0e17] border border-white/5 rounded-2xl p-4 flex flex-wrap divide-x divide-white/5 items-center justify-between text-center shadow-md">
              {showRating ? (
                <div className="flex-1 min-w-[120px] py-1">
                  <div className="flex items-center justify-center gap-1 text-amber-400 font-bold mb-0.5">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-white text-sm font-black">{Number(store.rating || 0).toFixed(1)}</span>
                  </div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Calificación</div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-0.5">({store.reviews_count} opiniones)</div>
                </div>
              ) : (
                <div className="flex-1 min-w-[120px] py-1">
                  <div className="text-slate-400 text-xs font-bold mb-1">Sin opiniones aún</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Calificación</div>
                </div>
              )}

              {showResponseRate && (
                <div className="flex-1 min-w-[120px] py-1">
                  <div className="text-emerald-400 text-sm font-black mb-0.5">{store.response_rate}%</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Entregas a tiempo</div>
                  {store.late_shipments > 0 && (
                    <div className="text-[10px] text-slate-400 font-semibold mt-0.5">({store.late_shipments} demoradas)</div>
                  )}
                </div>
              )}

              {showCompletedOrders && (
                <div className="flex-1 min-w-[120px] py-1">
                  <div className="text-[#f00856] text-sm font-black mb-0.5">
                    {(store.completed_orders || store.sales_count).toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Ventas completadas</div>
                </div>
              )}

              <div className="flex-1 min-w-[120px] py-1">
                <div className="text-white text-sm font-black mb-0.5">{totalProducts}</div>
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Productos disponibles</div>
              </div>
            </div>

            {/* Navigation Tabs & Toolbar */}
            <div className="space-y-4">
              {/* Internal navigation */}
              <div className="flex gap-6 border-b border-white/5 pb-0">
                <button
                  onClick={() => { setActiveFilterTab('all'); setSearchParams({}); }}
                  className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
                    activeFilterTab === 'all'
                      ? 'text-[#f00856] border-[#f00856]'
                      : 'text-slate-400 hover:text-white border-transparent'
                  }`}
                >
                  Productos
                </button>
                <button
                  onClick={() => { setActiveFilterTab('featured'); setSearchParams({}); }}
                  className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
                    activeFilterTab === 'featured'
                      ? 'text-[#f00856] border-[#f00856]'
                      : 'text-slate-400 hover:text-white border-transparent'
                  }`}
                >
                  Destacados
                </button>
                <button
                  onClick={() => { setActiveFilterTab('new'); setSearchParams({}); }}
                  className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
                    activeFilterTab === 'new'
                      ? 'text-[#f00856] border-[#f00856]'
                      : 'text-slate-400 hover:text-white border-transparent'
                  }`}
                >
                  Novedades
                </button>
              </div>

              {/* Mobile Filter Trigger & Counter */}
              <div className="lg:hidden flex items-center justify-between gap-4">
                <button
                  onClick={() => setMobileFilters(true)}
                  className="flex items-center gap-2 px-4 py-2 border border-white/10 bg-white/5 text-white rounded-xl text-xs font-bold hover:bg-white/10 transition-all"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filtros
                  {(categorySlug || brandSlug || searchQ || priceMin || priceMax) && (
                    <span className="w-2 h-2 rounded-full bg-[#f00856]" />
                  )}
                </button>

                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  {totalProducts} productos
                </div>
              </div>

              {/* Toolbar: Search inside store & Sort */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-3 border-b border-white/5">
                <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder={`Buscar en ${store.store_name}...`}
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-[#f00856] placeholder:text-slate-500 rounded-lg transition-all focus:bg-white/10"
                  />
                </form>

                <div className="flex items-center gap-2 justify-between md:justify-end">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ordenar por:</span>
                  <select
                    value={sortBy}
                    onChange={e => handleSortChange(e.target.value)}
                    className="bg-[#05070f] border border-white/10 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#f00856] cursor-pointer"
                  >
                    <option value="default">Recomendados</option>
                    <option value="newest">Más recientes</option>
                    <option value="price-low">Precio: menor a mayor</option>
                    <option value="price-high">Precio: mayor a menor</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Product Grid & Loader */}
            {loadingProducts ? (
              <div className="text-center py-24 glass rounded-[24px] border border-white/5 shadow-2xl">
                <Store className="w-10 h-10 text-[#f00856] mx-auto mb-4 animate-pulse" />
                <h3 className="text-xs font-black text-white tracking-widest uppercase">Cargando catálogo...</h3>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-24 glass rounded-[24px] border border-white/5 shadow-2xl">
                <Store className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <h3 className="text-sm font-black text-white mb-1 uppercase tracking-wider">Sin resultados</h3>
                <p className="text-slate-500 text-xs font-bold max-w-xs mx-auto">No se encontraron productos que coincidan con la búsqueda o filtros aplicados.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Responsive grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                  {products.map(product => (
                    <ProductGridCard 
                      key={product.id} 
                      product={product} 
                      onAddToCart={handleAddToCart}
                      formatPrice={formatPrice}
                    />
                  ))}
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="pt-8 flex justify-center border-t border-white/5">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => {
                          const params = new URLSearchParams(searchParams);
                          params.set('page', String(Math.max(1, page - 1)));
                          setSearchParams(params);
                          window.scrollTo({ top: 300, behavior: 'smooth' });
                        }}
                        disabled={page === 1}
                        className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                      >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                      </button>
                      <span className="text-xs font-bold text-slate-400">
                        Página {page} de {totalPages}
                      </span>
                      <button 
                        onClick={() => {
                          const params = new URLSearchParams(searchParams);
                          params.set('page', String(Math.min(totalPages, page + 1)));
                          setSearchParams(params);
                          window.scrollTo({ top: 300, behavior: 'smooth' });
                        }}
                        disabled={page >= totalPages}
                        className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                      >
                        Siguiente <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {mobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setMobileFilters(false)} />
          <div className="fixed inset-y-0 left-0 w-[280px] bg-[#05070f] border-r border-white/10 p-6 overflow-y-auto z-50 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-white/5">
                <h2 className="font-black text-sm text-white tracking-widest uppercase">Filtros</h2>
                <button onClick={() => setMobileFilters(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <FilterContent />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

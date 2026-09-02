import { Link, useSearchParams, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, ChevronLeft, SlidersHorizontal, X, Search, Store, ExternalLink, Loader2 } from 'lucide-react';
import { useProducts, useCategories, useBrands, useFilterMappings, useProductGroupMetadata, useBrandFacets, useInternationalCategoryFacets, useLicense, useTheme, useLicenses, useThemes } from '../hooks/useData';
import { useInternationalSettings } from '../hooks/useInternationalSettings';
import { usePromotions, getApplicablePromotions } from '../hooks/usePromotions';
import { useCartContext } from '../contexts/CartContext';
import { useLocale } from '../contexts/LocaleContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { ProductSkeleton } from '../components/Skeletons';
import { ProductBadge } from '../components/ProductBadge';
import { ProductGridCard } from '../components/ProductGridCard';
import { getProductImage } from '../lib/imageUtils';
import { supabase } from '../lib/supabase';
import { trackSearch, generateMetaEventId } from '../lib/meta/metaPixel';
import { trackGA4Event, trackClarityEvent, mapCartItemsToGA4 } from '../lib/analyticsTracker';
import SEO from '../components/SEO';
import { generateBreadcrumbs, generateMetaTitle, generateMetaDescription, generateCanonical } from '../utils/seoHelpers';
import { resolveCartItemPrice } from '../lib/priceResolver';
import { useImageProtection } from '../hooks/useImageProtection';

function getVisiblePages(currentPage: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (currentPage < 4) return [0, 1, 2, 3, 4, '...', total - 1];
  if (currentPage > total - 5) return [0, '...', total - 5, total - 4, total - 3, total - 2, total - 1];
  return [0, '...', currentPage - 1, currentPage, currentPage + 1, '...', total - 1];
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function Shop({ isInternational }: { isInternational?: boolean } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { handleDragStart } = useImageProtection({ isProduct: false });
  const lastTrackedProductsRef = useRef<string>('');
  const { categorySlug: catParam, brandSlug: brandParam, licenseSlug: licParam, themeSlug: themeParam, slug: groupSlug } = useParams<{ categorySlug?: string; brandSlug?: string; licenseSlug?: string; themeSlug?: string; slug?: string }>();
  const location = useLocation();
  const isCategoryRoute = location.pathname.startsWith('/categoria');
  const isBrandRoute = location.pathname.startsWith('/marca');
  const isLicenseRoute = location.pathname.startsWith('/licencias/');
  const isThemeRoute = location.pathname.startsWith('/themes/');

  const categorySlug = isCategoryRoute ? catParam : (searchParams.get('category') || '');
  const brandSlug = isBrandRoute ? brandParam : (searchParams.get('brand') || '');
  const licenseSlug = isLicenseRoute ? licParam : (searchParams.get('license') || '');
  const themeSlug = isThemeRoute ? themeParam : (searchParams.get('theme') || '');

  const { license: currentLicense } = useLicense(licenseSlug || undefined);
  const { theme: currentTheme } = useTheme(themeSlug || undefined);
  const { publicEnabled: intlPublicEnabled } = useInternationalSettings();
  const { licenses: activeLicenses, loading: licensesLoading } = useLicenses(true);
  const { themes: activeThemes, loading: themesLoading } = useThemes(true);

  const badge = searchParams.get('badge') || '';
  const searchQ = searchParams.get('q') || '';
  const conditionFilter = searchParams.get('condition') || '';
  const availabilityFilter = searchParams.get('availability') || '';

  const [licensesExpanded, setLicensesExpanded] = useState(false);
  const [searchLicenseQuery, setSearchLicenseQuery] = useState('');

  // Safeguard: If international is disabled, clear any availability parameter
  useEffect(() => {
    if (intlPublicEnabled === false && availabilityFilter) {
      const params = new URLSearchParams(searchParams);
      params.delete('availability');
      setSearchParams(params, { replace: true });
    }
  }, [intlPublicEnabled, availabilityFilter]);

  const [sortBy, setSortBy] = useState('default');
  const [mobileFilters, setMobileFilters] = useState(false);
  const [gridCols, setGridCols] = useState<number>(() => {
    try { const saved = localStorage.getItem('shop_grid_cols'); return saved ? Number(saved) : 5; } catch { return 5; }
  });

  useEffect(() => {
    try { localStorage.setItem('shop_grid_cols', String(gridCols)); } catch {}
  }, [gridCols]);
  const [page, setPage] = useState(0);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [searchInput, setSearchInput] = useState(searchQ);

  // Debounce search input changes to prevent query thrashing on typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQ) {
        const params = new URLSearchParams(searchParams);
        if (searchInput.trim()) {
          params.set('q', searchInput.trim());
        } else {
          params.delete('q');
        }
        setSearchParams(params);
        setPage(0);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [brandsExpanded, setBrandsExpanded] = useState(false);
  const [searchBrandQuery, setSearchBrandQuery] = useState('');
  const limit = gridCols === 5 ? 15 : 12;

  const [matchedStore, setMatchedStore] = useState<any>(null);

  useEffect(() => {
    if (!searchQ) {
      setMatchedStore(null);
      return;
    }

    async function searchStores() {
      try {
        const { data } = await supabase
          .from('vendor_stores')
          .select('id, store_name, slug, logo_url, description, vendor_store_badge_assignments(status, approved_by, approved_at, vendor_store_badges(*))')
          .eq('status', 'active')
          .or(`store_name.ilike.%${searchQ}%,slug.ilike.%${searchQ}%`)
          .limit(1);
        
        if (data && data.length > 0) {
          const store = data[0];
          const assignments = store.vendor_store_badge_assignments || [];
          const activeBadges = assignments
            .filter((x: any) => x.status === 'active' && x.approved_by && x.approved_at)
            .map((x: any) => x.vendor_store_badges)
            .filter(Boolean);
          setMatchedStore({
            ...store,
            badges: activeBadges
          });
        } else {
          setMatchedStore(null);
        }
      } catch (e) {
        console.error(e);
      }
    }
    searchStores();
  }, [searchQ]);

  const { categories, loading: catsLoading } = useCategories();
  const { brands, loading: brandsLoading } = useBrands();

  const intlFacetFilters = useMemo(() => ({
    brand: brandSlug || undefined,
    search: searchQ || undefined,
    minPrice: priceMin ? Number(priceMin) : undefined,
    maxPrice: priceMax ? Number(priceMax) : undefined
  }), [brandSlug, searchQ, priceMin, priceMax]);

  const { facets: intlCatFacets, loading: intlCatsLoading } = useInternationalCategoryFacets(intlFacetFilters);

  const intlCategories = useMemo(() => {
    return (intlCatFacets || []).map(f => ({
      id: f.category_id,
      parent_id: f.parent_id,
      name: f.name,
      slug: f.slug,
      sort_order: f.sort_order,
      published_products_count: Number(f.product_count),
      status: 'approved'
    }));
  }, [intlCatFacets]);

  const currentCategory = (isInternational ? intlCategories : categories).find(c => c.slug === categorySlug) || categories.find(c => c.slug === categorySlug);
  const currentBrand = brands.find(b => b.slug === brandSlug);

  const brandFacetsFilters = useMemo(() => ({
    category: categorySlug || undefined,
    search: searchQ || undefined,
    group: groupSlug || undefined,
    isInternational: isInternational || false
  }), [categorySlug, searchQ, groupSlug, isInternational]);

  const { brandFacets, loading: facetsLoading } = useBrandFacets(brandFacetsFilters);

  const mappings = useFilterMappings(currentBrand?.id);

  const totalCatalogProducts = useMemo(() => {
    if (isInternational) {
      return (intlCatFacets || []).filter(c => c.parent_id === null).reduce((sum, c) => sum + Number(c.product_count || 0), 0);
    }
    return categories
      .filter(c => c.parent_id === null && c.status === 'approved')
      .reduce((sum, c) => sum + (c.published_products_count || 0), 0);
  }, [categories, isInternational, intlCatFacets]);

  // Auto-expand active parent category on mount or when category is selected via URL
  useEffect(() => {
    if (currentCategory) {
      if (currentCategory.parent_id) {
        setExpandedCategoryId(currentCategory.parent_id);
      } else {
        setExpandedCategoryId(currentCategory.id);
      }
    }
  }, [currentCategory]);

  const visibleCategories = isInternational
    ? intlCategories
    : (currentBrand && mappings.length > 0
        ? categories.filter(c => mappings.some(m => m.category_id === c.id && m.brand_id === currentBrand.id) || c.id === currentCategory?.id)
        : categories);

  const effectiveCatsLoading = isInternational ? intlCatsLoading : catsLoading;

  const visibleBrands = brands;
  
  const { group, loading: groupLoading } = useProductGroupMetadata(groupSlug);
  const cart = useCartContext();
  const { promotions } = usePromotions();
  const { t } = useLocale();
  const { formatCurrencyPrice } = useCurrency();
  const navigate = useNavigate();

  // ✅ Fully server-side — useProducts now resolves slug → id internally
  const { products, count, loading } = useProducts({
    category: categorySlug || undefined,
    brand: brandSlug || undefined,
    license: licenseSlug || undefined,
    theme: themeSlug || undefined,
    badge: badge || undefined,
    condition: conditionFilter || undefined,
    search: searchQ || undefined,
    group: groupSlug || undefined,
    minPrice: priceMin ? Number(priceMin) : undefined,
    maxPrice: priceMax ? Number(priceMax) : undefined,
    sortBy,
    limit,
    offset: page * limit,
    isInternational: isInternational || (intlPublicEnabled && availabilityFilter === 'international'),
  });

  const totalPages = Math.ceil(count / limit);

  // Accumulated products for mobile "Cargar más"
  const [accumulatedProducts, setAccumulatedProducts] = useState<any[]>([]);

  useEffect(() => {
    if (page === 0) {
      setAccumulatedProducts(products || []);
    } else if (products && products.length > 0) {
      setAccumulatedProducts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newItems = products.filter(p => !existingIds.has(p.id));
        return [...prev, ...newItems];
      });
    }
  }, [products, page]);

  // Scroll & State restoration on back navigation
  useEffect(() => {
    const savedStateStr = sessionStorage.getItem('collectibles_shop_session');
    if (savedStateStr) {
      try {
        const savedState = JSON.parse(savedStateStr);
        if (savedState.url === location.pathname + location.search && savedState.scrollY) {
          setTimeout(() => {
            window.scrollTo(0, savedState.scrollY);
          }, 150);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem('collectibles_shop_session', JSON.stringify({
        url: location.pathname + location.search,
        scrollY: window.scrollY,
        page
      }));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname, location.search, page]);

  // Redirect to /shop or /intl if categorySlug is present but not found in categories list
  useEffect(() => {
    if (categorySlug && !effectiveCatsLoading && (isInternational ? intlCategories.length > 0 : categories.length > 0)) {
      const listToCheck = isInternational ? intlCategories : categories;
      const found = listToCheck.some(c => c.slug === categorySlug);
      if (!found) {
        navigate(isInternational ? '/intl' : '/shop', { replace: true });
      }
    }
  }, [categorySlug, effectiveCatsLoading, categories, intlCategories, isInternational, navigate]);

  // GA4 event: view_item_list & view_search_results (Phase 2)
  useEffect(() => {
    if (loading || !products || products.length === 0) return;

    const productsSignature = products.map(p => p.id).join(',');
    if (lastTrackedProductsRef.current === productsSignature) return;
    lastTrackedProductsRef.current = productsSignature;

    if (searchQ) {
      trackGA4Event('view_search_results', {
        search_term: searchQ,
        items: mapCartItemsToGA4(products)
      });
    } else {
      trackGA4Event('view_item_list', {
        item_list_id: categorySlug || brandSlug || 'shop_catalog',
        item_list_name: currentCategory?.name || currentBrand?.name || 'Todos los Productos',
        items: mapCartItemsToGA4(products)
      });
    }
  }, [products, loading, searchQ, categorySlug, brandSlug, currentCategory, currentBrand]);

  useEffect(() => {
    if (searchQ) {
      // GA4 event: search (Phase 2)
      trackGA4Event('search', {
        search_term: searchQ
      });

      try {
        const eventId = generateMetaEventId('Search');
        trackSearch(eventId, searchQ);
      } catch (e) {
        console.warn('Meta tracking error', e);
      }
    }
  }, [searchQ]);

  // getProductImage imported from lib/imageUtils

  function handleAddToCart(p: any) {
    const variant = p.variants?.[0];
    if (!variant) return;
    const resolvedPrice = resolveCartItemPrice(p, variant);
    cart.addItem({ 
      product_id: p.id, 
      variant_id: variant.id, 
      quantity: 1, 
      title: p.title, 
      price: resolvedPrice, 
      image: getProductImage(p), 
      variant_name: variant.name, 
      category_id: p.category_id, 
      brand_id: p.brand_id, 
      vendor_id: p.vendor_id, 
      vendor_store_id: p.vendor_store_id || null,
      vendor_name: p.vendor_store?.store_name || p.vendor?.store_name || 'Collectibles',
      vendor_slug: p.vendor_store?.slug || p.vendor?.slug,
      vendor_logo: p.vendor_store?.logo_url || p.vendor?.logo_url,
      tag_ids: p.product_tags?.map((pt: any) => pt.tag_id) || [] 
    });
  }

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    setSearchParams(params);
    setPage(0);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setFilter('q', searchInput);
  }

  function handleCategorySelect(slug: string) {
    setPage(0);
    const params = new URLSearchParams(searchParams);
    
    if (isInternational) {
      if (slug) {
        params.set('category', slug);
      } else {
        params.delete('category');
      }
      navigate(`/intl?${params.toString()}`);
      return;
    }

    if (isLicenseRoute && licParam) {
      if (slug) {
        params.set('category', slug);
      } else {
        params.delete('category');
      }
      navigate(`/licencias/${licParam}?${params.toString()}`);
    } else if (isThemeRoute && themeParam) {
      if (slug) {
        params.set('category', slug);
      } else {
        params.delete('category');
      }
      navigate(`/themes/${themeParam}?${params.toString()}`);
    } else if (isBrandRoute && brandParam) {
      if (slug) {
        params.set('category', slug);
      } else {
        params.delete('category');
      }
      navigate(`/marca/${brandParam}?${params.toString()}`);
    } else {
      params.delete('category');
      if (slug) {
        navigate(`/categoria/${slug}?${params.toString()}`);
      } else {
        navigate(`/shop?${params.toString()}`);
      }
    }
  }

  function handleBrandSelect(slug: string) {
    setPage(0);
    const params = new URLSearchParams(searchParams);
    
    if (isInternational) {
      if (slug) {
        params.set('brand', slug);
      } else {
        params.delete('brand');
      }
      navigate(`/intl?${params.toString()}`);
      return;
    }

    if (isLicenseRoute && licParam) {
      if (slug) {
        params.set('brand', slug);
      } else {
        params.delete('brand');
      }
      navigate(`/licencias/${licParam}?${params.toString()}`);
    } else if (isThemeRoute && themeParam) {
      if (slug) {
        params.set('brand', slug);
      } else {
        params.delete('brand');
      }
      navigate(`/themes/${themeParam}?${params.toString()}`);
    } else if (isCategoryRoute && catParam) {
      if (slug) {
        params.set('brand', slug);
      } else {
        params.delete('brand');
      }
      navigate(`/categoria/${catParam}?${params.toString()}`);
    } else {
      params.delete('brand');
      if (slug) {
        navigate(`/marca/${slug}?${params.toString()}`);
      } else {
        navigate(`/shop?${params.toString()}`);
      }
    }
  }

  function handleLicenseSelect(slug: string) {
    setPage(0);
    const params = new URLSearchParams(searchParams);
    if (isLicenseRoute) {
      if (slug) {
        navigate(`/licencias/${slug}?${params.toString()}`);
      } else {
        navigate(`/shop?${params.toString()}`);
      }
    } else {
      if (slug) {
        params.set('license', slug);
      } else {
        params.delete('license');
      }
      setSearchParams(params);
    }
  }

  function handleThemeSelect(slug: string) {
    setPage(0);
    const params = new URLSearchParams(searchParams);
    if (isThemeRoute) {
      if (slug) {
        navigate(`/themes/${slug}?${params.toString()}`);
      } else {
        navigate(`/shop?${params.toString()}`);
      }
    } else {
      if (slug) {
        params.set('theme', slug);
      } else {
        params.delete('theme');
      }
      setSearchParams(params);
    }
  }

  function handleAvailabilitySelect(val: string) {
    setPage(0);
    const params = new URLSearchParams(searchParams);
    if (val) {
      params.set('availability', val);
    } else {
      params.delete('availability');
    }
    setSearchParams(params);
  }


  function clearAllFilters() {
    if (isInternational) {
      navigate('/intl');
      setSearchParams({});
      setPriceMin('');
      setPriceMax('');
      setSearchInput('');
      setPage(0);
      return;
    }
    if (isLicenseRoute && licParam) {
      navigate(`/licencias/${licParam}`);
      setSearchParams({});
      setPriceMin('');
      setPriceMax('');
      setSearchInput('');
      setPage(0);
    } else if (isThemeRoute && themeParam) {
      navigate(`/themes/${themeParam}`);
      setSearchParams({});
      setPriceMin('');
      setPriceMax('');
      setSearchInput('');
      setPage(0);
    } else if (groupSlug || isCategoryRoute || isBrandRoute) {
      navigate('/shop');
    } else {
      setSearchParams({});
      setPriceMin('');
      setPriceMax('');
      setSearchInput('');
      setPage(0);
    }
  }

  function handleConditionSelect(val: string) {
    const newParams = new URLSearchParams(searchParams);
    if (val) {
      newParams.set('condition', val);
    } else {
      newParams.delete('condition');
    }
    newParams.delete('page');
    setSearchParams(newParams);
  }

  function applyPriceFilter() {
    setPage(0);
    // Price filter is already reactive via useProducts
  }

  const FilterContent = () => (
    <div className="space-y-5">
      {/* Search */}
      <form onSubmit={handleSearch} className="pb-1">
        <label className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-1.5 block">Buscar</label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#f00856] transition-colors"
          />
        </div>
      </form>

      {/* Categories */}
      <div>
        <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Categoría</h3>
        <div className="flex flex-col gap-1">
          {/* Todos los productos */}
          <button
            onClick={() => handleCategorySelect('')}
            className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
              !categorySlug
                ? 'text-[#f00856] font-bold'
                : 'text-slate-400 hover:text-white font-medium'
            }`}
          >
            <span className="truncate pr-2">Todos los productos</span>
            <span className="text-[10px] font-mono shrink-0 ml-2">[{totalCatalogProducts}]</span>
          </button>

          {effectiveCatsLoading
            ? [...Array(5)].map((_, i) => <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />)
            : (() => {
                const parentCategories = visibleCategories.filter(c => c.parent_id === null && (c.published_products_count === undefined || c.published_products_count > 0) && c.status === 'approved');
                return parentCategories.map(parent => {
                  const children = visibleCategories.filter(
                    sub => sub.parent_id === parent.id && (sub.published_products_count === undefined || sub.published_products_count > 0) && sub.status === 'approved'
                  );
                  const isParentActive = categorySlug === parent.slug;
                  const isAnySubActive = children.some(sub => categorySlug === sub.slug || visibleCategories.some(grand => grand.parent_id === sub.id && categorySlug === grand.slug));
                  const isExpanded = expandedCategoryId === parent.id || isParentActive || isAnySubActive;

                  return (
                    <div key={parent.id} className="flex flex-col">
                      {/* Parent Row */}
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
                          {children.length > 0 && (
                            <ChevronRight 
                              className={`w-3 h-3 text-slate-500 shrink-0 transition-transform duration-200 ${
                                isExpanded ? 'rotate-90 text-white' : ''
                              }`} 
                            />
                          )}
                        </div>
                        <span className={`text-[10px] font-mono shrink-0 ml-2 ${isParentActive || isAnySubActive ? 'text-[#f00856]' : 'text-slate-500'}`}>
                          [{parent.published_products_count ?? 0}]
                        </span>
                      </button>

                      {/* Accordion container */}
                      <div className={`category-accordion-wrapper ${isExpanded ? 'category-accordion-wrapper--open' : ''}`}>
                        <div className="category-accordion-content">
                          {isExpanded && children.length > 0 && (
                            <div className="pl-3 flex flex-col gap-1 border-l border-white/5 ml-1.5 mt-0.5 mb-1">
                              {children.map((sub, index) => {
                                const isSubActive = categorySlug === sub.slug;
                                const grandchildren = visibleCategories.filter(g => g.parent_id === sub.id && (g.published_products_count === undefined || g.published_products_count > 0) && g.status === 'approved');
                                const isAnyGrandActive = grandchildren.some(g => categorySlug === g.slug);

                                return (
                                  <div key={sub.id} className="flex flex-col">
                                    <button
                                      onClick={() => handleCategorySelect(sub.slug)}
                                      className={`subcategory-stagger-item w-full flex items-center justify-between text-left text-xs py-0.5 transition-all ${
                                        isSubActive || isAnyGrandActive
                                          ? 'text-[#f00856] font-bold'
                                          : 'text-slate-400 hover:text-white font-medium'
                                      }`}
                                      style={{ animationDelay: `${index * 15}ms` }}
                                    >
                                      <span className="text-[11px] truncate pr-2">{sub.name}</span>
                                      <span className="text-[10px] font-mono shrink-0">
                                        [{sub.published_products_count ?? 0}]
                                      </span>
                                    </button>

                                    {/* Grandchildren (e.g. Comics -> Marvel) */}
                                    {grandchildren.length > 0 && (
                                      <div className="pl-2 border-l border-[#f00856]/20 ml-1.5 my-0.5 flex flex-col gap-0.5">
                                        {grandchildren.map(grand => {
                                          const isGrandActive = categorySlug === grand.slug;
                                          return (
                                            <button
                                              key={grand.id}
                                              onClick={() => handleCategorySelect(grand.slug)}
                                              className={`w-full flex items-center justify-between text-left text-[11px] py-0.5 transition-all ${
                                                isGrandActive
                                                  ? 'text-[#f00856] font-bold'
                                                  : 'text-slate-400 hover:text-white font-normal'
                                              }`}
                                            >
                                              <span className="truncate pr-2">{grand.name}</span>
                                              <span className="text-[9px] font-mono shrink-0">
                                                [{grand.published_products_count ?? 0}]
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
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
          }
        </div>
      </div>

      {/* Licencias */}
      <div>
        <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Licencia</h3>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => handleLicenseSelect('')}
            className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
              !licenseSlug
                ? 'text-[#f00856] font-bold'
                : 'text-slate-400 hover:text-white font-medium'
            }`}
          >
            <span>Todas las licencias</span>
          </button>

          {licensesLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />)
          ) : (
            (() => {
              const activeLic = activeLicenses.find(l => l.slug === licenseSlug);
              let topLic = activeLicenses.slice(0, 8);
              if (activeLic && !topLic.some(l => l.id === activeLic.id)) {
                topLic.push(activeLic);
              }

              const normalizedSearch = normalizeText(searchLicenseQuery);
              const filteredLicenses = activeLicenses.filter(l => 
                normalizeText(l.name).includes(normalizedSearch)
              );

              return (
                <div className="flex flex-col">
                  {!licensesExpanded ? (
                    <div className="flex flex-col gap-1">
                      {topLic.map(l => {
                        const isLicActive = licenseSlug === l.slug;
                        return (
                          <button
                            key={l.id}
                            onClick={() => handleLicenseSelect(l.slug)}
                            className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
                              isLicActive
                                ? 'text-[#f00856] font-bold'
                                : 'text-slate-400 hover:text-white font-medium'
                            }`}
                          >
                            <span className="truncate pr-2">{l.name}</span>
                            <span className={`text-[10px] font-mono shrink-0 ml-2 ${isLicActive ? 'text-[#f00856]' : 'text-slate-500'}`}>
                              [{l.published_product_count ?? 0}]
                            </span>
                          </button>
                        );
                      })}
                      
                      {activeLicenses.length > 8 && (
                        <button
                          onClick={() => setLicensesExpanded(true)}
                          className="text-[11px] font-bold text-[#f00856] hover:underline text-left mt-1 py-0.5"
                        >
                          Ver todas las licencias ({activeLicenses.length})
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="relative mb-2 mt-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                        <input
                          type="text"
                          placeholder="Buscar licencia..."
                          value={searchLicenseQuery}
                          onChange={e => setSearchLicenseQuery(e.target.value)}
                          className="w-full pl-7 pr-3 py-1.5 text-[11px] border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-[#f00856] placeholder:text-slate-500 rounded-lg transition-all duration-200 focus:bg-white/10"
                        />
                      </div>

                      <div className="license-accordion-wrapper license-accordion-wrapper--open">
                        <div className="license-accordion-content">
                          <div className="max-h-[320px] overflow-y-auto pr-1 flex flex-col gap-1 premium-scrollbar">
                            {filteredLicenses.length === 0 ? (
                              <span className="text-[11px] text-slate-500 py-2 block">No se encontraron licencias</span>
                            ) : (
                              filteredLicenses.map(l => {
                                const isLicActive = licenseSlug === l.slug;
                                return (
                                  <button
                                    key={l.id}
                                    onClick={() => handleLicenseSelect(l.slug)}
                                    className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
                                      isLicActive
                                        ? 'text-[#f00856] font-bold'
                                        : 'text-slate-400 hover:text-white font-medium'
                                    }`}
                                  >
                                    <span className="truncate pr-2">{l.name}</span>
                                    <span className={`text-[10px] font-mono shrink-0 ml-2 ${isLicActive ? 'text-[#f00856]' : 'text-slate-500'}`}>
                                      [{l.published_product_count ?? 0}]
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
                          setLicensesExpanded(false);
                          setSearchLicenseQuery('');
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

      {/* Themes */}
      <div>
        <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Theme</h3>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => handleThemeSelect('')}
            className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
              !themeSlug
                ? 'text-[#f00856] font-bold'
                : 'text-slate-400 hover:text-white font-medium'
            }`}
          >
            <span>Todos los themes</span>
          </button>

          {themesLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />)
          ) : (
            activeThemes.map(t => {
              const isThActive = themeSlug === t.slug;
              return (
                <button
                  key={t.id}
                  onClick={() => handleThemeSelect(t.slug)}
                  className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
                    isThActive
                      ? 'text-[#f00856] font-bold'
                      : 'text-slate-400 hover:text-white font-medium'
                  }`}
                >
                  <span className="truncate pr-2">{t.name}</span>
                  <span className={`text-[10px] font-mono shrink-0 ml-2 ${isThActive ? 'text-[#f00856]' : 'text-slate-500'}`}>
                    [{t.published_product_count ?? 0}]
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Brands */}
      <div>
        <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Marca</h3>
        <div className="flex flex-col gap-1">
          {/* Todas las marcas */}
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
              
              // Collapsed view: Top 8 plus the active one if not already in the top 8
              let topFacets = brandFacets.slice(0, 8);
              if (activeFacet && !topFacets.some(f => f.brand_id === activeFacet.brand_id)) {
                topFacets.push(activeFacet);
              }

              // Normalizing function for client-side search
              const normalizedSearch = normalizeText(searchBrandQuery);
              const filteredFacets = brandFacets.filter(f => 
                normalizeText(f.brand_name).includes(normalizedSearch)
              );

              return (
                <div className="flex flex-col">
                  {/* Facet List (Top list or search results) */}
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
                      {/* Search Bar */}
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

                      {/* Accordion slide animation for scrollable list */}
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

      {/* Disponibilidad (Solo si international_public_enabled === true) */}
      {intlPublicEnabled && (
        <div>
          <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Disponibilidad</h3>
          <div className="flex flex-col gap-1">
            {[
              { id: '', label: 'Todos' },
              { id: 'local', label: 'Stock en Uruguay' },
              { id: 'international', label: 'Internacional' }
            ].map(a => {
              const isSelected = (availabilityFilter || '') === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => handleAvailabilitySelect(a.id)}
                  className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
                    isSelected ? 'text-[#f00856] font-bold' : 'text-slate-400 hover:text-white font-medium'
                  }`}
                >
                  <span>{a.label}</span>
                  {isSelected && <span className="text-[10px] text-[#f00856]">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Price Range — functional inputs */}
      <div>
        <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Precio</h3>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Mín"
            value={priceMin}
            onChange={e => setPriceMin(e.target.value)}
            className="w-1/2 border border-white/10 px-2 py-1.5 text-xs bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-[#f00856] placeholder:text-slate-500 rounded-lg"
          />
          <input
            type="number"
            placeholder="Máx"
            value={priceMax}
            onChange={e => setPriceMax(e.target.value)}
            className="w-1/2 border border-white/10 px-2 py-1.5 text-xs bg-white/5 text-white focus:outline-none focus:ring-1 focus:ring-[#f00856] placeholder:text-slate-500 rounded-lg"
          />
        </div>
        <button
          onClick={applyPriceFilter}
          className="mt-2 w-full py-1.5 text-xs font-bold bg-[#f00856] text-white rounded-lg hover:bg-[#d0074a] transition-colors"
        >
          Aplicar
        </button>
      </div>

      {/* 🏷️ Condition Filter (New, Used, Loose) */}
      <div>
        <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-2 block">Estado</h3>
        <div className="flex flex-col gap-1">
          {[
            { id: '', label: 'Todos' },
            { id: 'new', label: 'New (Nuevo / Sealed)' },
            { id: 'used', label: 'Used (Usado)' },
            { id: 'loose', label: 'Loose (Suelto sin caja)' }
          ].map(c => {
            const isSelected = (conditionFilter || '') === c.id;
            return (
              <button
                key={c.id}
                onClick={() => handleConditionSelect(c.id)}
                className={`w-full flex items-center justify-between text-left py-1 text-xs transition-all ${
                  isSelected ? 'text-[#f00856] font-bold' : 'text-slate-400 hover:text-white font-medium'
                }`}
              >
                <span>{c.label}</span>
                {isSelected && <span className="text-[10px] text-[#f00856]">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Clear filters */}
      {(categorySlug || brandSlug || licenseSlug || themeSlug || searchQ || priceMin || priceMax || groupSlug || conditionFilter || availabilityFilter) && (
        <button
          onClick={clearAllFilters}
          className="w-full py-1.5 text-xs font-bold text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/5 transition-colors"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );

  const pageTitle = isInternational
    ? "Catálogo Internacional"
    : group?.name ||
      (isLicenseRoute && (currentLicense?.name || licParam) ? currentLicense?.name || licParam : null) ||
      (isThemeRoute && (currentTheme?.name || themeParam) ? currentTheme?.name || themeParam : null) ||
      currentCategory?.name ||
      currentBrand?.name ||
      (searchQ ? `"${searchQ}"` : t('shop.title'));

  const seoType = isLicenseRoute
    ? 'licencia'
    : isThemeRoute
    ? 'theme'
    : isCategoryRoute && currentCategory
    ? 'categoria'
    : isBrandRoute && currentBrand
    ? 'marca'
    : 'shop';

  const entityObj = isLicenseRoute
    ? currentLicense
    : isThemeRoute
    ? currentTheme
    : isCategoryRoute && currentCategory
    ? currentCategory
    : isBrandRoute && currentBrand
    ? currentBrand
    : group;

  const breadcrumbSchema = generateBreadcrumbs(seoType as any, entityObj);
  const shopSeoTitle = isLicenseRoute && (currentLicense?.name || licParam)
    ? `${currentLicense?.name || licParam} | Collectibles Uruguay`
    : isThemeRoute && (currentTheme?.name || themeParam)
    ? `${currentTheme?.name || themeParam} | Collectibles Uruguay`
    : generateMetaTitle(seoType, pageTitle);

  const shopSeoDesc = isLicenseRoute && currentLicense
    ? (currentLicense.description || `Explorá figuras y coleccionables de ${currentLicense.name} en Collectibles Uruguay.`)
    : isThemeRoute && currentTheme
    ? (currentTheme.description || `Explorá productos del theme ${currentTheme.name} en Collectibles Uruguay.`)
    : generateMetaDescription(seoType, group?.description || currentCategory?.description || currentBrand?.description, pageTitle);

  const shopSeoUrl = isLicenseRoute && licParam
    ? `https://collectibles.uy/licencias/${licParam}`
    : isThemeRoute && themeParam
    ? `https://collectibles.uy/themes/${themeParam}`
    : generateCanonical(seoType, entityObj?.slug);

  return (
    <div className="bg-[#05070f] text-white">
      <SEO
        title={shopSeoTitle}
        description={shopSeoDesc}
        url={shopSeoUrl}
        schema={[breadcrumbSchema]}
      />

      {/* BREADCRUMB */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2 text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
        <Link to="/" className="hover:text-white transition-colors">Inicio</Link>
        <ChevronRight className="w-3 h-3" />
        {isLicenseRoute && (currentLicense || licParam) ? (
          <>
            <Link to="/licencias" className="hover:text-white transition-colors">Licencias</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#f00856]">{currentLicense?.name || licParam}</span>
          </>
        ) : isThemeRoute && (currentTheme || themeParam) ? (
          <>
            <Link to="/themes" className="hover:text-white transition-colors">Themes</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#f00856]">{currentTheme?.name || themeParam}</span>
          </>
        ) : isCategoryRoute && currentCategory ? (
          <>
            <span className="text-slate-500">Categorías</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#f00856]">{currentCategory.name}</span>
          </>
        ) : isBrandRoute && currentBrand ? (
          <>
            <span className="text-slate-500">Marcas</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#f00856]">{currentBrand.name}</span>
          </>
        ) : group ? (
          <>
            <span className="text-slate-500">Colecciones</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#f00856]">{group.name}</span>
          </>
        ) : (
          <span className="text-[#f00856]">Catálogo</span>
        )}
      </div>

      {/* EDITORIAL HERO SECTION */}
      <section className="relative hero-noise overflow-hidden border-b border-white/10">
        <div className={`absolute -right-40 top-0 w-[560px] h-[560px] blur-3xl rounded-full ${isInternational ? 'bg-sky-500/20' : 'bg-[#f00856]/20'}`}></div>
        <div className="relative max-w-7xl mx-auto px-6 py-6 md:py-10">
          <div className={`label-tag ${isInternational ? 'bg-sky-950/80 border border-sky-500/40 text-sky-300' : ''}`}>
            {isInternational
              ? "🌎 Catálogo Internacional"
              : isLicenseRoute
              ? "Licencia"
              : isThemeRoute
              ? "Theme"
              : group
              ? "Colección"
              : isCategoryRoute
              ? "Categoría"
              : isBrandRoute
              ? "Marca"
              : "Catálogo"}
          </div>
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {isLicenseRoute && currentLicense?.logo_url && (
              <img
                src={currentLicense.logo_url}
                alt={currentLicense.name}
                className="h-12 md:h-16 object-contain max-w-[200px]"
              />
            )}
            <h1 className="text-5xl md:text-7xl font-black leading-[.9] tracking-tighter">
              {isInternational
                ? "Collectibles Internacional"
                : isLicenseRoute && (currentLicense || licParam)
                ? currentLicense?.name || licParam
                : isThemeRoute && (currentTheme || themeParam)
                ? currentTheme?.name || themeParam
                : group
                ? group.name
                : isCategoryRoute && currentCategory
                ? currentCategory.name
                : isBrandRoute && currentBrand
                ? currentBrand.name
                : "Productos"}
            </h1>
            {group?.badge_image_url && (
              <img
                src={group.badge_image_url}
                alt={group.badge_alt_text || `Cocarda de ${group.name}`}
                className="w-12 h-12 md:w-16 md:h-16 object-contain pointer-events-none drop-shadow-md select-none"
              />
            )}
          </div>
          <p className="text-slate-300 text-lg mt-5 max-w-3xl leading-relaxed">
            {isInternational
              ? "Explorá figuras y coleccionables importados a pedido. Precios en USD con entrega directa en tu casilla de EE.UU."
              : isLicenseRoute && currentLicense?.description
              ? currentLicense.description
              : isThemeRoute && currentTheme?.description
              ? currentTheme.description
              : group
              ? group.description || "Explora esta colección exclusiva de productos curados."
              : ""}
          </p>
        </div>
      </section>

      {/* MOBILE FILTER BUTTON */}
      <div className="lg:hidden sticky top-20 z-30 bg-[#05070f]/90 backdrop-blur-lg border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-400">{count} productos</span>
        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(0); }}
            className="bg-[#0e1525] border border-white/10 rounded-full px-4 py-2 text-xs font-bold text-white focus:outline-none cursor-pointer"
          >
            <option value="default" className="bg-[#0e1525] text-white">Recomendados</option>
            <option value="newest" className="bg-[#0e1525] text-white">Más nuevos</option>
            <option value="price-low" className="bg-[#0e1525] text-white">Menor precio</option>
            <option value="price-high" className="bg-[#0e1525] text-white">Mayor precio</option>
            <option value="name" className="bg-[#0e1525] text-white">A-Z</option>
          </select>
          <button
            onClick={() => {
              trackClarityEvent('filter_open');
              setMobileFilters(true);
            }}
            className="flex items-center gap-2 bg-[#f00856] text-white rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg shadow-[#f00856]/30"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtros
            {(categorySlug || brandSlug || priceMin || priceMax) && (
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* MOBILE FILTER DRAWER */}
      {mobileFilters && (
        <div className="fixed inset-0 z-[200] lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileFilters(false)} />
          <div className="absolute inset-y-0 right-0 w-[85%] max-w-sm bg-[#05070f] border-l border-white/10 flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="font-black text-xl text-white">Filtros</h2>
              <button onClick={() => setMobileFilters(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <FilterContent />
            </div>
            <div className="p-6 border-t border-white/10">
              <button
                onClick={() => {
                  trackClarityEvent('filter_apply');
                  setMobileFilters(false);
                }}
                className="btn-primary w-full rounded-full py-4 text-sm font-black uppercase"
              >
                Ver {count} resultados
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1500px] mx-auto px-6 py-10 grid lg:grid-cols-[260px_1fr] gap-8">
        {/* FILTERS ASIDE — hidden on mobile, shown on desktop */}
        <aside className="hidden lg:block glass rounded-none p-5 h-[calc(100vh-120px)] max-h-[calc(100vh-120px)] min-h-0 sticky top-24 z-10 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h2 className="font-black text-xl tracking-tight">Filtros</h2>
            {(categorySlug || brandSlug || searchQ || groupSlug) && (
              <button onClick={() => navigate('/shop')} className="text-xs font-black text-[#f00856] uppercase hover:underline">Limpiar</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto pr-1 premium-scrollbar pb-2">
            <FilterContent />
          </div>
        </aside>

        {/* PRODUCTS GRID */}
        <section className="min-w-0">
          {/* Header: título + controles */}
          <div className="mb-8">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div className="label-tag">{group ? "Colección" : "Marketplace integrado"}</div>
                <h2 className="text-3xl font-black mt-1 text-white tracking-tight">
                  {searchQ ? `Resultados para "${searchQ}"` : group ? group.name : "Resultados destacados"}
                </h2>
              </div>
              {/* Column selector — siempre visible en desktop */}
              <div className="hidden md:flex items-center gap-2 text-xs font-bold text-slate-400">
                <span>Vista</span>
                {[3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => { setGridCols(n); setPage(0); }}
                    className={`w-8 h-8 rounded font-black text-sm transition-all ${
                      gridCols === n
                        ? 'bg-[#f00856] text-white shadow-lg shadow-[#f00856]/30'
                        : 'border border-white/10 text-slate-400 hover:text-white hover:border-white/30'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

          {matchedStore && (
            <div className="mt-6 glass p-6 rounded-3xl border border-[#f00856]/20 bg-gradient-to-r from-[#f00856]/10 to-indigo-500/5 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-[#f00856]/40 transition-colors animate-fade-in">
              <div className="flex items-center gap-4 text-left">
                <div className="w-16 h-16 rounded-2xl bg-[#0a0d16] border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
                  {matchedStore.logo_url ? (
                    <img 
                      src={matchedStore.logo_url} 
                      alt={matchedStore.store_name} 
                      draggable={false}
                      onDragStart={handleDragStart}
                      className="w-full h-full object-contain img-protected" 
                    />
                  ) : (
                    <Store className="w-8 h-8 text-white/20" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                  {matchedStore.badges && matchedStore.badges.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {matchedStore.badges.map((b: any) => (
                        <span key={b.id || b.badge_key} className={`text-[9px] border px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold ${b.color_class || 'bg-red-500/20 text-[#f00856] border-red-500/30'}`} title={b.description}>
                          {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                  </div>
                  <h3 className="text-xl font-black text-white mt-1 uppercase tracking-tight">{matchedStore.store_name}</h3>
                  <p className="text-xs text-slate-400 font-semibold line-clamp-1 mt-0.5">{matchedStore.description || 'Visita la tienda oficial para ver todo su catálogo.'}</p>
                </div>
              </div>
              <Link
                to={`/store/${matchedStore.slug}`}
                className="bg-white hover:bg-[#f00856] text-black hover:text-white font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl transition-all shadow-md flex items-center gap-2 w-full md:w-auto justify-center"
              >
                Visitar Tienda Oficial <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          )}

            {/* Barra secundaria: count + sort */}
            <div className="hidden lg:flex items-center gap-3 mt-4">
              <span className="text-sm font-bold text-slate-500">{count} productos encontrados</span>
              <select
                value={sortBy}
                onChange={e => { setSortBy(e.target.value); setPage(0); }}
                className="bg-[#0e1525] rounded-full px-5 py-2 text-xs font-black uppercase tracking-widest text-white border border-white/10 hover:border-white/20 focus:outline-none cursor-pointer"
              >
                <option value="default" className="bg-[#0e1525] text-white">Recomendados</option>
                <option value="newest" className="bg-[#0e1525] text-white">Más nuevos</option>
                <option value="price-low" className="bg-[#0e1525] text-white">Menor precio</option>
                <option value="price-high" className="bg-[#0e1525] text-white">Mayor precio</option>
                <option value="name" className="bg-[#0e1525] text-white">A-Z</option>
              </select>
            </div>
          </div>

          {loading && page === 0 ? (
            <div className={`grid gap-x-6 gap-y-12 grid-cols-2 ${
              gridCols === 3 ? 'md:grid-cols-3' :
              gridCols === 4 ? 'md:grid-cols-3 lg:grid-cols-4' :
              'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            }`}>
              {[...Array(gridCols * 2)].map((_, i) => <ProductSkeleton key={i} />)}
            </div>
          ) : products.length === 0 && accumulatedProducts.length === 0 ? (
            <div className="glass rounded-[2rem] p-20 text-center">
              <Search className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              {categorySlug && brandSlug ? (
                <>
                  <h3 className="text-xl font-black text-white">No hay productos con esta combinación</h3>
                  <p className="text-slate-500 mt-2">La categoría y la marca seleccionadas no tienen productos en común.</p>
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
                    <button onClick={() => setFilter('brand', '')} className="btn-secondary whitespace-nowrap">
                      Ver solo {currentCategory?.name || 'la categoría'}
                    </button>
                    <button onClick={() => setFilter('category', '')} className="btn-secondary whitespace-nowrap">
                      Ver solo {currentBrand?.name || 'la marca'}
                    </button>
                    <button onClick={clearAllFilters} className="text-slate-400 hover:text-white text-sm font-bold ml-2">
                      Limpiar filtros
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-black text-white">No encontramos resultados</h3>
                  <p className="text-slate-500 mt-1">Probá con otros filtros o términos de búsqueda.</p>
                  <button onClick={clearAllFilters} className="btn-primary mt-6">Ver todo el catálogo</button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* DESKTOP GRID (Paginated page view) */}
              <div className={`hidden lg:grid gap-x-6 gap-y-12 ${
                gridCols === 3 ? 'grid-cols-3' :
                gridCols === 4 ? 'grid-cols-4' :
                'grid-cols-5'
              }`}>
                {products.map(p => {
                  const applicablePromos = getApplicablePromotions({
                    product_id: p.id,
                    category_id: p.category_id,
                    brand_id: p.brand_id,
                    vendor_id: p.vendor_id,
                    tag_ids: p.product_tags?.map((pt: any) => pt.tag_id) || []
                  }, promotions);
                  
                  return (
                    <ProductGridCard 
                      key={p.id} 
                      product={p} 
                      onAddToCart={handleAddToCart} 
                      formatPrice={formatCurrencyPrice} 
                      applicablePromos={applicablePromos} 
                    />
                  );
                })}
              </div>

              {/* MOBILE GRID (Accumulated Cargar Más view) */}
              <div className="grid lg:hidden grid-cols-2 gap-3 sm:gap-6">
                {(accumulatedProducts.length > 0 ? accumulatedProducts : products).map(p => {
                  const applicablePromos = getApplicablePromotions({
                    product_id: p.id,
                    category_id: p.category_id,
                    brand_id: p.brand_id,
                    vendor_id: p.vendor_id,
                    tag_ids: p.product_tags?.map((pt: any) => pt.tag_id) || []
                  }, promotions);
                  
                  return (
                    <ProductGridCard 
                      key={`mob-${p.id}`} 
                      product={p} 
                      onAddToCart={handleAddToCart} 
                      formatPrice={formatCurrencyPrice} 
                      applicablePromos={applicablePromos} 
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* MOBILE "CARGAR MÁS" BUTTON (< 768px / < lg) */}
          <div className="lg:hidden mt-12 flex flex-col items-center">
            {page + 1 < totalPages ? (
              <button
                onClick={() => {
                  trackClarityEvent('load_more');
                  setPage(prev => prev + 1);
                }}
                disabled={loading}
                className="btn-primary w-full max-w-xs py-3.5 rounded-full text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-[#f00856]/20 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Cargando productos...</span>
                  </>
                ) : (
                  <span>CARGAR MÁS PRODUCTOS</span>
                )}
              </button>
            ) : count > 0 ? (
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider text-center">
                Has visto todos los {count} productos
              </p>
            ) : null}
          </div>

          {/* DESKTOP NUMERIC PAGINATION (>= lg) */}
          {totalPages > 1 && (
            <div className="hidden lg:flex mt-16 items-center justify-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="w-12 h-12 glass rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-colors disabled:opacity-30"
              >
                 <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                 {getVisiblePages(page, totalPages).map((p, i) => (
                   p === '...' ? (
                     <span key={`ellipsis-${i}`} className="w-10 text-center text-slate-500 font-bold tracking-widest">...</span>
                   ) : (
                     <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-12 h-12 rounded-full font-black transition-all ${page === p ? 'bg-[#f00856] text-white shadow-lg shadow-[#f00856]/30' : 'glass border border-white/5 text-slate-400 hover:text-white hover:border-white/20'}`}
                     >
                      {(p as number) + 1}
                     </button>
                   )
                 ))}
              </div>
              <button
                disabled={page === totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="w-12 h-12 glass rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-colors disabled:opacity-30"
              >
                 <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </section>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
    </div>
  );
}

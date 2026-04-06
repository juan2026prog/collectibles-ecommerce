import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { ChevronRight, SlidersHorizontal, X, Heart, ShoppingCart, LayoutGrid, List, Search } from 'lucide-react';
import { useProducts, useCategories, useBrands } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useLocale } from '../contexts/LocaleContext';
import { ProductSkeleton } from '../components/Skeletons';
import { ProductBadge } from '../components/ProductBadge';

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categorySlug = searchParams.get('category') || '';
  const brandSlug = searchParams.get('brand') || '';
  const badge = searchParams.get('badge') || '';
  const searchQ = searchParams.get('q') || '';
  const [sortBy, setSortBy] = useState('default');
  const [viewMode, setViewMode] = useState<'grid-2' | 'grid-3' | 'grid-4' | 'grid-5' | 'list'>('grid-4');
  const [mobileFilters, setMobileFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [searchInput, setSearchInput] = useState(searchQ);
  const limit = 12;

  const { categories, loading: catsLoading } = useCategories();
  const { brands, loading: brandsLoading } = useBrands();
  const cart = useCartContext();
  const { formatPrice, t } = useLocale();

  // ✅ Fully server-side — useProducts now resolves slug → id internally
  const { products, count, loading } = useProducts({
    category: categorySlug || undefined,
    brand: brandSlug || undefined,
    badge: badge || undefined,
    search: searchQ || undefined,
    minPrice: priceMin ? Number(priceMin) : undefined,
    maxPrice: priceMax ? Number(priceMax) : undefined,
    sortBy,
    limit,
    offset: page * limit,
  });

  const totalPages = Math.ceil(count / limit);

  function getProductImage(product: any): string {
  const img = product.images?.[0];
  if (!img?.url) return 'https://via.placeholder.com/400';
  if (img.url.match(/^[a-f0-9-]{36}$/)) return 'https://via.placeholder.com/400';
  return img.url;
}

function handleAddToCart(p: any) {
  const variant = p.variants?.[0];
  if (!variant) return;
  cart.addItem({ product_id: p.id, variant_id: variant.id, quantity: 1, title: p.title, price: p.base_price + (variant.price_adjustment || 0), image: getProductImage(p), variant_name: variant.name });
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

  const Sidebar = () => (
    <div className="space-y-6">
      {/* Search */}
      <form onSubmit={handleSearch}>
        <label className="font-bold text-gray-900 uppercase text-xs tracking-widest mb-2 block">{t('shop.search')}</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={t('shop.search')}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-400 placeholder:text-gray-400"
          />
        </div>
      </form>

      {/* Categories */}
      <div>
        <h3 className="font-bold text-gray-900 uppercase text-xs tracking-widest mb-3">{t('shop.filters')} — {t('nav.categories')}</h3>
        <ul className="space-y-1">
          <li>
            <button onClick={() => setFilter('category', '')} className={`text-sm w-full text-left py-1.5 px-2 rounded-lg transition-colors ${!categorySlug ? 'font-bold text-primary-600 bg-primary-50' : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'}`}>
              {t('shop.allProducts') || 'Todos los productos'}
            </button>
          </li>
          {catsLoading ? [...Array(5)].map((_, i) => <li key={i} className="h-7 bg-white/5 rounded animate-pulse mb-1" />) :
            categories.map(c => (
              <li key={c.id}>
                <button onClick={() => setFilter('category', c.slug)} className={`text-sm w-full text-left py-1.5 px-2 rounded-lg transition-colors ${categorySlug === c.slug ? 'font-bold text-primary-600 bg-primary-50' : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'}`}>
                  {c.name}
                </button>
              </li>
            ))}
        </ul>
      </div>

      {/* Brands */}
      <div>
        <h3 className="font-bold text-gray-900 uppercase text-xs tracking-widest mb-3">{t('nav.brands')}</h3>
        <ul className="space-y-1">
          <li>
            <button onClick={() => setFilter('brand', '')} className={`text-sm w-full text-left py-1.5 px-2 rounded-lg transition-colors ${!brandSlug ? 'font-bold text-primary-600 bg-primary-50' : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'}`}>
              {t('shop.allBrands') || 'Todas las marcas'}
            </button>
          </li>
          {brandsLoading ? [...Array(4)].map((_, i) => <li key={i} className="h-7 bg-white/5 rounded animate-pulse mb-1" />) :
            brands.map(b => (
              <li key={b.id}>
                <button onClick={() => setFilter('brand', b.slug)} className={`text-sm w-full text-left py-1.5 px-2 rounded-lg transition-colors ${brandSlug === b.slug ? 'font-bold text-primary-600 bg-primary-50' : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'}`}>
                  {b.name}
                </button>
              </li>
            ))}
        </ul>
      </div>

      {/* Price Range */}
      <div>
        <h3 className="font-bold text-gray-900 uppercase text-xs tracking-widest mb-3">{t('shop.priceRange') || 'Precio'}</h3>
        <div className="flex gap-2">
          <input type="number" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)}
            className="w-1/2 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-400 placeholder:text-gray-400" />
          <input type="number" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)}
            className="w-1/2 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-400 placeholder:text-gray-400" />
        </div>
        <button onClick={() => setPage(0)} className="mt-2 w-full py-2 text-xs font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors">
          {t('shop.applyFilters') || 'Aplicar'}
        </button>
      </div>

      {/* Clear filters */}
      {(categorySlug || brandSlug || searchQ || priceMin || priceMax) && (
        <button onClick={() => { setSearchParams({}); setPriceMin(''); setPriceMax(''); setSearchInput(''); setPage(0); }}
          className="w-full py-2 text-xs font-bold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
          {t('shop.clearFilters') || 'Limpiar filtros'}
        </button>
      )}
    </div>
  );

  const currentCategory = categories.find(c => c.slug === categorySlug);
  const currentBrand = brands.find(b => b.slug === brandSlug);
  const pageTitle = currentCategory?.name || currentBrand?.name || (searchQ ? `"${searchQ}"` : t('shop.title'));

  return (
    <div className="bg-white min-h-screen pb-20">
      {/* ═══ SHOP HERO BANNER ═══ */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 relative overflow-hidden py-16 mb-10 border-b border-gray-100">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-100/40 rounded-full blur-[100px] -mt-20 -mr-20" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <nav className="flex items-center text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">
              <Link to="/" className="hover:text-gray-900 transition-colors">{t('nav.home')}</Link>
              <ChevronRight className="w-4 h-4 mx-2" />
              <span className="text-primary-600">{pageTitle}</span>
            </nav>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">{pageTitle}</h1>
            <p className="text-gray-500 font-medium mt-3 max-w-xl">
              {t('shop.subtitle') || 'Descubre piezas exclusivas, figuras de edición limitada y los mejores artículos para tu colección.'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-8">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 sticky top-24 shadow-sm">
            <Sidebar />
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-8 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <p className="text-sm text-gray-500 font-medium hidden sm:block">
              <span className="font-black text-gray-900">{count}</span> {t('shop.results')}
            </p>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button onClick={() => setMobileFilters(true)} className="lg:hidden flex-1 sm:flex-none p-3 border border-gray-200 rounded-xl hover:bg-gray-50 flex justify-center items-center gap-2 font-bold text-sm text-gray-600">
                <SlidersHorizontal className="w-4 h-4" /> {t('shop.filters')}
              </button>
              
              {/* Grid Switcher Icons */}
              <div className="hidden sm:flex items-center gap-1 border border-gray-200 rounded-xl bg-gray-50 p-1">
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-primary-600 shadow-sm text-white' : 'text-gray-400 hover:text-gray-700'}`} title="Lista">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                </button>
                <button onClick={() => setViewMode('grid-2')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid-2' ? 'bg-primary-600 shadow-sm text-white' : 'text-gray-400 hover:text-gray-700'}`} title="2 Columnas">
                   <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
                </button>
                <button onClick={() => setViewMode('grid-3')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid-3' ? 'bg-primary-600 shadow-sm text-white' : 'text-gray-400 hover:text-gray-700'}`} title="3 Columnas">
                   <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="5" height="18" rx="1"/><rect x="9.5" y="3" width="5" height="18" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/></svg>
                </button>
                <button onClick={() => setViewMode('grid-4')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid-4' ? 'bg-primary-600 shadow-sm text-white' : 'text-gray-400 hover:text-gray-700'}`} title="4 Columnas">
                   <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="4" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="20" cy="12" r="2.5"/><path d="M4 12c-0.5 0-1 0.5-1 1s0.5 1 1 1 1-0.5 1-1-0.5-1-1-1z" opacity="0"/></svg>
                   <div className="flex gap-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-current" /><div className="w-1.5 h-1.5 rounded-full bg-current" />
                      <div className="w-1.5 h-1.5 rounded-full bg-current" /><div className="w-1.5 h-1.5 rounded-full bg-current" />
                   </div>
                </button>
                <button onClick={() => setViewMode('grid-5')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid-5' ? 'bg-primary-600 shadow-sm text-white' : 'text-gray-400 hover:text-gray-700'}`} title="5 Columnas">
                   <div className="flex gap-0.5 flex-wrap w-4 justify-center">
                      {[...Array(6)].map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-current" />)}
                   </div>
                </button>
              </div>

              <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(0); }}
                className="flex-1 sm:flex-none border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none cursor-pointer">
                <option value="default">{t('shop.sort.recommended') || 'Recomendados'}</option>
                <option value="newest">{t('shop.sort.newest') || 'Más Nuevos'}</option>
                <option value="price-low">{t('shop.sort.priceLow') || 'Menor Precio'}</option>
                <option value="price-high">{t('shop.sort.priceHigh') || 'Mayor Precio'}</option>
                <option value="name">{t('shop.sort.name') || 'A-Z'}</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className={`grid gap-6 ${viewMode === 'list' ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'}`}>
              {[...Array(8)].map((_, i) => (
                <ProductSkeleton key={i} viewMode={viewMode} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bg-gray-50 rounded-3xl border border-gray-200 p-20 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <LayoutGrid className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">{t('shop.empty')}</h3>
              <p className="text-gray-500 font-medium max-w-md mx-auto mb-8">
                {t('shop.emptyHint') || 'Intenta ajustar los filtros de búsqueda o cambiar de categoría.'}
              </p>
              <button onClick={() => { setSearchParams({}); setPriceMin(''); setPriceMax(''); setSearchInput(''); setPage(0); }}
                className="px-8 py-4 bg-primary-600 text-white font-black rounded-xl hover:bg-primary-500 transition-colors shadow-lg shadow-primary-600/30">
                {t('shop.clearFilters') || 'Limpiar Filtros'}
              </button>
            </div>
          ) : (
            <div className={`grid gap-6 ${
               viewMode === 'list' ? 'grid-cols-1' :
               viewMode === 'grid-2' ? 'grid-cols-2' :
               viewMode === 'grid-3' ? 'grid-cols-2 md:grid-cols-3' :
               viewMode === 'grid-4' ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' :
               'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            }`}>
              {products.map(p => (
                <div key={p.id} className={`group bg-white border border-gray-200 overflow-hidden hover:border-primary-300 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex ${viewMode === 'list' ? 'flex-row rounded-2xl h-48' : 'flex-col rounded-3xl h-full'}`}>
                  <div className={`relative overflow-hidden bg-gray-50 ${viewMode === 'list' ? 'w-48 shrink-0' : 'aspect-square'}`}>
                    <Link to={`/p/${p.slug}`}>
                      <img src={getProductImage(p)} alt={p.title} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out" />
                    </Link>
                    <ProductBadge 
                      badgeId={p.badge} 
                      compareAtPrice={p.compare_at_price} 
                      basePrice={p.base_price} 
                      className="absolute top-4 left-4 text-[10px] uppercase tracking-wider" 
                    />
                    <div className={`absolute top-4 right-4 flex gap-2 transition-all duration-300 ${viewMode.startsWith('grid') ? 'flex-col translate-x-12 opacity-0 group-hover:translate-x-0 group-hover:opacity-100' : 'flex-row'}`}>
                      <button className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-primary-600 hover:text-white transition-colors border border-gray-200 text-gray-500"><Heart className="w-4 h-4" /></button>
                      <button onClick={() => handleAddToCart(p)} className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-primary-600 hover:text-white transition-colors border border-gray-200 text-gray-500"><ShoppingCart className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className={`${viewMode === 'grid-5' ? 'p-3' : 'p-5'} flex flex-col flex-1 justify-between`}>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5">{p.category?.name || p.brand?.name || ''}</p>
                      <Link to={`/p/${p.slug}`} className={`${viewMode === 'grid-5' ? 'text-xs' : 'text-sm'} font-bold text-gray-900 hover:text-primary-600 line-clamp-2 leading-snug transition-colors`}>{p.title}</Link>
                      {viewMode === 'list' && <p className="mt-2 text-sm text-gray-500 line-clamp-2">{p.description}</p>}
                    </div>
                    <div className={`flex items-center gap-3 ${viewMode === 'grid-5' ? 'mt-2' : 'mt-4'}`}>
                      <span className={`${viewMode === 'grid-5' ? 'text-sm' : 'text-lg'} font-black text-gray-900`}>{formatPrice(p.base_price)}</span>
                      {p.compare_at_price && <span className="text-[10px] font-bold text-gray-400 line-through">{formatPrice(p.compare_at_price)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-12 bg-white p-4 rounded-2xl border border-gray-200 max-w-fit mx-auto shadow-sm">
              {[...Array(totalPages)].map((_, i) => (
                <button key={i} onClick={() => { setPage(i); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                  className={`w-12 h-12 rounded-xl text-sm font-black transition-all ${i === page ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30 hover:bg-primary-500' : 'bg-transparent text-gray-500 hover:bg-gray-100'}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      {mobileFilters && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileFilters(false)} />
          <div className="fixed inset-y-0 left-0 w-72 bg-white z-50 p-6 overflow-y-auto lg:hidden animate-slide-in-left border-r border-gray-200 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-lg text-gray-900">{t('shop.filters')}</h2>
              <button onClick={() => setMobileFilters(false)}><X className="w-5 h-5" /></button>
            </div>
            <Sidebar />
          </div>
        </>
      )}
    </div>
  );
}

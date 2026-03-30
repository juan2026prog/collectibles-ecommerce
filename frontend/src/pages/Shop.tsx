import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { ChevronRight, SlidersHorizontal, X, Heart, ShoppingCart, LayoutGrid, List, Search } from 'lucide-react';
import { useProducts, useCategories, useBrands } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useLocale } from '../contexts/LocaleContext';
import { ProductSkeleton } from '../components/Skeletons';

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categorySlug = searchParams.get('category') || '';
  const brandSlug = searchParams.get('brand') || '';
  const badge = searchParams.get('badge') || '';
  const searchQ = searchParams.get('q') || '';
  const [sortBy, setSortBy] = useState('default');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
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

  function handleAddToCart(p: any) {
    const variant = p.variants?.[0];
    if (!variant) return;
    cart.addItem({ product_id: p.id, variant_id: variant.id, quantity: 1, title: p.title, price: p.base_price + (variant.price_adjustment || 0), image: p.images?.[0]?.url || '', variant_name: variant.name });
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
        <label className="font-bold text-dark-900 uppercase text-xs tracking-widest mb-2 block">{t('shop.search')}</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={t('shop.search')}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>
      </form>

      {/* Categories */}
      <div>
        <h3 className="font-bold text-dark-900 uppercase text-xs tracking-widest mb-3">{t('shop.filters')} — {t('nav.categories')}</h3>
        <ul className="space-y-1">
          <li>
            <button onClick={() => setFilter('category', '')} className={`text-sm w-full text-left py-1.5 px-2 rounded-lg transition-colors ${!categorySlug ? 'font-bold text-primary-600 bg-primary-50' : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'}`}>
              {t('shop.allProducts') || 'Todos los productos'}
            </button>
          </li>
          {catsLoading ? [...Array(5)].map((_, i) => <li key={i} className="h-7 bg-gray-100 rounded animate-pulse mb-1" />) :
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
        <h3 className="font-bold text-dark-900 uppercase text-xs tracking-widest mb-3">{t('nav.brands')}</h3>
        <ul className="space-y-1">
          <li>
            <button onClick={() => setFilter('brand', '')} className={`text-sm w-full text-left py-1.5 px-2 rounded-lg transition-colors ${!brandSlug ? 'font-bold text-primary-600 bg-primary-50' : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'}`}>
              {t('shop.allBrands') || 'Todas las marcas'}
            </button>
          </li>
          {brandsLoading ? [...Array(4)].map((_, i) => <li key={i} className="h-7 bg-gray-100 rounded animate-pulse mb-1" />) :
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
        <h3 className="font-bold text-dark-900 uppercase text-xs tracking-widest mb-3">{t('shop.priceRange') || 'Precio'}</h3>
        <div className="flex gap-2">
          <input type="number" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)}
            className="w-1/2 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <input type="number" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)}
            className="w-1/2 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
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
    <div className="bg-gray-50 min-h-screen pb-20">
      {/* ═══ PREMIUM HERO BANNER ═══ */}
      <div className="bg-dark-900 relative overflow-hidden py-16 mb-10">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-900/40 via-purple-900/20 to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-600/20 rounded-full blur-[100px] -mt-20 -mr-20" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <nav className="flex items-center text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">
              <Link to="/" className="hover:text-white transition-colors">{t('nav.home')}</Link>
              <ChevronRight className="w-4 h-4 mx-2" />
              <span className="text-primary-400">{pageTitle}</span>
            </nav>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-lg">{pageTitle}</h1>
            <p className="text-gray-400 font-medium mt-3 max-w-xl">
              {t('shop.subtitle') || 'Descubre piezas exclusivas, figuras de edición limitada y los mejores artículos para tu colección.'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-8">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sticky top-24">
            <Sidebar />
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-8 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-gray-500 font-medium hidden sm:block">
              <span className="font-black text-dark-900">{count}</span> {t('shop.results')}
            </p>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button onClick={() => setMobileFilters(true)} className="lg:hidden flex-1 sm:flex-none p-3 border border-gray-200 rounded-xl hover:bg-gray-50 flex justify-center items-center gap-2 font-bold text-sm text-gray-700">
                <SlidersHorizontal className="w-4 h-4" /> {t('shop.filters')}
              </button>
              <div className="hidden sm:flex border border-gray-200 rounded-xl overflow-hidden bg-gray-50 p-1">
                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}><List className="w-4 h-4" /></button>
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
            <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
              {[...Array(8)].map((_, i) => (
                <ProductSkeleton key={i} viewMode={viewMode} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-20 text-center shadow-sm">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <LayoutGrid className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">{t('shop.empty')}</h3>
              <p className="text-gray-500 font-medium max-w-md mx-auto mb-8">
                {t('shop.emptyHint') || 'Intenta ajustar los filtros de búsqueda o cambiar de categoría.'}
              </p>
              <button onClick={() => { setSearchParams({}); setPriceMin(''); setPriceMax(''); setSearchInput(''); setPage(0); }}
                className="px-8 py-4 bg-dark-900 text-white font-black rounded-xl hover:bg-dark-800 transition-colors shadow-lg">
                {t('shop.clearFilters') || 'Limpiar Filtros'}
              </button>
            </div>
          ) : (
            <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
              {products.map(p => (
                <div key={p.id} className={`group bg-white border border-gray-100 overflow-hidden hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] transition-all duration-300 transform hover:-translate-y-1 flex ${viewMode === 'list' ? 'flex-row rounded-2xl h-48' : 'flex-col rounded-3xl h-full'}`}>
                  <div className={`relative overflow-hidden bg-gray-50/50 ${viewMode === 'list' ? 'w-48 shrink-0' : 'aspect-square'}`}>
                    <Link to={`/p/${p.slug}`}>
                      <img src={p.images?.[0]?.url || 'https://via.placeholder.com/400'} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
                    </Link>
                    {p.badge && (
                      <span className={`absolute top-4 left-4 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-full shadow-sm backdrop-blur-md ${
                        p.badge === 'hot' ? 'bg-rose-500/90 text-white' : 
                        p.badge === 'new' ? 'bg-emerald-500/90 text-white' : 
                        'bg-amber-400/90 text-amber-950'
                      }`}>
                        {p.badge === 'sale' && p.compare_at_price ? `${Math.round((1 - p.base_price / p.compare_at_price) * 100)}% OFF` : p.badge}
                      </span>
                    )}
                    <div className={`absolute top-4 right-4 flex gap-2 transition-all duration-300 ${viewMode === 'grid' ? 'flex-col translate-x-12 opacity-0 group-hover:translate-x-0 group-hover:opacity-100' : 'flex-row'}`}>
                      <button className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-colors text-gray-600"><Heart className="w-4 h-4" /></button>
                      <button onClick={() => handleAddToCart(p)} className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-primary-50 hover:text-primary-600 transition-colors text-gray-600"><ShoppingCart className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col flex-1 justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5">{p.category?.name || p.brand?.name || ''}</p>
                      <Link to={`/p/${p.slug}`} className="text-sm font-bold text-gray-900 hover:text-primary-600 line-clamp-2 leading-snug">{p.title}</Link>
                      {viewMode === 'list' && <p className="mt-2 text-sm text-gray-500 line-clamp-2">{p.description}</p>}
                    </div>
                    <div className="flex items-center gap-3 mt-4">
                      <span className="text-lg font-black text-gray-900">{formatPrice(p.base_price)}</span>
                      {p.compare_at_price && <span className="text-sm font-bold text-gray-300 line-through">{formatPrice(p.compare_at_price)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-12 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 max-w-fit mx-auto">
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
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileFilters(false)} />
          <div className="fixed inset-y-0 left-0 w-72 bg-white z-50 p-6 overflow-y-auto lg:hidden animate-slide-in-left">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-lg">{t('shop.filters')}</h2>
              <button onClick={() => setMobileFilters(false)}><X className="w-5 h-5" /></button>
            </div>
            <Sidebar />
          </div>
        </>
      )}
    </div>
  );
}

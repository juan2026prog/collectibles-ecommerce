import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, SlidersHorizontal, X, Search } from 'lucide-react';
import { useProducts, useCategories, useBrands, useFilterMappings } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useLocale } from '../contexts/LocaleContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { ProductSkeleton } from '../components/Skeletons';
import { ProductBadge } from '../components/ProductBadge';
import { ProductGridCard } from '../components/ProductGridCard';
import { getProductImage } from '../lib/imageUtils';
import { supabase } from '../lib/supabase';
import SEO from '../components/SEO';

function getVisiblePages(currentPage: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (currentPage < 4) return [0, 1, 2, 3, 4, '...', total - 1];
  if (currentPage > total - 5) return [0, '...', total - 5, total - 4, total - 3, total - 2, total - 1];
  return [0, '...', currentPage - 1, currentPage, currentPage + 1, '...', total - 1];
}

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categorySlug = searchParams.get('category') || '';
  const brandSlug = searchParams.get('brand') || '';
  const badge = searchParams.get('badge') || '';
  const searchQ = searchParams.get('q') || '';
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
  const limit = gridCols === 5 ? 15 : 12;

  const { categories, loading: catsLoading } = useCategories();
  const { brands, loading: brandsLoading } = useBrands();
  const mappings = useFilterMappings();

  const currentCategory = categories.find(c => c.slug === categorySlug);
  const currentBrand = brands.find(b => b.slug === brandSlug);

  const visibleCategories = currentBrand && mappings.length > 0
    ? categories.filter(c => mappings.some(m => m.category_id === c.id && m.brand_id === currentBrand.id) || c.id === currentCategory?.id)
    : categories;

  const visibleBrands = currentCategory && mappings.length > 0
    ? brands.filter(b => mappings.some(m => m.brand_id === b.id && m.category_id === currentCategory.id) || b.id === currentBrand?.id)
    : brands;
  const cart = useCartContext();
  const { t } = useLocale();
  const { formatCurrencyPrice } = useCurrency();
  const navigate = useNavigate();

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

  // getProductImage imported from lib/imageUtils

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

  function clearAllFilters() {
    setSearchParams({});
    setPriceMin('');
    setPriceMax('');
    setSearchInput('');
    setPage(0);
  }

  function applyPriceFilter() {
    setPage(0);
    // Price filter is already reactive via useProducts
  }

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Search */}
      <form onSubmit={handleSearch}>
        <label className="font-bold text-white uppercase text-xs tracking-widest mb-2 block">Buscar</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-primary-400 placeholder:text-slate-500 rounded-xl"
          />
        </div>
      </form>

      {/* Categories */}
      <div>
        <h3 className="font-bold text-white uppercase text-xs tracking-widest mb-3">Categoría</h3>
        <div className="grid gap-2">
          <button
            onClick={() => setFilter('category', '')}
            className={`soft rounded-xl p-3 text-left text-sm font-bold transition-all ${!categorySlug ? 'border-[#f00856] bg-[#f00856]/10 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Todos los productos
          </button>
          {catsLoading
            ? [...Array(5)].map((_, i) => <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />)
            : visibleCategories.map(c => (
              <button
                key={c.id}
                onClick={() => setFilter('category', c.slug)}
                className={`soft rounded-xl p-3 text-left text-sm font-bold transition-all ${categorySlug === c.slug ? 'border-[#f00856] bg-[#f00856]/10 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {c.name}
              </button>
            ))
          }
        </div>
      </div>

      {/* Brands */}
      <div>
        <h3 className="font-bold text-white uppercase text-xs tracking-widest mb-3">Marca</h3>
        <div className="grid gap-2">
          <button
            onClick={() => setFilter('brand', '')}
            className={`soft rounded-xl p-3 text-left text-sm font-bold transition-all ${!brandSlug ? 'border-[#f00856] bg-[#f00856]/10 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Todas las marcas
          </button>
          {brandsLoading
            ? [...Array(4)].map((_, i) => <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />)
            : visibleBrands.map(b => (
              <button
                key={b.id}
                onClick={() => setFilter('brand', b.slug)}
                className={`soft rounded-xl p-3 text-left text-sm font-bold transition-all ${brandSlug === b.slug ? 'border-[#f00856] bg-[#f00856]/10 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {b.name}
              </button>
            ))
          }
        </div>
      </div>

      {/* Price Range — functional inputs */}
      <div>
        <h3 className="font-bold text-white uppercase text-xs tracking-widest mb-3">Precio</h3>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Mín"
            value={priceMin}
            onChange={e => setPriceMin(e.target.value)}
            className="w-1/2 border border-white/10 px-3 py-2 text-sm bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-primary-400 placeholder:text-slate-500 rounded-xl"
          />
          <input
            type="number"
            placeholder="Máx"
            value={priceMax}
            onChange={e => setPriceMax(e.target.value)}
            className="w-1/2 border border-white/10 px-3 py-2 text-sm bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-primary-400 placeholder:text-slate-500 rounded-xl"
          />
        </div>
        <button
          onClick={applyPriceFilter}
          className="mt-2 w-full py-2 text-xs font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
        >
          Aplicar
        </button>
      </div>

      {/* Clear filters */}
      {(categorySlug || brandSlug || searchQ || priceMin || priceMax) && (
        <button
          onClick={clearAllFilters}
          className="w-full py-2 text-xs font-bold text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );

  const pageTitle = currentCategory?.name || currentBrand?.name || (searchQ ? `"${searchQ}"` : t('shop.title'));

  return (
    <div className="bg-[#05070f] text-white">
      <SEO
        title="Catálogo — Collectibles"
        description="Explora nuestro catálogo unificado de figuras, coleccionables y productos oficiales de las mejores marcas."
      />

      {/* EDITORIAL HERO SECTION */}
      <section className="relative hero-noise overflow-hidden border-b border-white/10">
        <div className="absolute -right-40 top-0 w-[560px] h-[560px] bg-[#f00856]/20 blur-3xl rounded-full"></div>
        <div className="relative max-w-7xl mx-auto px-6 py-10 md:py-14">
          <div className="label-tag">Catálogo unificado</div>
          <h1 className="text-5xl md:text-7xl font-black leading-[.9] mt-3 tracking-tighter">
            Productos de tienda <br className="hidden md:block" /> + sellers oficiales.
          </h1>
          <p className="text-slate-300 text-lg mt-5 max-w-3xl leading-relaxed">
            Un catálogo premium donde conviven stock propio, distribuidores oficiales y oportunidades curadas.
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
            className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-bold text-white focus:outline-none"
          >
            <option value="default">Recomendados</option>
            <option value="newest">Más nuevos</option>
            <option value="price-low">Menor precio</option>
            <option value="price-high">Mayor precio</option>
            <option value="name">A-Z</option>
          </select>
          <button
            onClick={() => setMobileFilters(true)}
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
                onClick={() => setMobileFilters(false)}
                className="btn-primary w-full rounded-full py-4 text-sm font-black uppercase"
              >
                Ver {count} resultados
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1500px] mx-auto px-6 py-10 grid lg:grid-cols-[240px_1fr] gap-10 overflow-hidden">
        {/* FILTERS ASIDE — hidden on mobile, shown on desktop */}
        <aside className="hidden lg:block glass rounded-[2rem] p-6 h-fit sticky top-24 z-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-black text-2xl tracking-tight">Filtros</h2>
            {(categorySlug || brandSlug || searchQ) && (
              <button onClick={() => navigate('/shop')} className="text-xs font-black text-[#f00856] uppercase hover:underline">Limpiar</button>
            )}
          </div>
          <FilterContent />
        </aside>

        {/* PRODUCTS GRID */}
        <section className="min-w-0">
          {/* Header: título + controles */}
          <div className="mb-8">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div className="label-tag">Marketplace integrado</div>
                <h2 className="text-3xl font-black mt-1 text-white tracking-tight">
                  {searchQ ? `Resultados para "${searchQ}"` : "Resultados destacados"}
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
            {/* Barra secundaria: count + sort */}
            <div className="hidden lg:flex items-center gap-3 mt-4">
              <span className="text-sm font-bold text-slate-500">{count} productos encontrados</span>
              <select
                value={sortBy}
                onChange={e => { setSortBy(e.target.value); setPage(0); }}
                className="glass rounded-full px-5 py-2 text-xs font-black uppercase tracking-widest text-white border border-white/10 hover:border-white/20 bg-transparent focus:outline-none"
              >
                <option value="default">Recomendados</option>
                <option value="newest">Más nuevos</option>
                <option value="price-low">Menor precio</option>
                <option value="price-high">Mayor precio</option>
                <option value="name">A-Z</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className={`grid gap-x-6 gap-y-12 grid-cols-2 ${
              gridCols === 3 ? 'md:grid-cols-3' :
              gridCols === 4 ? 'md:grid-cols-3 lg:grid-cols-4' :
              'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            }`}>
              {[...Array(gridCols * 2)].map((_, i) => <ProductSkeleton key={i} />)}
            </div>
          ) : products.length === 0 ? (
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
            <div className={`grid gap-x-6 gap-y-12 grid-cols-2 ${
              gridCols === 3 ? 'md:grid-cols-3' :
              gridCols === 4 ? 'md:grid-cols-3 lg:grid-cols-4' :
              'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            }`}>
              {products.map(p => (
                <ProductGridCard key={p.id} product={p} onAddToCart={handleAddToCart} formatPrice={formatCurrencyPrice} />
              ))}
            </div>
          )}

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="mt-16 flex items-center justify-center gap-2">
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

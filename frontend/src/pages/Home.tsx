import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Heart, ShoppingCart, Truck, Shield, RotateCcw, Headphones, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useProducts, useCategories, useBrands, useBanners, useProductGroups } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useLocale } from '../contexts/LocaleContext';
import { ProductSkeleton, CategoryGridSkeleton, BannerSkeleton, BrandCarouselSkeleton, CollectionCarouselSkeleton } from '../components/Skeletons';
import { ProductBadge } from '../components/ProductBadge';

export default function Home() {
  const { banners, loading: bannersLoading } = useBanners();
  const { categories, loading: catsLoading } = useCategories();
  const { products: featured, loading: featuredLoading } = useProducts({ featured: true, limit: 10 });
  const { products: newArrivals, loading: newArrivalsLoading } = useProducts({ badge: 'new', limit: 8 });
  const { brands, loading: brandsLoading } = useBrands();
  const { groups, loading: groupsLoading } = useProductGroups();
  const cart = useCartContext();
  const { formatPrice, t } = useLocale();
  const [heroIdx, setHeroIdx] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setHeroIdx(i => (i + 1) % banners.length), 6000);
    return () => clearInterval(timer);
  }, [banners.length]);

  function getProductImage(product: any): string {
    const img = product.images?.[0];
    if (!img?.url) return 'https://via.placeholder.com/400';
    if (img.url.match(/^[a-f0-9-]{36}$/)) return 'https://via.placeholder.com/400';
    return img.url;
  }

  function handleAddToCart(p: any) {
    const variant = p.variants?.[0];
    if (!variant) return;
    cart.addItem({
      product_id: p.id,
      variant_id: variant.id,
      quantity: 1,
      title: p.title,
      price: p.base_price + (variant.price_adjustment || 0),
      image: getProductImage(p),
      variant_name: variant.name
    });
  }

  const ProductCard = ({ p }: { p: any }) => (
    <div className="group bg-surface-card rounded-2xl border border-white/5 overflow-hidden hover:border-primary-500/30 hover:shadow-glow-card transition-all duration-400 transform hover:-translate-y-1 flex flex-col h-full shrink-0 w-[240px] sm:w-[280px]">
      <div className="relative overflow-hidden aspect-square bg-dark-600">
        <Link to={`/p/${p.slug}`}>
          <img src={getProductImage(p)} alt={p.title} className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-700 ease-out" />
        </Link>
        <ProductBadge
          badgeId={p.badge}
          compareAtPrice={p.compare_at_price}
          basePrice={p.base_price}
        />
        <div className="absolute top-3 right-3 flex flex-col gap-2 translate-x-12 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
          <button className="w-10 h-10 bg-dark-700/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors border border-white/10"><Heart className="w-4 h-4 text-gray-300 hover:text-white" /></button>
          <button onClick={() => handleAddToCart(p)} className="w-10 h-10 bg-dark-700/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors border border-white/10"><ShoppingCart className="w-4 h-4 text-gray-300 hover:text-white" /></button>
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1 justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">{p.category?.name || p.brand?.name || ''}</p>
          <Link to={`/p/${p.slug}`} className="text-sm font-bold text-gray-200 hover:text-neon-cyan line-clamp-2 leading-snug transition-colors">{p.title}</Link>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <span className="text-lg font-black text-white">{formatPrice(p.base_price)}</span>
          {p.compare_at_price && <span className="text-sm font-bold text-gray-600 line-through decoration-primary-500">{formatPrice(p.compare_at_price)}</span>}
        </div>
      </div>
    </div>
  );

  const [layoutBlocks, setLayoutBlocks] = useState<any[]>([
    { id: 'hero', visible: true },
    { id: 'bento', visible: true },
    { id: 'collections', visible: true },
    { id: 'trending', visible: true },
    { id: 'brands', visible: true }
  ]);

  useEffect(() => {
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('site_settings').select('value').eq('key', 'appearance_home_layout_json').single()
        .then(({ data }) => {
          if (data?.value) {
            try {
              const parsed = JSON.parse(data.value);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setLayoutBlocks(parsed);
              }
            } catch {}
          }
        });
    });
  }, []);

  const renderBlock = (blockId: string) => {
    switch (blockId) {
      case 'hero':
        return (
          <>
            {/* ═══ HERO SLIDER (GAMGER DARK) ═══ */}
            <section className="relative h-[85vh] min-h-[600px] max-h-[900px] overflow-hidden bg-dark-900 flex group/hero">
              {bannersLoading ? (
                <BannerSkeleton />
              ) : (
                <>
                  {banners.map((b, i) => (
                    <div key={b.id} className={`absolute inset-0 transition-all duration-1000 ease-out origin-center ${i === heroIdx ? 'opacity-100 scale-100 z-10' : 'opacity-0 scale-105 z-0'}`}>
                      <div className="absolute inset-0 bg-gradient-to-r from-dark-900 via-dark-900/60 to-transparent z-10" />
                      <div className="absolute inset-0 bg-gradient-to-t from-dark-900/80 via-transparent to-transparent z-10" />
                      {/* Grid overlay */}
                      <div className="absolute inset-0 z-10 opacity-10 gamger-grid" />
                      <img src={b.image_url} alt={b.title} className="absolute inset-0 w-full h-full object-cover opacity-70 object-center" />
                      
                      <div className="relative z-20 max-w-7xl mx-auto px-6 h-full flex flex-col justify-center items-start">
                        <div className="max-w-2xl transform transition-all duration-1000 delay-300 translate-y-0 opacity-100">
                          <span className="inline-block px-4 py-1.5 rounded-full bg-primary-600/20 backdrop-blur-md text-xs font-black uppercase tracking-widest text-primary-400 mb-6 border border-primary-500/30">
                            <Zap className="w-3.5 h-3.5 inline mr-2" />
                            {t('hero.badge') || 'Exclusive Collection'}
                          </span>
                          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white leading-[1.05] tracking-tight mb-6 drop-shadow-2xl">
                            {b.title}
                          </h1>
                          <p className="text-lg md:text-xl text-gray-400 font-medium max-w-lg leading-relaxed mb-8 drop-shadow-md">
                            {b.subtitle}
                          </p>
                          <Link to={b.link_url || '/shop'} className="group/btn relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-primary-600 px-8 py-4 font-black text-white shadow-xl shadow-primary-600/30 transition-all hover:scale-105 hover:shadow-primary-500/50 uppercase tracking-wider">
                            <span className="relative z-10 flex items-center gap-2">
                              {b.button_text || t('hero.cta')} <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}

                  {banners.length > 1 && (
                    <>
                      <button onClick={() => setHeroIdx(i => (i - 1 + banners.length) % banners.length)} className="absolute left-6 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full flex items-center justify-center backdrop-blur-md transition-all opacity-0 group-hover/hero:opacity-100 -translate-x-4 group-hover/hero:translate-x-0"><ChevronLeft className="w-6 h-6 text-white" /></button>
                      <button onClick={() => setHeroIdx(i => (i + 1) % banners.length)} className="absolute right-6 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full flex items-center justify-center backdrop-blur-md transition-all opacity-0 group-hover/hero:opacity-100 translate-x-4 group-hover/hero:translate-x-0"><ChevronRight className="w-6 h-6 text-white" /></button>
                      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex gap-3">
                        {banners.map((_, i) => (<button key={i} onClick={() => setHeroIdx(i)} className={`relative flex h-2 transition-all duration-500 rounded-full overflow-hidden ${i === heroIdx ? 'w-12 bg-white/20' : 'w-2 bg-white/30 hover:bg-white/50'}`}>
                          {i === heroIdx && <div className="absolute inset-y-0 left-0 bg-primary-500 w-full animate-[progress_6s_linear]" />}
                        </button>))}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>

            {/* ═══ TRUST BAR (DARK GLASSMORPHISM) ═══ */}
            <section className="relative z-20 -mt-10 max-w-7xl mx-auto px-4 sm:px-6">
              <div className="bg-surface-card/80 backdrop-blur-xl border border-white/5 shadow-dark-lg rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-4 p-6 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-primary-900/10 via-transparent to-neon-cyan/5 opacity-50 pointer-events-none rounded-2xl" />
                {[
                  { icon: Truck, text: t('footer.freeShipping'), sub: t('footer.freeShipping.sub') || 'Desde $4000' },
                  { icon: Shield, text: t('footer.securePayment'), sub: t('footer.securePayment.sub') || 'Encriptación SSL' },
                  { icon: RotateCcw, text: t('footer.returns'), sub: t('footer.returns.sub') || '14 días de plazo' },
                  { icon: Headphones, text: t('footer.support'), sub: t('footer.support.sub') || 'Asistencia Local' },
                ].map((t, i) => (
                  <div key={i} className="flex flex-col items-center justify-center text-center p-2 group">
                    <div className="w-12 h-12 bg-white/5 text-primary-400 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-primary-600 group-hover:text-white transition-all duration-300 border border-white/5">
                      <t.icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-black text-white uppercase tracking-wide">{t.text}</span>
                    <span className="text-xs text-gray-500 font-medium mt-0.5">{t.sub}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        );
      case 'bento':
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                  {t('home.categories') || 'Explorar Categorías'}
                </h2>
                <p className="text-gray-500 font-medium mt-2">
                  {t('home.categories.sub') || 'Encuentra exactamente lo que buscas para tu colección.'}
                </p>
              </div>
            </div>
            
            {catsLoading ? (
              <CategoryGridSkeleton />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]">
                 {categories[0] && (
                   <Link to={`/shop?category=${categories[0].slug}`} className="group relative rounded-3xl overflow-hidden bg-dark-900 md:col-span-2 h-[300px] md:h-full border border-white/5 hover:border-primary-500/30 transition-all">
                     {categories[0].image_url && <img src={categories[0].image_url} alt={categories[0].name} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 group-hover:scale-105 transition-all duration-700" />}
                     <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/40 to-transparent" />
                     <div className="absolute bottom-0 left-0 p-8">
                       <span className="px-3 py-1 bg-primary-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full mb-3 inline-block shadow-lg shadow-primary-600/30">{t('home.mostPopular') || 'Más Popular'}</span>
                       <h3 className="text-4xl font-black text-white drop-shadow-lg mb-2">{categories[0].name}</h3>
                       <p className="text-gray-400 flex items-center gap-2 font-medium">
                         {t('home.viewCollection') || 'Ver colección'} <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                       </p>
                     </div>
                   </Link>
                 )}
                 <div className="flex flex-col gap-6 h-[300px] md:h-full">
                   {categories.slice(1, 3).map(c => (
                     <Link key={c.id} to={`/shop?category=${c.slug}`} className="group relative rounded-3xl overflow-hidden bg-dark-900 flex-1 border border-white/5 hover:border-primary-500/30 transition-all">
                       {c.image_url && <img src={c.image_url} alt={c.name} className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 group-hover:scale-105 transition-all duration-700" />}
                       <div className="absolute inset-0 bg-gradient-to-t from-dark-900 to-transparent" />
                       <div className="absolute bottom-0 left-0 p-6">
                         <h3 className="text-2xl font-black text-white drop-shadow-md">{c.name}</h3>
                       </div>
                     </Link>
                   ))}
                 </div>
              </div>
            )}
          </section>
        );
      case 'collections':
        if (groupsLoading) {
          return (
            <section className="py-20 border-y border-white/5">
              <div className="max-w-7xl mx-auto px-6">
                <div className="h-10 w-64 bg-white/5 rounded animate-pulse mb-10" />
                <CollectionCarouselSkeleton />
              </div>
            </section>
          );
        }
        if (groups.length === 0) return null;
        return (
          <>
            {groups.map((g, i) => g.product_group_items && g.product_group_items.length > 0 && (
              <section key={g.id} className={`py-20 ${i % 2 === 0 ? 'border-y border-white/5' : ''}`}>
                <div className="max-w-7xl mx-auto px-6">
                  <div className="flex items-center justify-between mb-10">
                    <div>
                      <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        {i === 0 && <TrendingUp className="w-8 h-8 text-primary-500 drop-shadow-sm" />}
                        {g.name}
                      </h2>
                      <p className="text-gray-500 font-medium mt-2">{g.description}</p>
                    </div>
                    <Link to={`/shop?group=${g.slug}`} className="hidden md:flex items-center gap-2 text-sm font-bold text-white hover:text-neon-cyan px-5 py-2.5 rounded-full border-2 border-white/20 hover:border-neon-cyan/50 transition-all">
                      {t('home.viewAll')} <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                  
                  <div className="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory scrollbar-hide -mx-6 px-6">
                    {(g.product_group_items || []).map(({ product }: any) => product && (
                      <div key={product.id} className="snap-start">
                        <ProductCard p={product} />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </>
        );
      case 'trending':
        return (
          <section className="py-20 border-y border-white/5">
             <div className="max-w-7xl mx-auto px-6">
                <div className="flex items-center justify-between mb-10">
                  <h2 className="text-3xl font-black text-white tracking-tight">{t('home.featured')}</h2>
                  <Link to="/shop" className="hidden md:flex items-center gap-2 text-sm font-bold text-white hover:text-neon-cyan px-5 py-2.5 rounded-full border-2 border-white/20 hover:border-neon-cyan/50 transition-all">
                    {t('home.viewAll')} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory scrollbar-hide -mx-6 px-6">
                  {featuredLoading ? (
                    [...Array(5)].map((_, i) => (
                      <div key={i} className="shrink-0 w-[240px] sm:w-[280px]">
                        <ProductSkeleton />
                      </div>
                    ))
                  ) : (
                    featured.map(p => (
                       <div key={p.id} className="snap-start"><ProductCard p={p} /></div>
                    ))
                  )}
                </div>
             </div>
          </section>
        );
      case 'brands':
        return (
          <>
            {brandsLoading ? (
              <section className="py-24 overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 mb-12 text-center relative z-10 flex flex-col items-center">
                  <div className="h-4 w-32 bg-white/5 rounded animate-pulse mb-4" />
                  <div className="h-10 w-64 bg-white/5 rounded animate-pulse" />
                </div>
                <BrandCarouselSkeleton />
              </section>
            ) : brands.length > 0 && (
              <section className="py-24 overflow-hidden relative">
                <div className="absolute inset-0 opacity-5 gamger-grid" />
                <div className="max-w-7xl mx-auto px-6 mb-12 text-center relative z-10">
                  <h2 className="text-sm font-black text-primary-500 mb-2 uppercase tracking-[0.2em]">Sponsors & Partners</h2>
                  <h3 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                    {t('home.brands') || 'Tus marcas de siempre'}
                  </h3>
                </div>
                <div className="relative w-full overflow-hidden z-10 flex border-y border-white/5 bg-surface-card/50 py-8">
                   <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-dark-700 to-transparent z-20" />
                   <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-dark-700 to-transparent z-20" />
                   <div className="flex animate-[slide_30s_linear_infinite] whitespace-nowrap min-w-max hover:[animation-play-state:paused] items-center">
                      {[...brands, ...brands, ...brands].map((b, i) => (
                         <Link key={`${b.id}-${i}`} to={`/shop?brand=${b.slug}`} className="mx-12 shrink-0 group transition-transform hover:scale-110">
                            {b.logo_url ? (
                               <img src={b.logo_url} alt={b.name} className="h-10 md:h-12 w-auto object-contain filter grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300" />
                            ) : (
                               <span className="text-xl md:text-2xl font-black text-gray-600 group-hover:text-primary-500 uppercase tracking-widest">{b.name}</span>
                            )}
                         </Link>
                      ))}
                   </div>
                </div>
              </section>
            )}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-dark-700">
      {layoutBlocks.filter((b: any) => b.visible !== false).map((b: any) => (
        <div key={b.id}>
          {renderBlock(b.id)}
        </div>
      ))}

      {/* ═══ VIP NEWSLETTER (GAMGER NEON STYLE) ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/30 via-dark-800 to-dark-900" />
        <div className="absolute inset-0 gamger-grid opacity-10" />
        {/* Neon glow accents */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-neon-cyan/5 rounded-full blur-[120px]" />
        
        <div className="max-w-7xl mx-auto px-6 py-24 relative z-10 flex flex-col md:flex-row items-center justify-between gap-12 text-center md:text-left">
          <div className="md:w-1/2">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Join the Elite Collector's Club</h2>
            <p className="text-lg text-gray-500 font-medium">Suscríbete para acceso anticipado a nuevas oleadas, drops limitados, y un 10% OFF en tu primera compra premium.</p>
          </div>
          <div className="md:w-1/2 w-full max-w-md bg-white/5 backdrop-blur-md p-8 rounded-3xl border border-white/10 shadow-dark-lg">
            <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); alert('Subscribed!'); }}>
              <input type="email" placeholder="Ingresa tu mejor email..." className="px-6 py-4 rounded-xl bg-dark-800/80 text-white border border-white/10 placeholder:text-gray-600 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none text-center font-medium transition-colors" required />
              <button type="submit" className="px-6 py-4 rounded-xl bg-primary-600 text-white font-black tracking-widest uppercase hover:bg-primary-500 hover:shadow-glow-red transition-all transform hover:-translate-y-1">Desbloquear Beneficios</button>
            </form>
            <p className="text-xs text-gray-600 mt-4 text-center">Unsubscribe at any time. We respect your privacy.</p>
          </div>
        </div>
      </section>

      {/* Custom CSS animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}

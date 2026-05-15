import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Heart, ShoppingCart, Truck, Shield, RotateCcw, Headphones, Sparkles, TrendingUp } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useProducts, useCategories, useBrands, useBanners, useProductGroups } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useLocale } from '../contexts/LocaleContext';
import { ProductSkeleton, CategoryGridSkeleton, BannerSkeleton, BrandCarouselSkeleton, CollectionCarouselSkeleton } from '../components/Skeletons';
import { ProductBadge } from '../components/ProductBadge';
import { getProductImage } from '../lib/imageUtils';

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
  const [layoutBlocks, setLayoutBlocks] = useState<any[]>([
    { id: 'hero', visible: true },
    { id: 'trust', visible: true },
    { id: 'bento', visible: true },
    { id: 'collections', visible: true },
    { id: 'trending', visible: true },
    { id: 'brands', visible: true }
  ]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setHeroIdx(i => (i + 1) % banners.length), 6000);
    return () => clearInterval(timer);
  }, [banners.length]);

  useEffect(() => {
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('site_settings').select('value').eq('key', 'appearance_home_layout_json').maybeSingle()
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

  // getProductImage imported from lib/imageUtils

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

  const ProductCard = ({ p }: { p: any }) => {
    const img = getProductImage(p);
    const finalPrice = p.base_price + (p.variants?.[0]?.price_adjustment || 0);
    return (
      <article className="glass rounded-[2rem] p-4 flex flex-col group transition-all hover:-translate-y-2 hover:shadow-2xl hover:shadow-black/60 hover:border-[#f00856]/40 w-[280px] shrink-0">
        <div className="relative aspect-square rounded-[1.5rem] overflow-hidden bg-black/30 grid place-items-center mb-5">
          <Link to={`/p/${p.slug}`} className="w-full h-full p-6 block">
            <img 
              src={img} 
              alt={p.title} 
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110" 
            />
          </Link>
          <div className="absolute top-4 left-4">
            <ProductBadge 
              badgeId={p.badge} 
              compareAtPrice={p.compare_at_price} 
              basePrice={p.base_price}
              className="text-[10px] px-3 py-1.5"
            />
          </div>
          <button 
            onClick={() => handleAddToCart(p)}
            className="absolute bottom-4 right-4 w-12 h-12 bg-[#f00856] text-white rounded-full flex items-center justify-center opacity-100 md:opacity-0 md:translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-lg shadow-[#f00856]/30"
          >
            <ShoppingCart className="w-5 h-5" />
          </button>
        </div>

        <div className="px-2 flex-1 flex flex-col">
          <div className="label-tag mb-1 opacity-60 text-[10px]">{p.brand?.name || p.category?.name || 'Producto'}</div>
          <Link to={`/p/${p.slug}`} className="font-black text-lg text-white group-hover:text-[#f00856] transition-colors leading-tight line-clamp-2 min-h-[2.5rem]">
            {p.title}
          </Link>

          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-black tracking-widest mb-0.5">Precio</div>
              <div className="text-xl font-black text-white">${formatPrice(finalPrice)}</div>
            </div>
            <Link 
              to={`/p/${p.slug}`}
              className="btn-primary px-5 py-2.5 text-[10px] rounded-full"
            >
              Ver más
            </Link>
          </div>
        </div>
      </article>
    );
  };

  const renderBlock = (blockId: string) => {
    switch (blockId) {
      case 'hero':
        return (
          <section className="relative hero-noise overflow-hidden min-h-[85vh] flex items-center pt-20">
            <div className="absolute -right-40 top-0 w-[800px] h-[800px] bg-[#f00856]/10 blur-[150px] rounded-full" />
            <div className="absolute -left-40 bottom-0 w-[600px] h-[600px] bg-blue-600/5 blur-[120px] rounded-full" />
            
            <div className="max-w-7xl mx-auto px-6 w-full relative z-10">
              <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-12 items-center">
                <div className="animate-fade-in-up">
                  <div className="label-tag">New Season 2026</div>
                  <h1 className="text-6xl md:text-8xl font-black leading-[0.9] mt-4 tracking-tighter text-white">
                    Figuras que <br /> <span className="text-[#f00856]">cuentan</span> historias.
                  </h1>
                  <p className="text-slate-400 text-xl mt-6 max-w-xl leading-relaxed font-medium">
                    Plataforma premium, marketplace curado y lanzamientos exclusivos para la comunidad collector más grande de la región.
                  </p>
                  <div className="flex flex-wrap gap-4 mt-10">
                    <Link to="/shop" className="btn-primary px-10 py-5 text-base rounded-full group">
                      Explorar catálogo <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    <Link to="/club-collector" className="btn-secondary px-10 py-5 text-base rounded-full">
                      Club Collector
                    </Link>
                  </div>
                  
                  <div className="mt-12 flex items-center gap-4">
                     <div className="text-sm font-bold text-slate-500">
                        Comunidad de collectors en crecimiento 🚀
                     </div>
                  </div>
                </div>

                <div className="hidden lg:block relative animate-float">
                  <div className="glass rounded-[3rem] p-8 relative overflow-hidden group">
                     <div className="absolute inset-0 bg-gradient-to-br from-[#f00856]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                     <div className="aspect-[4/5] rounded-[2.5rem] bg-black/40 overflow-hidden relative">
                        {featured[0] ? (
                          <img 
                            src={getProductImage(featured[0])} 
                            alt="Featured" 
                            className="w-full h-full object-contain p-12 transition-transform duration-700 group-hover:scale-110" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-8xl">🧸</div>
                        )}
                        <div className="absolute bottom-6 left-6 right-6 glass rounded-2xl p-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
                           <div className="text-xs font-black text-[#f00856] uppercase mb-1">Drop destacado</div>
                           <div className="text-white font-black text-xl truncate">{featured[0]?.title || 'Próximo lanzamiento'}</div>
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      case 'trust':
        return (
          <section className="max-w-7xl mx-auto px-6 -mt-12 relative z-20">
            <div className="glass rounded-[2.5rem] p-8 grid grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { icon: Truck, title: 'Envío Express', desc: 'En 24/48 horas' },
                { icon: Shield, title: 'Compra Segura', desc: 'Garantía oficial' },
                { icon: RotateCcw, title: 'Devoluciones', desc: '14 días de plazo' },
                { icon: Headphones, title: 'Soporte VIP', desc: 'Canal prioritario' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex flex-col items-center text-center group">
                  <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3 group-hover:bg-[#f00856] group-hover:text-white transition-all duration-300">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h4 className="text-white font-black text-sm uppercase tracking-wider">{title}</h4>
                  <p className="text-slate-500 text-xs font-bold mt-1 uppercase tracking-tighter">{desc}</p>
                </div>
              ))}
            </div>
          </section>
        );
      case 'bento':
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            <div className="flex items-center justify-between mb-12">
              <div>
                <div className="label-tag">Mundos coleccionables</div>
                <h2 className="text-4xl font-black text-white mt-2 tracking-tight">Explorá por categoría</h2>
              </div>
              <Link to="/shop" className="btn-secondary rounded-full px-6 py-3 text-xs font-black uppercase">Ver todas</Link>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[700px]">
              {categories.slice(0, 4).map((c, i) => (
                <Link 
                  key={c.id} 
                  to={`/shop?category=${c.slug}`}
                  className={`glass rounded-[2.5rem] p-8 group overflow-hidden relative flex flex-col justify-end transition-all hover:border-[#f00856]/40 hover:-translate-y-2 ${
                    i === 0 ? 'md:col-span-2 md:row-span-2' : ''
                  }`}
                >
                  {c.image_url && (
                    <img 
                      src={c.image_url} 
                      alt={c.name} 
                      className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-40 group-hover:scale-110 transition-all duration-700" 
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-transparent to-transparent opacity-80" />
                  <div className="relative z-10">
                    <h3 className={`${i === 0 ? 'text-4xl' : 'text-2xl'} font-black text-white mb-2`}>{c.name}</h3>
                    <p className="text-slate-400 font-bold text-sm flex items-center gap-2 group-hover:text-[#f00856] transition-colors">
                      Ver colección <ArrowRight className="w-4 h-4" />
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      case 'collections':
        return (
          <>
            {groups.map((g, i) => (
              <section key={g.id || `group-${i}`} className="py-16 border-t border-white/5 overflow-hidden">
                <div className="max-w-7xl mx-auto px-6">
                  <div className="flex items-center justify-between mb-10">
                    <div>
                      <div className="label-tag">Selección destacada</div>
                      <h2 className="text-4xl font-black text-white mt-2 tracking-tight">{g.name}</h2>
                    </div>
                  </div>
                  
                  <div className="flex gap-6 overflow-x-auto pb-10 no-scrollbar">
                    {(g.product_group_items || []).map(({ product }: any) => product && (
                      <ProductCard key={product.id} p={product} />
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </>
        );
      case 'trending':
        return (
          <section className="py-24 bg-white/5 border-y border-white/5 overflow-hidden">
             <div className="max-w-7xl mx-auto px-6">
                <div className="flex items-center justify-between mb-12">
                  <div>
                    <div className="label-tag">Lo más buscado</div>
                    <h2 className="text-4xl font-black text-white mt-2 tracking-tight">Trending Now</h2>
                  </div>
                </div>
                <div className="flex gap-6 overflow-x-auto pb-10 no-scrollbar">
                   {featured.map(p => (
                      <ProductCard key={p.id} p={p} />
                   ))}
                </div>
             </div>
          </section>
        );
      case 'brands':
        return (
          <section className="py-24 overflow-hidden relative">
            <div className="max-w-7xl mx-auto px-6 mb-16 text-center">
              <div className="label-tag mb-3">Distribuidores oficiales</div>
              <h2 className="text-4xl font-black text-white tracking-tight">Las mejores marcas del mundo</h2>
            </div>
            
            <div className="flex animate-marquee whitespace-nowrap gap-20 items-center opacity-40 hover:opacity-100 transition-opacity">
              {[...brands, ...brands].map((b, i) => (
                <Link key={`${b.id}-${i}`} to={`/shop?brand=${b.slug}`} className="shrink-0 grayscale hover:grayscale-0 transition-all duration-500">
                  {b.logo_url ? (
                    <img src={b.logo_url} alt={b.name} className="h-12 w-auto object-contain" />
                  ) : (
                    <span className="text-2xl font-black text-slate-500 uppercase tracking-widest">{b.name}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-[#05070f] text-white">
      {layoutBlocks.filter((b: any) => b.visible !== false).map((b: any) => (
        <div key={b.id}>
          {renderBlock(b.id)}
        </div>
      ))}

      {/* VIP NEWSLETTER */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="glass rounded-[3rem] p-12 md:p-20 relative overflow-hidden text-center flex flex-col items-center">
          <div className="absolute inset-0 bg-gradient-to-br from-[#f00856]/20 to-blue-600/10 opacity-30" />
          <div className="relative z-10 max-w-2xl">
            <div className="label-tag mb-4">Membresía exclusiva</div>
            <h2 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-6">Unite al Club Collector.</h2>
            <p className="text-slate-400 text-lg font-medium mb-10 leading-relaxed">
              Recibí notificaciones de drops exclusivos, preventas limitadas y acumulá puntos para canjear por envíos gratis y descuentos.
            </p>
            <form className="flex flex-col sm:flex-row gap-3 w-full" onSubmit={e => e.preventDefault()}>
              <input 
                type="email" 
                placeholder="Tu email de coleccionista..." 
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-8 py-5 text-white outline-none focus:border-[#f00856] transition-colors"
                disabled
              />
              <button className="btn-primary rounded-full px-10 py-5 font-black uppercase tracking-widest opacity-60 cursor-not-allowed" disabled>
                Próximamente
              </button>
            </form>
            <p className="text-xs text-slate-500 mt-6 font-bold uppercase tracking-widest">Suscripción al newsletter próximamente.</p>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out forwards;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}

import { Link } from 'react-router-dom';
import { ArrowRight, Truck, Shield, Package } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useProducts, useCategories, useBrands, useBanners, useProductGroups } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useLocale } from '../contexts/LocaleContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { ProductSkeleton } from '../components/Skeletons';
import { ProductGridCard } from '../components/ProductGridCard';
import { getProductImage } from '../lib/imageUtils';
import { useSiteSettings } from '../hooks/useSiteSettings';

export default function Home() {
  const { settings } = useSiteSettings();
  const { banners, loading: bannersLoading } = useBanners();
  const { categories, loading: catsLoading } = useCategories();
  const { products: featured, loading: featuredLoading } = useProducts({ featured: true, limit: 10 });
  const { products: newArrivals, loading: newArrivalsLoading } = useProducts({ badge: 'new', limit: 8 });
  const { brands, loading: brandsLoading } = useBrands();
  const { groups, loading: groupsLoading } = useProductGroups();
  const cart = useCartContext();
  const { t } = useLocale();
  const { formatCurrencyPrice } = useCurrency();
  const [heroIdx, setHeroIdx] = useState(0);
  const [layoutBlocks, setLayoutBlocks] = useState<any[]>([
    { id: 'hero', visible: true },
    { id: 'trust', visible: true },
    { id: 'banners', visible: true },
    { id: 'bento', visible: true },
    { id: 'collections', visible: true },
    { id: 'trending', visible: true },
    { id: 'mundial', visible: true },
    { id: 'brands', visible: true },
    { id: 'cta', visible: true }
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

  const renderBlock = (blockId: string) => {
    switch (blockId) {

      /* ━━━━━━━━━━━ HERO CINEMATOGRÁFICO ━━━━━━━━━━━ */
      case 'hero': {
        const heroBanner = banners[heroIdx];
        const heroImg = heroBanner?.image_url || (featured[0] ? getProductImage(featured[0]) : '');
        return (
          <section className="relative overflow-hidden min-h-[85vh] flex items-center">
            <div className="absolute inset-0 bg-[#05070f]" />
            <div className="absolute -right-40 -top-40 w-[800px] h-[800px] bg-[#f00856]/[.07] blur-[180px] rounded-full" />
            <div className="absolute -left-60 bottom-0 w-[500px] h-[500px] bg-[#f00856]/[.04] blur-[140px] rounded-full" />
            <div className="absolute inset-0 opacity-[0.025]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
              backgroundSize: '60px 60px'
            }} />

            <div className="max-w-[1500px] mx-auto px-6 w-full relative z-10 py-20">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                <div className="animate-fade-in-up">
                  <div className="inline-block px-4 py-1.5 rounded-full border border-[#f00856]/30 bg-[#f00856]/10 text-[#f00856] text-[10px] font-black uppercase tracking-[0.25em] mb-6">
                    {settings['home_hero_subtitle'] || 'Collectibles Uruguay'}
                  </div>
                  <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-black leading-[0.88] tracking-tighter text-white">
                    {settings['home_hero_title'] ? (
                      <span dangerouslySetInnerHTML={{ __html: settings['home_hero_title'] }} />
                    ) : (
                      <>La colección<br /><span className="text-[#f00856]">empieza</span> acá.</>
                    )}
                  </h1>
                  <p className="text-slate-400 text-lg md:text-xl mt-6 max-w-lg leading-relaxed font-medium">
                    {settings['home_hero_desc'] || 'Figuras, juguetes, licencias icónicas y coleccionables seleccionados por Collectibles Uruguay.'}
                  </p>
                  <div className="flex flex-wrap gap-4 mt-10">
                    <Link to="/shop" className="btn-primary px-10 py-5 text-base rounded-full group inline-flex items-center">
                      {settings['home_hero_btn_primary'] || 'Ver catálogo'} <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    <Link to="/shop?badge=sale" className="px-10 py-5 text-base rounded-full border border-white/15 text-white font-black hover:bg-white/5 transition-colors inline-flex items-center">
                      {settings['home_hero_btn_secondary'] || 'Ver promociones'}
                    </Link>
                  </div>
                </div>

                <div className="hidden lg:block relative">
                  <div className="relative rounded-2xl overflow-hidden aspect-[4/3] border border-white/10 shadow-2xl shadow-black/50">
                    {heroImg ? (
                      <img src={heroImg} alt="Hero" className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#f00856]/20 to-[#05070f] flex items-center justify-center text-8xl opacity-40">🧸</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5 z-10">
                      <div className="text-[10px] font-black text-[#f00856] uppercase tracking-[0.25em] mb-1">Slide destacado</div>
                      <div className="text-white font-black text-lg">{heroBanner?.title || 'Beyblade · Mortal Kombat · Figuras'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      }

      /* ━━━━━━━━━━━ TRUST BAR (3 items) ━━━━━━━━━━━ */
      case 'trust':
        return (
          <section className="max-w-[1500px] mx-auto px-6 -mt-8 relative z-20">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: Truck, title: 'Envíos a todo Uruguay', desc: 'Entregas rápidas y seguras' },
                { icon: Package, title: 'Productos oficiales', desc: 'Licencias verificadas' },
                { icon: Shield, title: 'Compra segura', desc: 'Pagos protegidos' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-4 group">
                  <div className="w-12 h-12 rounded-xl bg-[#f00856]/10 border border-[#f00856]/20 flex items-center justify-center shrink-0 group-hover:bg-[#f00856] transition-all duration-300">
                    <Icon className="w-5 h-5 text-[#f00856] group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <h4 className="text-white font-black text-sm">{title}</h4>
                    <p className="text-slate-500 text-xs font-medium">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );

      /* ━━━━━━━━━━━ BANNERS CINEMATOGRÁFICOS ━━━━━━━━━━━ */
      case 'banners':
        if (!banners.length) return null;
        return (
          <section className="max-w-[1500px] mx-auto px-6 py-16">
            <div className={`grid gap-6 ${banners.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
              {banners.slice(0, 2).map((banner: any, i: number) => (
                <Link
                  key={banner.id || i}
                  to={banner.link || '/shop'}
                  className="group relative rounded-2xl overflow-hidden aspect-[16/7] border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02]"
                >
                  <img
                    src={banner.image_url}
                    alt={banner.title || 'Banner'}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
                  {banner.title && (
                    <div className="absolute bottom-6 left-6 right-6 z-10">
                      <h3 className="text-white font-black text-xl md:text-2xl drop-shadow-lg">{banner.title}</h3>
                      {banner.subtitle && <p className="text-slate-200 text-sm mt-1 drop-shadow">{banner.subtitle}</p>}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        );

      /* ━━━━━━━━━━━ CATEGORÍAS (BENTO) ━━━━━━━━━━━ */
      case 'bento':
        return (
          <section className="max-w-[1500px] mx-auto px-6 py-20">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">
                  {settings['home_bento_subtitle'] || 'Mundos coleccionables'}
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                  {settings['home_bento_title'] || 'Explorá por categoría'}
                </h2>
              </div>
              <Link to="/shop" className="hidden md:inline-flex items-center gap-2 text-sm font-black text-slate-400 hover:text-white transition-colors uppercase tracking-wider">
                {settings['home_hero_btn_primary'] || 'Ver catálogo'} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {categories.slice(0, 3).map((c) => (
                <Link
                  key={c.id}
                  to={`/shop?category=${c.slug}`}
                  className="relative rounded-2xl overflow-hidden group border border-white/10 transition-all hover:border-[#f00856]/30 hover:-translate-y-1 flex flex-col justify-end aspect-[3/2]"
                >
                  {c.image_url && (
                    <img
                      src={c.image_url}
                      alt={c.name}
                      className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 group-hover:scale-110 transition-all duration-700"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-[#05070f]/50 to-transparent" />
                  <div className="relative z-10 p-6">
                    <h3 className="text-xl md:text-2xl font-black text-white mb-1">{c.name}</h3>
                    <p className="text-slate-400 font-bold text-sm flex items-center gap-1 group-hover:text-[#f00856] transition-colors">
                      Ver colección <span className="ml-1">→</span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );

      /* ━━━━━━━━━━━ COLECCIONES (PRODUCT GROUPS) ━━━━━━━━━━━ */
      case 'collections':
        return (
          <>
            {groups.map((g, i) => (
              <section key={g.id || `group-${i}`} className="py-16 border-t border-white/5">
                <div className="max-w-[1500px] mx-auto px-6">
                  <div className="flex items-end justify-between mb-10">
                    <div>
                      <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">Colección curada</div>
                      <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">{g.name}</h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-7 gap-y-12">
                    {(g.product_group_items || []).map(({ product }: any) => product && (
                      <ProductGridCard key={product.id} product={product} onAddToCart={handleAddToCart} formatPrice={formatCurrencyPrice} />
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </>
        );

      /* ━━━━━━━━━━━ TENDENCIAS ━━━━━━━━━━━ */
      case 'trending':
        return (
          <section className="py-20 bg-white/[0.02] border-y border-white/5">
            <div className="max-w-[1500px] mx-auto px-6">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">Lo más buscado</div>
                  <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Tendencias</h2>
                </div>
                <Link to="/shop" className="hidden md:inline-flex items-center gap-2 text-sm font-black text-slate-400 hover:text-white transition-colors uppercase tracking-wider">
                  Ver todo <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-7 gap-y-12">
                {featured.map(p => (
                  <ProductGridCard key={p.id} product={p} onAddToCart={handleAddToCart} formatPrice={formatCurrencyPrice} />
                ))}
              </div>
            </div>
          </section>
        );

      /* ━━━━━━━━━━━ MARCAS DESTACADAS ━━━━━━━━━━━ */
      case 'brands':
        return (
          <section className="py-20 overflow-hidden">
            <div className="max-w-[1500px] mx-auto px-6 mb-12 text-center">
              <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">Universos que coleccionamos</div>
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Marcas destacadas</h2>
            </div>

            <div className="flex animate-marquee whitespace-nowrap gap-20 items-center opacity-40 hover:opacity-100 transition-opacity duration-500">
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

      /* ━━━━━━━━━━━ ESPECIAL MUNDIAL ━━━━━━━━━━━ */
      case 'mundial': {
        const mundialImg = banners.find((b: any) => /mundial|album|mascota|figurita/i.test(b.title || ''))?.image_url
          || (newArrivals[0] ? getProductImage(newArrivals[0]) : (featured[1] ? getProductImage(featured[1]) : ''));
        return (
          <section className="py-20 border-t border-white/5">
            <div className="max-w-[1500px] mx-auto px-6">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-r from-[#05070f] to-[#1a0510]">
                <div className="absolute inset-0 bg-[#f00856]/[.04] blur-[100px] rounded-full w-[600px] h-[600px] -right-40 -top-40" />
                <div className="grid lg:grid-cols-2 gap-8 items-center p-8 md:p-12 lg:p-16 relative z-10">
                  <div>
                    <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-3">
                      {settings['home_mundial_subtitle'] || 'Edición especial'}
                    </div>
                    <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-[0.9]">
                      {settings['home_mundial_title'] || 'Especial Mundial'}
                    </h2>
                    <p className="text-slate-400 text-base md:text-lg mt-4 leading-relaxed max-w-md">
                      {settings['home_mundial_desc'] || 'Álbum, figuritas y mascotas. Armá tu colección con productos disponibles, promos reales y atención directa de Collectibles.'}
                    </p>
                    <Link to="/shop?q=mundial" className="btn-primary px-8 py-4 text-sm rounded-full inline-flex items-center gap-2 mt-8">
                      {settings['home_mundial_btn'] || 'Ver especial Mundial'} <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                  {mundialImg && (
                    <div className="hidden lg:block rounded-xl overflow-hidden aspect-[4/3] border border-white/10">
                      <img src={mundialImg} alt="Especial Mundial" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      }

      /* ━━━━━━━━━━━ CTA FINAL ━━━━━━━━━━━ */
      case 'cta':
        return (
          <section className="py-24">
            <div className="max-w-[1500px] mx-auto px-6">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#0d0515] to-[#05070f] p-12 md:p-20 text-center">
                <div className="absolute inset-0 opacity-[0.03]" style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
                  backgroundSize: '40px 40px'
                }} />
                <div className="relative z-10 max-w-2xl mx-auto">
                  <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-3">
                    {settings['home_cta_subtitle'] || 'Collectibles Uruguay'}
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">
                    {settings['home_cta_title'] || 'Tu próxima pieza de colección te está esperando.'}
                  </h2>
                  <Link to="/shop" className="btn-primary px-10 py-5 text-base rounded-full inline-flex items-center gap-2 mt-10">
                    {settings['home_cta_btn'] || 'Explorar catálogo'} <ArrowRight className="w-5 h-5" />
                  </Link>
                </div>
              </div>
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

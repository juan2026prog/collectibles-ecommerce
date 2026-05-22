import { Link } from 'react-router-dom';
import { ArrowRight, Truck, Shield, Package } from 'lucide-react';
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useProducts, useCategories, useBrands, useBanners, useProductGroups } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useLocale } from '../contexts/LocaleContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { ProductSkeleton } from '../components/Skeletons';
import { ProductGridCard } from '../components/ProductGridCard';
import { getProductImage } from '../lib/imageUtils';
import { useSiteSettings } from '../hooks/useSiteSettings';
import HeroSlider from '../components/HeroSlider';

// Lazy load heavy module components
const MiniBannerCard = lazy(() => import('../components/home/MiniBannerCard'));
const CampaignBanner = lazy(() => import('../components/home/CampaignBanner'));

/* ━━━ Types for CMS module configs ━━━ */
interface MiniBannerConfig {
  enabled: boolean;
  image_url: string;
  mobile_image_url?: string;
  title: string;
  subtitle?: string;
  badge_text?: string;
  button_text?: string;
  link_url?: string;
  overlay_opacity?: number;
  text_align?: 'left' | 'center';
  sort_order?: number;
}

interface TrendingConfig {
  enabled: boolean;
  title: string;
  subtitle?: string;
  source: 'featured' | 'newest' | 'manual';
  manual_product_ids?: string[];
  max_items: number;
  display_mode: 'grid' | 'carousel';
  cta_text: string;
  cta_link: string;
}

interface CampaignSlide {
  image_url: string;
  mobile_image_url?: string;
}

interface CampaignConfig {
  enabled: boolean;
  campaign_tag?: string;
  title: string;
  subtitle?: string;
  cta_text?: string;
  cta_link?: string;
  background_mode?: 'gradient' | 'image';
  overlay_opacity?: number;
  text_align?: 'left' | 'center';
  slides: CampaignSlide[];
  autoplay?: boolean;
  autoplay_interval?: number;
}

/* ━━━ Default configs ━━━ */
const DEFAULT_TRENDING: TrendingConfig = {
  enabled: true,
  title: 'Tendencias',
  subtitle: 'Lo más buscado',
  source: 'featured',
  max_items: 10,
  display_mode: 'grid',
  cta_text: 'Ver todo',
  cta_link: '/shop',
};

const DEFAULT_CAMPAIGN: CampaignConfig = {
  enabled: true,
  campaign_tag: 'Edición especial',
  title: 'Especial Mundial',
  subtitle: 'Álbum, figuritas y mascotas. Armá tu colección con productos disponibles, promos reales y atención directa de Collectibles.',
  cta_text: 'Ver especial Mundial',
  cta_link: '/shop?q=mundial',
  background_mode: 'gradient',
  overlay_opacity: 0.04,
  text_align: 'left',
  slides: [],
  autoplay: true,
  autoplay_interval: 5000,
};

/* ━━━ JSON parse helpers ━━━ */
function parseMiniBanners(json?: string): MiniBannerConfig[] {
  try {
    if (!json) return [];
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.filter((b: any) => b.enabled !== false);
    return [];
  } catch { return []; }
}

function parseTrendingConfig(json?: string): TrendingConfig {
  try {
    if (!json) return DEFAULT_TRENDING;
    return { ...DEFAULT_TRENDING, ...JSON.parse(json) };
  } catch { return DEFAULT_TRENDING; }
}

function parseCampaignConfig(json?: string, settings?: Record<string, string>): CampaignConfig {
  try {
    if (json) {
      return { ...DEFAULT_CAMPAIGN, ...JSON.parse(json) };
    }
    // Backward compat: use old settings keys if no campaign JSON exists
    if (settings) {
      return {
        ...DEFAULT_CAMPAIGN,
        campaign_tag: settings['home_mundial_subtitle'] || DEFAULT_CAMPAIGN.campaign_tag,
        title: settings['home_mundial_title'] || DEFAULT_CAMPAIGN.title,
        subtitle: settings['home_mundial_desc'] || DEFAULT_CAMPAIGN.subtitle,
        cta_text: settings['home_mundial_btn'] || DEFAULT_CAMPAIGN.cta_text,
      };
    }
    return DEFAULT_CAMPAIGN;
  } catch { return DEFAULT_CAMPAIGN; }
}

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
  const [layoutBlocks, setLayoutBlocks] = useState<any[]>([
    { id: 'hero', visible: true },
    { id: 'trust', visible: true },
    { id: 'banners', visible: true },
    { id: 'bento', visible: true },
    { id: 'collections', visible: true },
    { id: 'trending', visible: true },
    { id: 'campaign', visible: true },
    { id: 'brands', visible: true },
    { id: 'cta', visible: true }
  ]);

  const DEFAULT_BLOCK_IDS = ['hero','trust','banners','bento','collections','trending','campaign','brands','cta'];

  useEffect(() => {
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('public_site_config').select('value').eq('key', 'appearance_home_layout_json').maybeSingle()
        .then(({ data }) => {
          if (data?.value) {
            try {
              const parsed = JSON.parse(data.value);
              if (Array.isArray(parsed) && parsed.length > 0) {
                // Backward compat: rename 'mundial' → 'campaign'
                const migrated = parsed.map((b: any) => b.id === 'mundial' ? { ...b, id: 'campaign' } : b);
                // Merge any new blocks not in saved data
                const savedIds = new Set(migrated.map((b: any) => b.id));
                const missing = DEFAULT_BLOCK_IDS.filter(id => !savedIds.has(id)).map(id => ({ id, visible: true }));
                setLayoutBlocks([...migrated, ...missing]);
              }
            } catch {}
          }
        });
    });
  }, []);

  /* ━━━ Parse CMS module configs from settings ━━━ */
  const miniBanners = useMemo(() =>
    parseMiniBanners(settings['home_mini_banners_json']),
    [settings['home_mini_banners_json']]
  );

  const trendingConfig = useMemo(() =>
    parseTrendingConfig(settings['home_trending_config_json']),
    [settings['home_trending_config_json']]
  );

  const campaignConfig = useMemo(() =>
    parseCampaignConfig(settings['home_campaign_banner_json'], settings),
    [settings['home_campaign_banner_json'], settings['home_mundial_subtitle'], settings['home_mundial_title'], settings['home_mundial_desc'], settings['home_mundial_btn']]
  );

  /* ━━━ Determine trending products based on config ━━━ */
  const trendingProducts = useMemo(() => {
    if (!trendingConfig.enabled) return [];
    switch (trendingConfig.source) {
      case 'newest': return newArrivals.slice(0, trendingConfig.max_items);
      case 'featured': default: return featured.slice(0, trendingConfig.max_items);
    }
  }, [trendingConfig, featured, newArrivals]);

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
        return (
          <HeroSlider banners={banners} loading={bannersLoading} />
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

      /* ━━━━━━━━━━━ MINI BANNERS DINÁMICOS ━━━━━━━━━━━ */
      case 'banners': {
        // Use CMS mini banners if configured, fallback to hero banners for backward compat
        const activeMinis = miniBanners.length > 0
          ? miniBanners.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          : banners.slice(0, 2).map((b: any) => ({
              enabled: true,
              image_url: b.image_url,
              mobile_image_url: b.mobile_image_url,
              title: b.title,
              subtitle: b.subtitle,
              badge_text: b.badge_text,
              button_text: b.button_text || 'Ver más',
              link_url: b.link_url || '/shop',
              overlay_opacity: b.overlay_opacity ?? 0.4,
              text_align: (b.content_align || 'left') as 'left' | 'center',
            }));

        if (!activeMinis.length) return null;

        return (
          <section className="max-w-[1500px] mx-auto px-6 py-16">
            <div className={`grid gap-6 ${activeMinis.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
              <Suspense fallback={<div className="aspect-[16/7] rounded-2xl bg-white/5 animate-pulse" />}>
                {activeMinis.map((banner, i) => (
                  <MiniBannerCard key={`mini-${i}`} {...banner} />
                ))}
              </Suspense>
            </div>
          </section>
        );
      }

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
                      loading="lazy"
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

      /* ━━━━━━━━━━━ TENDENCIAS (DINÁMICO) ━━━━━━━━━━━ */
      case 'trending': {
        if (!trendingConfig.enabled || trendingProducts.length === 0) return null;
        return (
          <section className="py-20 bg-white/[0.02] border-y border-white/5">
            <div className="max-w-[1500px] mx-auto px-6">
              <div className="flex items-end justify-between mb-10">
                <div>
                  <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">
                    {trendingConfig.subtitle}
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                    {trendingConfig.title}
                  </h2>
                </div>
                <Link to={trendingConfig.cta_link} className="hidden md:inline-flex items-center gap-2 text-sm font-black text-slate-400 hover:text-white transition-colors uppercase tracking-wider">
                  {trendingConfig.cta_text} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-7 gap-y-12">
                {trendingProducts.map(p => (
                  <ProductGridCard key={p.id} product={p} onAddToCart={handleAddToCart} formatPrice={formatCurrencyPrice} />
                ))}
              </div>
            </div>
          </section>
        );
      }

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
                    <img src={b.logo_url} alt={b.name} loading="lazy" className="h-12 w-auto object-contain" />
                  ) : (
                    <span className="text-2xl font-black text-slate-500 uppercase tracking-widest">{b.name}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        );

      /* ━━━━━━━━━━━ CAMPAIGN BANNER (DINÁMICO) ━━━━━━━━━━━ */
      case 'campaign':
      case 'mundial': {
        if (!campaignConfig.enabled) return null;

        // Fallback image from products if no slides configured
        const fallbackImg = campaignConfig.slides.length === 0
          ? (newArrivals[0] ? getProductImage(newArrivals[0]) : (featured[1] ? getProductImage(featured[1]) : ''))
          : '';

        const campaignSlides = campaignConfig.slides.length > 0
          ? campaignConfig.slides
          : fallbackImg ? [{ image_url: fallbackImg }] : [];

        return (
          <Suspense fallback={<div className="py-20"><div className="max-w-[1500px] mx-auto px-6"><div className="h-[400px] rounded-2xl bg-white/5 animate-pulse" /></div></div>}>
            <section className="py-20 border-t border-white/5">
              <div className="max-w-[1500px] mx-auto px-6">
                <CampaignBanner
                  campaign_tag={campaignConfig.campaign_tag}
                  title={campaignConfig.title}
                  subtitle={campaignConfig.subtitle}
                  cta_text={campaignConfig.cta_text}
                  cta_link={campaignConfig.cta_link}
                  background_mode={campaignConfig.background_mode}
                  overlay_opacity={campaignConfig.overlay_opacity}
                  text_align={campaignConfig.text_align}
                  slides={campaignSlides}
                  autoplay={campaignConfig.autoplay}
                  autoplay_interval={campaignConfig.autoplay_interval}
                />
              </div>
            </section>
          </Suspense>
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

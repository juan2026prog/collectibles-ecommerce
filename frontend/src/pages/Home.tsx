import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Truck, Shield, Package, ShoppingCart } from 'lucide-react';
import { useState, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
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
const FeaturedDrops = lazy(() => import('../components/home/FeaturedDrops'));
const PreOrders = lazy(() => import('../components/home/PreOrders'));

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
  background_mode: 'image',
  overlay_opacity: 0.04,
  text_align: 'left',
  slides: [
    {
      image_url: '/images/banners/mundial_desktop.png',
      mobile_image_url: '/images/banners/mundial_mobile.png',
    }
  ],
  autoplay: true,
  autoplay_interval: 5000,
};

const DEFAULT_MINI_BANNERS: MiniBannerConfig[] = [
  {
    enabled: true,
    badge_text: 'COLLECTIBLES URUGUAY',
    title: 'FIGURAS QUE CUENTAN HISTORIAS.',
    subtitle: 'No vendemos solo productos. Vendemos recuerdos, nostalgia y personajes que siguen viviendo con vos.',
    button_text: 'VER CATÁLOGO',
    link_url: '/shop',
    overlay_opacity: 0.4,
    text_align: 'left',
    image_url: '/images/banners/vitrina_desktop.png',
    mobile_image_url: '/images/banners/vitrina_mobile.png',
    sort_order: 0,
  },
  {
    enabled: true,
    badge_text: '',
    title: 'LA PASIÓN SE COLECCIONA.',
    subtitle: 'Álbum, figuritas, mascotas oficiales. Para vivir el Mundial 2026 desde el primer sobre.',
    button_text: 'VER COLECCIÓN',
    link_url: '/shop?q=mundial',
    overlay_opacity: 0.4,
    text_align: 'left',
    image_url: '/images/banners/mundial_desktop.png',
    mobile_image_url: '/images/banners/mundial_mobile.png',
    sort_order: 1,
  }
];

/* ━━━ JSON parse helpers ━━━ */
function parseMiniBanners(json?: string): MiniBannerConfig[] {
  try {
    if (!json) return [];
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.filter((b: any) => b.enabled !== false);
    return [];
  } catch { return []; }
}

function parseFeaturedDrops(json?: string): any[] {
  try {
    if (!json) return [];
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.filter((d: any) => d.enabled !== false);
    return [];
  } catch { return []; }
}

function parsePreorders(json?: string): any[] {
  try {
    if (!json) return [];
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.filter((p: any) => p.enabled !== false);
    return [];
  } catch { return []; }
}

function parseUpcomingConfig(json?: string): any {
  try {
    if (!json) return { enabled: false, teasers: [] };
    const parsed = JSON.parse(json);
    return parsed;
  } catch { return { enabled: false, teasers: [] }; }
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

function parseHomeCategories(json?: string, allCategories: any[] = []): any[] {
  try {
    if (!json) {
      return allCategories
        .filter(c => c.is_active !== false)
        .slice(0, 5);
    }
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return allCategories
        .filter(c => c.is_active !== false)
        .slice(0, 5);
    }
    const activeConfigs = parsed
      .filter((cfg: any) => cfg.enabled !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const categoryMap = new Map(allCategories.map(c => [c.id, c]));
    
    return activeConfigs
      .map((cfg: any) => {
        const cat = categoryMap.get(cfg.category_id);
        if (!cat) return null;
        return {
          ...cat,
          name: cfg.name_override || cat.name,
          image_url: cfg.image_url || cat.image_url,
          metadata: {
            ...cat.metadata,
            badge: cfg.badge_text !== undefined && cfg.badge_text !== '' ? cfg.badge_text : cat.metadata?.badge,
            subtitle: cfg.subtitle !== undefined && cfg.subtitle !== '' ? cfg.subtitle : cat.metadata?.subtitle,
            mobile_image_url: cfg.mobile_image_url !== undefined && cfg.mobile_image_url !== '' ? cfg.mobile_image_url : cat.metadata?.mobile_image_url,
          }
        };
      })
      .filter(Boolean);
  } catch {
    return allCategories
      .filter(c => c.is_active !== false)
      .slice(0, 5);
  }
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

  const categoriesContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftCats, setShowLeftCats] = useState(false);
  const [showRightCats, setShowRightCats] = useState(true);

  const updateCatsArrows = () => {
    if (!categoriesContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = categoriesContainerRef.current;
    setShowLeftCats(scrollLeft > 10);
    setShowRightCats(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    const el = categoriesContainerRef.current;
    if (el) {
      el.addEventListener('scroll', updateCatsArrows);
      updateCatsArrows();
    }
    return () => el?.removeEventListener('scroll', updateCatsArrows);
  }, [displayedCategories.length]);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (!categoriesContainerRef.current) return;
    const scrollAmount = 384; // Card width (360) + gap (24)
    categoriesContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const [layoutBlocks, setLayoutBlocks] = useState<any[]>([
    { id: 'hero', visible: true },
    { id: 'trust', visible: true },
    { id: 'banners', visible: true },
    { id: 'featured_drops', visible: true },
    { id: 'bento', visible: true },
    { id: 'new_arrivals', visible: true },
    { id: 'preorders', visible: true },
    { id: 'upcoming_drops', visible: true },
    { id: 'collections', visible: true },
    { id: 'trending', visible: false },
    { id: 'campaign', visible: false },
    { id: 'brands', visible: true },
    { id: 'cta', visible: true }
  ]);

  const DEFAULT_BLOCK_IDS = [
    'hero',
    'trust',
    'banners',
    'featured_drops',
    'bento',
    'new_arrivals',
    'preorders',
    'upcoming_drops',
    'collections',
    'trending',
    'campaign',
    'brands',
    'cta'
  ];

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
                const missing = DEFAULT_BLOCK_IDS.filter(id => !savedIds.has(id)).map(id => ({
                  id,
                  visible: id === 'trending' || id === 'campaign' ? false : true
                }));
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

  const featuredDrops = useMemo(() =>
    parseFeaturedDrops(settings['home_featured_drops_json']),
    [settings['home_featured_drops_json']]
  );

  const preorders = useMemo(() =>
    parsePreorders(settings['home_preorders_json']),
    [settings['home_preorders_json']]
  );

  const displayedCategories = useMemo(() =>
    parseHomeCategories(settings['home_categories_config_json'], categories),
    [settings['home_categories_config_json'], categories]
  );

  const upcomingConfig = useMemo(() =>
    parseUpcomingConfig(settings['home_upcoming_drops_json']),
    [settings['home_upcoming_drops_json']]
  );

  const trendingConfig = useMemo(() =>
    parseTrendingConfig(settings['home_trending_config_json']),
    [settings['home_trending_config_json']]
  );

  const campaignConfig = useMemo(() =>
    parseCampaignConfig(settings['home_campaign_banner_json'], settings),
    [settings['home_campaign_banner_json'], settings['home_mundial_subtitle'], settings['home_mundial_title'], settings['home_mundial_desc'], settings['home_mundial_btn']]
  );

  /* ━━━ Notified upcoming drops state ━━━ */
  const [notifiedTeasers, setNotifiedTeasers] = useState<Set<number>>(new Set());

  function handleToggleNotification(idx: number) {
    setNotifiedTeasers(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  /* ━━━ Fetch manual new arrivals if configured ━━━ */
  const [manualNewArrivals, setManualNewArrivals] = useState<any[]>([]);
  const [manualLoading, setManualLoading] = useState(false);

  useEffect(() => {
    const idsStr = settings['featured_new_arrivals'];
    if (!idsStr) {
      setManualNewArrivals([]);
      return;
    }
    const ids = idsStr.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      setManualNewArrivals([]);
      return;
    }

    let isMounted = true;
    setManualLoading(true);

    import('../lib/supabase').then(({ supabase }) => {
      supabase
        .from('products')
        .select(`
          *,
          category:categories(id, name, slug),
          brand:brands(id, name, slug, logo_url),
          images:product_images(id, url, alt_text, sort_order, is_primary),
          variants:product_variants(id, sku, name, price_adjustment, inventory_count)
        `)
        .eq('status', 'published')
        .in('id', ids)
        .then(({ data, error }) => {
          if (!isMounted) return;
          setManualLoading(false);
          if (!error && data) {
            const sorted = [...data].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
            setManualNewArrivals(sorted);
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [settings['featured_new_arrivals']]);

  const displayedNewArrivals = useMemo(() => {
    if (manualNewArrivals.length > 0) {
      return manualNewArrivals.slice(0, 6);
    }
    return newArrivals.slice(0, 5);
  }, [manualNewArrivals, newArrivals]);

  const isNewArrivalsLoading = newArrivalsLoading || manualLoading;

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
        // Use CMS mini banners if configured, fallback to default premium examples
        const activeMinis = miniBanners.length > 0
          ? miniBanners.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          : DEFAULT_MINI_BANNERS;

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

      /* ━━━━━━━━━━━ FEATURED DROPS (UNIVERSOS DESTACADOS) ━━━━━━━━━━━ */
      case 'featured_drops':
        return (
          <Suspense fallback={<div className="max-w-[1500px] mx-auto px-6 py-20 animate-pulse"><div className="h-[400px] bg-white/5 rounded-2xl" /></div>}>
            <FeaturedDrops drops={featuredDrops} />
          </Suspense>
        );

      /* ━━━━━━━━━━━ CATEGORÍAS (EXPLORÁ UNIVERSOS) ━━━━━━━━━━━ */
      case 'bento':
        return (
          <section className="max-w-[1500px] mx-auto px-6 py-24 relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute top-1/2 left-0 w-[300px] h-[300px] bg-[#f00856]/[.02] blur-[100px] rounded-full pointer-events-none" />

            <div className="flex items-end justify-between mb-12">
              <div>
                <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">
                  {settings['home_bento_subtitle'] || 'Mundos coleccionables'}
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase">
                  {settings['home_bento_title'] || 'Explora Categorías'}
                </h2>
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <Link to="/shop" className="hidden md:inline-flex items-center gap-2 text-sm font-black text-slate-400 hover:text-white transition-colors uppercase tracking-wider">
                  Ver catálogo completo <ArrowRight className="w-4 h-4" />
                </Link>
                {/* Desktop Navigation Arrows */}
                <div className="hidden md:flex gap-2">
                  <button
                    onClick={() => scrollCategories('left')}
                    disabled={!showLeftCats}
                    className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${
                      showLeftCats
                        ? 'border-white/20 bg-white/5 text-white hover:bg-[#f00856] hover:border-[#f00856] cursor-pointer'
                        : 'border-white/5 text-white/20 cursor-not-allowed'
                    }`}
                    aria-label="Anterior categoría"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => scrollCategories('right')}
                    disabled={!showRightCats}
                    className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${
                      showRightCats
                        ? 'border-white/20 bg-white/5 text-white hover:bg-[#f00856] hover:border-[#f00856] cursor-pointer'
                        : 'border-white/5 text-white/20 cursor-not-allowed'
                    }`}
                    aria-label="Siguiente categoría"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div
              ref={categoriesContainerRef}
              className="flex gap-6 overflow-x-auto no-scrollbar pb-4 snap-x snap-mandatory scroll-smooth -mx-6 px-6 md:mx-0 md:px-0"
            >
              {displayedCategories.map((c) => {
                const mobileImg = c.metadata?.mobile_image_url || c.image_url;
                const desktopImg = c.image_url;
                return (
                  <Link
                    key={c.id}
                    to={`/shop?category=${c.slug}`}
                    className="relative rounded-2xl overflow-hidden group border border-white/10 transition-all hover:border-[#f00856]/30 hover:-translate-y-1 flex flex-col justify-end aspect-[9/12] md:aspect-[3/4] w-[78vw] md:w-[360px] shrink-0 shadow-[0_10px_30px_rgba(0,0,0,0.4)] snap-start select-none"
                  >
                    <picture className="absolute inset-0 w-full h-full">
                      {mobileImg && <source media="(max-width: 767px)" srcSet={mobileImg} />}
                      {desktopImg && (
                        <img
                          src={desktopImg}
                          alt={c.name}
                          loading="lazy"
                          className="w-full h-full object-cover opacity-35 group-hover:opacity-55 group-hover:scale-[1.05] transition-all duration-700 ease-out"
                        />
                      )}
                    </picture>

                    {/* Dark cinematic gradient and colored glow overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-black/45 to-transparent opacity-95" />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#f00856]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                    <div className="relative z-10 p-6 md:p-8 flex flex-col items-start w-full">
                      {c.metadata?.badge && (
                        <span className="text-[8px] md:text-[9px] text-[#f00856] font-black tracking-[0.2em] bg-[#f00856]/10 border border-[#f00856]/20 px-2 py-0.5 rounded-full uppercase mb-3.5 w-fit">
                          {c.metadata.badge}
                        </span>
                      )}
                      <h3 className="text-2xl md:text-3xl font-black text-white leading-tight uppercase mb-2 tracking-tight">
                        {c.name}
                      </h3>
                      {c.metadata?.subtitle && (
                        <p className="text-slate-400 text-xs md:text-sm font-semibold max-w-[260px] mb-5 leading-relaxed opacity-85 group-hover:opacity-100 transition-opacity">
                          {c.metadata.subtitle}
                        </p>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs font-black text-white group-hover:text-[#f00856] transition-colors uppercase tracking-wider">
                        Ver colección <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );

      /* ━━━━━━━━━━━ NUEVO EN COLLECTIBLES (EDITORIAL NEW ARRIVALS) ━━━━━━━━━━━ */
      case 'new_arrivals': {
        const activeProducts = displayedNewArrivals;
        if (isNewArrivalsLoading) {
          return (
            <section className="py-20 border-t border-white/5">
              <div className="max-w-[1500px] mx-auto px-6">
                <div className="flex items-end justify-between mb-12">
                  <div>
                    <div className="h-4 w-32 bg-white/5 animate-pulse rounded mb-2" />
                    <div className="h-8 w-64 bg-white/5 animate-pulse rounded" />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                  {[...Array(4)].map((_, i) => (
                    <ProductSkeleton key={i} />
                  ))}
                </div>
              </div>
            </section>
          );
        }

        if (!activeProducts.length) return null;

        return (
          <section className="py-24 border-t border-white/5 relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#f00856]/[.02] blur-[150px] rounded-full pointer-events-none" />

            <div className="max-w-[1500px] mx-auto px-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
                <div>
                  <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">
                    Colección Exclusiva
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase">
                    Nuevo en Collectibles
                  </h2>
                  <p className="text-slate-400 text-xs md:text-sm font-semibold mt-2">
                    Nuevas piezas, drops limitados y universos recién llegados.
                  </p>
                </div>
                <Link to="/shop" className="inline-flex items-center gap-2 text-sm font-black text-slate-400 hover:text-white transition-colors uppercase tracking-wider mt-4 md:mt-0">
                  Ver todas las novedades <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Editorial grid with larger card sizes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
                {activeProducts.map((p) => {
                  const img = getProductImage(p);
                  const finalPrice = p.base_price + (p.variants?.[0]?.price_adjustment || 0);
                  const hasDiscount = p.compare_at_price > p.base_price;

                  return (
                    <article key={p.id} className="relative group flex flex-col justify-between bg-white/[0.01] border border-white/5 hover:border-[#f00856]/20 rounded-2xl overflow-hidden p-6 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                      {/* Product Badges (NEW, LOW STOCK, EXCLUSIVO, HOT, PREVENTA etc) */}
                      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 pointer-events-none">
                        {p.badge && p.badge.split(',').map((bId: string) => {
                          const id = bId.trim().toLowerCase();
                          let label = id.toUpperCase();
                          let style = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                          if (id === 'hot') style = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                          else if (id === 'low stock' || id === 'lowstock' || id === 'low-stock') {
                            label = "LOW STOCK";
                            style = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                          } else if (id === 'exclusivo' || id === 'exclusive') {
                            label = "EXCLUSIVO";
                            style = "bg-purple-500/10 text-purple-400 border-purple-500/20";
                          } else if (id === 'preventa' || id === 'preorder') {
                            label = "PREVENTA";
                            style = "bg-orange-500/10 text-orange-400 border-orange-500/20";
                          }
                          return (
                            <span key={id} className={`text-[8px] md:text-[9px] font-black tracking-widest px-2 py-0.5 border rounded-full uppercase ${style}`}>
                              {label}
                            </span>
                          );
                        })}
                      </div>

                      {/* Image Container with high contrast white background */}
                      <div className="relative w-full aspect-square bg-white rounded-xl overflow-hidden p-8 flex items-center justify-center border border-white/5 mb-6 group-hover:scale-[1.01] transition-transform duration-500">
                        <Link to={`/p/${p.slug}`} className="flex w-full h-full items-center justify-center">
                          <img
                            src={img}
                            alt={p.title}
                            className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        </Link>

                        {/* Add to cart quick button */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAddToCart(p);
                          }}
                          className="absolute bottom-4 right-4 w-12 h-12 bg-[#f00856] text-white flex items-center justify-center rounded-full shadow-lg z-30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all transform sm:translate-y-2 sm:group-hover:translate-y-0 active:scale-90 cursor-pointer"
                          title="Agregar al carrito"
                        >
                          <ShoppingCart className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Info Area */}
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          {/* Brand label */}
                          {p.brand?.name && (
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 block">
                              {p.brand.name}
                            </span>
                          )}
                          <Link to={`/p/${p.slug}`}>
                            <h3 className="text-base md:text-lg font-black text-white hover:text-[#f00856] leading-snug tracking-tight mb-2 transition-colors">
                              {p.title}
                            </h3>
                          </Link>
                          {p.description && (
                            <p className="text-slate-400 text-xs font-semibold leading-relaxed line-clamp-2 mb-4">
                              {p.description}
                            </p>
                          )}
                        </div>

                        {/* Price & Action Row */}
                        <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-auto">
                          <div className="flex items-baseline gap-2">
                            <span className="text-white font-black text-lg md:text-xl leading-none">
                              {formatCurrencyPrice(finalPrice)}
                            </span>
                            {hasDiscount && (
                              <span className="text-xs text-slate-500 line-through leading-none">
                                {formatCurrencyPrice(p.compare_at_price)}
                              </span>
                            )}
                          </div>
                          <Link
                            to={`/p/${p.slug}`}
                            className="text-xs font-black text-slate-400 hover:text-white transition-colors uppercase tracking-wider flex items-center gap-1"
                          >
                            Detalles <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        );
      }

      /* ━━━━━━━━━━━ PREVENTAS ACTIVAS ━━━━━━━━━━━ */
      case 'preorders':
        return (
          <Suspense fallback={<div className="max-w-[1500px] mx-auto px-6 py-20 animate-pulse"><div className="h-[400px] bg-white/5 rounded-2xl" /></div>}>
            <PreOrders preorders={preorders} />
          </Suspense>
        );

      /* ━━━━━━━━━━━ PRÓXIMOS DROPS ━━━━━━━━━━━ */
      case 'upcoming_drops': {
        if (!upcomingConfig || !upcomingConfig.enabled) return null;
        const activeTeasers = (upcomingConfig.teasers || [])
          .filter((t: any) => t.enabled !== false);

        if (!activeTeasers.length) return null;

        return (
          <section className="py-24 border-t border-white/5 relative overflow-hidden">
            {/* Dark grid pattern background */}
            <div className="absolute inset-0 opacity-[0.02]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
              backgroundSize: '30px 30px'
            }} />
            
            <div className="max-w-[1500px] mx-auto px-6 relative z-10">
              <div className="mb-12 text-center">
                <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">
                  Próximos Lanzamientos
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase">
                  Muy pronto en Collectibles
                </h2>
                <p className="text-slate-400 text-xs md:text-sm font-semibold mt-2">
                  Generando hype. Registrate para recibir la alerta antes que nadie.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                {activeTeasers.map((t: any, idx: number) => {
                  const isNotified = notifiedTeasers.has(idx);
                  return (
                    <div key={idx} className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#05070f] aspect-[16/10] flex flex-col justify-end group hover:border-[#f00856]/40 transition-all duration-500 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                      {/* Teaser Image / Silhouette */}
                      {t.image_url && (
                        <img
                          src={t.image_url}
                          alt={t.title}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover object-center opacity-30 blur-sm group-hover:scale-105 transition-all duration-700 ease-out"
                        />
                      )}
                      
                      {/* Dark overlay & vignette */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-[#05070f]/75 to-transparent opacity-95" />
                      
                      {/* Glow element */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#f00856]/5 blur-[60px] rounded-full group-hover:bg-[#f00856]/10 transition-colors duration-700 pointer-events-none" />

                      <div className="relative z-10 p-6 md:p-8 flex flex-col items-start w-full">
                        <span className="text-[8px] md:text-[9px] text-[#f00856] font-black tracking-widest bg-[#f00856]/10 border border-[#f00856]/20 px-2.5 py-0.5 rounded-full uppercase mb-3">
                          {t.date || 'Próximamente'}
                        </span>
                        <h3 className="text-xl md:text-2xl font-black text-white leading-tight uppercase mb-4 tracking-tight">
                          {t.title}
                        </h3>
                        <button
                          onClick={() => handleToggleNotification(idx)}
                          className={`py-2.5 px-6 text-xs font-black rounded-full uppercase tracking-wider transition-all duration-300 ${
                            isNotified 
                              ? 'bg-emerald-500 text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)]' 
                              : 'bg-white text-black hover:bg-[#f00856] hover:text-white shadow-[0_4px_12px_rgba(255,255,255,0.1)] hover:shadow-[0_4px_12px_rgba(240,8,86,0.3)]'
                          }`}
                        >
                          {isNotified ? '✓ Alerta Activada' : 'Notificarme'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      }

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
      case 'brands': {
        const activeBrands = (brands || []).filter((b: any) => b.is_active !== false);
        if (!activeBrands.length) return null;

        // Duplicate brands array to ensure infinite smooth loop
        const marqueeBrands = [...activeBrands, ...activeBrands, ...activeBrands];

        return (
          <section className="py-24 overflow-hidden relative">
            {/* Subtle glow background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[150px] bg-[#f00856]/[.02] blur-[120px] rounded-full pointer-events-none" />

            <div className="max-w-[1500px] mx-auto px-6 mb-16 text-center relative z-10">
              <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">
                Universos que coleccionamos
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase">
                Marcas destacadas
              </h2>
            </div>

            {/* Marquee with slower speed and color pop on hover */}
            <div className="relative w-full flex items-center py-4 bg-white/[0.01] border-y border-white/5">
              <div className="flex animate-marquee whitespace-nowrap gap-28 items-center py-2 opacity-60 hover:opacity-100 transition-opacity duration-700">
                {marqueeBrands.map((b, i) => (
                  <Link
                    key={`${b.id}-${i}`}
                    to={`/shop?brand=${b.slug}`}
                    className="shrink-0 grayscale hover:grayscale-0 hover:scale-[1.05] transition-all duration-500 ease-out"
                  >
                    {b.logo_url ? (
                      <img
                        src={b.logo_url}
                        alt={b.name}
                        loading="lazy"
                        className="h-14 md:h-16 w-auto object-contain"
                      />
                    ) : (
                      <span className="text-2xl font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
                        {b.name}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        );
      }

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
          animation: marquee 60s linear infinite;
          will-change: transform;
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

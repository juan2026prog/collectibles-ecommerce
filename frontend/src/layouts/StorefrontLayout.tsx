import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ShoppingCart, Menu, Search, User, Heart, X, ChevronDown, ChevronRight,
  Truck, Shield, RotateCcw, Headphones, MapPin, Phone, Mail, LogIn,
  LayoutDashboard, Store, Star, Share2, Package, LogOut, Video
} from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { useCategories, useBrands } from '../hooks/useData';
import LocaleSwitcher from '../components/LocaleSwitcher';
import WhatsAppFAB from '../components/WhatsAppFAB';
import { supabase } from '../lib/supabase';
import CookieConsent from '../components/CookieConsent';
import { generateTailwindPalette } from '../lib/colorUtils';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { STORE_ISOLOGO_URL } from '../lib/brand';
import { sanitizeHeadMarkup, sanitizeRichHtml } from '../lib/sanitize';
import { FacebookIcon, InstagramIcon, TwitterIcon, YoutubeIcon, TiktokIcon, WhatsappIcon } from '../components/SocialIcons';
import { CurrencySelector } from '../components/CurrencySelector';
import React from 'react';

// NAV_LINKS and MEGA_MENU are built dynamically inside the component
// using t() for translations and useCategories() for live DB data.

const DesktopMegaMenu = React.memo(({ isVisible, megaType, menuColumns, allBrands, onClose }: { isVisible: boolean | undefined, megaType: 'categories' | 'brands', menuColumns: any, allBrands: any[], onClose: () => void }) => {
  if (!isVisible) return null;
  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 pt-4 w-[600px] animate-fade-in pointer-events-auto z-50">
      <div className="glass rounded-[2rem] p-8 grid grid-cols-3 gap-8 shadow-2xl border-white/10">
        {megaType === 'categories' ? (
          menuColumns?.slice(0, 3).map((col: any) => (
            <div key={col.title}>
              <div className="text-[10px] text-[#f00856] font-black tracking-widest mb-4 uppercase">{col.title}</div>
              <div className="flex flex-col gap-2.5">
                {col.items.map((item: any) => (
                  <Link 
                    key={item.name} 
                    to={item.href} 
                    className="text-sm font-bold text-slate-300 hover:text-white transition-colors"
                    onClick={onClose}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          ))
        ) : (
           <div className="col-span-3 grid grid-cols-4 gap-4">
              {allBrands.slice(0, 8).map(b => (
                <Link 
                  key={b.id} 
                  to={`/shop?brand=${b.slug}`}
                  className="soft rounded-2xl p-4 flex flex-col items-center justify-center gap-2 hover:border-[#f00856]/40 transition-all"
                  onClick={onClose}
                >
                  {b.logo_url ? (
                    <img src={b.logo_url} className="h-8 object-contain opacity-60 group-hover:opacity-100" />
                  ) : (
                    <span className="text-xs font-black">{b.name}</span>
                  )}
                </Link>
              ))}
           </div>
        )}
      </div>
    </div>
  );
});

export default function StorefrontLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [megaMenuState, setMegaMenuState] = useState<'categories' | 'brands' | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [announcementVisible, setAnnouncementVisible] = useState(true);
  const [expandedMobileGroup, setExpandedMobileGroup] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const megaMenuTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { count: cartCount } = useCartContext();
  const { user, profile, signOut } = useAuth();
  const { language, currency, t, formatPrice } = useLocale();
  const { categories: allCategories } = useCategories();
  const { brands: allBrands } = useBrands();
  const { settings, loaded: settingsLoaded } = useSiteSettings();

  const getSocialUrl = (key: string, value: string) => {
    if (!value) return '#';
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    const prefixMap: Record<string, string> = {
      instagram: 'instagram.com/',
      facebook: 'facebook.com/',
      tiktok: 'tiktok.com/@',
      whatsapp: 'wa.me/',
      youtube: 'youtube.com/c/',
      x: 'x.com/'
    };
    return `https://${prefixMap[key] || ''}${value}`;
  };

  const activeSocials = useMemo(() => [
    { key: 'instagram', Icon: InstagramIcon },
    { key: 'facebook', Icon: FacebookIcon },
    { key: 'tiktok', Icon: TiktokIcon },
    { key: 'whatsapp', Icon: WhatsappIcon },
    { key: 'youtube', Icon: YoutubeIcon },
    { key: 'x', Icon: TwitterIcon }
  ].filter(social => settings[`social_${social.key}_enabled`] === 'true'), [settings]);

  const announcementItems = useMemo(() => {
    const customText = settings['appearance_announcement_text'];
    if (customText) {
      return customText.split(/[•|;]/).map(t => t.trim()).filter(Boolean);
    }
    return [
      '🚚 Envío gratis desde UYU $1.500',
      '🛡️ Sellers oficiales verificados',
      '🔁 Sincronización Mercado Libre',
      '💎 Club Collector: Sumá puntos'
    ];
  }, [settings]);

  // Dynamic nav links — re-computed when language changes
  const NAV_LINKS = useMemo(() => [
    { name: t('nav.home'), href: '/' },
    { name: t('nav.categories'), href: '/shop', hasMega: true, megaType: 'categories' },
    { name: t('nav.brands'), href: '/shop', hasMega: true, megaType: 'brands' },
    { name: t('nav.about'), href: '/about' },
    { name: t('nav.contact'), href: '/contact' },
    { name: t('nav.blog'), href: '/blog' },
  ], [t]);

  // Dynamic mega menu columns from DB categories (group by parent)
  // Top-level categories become columns, children become items
  const topLevel = useMemo(() => allCategories.filter(c => !c.parent_id), [allCategories]);
  
  const MEGA_MENU_COLUMNS = useMemo(() => topLevel.slice(0, 5).map(parent => ({
    title: parent.name,
    slug: parent.slug,
    items: allCategories
      .filter(c => c.parent_id === parent.id)
      .map(c => ({ name: c.name, href: `/shop?category=${c.slug}` }))
      // If no children, use parent itself as a link
      .concat(allCategories.filter(c => c.parent_id === parent.id).length === 0
        ? [{ name: `Ver todo: ${parent.name}`, href: `/shop?category=${parent.slug}` }]
        : []),
  })), [topLevel, allCategories]);

  // If all categories are flat (no parent_id hierarchy), split them into columns of ~4
  const FLAT_COLUMNS = useMemo(() => allCategories.length > 0 && topLevel.length === allCategories.length
    ? Array.from({ length: Math.ceil(allCategories.length / 4) }, (_, i) => ({
      title: '',
      slug: '',
      items: allCategories.slice(i * 4, (i + 1) * 4).map(c => ({ name: c.name, href: `/shop?category=${c.slug}` }))
    }))
    : null, [allCategories, topLevel]);

  const MENU_COLUMNS = FLAT_COLUMNS || MEGA_MENU_COLUMNS;
  const MOBILE_CATEGORIES = useMemo(() => allCategories.map(c => ({ name: c.name, href: `/shop?category=${c.slug}`, group: allCategories.find(p => p.id === c.parent_id)?.name || t('nav.categories') })), [allCategories, t]);

  const MEGA_MENU_BRANDS_COLUMNS = useMemo(() => allBrands.length > 0
    ? Array.from({ length: Math.ceil(allBrands.length / 5) }, (_, i) => ({
      title: '',
      slug: '',
      items: allBrands.slice(i * 5, (i + 1) * 5).map(b => ({ name: b.name, href: `/shop?brand=${b.slug}` }))
    }))
    : [], [allBrands]);

  // Inyector de Pixels/Head Code respetando privacidad
  useEffect(() => {
    if (!settingsLoaded) return;

    if (settings['appearance_head_code'] && localStorage.getItem('cookieSettings') === 'accepted') {
      const domNode = document.createElement('div');
      domNode.innerHTML = sanitizeHeadMarkup(settings['appearance_head_code']);

      Array.from(domNode.children).forEach((safeNode) => {
        const tag = safeNode.tagName.toLowerCase();

        if (tag === 'title') {
          document.title = safeNode.textContent || document.title;
          return;
        }

        if (tag === 'meta') {
          const name = safeNode.getAttribute('name');
          const property = safeNode.getAttribute('property');
          const selector = name
            ? `meta[name="${name}"]`
            : property
              ? `meta[property="${property}"]`
              : null;
          if (selector && document.head.querySelector(selector)) return;
        }

        if (tag === 'link') {
          const rel = safeNode.getAttribute('rel');
          const href = safeNode.getAttribute('href');
          if (rel && href && document.head.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
        }

        if (tag === 'script' && document.head.querySelector('script[type="application/ld+json"]')) return;
        document.head.appendChild(safeNode.cloneNode(true));
      });
    }
  }, [settingsLoaded, settings]);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMegaMenuState(null);
    setSearchOpen(false);
    setUserMenuOpen(false);
    
    // Capture affiliate code from URL if present
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref) localStorage.setItem('affiliate_code', ref);
  }, [location.pathname, location.search]);

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleMegaEnter = (type: string) => {
    if (megaMenuTimeout.current) clearTimeout(megaMenuTimeout.current);
    setMegaMenuState(type as any);
  };
  const handleMegaLeave = () => {
    megaMenuTimeout.current = setTimeout(() => setMegaMenuState(null), 200);
  };

  const handleSignOut = async () => {
    await signOut();
    setUserMenuOpen(false);
    navigate('/');
  };

  const runSearch = (term: string) => {
    const value = term.trim();
    setSearchOpen(false);
    if (!value) return;
    navigate(`/shop?q=${encodeURIComponent(value)}`);
  };

  // Build role-based menu items
  const roleMenuItems = [];
  if (profile?.is_admin) roleMenuItems.push({ name: 'Admin Panel', href: '/admin', icon: LayoutDashboard, color: 'text-blue-600' });
  if (profile?.is_vendor) roleMenuItems.push({ name: 'Vendor Hub', href: '/vendor', icon: Store, color: 'text-purple-600' });
  if (profile?.is_artist) roleMenuItems.push({ name: 'Artist Studio', href: '/artist', icon: Star, color: 'text-orange-600' });
  if (profile?.is_affiliate) roleMenuItems.push({ name: 'Affiliate Portal', href: '/affiliate', icon: Share2, color: 'text-pink-600' });
  // Currently Star2Fan is triggered by being an artist, or we can just always push if a specific flag exists, we use is_artist to group it, or just show it:
  if (profile?.is_artist) roleMenuItems.push({ name: 'Star2Fan Creator', href: '/star2fan', icon: Video, color: 'text-rose-600' });

  roleMenuItems.push({ name: 'Mis Pedidos', href: '/account', icon: Package, color: 'text-gray-600' });

  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col bg-[#05070f] text-[#f8fafc] gamger-grid">
      {settings['meta_pixel_id'] && localStorage.getItem('cookieSettings') === 'accepted' && (
        <Helmet>
          <script id="meta-pixel-script">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${settings['meta_pixel_id']}');
              fbq('track', 'PageView');
            `}
          </script>
        </Helmet>
      )}
      {settings['theme_color_primary'] && (
        <style dangerouslySetInnerHTML={{
          __html: `:root {
            ${Object.entries(generateTailwindPalette(settings['theme_color_primary']))
              .map(([level, hex]) => `--color-primary-${level}: ${hex};`)
              .join('\n')}
          }`
        }} />
      )}
      {/* ═══ ANNOUNCEMENT BAR ═══ */}
      {announcementVisible && (
        <div 
          className="text-white text-[10px] md:text-xs font-black uppercase tracking-[0.15em] h-10 flex items-center justify-center relative overflow-hidden"
          style={{
            backgroundColor: settings['appearance_announcement_bg'] || '#f00856',
            color: settings['appearance_announcement_color'] || '#ffffff'
          }}
        >
          <div 
            className={`max-w-7xl mx-auto px-6 flex items-center justify-center gap-8 ${settings['appearance_announcement_marquee'] !== 'false' ? 'animate-marquee-header' : ''} whitespace-nowrap`}
            style={settings['appearance_announcement_speed'] ? { animationDuration: `${settings['appearance_announcement_speed']}s` } : undefined}
          >
            {announcementItems.map((item, index) => (
              <React.Fragment key={index}>
                {index > 0 && <span className="hidden md:inline opacity-40">•</span>}
                <span>{item}</span>
              </React.Fragment>
            ))}
          </div>
          <button 
            onClick={() => setAnnouncementVisible(false)}
            className="absolute right-4 hover:scale-110 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <header 
        className={`sticky top-0 z-[100] transition-all duration-300 border-b border-white/10 ${
          location.pathname === '/' ? 'bg-[#05070f]/80 backdrop-blur-xl' : 'bg-[#05070f] shadow-lg shadow-black/40'
        }`}
      >
        <div className="max-w-[1500px] mx-auto px-6 w-full h-20 md:h-24 flex items-center justify-between gap-6">
          {/* LOGO */}
          <Link to="/" className="shrink-0 group">
            <img 
              src="/logo-horizontal.png" 
              alt="Collectibles" 
              className="h-10 md:h-12 object-contain transition-transform group-hover:scale-105" 
            />
          </Link>

          {/* MAIN NAV (DESKTOP) */}
          <nav className="hidden xl:flex items-center gap-8 text-xs font-black uppercase tracking-widest text-slate-400">
            {NAV_LINKS.map(link => (
              <div 
                key={link.name}
                className="relative h-full flex items-center"
                onMouseEnter={() => link.hasMega && setMegaMenuState(link.megaType as any)}
                onMouseLeave={() => setMegaMenuState(null)}
              >
                <Link 
                  to={link.href} 
                  className={`hover:text-white transition-colors flex items-center gap-1.5 ${location.pathname === link.href ? 'text-white' : ''}`}
                >
                  {link.name}
                  {link.hasMega && <ChevronDown className="w-3.5 h-3.5 opacity-50" />}
                </Link>

                <DesktopMegaMenu 
                   isVisible={megaMenuState === link.megaType && link.hasMega} 
                   megaType={link.megaType as 'categories' | 'brands'} 
                   menuColumns={MENU_COLUMNS} 
                   allBrands={allBrands} 
                   onClose={() => setMegaMenuState(null)} 
                />
              </div>
            ))}
          </nav>

          {/* SEARCH BOX (DESKTOP) */}
          <div className="hidden lg:flex flex-1 max-w-sm relative">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
             <input 
              type="text" 
              placeholder="Buscar figuras, sellers, drops..."
              className="w-full bg-white/5 border border-white/10 rounded-full pl-11 pr-5 py-3 text-sm font-medium focus:border-[#f00856] focus:ring-1 focus:ring-[#f00856] transition-all outline-none"
              onKeyDown={e => e.key === 'Enter' && navigate(`/shop?q=${(e.target as HTMLInputElement).value}`)}
             />
          </div>

          {/* ACTIONS */}
          <div className="flex items-center gap-3">
            <div className="hidden xl:block">
              <CurrencySelector />
            </div>
            <button className="w-11 h-11 hidden md:flex items-center justify-center rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <Heart className="w-4 h-4" />
            </button>
            <div className="relative" ref={userMenuRef}>
              <button 
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <User className="w-4 h-4" />
              </button>
              {userMenuOpen && (
                <div className="absolute top-full right-0 mt-4 w-64 glass rounded-[2rem] p-4 shadow-2xl z-50 animate-fade-in border-white/10">
                   {user ? (
                     <div className="space-y-1">
                        <div className="px-4 py-3 mb-2 border-b border-white/10">
                           <div className="text-xs font-black text-[#f00856] uppercase tracking-widest">Collector</div>
                           <div className="text-sm font-black text-white truncate">{profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user.email}</div>
                        </div>
                        <Link to="/profile" className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/5 text-sm font-bold text-slate-300">
                           <Package className="w-4 h-4" /> Mis pedidos
                        </Link>
                        {profile?.is_admin && (
                          <Link to="/admin" className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/5 text-sm font-bold text-slate-300">
                             <LayoutDashboard className="w-4 h-4" /> Panel Admin
                          </Link>
                        )}
                        <button onClick={() => handleSignOut()} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-500/10 text-sm font-bold text-red-500">
                           <LogOut className="w-4 h-4" /> Cerrar sesión
                        </button>
                     </div>
                   ) : (
                     <div className="p-2 space-y-2">
                        <Link to="/login" className="btn-primary w-full py-3 rounded-2xl flex items-center justify-center gap-2">
                           <LogIn className="w-4 h-4" /> Iniciar Sesión
                        </Link>
                        <Link to="/login?signup=true" className="btn-secondary w-full py-3 rounded-2xl flex items-center justify-center gap-2">
                           Crear Cuenta
                        </Link>
                     </div>
                   )}
                </div>
              )}
            </div>
            <Link 
              to="/cart" 
              className="w-11 h-11 flex items-center justify-center rounded-full bg-[#f00856] text-white shadow-lg shadow-[#f00856]/30 relative group transition-transform hover:scale-105 active:scale-95"
            >
              <ShoppingCart className="w-4 h-4" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-[#f00856] text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-pulse">
                  {cartCount}
                </span>
              )}
            </Link>
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="xl:hidden w-11 h-11 flex items-center justify-center rounded-full bg-white/5 border border-white/10"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      {/* MOBILE MENU DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[200] xl:hidden">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
           <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-[#05070f] p-8 flex flex-col animate-slide-right">
              <div className="flex items-center justify-between mb-10">
                 <img src="/logo-horizontal.png" alt="Collectibles" className="h-8 object-contain" />
                 <button onClick={() => setMobileMenuOpen(false)}><X className="w-6 h-6 text-white" /></button>
              </div>
              
              <div className="mb-6">
                 <CurrencySelector />
              </div>
              
              <nav className="flex flex-col gap-4 overflow-y-auto flex-1 no-scrollbar">
                 {NAV_LINKS.map(link => (
                   <Link 
                    key={link.name} 
                    to={link.href} 
                    className="text-2xl font-black text-white hover:text-[#f00856] transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                   >
                    {link.name}
                   </Link>
                 ))}
                 <div className="mt-8 pt-8 border-t border-white/10">
                    <div className="text-[10px] text-[#f00856] font-black uppercase tracking-[0.2em] mb-4">Soporte y contacto</div>
                    <Link to="/centro-ayuda" className="flex items-center gap-3 text-slate-400 font-bold mb-4" onClick={() => setMobileMenuOpen(false)}>Centro de ayuda</Link>
                    <Link to="/contact" className="flex items-center gap-3 text-slate-400 font-bold" onClick={() => setMobileMenuOpen(false)}>Contactanos</Link>
                 </div>
              </nav>

              {activeSocials.length > 0 && (
                <div className="mt-auto pt-8 border-t border-white/10">
                   <div className="flex items-center gap-4">
                      {activeSocials.map(social => {
                        const Icon = social.Icon;
                        const url = getSocialUrl(social.key, settings[`social_${social.key}_url`] || '');
                        return (
                          <a 
                            key={social.key} 
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-[#f00856] transition-all"
                          >
                            <Icon />
                          </a>
                        );
                      })}
                   </div>
                </div>
              )}
           </div>
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-grow">
        <Outlet />
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/10 bg-black/40 pt-24 pb-12 relative overflow-hidden">
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#f00856]/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-[1500px] mx-auto px-6 grid md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-10 relative z-10">
          {/* BRAND */}
          <div className="lg:col-span-2 space-y-6">
             <Link to="/">
                <img src="/logo-horizontal.png" alt="Collectibles" className="h-10 object-contain" />
             </Link>
             <p className="text-slate-400 font-medium leading-relaxed max-w-sm">
               Figuras que cuentan historias. Tu tienda premium de coleccionables, figuras y productos oficiales.
             </p>
             {activeSocials.length > 0 && (
               <div className="flex items-center gap-3">
                  {activeSocials.map(social => {
                    const Icon = social.Icon;
                    const url = getSocialUrl(social.key, settings[`social_${social.key}_url`] || '');
                    return (
                      <a 
                        key={social.key} 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#f00856] hover:border-[#f00856] transition-all hover:-translate-y-1 text-white"
                      >
                        <Icon />
                      </a>
                    );
                  })}
               </div>
             )}
             <div className="text-xs font-bold text-slate-500 pt-4">
               {settings['appearance_footer_text'] || '© 2026 Collectibles. Todos los derechos reservados.'}
             </div>
          </div>

          {/* NAVEGACIÓN */}
          <div>
             <h4 className="text-white font-black uppercase text-[11px] tracking-[0.2em] mb-6">Navegación</h4>
             <ul className="space-y-3">
                {[
                  { label: 'Catálogo completo', href: '/shop' },
                  { label: 'Novedades', href: '/shop?badge=new' },
                  { label: 'Sobre nosotros', href: '/about' },
                  { label: 'Blog', href: '/blog' },
                  { label: 'Contacto', href: '/contact' },
                ].map(link => (
                  <li key={link.label}>
                    <Link to={link.href} className="text-slate-400 font-bold hover:text-[#f00856] transition-colors text-sm">{link.label}</Link>
                  </li>
                ))}
             </ul>
          </div>

          {/* AYUDA */}
          <div>
             <h4 className="text-white font-black uppercase text-[11px] tracking-[0.2em] mb-6">Ayuda</h4>
             <ul className="space-y-3">
                {[
                  { label: 'Condiciones de Compra', href: '/page/condiciones-de-compra' },
                  { label: 'Políticas de Privacidad', href: '/page/pol-ticas-de-privacidad' },
                  { label: 'Envios/Devoluciones', href: '/page/envios-devoluciones' },
                  { label: 'Términos y condiciones', href: '/page/terminos' },
                ].map(link => (
                  <li key={link.label}>
                    <Link to={link.href} className="text-slate-400 font-bold hover:text-[#f00856] transition-colors text-sm">{link.label}</Link>
                  </li>
                ))}
             </ul>
          </div>

          {/* CONTACTO */}
          <div>
             <h4 className="text-white font-black uppercase text-[11px] tracking-[0.2em] mb-6">Contacto</h4>
             <div className="space-y-4 text-sm font-bold text-slate-400">
                <div className="flex items-start gap-3">
                   <MapPin className="w-4 h-4 text-[#f00856] shrink-0 mt-0.5" />
                   <span>Vázquez 1418, Montevideo, Uruguay.</span>
                </div>
                <div className="flex items-center gap-3">
                   <Phone className="w-4 h-4 text-[#f00856] shrink-0" />
                   <span>+598 9000 0000</span>
                </div>
                <div className="flex items-center gap-3">
                   <Mail className="w-4 h-4 text-[#f00856] shrink-0" />
                   <span>soporte@collectibles.com.uy</span>
                </div>
             </div>
             <div className="mt-6 pt-6 border-t border-white/5">
                <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Horarios</div>
                <div className="text-xs text-slate-400 mt-1">Lun a Vie 12:00–19:00 | Sáb 10:00–14:00</div>
             </div>
          </div>
        </div>
      </footer>

      <WhatsAppFAB />
      <CookieConsent />

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee-header {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee-header {
          animation: marquee-header 30s linear infinite;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        @keyframes slide-right {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-right {
          animation: slide-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
    </div>
  );
}


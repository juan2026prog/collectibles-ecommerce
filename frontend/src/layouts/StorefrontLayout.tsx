import { useState, useRef, useEffect, useMemo, Suspense } from 'react';
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
import CartDrawer from '../components/CartDrawer';
import { generateTailwindPalette } from '../lib/colorUtils';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { STORE_ISOLOGO_URL } from '../lib/brand';
import { sanitizeHeadMarkup, sanitizeRichHtml } from '../lib/sanitize';
import { FacebookIcon, InstagramIcon, TwitterIcon, YoutubeIcon, TiktokIcon, WhatsappIcon } from '../components/SocialIcons';
import { CurrencySelector } from '../components/CurrencySelector';
import React from 'react';
import { useMetaPageTracking } from '../hooks/useMetaPageTracking';

// NAV_LINKS and MEGA_MENU are built dynamically inside the component
// using t() for translations and useCategories() for live DB data.

const DesktopDropdownMenu = React.memo(({ items }: { items: Array<{ label: string; url: string }> }) => {
  if (items.length === 0) return null;
  return (
    <div className="absolute top-full left-0 w-64 pt-0 pointer-events-none group-hover:pointer-events-auto z-[110] opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 ease-out">
      <div className="bg-[#05070f] border-l border-r border-b border-white/10 rounded-b-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col py-2 max-h-[400px] overflow-y-auto no-scrollbar">
        {items.map((item) => (
          <Link
            key={item.label + item.url}
            to={item.url}
            className="px-5 py-2.5 text-slate-400 hover:text-[#f00856] hover:bg-[#f00856]/5 flex items-center transition-all duration-150 text-[11px] font-black tracking-widest border-l-2 border-transparent hover:border-[#f00856]"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
});

export default function StorefrontLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [announcementVisible, setAnnouncementVisible] = useState(true);
  const [expandedMobileGroup, setExpandedMobileGroup] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { count: cartCount, setIsDrawerOpen } = useCartContext();
  const { user, profile, signOut } = useAuth();
  const { language, currency, t, formatPrice } = useLocale();
  const { categories: allCategories } = useCategories();
  const { brands: allBrands } = useBrands();
  const { settings, loaded: settingsLoaded } = useSiteSettings();
  
  useMetaPageTracking();

  const getSocialUrl = (key: string, value: string) => {
    if (!value) return '#';
    const trimmed = value.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (key === 'whatsapp') {
      if (trimmed.includes('wa.me') || trimmed.includes('whatsapp.com')) {
        return `https://${trimmed.replace(/^(https?:\/\/)?/, '')}`;
      }
      const cleanNumber = trimmed.replace(/[\s\-\(\)\+]/g, '');
      return `https://wa.me/${cleanNumber}`;
    }
    const prefixMap: Record<string, string> = {
      instagram: 'instagram.com/',
      facebook: 'facebook.com/',
      tiktok: 'tiktok.com/@',
      youtube: 'youtube.com/c/',
      x: 'x.com/'
    };
    return `https://${prefixMap[key] || ''}${trimmed}`;
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

  // Dynamic nav links — re-computed when language changes or settings update
  const NAV_LINKS = useMemo(() => {
    const customMenuStr = settings['appearance_menu_json'];
    if (customMenuStr) {
      try {
        const parsed = JSON.parse(customMenuStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => {
            const hasMega = item.url === '/shop' || item.url.includes('/shop');
            let megaType: 'categories' | 'brands' | undefined = undefined;
            if (hasMega) {
              if (item.label.toLowerCase().includes('marca') || item.url.includes('brand')) {
                megaType = 'brands';
              } else {
                megaType = 'categories';
              }
            }
            return {
              name: item.label,
              href: item.url,
              hasMega: !!megaType,
              megaType,
              subItems: item.subItems || []
            };
          });
        }
      } catch (e) {
        console.error('Error parsing appearance_menu_json:', e);
      }
    }

    return [
      { name: settings['header_menu_home'] || t('nav.home'), href: '/' },
      { name: settings['header_menu_categories'] || t('nav.categories'), href: '/shop', hasMega: true, megaType: 'categories' },
      { name: settings['header_menu_brands'] || t('nav.brands'), href: '/shop', hasMega: true, megaType: 'brands' },
      { name: settings['header_menu_about'] || t('nav.about'), href: '/page/nosotros' },
      { name: settings['header_menu_contact'] || t('nav.contact'), href: '/contact' },
    ];
  }, [t, settings]);

  const FOOTER_LINKS = useMemo(() => {
    const customFooterStr = settings['appearance_footer_menu_json'];
    if (customFooterStr) {
      try {
        const parsed = JSON.parse(customFooterStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => ({
            label: item.label,
            href: item.url
          }));
        }
      } catch (e) {
        console.error('Error parsing appearance_footer_menu_json:', e);
      }
    }

    return [
      { label: 'Condiciones de Compra', href: '/page/condiciones-de-compra' },
      { label: 'Políticas de Privacidad', href: '/page/pol-ticas-de-privacidad' },
      { label: 'Envios/Devoluciones', href: '/page/envios-devoluciones' },
      { label: 'Términos y condiciones', href: '/page/terminos' },
    ];
  }, [settings]);



  const topLevel = useMemo(() => allCategories.filter(c => !c.parent_id), [allCategories]);

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
            className={`max-w-7xl mx-auto px-6 flex items-center justify-center gap-8 ${settings['appearance_announcement_marquee'] !== 'false' ? 'animate-marquee-header whitespace-nowrap' : 'flex-wrap'}`}
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
          <nav className="hidden xl:flex items-center h-full gap-8 text-xs font-black uppercase tracking-widest text-slate-400">
            {NAV_LINKS.map(link => (
              <div 
                key={link.name}
                className="relative h-full flex items-center group"
              >
                <Link 
                  to={link.href} 
                  className={`hover:text-white transition-colors flex items-center gap-1.5 ${location.pathname === link.href ? 'text-white' : ''}`}
                >
                  {link.name}
                  {(link.hasMega || (link.subItems && link.subItems.length > 0)) && <ChevronDown className="w-3.5 h-3.5 opacity-50 transition-transform group-hover:rotate-180" />}
                </Link>

                {(link.hasMega || (link.subItems && link.subItems.length > 0)) && (
                  <DesktopDropdownMenu 
                    items={
                      link.hasMega && link.megaType === 'categories'
                        ? topLevel.map(c => ({ label: c.name, url: `/categoria/${c.slug}` }))
                        : link.hasMega && link.megaType === 'brands'
                          ? allBrands.slice(0, 15).map(b => ({ label: b.name, url: `/marca/${b.slug}` }))
                          : link.subItems || []
                    }
                  />
                )}
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
                <div className="absolute top-full right-0 mt-4 w-64 bg-[#0e1525] rounded-[2rem] p-4 shadow-2xl z-50 animate-fade-in border border-white/10">
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
            <button 
              onClick={() => setIsDrawerOpen(true)}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-[#f00856] text-white shadow-lg shadow-[#f00856]/30 relative group transition-transform hover:scale-105 active:scale-95"
              title="Ver Carrito"
            >
              <ShoppingCart className="w-4 h-4" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-[#f00856] text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-pulse">
                  {cartCount}
                </span>
              )}
            </button>
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
              
              <div className="mb-6 flex flex-col gap-4">
                 <CurrencySelector />
                 
                 {/* Mobile Menu Search */}
                 <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Buscar figuras, brands, drops..."
                      className="w-full bg-white/5 border border-white/10 rounded-full pl-11 pr-5 py-2.5 text-sm font-medium focus:border-[#f00856] focus:ring-1 focus:ring-[#f00856] transition-all outline-none text-white"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          runSearch(searchQuery);
                        }
                      }}
                    />
                 </div>
              </div>

              {/* Mobile Menu User Status */}
              <div className="mb-6 border-b border-white/5 pb-6">
                {user ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#f00856] flex items-center justify-center font-black text-white text-sm shadow-md shrink-0">
                        {profile?.first_name ? profile.first_name[0].toUpperCase() : user.email?.[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-black text-[#f00856] uppercase tracking-wider">Collector</div>
                        <div className="text-xs font-black text-white truncate">
                          {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user.email}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Link 
                        to="/account" 
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase text-slate-300 hover:text-white transition-colors"
                      >
                        <Package className="w-3.5 h-3.5" /> Mis Pedidos
                      </Link>
                      {profile?.is_admin && (
                        <Link 
                          to="/admin" 
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase text-slate-300 hover:text-white transition-colors"
                        >
                          <LayoutDashboard className="w-3.5 h-3.5" /> Admin
                        </Link>
                      )}
                      <button 
                        onClick={() => { handleSignOut(); setMobileMenuOpen(false); }}
                        className="col-span-2 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-[10px] font-black uppercase text-red-500 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link 
                      to="/login" 
                      onClick={() => setMobileMenuOpen(false)}
                      className="btn-primary py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider"
                    >
                      <LogIn className="w-4 h-4" /> Iniciar Sesión
                    </Link>
                    <Link 
                      to="/login?signup=true" 
                      onClick={() => setMobileMenuOpen(false)}
                      className="btn-secondary py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider"
                    >
                      Crear Cuenta
                    </Link>
                  </div>
                )}
              </div>
              
              <nav className="flex flex-col gap-4 overflow-y-auto flex-1 no-scrollbar">
                {NAV_LINKS.map(link => (
                  <div key={link.name} className="flex flex-col gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <Link 
                       to={link.href} 
                       className="text-2xl font-black text-white hover:text-[#f00856] transition-colors flex-grow py-1"
                       onClick={() => setMobileMenuOpen(false)}
                      >
                       {link.name}
                      </Link>
                      {((link.subItems && link.subItems.length > 0) || link.hasMega) && (
                        <button 
                          onClick={() => setExpandedMobileGroup(expandedMobileGroup === link.name ? null : link.name)}
                          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all hover:scale-105 active:scale-95 ml-2"
                        >
                          <ChevronDown 
                            className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${
                              expandedMobileGroup === link.name ? 'rotate-180 text-white' : ''
                            }`} 
                          />
                        </button>
                      )}
                    </div>
                    {((link.subItems && link.subItems.length > 0) || link.hasMega) && expandedMobileGroup === link.name && (
                      <div className="pl-4 border-l border-[#f00856]/40 flex flex-col gap-3.5 mt-2 mb-2 animate-fade-in">
                        {link.subItems && link.subItems.map((sub: any) => (
                          <Link 
                            key={sub.label} 
                            to={sub.url} 
                            className="text-lg font-bold text-slate-400 hover:text-white transition-colors py-0.5"
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            {sub.label}
                          </Link>
                        ))}
                        {link.hasMega && link.megaType === 'categories' && topLevel.map((cat: any) => (
                          <Link 
                            key={cat.id} 
                            to={`/categoria/${cat.slug}`} 
                            className="text-lg font-bold text-slate-400 hover:text-white transition-colors py-0.5"
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            {cat.name}
                          </Link>
                        ))}
                        {link.hasMega && link.megaType === 'brands' && allBrands.slice(0, 8).map((b: any) => (
                          <Link 
                            key={b.id} 
                            to={`/marca/${b.slug}`} 
                            className="text-lg font-bold text-slate-400 hover:text-white transition-colors py-0.5"
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            {b.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
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
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
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
                  { label: 'Sobre nosotros', href: '/page/nosotros' },
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
                {FOOTER_LINKS.map(link => (
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
                   <span>+598 96 889 596</span>
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
      <CartDrawer />

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


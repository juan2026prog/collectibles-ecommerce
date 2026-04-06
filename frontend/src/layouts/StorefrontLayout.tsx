import { useState, useRef, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
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

/* Inline social SVG icons (lucide-react doesn't export brand icons) */
const FacebookIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
);
const InstagramIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
);
const TwitterIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
);
const YoutubeIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
);
const TiktokIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" /></svg>
);
const WhatsappIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.482-1.761-1.655-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a5.8 5.8 0 0 0-.571-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>
);


// NAV_LINKS and MEGA_MENU are built dynamically inside the component
// using t() for translations and useCategories() for live DB data.


export default function StorefrontLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [megaMenuState, setMegaMenuState] = useState<'categories' | 'brands' | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
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
  const [settings, setSettings] = useState<Record<string, string>>({});

  // Dynamic nav links — re-computed when language changes
  const NAV_LINKS = [
    { name: t('nav.home'), href: '/' },
    { name: t('nav.categories'), href: '/shop', hasMega: true, megaType: 'categories' },
    { name: t('nav.brands'), href: '/shop', hasMega: true, megaType: 'brands' },
    { name: t('nav.about'), href: '/about' },
    { name: t('nav.contact'), href: '/contact' },
    { name: t('nav.blog'), href: '/blog' },
  ];

  // Dynamic mega menu columns from DB categories (group by parent)
  // Top-level categories become columns, children become items
  const topLevel = allCategories.filter(c => !c.parent_id);
  const MEGA_MENU_COLUMNS = topLevel.slice(0, 5).map(parent => ({
    title: parent.name,
    slug: parent.slug,
    items: allCategories
      .filter(c => c.parent_id === parent.id)
      .map(c => ({ name: c.name, href: `/shop?category=${c.slug}` }))
      // If no children, use parent itself as a link
      .concat(allCategories.filter(c => c.parent_id === parent.id).length === 0
        ? [{ name: `Ver todo: ${parent.name}`, href: `/shop?category=${parent.slug}` }]
        : []),
  }));

  // If all categories are flat (no parent_id hierarchy), split them into columns of ~4
  const FLAT_COLUMNS = allCategories.length > 0 && topLevel.length === allCategories.length
    ? Array.from({ length: Math.ceil(allCategories.length / 4) }, (_, i) => ({
      title: '',
      slug: '',
      items: allCategories.slice(i * 4, (i + 1) * 4).map(c => ({ name: c.name, href: `/shop?category=${c.slug}` }))
    }))
    : null;

  const MENU_COLUMNS = FLAT_COLUMNS || MEGA_MENU_COLUMNS;
  const MOBILE_CATEGORIES = allCategories.map(c => ({ name: c.name, href: `/shop?category=${c.slug}`, group: allCategories.find(p => p.id === c.parent_id)?.name || t('nav.categories') }));

  const MEGA_MENU_BRANDS_COLUMNS = allBrands.length > 0
    ? Array.from({ length: Math.ceil(allBrands.length / 5) }, (_, i) => ({
      title: '',
      slug: '',
      items: allBrands.slice(i * 5, (i + 1) * 5).map(b => ({ name: b.name, href: `/shop?brand=${b.slug}` }))
    }))
    : [];

  useEffect(() => {
    supabase.from('site_settings').select('*').then(({ data }) => {
      const s: Record<string, string> = {};
      data?.forEach(d => s[d.key] = d.value);
      setSettings(s);

      // Inyector de Pixels/Head Code respetando privacidad
      if (s['appearance_head_code'] && localStorage.getItem('cookieSettings') === 'accepted') {
        const domNode = document.createElement('div');
        domNode.innerHTML = s['appearance_head_code'];
        const scripts = Array.from(domNode.querySelectorAll('script'));
        scripts.forEach(oldScript => {
          // Prevent duplicate injections on re-renders natively
          if (document.head.querySelector(`script[src="${oldScript.src}"]`)) return;
          const newScript = document.createElement('script');
          Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
          newScript.text = oldScript.text;
          document.head.appendChild(newScript);
        });
      }

      // Meta Pixel Base
      if (s['meta_pixel_id'] && localStorage.getItem('cookieSettings') === 'accepted') {
        if (!document.getElementById('meta-pixel-script')) {
          const newScript = document.createElement('script');
          newScript.id = 'meta-pixel-script';
          newScript.text = `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${s['meta_pixel_id']}');
            fbq('track', 'PageView');
          `;
          document.head.appendChild(newScript);
        }
      }
    });
  }, []);

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
    <div className={`min-h-screen flex flex-col ${isHome ? 'bg-dark-700 gamger-grid' : 'bg-white'}`}>
      {settings['theme_color_primary'] && (
        <style dangerouslySetInnerHTML={{
          __html: `:root {
            ${Object.entries(generateTailwindPalette(settings['theme_color_primary']))
              .map(([level, hex]) => `--color-primary-${level}: ${hex};`)
              .join('\n')}
          }`
        }} />
      )}
      {/* ═══════════ ANNOUNCEMENT BAR ═══════════ */}
      {announcementVisible && settings['appearance_announcement_text'] && (
        <div style={{ backgroundColor: settings['appearance_announcement_bg'] || '#000000', color: settings['appearance_announcement_color'] || '#ffffff' }} className="relative z-50 overflow-hidden h-9 flex items-center">
          <div className={settings['appearance_announcement_marquee'] !== 'false' ? 'marquee-track' : 'w-full text-center'} style={settings['appearance_announcement_marquee'] !== 'false' ? { animationDuration: `${settings['appearance_announcement_speed'] || 20}s` } : {}}>
            {[...Array(settings['appearance_announcement_marquee'] !== 'false' ? 8 : 1)].map((_, i) => (
              <span key={i} className={`flex items-center justify-center whitespace-nowrap px-8 text-xs sm:text-sm font-bold uppercase tracking-wider ${settings['appearance_announcement_marquee'] === 'false' ? 'w-full' : ''}`}>
                <span className="mx-3 opacity-70">✦</span>
                {settings['appearance_announcement_text']}
              </span>
            ))}
          </div>
          <button
            onClick={() => setAnnouncementVisible(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-black/10 rounded-full transition-colors z-10"
            aria-label="Close announcement"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══════════ TOP INFO BAR (LOCALE/CURRENCY) ═══════════ */}
      <div className="bg-dark-800/80 border-b border-white/5 hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-between text-xs font-semibold text-gray-500">
          <div className="flex gap-4">
            <span>Envío gratis desde $4000 (UYU)</span>
            <span className="opacity-40">|</span>
            <Link to="/contact" className="hover:text-neon-cyan transition-colors">Soporte 24/7</Link>
          </div>
          <div className="flex items-center gap-4">
            <LocaleSwitcher compact />
          </div>
        </div>
      </div>

      {/* ═══════════ MAIN HEADER ═══════════ */}
      <header className="bg-dark-700/90 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40 shadow-dark-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-[72px]">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 text-gray-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              {settings['appearance_logo'] ? (
                <img src={settings['appearance_logo']} alt={settings['store_name'] || 'Store Logo'} className="h-8 sm:h-10 object-contain" />
              ) : (
                <>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-lg sm:text-xl">✦</span>
                  </div>
                  <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight hidden sm:block">
                    {settings['store_name'] || 'COLLECTIBLES'}
                  </span>
                </>
              )}
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <div
                  key={link.name}
                  className="relative"
                  onMouseEnter={link.hasMega ? () => handleMegaEnter(link.megaType!) : undefined}
                  onMouseLeave={link.hasMega ? handleMegaLeave : undefined}
                >
                  <Link
                    to={link.href}
                    className={`flex items-center gap-1 px-4 py-2 text-sm font-bold tracking-wide transition-all rounded-lg hover:text-neon-cyan hover:bg-white/5 ${location.pathname === link.href ? 'text-neon-cyan' : 'text-gray-300'
                      }`}
                  >
                    {link.name}
                    {link.hasMega && <ChevronDown className="w-3.5 h-3.5" />}
                  </Link>
                </div>
              ))}
            </nav>

            {/* Utility Icons */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2.5 text-gray-400 hover:text-neon-cyan rounded-full hover:bg-white/10 transition-colors"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>


              {user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="hidden sm:flex items-center gap-1.5 p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                    aria-label="Account menu"
                  >
                    <div className="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">
                      {profile?.first_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* User Dropdown */}
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-surface-card rounded-xl shadow-dark-lg border border-white/10 py-2 z-50 animate-slide-down">
                      <div className="px-4 py-3 border-b border-white/10">
                        <p className="text-sm font-bold text-white truncate">{profile?.email}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {profile?.is_admin && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Admin</span>}
                          {profile?.is_vendor && <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Vendor</span>}
                          {profile?.is_artist && <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Artist</span>}
                          {profile?.is_affiliate && <span className="text-[10px] font-bold bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded">Affiliate</span>}
                        </div>
                      </div>
                      <div className="py-1">
                        {roleMenuItems.map(item => {
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.href}
                              to={item.href}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                              <Icon className={`w-4 h-4 ${item.color}`} />
                              {item.name}
                            </Link>
                          );
                        })}
                      </div>
                      <div className="border-t border-white/10 pt-1">
                        <button
                          onClick={handleSignOut}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Cerrar Sesión
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="hidden sm:flex p-2.5 text-gray-400 hover:text-neon-cyan rounded-full hover:bg-white/10 transition-colors"
                  aria-label="Log in"
                >
                  <LogIn className="h-5 w-5" />
                </Link>
              )}
              <Link
                to="/cart"
                className="p-2.5 text-gray-400 hover:text-neon-cyan rounded-full hover:bg-white/10 transition-colors relative"
                aria-label="Cart"
              >
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>

        {/* ═══════════ MEGA MENU DROPDOWN ═══════════ */}
        {megaMenuState && (
          <div
            className="absolute left-0 right-0 bg-dark-700/95 backdrop-blur-xl border-t border-white/5 shadow-dark-lg animate-slide-down z-50"
            onMouseEnter={() => handleMegaEnter(megaMenuState)}
            onMouseLeave={handleMegaLeave}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {megaMenuState === 'brands' ? (
                <div className={`grid gap-8`} style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(MEGA_MENU_BRANDS_COLUMNS.length, 1), 5)}, 1fr)` }}>
                  {MEGA_MENU_BRANDS_COLUMNS.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4">No hay marcas disponibles</div>
                  ) : (
                    MEGA_MENU_BRANDS_COLUMNS.map((col, idx) => (
                      <div key={idx}>
                        <ul className="space-y-2.5 mt-2">
                          {col.items.map((item) => (
                            <li key={item.name}>
                              <Link to={item.href} className="text-sm text-gray-400 hover:text-neon-cyan font-medium transition-colors flex items-center gap-2 group">
                                <ChevronRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-neon-cyan" />
                                {item.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className={`grid gap-8`} style={{ gridTemplateColumns: `repeat(${Math.min(MENU_COLUMNS.length + 1, 5)}, 1fr)` }}>
                  {MENU_COLUMNS.map((col, idx) => (
                    <div key={col.title || idx}>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
                        {col.title}
                      </h3>
                      <ul className="space-y-2.5">
                        {col.items.map((item) => (
                          <li key={item.name}>
                            <Link
                              to={item.href}
                              className="text-sm text-gray-400 hover:text-neon-cyan font-medium transition-colors flex items-center gap-2 group"
                            >
                              <ChevronRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary-500" />
                              {item.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {/* Promo Banner in Mega Menu */}
                  <div className="bg-gradient-to-br from-primary-900/40 to-primary-600/20 rounded-xl p-6 flex flex-col justify-between border border-primary-500/20">
                    <div>
                      <span className="badge badge-new mb-3">NEW</span>
                      <h4 className="text-lg font-bold text-white mt-2">New Arrivals</h4>
                      <p className="text-sm text-gray-400 mt-1">Check out the latest drops this week</p>
                    </div>
                    <Link to="/shop?sort=newest" className="text-sm font-bold text-primary-600 hover:text-primary-700 mt-4 inline-flex items-center gap-1">
                      Shop Now <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ═══════════ SEARCH OVERLAY ═══════════ */}
      {searchOpen && (
        <>
          <div className="overlay-backdrop" onClick={() => setSearchOpen(false)} />
          <div className="fixed top-0 left-0 right-0 bg-dark-700/95 backdrop-blur-xl z-50 shadow-dark-lg animate-slide-down p-4 sm:p-6 border-b border-white/5">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-4">
                <Search className="w-6 h-6 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search products, categories, brands..."
                  className="flex-1 text-lg sm:text-xl font-medium outline-none placeholder:text-gray-500 bg-transparent text-white"
                  autoFocus
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="mt-6 pb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Popular Searches</p>
                <div className="flex flex-wrap gap-2">
                  {['Funko POP', 'Figuras de acción', 'Peluches', 'TCG', 'Beyblades'].map(term => (
                    <Link key={term} to={`/shop?q=${term}`} onClick={() => setSearchOpen(false)} className="px-4 py-2 bg-white/5 hover:bg-primary-600/20 hover:text-primary-400 border border-white/10 rounded-full text-sm font-medium text-gray-300 transition-colors">
                      {term}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ MOBILE MENU ═══════════ */}
      {mobileMenuOpen && (
        <>
          <div className="overlay-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-[85%] max-w-sm bg-dark-700 z-50 animate-slide-in-left shadow-dark-lg flex flex-col border-r border-white/5">
            {/* Mobile menu header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <Link to="/" className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                {settings['appearance_logo'] ? (
                  <img src={settings['appearance_logo']} alt={settings['store_name'] || 'Store Logo'} className="h-8 object-contain" />
                ) : (
                  <>
                    <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-lg">✦</span>
                    </div>
                    <span className="text-lg font-extrabold text-white">{settings['store_name'] || 'COLLECTIBLES'}</span>
                  </>
                )}
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile search */}
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center gap-3 bg-white/5 rounded-lg px-4 py-2.5">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500 text-white"
                />
              </div>
            </div>

            {/* Mobile nav links */}
            <nav className="flex-1 overflow-y-auto py-2">
              {NAV_LINKS.map((link) => (
                <div key={link.name}>
                  {link.hasMega ? (
                    <>
                      <button
                        onClick={() => setExpandedMobileGroup(expandedMobileGroup === link.name ? null : link.name)}
                        className="flex items-center justify-between w-full px-6 py-3.5 text-base font-semibold text-gray-200 hover:bg-white/5 transition-colors"
                      >
                        {link.name}
                        <ChevronDown className={`w-4 h-4 transition-transform ${expandedMobileGroup === link.name ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedMobileGroup === link.name && (
                        <div className="bg-white/5 animate-slide-down">
                          {(link.megaType === 'brands' ? MEGA_MENU_BRANDS_COLUMNS : MEGA_MENU_COLUMNS).map((col, idx) => (
                            <div key={col.title || idx} className="px-6 py-3">
                              {col.title && <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{col.title}</p>}
                              <ul className="space-y-2">
                                {col.items.map((item) => (
                                  <li key={item.name}>
                                    <Link
                                      to={item.href}
                                      onClick={() => setMobileMenuOpen(false)}
                                      className="block text-sm text-gray-400 hover:text-neon-cyan py-1"
                                    >
                                      {item.name}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-6 py-3.5 text-base font-semibold text-gray-200 hover:bg-white/5 transition-colors"
                    >
                      {link.name}
                    </Link>
                  )}
                </div>
              ))}
            </nav>

            {/* Mobile menu footer */}
            <div className="border-t border-white/10 p-4 space-y-3">
              {/* Locale / Currency switcher */}
              <div className="px-2 pb-2 border-b border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Idioma y Moneda</p>
                <LocaleSwitcher mode="language" className="mb-2" />
                <LocaleSwitcher mode="currency" />
              </div>
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-neon-cyan rounded-lg hover:bg-white/5">
                <User className="w-5 h-5" /> Login / Register
              </Link>
              <Link to="/wishlist" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-neon-cyan rounded-lg hover:bg-white/5">
                <Heart className="w-5 h-5" /> Wishlist
              </Link>
            </div>

          </div>
        </>
      )}

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main className="flex-grow w-full relative">
        <CookieConsent />
        <Outlet />
      </main>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="bg-dark-900 text-white">
        {/* Trust value props */}
        <div className="border-b border-gray-800">
          <div className="max-w-container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
              {[
                { icon: Truck, title: 'Free Shipping', desc: 'On orders over $40' },
                { icon: Shield, title: 'Secure Payment', desc: '256-bit encryption' },
                { icon: RotateCcw, title: 'Easy Returns', desc: '14-day return policy' },
                { icon: Headphones, title: '24/7 Support', desc: 'Dedicated help center' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex flex-col items-center gap-2">
                  <Icon className="w-7 h-7 text-primary-400" />
                  <h4 className="text-sm font-bold">{title}</h4>
                  <p className="text-xs text-gray-400">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer columns */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Brand */}
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
                {settings['appearance_logo'] ? (
                  <img src={settings['appearance_logo']} alt={settings['store_name'] || 'Store Logo'} className="h-8 sm:h-10 object-contain" />
                ) : (
                  <>
                    <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-lg">✦</span>
                    </div>
                    <span className="text-xl font-extrabold tracking-tight">{settings['store_name'] || 'COLLECTIBLES'}</span>
                  </>
                )}
              </Link>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                {settings['store_tagline'] || 'Your destination for the best collectibles, figures, toys, and more.'}
              </p>
              <div className="flex gap-3">
                {settings['social_instagram_enabled'] === 'true' && <a href={`https://instagram.com/${settings['social_instagram_url']}`} target="_blank" rel="noreferrer" className="p-2 bg-gray-800 hover:bg-primary-600 rounded-full transition-colors"><InstagramIcon /></a>}
                {settings['social_facebook_enabled'] === 'true' && <a href={`https://facebook.com/${settings['social_facebook_url']}`} target="_blank" rel="noreferrer" className="p-2 bg-gray-800 hover:bg-primary-600 rounded-full transition-colors"><FacebookIcon /></a>}
                {settings['social_x_enabled'] === 'true' && <a href={`https://x.com/${settings['social_x_url']}`} target="_blank" rel="noreferrer" className="p-2 bg-gray-800 hover:bg-primary-600 rounded-full transition-colors"><TwitterIcon /></a>}
                {settings['social_tiktok_enabled'] === 'true' && <a href={`https://tiktok.com/@${settings['social_tiktok_url']}`} target="_blank" rel="noreferrer" className="p-2 bg-gray-800 hover:bg-primary-600 rounded-full transition-colors"><TiktokIcon /></a>}
                {settings['social_whatsapp_enabled'] === 'true' && <a href={`https://wa.me/${settings['social_whatsapp_url']}`} target="_blank" rel="noreferrer" className="p-2 bg-gray-800 hover:bg-green-600 rounded-full transition-colors"><WhatsappIcon /></a>}
                {settings['social_youtube_enabled'] === 'true' && <a href={`https://youtube.com/c/${settings['social_youtube_url']}`} target="_blank" rel="noreferrer" className="p-2 bg-gray-800 hover:bg-red-600 rounded-full transition-colors"><YoutubeIcon /></a>}
              </div>
            </div>

            {/* Custom HTML / Map */}
            <div className="lg:col-span-2">
              {settings['appearance_footer_html'] ? (
                <div dangerouslySetInnerHTML={{ __html: settings['appearance_footer_html'] }} className="h-full w-full text-sm text-gray-400 prose prose-invert prose-sm max-w-none prose-a:text-primary-400" />
              ) : (
                <>
                  <h4 className="text-sm font-bold uppercase tracking-wider mb-4">Explore</h4>
                  <ul className="space-y-2.5">
                    {['New Arrivals', 'Best Sellers', 'Brands', 'All Products'].map(link => (
                      <li key={link}><Link to="/shop" className="text-sm text-gray-400 hover:text-primary-400 transition-colors">{link}</Link></li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Dynamic Details Menu */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider mb-4">Ayuda y Soporte</h4>
              <ul className="space-y-2.5">
                {settings['appearance_footer_menu_json'] ? (
                  (() => {
                    try {
                      return JSON.parse(settings['appearance_footer_menu_json']).map((item: any) => (
                        <li key={item.label}><Link to={item.url} className="text-sm text-gray-400 hover:text-primary-400 transition-colors">{item.label}</Link></li>
                      ));
                    } catch { return null; }
                  })()
                ) : (
                  <>
                    <li className="flex items-center gap-2 text-sm text-gray-400"><MapPin className="w-4 h-4 text-primary-400 flex-shrink-0" /> Montevideo, Uruguay</li>
                    <li className="flex items-center gap-2 text-sm text-gray-400"><Phone className="w-4 h-4 text-primary-400 flex-shrink-0" /> +598 123 456</li>
                    <li className="flex items-center gap-2 text-sm text-gray-400"><Mail className="w-4 h-4 text-primary-400 flex-shrink-0" /> info@collectibles.uy</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-2">
            <p className="text-xs text-gray-500">{settings['appearance_footer_text'] || '© 2026 Collectibles. All rights reserved.'}</p>
          </div>
        </div>
      </footer>

      {/* Global Storefront Overlays */}
      <WhatsAppFAB />
      <CookieConsent />
    </div>
  );
}

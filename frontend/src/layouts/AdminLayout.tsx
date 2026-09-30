import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingBag, FolderTree, Users, Settings, LogOut, Package, 
  Tag, Image, CreditCard, LayoutTemplate, Star, Percent, Megaphone,
  Mail, BarChart3, Search, ShieldCheck, Store, Share2, ExternalLink, Library, FileText,
  Globe, Download, RefreshCw, Award, Layers, KeyRound, Scale,
  Sparkles, Radio, Archive, GraduationCap, Sliders, Truck, MessageSquare, Brain, DollarSign
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LocaleSwitcher from '../components/LocaleSwitcher';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { STORE_ISOLOGO_URL } from '../lib/brand';
import { ToastProvider } from '../components/admin/Toast';
import { ConfirmModalProvider } from '../components/admin/ConfirmModal';
import AdminSearchGlobal from '../components/admin/AdminSearchGlobal';
import AdminBreadcrumbs from '../components/admin/AdminBreadcrumbs';
import { useFeatures } from '../contexts/FeatureToggleContext';
import MobileDrawer from '../components/admin/MobileDrawer';
import MobileHeader from '../components/admin/MobileHeader';

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, user, isSuperAdmin } = useAuth();
  const { settings, loaded: settingsLoaded } = useSiteSettings();
  const { features } = useFeatures();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const superAdminPaths = new Set(['/admin/ai-search', '/admin/radar', '/admin/compare', '/admin/vault', '/admin/academy', '/admin/import-hub', '/admin/settings?tab=modules']);
  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Biblioteca de Medios', path: '/admin/media', icon: Library },
    { name: 'Home / Banners', path: '/admin/banners', icon: Image },
    { name: 'Productos', path: '/admin/products', icon: Package },
    { name: 'Categorías', path: '/admin/categories', icon: FolderTree },
    { name: 'Licencias', path: '/admin/licenses', icon: Award },
    { name: 'Themes', path: '/admin/themes', icon: Layers },
    { name: 'Etiquetas', path: '/admin/tags', icon: Tag },
    { name: 'Páginas Estáticas', path: '/admin/pages', icon: FileText },
    { name: 'Marcas', path: '/admin/brands', icon: Star },
    { name: 'Grupos', path: '/admin/groups', icon: LayoutTemplate },
    { name: 'Cocardas', path: '/admin/badges', icon: ShieldCheck },
    { name: 'Promociones', path: '/admin/promotions', icon: Percent },
    { name: 'Cupones', path: '/admin/coupons', icon: Tag },
    ...(features.marketplaceEnabled ? [
      { name: 'Marketplace', path: '/admin/marketplace', icon: Store },
    ] : []),
    { name: 'Afiliados', path: '/admin/affiliates', icon: Megaphone },
    { name: 'Pedidos', path: '/admin/orders', icon: ShoppingBag },
    { name: 'Pasarelas de Pago', path: '/admin/settings?tab=payments', icon: CreditCard },
    { name: 'Configuracion', path: '/admin/settings', icon: Settings },
    { name: 'Módulos & Plugins', path: '/admin/settings?tab=modules', icon: Sliders },
    { name: 'Clientes & CRM', path: '/admin/customers', icon: Users },
    { name: 'Preguntas / Q&A', path: '/admin/questions', icon: MessageSquare },
    { name: 'Mailing', path: '/admin/mailing', icon: Mail },
    { name: 'Finanzas & Facturas', path: '/admin/finances', icon: CreditCard },
    { name: 'Reembolsos', path: '/admin/refunds', icon: RefreshCw },
    { name: 'Logistica & Envios', path: '/admin/logistics', icon: Package },
    { name: 'Artistas & Cameo', path: '/admin/artists', icon: Star },
    { name: 'Reportes', path: '/admin/reports', icon: BarChart3 },
    { name: 'SEO', path: '/admin/seo', icon: Search },
    { name: 'AI Search', path: '/admin/ai-search', icon: Sparkles },
    { name: 'Radar & Lanzamientos', path: '/admin/radar', icon: Radio },
    { name: 'Comparador', path: '/admin/compare', icon: Scale },
    { name: 'Collector Vault', path: '/admin/vault', icon: Archive },
    { name: 'Collector Academy', path: '/admin/academy', icon: GraduationCap },
    { name: 'Import Hub', path: '/admin/import-hub', icon: Truck },
    { name: 'Usuarios & Auditoria', path: '/admin/users', icon: ShieldCheck },
  ].filter(item => isSuperAdmin || !superAdminPaths.has(item.path));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleTriggerSearch = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  };

  const currentTitle = navItems.find(
    item => item.path === location.pathname || (location.pathname.startsWith(item.path) && item.path !== '/admin')
  )?.name || 'Admin';

  const renderNavContent = (closeOnClick = false) => (
    <>
      <nav className="flex-1 px-2.5 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (location.pathname.startsWith(item.path) && item.path !== '/admin');
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={() => closeOnClick && setMobileDrawerOpen(false)}
              className={`flex items-center px-3.5 py-2 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                isActive ? 'bg-[#f00856] text-white font-semibold shadow-sm' : 'hover:bg-dark-800 hover:text-white text-gray-300'
              }`}
            >
              <Icon className={`mr-2.5 h-[18px] w-[18px] shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}

        {/* Internacional — strategic controls are Super Admin only */}
        {isSuperAdmin && <div className="pt-3 pb-1 space-y-0.5">
          <p className="px-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Internacional</p>
          {[
            { name: 'Sourcing Intelligence', path: '/admin/sourcing', icon: Download },
            { name: 'Productos para Importar', path: '/admin/internacional/amazon', icon: Search },
            { name: 'Productos Internacionales', path: '/admin/internacional/productos', icon: Globe },
            { name: 'Configuración y Cupos', path: '/admin/internacional/sync', icon: Settings },
            { name: 'Mercados Internacionales', path: '/admin/international-markets', icon: Globe, iconColor: 'text-amber-400' },
            { name: 'Zinc API 2.0', path: '/admin/internacional/zinc', icon: KeyRound },
            { name: 'Monedas & FX', path: '/superadmin/currencies', icon: DollarSign, iconColor: 'text-emerald-400' },
            { name: 'AI Control Center', path: '/superadmin/ai', icon: Brain, iconColor: 'text-[#f00856]' },
          ].map(item => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => closeOnClick && setMobileDrawerOpen(false)}
                className={`flex items-center px-3.5 py-2 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                  isActive ? 'bg-[#f00856] text-white font-semibold shadow-sm' : 'hover:bg-dark-800 hover:text-white text-gray-300'
                }`}
              >
                <Icon className={`mr-2.5 h-[18px] w-[18px] shrink-0 ${isActive ? 'text-white' : item.iconColor || 'text-gray-400'}`} />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </div>}


        {/* Otros Portales */}
        <div className="pt-3 pb-1">
          <p className="px-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Otros Portales</p>
          {profile?.is_vendor && (
            <Link
              to="/vendor"
              onClick={() => closeOnClick && setMobileDrawerOpen(false)}
              className="flex items-center px-3.5 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-800 rounded-xl transition-colors min-h-[44px]"
            >
              <Store className="mr-2.5 h-[18px] w-[18px] shrink-0" /> Vendor Dashboard
            </Link>
          )}
          {profile?.is_artist && (
            <Link
              to="/artist"
              onClick={() => closeOnClick && setMobileDrawerOpen(false)}
              className="flex items-center px-3.5 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-800 rounded-xl transition-colors min-h-[44px]"
            >
              <Star className="mr-2.5 h-[18px] w-[18px] shrink-0" /> Artist Dashboard
            </Link>
          )}
          {profile?.is_affiliate && (
            <Link
              to="/affiliate"
              onClick={() => closeOnClick && setMobileDrawerOpen(false)}
              className="flex items-center px-3.5 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-800 rounded-xl transition-colors min-h-[44px]"
            >
              <Share2 className="mr-2.5 h-[18px] w-[18px] shrink-0" /> Affiliate Dashboard
            </Link>
          )}
        </div>
      </nav>

      <div className="p-3 border-t border-dark-800 sticky bottom-0 bg-dark-900 shrink-0">
        <div className="px-3 py-2 mb-2 bg-dark-800/80 rounded-xl border border-dark-700/60 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-white truncate block">
              {profile?.collector_nickname || profile?.username || user?.email?.split('@')[0] || 'Admin'}
            </span>
            <span className="text-[10px] text-gray-400 truncate block">
              {user?.email}
            </span>
          </div>
          {isSuperAdmin ? (
            <span className="px-2 py-0.5 rounded-md bg-[#f00856]/20 text-[#f00856] border border-[#f00856]/40 text-[9px] font-black tracking-wider shrink-0 uppercase">
              Super Admin
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md bg-gray-800 text-gray-400 border border-gray-700 text-[9px] font-bold tracking-wider shrink-0 uppercase">
              Admin
            </span>
          )}
        </div>
        <Link
          to="/"
          onClick={() => closeOnClick && setMobileDrawerOpen(false)}
          className="flex items-center w-full px-3.5 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-xl transition-colors min-h-[44px] mb-0.5"
        >
          <ExternalLink className="mr-2.5 h-[18px] w-[18px] shrink-0" /> Ver Tienda
        </Link>
        <button
          onClick={() => {
            if (closeOnClick) setMobileDrawerOpen(false);
            handleSignOut();
          }}
          className="flex items-center w-full px-3.5 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-xl transition-colors min-h-[44px]"
        >
          <LogOut className="mr-2.5 h-[18px] w-[18px] shrink-0" /> Cerrar Sesión
        </button>
      </div>
    </>
  );

  return (
    <ToastProvider>
      <ConfirmModalProvider>
        <div className="min-h-screen flex flex-col lg:flex-row bg-gray-100 font-sans admin-container min-w-0">
          {/* Mobile Top Header (<1024px) */}
          <MobileHeader
            title={currentTitle}
            logoUrl={STORE_ISOLOGO_URL}
            onOpenDrawer={() => setMobileDrawerOpen(true)}
            onOpenSearch={handleTriggerSearch}
            userEmail={user?.email}
            onSignOut={handleSignOut}
          />

          {/* Mobile Drawer Navigation (<1024px) */}
          <MobileDrawer
            isOpen={mobileDrawerOpen}
            onClose={() => setMobileDrawerOpen(false)}
            title={settings['store_name'] || 'Admin Pro'}
          >
            {renderNavContent(true)}
          </MobileDrawer>

          {/* Desktop Sidebar (>=1024px) */}
          <aside className="hidden lg:flex desktop-sidebar w-64 bg-dark-900 text-gray-300 flex-col relative z-20 shadow-xl overflow-y-auto scrollbar-hide shrink-0">
            <div className="p-6 sticky top-0 bg-dark-900 border-b border-dark-800 z-10">
              <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                {!settingsLoaded ? (
                  <div className="h-8 w-28 bg-white/10 rounded-lg animate-pulse" />
                ) : (
                  <>
                    <img src={STORE_ISOLOGO_URL} alt="Logo" className="w-8 h-8 rounded-full object-cover" />
                    <span className="text-lg font-bold text-white tracking-widest uppercase truncate">
                      {settings['store_name'] || 'Admin Pro'}
                    </span>
                  </>
                )}
              </Link>
            </div>
            {renderNavContent(false)}
          </aside>

          {/* Main Workspace */}
          <main className="flex-1 flex flex-col relative min-w-0 overflow-x-hidden desktop-main w-full">
            {/* Desktop Header Bar (>=1024px) */}
            <header className="hidden lg:flex bg-white shadow-sm border-b border-gray-200 h-16 items-center justify-between px-8 z-20">
              <h1 className="text-xl font-bold text-gray-800">
                {currentTitle}
              </h1>
              <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
                <button
                  onClick={handleTriggerSearch}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  title="Búsqueda rápida (Ctrl+K)"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Buscar...</span>
                  <kbd className="text-[9px] font-mono bg-gray-200 px-1.5 py-0.5 rounded">⌘K</kbd>
                </button>
                {isSuperAdmin && <span className="px-2.5 py-1 rounded-full bg-[#f00856]/10 text-[#f00856] text-[10px] font-bold tracking-wider">SUPER ADMIN</span>}
                <LocaleSwitcher compact />
              </div>
            </header>

            {/* Page Content Container */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 bg-gray-50 min-w-0">
              <AdminBreadcrumbs />
              <Outlet />
            </div>
          </main>

          {/* Global Search Overlay */}
          <AdminSearchGlobal />
        </div>
      </ConfirmModalProvider>
    </ToastProvider>
  );
}

import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingBag, Settings, LogOut, Package, 
  CreditCard, Truck, Layers, HelpCircle, Store,
  FolderOpen, Tag, Image, Percent, Sparkles
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LocaleSwitcher from '../components/LocaleSwitcher';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { STORE_ISOLOGO_URL } from '../lib/brand';
import { ToastProvider } from '../components/admin/Toast';
import { ConfirmModalProvider } from '../components/admin/ConfirmModal';
import { supabase } from '../lib/supabase';
import MobileDrawer from '../components/admin/MobileDrawer';
import MobileHeader from '../components/admin/MobileHeader';

export default function VendorLayout() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { loaded: settingsLoaded } = useSiteSettings();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';
  
  const [vendorData, setVendorData] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string>('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function loadVendorAndStores() {
      const { data: vendor } = await supabase.from('vendors').select('*').eq('id', user!.id).single();
      if (vendor) {
        setVendorData(vendor);
        const { data: storeList } = await supabase
          .from('vendor_stores')
          .select('*')
          .eq('vendor_id', user!.id)
          .order('store_name');
        
        const list = storeList || [];
        setStores(list);
        
        const savedStoreId = localStorage.getItem(`active_store_${user!.id}`);
        if (savedStoreId && list.some(s => s.id === savedStoreId)) {
          setActiveStoreId(savedStoreId);
        } else if (list.length > 0) {
          setActiveStoreId(list[0].id);
          localStorage.setItem(`active_store_${user!.id}`, list[0].id);
        }
      }
    }
    loadVendorAndStores();
  }, [user]);

  const navItems = [
    { name: 'Dashboard', path: '/vendor?tab=overview', tab: 'overview', icon: LayoutDashboard },
    { name: 'Productos', path: '/vendor?tab=products', tab: 'products', icon: Package },
    { name: 'Pedidos', path: '/vendor?tab=orders', tab: 'orders', icon: ShoppingBag },
    { name: 'Mis Envíos', path: '/vendor?tab=shipments', tab: 'shipments', icon: Truck },
    { name: 'Finanzas', path: '/vendor?tab=finances', tab: 'finances', icon: CreditCard },
    { name: 'Ajustes de Envío', path: '/vendor?tab=shipping', tab: 'shipping', icon: Settings },
  ];

  const taxonomyItems = [
    { name: 'Colecciones', path: '/vendor?tab=collections', tab: 'collections', icon: Layers },
    { name: 'Categorías', path: '/vendor?tab=categories', tab: 'categories', icon: FolderOpen },
    { name: 'Marcas', path: '/vendor?tab=brands', tab: 'brands', icon: Tag },
    { name: 'Tiendas', path: '/vendor?tab=stores', tab: 'stores', icon: Store },
    { name: 'Promociones', path: '/vendor?tab=promotions', tab: 'promotions', icon: Percent },
    { name: 'Multimedia', path: '/vendor?tab=media', tab: 'media', icon: Image },
  ];

  const secondaryNavItems = [
    { name: 'Mercado Libre', path: '/vendor?tab=mercadolibre', tab: 'mercadolibre', icon: Layers },
    { name: 'Guía de Inicio', path: '/vendor/onboarding', tab: 'onboarding', icon: Sparkles },
    { name: 'Configuración', path: '/vendor?tab=settings', tab: 'settings', icon: Settings },
    { name: 'Ayuda', path: '/vendor?tab=help', tab: 'help', icon: HelpCircle },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const renderNavContent = (closeOnClick = false) => (
    <>
      {stores.length > 1 && (
        <div className="px-3 py-3 border-b border-dark-800 bg-dark-950/50">
          <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">
            Tienda Activa
          </label>
          <select
            value={activeStoreId}
            onChange={(e) => {
              const val = e.target.value;
              setActiveStoreId(val);
              localStorage.setItem(`active_store_${user!.id}`, val);
              window.dispatchEvent(new CustomEvent('vendorActiveStoreChange', { detail: val }));
            }}
            className="w-full text-xs font-bold text-white bg-dark-800 border border-dark-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.store_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = currentTab === item.tab;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={() => closeOnClick && setMobileDrawerOpen(false)}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
                isActive ? 'bg-primary-600 text-white shadow-md' : 'hover:bg-dark-800 hover:text-white text-gray-300'
              }`}
            >
              <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
              {item.name}
            </Link>
          );
        })}

        <div className="pt-4 pb-2">
          <div className="border-t border-dark-800 mb-4" />
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Catálogo</p>
          {taxonomyItems.map((item) => {
            const isActive = currentTab === item.tab;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => closeOnClick && setMobileDrawerOpen(false)}
                className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
                  isActive ? 'bg-primary-600 text-white shadow-md' : 'hover:bg-dark-800 hover:text-white text-gray-300'
                }`}
              >
                <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="pt-4 pb-2">
          <div className="border-t border-dark-800 mb-4" />
          {secondaryNavItems.map((item) => {
            const isActive = currentTab === item.tab;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => closeOnClick && setMobileDrawerOpen(false)}
                className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
                  isActive ? 'bg-primary-600 text-white shadow-md' : 'hover:bg-dark-800 hover:text-white text-gray-300'
                }`}
              >
                <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>
      
      <div className="p-4 border-t border-dark-800 sticky bottom-0 bg-dark-900">
        <Link
          to="/shop"
          onClick={() => closeOnClick && setMobileDrawerOpen(false)}
          className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors mb-1"
        >
          <Store className="mr-3 h-4 w-4" /> Ir al Marketplace
        </Link>
        <button
          onClick={() => {
            if (closeOnClick) setMobileDrawerOpen(false);
            handleSignOut();
          }}
          className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
        >
          <LogOut className="mr-3 h-5 w-5" /> Cerrar Sesión
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
            title={vendorData?.store_name || 'Seller Center'}
            logoUrl={STORE_ISOLOGO_URL}
            onOpenDrawer={() => setMobileDrawerOpen(true)}
            userEmail={user?.email}
            onSignOut={handleSignOut}
          />

          {/* Mobile Drawer (<1024px) */}
          <MobileDrawer
            isOpen={mobileDrawerOpen}
            onClose={() => setMobileDrawerOpen(false)}
            title={vendorData?.store_name || 'Seller Center'}
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
                    <img src={STORE_ISOLOGO_URL} alt="Logo" className="w-8 h-8 rounded-full object-cover bg-white" />
                    <span className="text-lg font-bold text-white tracking-widest uppercase truncate">
                      {vendorData?.store_name || 'Seller Center'}
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
              <div className="flex flex-col">
                <h1 className="text-xl font-bold text-gray-900 leading-none">
                  {vendorData?.store_name || 'Seller Center'}
                </h1>
                {stores.length > 1 ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Tienda:</span>
                    <select
                      value={activeStoreId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setActiveStoreId(val);
                        localStorage.setItem(`active_store_${user!.id}`, val);
                        window.dispatchEvent(new CustomEvent('vendorActiveStoreChange', { detail: val }));
                      }}
                      className="text-xs font-black text-primary-600 bg-primary-50 hover:bg-primary-100/80 border border-primary-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.store_name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500 font-medium hidden sm:block mt-1">
                    {stores[0]?.store_name || 'Gestiona tu tienda y monitorea tus ventas.'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/vendor?tab=products&action=new')}
                  className="px-4 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm min-h-[38px]"
                >
                  Nuevo Producto
                </button>
                <button
                  onClick={() => navigate('/vendor?tab=imports')}
                  className="px-4 py-2 text-sm font-bold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors shadow-sm min-h-[38px]"
                >
                  Importar CSV
                </button>
                <div className="border-l border-gray-200 pl-4 ml-2">
                  <LocaleSwitcher compact />
                </div>
              </div>
            </header>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 bg-gray-50 min-w-0">
              <Outlet context={{ activeStoreId, stores, setActiveStoreId }} />
            </div>
          </main>
        </div>
      </ConfirmModalProvider>
    </ToastProvider>
  );
}

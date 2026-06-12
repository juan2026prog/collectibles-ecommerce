import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingBag, Settings, LogOut, Package, 
  CreditCard, Truck, Layers, HelpCircle, ExternalLink, Store, Search,
  FolderOpen, Tag, Image, Percent
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LocaleSwitcher from '../components/LocaleSwitcher';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { STORE_ISOLOGO_URL } from '../lib/brand';
import { ToastProvider } from '../components/admin/Toast';
import { ConfirmModalProvider } from '../components/admin/ConfirmModal';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function VendorLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { settings, loaded: settingsLoaded } = useSiteSettings();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';
  
  const [vendorData, setVendorData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    async function loadVendor() {
      const { data } = await supabase.from('vendors').select('store_name').eq('id', user!.id).single();
      if (data) setVendorData(data);
    }
    loadVendor();
  }, [user]);

  const navItems = [
    { name: 'Dashboard', path: '/vendor?tab=overview', tab: 'overview', icon: LayoutDashboard },
    { name: 'Productos', path: '/vendor?tab=products', tab: 'products', icon: Package },
    { name: 'Pedidos', path: '/vendor?tab=orders', tab: 'orders', icon: ShoppingBag },
    { name: 'Envíos', path: '/vendor?tab=shipping', tab: 'shipping', icon: Truck },
    { name: 'Finanzas', path: '/vendor?tab=finances', tab: 'finances', icon: CreditCard },
  ];

  const taxonomyItems = [
    { name: 'Categorías', path: '/vendor?tab=categories', tab: 'categories', icon: FolderOpen },
    { name: 'Marcas', path: '/vendor?tab=brands', tab: 'brands', icon: Tag },
    { name: 'Promociones', path: '/vendor?tab=promotions', tab: 'promotions', icon: Percent },
    { name: 'Multimedia', path: '/vendor?tab=media', tab: 'media', icon: Image },
  ];

  const secondaryNavItems = [
    { name: 'Mercado Libre', path: '/vendor?tab=mercadolibre', tab: 'mercadolibre', icon: Layers },
    { name: 'Configuración', path: '/vendor?tab=settings', tab: 'settings', icon: Settings },
    { name: 'Ayuda', path: '/vendor?tab=help', tab: 'help', icon: HelpCircle },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <ToastProvider>
      <ConfirmModalProvider>
        <div className="min-h-screen flex bg-gray-100 font-sans admin-container">
          <aside className="w-64 bg-dark-900 text-gray-300 flex flex-col relative z-20 shadow-xl overflow-y-auto scrollbar-hide">
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
            
            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const isActive = currentTab === item.tab;
                const Icon = item.icon;
                return (
                  <Link key={item.name} to={item.path}
                    className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary-600 text-white shadow-md' : 'hover:bg-dark-800 hover:text-white'
                    }`}>
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
                    <Link key={item.name} to={item.path}
                      className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'bg-primary-600 text-white shadow-md' : 'hover:bg-dark-800 hover:text-white'
                      }`}>
                      <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>

              <div className="pt-6 pb-2">
                <div className="border-t border-dark-800 mb-4" />
                {secondaryNavItems.map((item) => {
                  const isActive = currentTab === item.tab;
                  const Icon = item.icon;
                  return (
                    <Link key={item.name} to={item.path}
                      className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'bg-primary-600 text-white shadow-md' : 'hover:bg-dark-800 hover:text-white'
                      }`}>
                      <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </nav>
            
            <div className="p-4 border-t border-dark-800 sticky bottom-0 bg-dark-900">
              <Link to="/shop" className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors mb-1">
                <Store className="mr-3 h-4 w-4" /> Ir al Marketplace
              </Link>
              <button onClick={handleSignOut} className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
                <LogOut className="mr-3 h-5 w-5" /> Cerrar Sesión
              </button>
            </div>
          </aside>

          <main className="flex-1 flex flex-col relative overflow-hidden">
            <header className="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-8 z-20">
              <div className="flex flex-col">
                <h1 className="text-xl font-bold text-gray-900">
                  Buenos días, {vendorData?.store_name || 'Seller'}
                </h1>
                <span className="text-xs text-gray-500 font-medium hidden sm:block">Gestiona tu tienda y monitorea tus ventas.</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/vendor?tab=products&action=new')}
                  className="px-4 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                >
                  Nuevo Producto
                </button>
                <button
                  onClick={() => navigate('/vendor?tab=imports')}
                  className="px-4 py-2 text-sm font-bold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors shadow-sm"
                >
                  Importar CSV
                </button>
                <div className="border-l border-gray-200 pl-4 ml-2">
                  <LocaleSwitcher compact />
                </div>
              </div>
            </header>
            <div className="flex-1 overflow-auto p-8 bg-gray-50">
              <Outlet />
            </div>
          </main>
        </div>
      </ConfirmModalProvider>
    </ToastProvider>
  );
}

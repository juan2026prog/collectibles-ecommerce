import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LogOut, Store, Star, Share2, ExternalLink, Settings, ListPlus, Home, ShieldCheck, DollarSign, List,
  Package, Upload, ShoppingCart, Truck, Clock, BarChart3, AlertTriangle, FileText, Zap, Warehouse, Users, HelpCircle, Layers
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LocaleSwitcher from '../components/LocaleSwitcher';
import { useSiteSettings } from '../hooks/useSiteSettings';

export default function PortalLayout({ type }: { type: 'vendor' | 'artist' | 'affiliate' | 'star2fan' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { settings, loaded: settingsLoaded } = useSiteSettings();
  
  let navItems: any[] = [];
  let title = "";
  let Icon = Home;

  if (type === 'vendor') {
    title = "Vendor Pro";
    Icon = Store;
    navItems = [
      { name: 'Resumen', path: '/vendor?tab=overview', icon: Home },
      { name: 'Productos', path: '/vendor?tab=products', icon: Package },
      { name: 'Importaciones', path: '/vendor?tab=imports', icon: Upload },
      { name: 'Mercado Libre', path: '/vendor?tab=mercadolibre', icon: Layers },
      { name: 'Inventario', path: '/vendor?tab=inventory', icon: Warehouse },
      { name: 'Pedidos', path: '/vendor?tab=orders', icon: ShoppingCart },
      { name: 'Envíos', path: '/vendor?tab=shipping', icon: Truck },
      { name: 'SLA Logístico', path: '/vendor?tab=sla', icon: Clock },
      { name: 'Finanzas', path: '/vendor?tab=finances', icon: DollarSign },
      { name: 'Liquidaciones', path: '/vendor?tab=settlements', icon: FileText },
      { name: 'Analytics', path: '/vendor?tab=analytics', icon: BarChart3 },
      { name: 'Incidencias', path: '/vendor?tab=incidents', icon: AlertTriangle },
      { name: 'Auditoría', path: '/vendor?tab=audit', icon: FileText },
      { name: 'Automatizaciones', path: '/vendor?tab=rules', icon: Zap },
      { name: 'Depósitos', path: '/vendor?tab=warehouses', icon: Warehouse },
      { name: 'Equipo', path: '/vendor?tab=team', icon: Users },
      { name: 'Configuración', path: '/vendor?tab=settings', icon: Settings },
      { name: 'Ayuda', path: '/vendor?tab=help', icon: HelpCircle },
    ];
  } else if (type === 'artist') {
    title = "Artist Portal";
    Icon = Star;
    navItems = [
      { name: 'Dashboard', path: '/artist?tab=overview', icon: Home },
      { name: 'Comisiones', path: '/artist?tab=commissions', icon: ListPlus },
      { name: 'Servicios', path: '/artist?tab=services', icon: Star },
      { name: 'Finanzas', path: '/artist?tab=earnings', icon: LogOut },
      { name: 'Mi Perfil', path: '/artist?tab=settings', icon: Settings },
    ];
  } else if (type === 'affiliate') {
    title = "Affiliate Portal";
    Icon = Share2;
    navItems = [
      { name: 'Resumen General', path: '/affiliate?tab=overview', icon: Home },
      { name: 'Tus Pagos', path: '/affiliate?tab=payments', icon: ListPlus },
      { name: 'Material Promo', path: '/affiliate?tab=materials', icon: Star },
      { name: 'Configuración', path: '/affiliate?tab=settings', icon: Settings },
    ];
  } else if (type === 'star2fan') {
    title = "Star2Fan";
    Icon = Star;
    navItems = [
      { name: 'Vista General', path: '/star2fan?tab=overview', icon: Home },
      { name: 'Pedidos (Requests)', path: '/star2fan?tab=requests', icon: ListPlus },
      { name: 'Historial', path: '/star2fan?tab=history', icon: List },
      { name: 'Billetera', path: '/star2fan?tab=earnings', icon: DollarSign },
      { name: 'Mi Perfil & Precios', path: '/star2fan?tab=profile', icon: Settings },
      { name: 'Reputación', path: '/star2fan?tab=reviews', icon: Star },
      { name: 'Soporte', path: '/star2fan?tab=support', icon: LogOut },
    ];
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-gray-100 font-sans">
      <aside className="w-64 bg-dark-900 text-gray-300 flex flex-col relative z-20 shadow-xl overflow-y-auto scrollbar-hide">
        <div className="p-6 sticky top-0 bg-dark-900 border-b border-dark-800 z-10">
          <Link to={`/${type}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            {!settingsLoaded ? (
              <div className="h-8 w-28 bg-white/10 rounded-lg animate-pulse" />
            ) : settings['appearance_logo'] ? (
              <img src={settings['appearance_logo']} alt={settings['store_name'] || 'Store Logo'} className="h-8 object-contain" />
            ) : (
              <>
                <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white tracking-widest uppercase truncate">
                  {title}
                </span>
              </>
            )}
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isTabMatch = location.search === item.path.substring(item.path.indexOf('?'));
            const isExactPathMatch = location.pathname === item.path.split('?')[0] && !location.search && !item.path.includes('?tab=');
            const isActive = isTabMatch || isExactPathMatch;
            const ItemIcon = item.icon;
            return (
              <Link key={item.name} to={item.path}
                className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary-600 text-white shadow-md' : 'hover:bg-dark-800 hover:text-white'
                } ${item.path === '#' ? 'opacity-50 cursor-default hover:bg-transparent hover:text-gray-400' : ''}`}>
                <ItemIcon className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                {item.name} {item.path === '#' && <span className="ml-auto text-xs bg-dark-800 px-2 py-0.5 rounded">Próximamente</span>}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-dark-800 sticky bottom-0 bg-dark-900">
          <Link to="/" className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors mb-1">
            <ExternalLink className="mr-3 h-4 w-4" /> Volver a la Tienda
          </Link>
          {profile?.is_admin && (
             <Link to="/admin" className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors mb-1">
               <ShieldCheck className="mr-3 h-4 w-4" /> Admin Pro
             </Link>
          )}
          <button onClick={handleSignOut} className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
            <LogOut className="mr-3 h-5 w-5" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
        <header className="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-8 z-20">
          <h1 className="text-xl font-bold text-gray-800">
            {navItems.find(item => item.path === location.pathname || (location.pathname.startsWith(item.path) && item.path !== `/${type}`))?.name || 'Dashboard'}
          </h1>
          <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
            <LocaleSwitcher compact />
          </div>
        </header>
        <div className="flex-1 overflow-auto bg-gray-50 h-[calc(100vh-64px)]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

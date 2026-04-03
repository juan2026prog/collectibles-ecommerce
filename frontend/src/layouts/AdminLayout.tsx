import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingBag, FolderTree, Users, Settings, LogOut, Package, 
  Tag, Image, CreditCard, LayoutTemplate, Star, Percent, Megaphone,
  Mail, ShoppingCart, BarChart3, Search, ShieldCheck, Store, Share2, ExternalLink, Library, FileText
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LocaleSwitcher from '../components/LocaleSwitcher';

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  
  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Biblioteca de Medios', path: '/admin/media', icon: Library },
    { name: 'Home / Banners', path: '/admin/banners', icon: Image },
    { name: 'Productos', path: '/admin/products', icon: Package },
    { name: 'Categorías', path: '/admin/categories', icon: FolderTree },
    { name: 'Etiquetas', path: '/admin/tags', icon: Tag },
    { name: 'Páginas Estáticas', path: '/admin/pages', icon: FileText },
    { name: 'Marcas', path: '/admin/brands', icon: Star },
    { name: 'Grupos', path: '/admin/groups', icon: LayoutTemplate },
    { name: 'Cocardas', path: '/admin/badges', icon: ShieldCheck },
    { name: 'Promociones', path: '/admin/promotions', icon: Percent },
    { name: 'Cupones', path: '/admin/coupons', icon: Tag },
    { name: 'Afiliados', path: '/admin/affiliates', icon: Megaphone },
    { name: 'Pedidos', path: '/admin/orders', icon: ShoppingBag },
    { name: 'Pasarelas de Pago', path: '/admin/settings?tab=payments', icon: CreditCard },
    { name: 'Configuracion', path: '/admin/settings', icon: Settings },
    { name: 'Clientes & CRM', path: '/admin/customers', icon: Users },
    { name: 'Mailing', path: '/admin/mailing', icon: Mail },
    { name: 'Mercado Libre', path: '/admin/mercadolibre', icon: ShoppingCart },
    { name: 'Finanzas & Facturas', path: '/admin/finances', icon: CreditCard },
    { name: 'Logistica & Envios', path: '/admin/logistics', icon: Package },
    { name: 'Artistas & Cameo', path: '/admin/artists', icon: Star },
    { name: 'Reportes', path: '/admin/reports', icon: BarChart3 },
    { name: 'SEO', path: '/admin/seo', icon: Search },
    { name: 'Usuarios & Auditoria', path: '/admin/users', icon: ShieldCheck },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-gray-100 font-sans">
      <aside className="w-64 bg-dark-900 text-gray-300 flex flex-col relative z-20 shadow-xl overflow-y-auto scrollbar-hide">
        <div className="p-6 sticky top-0 bg-dark-900 border-b border-dark-800 z-10">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">✦</span>
            </div>
            <span className="text-lg font-bold text-white tracking-widest uppercase truncate">
              Admin Pro
            </span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (location.pathname.startsWith(item.path) && item.path !== '/admin');
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

          {/* Otros Portales */}
          <div className="pt-4 pb-2">
            <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Otros Portales</p>
            {profile?.is_vendor && (
              <Link to="/vendor" className="flex items-center px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
                <Store className="mr-3 h-4 w-4" /> Vendor Dashboard
              </Link>
            )}
            {profile?.is_artist && (
              <Link to="/artist" className="flex items-center px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
                <Star className="mr-3 h-4 w-4" /> Artist Dashboard
              </Link>
            )}
            {profile?.is_affiliate && (
              <Link to="/affiliate" className="flex items-center px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
                <Share2 className="mr-3 h-4 w-4" /> Affiliate Dashboard
              </Link>
            )}
          </div>
        </nav>
        <div className="p-4 border-t border-dark-800 sticky bottom-0 bg-dark-900">
          <Link to="/" className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors mb-1">
            <ExternalLink className="mr-3 h-4 w-4" /> Ver Tienda
          </Link>
          <button onClick={handleSignOut} className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
            <LogOut className="mr-3 h-5 w-5" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
        <header className="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-8 z-20">
          <h1 className="text-xl font-bold text-gray-800">
            {navItems.find(item => item.path === location.pathname || (location.pathname.startsWith(item.path) && item.path !== '/admin'))?.name || 'Dashboard'}
          </h1>
          <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
            <LocaleSwitcher compact />
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8 bg-gray-50">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

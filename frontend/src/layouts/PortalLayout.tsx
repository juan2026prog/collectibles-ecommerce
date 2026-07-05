import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LogOut, Store, Star, Share2, ExternalLink, Settings, ListPlus, Home, ShieldCheck, DollarSign, List,
  Package, Upload, ShoppingCart, Truck, Clock, BarChart3, AlertTriangle, FileText, Zap, Warehouse, Users, HelpCircle, Layers,
  Search, Video, RefreshCw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LocaleSwitcher from '../components/LocaleSwitcher';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { STORE_ISOLOGO_URL } from '../lib/brand';

export default function PortalLayout({ type }: { type: 'vendor' | 'artist' | 'affiliate' | 'star2fan' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { settings, loaded: settingsLoaded } = useSiteSettings();
  
  let navItems: any[] = [];
  let title = "";
  let portalLabel = "";

  if (type === 'vendor') {
    portalLabel = "Panel Seller";
    title = "Sincronización & Logística";
    navItems = [
      { name: 'Vista General', path: '/vendor?tab=overview', icon: Home },
      { name: 'Productos', path: '/vendor?tab=products', icon: Package },
      { name: 'Importaciones', path: '/vendor?tab=imports', icon: Upload },
      { name: 'Mercado Libre', path: '/vendor?tab=mercadolibre', icon: Layers },
      { name: 'Inventario', path: '/vendor?tab=inventory', icon: Warehouse },
      { name: 'Pedidos', path: '/vendor?tab=orders', icon: ShoppingCart },
      { name: 'Mis Envíos', path: '/vendor?tab=shipments', icon: Truck },
      { name: 'Ajustes de Envío', path: '/vendor?tab=shipping', icon: Settings },
      { name: 'SLA Logístico', path: '/vendor?tab=sla', icon: Clock },
      { name: 'Finanzas', path: '/vendor?tab=finances', icon: DollarSign },
      { name: 'Analytics', path: '/vendor?tab=analytics', icon: BarChart3 },
      { name: 'Reglas Motor', path: '/vendor?tab=rules', icon: Zap },
      { name: 'Equipo', path: '/vendor?tab=team', icon: Users },
      { name: 'Configuración', path: '/vendor?tab=settings', icon: Settings },
      { name: 'Ayuda', path: '/vendor?tab=help', icon: HelpCircle },
    ];
  } else if (type === 'artist') {
    portalLabel = "Artist Portal";
    title = "Servicios & Comisiones";
    navItems = [
      { name: 'Dashboard', path: '/artist?tab=overview', icon: Home },
      { name: 'Comisiones', path: '/artist?tab=commissions', icon: FileText },
      { name: 'Servicios', path: '/artist?tab=services', icon: Star },
      { name: 'Finanzas', path: '/artist?tab=earnings', icon: DollarSign },
      { name: 'Mi Perfil', path: '/artist?tab=settings', icon: Settings },
    ];
  } else if (type === 'affiliate') {
    portalLabel = "Panel Afiliado";
    title = "Links & Performance";
    navItems = [
      { name: 'Resumen', path: '/affiliate?tab=overview', icon: Home },
      { name: 'Tus Pagos', path: '/affiliate?tab=payments', icon: DollarSign },
      { name: 'Material Promo', path: '/affiliate?tab=materials', icon: Share2 },
      { name: 'Configuración', path: '/affiliate?tab=settings', icon: Settings },
    ];
  } else if (type === 'star2fan') {
    portalLabel = "Star2Fan";
    title = "Video Saludos";
    navItems = [
      { name: 'Vista General', path: '/star2fan?tab=overview', icon: Home },
      { name: 'Pedidos', path: '/star2fan?tab=requests', icon: Video },
      { name: 'Billetera', path: '/star2fan?tab=earnings', icon: DollarSign },
      { name: 'Mi Perfil', path: '/star2fan?tab=profile', icon: Settings },
    ];
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const currentTab = new URLSearchParams(location.search).get('tab') || 'overview';

  return (
    <div className="min-h-screen bg-[#05070f] text-[#f8fafc] font-inter selection:bg-[#f00856]/30 overflow-x-hidden">
      {/* TOP STATUS BAR */}
      <div className="bg-[#f00856] text-white text-[10px] font-black uppercase tracking-[0.3em] relative z-[60]">
        <div className="max-w-7xl mx-auto px-6 h-10 flex items-center justify-between gap-6 overflow-hidden">
          <div className="flex items-center gap-8 overflow-hidden whitespace-nowrap">
            <span className="flex items-center gap-2"><Truck className="w-3 h-3" /> Envío gratis desde $1500</span>
            <span className="opacity-30">•</span>
            <span className="flex items-center gap-2"><ShieldCheck className="w-3 h-3" /> Sellers Oficiales Verificados</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <span className="flex items-center gap-2"><RefreshCw className="w-3 h-3" /> ML Global Sync Active</span>
          </div>
        </div>
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#05070f]/80 backdrop-blur-2xl border-b border-white/5 px-6">
        <div className="max-w-7xl mx-auto h-24 flex items-center justify-between gap-10">
          <Link to="/" className="flex items-center gap-4 group transition-all shrink-0">
            <img src={STORE_ISOLOGO_URL} className="h-12 object-contain group-hover:scale-110 transition-transform duration-500" alt="Collectibles" />
            <div className="hidden sm:block">
              <p className="text-[10px] font-black text-[#f00856] uppercase tracking-[0.4em] leading-none">Marketplace</p>
              <p className="text-lg font-black text-white tracking-tighter mt-1">Collectibles</p>
            </div>
          </Link>
          
          <div className="hidden lg:flex flex-1 max-w-xl relative group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-[#f00856] transition-colors" />
            <input 
              type="text"
              placeholder="Explorar ecosistema..."
              className="w-full bg-white/5 border border-white/10 rounded-full pl-14 pr-6 py-4 text-sm text-slate-300 outline-none focus:border-[#f00856] focus:bg-white/10 transition-all placeholder:text-slate-700 font-bold"
            />
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <LocaleSwitcher />
            <div className="w-[1px] h-8 bg-white/10 mx-2 hidden sm:block" />
            <button className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all hover:scale-105 active:scale-95 group">
              <span className="text-xl group-hover:animate-pulse">👤</span>
            </button>
            <button className="h-12 px-6 rounded-2xl bg-[#f00856] text-white flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(240,8,86,0.3)] hover:bg-[#ff2c68] transition-all hover:scale-105 active:scale-95 font-black text-[10px] uppercase tracking-widest">
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">0 Items</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT GRID */}
      <main className="max-w-7xl mx-auto px-6 py-12 grid lg:grid-cols-[300px_1fr] gap-10">
        {/* SIDEBAR */}
        <aside className="space-y-8">
          <div className="glass rounded-[2.5rem] p-6 border border-white/5 shadow-2xl relative overflow-hidden group">
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#f00856]/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
            
            <div className="relative z-10 space-y-2">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.5em] pl-4 mb-4">Navigational Hub</p>
              {navItems.map((item) => {
                const isTabMatch = location.search === item.path.substring(item.path.indexOf('?'));
                const isExactPathMatch = location.pathname === item.path.split('?')[0] && !location.search && !item.path.includes('?tab=');
                const isActive = isTabMatch || isExactPathMatch;
                
                return (
                  <Link key={item.name} to={item.path}
                    className={`flex items-center gap-5 px-6 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest transition-all duration-300 group/link ${
                      isActive 
                        ? 'bg-[#f00856] text-white shadow-[0_10px_25px_rgba(240,8,86,0.3)]' 
                        : 'text-slate-500 hover:text-white hover:bg-white/5'
                    }`}>
                    <item.icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover/link:scale-110 group-hover/link:text-[#f00856]'}`} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
            
            <div className="pt-6 mt-6 border-t border-white/5 relative z-10 space-y-2">
              {profile?.is_admin && (
                <Link to="/admin" className="flex items-center gap-5 px-6 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/5 transition-all">
                  <ShieldCheck className="w-5 h-5" />
                  <span>Admin Protocol</span>
                </Link>
              )}
              <button onClick={handleSignOut} className="w-full flex items-center gap-5 px-6 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest text-red-500/60 hover:text-red-500 hover:bg-red-500/5 transition-all">
                <LogOut className="w-5 h-5" />
                <span>Exit Session</span>
              </button>
            </div>
          </div>

          {/* Quick Stats Sidebar Card */}
          <div className="glass rounded-[2.5rem] p-8 border border-white/5 shadow-xl relative overflow-hidden bg-gradient-to-br from-white/[0.03] to-transparent">
             <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#f00856]/10 flex items-center justify-center">
                   <Zap className="w-5 h-5 text-[#f00856]" />
                </div>
                <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full">Active</div>
             </div>
             <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Status Report</p>
             <p className="text-xl font-black text-white tracking-tighter">System Nominal</p>
             <div className="mt-6 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-[#f00856] w-2/3 shadow-[0_0_10px_rgba(240,8,86,0.5)]" />
             </div>
          </div>
        </aside>

        {/* CONTENT AREA */}
        <div className="space-y-10 min-w-0">
          <div className="glass rounded-[3rem] p-10 md:p-14 border border-white/10 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#f00856]/5 blur-[120px] rounded-full pointer-events-none group-hover:bg-[#f00856]/10 transition-colors duration-1000" />
            <div className="absolute -left-20 -top-20 w-80 h-80 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />
            
            <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-[2px] w-10 bg-[#f00856]" />
                  <div className="text-[#f00856] text-[12px] font-black tracking-[0.5em] uppercase">{portalLabel}</div>
                </div>
                <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white leading-none max-w-2xl">{title}</h1>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-sm mt-4">Gestioná cada aspecto de tu presencia operativa en Collectibles.</p>
              </div>
              
              <div className="flex flex-col gap-4 shrink-0">
                <button className="bg-white text-black rounded-full px-12 py-5 font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl hover:bg-[#f00856] hover:text-white transition-all hover:scale-105 active:scale-95 border border-white/10">
                  Acción de Protocolo
                </button>
                <div className="flex items-center justify-center gap-3 opacity-40">
                  <div className="w-1.5 h-1.5 bg-[#f00856] rounded-full animate-ping" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Live Telemetry active</span>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-[600px] animation-fade-in">
            <Outlet />
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="bg-black/40 border-t border-white/5 mt-20 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid md:grid-cols-4 gap-16 mb-20">
            <div className="md:col-span-2 space-y-10">
              <Link to="/" className="flex items-center gap-4">
                <img src={STORE_ISOLOGO_URL} className="h-14 object-contain" alt="Logo" />
                <div>
                  <p className="text-2xl font-black text-white tracking-tighter">Collectibles</p>
                  <p className="text-[10px] font-black text-[#f00856] uppercase tracking-[0.5em]">Evolution of Hobby</p>
                </div>
              </Link>
              <p className="text-slate-500 text-[13px] font-bold uppercase tracking-[0.1em] max-w-md leading-loose">
                Plataforma líder en coleccionismo premium. Marketplace curado, logística inteligente y sincronización global de inventario para sellers de alto desempeño.
              </p>
              <div className="flex gap-6">
                {['📸', '💬', '▶', '🐦'].map((icon, i) => (
                  <button key={i} className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#f00856] hover:border-[#f00856] transition-all hover:-translate-y-1 text-xl">
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-8">
              <h4 className="text-[12px] font-black text-white uppercase tracking-[0.4em] mb-10">Explorar</h4>
              <div className="flex flex-col gap-5 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                <Link to="/shop" className="hover:text-[#f00856] transition-colors">Catálogo Global</Link>
                <Link to="/drops" className="hover:text-[#f00856] transition-colors">Drops Exclusivos</Link>
                <Link to="/page/nosotros" className="hover:text-[#f00856] transition-colors">Sobre Nosotros</Link>
                <Link to="/contact" className="hover:text-[#f00856] transition-colors">Contacto</Link>
              </div>
            </div>

            <div className="space-y-8">
              <h4 className="text-[12px] font-black text-white uppercase tracking-[0.4em] mb-10">Sede Central</h4>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-loose">
                Vázquez 1418, Montevideo<br/>
                Uruguay, 11200<br/><br/>
                Lun-Vie: 12:00 - 18:00<br/>
                Sáb: 10:00 - 14:00
              </div>
            </div>
          </div>
          
          <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em]">
              © 2026 Collectibles Corp. Todos los derechos reservados.
            </p>
            <div className="flex items-center gap-10 opacity-30">
               <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" className="h-4 grayscale invert" alt="Visa" />
               <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" className="h-6 grayscale invert" alt="Mastercard" />
               <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" className="h-5 grayscale invert" alt="Paypal" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

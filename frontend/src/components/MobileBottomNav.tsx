import { Link, useLocation } from 'react-router-dom';
import { Home, Grid, Sparkles, ShoppingCart, User, LogIn } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';

export default function MobileBottomNav() {
  const location = useLocation();
  const { count: cartCount, setIsDrawerOpen } = useCartContext();
  const { user } = useAuth();

  // Hide on checkout, admin or vendor layouts
  if (location.pathname.startsWith('/checkout') || location.pathname.startsWith('/admin') || location.pathname.startsWith('/vendor')) {
    return null;
  }

  const isHome = location.pathname === '/';
  const isShop = location.pathname.startsWith('/shop') || location.pathname.startsWith('/categoria') || location.pathname.startsWith('/marca');
  const isLicencias = location.pathname.startsWith('/licencias');
  const isAccount = location.pathname.startsWith('/account') || location.pathname.startsWith('/login');

  return (
    <nav 
      aria-label="Navegación móvil inferior"
      className="fixed bottom-0 inset-x-0 z-40 xl:hidden bg-[#070a14]/95 backdrop-blur-xl border-t border-white/10 px-2 py-1 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_rgba(0,0,0,0.6)]"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 items-center justify-items-center">
        {/* INICIO */}
        <Link
          to="/"
          className={`flex flex-col items-center justify-center w-full min-h-[48px] py-1 text-[10px] font-bold transition-all ${
            isHome ? 'text-[#f00856]' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Home className={`w-5 h-5 mb-0.5 transition-transform ${isHome ? 'scale-110' : ''}`} />
          <span className="tracking-tight">Inicio</span>
        </Link>

        {/* CATÁLOGO */}
        <Link
          to="/shop"
          className={`flex flex-col items-center justify-center w-full min-h-[48px] py-1 text-[10px] font-bold transition-all ${
            isShop ? 'text-[#f00856]' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Grid className={`w-5 h-5 mb-0.5 transition-transform ${isShop ? 'scale-110' : ''}`} />
          <span className="tracking-tight">Catálogo</span>
        </Link>

        {/* LICENCIAS */}
        <Link
          to="/licencias"
          className={`flex flex-col items-center justify-center w-full min-h-[48px] py-1 text-[10px] font-bold transition-all ${
            isLicencias ? 'text-[#f00856]' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className={`w-5 h-5 mb-0.5 transition-transform ${isLicencias ? 'scale-110' : ''}`} />
          <span className="tracking-tight">Licencias</span>
        </Link>

        {/* CARRITO */}
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="flex flex-col items-center justify-center w-full min-h-[48px] py-1 text-[10px] font-bold text-slate-400 hover:text-white relative cursor-pointer"
          aria-label="Abrir carrito"
        >
          <div className="relative">
            <ShoppingCart className="w-5 h-5 mb-0.5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] bg-[#f00856] text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow-md shadow-[#f00856]/50 animate-pulse">
                {cartCount}
              </span>
            )}
          </div>
          <span className="tracking-tight">Carrito</span>
        </button>

        {/* CUENTA / LOGIN */}
        <Link
          to={user ? '/account' : '/login'}
          className={`flex flex-col items-center justify-center w-full min-h-[48px] py-1 text-[10px] font-bold transition-all ${
            isAccount ? 'text-[#f00856]' : 'text-slate-400 hover:text-white'
          }`}
        >
          {user ? (
            <User className={`w-5 h-5 mb-0.5 transition-transform ${isAccount ? 'scale-110' : ''}`} />
          ) : (
            <LogIn className={`w-5 h-5 mb-0.5 transition-transform ${isAccount ? 'scale-110' : ''}`} />
          )}
          <span className="tracking-tight">{user ? 'Mi Cuenta' : 'Ingresar'}</span>
        </Link>
      </div>
    </nav>
  );
}

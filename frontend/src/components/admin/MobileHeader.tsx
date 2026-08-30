import React from 'react';
import { Menu, Search, User, LogOut } from 'lucide-react';
import { STORE_ISOLOGO_URL } from '../../lib/brand';
import LocaleSwitcher from '../LocaleSwitcher';

interface MobileHeaderProps {
  title?: string;
  logoUrl?: string;
  onOpenDrawer: () => void;
  onOpenSearch?: () => void;
  userEmail?: string;
  onSignOut?: () => void;
}

export default function MobileHeader({
  title,
  logoUrl = STORE_ISOLOGO_URL,
  onOpenDrawer,
  onOpenSearch,
  userEmail,
  onSignOut
}: MobileHeaderProps) {
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 h-14 px-3 sm:px-4 flex items-center justify-between shadow-xs">
      {/* Left: Menu Hamburger & Brand/Title */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onOpenDrawer}
          className="p-2 text-gray-700 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Abrir navegación"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <img
            src={logoUrl}
            alt="Logo"
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
          <span className="font-extrabold text-gray-900 text-base tracking-tight truncate">
            {title || 'Collectibles'}
          </span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Buscar"
          >
            <Search className="w-5 h-5" />
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="p-1.5 text-gray-700 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors border border-gray-200 flex items-center justify-center w-8 h-8 bg-gray-50"
            aria-label="Menú de usuario"
          >
            <User className="w-4 h-4 text-gray-700" />
          </button>

          {showUserMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowUserMenu(false)} 
              />
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50 animate-fadeIn text-xs">
                {userEmail && (
                  <div className="px-3 py-2 border-b border-gray-100 font-semibold text-gray-500 truncate">
                    {userEmail}
                  </div>
                )}
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-medium">Idioma:</span>
                  <LocaleSwitcher compact />
                </div>
                {onSignOut && (
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onSignOut();
                    }}
                    className="w-full px-3 py-2 text-left text-red-600 font-medium hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Cerrar Sesión
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

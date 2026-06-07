import { ReactNode } from 'react';
import { useFeatures } from '../contexts/FeatureToggleContext';
import { useAuth } from '../contexts/AuthContext';
import { Store } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MarketplaceGuard({ children }: { children: ReactNode }) {
  const { features, loading: featuresLoading } = useFeatures();
  const { profile, loading: authLoading } = useAuth();

  if (featuresLoading || authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Store className="w-8 h-8 text-indigo-500 animate-pulse" />
      </div>
    );
  }

  // Si está habilitado o el usuario es admin, puede ver la ruta
  if (features.marketplaceEnabled || profile?.is_admin) {
    return <>{children}</>;
  }

  // De lo contrario, mostrar mensaje de bloqueo
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-4 text-center">
      <Store className="w-16 h-16 text-gray-300 mb-4" />
      <h1 className="text-2xl font-black text-gray-900 mb-2">Marketplace temporalmente no disponible</h1>
      <p className="text-gray-500 mb-6 max-w-md font-medium">
        Esta sección se encuentra en mantenimiento o desactivada por el momento.
      </p>
      <Link to="/shop" className="px-6 py-3 bg-black text-white font-bold rounded-full hover:bg-[#f00856] transition-colors">
        Explorar el Catálogo General
      </Link>
    </div>
  );
}

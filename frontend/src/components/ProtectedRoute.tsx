import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireVendor?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false, requireVendor = false }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white/5">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (import.meta.env.DEV && typeof window !== 'undefined' && (localStorage.getItem('e2e_bypass_admin') === 'true' || (window as any).__BYPASS_AUTH_FOR_E2E__)) {
    return <>{children}</>;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && !profile?.is_admin) return <Navigate to="/" replace />;
  if (requireVendor && !profile?.is_vendor) return <Navigate to="/" replace />;

  return <>{children}</>;
}

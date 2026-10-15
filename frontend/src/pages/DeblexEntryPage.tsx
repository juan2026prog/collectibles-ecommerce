import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Users, LogOut, Key, User, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DeblexAuth } from '../components/argentina/DeblexAuth';
import { DeblexPortal, DeblexAdminPackage } from '../components/argentina/DeblexPortal';
import { DeblexUserManagement, DeblexUserItem } from '../components/argentina/DeblexUserManagement';

export default function DeblexEntryPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deblexRole, setDeblexRole] = useState<'deblex_admin' | 'deblex_operator' | null>(null);
  const [activeTab, setActiveTab] = useState<'operations' | 'users' | 'profile'>('operations');
  const [packages, setPackages] = useState<DeblexAdminPackage[]>([]);
  const [usersList, setUsersList] = useState<DeblexUserItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Profile modal / state
  const [newPassword, setNewPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    checkAuthAndRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession?.user) {
        checkUserRole(currentSession.user.id, currentSession.user.email);
      } else {
        setDeblexRole(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAuthAndRole = async () => {
    setLoading(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      if (currentSession?.user) {
        await checkUserRole(currentSession.user.id, currentSession.user.email);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Error verificando sesión Deblex:', err);
      setLoading(false);
    }
  };

  const checkUserRole = async (userId: string, email?: string | null) => {
    try {
      // Validar identidad y rol en Supabase Cloud únicamente a través del user_id autenticado
      const { data, error } = await supabase
        .from('deblex_portal_users')
        .select('role, is_active, status')
        .eq('user_id', userId)
        .maybeSingle();

      if (data && data.is_active && data.status !== 'SUSPENDED') {
        setDeblexRole(data.role as any);
        await loadDeblexData(data.role);
      } else {
        // En caso de que el usuario no esté en deblex_portal_users, verificar si es superadministrador global
        const { data: profileData } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', userId)
          .maybeSingle();

        if (profileData?.is_admin) {
          setDeblexRole('deblex_admin');
          await loadDeblexData('deblex_admin');
        } else {
          setDeblexRole(null);
        }
      }
    } catch (err) {
      console.error('Error comprobando permisos Deblex:', err);
      setDeblexRole(null);
    } finally {
      setLoading(false);
    }
  };

  const loadDeblexData = async (role: string) => {
    setLoadingData(true);
    try {
      // 1. Load packages from Supabase Cloud
      const { data: pkgsData, error: pkgsErr } = await supabase
        .from('argentina_packages')
        .select('*')
        .order('created_at', { ascending: false });

      if (!pkgsErr && pkgsData) {
        setPackages(pkgsData as any);
      }

      // 2. Load users if deblex_admin
      if (role === 'deblex_admin') {
        await loadUsers();
      }
    } catch (err) {
      console.error('Error cargando datos Deblex:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('deblex_portal_users')
        .select('id, email, role, is_active, created_at')
        .order('created_at', { ascending: true });

      if (!error && data) {
        setUsersList(data as any);
      }
    } catch (err) {
      console.error('Error cargando usuarios Deblex:', err);
    }
  };

  const handleUpdatePackageStatus = async (
    packageId: string,
    newStatus: string,
    confirmedWeight?: number,
    guideNumber?: string
  ) => {
    try {
      const updates: any = {
        package_status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (confirmedWeight !== undefined) updates.confirmed_weight_kg = confirmedWeight;
      if (guideNumber !== undefined) updates.deblex_guide_number = guideNumber;
      if (newStatus === 'RECIBIDO_EN_DEPOSITO' || newStatus === 'DISPONIBLE_PARA_CONSOLIDAR') {
        updates.is_available_for_consolidation = true;
        updates.received_at_miami_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('argentina_packages')
        .update(updates)
        .eq('id', packageId);

      if (error) throw error;
      await loadDeblexData(deblexRole || 'deblex_operator');
    } catch (err) {
      console.error('Error al actualizar paquete:', err);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setDeblexRole(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setPasswordError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setPasswordError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordSuccess(true);
      setNewPassword('');
      setTimeout(() => setPasswordSuccess(false), 4000);
    } catch (err: any) {
      setPasswordError(err.message || 'Error al actualizar contraseña.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>Verificando credenciales de Deblex...</span>
        </div>
      </div>
    );
  }

  // Not logged in -> Show official Deblex Auth
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <DeblexAuth onSuccess={checkAuthAndRole} />
      </div>
    );
  }

  // Logged in but unauthorized role
  if (!deblexRole) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-3xl p-8 text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-white">Acceso Denegado al Portal Deblex</h2>
          <p className="text-xs text-gray-400">
            Tu cuenta (<strong className="text-white">{session.user?.email}</strong>) no posee permisos autorizados para operar en el depósito Deblex Miami.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-xs font-semibold rounded-xl text-gray-300"
            >
              Cerrar Sesión
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-xs font-bold rounded-xl text-gray-950"
            >
              Ir a la Tienda
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authorized Deblex Dashboard
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top Header */}
      <header className="border-b border-gray-800 bg-gray-900/60 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-amber-400 font-bold">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-sm tracking-tight text-white block">
                DEBLEX MIAMI OPERATIONS
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
                2301 NW 107th AVE · Ste #102 DAR101334
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-white">{session.user?.email}</span>
              <span className="text-[10px] text-amber-400 uppercase font-mono">
                {deblexRole === 'deblex_admin' ? 'Administrador' : 'Operador'}
              </span>
            </div>

            <button
              onClick={() => setActiveTab('profile')}
              className={`p-2 rounded-xl transition ${
                activeTab === 'profile' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
              title="Mi Perfil"
            >
              <User className="w-4 h-4" />
            </button>

            <button
              onClick={handleSignOut}
              className="p-2 rounded-xl bg-gray-800 hover:bg-red-950/60 text-gray-400 hover:text-red-400 transition"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
          <button
            onClick={() => setActiveTab('operations')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'operations'
                ? 'bg-amber-500 text-gray-950 shadow-lg shadow-amber-500/20 font-black'
                : 'text-gray-400 hover:text-white hover:bg-gray-900'
            }`}
          >
            <Package className="w-4 h-4" />
            Operaciones & Paquetes ({packages.length})
          </button>

          {deblexRole === 'deblex_admin' && (
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'bg-amber-500 text-gray-950 shadow-lg shadow-amber-500/20 font-black'
                  : 'text-gray-400 hover:text-white hover:bg-gray-900'
              }`}
            >
              <Users className="w-4 h-4" />
              Gestión de Usuarios ({usersList.length} / 8)
            </button>
          )}

          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'bg-amber-500 text-gray-950 shadow-lg shadow-amber-500/20 font-black'
                : 'text-gray-400 hover:text-white hover:bg-gray-900'
            }`}
          >
            <Key className="w-4 h-4" />
            Mi Perfil & Contraseña
          </button>
        </div>

        {/* Tab 1: Operations */}
        {activeTab === 'operations' && (
          <DeblexPortal
            packages={packages}
            onUpdateStatus={handleUpdatePackageStatus}
          />
        )}

        {/* Tab 2: User Management (deblex_admin only) */}
        {activeTab === 'users' && deblexRole === 'deblex_admin' && (
          <DeblexUserManagement
            currentUserEmail={session.user?.email}
            users={usersList}
            onRefreshUsers={loadUsers}
          />
        )}

        {/* Tab 3: Profile & Password */}
        {activeTab === 'profile' && (
          <div className="max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              Cambiar Contraseña
            </h3>
            <p className="text-xs text-gray-400">
              Podés actualizar tu contraseña de acceso a Supabase Auth en cualquier momento.
            </p>

            {passwordSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-200 text-xs rounded-lg flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Contraseña actualizada exitosamente.
              </div>
            )}

            {passwordError && (
              <div className="p-3 bg-red-950/40 border border-red-800 text-red-200 text-xs rounded-lg">
                {passwordError}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Nueva Contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold rounded-lg transition"
              >
                Actualizar Contraseña
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

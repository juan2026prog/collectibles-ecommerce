import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Users, LogOut, Key, User, ShieldAlert, CheckCircle, 
  BarChart3, RefreshCw, FileText, ChevronRight, Layers, DollarSign,
  Calendar, Download, ArrowUpRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DeblexAuth } from '../components/argentina/DeblexAuth';
import { DeblexPortal, DeblexAdminPackage, DeblexConsolidation } from '../components/argentina/DeblexPortal';
import { DeblexUserManagement, DeblexUserItem } from '../components/argentina/DeblexUserManagement';

export default function DeblexEntryPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deblexRole, setDeblexRole] = useState<'deblex_admin' | 'deblex_operator' | null>(null);
  const [activeTab, setActiveTab] = useState<'shipments' | 'billing' | 'users' | 'profile'>('shipments');
  const [packages, setPackages] = useState<DeblexAdminPackage[]>([]);
  const [consolidations, setConsolidations] = useState<DeblexConsolidation[]>([]);
  const [usersList, setUsersList] = useState<DeblexUserItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Billing view states
  const [billingPeriod, setBillingPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');

  // Profile modal / state
  const [newPassword, setNewPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    checkAuthAndRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession?.user) {
        checkUserRole(currentSession.user.id);
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
        await checkUserRole(currentSession.user.id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Error verificando sesión Deblex:', err);
      setLoading(false);
    }
  };

  const checkUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('deblex_portal_users')
        .select('role, is_active, status')
        .eq('user_id', userId)
        .maybeSingle();

      if (data && data.is_active && data.status !== 'SUSPENDED') {
        setDeblexRole(data.role as any);
        await loadDeblexData(data.role);
      } else {
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

  const loadDeblexData = async (role?: string) => {
    const currentRole = role || deblexRole;
    setLoadingData(true);
    try {
      // 1. Load packages
      const { data: pkgsData } = await supabase
        .from('argentina_packages')
        .select('*')
        .order('created_at', { ascending: false });

      if (pkgsData) {
        setPackages(pkgsData as any);
      }

      // 2. Load consolidations
      const { data: consData } = await supabase
        .from('argentina_consolidations')
        .select('*')
        .order('confirmed_at', { ascending: false });

      if (consData) {
        setConsolidations(consData as any);
      }

      // 3. Load users if admin
      if (currentRole === 'deblex_admin') {
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
        .select('id, email, role, is_active, status, created_at')
        .order('created_at', { ascending: true });

      if (!error && data) {
        setUsersList(data as any);
      }
    } catch (err) {
      console.error('Error cargando usuarios Deblex:', err);
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

  // Metrics computation for Header Tiles matching reference HTML
  const metrics = useMemo(() => {
    // Only active (non-cancelled) consolidations are considered operational units
    const activeConsolidations = consolidations.filter(c => c.status !== 'CANCELLED');
    const standalonePackages = packages.filter(p => !p.consolidation_id);
    const totalUnits = activeConsolidations.length + standalonePackages.length;

    const inTransitMiamiCount = 
      packages.filter(p => !p.consolidation_id && (p.package_status === 'EN_TRANSITO_MIAMI' || !p.package_status)).length +
      activeConsolidations.filter(c => c.status === 'EN_TRANSITO_MIAMI').length;

    const receivedMiamiCount = 
      packages.filter(p => !p.consolidation_id && (p.package_status === 'RECIBIDO_EN_DEPOSITO' || p.package_status === 'DISPONIBLE_PARA_CONSOLIDAR')).length +
      activeConsolidations.filter(c => c.status === 'CONFIRMED' || c.status === 'RECIBIDO_EN_DEPOSITO').length;

    return {
      totalUnits,
      inTransitMiami: inTransitMiamiCount,
      receivedMiami: receivedMiamiCount,
      closedConsolidations: activeConsolidations.length,
    };
  }, [packages, consolidations]);

  // Billing computations matching reference HTML
  const billingRange = useMemo(() => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    if (billingPeriod === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (billingPeriod === 'week') {
      const day = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - day);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (billingPeriod === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (billingPeriod === 'year') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (billingPeriod === 'custom') {
      start = customFrom ? new Date(customFrom + 'T00:00:00') : new Date('2000-01-01T00:00:00');
      end = customTo ? new Date(customTo + 'T23:59:59') : new Date('2100-01-01T23:59:59');
    }

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { start, end, label: `${fmt(start)} → ${fmt(end)}` };
  }, [billingPeriod, customFrom, customTo]);

  // Dispatched items eligible for logistics billing
  const dispatchedItems = useMemo(() => {
    const items: Array<{
      id: string;
      code: string;
      recipientName: string;
      kind: 'Consolidado' | 'Individual';
      weight: number;
      freightUsd: number;
      lpUsd: number;
      totalUsd: number;
      dispatchedAt: string;
    }> = [];

    // Consolidations dispatched or delivered
    consolidations.forEach(c => {
      const isDispatched = c.status === 'DISPATCHED' || c.status === 'EN_TRANSITO_ARGENTINA' || c.status === 'DELIVERED';
      if (isDispatched && c.dispatched_at) {
        const dDate = new Date(c.dispatched_at);
        if (dDate >= billingRange.start && dDate <= billingRange.end) {
          const w = Number(c.total_weight_kg || 0);
          const freight = Number(c.freight_usd || (w * 19.0));
          const lp = Number(c.single_logistic_pack_usd || (c.destination_zone === 'AMBA' ? 20.0 : 34.0));
          items.push({
            id: c.id,
            code: c.consolidation_code,
            recipientName: c.recipient_name,
            kind: 'Consolidado',
            weight: w,
            freightUsd: freight,
            lpUsd: lp,
            totalUsd: freight + lp,
            dispatchedAt: c.dispatched_at.slice(0, 10),
          });
        }
      }
    });

    // Standalone packages dispatched or delivered
    packages.filter(p => !p.consolidation_id).forEach(p => {
      const isDispatched = p.package_status === 'DISPATCHED' || p.package_status === 'EN_TRANSITO_ARGENTINA' || p.package_status === 'DELIVERED';
      if (isDispatched && p.dispatched_at) {
        const dDate = new Date(p.dispatched_at);
        if (dDate >= billingRange.start && dDate <= billingRange.end) {
          const w = Number(p.confirmed_weight_kg || p.estimated_weight_kg || 0.5);
          const freight = w * 19.0;
          const lp = 20.0;
          items.push({
            id: p.id,
            code: p.order_number || p.original_tracking_number,
            recipientName: p.recipient_name || 'Comprador Argentina',
            kind: 'Individual',
            weight: w,
            freightUsd: freight,
            lpUsd: lp,
            totalUsd: freight + lp,
            dispatchedAt: p.dispatched_at.slice(0, 10),
          });
        }
      }
    });

    return items;
  }, [consolidations, packages, billingRange]);

  const billingTotals = useMemo(() => {
    const totalFreight = dispatchedItems.reduce((acc, curr) => acc + curr.freightUsd, 0);
    const totalLp = dispatchedItems.reduce((acc, curr) => acc + curr.lpUsd, 0);
    return {
      totalUsd: totalFreight + totalLp,
      count: dispatchedItems.length,
      freightUsd: totalFreight,
      lpUsd: totalLp,
    };
  }, [dispatchedItems]);

  const handleExportBillingCsv = () => {
    const headers = ['Fecha despacho', 'ID / Codigo', 'Destinatario', 'Tipo', 'Peso kg', 'Flete USD', 'Logistic Pack USD', 'Total USD'];
    const rows = dispatchedItems.map(item => [
      item.dispatchedAt,
      item.code,
      item.recipientName,
      item.kind,
      item.weight.toFixed(2),
      item.freightUsd.toFixed(2),
      item.lpUsd.toFixed(2),
      item.totalUsd.toFixed(2),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturacion_logistica_deblex_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Resumen de facturación exportado exitosamente.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f3f6f8] flex items-center justify-center text-[#182f3c]">
        <div className="flex items-center gap-3 bg-white p-6 rounded-2xl shadow-sm border border-[#dce6eb]">
          <div className="w-5 h-5 border-2 border-[#146981] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold">Cargando Portal Envíos by Deblex...</span>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Envíos by Deblex Auth
  if (!session) {
    return (
      <div className="min-h-screen bg-[#f3f6f8]">
        <DeblexAuth onSuccess={checkAuthAndRole} />
      </div>
    );
  }

  // Logged in but unauthorized role
  if (!deblexRole) {
    return (
      <div className="min-h-screen bg-[#f3f6f8] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-[#dce6eb] rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-[#182f3c]">Acceso Denegado al Portal Deblex</h2>
          <p className="text-xs text-[#6b808d]">
            Tu cuenta (<strong className="text-[#182f3c]">{session.user?.email}</strong>) no posee permisos autorizados para operar en la plataforma logística Deblex Miami.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-xs font-semibold rounded-lg text-[#182f3c]"
            >
              Cerrar Sesión
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-[#146981] hover:bg-[#0e5266] text-xs font-bold rounded-lg text-white"
            >
              Ir a la Tienda
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Envíos by Deblex Layout (Shell + Side + Content)
  return (
    <div className="min-h-screen bg-[#f3f6f8] text-[#182f3c] font-sans flex flex-col md:flex-row">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-[#183a49] text-white text-xs font-medium px-4 py-3 rounded-lg shadow-2xl z-50 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#7bcede]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sidebar matching reference HTML */}
      <aside className="w-full md:w-[230px] bg-[#123040] text-[#d7e8ef] p-6 flex flex-col justify-between shrink-0">
        <div>
          <div className="border-b border-[#1f4559] pb-5">
            <div className="text-xl font-extrabold text-white tracking-tight">
              Envíos <span className="font-normal text-[#7bcede] italic">by Deblex</span>
            </div>
            <div className="text-xs text-[#a5c0ce] mt-1 font-medium">
              Portal privado · {deblexRole === 'deblex_admin' ? 'Administrador' : 'Operador'}
            </div>
          </div>

          <nav className="mt-6 flex flex-col gap-1.5">
            <button
              onClick={() => setActiveTab('shipments')}
              className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between ${
                activeTab === 'shipments'
                  ? 'bg-[#2d5365] text-white shadow-sm font-bold'
                  : 'text-[#b7d0dc] hover:bg-[#1a3d50] hover:text-white'
              }`}
            >
              <span>Envíos y Consolidados</span>
              <span className="text-[10px] bg-[#1a3d50] px-1.5 py-0.5 rounded font-mono text-[#7bcede]">
                {metrics.totalUnits}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('billing')}
              className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between ${
                activeTab === 'billing'
                  ? 'bg-[#2d5365] text-white shadow-sm font-bold'
                  : 'text-[#b7d0dc] hover:bg-[#1a3d50] hover:text-white'
              }`}
            >
              <span>Facturación logística</span>
              {dispatchedItems.length > 0 && (
                <span className="text-[10px] bg-[#146981] text-white px-1.5 py-0.5 rounded font-mono">
                  {dispatchedItems.length}
                </span>
              )}
            </button>

            {deblexRole === 'deblex_admin' && (
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between ${
                  activeTab === 'users'
                    ? 'bg-[#2d5365] text-white shadow-sm'
                    : 'text-[#b7d0dc] hover:bg-[#1a3d50] hover:text-white'
                }`}
              >
                <span>Gestión de usuarios</span>
                <span className="text-[10px] bg-[#1a3d50] px-1.5 py-0.5 rounded font-mono text-[#7bcede]">
                  {usersList.length}/8
                </span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between ${
                activeTab === 'profile'
                  ? 'bg-[#2d5365] text-white shadow-sm font-bold'
                  : 'text-[#b7d0dc] hover:bg-[#1a3d50] hover:text-white'
              }`}
            >
              <span>Mi Perfil y Contraseña</span>
            </button>
          </nav>
        </div>

        {/* User badge and logout in sidebar footer */}
        <div className="mt-8 pt-5 border-t border-[#1f4559] flex items-center justify-between">
          <div className="truncate pr-2">
            <div className="text-xs font-semibold text-white truncate">{session.user?.email}</div>
            <div className="text-[10px] text-[#7bcede] font-mono uppercase">
              {deblexRole === 'deblex_admin' ? 'Admin Logístico' : 'Operador Miami'}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            title="Cerrar Sesión"
            className="p-2 rounded-lg bg-[#1a3d50] hover:bg-red-900/40 text-[#a5c0ce] hover:text-red-300 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area — Full horizontal width without restrictive max-w */}
      <main className="flex-1 p-5 md:p-8 w-full min-w-0 space-y-6">
        {/* Top Header matching reference HTML */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#dce6eb]">
          <div>
            <h1 className="text-2xl font-bold text-[#182f3c] tracking-tight">Gestión logística</h1>
            <p className="text-xs text-[#6b808d] mt-0.5">
              Paquetes, consolidados cerrados por clientes, edición autorizada y cargos por envío
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 bg-white border border-[#d5e2e6] rounded-lg text-xs font-medium text-[#182f3c] shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Acceso privado · Staging Online</span>
            </div>
            <button
              onClick={() => loadDeblexData()}
              disabled={loadingData}
              title="Recargar datos"
              className="p-2 bg-white hover:bg-[#edf6f8] border border-[#cedbe1] rounded-lg text-[#173846] transition"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* 4 KPI Metric Tiles matching reference HTML */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-[#dce6eb] rounded-xl p-4 shadow-sm">
            <span className="text-xs text-[#6b808d] font-medium">Unidades logísticas</span>
            <b className="block text-2xl font-extrabold text-[#182f3c] my-1">{metrics.totalUnits}</b>
            <span className="text-[11px] text-[#718795]">Individuales + consolidados</span>
          </div>

          <div className="bg-white border border-[#dce6eb] rounded-xl p-4 shadow-sm">
            <span className="text-xs text-[#6b808d] font-medium">En tránsito a Miami</span>
            <b className="block text-2xl font-extrabold text-[#182f3c] my-1">{metrics.inTransitMiami}</b>
            <span className="text-[11px] text-[#718795]">Vuelo / Courier internacional</span>
          </div>

          <div className="bg-white border border-[#dce6eb] rounded-xl p-4 shadow-sm">
            <span className="text-xs text-[#6b808d] font-medium">Recibidos en Miami</span>
            <b className="block text-2xl font-extrabold text-[#182f3c] my-1">{metrics.receivedMiami}</b>
            <span className="text-[11px] text-[#718795]">En depósito Deblex</span>
          </div>

          <div className="bg-white border border-[#dce6eb] rounded-xl p-4 shadow-sm">
            <span className="text-xs text-[#6b808d] font-medium">Consolidados oficiales</span>
            <b className="block text-2xl font-extrabold text-[#146981] my-1">{metrics.closedConsolidations}</b>
            <span className="text-[11px] text-[#718795]">Consolidados vigentes en operación</span>
          </div>
        </div>

        {/* Banner informativo de consolidación */}
        <div className="bg-[#e8f4f7] border border-[#cde5ed] rounded-xl p-3.5 text-xs text-[#2b6375] flex items-start gap-3">
          <span className="text-base leading-none">ℹ️</span>
          <div>
            <b>Consolidados de compradores y edición autorizada:</b> El cliente agrupa y confirma sus pedidos desde su cuenta en Collectibles generando un código oficial único. Los operadores y administradores de Deblex pueden gestionar despachos, ajustar pesos confirmados y editar integrantes cuando sea necesario con auditoría completa.
          </div>
        </div>

        {/* Tab 1: Envíos y Consolidados */}
        {activeTab === 'shipments' && (
          <DeblexPortal
            packages={packages}
            consolidations={consolidations}
            userRole={deblexRole}
            onRefreshData={loadDeblexData}
            onShowToast={showToast}
          />
        )}

        {/* Tab 2: Facturación Logística matching reference HTML */}
        {activeTab === 'billing' && (
          <div className="bg-white border border-[#dce6eb] rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#edf1f4]">
              <div>
                <h2 className="text-base font-bold text-[#182f3c]">Facturación de envíos</h2>
                <p className="text-xs text-[#6b808d] mt-0.5">
                  Costos generados por período · USD 19/kg + Logistic Pack por despacho
                </p>
              </div>
              <button
                onClick={handleExportBillingCsv}
                className="px-3.5 py-2 bg-white hover:bg-[#edf6f8] border border-[#cedbe1] rounded-lg text-xs font-semibold text-[#173846] transition flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5" />
                <span>↓ Exportar resumen CSV</span>
              </button>
            </div>

            {/* Range filters */}
            <div className="p-5 pb-3 border-b border-[#edf1f4] flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-[#f3f6f8] p-1 rounded-lg border border-[#dce6eb]">
                {(['day', 'week', 'month', 'year', 'custom'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setBillingPeriod(p)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                      billingPeriod === p
                        ? 'bg-[#146981] text-white shadow-sm font-semibold'
                        : 'text-[#6b808d] hover:text-[#182f3c]'
                    }`}
                  >
                    {p === 'day' ? 'Hoy' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : p === 'year' ? 'Año' : 'Personalizado'}
                  </button>
                ))}
              </div>

              {billingPeriod === 'custom' && (
                <div className="flex items-center gap-2 text-xs text-[#617885]">
                  <label className="flex items-center gap-1.5">
                    <span>Desde</span>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                      className="border border-[#cddbe1] rounded-lg px-2.5 py-1 text-xs text-[#173846]"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span>Hasta</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                      className="border border-[#cddbe1] rounded-lg px-2.5 py-1 text-xs text-[#173846]"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-[#fafcfd] border-b border-[#edf1f4]">
              <div>
                <small className="block text-[11px] text-[#718694] font-medium">Importe logístico generado (USD)</small>
                <strong className="block text-2xl font-black text-[#146981] mt-1">
                  USD {billingTotals.totalUsd.toFixed(2)}
                </strong>
              </div>
              <div>
                <small className="block text-[11px] text-[#718694] font-medium">Envíos facturables</small>
                <strong className="block text-2xl font-black text-[#182f3c] mt-1">
                  {billingTotals.count}
                </strong>
              </div>
              <div>
                <small className="block text-[11px] text-[#718694] font-medium">Desglose flete / Logistic Pack</small>
                <strong className="block text-base font-bold text-[#182f3c] mt-2">
                  USD {billingTotals.freightUsd.toFixed(2)} / USD {billingTotals.lpUsd.toFixed(2)}
                </strong>
              </div>
            </div>

            <div className="px-5 py-2.5 bg-white border-b border-[#edf1f4] text-xs text-[#758996]">
              Período: <b>{billingRange.label}</b> · Cargos computados al marcar «En tránsito a Argentina» (DISPATCHED)
            </div>

            {/* Billing Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f5f8fa] text-[#698190] border-b border-[#edf1f4]">
                    <th className="py-3 px-4 font-semibold">Fecha despacho</th>
                    <th className="py-3 px-4 font-semibold">ID / Código</th>
                    <th className="py-3 px-4 font-semibold">Destinatario</th>
                    <th className="py-3 px-4 font-semibold">Tipo</th>
                    <th className="py-3 px-4 font-semibold">Peso kg</th>
                    <th className="py-3 px-4 font-semibold">Flete USD</th>
                    <th className="py-3 px-4 font-semibold">LP USD</th>
                    <th className="py-3 px-4 font-semibold">Total USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f4]">
                  {dispatchedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#718895] text-xs">
                        No hay cargos logísticos generados en este período seleccionado.
                      </td>
                    </tr>
                  ) : (
                    dispatchedItems.map(item => (
                      <tr key={item.id} className="hover:bg-[#f8fbfc]">
                        <td className="py-3 px-4 font-mono text-gray-600">{item.dispatchedAt}</td>
                        <td className="py-3 px-4 font-mono font-bold text-[#146981]">{item.code}</td>
                        <td className="py-3 px-4 font-medium text-[#182f3c]">{item.recipientName}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.kind === 'Consolidado' ? 'bg-[#dff2e9] text-[#146946]' : 'bg-[#e7f3f7] text-[#125d77]'
                          }`}>
                            {item.kind}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">{item.weight.toFixed(2)} kg</td>
                        <td className="py-3 px-4 font-mono">USD {item.freightUsd.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono">USD {item.lpUsd.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono font-bold text-[#182f3c]">
                          USD {item.totalUsd.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-[#fafcfd] border-t border-[#e5edf0] text-xs text-[#617986]">
              <b>Criterio operativo:</b> el cargo se contabiliza una sola vez cuando Deblex marca el envío «En tránsito a Argentina» (DISPATCHED), empleando la fecha de ese cambio y el peso facturable registrado. Los envíos en Miami no se consideran devengados.
            </div>
          </div>
        )}

        {/* Tab 3: Gestión de Usuarios (Admin only) */}
        {activeTab === 'users' && deblexRole === 'deblex_admin' && (
          <DeblexUserManagement
            currentUserEmail={session.user?.email}
            users={usersList}
            onRefreshUsers={loadUsers}
          />
        )}

        {/* Tab 4: Mi Perfil & Contraseña */}
        {activeTab === 'profile' && (
          <div className="max-w-md bg-white border border-[#dce6eb] rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#edf1f4] pb-3">
              <Key className="w-5 h-5 text-[#146981]" />
              <h3 className="text-base font-bold text-[#182f3c]">Cambiar Contraseña</h3>
            </div>
            <p className="text-xs text-[#6b808d]">
              Podés actualizar tu contraseña de acceso a Supabase Auth en cualquier momento.
            </p>

            {passwordSuccess && (
              <div className="p-3 bg-[#dff2e9] border border-[#a3dcbe] text-[#146946] text-xs rounded-lg flex items-center gap-2 font-medium">
                <CheckCircle className="w-4 h-4 text-[#146946]" />
                <span>Contraseña actualizada exitosamente.</span>
              </div>
            )}

            {passwordError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
                {passwordError}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#617885] font-semibold mb-1">Nueva Contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  className="w-full bg-white border border-[#cddbe1] rounded-lg p-2.5 text-[#182f3c] focus:outline-none focus:border-[#146981]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#146981] hover:bg-[#0e5266] text-white font-bold rounded-lg transition shadow-sm"
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

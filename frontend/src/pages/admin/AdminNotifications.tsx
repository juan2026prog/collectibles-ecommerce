import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Bell,
  RefreshCw,
  CheckCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Mail,
  BellRing,
  MessageSquare,
  Search,
  Filter,
  ExternalLink,
  RotateCcw,
  Settings,
  Layers,
  Activity,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/admin/Toast';

type TabKey = 'feed' | 'logs' | 'outbox' | 'errors';

export default function AdminNotifications() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('feed');
  const [loading, setLoading] = useState(true);
  const [processingOutbox, setProcessingOutbox] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Data
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [logItems, setLogItems] = useState<any[]>([]);
  const [outboxItems, setOutboxItems] = useState<any[]>([]);

  // Filters
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [feedRes, logsRes, outboxRes] = await Promise.all([
        supabase
          .from('user_notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('notification_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('notification_outbox')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      if (feedRes.data) setFeedItems(feedRes.data);
      if (logsRes.data) setLogItems(logsRes.data);
      if (outboxRes.data) setOutboxItems(outboxRes.data);
    } catch (err: any) {
      console.error('[AdminNotifications] Error loading data:', err);
      toast.error('Error al cargar el centro de actividad');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleDrainOutbox = async () => {
    setProcessingOutbox(true);
    try {
      const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
        body: { event_type: 'process_outbox', batch_size: 25 },
      });
      if (error) throw error;
      toast.success(
        `Cola procesada: ${data?.processed || 0} enviados, ${data?.retried || 0} en reintento`
      );
      await loadAllData();
    } catch (err: any) {
      toast.error(err.message || 'No se pudo procesar la cola outbox');
    } finally {
      setProcessingOutbox(false);
    }
  };

  const handleRetryNotification = async (params: { outbox_id?: string; log_id?: string }) => {
    const key = params.outbox_id || params.log_id || '';
    if (!key) return;
    setRetryingId(key);
    try {
      const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
        body: {
          event_type: 'retry_notification',
          ...params,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success('Reenvío ejecutado correctamente');
      } else {
        toast.error(data?.error || 'El proveedor rechazó el reintento');
      }
      await loadAllData();
    } catch (err: any) {
      toast.error(err.message || 'Error al reintentar notificación');
    } finally {
      setRetryingId(null);
    }
  };

  const handleMarkAllAdminRead = async () => {
    try {
      const nowIso = new Date().toISOString();
      await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: nowIso })
        .eq('role_scope', 'admin')
        .eq('is_read', false);
      setFeedItems((prev) =>
        prev.map((item) =>
          item.role_scope === 'admin' ? { ...item, is_read: true, read_at: nowIso } : item
        )
      );
      toast.success('Notificaciones de Admin marcadas como leídas');
    } catch {
      toast.error('No se pudieron actualizar las notificaciones');
    }
  };

  // Filtered Views
  const filteredFeed = feedItems.filter((item) => {
    if (roleFilter !== 'all' && item.role_scope !== roleFilter) return false;
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        (item.title || '').toLowerCase().includes(q) ||
        (item.body || '').toLowerCase().includes(q) ||
        (item.event_type || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const filteredLogs = logItems.filter((log) => {
    if (roleFilter !== 'all' && log.scope !== roleFilter) return false;
    if (channelFilter !== 'all' && log.channel !== channelFilter) return false;
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        (log.event_type || '').toLowerCase().includes(q) ||
        (log.recipient_number_masked || '').toLowerCase().includes(q) ||
        (log.error_message || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const filteredOutbox = outboxItems.filter((ob) => {
    if (statusFilter !== 'all' && ob.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        (ob.event_type || '').toLowerCase().includes(q) ||
        (ob.idempotency_key || '').toLowerCase().includes(q) ||
        (ob.last_error || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const errorLogs = logItems.filter((l) =>
    ['failed', 'retrying', 'exhausted', 'bounced', 'rejected', 'delivery_delayed', 'provider_unavailable'].includes(l.status)
  );
  const historicalExpiredCount = logItems.filter((l) => l.status === 'expired').length;
  const errorOutbox = outboxItems.filter((o) =>
    ['failed', 'retrying', 'exhausted'].includes(o.status)
  );

  // Metrics
  const sentCount = logItems.filter((l) => l.status === 'sent' || l.status === 'delivered').length;
  const deliveredConfirmedCount = logItems.filter((l) => l.status === 'delivered').length;
  const pendingOutboxCount = outboxItems.filter((o) =>
    ['pending', 'processing', 'retrying'].includes(o.status)
  ).length;
  const totalErrorsCount = errorLogs.length + errorOutbox.length;

  const getRoleBadge = (scope: string) => {
    switch (scope) {
      case 'admin':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'vendor':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'affiliate':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'customer':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'sent':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'pending':
      case 'queued':
      case 'processing':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'retrying':
      case 'delivery_delayed':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'provider_unavailable':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'bounced':
      case 'rejected':
      case 'failed':
      case 'exhausted':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'expired':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'queued':
        return 'En cola (queued)';
      case 'sent':
        return 'Aceptado API (sent)';
      case 'delivered':
        return 'Entregado (delivered)';
      case 'delivery_delayed':
        return 'Demorado (delayed)';
      case 'bounced':
        return 'Rebotado (bounced)';
      case 'rejected':
        return 'Rechazado (complained)';
      case 'failed':
        return 'Fallido (failed)';
      case 'retrying':
        return 'Reintentando';
      case 'exhausted':
        return 'Agotado DLQ';
      case 'provider_unavailable':
        return 'Proveedor No Disponible';
      case 'expired':
        return 'Histórico Legacy (expired)';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#f00856]/10 text-[#f00856]">
              <Bell className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">
              Centro Unificado de Notificaciones y Actividad
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Monitoreo multicanal en tiempo real para Clientes, Administradores, Vendors e Influencers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleDrainOutbox}
            disabled={processingOutbox}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#f00856] text-white hover:bg-[#d0074a] transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Send className={`w-3.5 h-3.5 ${processingOutbox ? 'animate-pulse' : ''}`} />
            <span>{processingOutbox ? 'Procesando Cola...' : 'Procesar Cola Outbox'}</span>
          </button>

          <Link
            to="/admin/settings?tab=notifications"
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Configurar Preferencias Admin</span>
          </Link>

          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            title="Recargar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI & Channel Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Eventos en Feed
            </span>
            <Activity className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-gray-900 mt-2">{feedItems.length}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            {feedItems.filter((f) => !f.is_read && f.role_scope === 'admin').length} sin leer en Admin
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Entregas Exitosas
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">{sentCount}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            {deliveredConfirmedCount} entregados confirmados · {sentCount - deliveredConfirmedCount} aceptados API
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              En Cola / Reintento
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">{pendingOutboxCount}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            Outbox transaccional con backoff exponencial
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Incidencias Activas
            </span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">{totalErrorsCount}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            Histórico legacy (Jun–Ago): {historicalExpiredCount} archivados sin reproceso
          </p>
        </div>
      </div>

      {/* Tabs & Filters Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {/* Tabs Header */}
        <div className="px-6 pt-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {[
              { id: 'feed', label: 'Actividad Comercial (In-App)', icon: Layers, count: feedItems.length },
              { id: 'logs', label: 'Registros de Entrega (Email/Push)', icon: Mail, count: logItems.length },
              { id: 'outbox', label: 'Cola Outbox Transaccional', icon: Clock, count: outboxItems.length },
              { id: 'errors', label: 'Centro de Errores y Reintentos', icon: AlertTriangle, count: totalErrorsCount },
            ].map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as TabKey)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-extrabold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'border-[#f00856] text-[#f00856] bg-white rounded-t-xl'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      active ? 'bg-[#f00856]/10 text-[#f00856]' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          {activeTab === 'feed' && (
            <button
              type="button"
              onClick={handleMarkAllAdminRead}
              className="mb-2 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5 text-[#f00856]" />
              <span>Marcar Admin como leídas</span>
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por pedido, evento, destinatario o mensaje..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f00856]/20 focus:border-[#f00856]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            {(activeTab === 'feed' || activeTab === 'logs') && (
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-xs font-bold border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 text-gray-700"
              >
                <option value="all">Todos los Roles</option>
                <option value="admin">Admin</option>
                <option value="vendor">Vendor</option>
                <option value="customer">Cliente</option>
                <option value="affiliate">Influencer / Afiliado</option>
              </select>
            )}

            {activeTab === 'feed' && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs font-bold border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 text-gray-700"
              >
                <option value="all">Todas las Categorías</option>
                <option value="sales">Ventas</option>
                <option value="purchases">Compras</option>
                <option value="payments">Pagos</option>
                <option value="shipments">Envíos / Tracking</option>
                <option value="deliveries">Entregas</option>
                <option value="returns">Devoluciones / Reembolsos</option>
                <option value="claims">Reclamos / Disputas</option>
                <option value="commissions">Comisiones Afiliados</option>
                <option value="payouts">Liquidaciones Vendors</option>
                <option value="questions">Preguntas Q&A</option>
                <option value="alerts">Alertas Prioritarias</option>
              </select>
            )}

            {activeTab === 'logs' && (
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="text-xs font-bold border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 text-gray-700"
              >
                <option value="all">Todos los Canales</option>
                <option value="email">Email (Resend)</option>
                <option value="push">Push (OneSignal)</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            )}

            {(activeTab === 'logs' || activeTab === 'outbox') && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-bold border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 text-gray-700"
              >
                <option value="all">Todos los Estados</option>
                <option value="delivered">Entregado Confirmado (delivered)</option>
                <option value="sent">Aceptado API (sent)</option>
                <option value="queued">En Cola (queued)</option>
                <option value="pending">Pendiente Outbox (pending)</option>
                <option value="delivery_delayed">Entrega Demorada (delayed)</option>
                <option value="retrying">Reintentando (retrying)</option>
                <option value="bounced">Rebotado (bounced)</option>
                <option value="rejected">Rechazado / Spam (rejected)</option>
                <option value="failed">Fallido (failed)</option>
                <option value="exhausted">Agotado DLQ (exhausted)</option>
                <option value="provider_unavailable">Proveedor No Disponible</option>
                <option value="expired">Histórico Legacy Jun-Ago (expired)</option>
              </select>
            )}
          </div>
        </div>

        {/* TAB 1: GLOBAL ACTIVITY FEED */}
        {activeTab === 'feed' && (
          <div className="overflow-x-auto">
            {filteredFeed.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-500">
                No hay eventos de actividad comercial que coincidan con los filtros seleccionados.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <th className="px-5 py-3">Fecha</th>
                    <th className="px-5 py-3">Rol</th>
                    <th className="px-5 py-3">Categoría</th>
                    <th className="px-5 py-3">Título y Detalle</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredFeed.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50/80 ${
                        !item.is_read && item.role_scope === 'admin' ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <td className="px-5 py-3.5 font-mono text-gray-500 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString('es-UY')}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${getRoleBadge(
                            item.role_scope
                          )}`}
                        >
                          {item.role_scope}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-bold text-[10px] uppercase">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 max-w-md">
                        <p className="font-bold text-gray-900">{item.title}</p>
                        <p className="text-gray-500 text-[11px] mt-0.5 line-clamp-2">{item.body}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        {item.is_read ? (
                          <span className="text-[10px] font-bold text-gray-400">Leída</span>
                        ) : (
                          <span className="text-[10px] font-bold text-[#f00856]">Sin leer</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {item.action_url && (
                          <button
                            type="button"
                            onClick={() => {
                              if (item.action_url.startsWith('http')) {
                                try {
                                  const u = new URL(item.action_url);
                                  navigate(u.pathname + u.search + u.hash);
                                } catch {
                                  window.location.href = item.action_url;
                                }
                              } else {
                                navigate(item.action_url);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-[11px] cursor-pointer"
                          >
                            <span>Abrir</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: DELIVERY LOGS */}
        {activeTab === 'logs' && (
          <div className="overflow-x-auto">
            {filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-500">
                No se encontraron registros de entrega para los filtros aplicados.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <th className="px-5 py-3">Fecha</th>
                    <th className="px-5 py-3">Canal</th>
                    <th className="px-5 py-3">Rol</th>
                    <th className="px-5 py-3">Evento</th>
                    <th className="px-5 py-3">Destinatario (Enmascarado)</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3">Detalle / Provider ID</th>
                    <th className="px-5 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/70">
                      <td className="px-5 py-3.5 font-mono text-gray-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('es-UY')}
                      </td>
                      <td className="px-5 py-3.5 font-bold uppercase text-gray-800">
                        <span className="inline-flex items-center gap-1.5">
                          {log.channel === 'email' ? (
                            <Mail className="w-3.5 h-3.5 text-blue-600" />
                          ) : log.channel === 'push' ? (
                            <BellRing className="w-3.5 h-3.5 text-indigo-600" />
                          ) : (
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          {log.channel}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${getRoleBadge(
                            log.scope
                          )}`}
                        >
                          {log.scope}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-bold text-gray-900">{log.event_type}</td>
                      <td className="px-5 py-3.5 font-mono text-gray-600">
                        {log.recipient_number_masked || '-'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${getStatusBadge(
                            log.status
                          )}`}
                        >
                          {getStatusLabel(log.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 max-w-xs truncate">
                        {log.error_message || log.provider_message_id || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {['failed', 'retrying', 'exhausted', 'bounced', 'rejected'].includes(log.status) &&
                          log.outbox_id && (
                            <button
                              type="button"
                              disabled={retryingId === log.outbox_id}
                              onClick={() => handleRetryNotification({ outbox_id: log.outbox_id })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reintentar</span>
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: OUTBOX QUEUE */}
        {activeTab === 'outbox' && (
          <div className="overflow-x-auto">
            {filteredOutbox.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-500">
                La cola transaccional Outbox no presenta registros con este filtro.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <th className="px-5 py-3">Creado</th>
                    <th className="px-5 py-3">Evento</th>
                    <th className="px-5 py-3">Clave Idempotencia</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3">Intentos</th>
                    <th className="px-5 py-3">Último Error</th>
                    <th className="px-5 py-3 text-right">Reprocesar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredOutbox.map((ob) => (
                    <tr key={ob.id} className="hover:bg-gray-50/70">
                      <td className="px-5 py-3.5 font-mono text-gray-500 whitespace-nowrap">
                        {new Date(ob.created_at).toLocaleString('es-UY')}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-gray-900">{ob.event_type}</td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-gray-500 max-w-xs truncate">
                        {ob.idempotency_key}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${getStatusBadge(
                            ob.status
                          )}`}
                        >
                          {ob.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono">
                        {ob.attempts} / {ob.max_attempts}
                      </td>
                      <td className="px-5 py-3.5 text-rose-600 max-w-xs truncate">
                        {ob.last_error || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={retryingId === ob.id}
                          onClick={() => handleRetryNotification({ outbox_id: ob.id })}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-[11px] cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw
                            className={`w-3 h-3 ${retryingId === ob.id ? 'animate-spin' : ''}`}
                          />
                          <span>Reintentar envío</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 4: ERROR CENTER */}
        {activeTab === 'errors' && (
          <div className="p-6 space-y-6">
            <div>
              <h4 className="text-sm font-extrabold text-gray-900 mb-3">
                Eventos Outbox con Fallo o Reintento Pendiente ({errorOutbox.length})
              </h4>
              {errorOutbox.length === 0 ? (
                <div className="p-6 rounded-xl bg-emerald-50/60 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>No hay eventos atascados ni fallidos en la cola Outbox.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {errorOutbox.map((ob) => (
                    <div
                      key={ob.id}
                      className="p-4 rounded-xl border border-rose-200 bg-rose-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-gray-900">
                            {ob.event_type}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${getStatusBadge(
                              ob.status
                            )}`}
                          >
                            {ob.status} (Intento {ob.attempts}/{ob.max_attempts})
                          </span>
                        </div>
                        <p className="text-xs text-rose-700 mt-1">
                          {ob.last_error || 'Error transitorio de red o proveedor'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={retryingId === ob.id}
                        onClick={() => handleRetryNotification({ outbox_id: ob.id })}
                        className="px-3.5 py-2 rounded-xl bg-[#f00856] text-white font-bold text-xs hover:bg-[#d0074a] flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reintentar Ahora</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-extrabold text-gray-900 mb-3">
                Registros de Canal No Entregados ({errorLogs.length})
              </h4>
              {errorLogs.length === 0 ? (
                <div className="p-6 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-xs">
                  No se registran errores de entrega recientes.
                </div>
              ) : (
                <div className="space-y-2">
                  {errorLogs.slice(0, 30).map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl border border-gray-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold uppercase text-gray-700">{log.channel}</span>
                          <span className="font-extrabold text-gray-900">{log.event_type}</span>
                          <span className="font-mono text-gray-500">
                            {log.recipient_number_masked}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${getStatusBadge(
                              log.status
                            )}`}
                          >
                            {getStatusLabel(log.status)}
                          </span>
                        </div>
                        <p className="text-gray-500 mt-1">{log.error_message || '-'}</p>
                      </div>
                      {log.outbox_id && (
                        <button
                          type="button"
                          disabled={retryingId === log.outbox_id}
                          onClick={() => handleRetryNotification({ outbox_id: log.outbox_id })}
                          className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reintentar</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-slate-800">Archivo Histórico Legacy (Jun–Ago 2026):</span>{' '}
                Los registros históricos del sistema anterior con estado <code className="font-mono bg-slate-200/70 px-1 py-0.5 rounded">expired</code> (canal WhatsApp pre-migración) se conservan para trazabilidad, se encuentran excluidos del reprocesamiento automático y no alteran los indicadores operativos actuales.
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('expired');
                  setActiveTab('logs');
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 shrink-0 cursor-pointer"
              >
                Ver archivo histórico
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

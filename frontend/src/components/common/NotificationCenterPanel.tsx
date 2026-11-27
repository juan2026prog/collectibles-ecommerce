import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  RefreshCw,
  Filter,
  Calendar,
  ExternalLink,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  Sparkles,
  Mail,
  BellRing,
  MessageSquare,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Settings,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  requestAndRegisterPush,
  unregisterCurrentDevice,
  getPushStatus,
  type PushStatusInfo,
} from '../../lib/pushNotifications';
import type { NotificationRoleScope, UserNotificationItem } from './NotificationBell';

interface NotificationCenterPanelProps {
  roleScope: NotificationRoleScope;
  theme?: 'light' | 'dark';
  showPreferences?: boolean;
}

const ROLE_CATEGORIES: Record<
  NotificationRoleScope,
  Array<{ key: string; label: string; desc: string; mandatory?: boolean }>
> = {
  customer: [
    {
      key: 'purchases',
      label: 'Compras y confirmación de pago',
      desc: 'Comprobantes de orden creada, pago aprobado o pago rechazado.',
      mandatory: true,
    },
    {
      key: 'shipments',
      label: 'Preparación y despacho con tracking',
      desc: 'Avisos cuando tu pedido o suborden entra en preparación o es despachado con guía.',
      mandatory: true,
    },
    {
      key: 'deliveries',
      label: 'Confirmación de entrega',
      desc: 'Aviso automático cuando el transportista confirma la entrega de tu compra.',
    },
    {
      key: 'returns',
      label: 'Cancelaciones, devoluciones y reembolsos',
      desc: 'Actualizaciones de solicitudes posventa y acreditación de reembolsos.',
      mandatory: true,
    },
    {
      key: 'questions',
      label: 'Respuestas a mis preguntas',
      desc: 'Aviso cuando un vendedor o Collectibles responde tu consulta en un producto.',
    },
  ],
  affiliate: [
    {
      key: 'commissions',
      label: 'Ventas atribuidas y comisiones generadas',
      desc: 'Avisos cuando tu código se utiliza en checkout y cuando se confirma una venta pagada.',
    },
    {
      key: 'payouts',
      label: 'Aprobación, ajustes y pago de comisiones',
      desc: 'Notificaciones sobre solicitudes de retiro, comisiones liquidadas o ajustadas por reembolsos.',
    },
    {
      key: 'codes',
      label: 'Estado de mis códigos promocionales',
      desc: 'Alertas si un código promocional es desactivado o está próximo a vencer.',
    },
  ],
  vendor: [
    {
      key: 'sales',
      label: 'Nuevas ventas pagadas y asignaciones',
      desc: 'Avisos inmediatos de nuevas subórdenes pagadas listas para preparar.',
      mandatory: true,
    },
    {
      key: 'shipments',
      label: 'Seguimiento de envíos y entregas',
      desc: 'Cambios de estado logístico y confirmación de entrega al comprador.',
    },
    {
      key: 'returns',
      label: 'Devoluciones, reclamos y contracargos',
      desc: 'Alertas prioritarias sobre solicitudes posventa, reembolsos o disputas.',
      mandatory: true,
    },
    {
      key: 'payouts',
      label: 'Liquidaciones y ajustes financieros',
      desc: 'Avisos de nueva liquidación disponible, pagos acreditados y ajustes.',
    },
    {
      key: 'questions',
      label: 'Preguntas de compradores',
      desc: 'Consultas recibidas en las publicaciones de tu tienda.',
    },
  ],
  admin: [
    {
      key: 'sales',
      label: 'Ventas consolidadas',
      desc: 'Registro de órdenes pagadas según el modo configurado.',
    },
    {
      key: 'returns',
      label: 'Devoluciones y reembolsos',
      desc: 'Solicitudes posventa y reembolsos manuales o automáticos.',
    },
    {
      key: 'alerts',
      label: 'Alertas operativas e incidencias',
      desc: 'Fallos de compras internacionales, contracargos y stock crítico.',
    },
  ],
};

const CATEGORY_BADGE_LABELS: Record<string, string> = {
  all: 'Todas',
  sales: 'Ventas',
  purchases: 'Compras',
  payments: 'Pagos',
  shipments: 'Envíos',
  deliveries: 'Entregas',
  returns: 'Devoluciones',
  claims: 'Reclamos',
  commissions: 'Comisiones',
  payouts: 'Liquidaciones',
  questions: 'Preguntas',
  alerts: 'Alertas',
  summaries: 'Resúmenes',
};

const PAGE_SIZE = 12;

export function NotificationCenterPanel({
  roleScope,
  theme = 'light',
  showPreferences = true,
}: NotificationCenterPanelProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  const [items, setItems] = useState<UserNotificationItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');

  // Preferences state
  const [channels, setChannels] = useState<{
    email: boolean;
    push: boolean;
    in_app: boolean;
    whatsapp: boolean;
  }>({
    email: true,
    push: true,
    in_app: true,
    whatsapp: false,
  });
  const [categoriesPref, setCategoriesPref] = useState<Record<string, boolean>>({});
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSavedMsg, setPrefsSavedMsg] = useState<string | null>(null);

  // Push device state
  const [pushStatus, setPushStatus] = useState<PushStatusInfo>({
    state: 'default',
    isIOSNonStandalone: false,
    subscriptionId: null,
    optedIn: false,
    appIdConfigured: true,
  });
  const [registeringPush, setRegisteringPush] = useState(false);

  const loadActivity = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('user_notifications')
        .select('*', { count: 'exact' })
        .eq('role_scope', roleScope)
        .order('created_at', { ascending: false });

      if (roleScope === 'customer') {
        query = query.eq('user_id', user.id);
      } else if (roleScope === 'vendor') {
        query = query.or(`user_id.eq.${user.id},vendor_id.eq.${user.id}`);
      } else if (roleScope === 'affiliate') {
        query = query.or(`user_id.eq.${user.id},affiliate_id.eq.${user.id}`);
      }

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }
      if (readFilter === 'unread') {
        query = query.eq('is_read', false);
      } else if (readFilter === 'read') {
        query = query.eq('is_read', true);
      }

      if (dateFilter !== 'all') {
        const now = new Date();
        if (dateFilter === 'today') {
          now.setHours(0, 0, 0, 0);
        } else if (dateFilter === '7d') {
          now.setDate(now.getDate() - 7);
        } else if (dateFilter === '30d') {
          now.setDate(now.getDate() - 30);
        }
        query = query.gte('created_at', now.toISOString());
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error: qErr } = await query.range(from, to);
      if (qErr) throw qErr;

      setItems((data || []) as UserNotificationItem[]);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('[NotificationCenterPanel] Error loading activity:', err);
      setError('No se pudo cargar el historial de actividad.');
    } finally {
      setLoading(false);
    }
  }, [user, roleScope, categoryFilter, readFilter, dateFilter, page]);

  const loadPreferences = useCallback(async () => {
    if (!user || !showPreferences) return;
    try {
      const status = await getPushStatus();
      setPushStatus(status);

      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('role_scope', roleScope)
        .maybeSingle();

      const defaultCats: Record<string, boolean> = {};
      (ROLE_CATEGORIES[roleScope] || []).forEach((c) => {
        defaultCats[c.key] = true;
      });

      if (data) {
        setChannels({
          email: data.channels?.email !== false,
          push: data.channels?.push !== false,
          in_app: true,
          whatsapp: Boolean(data.channels?.whatsapp),
        });
        setCategoriesPref({ ...defaultCats, ...(data.categories || {}) });
      } else {
        setCategoriesPref(defaultCats);
      }
    } catch (err) {
      console.warn('[NotificationCenterPanel] Error loading preferences:', err);
    }
  }, [user, roleScope, showPreferences]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const savePreferences = async (
    nextChannels = channels,
    nextCategories = categoriesPref
  ) => {
    if (!user) return;
    setSavingPrefs(true);
    setPrefsSavedMsg(null);
    try {
      const { error: upsertErr } = await supabase.from('notification_preferences').upsert(
        {
          user_id: user.id,
          role_scope: roleScope,
          channels: { ...nextChannels, in_app: true },
          categories: nextCategories,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,role_scope' }
      );
      if (upsertErr) throw upsertErr;
      setPrefsSavedMsg('Preferencias actualizadas correctamente');
      setTimeout(() => setPrefsSavedMsg(null), 3000);
    } catch (err: any) {
      console.error('[NotificationCenterPanel] Error saving preferences:', err);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleToggleChannel = (key: 'email' | 'push') => {
    const next = { ...channels, [key]: !channels[key] };
    setChannels(next);
    savePreferences(next, categoriesPref);
  };

  const handleToggleCategory = (catKey: string, mandatory?: boolean) => {
    if (mandatory) return;
    const next = { ...categoriesPref, [catKey]: !categoriesPref[catKey] };
    setCategoriesPref(next);
    savePreferences(channels, next);
  };

  const handleTogglePushDevice = async () => {
    if (!user) return;
    setRegisteringPush(true);
    try {
      if (pushStatus.state === 'granted') {
        await unregisterCurrentDevice(user.id);
      } else {
        await requestAndRegisterPush(
          user.id,
          roleScope === 'vendor' ? user.id : null
        );
      }
      const status = await getPushStatus();
      setPushStatus(status);
    } finally {
      setRegisteringPush(false);
    }
  };

  const markAsRead = async (id: string) => {
    const nowIso = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, is_read: true, read_at: nowIso } : item))
    );
    await supabase
      .from('user_notifications')
      .update({ is_read: true, read_at: nowIso })
      .eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    setItems((prev) => prev.map((item) => ({ ...item, is_read: true, read_at: nowIso })));
    let q = supabase
      .from('user_notifications')
      .update({ is_read: true, read_at: nowIso })
      .eq('role_scope', roleScope)
      .eq('is_read', false);

    if (roleScope === 'customer') q = q.eq('user_id', user.id);
    else if (roleScope === 'vendor') q = q.or(`user_id.eq.${user.id},vendor_id.eq.${user.id}`);
    else if (roleScope === 'affiliate') q = q.or(`user_id.eq.${user.id},affiliate_id.eq.${user.id}`);

    await q;
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'success':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
          badge: isDark
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
          badge: isDark
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            : 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'error':
      case 'priority':
        return {
          icon: <XCircle className="w-4 h-4 text-rose-500 shrink-0" />,
          badge: isDark
            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            : 'bg-rose-50 text-rose-700 border-rose-200',
        };
      default:
        return {
          icon: <Info className="w-4 h-4 text-blue-500 shrink-0" />,
          badge: isDark
            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
            : 'bg-blue-50 text-blue-700 border-blue-200',
        };
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const roleCats = ROLE_CATEGORIES[roleScope] || [];

  return (
    <div className="space-y-8">
      {/* ACTIVITY FEED CARD */}
      <div
        className={`rounded-2xl border overflow-hidden shadow-sm ${
          isDark ? 'bg-[#0a0f1d] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
        }`}
      >
        {/* Header */}
        <div
          className={`p-5 sm:p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            isDark ? 'border-white/10 bg-white/[0.02]' : 'border-gray-100 bg-gray-50/50'
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-[#f00856]" />
              <h3 className="text-lg font-extrabold">Historial de Actividad y Notificaciones</h3>
            </div>
            <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Seguimiento en tiempo real de tus operaciones, estados comerciales y avisos enviados.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllAsRead}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                isDark
                  ? 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <CheckCheck className="w-4 h-4 text-[#f00856]" />
              <span>Marcar todo leído</span>
            </button>
            <button
              type="button"
              onClick={loadActivity}
              disabled={loading}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isDark
                  ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div
          className={`px-5 sm:px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 ${
            isDark ? 'border-white/10 bg-black/20' : 'border-gray-100 bg-gray-50/30'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-[#f00856]" />
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-[#f00856] text-white'
                  : isDark
                  ? 'bg-white/5 text-slate-400 hover:text-white'
                  : 'bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              Todas
            </button>
            {roleCats.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setCategoryFilter(c.key);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                  categoryFilter === c.key
                    ? 'bg-[#f00856] text-white'
                    : isDark
                    ? 'bg-white/5 text-slate-400 hover:text-white'
                    : 'bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                {CATEGORY_BADGE_LABELS[c.key] || c.key}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={readFilter}
              onChange={(e) => {
                setReadFilter(e.target.value as any);
                setPage(1);
              }}
              className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border outline-none ${
                isDark
                  ? 'bg-[#0e1525] border-white/10 text-slate-200'
                  : 'bg-white border-gray-200 text-gray-700'
              }`}
            >
              <option value="all">Estado: Todas</option>
              <option value="unread">Sin leer</option>
              <option value="read">Leídas</option>
            </select>

            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 opacity-50 hidden sm:inline" />
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value as any);
                  setPage(1);
                }}
                className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border outline-none ${
                  isDark
                    ? 'bg-[#0e1525] border-white/10 text-slate-200'
                    : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                <option value="all">Todo el período</option>
                <option value="today">Hoy</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
              </select>
            </div>
          </div>
        </div>

        {/* List Body */}
        <div className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
          {error ? (
            <div className="p-8 text-center text-sm text-rose-500 font-semibold">{error}</div>
          ) : loading ? (
            <div className="p-12 text-center text-sm opacity-60 animate-pulse">
              Cargando historial de actividad...
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Sparkles className="w-8 h-8 text-[#f00856]/60 mx-auto" />
              <p className="text-sm font-bold">No se encontraron notificaciones con estos filtros</p>
              <p className="text-xs opacity-60">
                Todas las confirmaciones de compra, seguimiento de envíos y novedades aparecerán aquí.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const sev = getSeverityBadge(item.severity);
              return (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    !item.is_read
                      ? isDark
                        ? 'bg-[#f00856]/[0.06]'
                        : 'bg-rose-50/30'
                      : isDark
                      ? 'hover:bg-white/[0.02]'
                      : 'hover:bg-gray-50/60'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="mt-0.5">{sev.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${sev.badge}`}
                        >
                          {CATEGORY_BADGE_LABELS[item.category] || item.category}
                        </span>
                        <span className="text-xs opacity-50">
                          {new Date(item.created_at).toLocaleString('es-UY', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {!item.is_read && (
                          <span className="w-2 h-2 rounded-full bg-[#f00856]" title="Sin leer" />
                        )}
                      </div>
                      <h4 className="text-sm font-extrabold mt-1.5">{item.title}</h4>
                      <p className="text-xs opacity-80 mt-1 leading-relaxed">{item.body}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {!item.is_read && (
                      <button
                        type="button"
                        onClick={() => markAsRead(item.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                          isDark
                            ? 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300'
                            : 'border-gray-200 bg-white hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 text-[#f00856]" />
                        <span>Leída</span>
                      </button>
                    )}
                    {item.action_url && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.is_read) markAsRead(item.id);
                          if (item.action_url!.startsWith('http')) {
                            try {
                              const u = new URL(item.action_url!);
                              navigate(u.pathname + u.search + u.hash);
                            } catch {
                              window.location.href = item.action_url!;
                            }
                          } else {
                            navigate(item.action_url!);
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#f00856] text-white hover:bg-[#d0074a] transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>Ver detalle</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className={`px-5 py-3.5 border-t flex items-center justify-between text-xs ${
              isDark ? 'border-white/10 bg-white/[0.01]' : 'border-gray-100 bg-gray-50'
            }`}
          >
            <span className="opacity-70">
              Mostrando página <strong>{page}</strong> de <strong>{totalPages}</strong> ({totalCount}{' '}
              eventos)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PREFERENCES CARD */}
      {showPreferences && (
        <div
          className={`rounded-2xl border p-5 sm:p-6 space-y-6 shadow-sm ${
            isDark ? 'bg-[#0a0f1d] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4 border-gray-100 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#f00856]" />
                <h3 className="text-lg font-extrabold">Preferencias de Notificaciones</h3>
              </div>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                Elegí por qué canales recibir tus avisos. Las alertas transaccionales críticas de pagos y seguridad se envían siempre.
              </p>
            </div>
            {prefsSavedMsg && (
              <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {prefsSavedMsg}
              </span>
            )}
          </div>

          {/* Channels */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider opacity-60 mb-3">
              Canales de Entrega
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Email */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                  isDark ? 'bg-white/[0.02] border-white/10' : 'bg-gray-50/70 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Mail className="w-4 h-4 text-blue-500" />
                    <span>Correo Electrónico</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={channels.email}
                    onChange={() => handleToggleChannel('email')}
                    disabled={savingPrefs}
                    className="w-4 h-4 accent-[#f00856] cursor-pointer"
                  />
                </div>
                <p className="text-[11px] opacity-70">
                  Contacto oficial: info@collectibles.com.uy
                </p>
              </div>

              {/* Push */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                  isDark ? 'bg-white/[0.02] border-white/10' : 'bg-gray-50/70 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <BellRing className="w-4 h-4 text-indigo-500" />
                    <span>Push en Dispositivo</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTogglePushDevice}
                    disabled={registeringPush}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                      pushStatus.state === 'granted'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-[#f00856] text-white'
                    }`}
                  >
                    {registeringPush
                      ? '...'
                      : pushStatus.state === 'granted'
                      ? 'Activo'
                      : 'Activar'}
                  </button>
                </div>
                <p className="text-[11px] opacity-70">
                  {pushStatus.state === 'granted'
                    ? 'Este navegador recibe alertas instantáneas.'
                    : 'Activá los avisos directos en tu navegador o celular.'}
                </p>
              </div>

              {/* In-App */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                  isDark ? 'bg-white/[0.02] border-white/10' : 'bg-gray-50/70 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Centro en Panel</span>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
                    Siempre Activo
                  </span>
                </div>
                <p className="text-[11px] opacity-70">
                  Historial persistente en la campana y panel de actividad.
                </p>
              </div>

              {/* WhatsApp */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 opacity-60 ${
                  isDark ? 'bg-white/[0.01] border-white/10' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <MessageSquare className="w-4 h-4 text-amber-500" />
                    <span>WhatsApp</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-500">
                    No disponible
                  </span>
                </div>
                <p className="text-[11px] opacity-75">
                  Canal en espera de conexión oficial de proveedor Meta Cloud.
                </p>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider opacity-60 mb-3">
              Categorías de Aviso
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {roleCats.map((cat) => {
                const checked = cat.mandatory ? true : categoriesPref[cat.key] !== false;
                return (
                  <label
                    key={cat.key}
                    className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
                      cat.mandatory ? 'opacity-90 cursor-default' : 'cursor-pointer'
                    } ${
                      isDark
                        ? 'bg-white/[0.02] border-white/10 hover:border-white/20'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={cat.mandatory || savingPrefs}
                      onChange={() => handleToggleCategory(cat.key, cat.mandatory)}
                      className="mt-1 w-4 h-4 accent-[#f00856]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold">{cat.label}</span>
                        {cat.mandatory && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#f00856]/15 text-[#f00856]">
                            Transaccional Obligatorio
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] opacity-70 mt-0.5 leading-relaxed">{cat.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default NotificationCenterPanel;

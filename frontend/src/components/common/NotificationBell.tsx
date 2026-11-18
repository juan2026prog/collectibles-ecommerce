import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export type NotificationRoleScope = 'customer' | 'vendor' | 'admin' | 'affiliate';

export interface UserNotificationItem {
  id: string;
  user_id: string | null;
  role_scope: NotificationRoleScope;
  vendor_id: string | null;
  affiliate_id: string | null;
  category: string;
  event_type: string;
  title: string;
  body: string;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  severity: 'info' | 'success' | 'warning' | 'error' | 'priority';
  is_read: boolean;
  read_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface NotificationBellProps {
  roleScope: NotificationRoleScope;
  theme?: 'light' | 'dark';
  viewAllUrl?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
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

export function NotificationBell({
  roleScope,
  theme = 'light',
  viewAllUrl,
}: NotificationBellProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const defaultViewAllUrl =
    viewAllUrl ||
    (roleScope === 'admin'
      ? '/admin/notifications'
      : roleScope === 'vendor'
      ? '/vendor?tab=settings&sub=notifications'
      : roleScope === 'affiliate'
      ? '/affiliate?tab=notifications'
      : '/account?tab=notifications');

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('user_notifications')
        .select('*')
        .eq('role_scope', roleScope)
        .order('created_at', { ascending: false })
        .limit(25);

      if (roleScope === 'customer') {
        query = query.eq('user_id', user.id);
      } else if (roleScope === 'vendor') {
        query = query.or(`user_id.eq.${user.id},vendor_id.eq.${user.id}`);
      } else if (roleScope === 'affiliate') {
        query = query.or(`user_id.eq.${user.id},affiliate_id.eq.${user.id}`);
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      const list = (data || []) as UserNotificationItem[];
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.is_read).length);
    } catch (err: any) {
      console.warn('[NotificationBell] Error loading notifications:', err?.message);
      setError('No se pudieron cargar las notificaciones.');
    } finally {
      setLoading(false);
    }
  }, [user, roleScope]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    const pollInterval = window.setInterval(fetchNotifications, 60000);

    const channelName = `bell:${roleScope}:${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `role_scope=eq.${roleScope}`,
        },
        (payload) => {
          const rec = (payload.new || payload.old) as any;
          if (
            roleScope === 'admin' ||
            rec?.user_id === user.id ||
            rec?.vendor_id === user.id ||
            rec?.affiliate_id === user.id
          ) {
            fetchNotifications();
          }
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [user, roleScope, fetchNotifications]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const nowIso = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: nowIso } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: nowIso })
        .eq('id', id);
    } catch (err) {
      console.warn('[NotificationBell] Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    try {
      const nowIso = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: nowIso })));
      setUnreadCount(0);
      await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: nowIso })
        .in('id', unreadIds);
    } catch (err) {
      console.warn('[NotificationBell] Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = async (item: UserNotificationItem) => {
    if (!item.is_read) {
      await markAsRead(item.id);
    }
    setOpen(false);
    if (item.action_url) {
      if (item.action_url.startsWith('http')) {
        try {
          const url = new URL(item.action_url);
          navigate(url.pathname + url.search + url.hash);
        } catch {
          window.location.href = item.action_url;
        }
      } else {
        navigate(item.action_url);
      }
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
      case 'error':
      case 'priority':
        return <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />;
    }
  };

  const formatTimeAgo = (isoDate: string) => {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return new Date(isoDate).toLocaleDateString('es-UY', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  const availableCategories = Array.from(
    new Set(['all', ...notifications.map((n) => n.category || 'general')])
  );

  const filteredNotifications =
    selectedCategory === 'all'
      ? notifications
      : notifications.filter((n) => n.category === selectedCategory);

  const isDark = theme === 'dark';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`relative flex items-center justify-center transition-all cursor-pointer ${
          isDark
            ? 'w-11 h-11 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 hover:text-white'
            : 'p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 bg-gray-50 min-h-[38px] min-w-[38px]'
        }`}
        aria-label="Centro de Notificaciones"
        title="Notificaciones y Actividad"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#f00856] text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md shadow-[#f00856]/40">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 mt-2 w-[340px] sm:w-[400px] rounded-2xl shadow-2xl border z-[120] overflow-hidden animate-fadeIn ${
            isDark
              ? 'bg-[#0e1525] border-white/10 text-slate-100'
              : 'bg-white border-gray-200 text-gray-900'
          }`}
        >
          {/* Header */}
          <div
            className={`px-4 py-3 border-b flex items-center justify-between ${
              isDark ? 'border-white/10 bg-white/[0.02]' : 'border-gray-100 bg-gray-50/70'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm">Notificaciones</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-[#f00856]/15 text-[#f00856]">
                  {unreadCount} sin leer
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className={`text-[11px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
                    isDark
                      ? 'text-slate-300 hover:text-white hover:bg-white/10'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                  }`}
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-[#f00856]" />
                  <span>Leídas</span>
                </button>
              )}
              <button
                type="button"
                onClick={fetchNotifications}
                disabled={loading}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDark ? 'text-slate-400 hover:bg-white/10' : 'text-gray-500 hover:bg-gray-200/60'
                }`}
                title="Actualizar"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          {availableCategories.length > 2 && (
            <div
              className={`px-3 py-2 border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar ${
                isDark ? 'border-white/10' : 'border-gray-100'
              }`}
            >
              {availableCategories.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#f00856] text-white'
                        : isDark
                        ? 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                        : 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {CATEGORY_LABELS[cat] || cat}
                  </button>
                );
              })}
            </div>
          )}

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-100 dark:divide-white/5">
            {error ? (
              <div className="p-6 text-center text-xs text-rose-500 font-medium">{error}</div>
            ) : loading && notifications.length === 0 ? (
              <div className="p-8 text-center text-xs opacity-60 animate-pulse">
                Cargando actividad...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Sparkles className="w-7 h-7 text-[#f00856]/60 mx-auto" />
                <p className="text-xs font-bold">No tenés notificaciones pendientes</p>
                <p className="text-[11px] opacity-60">
                  Aquí verás las actualizaciones comerciales, envíos y actividad en tiempo real.
                </p>
              </div>
            ) : (
              filteredNotifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                    !item.is_read
                      ? isDark
                        ? 'bg-[#f00856]/[0.08] hover:bg-[#f00856]/[0.14]'
                        : 'bg-rose-50/40 hover:bg-rose-50/80'
                      : isDark
                      ? 'hover:bg-white/[0.04]'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {getSeverityIcon(item.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-xs leading-snug ${
                          !item.is_read ? 'font-extrabold' : 'font-semibold opacity-85'
                        }`}
                      >
                        {item.title}
                      </p>
                      <span className="text-[10px] opacity-50 whitespace-nowrap shrink-0">
                        {formatTimeAgo(item.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-75 mt-1 line-clamp-2 leading-relaxed">
                      {item.body}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          isDark ? 'bg-white/10 text-slate-300' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {CATEGORY_LABELS[item.category] || item.category}
                      </span>
                      {!item.is_read && (
                        <button
                          type="button"
                          onClick={(e) => markAsRead(item.id, e)}
                          className="text-[10px] font-bold text-[#f00856] hover:underline flex items-center gap-0.5"
                        >
                          <Check className="w-3 h-3" /> Marcar leída
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            className={`px-4 py-2.5 border-t flex items-center justify-between ${
              isDark ? 'border-white/10 bg-white/[0.02]' : 'border-gray-100 bg-gray-50'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(defaultViewAllUrl);
              }}
              className="w-full text-center text-xs font-extrabold text-[#f00856] hover:underline flex items-center justify-center gap-1.5 py-1 cursor-pointer"
            >
              <span>Ver centro de actividad completo</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default NotificationBell;

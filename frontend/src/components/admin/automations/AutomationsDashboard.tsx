import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { 
  Bot, ShoppingCart, Heart, TrendingUp, Mail, 
  MessageCircle, Clock, CheckCircle2, AlertCircle, ShoppingBag
} from 'lucide-react';

export default function AutomationsDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    abandonedCarts: 0,
    recoveredCarts: 0,
    recoveryRate: 0,
    wishlistAlerts: 0,
    optInsEmail: 0,
    optInsWhatsapp: 0,
    salesTotal: 0,
    avgTicket: 0,
    emailStats: { sent: 0, opens: 0, clicks: 0 },
    waStats: { sent: 0, delivered: 0, clicks: 0 },
    preorders: { active: 0, delivered: 0, cancelled: 0 },
    customers: { active: 0, total: 0 }
  });
  
  const [recentCarts, setRecentCarts] = useState<any[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    setLoading(true);
    try {
      // Fetch Recent Carts and Alerts for lists
      const [cartsRes, alertsRes, rpcRes] = await Promise.all([
        supabase.from('abandoned_checkouts').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('wishlist_alerts').select('*, wishlists(products(title))').order('created_at', { ascending: false }).limit(5),
        supabase.rpc('get_automation_dashboard_metrics')
      ]);

      if (cartsRes.error && cartsRes.error.code !== '42P01') throw cartsRes.error;
      if (alertsRes.error && alertsRes.error.code !== '42P01') throw alertsRes.error;
      if (rpcRes.error) throw rpcRes.error;

      setRecentCarts(cartsRes.data || []);
      setRecentAlerts(alertsRes.data || []);

      const rpcData = rpcRes.data || {};

      setStats({
        abandonedCarts: rpcData.carritos_abandonados || 0,
        recoveredCarts: rpcData.carritos_recuperados || 0,
        recoveryRate: Math.round(rpcData.tasa_recuperacion || 0),
        wishlistAlerts: rpcData.alertas_wishlist_enviadas || 0,
        optInsEmail: rpcData.emails_enviados || 0, // Using sent as a metric proxy since opt_ins are not explicitly fetched in RPC, wait we missed opt_ins!
        optInsWhatsapp: rpcData.whatsapp_enviados || 0,
        salesTotal: rpcData.ventas_totales || 0,
        avgTicket: rpcData.ticket_promedio || 0,
        customers: { active: rpcData.clientes_nuevos + rpcData.clientes_recurrentes || 0, total: rpcData.clientes_nuevos + rpcData.clientes_recurrentes || 0 }, // Adjusting total to match metrics
        preorders: { active: rpcData.preventas_activas || 0, delivered: rpcData.preventas_entregadas || 0, cancelled: rpcData.preventas_canceladas || 0 },
        emailStats: { sent: rpcData.emails_enviados || 0, opens: 0, clicks: 0 },
        waStats: { sent: rpcData.whatsapp_enviados || 0, delivered: 0, clicks: 0 }
      });
      
      // Let's manually fetch opt-ins since the user didn't ask for them in the RPC, but the UI expects them.
      const { data: consents, error: consentsError } = await supabase
        .from('customer_consents')
        .select('email_marketing_opt_in, whatsapp_opt_in');
      if (consents && !consentsError) {
        setStats(prev => ({
          ...prev,
          optInsEmail: consents.filter(c => c.email_marketing_opt_in).length,
          optInsWhatsapp: consents.filter(c => c.whatsapp_opt_in).length,
          customers: { ...prev.customers, total: consents.length }
        }));
      }

    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-red-500/10 text-red-500 rounded-xl">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-slate-400">Abandonados</span>
          </div>
          <div className="text-3xl font-bold">{stats.abandonedCarts}</div>
          <div className="text-xs text-slate-400 mt-1">Carritos pendientes</div>
        </div>

        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-500/10 text-green-500 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-slate-400">Recuperados</span>
          </div>
          <div className="text-3xl font-bold">{stats.recoveredCarts}</div>
          <div className="text-xs text-green-400 mt-1">{stats.recoveryRate}% Tasa de conversión</div>
        </div>

        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-pink-500/10 text-pink-500 rounded-xl">
              <Heart className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-slate-400">Alertas Wishlist</span>
          </div>
          <div className="text-3xl font-bold">{stats.wishlistAlerts}</div>
          <div className="text-xs text-slate-400 mt-1">Generadas recientemente</div>
        </div>

        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
              <MessageCircle className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-slate-400">Opt-ins / Clientes</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-bold">{stats.customers.total}</div>
              <div className="text-[10px] text-slate-400 mt-1 uppercase">Totales</div>
            </div>
            <div>
              <div className="text-lg font-bold text-blue-400">{stats.optInsEmail}</div>
              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 uppercase"><Mail className="w-3 h-3"/> Emails</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-400">{stats.optInsWhatsapp}</div>
              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 uppercase"><MessageCircle className="w-3 h-3"/> WA</div>
            </div>
          </div>
        </div>

        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
              <Bot className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-slate-400">Preventas</span>
          </div>
          <div className="text-3xl font-bold">{stats.preorders.active}</div>
          <div className="text-xs text-slate-400 mt-1">{stats.preorders.delivered} Entregadas | {stats.preorders.cancelled} Canceladas</div>
        </div>

        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-slate-400">Ventas</span>
          </div>
          <div className="text-2xl font-bold text-green-400">$ {stats.salesTotal.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">Ticket Prom: $ {Math.round(stats.avgTicket).toLocaleString()}</div>
        </div>

        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-yellow-500/10 text-yellow-500 rounded-xl">
              <Mail className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-slate-400">Rendimiento Email</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.emailStats.sent}</div>
          <div className="text-xs text-blue-400 mt-1">{stats.emailStats.opens} Ap. | {stats.emailStats.clicks} Clics</div>
        </div>

        <div className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-teal-500/10 text-teal-500 rounded-xl">
              <MessageCircle className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-slate-400">Rendimiento WA</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.waStats.sent}</div>
          <div className="text-xs text-green-400 mt-1">{stats.waStats.delivered} Entr. | {stats.waStats.clicks} Clics</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="font-bold">Carritos Abandonados Recientes</h2>
          </div>
          <div className="divide-y divide-white/5">
            {recentCarts.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">No hay carritos recientes</div>
            ) : (
              recentCarts.map((cart, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">
                      {cart.email}
                      {cart.status === 'converted' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Clock className="w-4 h-4 text-orange-500" />
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                      <span>$ {cart.total_amount}</span>
                      <span className="text-white/20">•</span>
                      <span>{new Date(cart.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className={`px-2 py-1 rounded-full ${cart.recovery_email_sent ? 'bg-primary-500/20 text-primary-400' : 'bg-white/5 text-slate-400'}`}>
                      Email 1H
                    </span>
                    <span className={`px-2 py-1 rounded-full ${cart.recovery_24h_sent ? 'bg-primary-500/20 text-primary-400' : 'bg-white/5 text-slate-400'}`}>
                      24H
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="font-bold">Alertas Wishlist Pendientes</h2>
          </div>
          <div className="divide-y divide-white/5">
            {recentAlerts.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">No hay alertas recientes</div>
            ) : (
              recentAlerts.map((alert, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">
                      {alert.alert_type === 'restock' ? (
                        <span className="text-green-400">Restock</span>
                      ) : (
                        <span className="text-blue-400">Drop de Precio</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {alert.wishlists?.products?.title || 'Producto'}
                    </div>
                  </div>
                  <div className="text-xs">
                    {alert.status === 'sent' ? (
                      <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Enviado</span>
                    ) : (
                      <span className="text-orange-500 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Pendiente</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

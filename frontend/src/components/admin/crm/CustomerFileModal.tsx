import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { 
  X, User, Mail, Phone, MapPin, ShoppingBag, 
  DollarSign, TrendingUp, Heart, Tag, Shield, ShoppingCart,
  MessageCircle, Send, Clock, Calendar, CheckCircle2
} from 'lucide-react';

export default function CustomerFileModal({ userId, onClose }: { userId: string, onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [carts, setCarts] = useState<any[]>([]);
  const [consents, setConsents] = useState<any>(null);
  const [stats, setStats] = useState({ 
    totalSpent: 0, avgTicket: 0, totalOrders: 0, 
    firstOrder: null as string | null, lastOrder: null as string | null,
    couponsUsed: 0, recoveries: 0
  });
  const [marketingStats, setMarketingStats] = useState({ received: 0, opened: 0, clicked: 0 });
  const [activeSegments, setActiveSegments] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [userId]);

  async function fetchData() {
    setLoading(true);
    
    // 1. Profile
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (prof) setProfile(prof);

    // 2. Orders
    const { data: ords } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (ords) {
      setOrders(ords);
      const spent = ords.reduce((acc, o) => acc + o.total_amount, 0);
      const coupons = ords.filter(o => o.metadata?.coupon).length;
      setStats(prev => ({
        ...prev,
        totalOrders: ords.length,
        totalSpent: spent,
        avgTicket: ords.length > 0 ? spent / ords.length : 0,
        firstOrder: ords[ords.length - 1]?.created_at,
        lastOrder: ords[0]?.created_at,
        couponsUsed: coupons
      }));
    }

    // 3. CRM Logs
    const { data: lgs } = await supabase.from('communication_logs')
      .select('*, communication_templates(name)')
      .eq('customer_id', userId).order('created_at', { ascending: false });
    if (lgs) {
      setLogs(lgs);
      setMarketingStats({
        received: lgs.filter(l => l.status === 'sent' || l.status === 'delivered').length,
        opened: lgs.filter(l => l.status === 'opened').length,
        clicked: lgs.filter(l => l.status === 'clicked').length
      });
    }

    // 4. Wishlist
    const { data: wl } = await supabase.from('wishlists').select('*, products(title)').eq('user_id', userId);
    if (wl) setWishlist(wl);

    // 5. Carts
    const { data: cts } = await supabase.from('abandoned_checkouts').select('*').eq('customer_id', userId).order('created_at', { ascending: false });
    if (cts) {
       setCarts(cts);
       setStats(prev => ({ ...prev, recoveries: cts.filter(c => c.status === 'converted').length }));
    }

    // 6. Consents (needs email from profile)
    if (prof?.email) {
      const { data: cst } = await supabase.from('customer_consents').select('*').eq('email', prof.email).single();
      if (cst) setConsents(cst);
    }

    setLoading(false);
  }

  // Combine interactions for timeline
  const getTimeline = () => {
    const events: any[] = [];
    orders.forEach(o => events.push({ type: 'order', date: o.created_at, data: o }));
    logs.forEach(l => events.push({ type: 'log', date: l.created_at, data: l }));
    carts.forEach(c => events.push({ type: 'cart', date: c.created_at, data: c }));
    
    // sort by date desc
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const timeline = getTimeline();

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-dark-900 rounded-2xl w-full max-w-5xl h-[80vh] flex items-center justify-center border border-white/10">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-900 rounded-2xl w-full max-w-6xl h-[90vh] shadow-2xl flex flex-col border border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-dark-800">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white font-black text-xl">
               {(profile?.first_name?.[0] || profile?.email?.[0] || '?').toUpperCase()}
             </div>
             <div>
               <h3 className="font-bold text-xl text-white flex items-center gap-2">
                 {profile?.first_name} {profile?.last_name}
                 {profile?.is_admin && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded uppercase font-bold">Admin</span>}
               </h3>
               <p className="text-sm text-slate-400 font-mono">{profile?.email}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-lg transition-colors"><X className="w-5 h-5"/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex gap-6">
          {/* LEFT COL: INFO */}
          <div className="w-1/3 space-y-6">
             {/* General Info */}
             <div className="glass p-5 rounded-xl border border-white/5 space-y-4">
                <h4 className="font-bold text-slate-200 border-b border-white/10 pb-2">Información de Contacto</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3 text-slate-300"><Mail className="w-4 h-4 text-slate-500"/> {profile?.email}</div>
                  <div className="flex items-center gap-3 text-slate-300"><Phone className="w-4 h-4 text-slate-500"/> {profile?.phone || 'Sin teléfono'}</div>
                  <div className="flex items-center gap-3 text-slate-300"><MapPin className="w-4 h-4 text-slate-500"/> {profile?.city || 'Sin ciudad'}, {profile?.country || 'UY'}</div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <h5 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Consentimientos (Opt-Ins)</h5>
                  <div className="flex gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${consents?.email_marketing_opt_in ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>Email Marketing</span>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${consents?.whatsapp_opt_in ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>WhatsApp</span>
                  </div>
                </div>
             </div>

              {/* Metrics */}
             <div className="glass p-5 rounded-xl border border-white/5 space-y-4">
                <h4 className="font-bold text-slate-200 border-b border-white/10 pb-2">Comercial</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-800 p-3 rounded-lg border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">LTV (Total Gastado)</p>
                    <p className="text-xl font-bold text-green-400 mt-1">$ {stats.totalSpent.toLocaleString()}</p>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Ticket Promedio</p>
                    <p className="text-xl font-bold text-blue-400 mt-1">$ {Math.round(stats.avgTicket).toLocaleString()}</p>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Compras</p>
                    <p className="text-xl font-bold text-white mt-1">{stats.totalOrders}</p>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Última Compra</p>
                    <p className="text-sm font-bold text-slate-300 mt-2">{stats.lastOrder ? new Date(stats.lastOrder).toLocaleDateString() : '-'}</p>
                  </div>
                </div>

                <h4 className="font-bold text-slate-200 border-b border-white/10 pb-2 mt-4">Actividad</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-800 p-3 rounded-lg border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Wishlist</p>
                    <p className="text-xl font-bold text-pink-400 mt-1">{wishlist.length}</p>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Carritos Abandonados</p>
                    <p className="text-xl font-bold text-orange-400 mt-1">{carts.length}</p>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Recuperaciones</p>
                    <p className="text-xl font-bold text-green-400 mt-1">{stats.recoveries}</p>
                  </div>
                  <div className="bg-dark-800 p-3 rounded-lg border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Cupones Usados</p>
                    <p className="text-xl font-bold text-purple-400 mt-1">{stats.couponsUsed}</p>
                  </div>
                </div>

                <h4 className="font-bold text-slate-200 border-b border-white/10 pb-2 mt-4">Marketing</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-dark-800 p-2 rounded-lg border border-white/5 text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Recibidos</p>
                    <p className="text-lg font-bold text-white mt-1">{marketingStats.received}</p>
                  </div>
                  <div className="bg-dark-800 p-2 rounded-lg border border-white/5 text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Abiertos</p>
                    <p className="text-lg font-bold text-white mt-1">{marketingStats.opened}</p>
                  </div>
                  <div className="bg-dark-800 p-2 rounded-lg border border-white/5 text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Clicks</p>
                    <p className="text-lg font-bold text-white mt-1">{marketingStats.clicked}</p>
                  </div>
                </div>
             </div>
          </div>

          {/* RIGHT COL: TIMELINE */}
          <div className="flex-1 glass p-6 rounded-xl border border-white/5">
            <h4 className="font-bold text-slate-200 border-b border-white/10 pb-2 mb-6">Línea de Tiempo del Cliente</h4>
            
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
               {timeline.length === 0 ? (
                 <div className="text-center text-slate-500 pt-8">No hay interacciones registradas.</div>
               ) : (
                 timeline.map((event, i) => (
                   <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-dark-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow flex-shrink-0 relative z-10 
                        bg-dark-800 text-slate-400">
                        {event.type === 'order' && <ShoppingBag className="w-4 h-4 text-green-400"/>}
                        {event.type === 'log' && event.data.channel === 'whatsapp' && <MessageCircle className="w-4 h-4 text-green-400"/>}
                        {event.type === 'log' && event.data.channel === 'email' && <Mail className="w-4 h-4 text-blue-400"/>}
                        {event.type === 'cart' && <ShoppingCart className="w-4 h-4 text-orange-400"/>}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-white/5 bg-dark-800 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm text-slate-200">
                            {event.type === 'order' && `Compra #${event.data.order_number || event.data.id.slice(0,6)}`}
                            {event.type === 'cart' && `Carrito Abandonado`}
                            {event.type === 'log' && (event.data.campaigns ? `Campaña: ${event.data.campaigns.name}` : `Automatización: ${event.data.communication_templates?.name}`)}
                          </span>
                          <time className="text-[10px] text-slate-500 font-mono">{new Date(event.date).toLocaleDateString()} {new Date(event.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</time>
                        </div>
                        <div className="text-xs text-slate-400 mt-2">
                           {event.type === 'order' && <span className="text-green-400 font-bold">$ {event.data.total_amount} ({event.data.status})</span>}
                           {event.type === 'cart' && <span>Valor: $ {event.data.total_amount} - Estado: {event.data.status}</span>}
                           {event.type === 'log' && <span>Enviado vía {event.data.channel.toUpperCase()}</span>}
                        </div>
                      </div>
                   </div>
                 ))
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

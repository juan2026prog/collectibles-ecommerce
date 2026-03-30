import { Video, DollarSign, AlertCircle, Star, Clock, CheckCircle, ChevronRight, TrendingUp } from 'lucide-react';

interface Props {
  creatorData: any;
  requests: any[];
  earnings: any[];
  reviews: any[];
  notifications: any[];
  onSelectRequest: (r: any) => void;
  onChangeTab: (tab: string) => void;
}

export default function S2FOverview({ creatorData, requests, earnings, reviews, notifications, onSelectRequest, onChangeTab }: Props) {
  const active = requests.filter(r => !['delivered','completed','cancelled','rejected'].includes(r.status));
  const newReqs = requests.filter(r => r.status === 'new' || r.status === 'pending_acceptance');
  const overdueReqs = requests.filter(r => {
    if (['delivered','completed','cancelled','rejected'].includes(r.status)) return false;
    return new Date(r.delivery_deadline) < new Date();
  });
  const inProcess = requests.filter(r => ['accepted','recording','internal_review'].includes(r.status));
  const delivered = requests.filter(r => r.status === 'delivered' || r.status === 'completed');
  const totalEarnings = earnings.reduce((s, e) => s + Number(e.net_amount), 0);
  const pendingEarnings = earnings.filter(e => e.payment_status === 'held' || e.payment_status === 'pending').reduce((s, e) => s + Number(e.net_amount), 0);
  const paidEarnings = earnings.filter(e => e.payment_status === 'paid' || e.payment_status === 'available').reduce((s, e) => s + Number(e.net_amount), 0);
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '—';

  // Avg delivery time
  const deliveredWithTime = requests.filter(r => r.delivered_at && r.purchase_date);
  const avgDelivery = deliveredWithTime.length > 0
    ? Math.round(deliveredWithTime.reduce((s, r) => s + (new Date(r.delivered_at).getTime() - new Date(r.purchase_date || r.created_at).getTime()) / 3600000, 0) / deliveredWithTime.length)
    : 0;

  const kpis = [
    { label: 'Nuevos', value: newReqs.length, icon: Video, color: 'rose', click: 'requests' },
    { label: 'En Proceso', value: inProcess.length, icon: Clock, color: 'purple', click: 'requests' },
    { label: 'Vencidos / Urgentes', value: overdueReqs.length, icon: AlertCircle, color: 'red', click: 'requests' },
    { label: 'Entregados', value: delivered.length, icon: CheckCircle, color: 'green', click: 'history' },
    { label: 'Ingresos Pendientes', value: `$${pendingEarnings.toFixed(0)}`, icon: DollarSign, color: 'orange', click: 'earnings' },
    { label: 'Ingresos Cobrados', value: `$${paidEarnings.toFixed(0)}`, icon: TrendingUp, color: 'emerald', click: 'earnings' },
    { label: 'Entrega Prom.', value: avgDelivery > 0 ? `${avgDelivery}h` : '—', icon: Clock, color: 'blue', click: 'history' },
    { label: 'Rating', value: avgRating, icon: Star, color: 'yellow', click: 'reviews' },
  ];

  const colorMap: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-rose-600 to-pink-700 rounded-3xl p-8 lg:p-10 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start gap-6">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 border-4 border-white/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex gap-6 items-center">
          <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/50 shadow-inner overflow-hidden">
            {creatorData?.profile_photo_url
              ? <img src={creatorData.profile_photo_url} className="w-full h-full object-cover" />
              : <Video className="w-8 h-8 text-white" />}
          </div>
          <div>
            <h1 className="text-3xl font-black mb-1">¡Hola, {creatorData?.stage_name || 'Estrella'}! 🌟</h1>
            <p className="text-rose-100 font-medium">
              Tienes <span className="font-bold text-white bg-white/20 px-2 py-0.5 rounded mx-1">{newReqs.length}</span> nuevos pedidos esperando.
            </p>
          </div>
        </div>
        <div className="relative z-10 bg-black/20 rounded-2xl p-4 border border-white/10 text-right min-w-[200px]">
          <p className="text-[10px] uppercase tracking-widest text-rose-200 font-bold mb-1">Estatus</p>
          <div className="flex items-center justify-end gap-2 text-white font-black text-lg">
            <div className={`w-3 h-3 rounded-full ${creatorData?.availability_status === 'available' ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,1)]' : creatorData?.availability_status === 'busy' ? 'bg-yellow-400' : 'bg-orange-400'}`}></div>
            {creatorData?.availability_status === 'available' ? 'Disponible' : creatorData?.availability_status === 'busy' ? 'Ocupado' : 'Pausado'}
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} onClick={() => onChangeTab(k.click)} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer">
              <div className="flex justify-between items-start mb-3">
                <div className={`p-2.5 rounded-xl ${colorMap[k.color]}`}><Icon className="w-5 h-5" /></div>
                <span className="text-2xl font-black text-gray-900">{k.value}</span>
              </div>
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{k.label}</h3>
            </div>
          );
        })}
      </div>

      {/* Two columns: Notifications + Urgent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 lg:col-span-1">
          <h3 className="text-base font-black text-gray-900 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></div> Notificaciones
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {notifications.length === 0 && <p className="text-gray-400 text-sm">Sin notificaciones.</p>}
            {notifications.slice(0, 8).map(n => (
              <div key={n.id} className={`border-l-2 ${n.is_read ? 'border-gray-200' : 'border-rose-500'} pl-3 py-1`}>
                <p className="text-sm font-bold text-gray-800">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden lg:col-span-2">
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="text-base font-black text-gray-900">Atención Requerida</h3>
            <button onClick={() => onChangeTab('requests')} className="text-sm font-bold text-rose-600 hover:text-rose-700">Ver todas →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {active.slice(0, 5).map(req => (
              <div key={req.id} onClick={() => { onSelectRequest(req); onChangeTab('requests'); }}
                className="p-4 hover:bg-gray-50 transition-colors cursor-pointer flex justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${req.priority === 'urgent' ? 'bg-red-50 text-red-600' : 'bg-rose-50 text-rose-600'}`}>
                    {req.priority === 'urgent' ? <AlertCircle className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{req.occasion}</p>
                    <p className="text-sm font-black text-gray-900">De {req.fan_buyer_name} → {req.recipient_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="text-lg font-black text-gray-900">${Number(req.price).toFixed(0)}</p>
                    <p className={`text-[10px] font-bold uppercase ${new Date(req.delivery_deadline) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                      {new Date(req.delivery_deadline) < new Date() ? 'VENCIDO' : req.status.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </div>
            ))}
            {active.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No hay solicitudes pendientes 🎉</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

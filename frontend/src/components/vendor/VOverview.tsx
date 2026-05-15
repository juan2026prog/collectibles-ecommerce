import { ShoppingCart, Package, AlertTriangle, Truck, DollarSign, Clock, TrendingUp, TrendingDown, ChevronRight, RefreshCw, AlertCircle, BarChart3 } from 'lucide-react';

interface Props { onChangeTab: (t: string) => void; }

// Mock data for demo
const mock = {
  salesToday: 12450, salesMonth: 389200, newOrders: 8, ordersToPrep: 5, sameDayShip: 3, lateOrders: 1, incidentOrders: 0,
  activeProducts: 142, outOfStock: 4, lowStock: 12, pendingBalance: 45200, settlableBalance: 28900,
  cancelRate: 2.1, onTimeRate: 96.4, avgPrepTime: '1.8h', avgTicket: 3240,
  urgentOrders: [
    { id: 'ORD-4821', client: 'María López', items: 2, total: 4500, status: 'new', deadline: '13:00', zone: 'Pocitos' },
    { id: 'ORD-4819', client: 'Carlos Ruiz', items: 1, total: 1890, status: 'prep', deadline: '13:00', zone: 'Carrasco' },
    { id: 'ORD-4817', client: 'Ana García', items: 3, total: 7200, status: 'new', deadline: '14:00', zone: 'Centro' },
  ],
  alerts: [
    { type: 'stock', msg: 'Remera Oversize XL — quedan 2 unidades', severity: 'warning' },
    { type: 'ml', msg: 'Sincronización ML fallida hace 2h', severity: 'error' },
    { type: 'sla', msg: 'Pedido ORD-4810 supera SLA de preparación', severity: 'error' },
    { type: 'delivery', msg: 'Envío ORD-4795 sin tracking hace 24h', severity: 'warning' },
  ],
};

const colorMap: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-500',
  green: 'bg-green-500/10 text-green-500',
  blue: 'bg-blue-500/10 text-blue-500',
  purple: 'bg-purple-500/10 text-purple-500',
  sky: 'bg-sky-500/10 text-sky-500',
  red: 'bg-red-500/10 text-red-500',
  orange: 'bg-orange-500/10 text-orange-500',
  indigo: 'bg-indigo-500/10 text-indigo-500',
  yellow: 'bg-yellow-500/10 text-yellow-500',
  amber: 'bg-amber-500/10 text-amber-500',
};

export default function VOverview({ onChangeTab }: Props) {
  const kpis = [
    { label: 'Ventas Hoy', val: `$${mock.salesToday.toLocaleString()}`, icon: DollarSign, color: 'emerald', click: 'finances' },
    { label: 'Ventas Mes', val: `$${mock.salesMonth.toLocaleString()}`, icon: TrendingUp, color: 'green', click: 'finances' },
    { label: 'Pedidos Nuevos', val: mock.newOrders, icon: ShoppingCart, color: 'blue', click: 'orders' },
    { label: 'Para Preparar', val: mock.ordersToPrep, icon: Package, color: 'purple', click: 'orders' },
    { label: 'Envío en el Día', val: mock.sameDayShip, icon: Truck, color: 'sky', click: 'shipping' },
    { label: 'Atrasados', val: mock.lateOrders, icon: AlertCircle, color: 'red', click: 'orders' },
    { label: 'Con Incidencia', val: mock.incidentOrders, icon: AlertTriangle, color: 'orange', click: 'incidents' },
    { label: 'Productos Activos', val: mock.activeProducts, icon: Package, color: 'indigo', click: 'products' },
    { label: 'Sin Stock', val: mock.outOfStock, icon: AlertTriangle, color: 'red', click: 'inventory' },
    { label: 'Stock Bajo', val: mock.lowStock, icon: TrendingDown, color: 'yellow', click: 'inventory' },
    { label: 'Saldo Pendiente', val: `$${mock.pendingBalance.toLocaleString()}`, icon: Clock, color: 'amber', click: 'finances' },
    { label: 'Saldo Liquidable', val: `$${mock.settlableBalance.toLocaleString()}`, icon: DollarSign, color: 'emerald', click: 'settlements' },
  ];

  return (
    <div className="max-w-7xl space-y-12 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 px-4">
        <div>
           <div className="text-[12px] text-[#f00856] font-black uppercase tracking-[0.5em] mb-4">Command Center</div>
           <h2 className="text-5xl font-black text-white tracking-tighter">Bienvenido, Vendor</h2>
           <p className="text-sm text-slate-500 font-bold mt-4 uppercase tracking-[0.2em]">{new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6 px-4">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} onClick={() => onChangeTab(k.click)} className="soft rounded-[2.5rem] p-8 hover:bg-white/[0.04] transition-all cursor-pointer group border border-white/5 hover:border-[#f00856]/30 shadow-xl overflow-hidden relative">
              <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-white/5 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
              <div className="flex flex-col gap-6 relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${colorMap[k.color]}`}><Icon className="w-6 h-6" /></div>
                <div>
                   <p className="text-2xl font-black text-white group-hover:text-[#f00856] transition-colors tracking-tighter">{k.val}</p>
                   <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] leading-tight mt-2 group-hover:text-slate-400 transition-colors">{k.label}</h3>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Three columns: Urgent + Alerts + Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-4">
        {/* A. Urgent Orders */}
        <div className="glass rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-10 border-b border-white/5 bg-[#f00856]/5 flex justify-between items-center">
            <h3 className="text-[12px] font-black text-white uppercase tracking-[0.4em] flex items-center gap-4"><AlertCircle className="w-5 h-5 text-[#f00856]" /> Pedidos Urgentes</h3>
            <button onClick={() => onChangeTab('orders')} className="text-[10px] font-black text-[#f00856] uppercase tracking-widest hover:bg-[#f00856]/10 px-4 py-2 rounded-full transition-all">Ver todos</button>
          </div>
          <div className="divide-y divide-white/5">
            {mock.urgentOrders.map(o => (
              <div key={o.id} onClick={() => onChangeTab('orders')} className="p-10 hover:bg-white/[0.03] cursor-pointer flex justify-between items-center group transition-all relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-[#f00856] transition-colors"></div>
                <div className="relative z-10">
                  <p className="text-[16px] font-black text-white group-hover:text-[#f00856] transition-colors uppercase tracking-tight">{o.id} — {o.client}</p>
                  <p className="text-[11px] text-slate-600 font-bold uppercase tracking-widest mt-2 bg-white/5 px-2 py-0.5 rounded inline-block">{o.items} items · {o.zone}</p>
                  <p className="text-[10px] text-slate-700 font-black uppercase mt-2">Corte: <span className="text-[#f00856]">{o.deadline}</span></p>
                </div>
                <div className="text-right relative z-10">
                  <p className="text-lg font-black text-white tracking-tighter">${o.total.toLocaleString()}</p>
                  <span className={`badge mt-4 px-4 py-1.5 rounded-full text-[9px] ${o.status === 'new' ? 'text-blue-400 bg-blue-400/10' : 'text-purple-400 bg-purple-400/10 shadow-lg'}`}>
                    {o.status === 'new' ? 'Nuevo' : 'Preparar'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* B. Alerts */}
        <div className="glass rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-10 border-b border-white/5 bg-amber-500/5 flex justify-between items-center">
            <h3 className="text-[12px] font-black text-white uppercase tracking-[0.4em] flex items-center gap-4"><AlertTriangle className="w-5 h-5 text-amber-500" /> Sistema & Stock</h3>
            <span className="badge bg-amber-500/20 text-amber-500 px-3 py-1 rounded-full text-[11px] font-black">{mock.alerts.length}</span>
          </div>
          <div className="divide-y divide-white/5">
            {mock.alerts.map((a, i) => (
              <div key={i} className={`p-10 flex items-start gap-6 transition-all hover:bg-white/[0.02] ${a.severity === 'error' ? 'bg-red-500/[0.03]' : ''}`}>
                <div className={`w-3 h-3 mt-2 flex-shrink-0 rounded-full ${a.severity === 'error' ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-pulse' : 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]'}`}></div>
                <div>
                  <p className="text-[15px] font-bold text-slate-300 leading-relaxed group-hover:text-white transition-colors">{a.msg}</p>
                  <div className="flex items-center gap-3 mt-4">
                     <span className="text-[10px] text-slate-700 uppercase tracking-[0.3em] font-black bg-white/5 px-2 py-1 rounded-md">{a.type}</span>
                     <span className={`text-[9px] font-black uppercase ${a.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}>{a.severity}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* C. Performance */}
        <div className="glass rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-10 border-b border-white/5 bg-emerald-500/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
               <BarChart3 className="w-5 h-5 text-emerald-500" />
            </div>
            <h3 className="text-[12px] font-black text-white uppercase tracking-[0.4em]">Rendimiento Semanal</h3>
          </div>
          <div className="p-12 space-y-12">
            <PerfRow label="Tasa de Cancelación" value={`${mock.cancelRate}%`} good={mock.cancelRate < 3} />
            <PerfRow label="Entrega en Tiempo" value={`${mock.onTimeRate}%`} good={mock.onTimeRate > 95} />
            <PerfRow label="Tiempo Preparación" value={mock.avgPrepTime} good />
            <PerfRow label="Ticket Promedio" value={`$${mock.avgTicket.toLocaleString()}`} good />
          </div>
          <div className="p-10 mt-4">
             <div className="soft p-8 rounded-[2rem] border border-emerald-500/20 bg-emerald-500/5 flex items-center gap-6">
                <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin-slow" />
                <div>
                   <p className="text-[11px] font-black text-white uppercase tracking-widest">Sincronizado</p>
                   <p className="text-[10px] text-slate-500 font-black uppercase mt-1">Status: Operational</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PerfRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex justify-between items-center group">
      <div className="flex items-center gap-4">
         <div className={`w-2 h-2 rounded-full ${good ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}></div>
         <span className="text-[12px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-white transition-colors">{label}</span>
      </div>
      <span className={`text-3xl font-black tracking-tighter ${good ? 'text-emerald-500' : 'text-red-500'} group-hover:scale-110 transition-transform`}>{value}</span>
    </div>
  );
}

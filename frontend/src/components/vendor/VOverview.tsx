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

  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600', green: 'bg-green-50 text-green-600', blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600', sky: 'bg-sky-50 text-sky-600', red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600', indigo: 'bg-indigo-50 text-indigo-600', yellow: 'bg-yellow-50 text-yellow-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} onClick={() => onChangeTab(k.click)} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer">
              <div className="flex justify-between items-start mb-2">
                <div className={`p-2 rounded-lg ${colorMap[k.color]}`}><Icon className="w-4 h-4" /></div>
                <span className="text-lg font-black text-gray-900">{k.val}</span>
              </div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">{k.label}</h3>
            </div>
          );
        })}
      </div>

      {/* Three columns: Urgent + Alerts + Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* A. Urgent Orders */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-red-50 flex justify-between items-center">
            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-500" /> Pedidos Urgentes</h3>
            <button onClick={() => onChangeTab('orders')} className="text-xs font-bold text-red-600">Ver todos →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {mock.urgentOrders.map(o => (
              <div key={o.id} onClick={() => onChangeTab('orders')} className="p-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-gray-900">{o.id} — {o.client}</p>
                  <p className="text-[10px] text-gray-500">{o.items} items · {o.zone} · Corte: {o.deadline}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black">${o.total.toLocaleString()}</p>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${o.status === 'new' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{o.status === 'new' ? 'Nuevo' : 'Preparar'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* B. Alerts */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-orange-50 flex justify-between items-center">
            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /> Alertas</h3>
            <span className="text-xs font-bold text-orange-600">{mock.alerts.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {mock.alerts.map((a, i) => (
              <div key={i} className={`p-3 flex items-start gap-2.5 ${a.severity === 'error' ? 'bg-red-50/50' : ''}`}>
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.severity === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{a.msg}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mt-0.5">{a.type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* C. Performance */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-emerald-50 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-black text-gray-900">Rendimiento Rápido</h3>
          </div>
          <div className="p-4 space-y-4">
            <PerfRow label="Tasa de Cancelación" value={`${mock.cancelRate}%`} good={mock.cancelRate < 5} />
            <PerfRow label="Entrega en Tiempo" value={`${mock.onTimeRate}%`} good={mock.onTimeRate > 90} />
            <PerfRow label="Tiempo Prom. Preparación" value={mock.avgPrepTime} good />
            <PerfRow label="Ticket Promedio" value={`$${mock.avgTicket.toLocaleString()}`} good />
          </div>
        </div>
      </div>
    </div>
  );
}

function PerfRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-base font-black ${good ? 'text-emerald-600' : 'text-red-600'}`}>{value}</span>
    </div>
  );
}

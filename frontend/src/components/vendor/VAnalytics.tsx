import { BarChart3, TrendingUp, TrendingDown, ShoppingCart, Package, MapPin } from 'lucide-react';

const data = {
  salesByDay: [
    { day: 'Lun', amount: 12400 }, { day: 'Mar', amount: 18900 }, { day: 'Mie', amount: 15200 },
    { day: 'Jue', amount: 22100 }, { day: 'Vie', amount: 28400 }, { day: 'Sab', amount: 19800 }, { day: 'Dom', amount: 8200 },
  ],
  topProducts: [
    { name: 'Jean Slim Fit Premium', sold: 45, revenue: 220050 },
    { name: 'Remera Oversize Urban', sold: 38, revenue: 75620 },
    { name: 'Zapatillas Runner X', sold: 22, revenue: 142780 },
    { name: 'Campera Puffer Light', sold: 18, revenue: 161820 },
    { name: 'Gorra Snapback Classic', sold: 15, revenue: 14850 },
  ],
  topZones: [
    { zone: 'Zona 6 (Centro/Pocitos)', orders: 45, pct: 35 },
    { zone: 'Zona 5 (Carrasco/Malvín)', orders: 28, pct: 22 },
    { zone: 'Zona 7 (Prado/La Teja)', orders: 18, pct: 14 },
    { zone: 'Zona 10 (Costa)', orders: 15, pct: 12 },
    { zone: 'Interior', orders: 12, pct: 9 },
  ],
  deadStock: [
    { name: 'Bufanda Lana Merino', sku: 'BUF-001', lastSale: '15/01/2026', stock: 34 },
    { name: 'Cinturón Cuero Classic', sku: 'CIN-002', lastSale: '28/02/2026', stock: 12 },
  ],
  kpis: { avgTicket: 3240, cancellations: 3, returns: 1, conversionRate: 4.2, totalOrders: 128 },
};

export default function VAnalytics() {
  const max = Math.max(...data.salesByDay.map(d => d.amount));

  return (
    <div className="space-y-5 max-w-6xl">
      <h2 className="text-2xl font-black text-gray-900">Analytics</h2>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Pedidos Mes" value={data.kpis.totalOrders} />
        <Stat label="Ticket Promedio" value={`$${data.kpis.avgTicket.toLocaleString()}`} />
        <Stat label="Cancelaciones" value={data.kpis.cancellations} />
        <Stat label="Devoluciones" value={data.kpis.returns} />
        <Stat label="Conversión" value={`${data.kpis.conversionRate}%`} />
      </div>

      {/* Sales Chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-black text-gray-900 mb-4">Ventas por Día (Última Semana)</h3>
        <div className="flex items-end gap-2 h-40">
          {data.salesByDay.map(d => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-gray-500">${(d.amount / 1000).toFixed(0)}k</span>
              <div className="w-full bg-blue-100 rounded-t-lg relative" style={{ height: `${(d.amount / max) * 100}%` }}>
                <div className="absolute inset-0 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg"></div>
              </div>
              <span className="text-[10px] font-bold text-gray-400">{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Products */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><Package className="w-4 h-4 text-blue-500" /> Top Productos</h3></div>
          <div className="divide-y divide-gray-50">
            {data.topProducts.map((p, i) => (
              <div key={p.name} className="p-3 flex items-center gap-3">
                <span className="text-lg font-black text-gray-300 w-6">#{i + 1}</span>
                <div className="flex-1"><p className="text-sm font-bold text-gray-900">{p.name}</p><p className="text-[10px] text-gray-400">{p.sold} vendidos</p></div>
                <span className="font-black text-gray-900">${p.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Top Zones */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-green-500" /> Zonas con Más Pedidos</h3></div>
          <div className="divide-y divide-gray-50">
            {data.topZones.map(z => (
              <div key={z.zone} className="p-3 flex items-center gap-3">
                <div className="flex-1"><p className="text-sm font-bold text-gray-900">{z.zone}</p><p className="text-[10px] text-gray-400">{z.orders} pedidos</p></div>
                <div className="w-20 h-2 bg-gray-100 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${z.pct}%` }}></div></div>
                <span className="text-xs font-black text-gray-500 w-8 text-right">{z.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dead Stock */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" /> Productos Sin Movimiento</h3>
        <div className="space-y-2">
          {data.deadStock.map(d => (
            <div key={d.sku} className="flex justify-between items-center p-2 bg-red-50 rounded-lg text-sm">
              <div><span className="font-bold text-gray-900">{d.name}</span> <span className="text-gray-400 text-xs">({d.sku})</span></div>
              <div className="text-xs text-gray-500">Última venta: {d.lastSale} · Stock: {d.stock}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (<div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm"><p className="text-xl font-black text-gray-900">{value}</p><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p></div>);
}

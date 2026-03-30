import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BarChart3, TrendingUp, DollarSign, ShoppingCart, Users, Package, Download, RefreshCw, Calendar } from 'lucide-react';

export default function AdminReports() {
  const [stats, setStats] = useState({
    totalRevenue: 0, orderCount: 0, avgTicket: 0,
    productCount: 0, customerCount: 0, paidOrders: 0,
    pendingOrders: 0, cancelledOrders: 0,
  });
  const [monthlyData, setMonthlyData] = useState<{ month: string; revenue: number; orders: number }[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchReports(); }, []);

  async function fetchReports() {
    setLoading(true);
    const [
      { data: orders },
      { count: productCount },
      { count: customerCount },
      { data: orderItems },
    ] = await Promise.all([
      supabase.from('orders').select('id, total, status, created_at'),
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_admin', false),
      supabase.from('order_items').select('quantity, unit_price, products(title)').limit(100),
    ]);

    const allOrders = orders || [];
    const paidStatuses = ['paid', 'shipped', 'delivered'];
    const paid = allOrders.filter(o => paidStatuses.includes(o.status));
    const revenue = paid.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const pending = allOrders.filter(o => o.status === 'pending').length;
    const cancelled = allOrders.filter(o => o.status === 'cancelled').length;

    setStats({
      totalRevenue: revenue,
      orderCount: allOrders.length,
      avgTicket: paid.length ? Math.round(revenue / paid.length) : 0,
      productCount: productCount || 0,
      customerCount: customerCount || 0,
      paidOrders: paid.length,
      pendingOrders: pending,
      cancelledOrders: cancelled,
    });

    // Group by month
    const monthMap: Record<string, { revenue: number; orders: number }> = {};
    allOrders.forEach(o => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { revenue: 0, orders: 0 };
      monthMap[key].orders++;
      if (paidStatuses.includes(o.status)) monthMap[key].revenue += Number(o.total) || 0;
    });
    const monthly = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, data]) => ({ month, ...data }));
    setMonthlyData(monthly);

    // Top products by order frequency
    const productSales: Record<string, { title: string; qty: number; revenue: number }> = {};
    (orderItems || []).forEach((item: any) => {
      const title = item.products?.title || 'Desconocido';
      if (!productSales[title]) productSales[title] = { title, qty: 0, revenue: 0 };
      productSales[title].qty += item.quantity || 0;
      productSales[title].revenue += (item.quantity || 0) * (Number(item.unit_price) || 0);
    });
    setTopProducts(Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
    setLoading(false);
  }

  async function exportCSV() {
    const { data } = await supabase.from('orders').select('id, total, status, created_at, profiles(email)');
    if (!data || data.length === 0) return;
    const header = 'ID,Email,Total,Estado,Fecha\n';
    const rows = data.map((o: any) => `${o.id},${o.profiles?.email || ''},${o.total},${o.status},${o.created_at}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reporte_pedidos_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">{[1,2,3,4].map(i => <div key={i} className="bg-white h-28 rounded-xl border border-gray-200" />)}</div>
        <div className="bg-white h-72 rounded-xl border border-gray-200" />
      </div>
    );
  }

  const maxRev = Math.max(...monthlyData.map(m => m.revenue), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary-600" /> Reportes & Analítica</h2>
          <p className="text-sm text-gray-500 mt-1">Datos en tiempo real desde Supabase</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-secondary text-sm flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button onClick={fetchReports} className="btn-secondary text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Ingresos Totales', value: `$${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'bg-green-50 text-green-600', sub: `${stats.paidOrders} pedidos cobrados` },
          { label: 'Ticket Promedio', value: `$${stats.avgTicket.toLocaleString()}`, icon: TrendingUp, color: 'bg-blue-50 text-blue-600', sub: 'Por pedido pagado' },
          { label: 'Total Pedidos', value: stats.orderCount.toString(), icon: ShoppingCart, color: 'bg-purple-50 text-purple-600', sub: `${stats.pendingOrders} pendientes · ${stats.cancelledOrders} cancelados` },
          { label: 'Clientes', value: stats.customerCount.toString(), icon: Users, color: 'bg-indigo-50 text-indigo-600', sub: `${stats.productCount} productos en catálogo` },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{kpi.label}</span>
              <div className={`p-2 rounded-lg ${kpi.color}`}><kpi.icon className="w-4 h-4" /></div>
            </div>
            <div className="text-2xl font-black text-gray-900 mt-3">{kpi.value}</div>
            <p className="text-[11px] text-gray-400 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Revenue Chart */}
        <div className="xl:col-span-3 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> Ingresos por Mes</h3>
          {monthlyData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No hay datos suficientes para graficar</div>
          ) : (
            <div className="space-y-3">
              {monthlyData.map(m => (
                <div key={m.month} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-gray-500 w-16 flex-shrink-0">{m.month}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-700 flex items-center justify-end pr-3"
                      style={{ width: `${Math.max((m.revenue / maxRev) * 100, 5)}%` }}
                    >
                      <span className="text-[10px] font-black text-white whitespace-nowrap">${m.revenue.toLocaleString()}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">{m.orders} ped.</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Products */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50/50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Package className="w-4 h-4 text-gray-400" /> Top Productos</h3>
          </div>
          {topProducts.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Sin datos de ventas aún</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {topProducts.map((p, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-black text-gray-300 w-5">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{p.title}</p>
                      <p className="text-[11px] text-gray-400">{p.qty} unidades vendidas</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-gray-900 whitespace-nowrap">${p.revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

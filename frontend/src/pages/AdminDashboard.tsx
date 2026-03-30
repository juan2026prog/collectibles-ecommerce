import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  DollarSign, ArrowUpRight, ShoppingCart, Users, Package, TrendingUp,
  AlertTriangle, Clock, Eye, Star, Store, FileText
} from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    activeOrders: 0,
    totalProducts: 0,
    totalCustomers: 0,
    lowStockCount: 0,
    pendingOrders: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchDashboardData(); }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const [
        { count: productCount },
        { count: customerCount },
        { data: orders },
        { data: products },
        { data: lowStock },
      ] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_admin', false),
        supabase.from('orders').select('id, total, status, created_at, profiles(email, first_name, last_name)').order('created_at', { ascending: false }).limit(10),
        supabase.from('products').select('id, title, base_price, status, product_variants(inventory_count)').order('created_at', { ascending: false }).limit(5),
        supabase.from('product_variants').select('id, sku, inventory_count, products(title)').lt('inventory_count', 5).order('inventory_count').limit(5),
      ]);

      const allOrders = orders || [];
      const revenue = allOrders.reduce((sum: number, o: any) => sum + (o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered' ? Number(o.total) || 0 : 0), 0);
      const pending = allOrders.filter((o: any) => o.status === 'pending').length;

      setStats({
        totalRevenue: revenue,
        activeOrders: allOrders.length,
        totalProducts: productCount || 0,
        totalCustomers: customerCount || 0,
        lowStockCount: (lowStock || []).length,
        pendingOrders: pending,
      });
      setRecentOrders(allOrders.slice(0, 8));
      setTopProducts(products || []);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
    setLoading(false);
  }

  const statusMap: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    paid: { label: 'Pagado', cls: 'bg-green-100 text-green-800 border-green-200' },
    processing: { label: 'Procesando', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    shipped: { label: 'Enviado', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    delivered: { label: 'Entregado', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-800 border-red-200' },
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto animate-pulse space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-xl h-32 border border-gray-200" />)}
        </div>
        <div className="bg-white rounded-xl h-96 border border-gray-200" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-8">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Ingresos Totales</div>
            <div className="p-2 bg-green-50 rounded-lg"><DollarSign className="w-5 h-5 text-green-600" /></div>
          </div>
          <div className="mt-4 flex items-baseline">
            <div className="text-3xl font-black text-gray-900">${stats.totalRevenue.toLocaleString()}</div>
            <div className="ml-2 flex items-center text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">
              <ArrowUpRight className="w-3 h-3 mr-0.5" /> Tiempo Real
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">De pedidos pagados, enviados y entregados</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Pedidos</div>
            <div className="p-2 bg-blue-50 rounded-lg"><ShoppingCart className="w-5 h-5 text-blue-600" /></div>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <div className="text-3xl font-black text-gray-900">{stats.activeOrders}</div>
            {stats.pendingOrders > 0 && (
              <span className="text-xs font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded flex items-center gap-1">
                <Clock className="w-3 h-3" /> {stats.pendingOrders} pendientes
              </span>
            )}
          </div>
          <Link to="/admin/orders" className="text-xs text-primary-600 font-bold mt-2 block hover:underline">Ver todos →</Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Productos</div>
            <div className="p-2 bg-purple-50 rounded-lg"><Package className="w-5 h-5 text-purple-600" /></div>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <div className="text-3xl font-black text-gray-900">{stats.totalProducts}</div>
            {stats.lowStockCount > 0 && (
              <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {stats.lowStockCount} bajo stock
              </span>
            )}
          </div>
          <Link to="/admin/products" className="text-xs text-primary-600 font-bold mt-2 block hover:underline">Gestionar →</Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Clientes</div>
            <div className="p-2 bg-indigo-50 rounded-lg"><Users className="w-5 h-5 text-indigo-600" /></div>
          </div>
          <div className="mt-4 flex items-baseline">
            <div className="text-3xl font-black text-gray-900">{stats.totalCustomers}</div>
          </div>
          <Link to="/admin/customers" className="text-xs text-primary-600 font-bold mt-2 block hover:underline">Ver CRM →</Link>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Recent Orders */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Últimos Pedidos</h3>
            <Link to="/admin/orders" className="text-sm font-bold text-primary-600 hover:text-primary-700">Ver todos →</Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-200" />
              <p className="font-semibold">Aún no hay pedidos</p>
              <p className="text-sm mt-1">Los pedidos aparecerán aquí cuando los clientes compren</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">ID</th>
                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Cliente</th>
                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Total</th>
                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentOrders.map((o: any) => {
                    const st = statusMap[o.status] || { label: o.status, cls: 'bg-gray-100 text-gray-600' };
                    const profile = o.profiles;
                    return (
                      <tr key={o.id} className="hover:bg-gray-50/50 transition-colors group cursor-pointer">
                        <td className="px-6 py-4 text-sm font-black text-primary-600 group-hover:text-primary-700">{o.id.slice(0, 8)}...</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-700">{profile?.first_name || profile?.email || 'Anónimo'}</td>
                        <td className="px-6 py-4 text-sm font-black text-gray-900">${Number(o.total).toLocaleString()}</td>
                        <td className="px-6 py-4"><span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md border ${st.cls}`}>{st.label}</span></td>
                        <td className="px-6 py-4 text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('es')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Access & Products */}
        <div className="space-y-6">
          {/* Quick Access */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-gray-400" /> Acceso Rápido</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Productos', href: '/admin/products', icon: Package, color: 'bg-purple-50 text-purple-600 hover:bg-purple-100' },
                { name: 'Pedidos', href: '/admin/orders', icon: ShoppingCart, color: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
                { name: 'Marcas', href: '/admin/brands', icon: Star, color: 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100' },
                { name: 'Banners', href: '/admin/banners', icon: Eye, color: 'bg-pink-50 text-pink-600 hover:bg-pink-100' },
                { name: 'Afiliados', href: '/admin/affiliates', icon: Users, color: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' },
                { name: 'Settings', href: '/admin/settings', icon: Store, color: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
              ].map(q => (
                <Link key={q.name} to={q.href} className={`flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-bold transition-colors ${q.color}`}>
                  <q.icon className="w-4 h-4" /> {q.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Products */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Package className="w-4 h-4 text-gray-400" /> Productos Recientes</h3>
            </div>
            {topProducts.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No hay productos aún</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {topProducts.map((p: any) => {
                  const stock = p.product_variants?.reduce((s: number, v: any) => s + (v.inventory_count || 0), 0) || 0;
                  return (
                    <div key={p.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                      <div>
                        <p className="text-sm font-bold text-gray-800 truncate max-w-[200px]">{p.title}</p>
                        <p className="text-xs text-gray-400">{stock} unidades</p>
                      </div>
                      <span className="text-sm font-black text-gray-900">${Number(p.base_price).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

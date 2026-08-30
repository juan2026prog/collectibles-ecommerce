import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFeatures } from '../contexts/FeatureToggleContext';
import {
  DollarSign, ArrowUpRight, ShoppingCart, Users, Package, TrendingUp,
  AlertTriangle, Clock, Eye, Star, Store, FileText, Settings as SettingsIcon, RefreshCw, ChevronRight
} from 'lucide-react';
import ResponsiveDataList from '../components/admin/ResponsiveDataList';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { features } = useFeatures();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    activeOrders: 0,
    totalProducts: 0,
    totalCustomers: 0,
    lowStockCount: 0,
    pendingOrders: 0,
    collectiblesPending: 0,
    mktPendingOrders: 0,
    mktPendingVendors: 0,
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
        { data: suborders },
      ] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_admin', false),
        supabase.from('orders').select('id, total_amount, status, created_at, customer:profiles(email, first_name, last_name)').order('created_at', { ascending: false }).limit(10),
        supabase.from('products').select('id, title, base_price, status, product_variants(inventory_count)').order('created_at', { ascending: false }).limit(5),
        supabase.from('product_variants').select('id, sku, inventory_count, products(title)').lt('inventory_count', 5).order('inventory_count').limit(5),
        supabase.from('order_suborders').select('id, status, vendor_name, parentOrder:orders(payment_status, status)'),
      ]);

      const allOrders = orders || [];
      const revenue = allOrders.reduce((sum: number, o: any) => sum + (o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered' ? Number(o.total_amount) || 0 : 0), 0);
      const pending = allOrders.filter((o: any) => o.status === 'pending').length;

      const colPending = (suborders || []).filter((s: any) => 
        (!s.vendor_name || s.vendor_name?.toLowerCase().includes('collectibles')) &&
        (s.parentOrder?.payment_status === 'approved' || s.parentOrder?.status === 'paid') &&
        (!s.status || s.status === 'pendiente' || s.status === 'preparando')
      ).length;

      const mktOrders = (suborders || []).filter((s: any) => 
        s.vendor_name && !s.vendor_name?.toLowerCase().includes('collectibles') &&
        (s.parentOrder?.payment_status === 'approved' || s.parentOrder?.status === 'paid') &&
        (!s.status || s.status === 'pendiente' || s.status === 'preparando')
      ).length;

      const mktVendors = new Set(
        (suborders || []).filter((s: any) => 
          s.vendor_name && !s.vendor_name?.toLowerCase().includes('collectibles') &&
          (s.parentOrder?.payment_status === 'approved' || s.parentOrder?.status === 'paid') &&
          (!s.status || s.status === 'pendiente' || s.status === 'preparando')
        ).map((s: any) => s.vendor_name)
      ).size;

      setStats({
        totalRevenue: revenue,
        activeOrders: allOrders.length,
        totalProducts: productCount || 0,
        totalCustomers: customerCount || 0,
        lowStockCount: (lowStock || []).length,
        pendingOrders: pending,
        collectiblesPending: colPending,
        mktPendingOrders: mktOrders,
        mktPendingVendors: mktVendors,
      });
      setRecentOrders(allOrders.slice(0, 8));
      setTopProducts(products || []);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
    setLoading(false);
  }

  const statusMap: Record<string, { label: string; cls: string }> = {
    pending: { label: 'PENDIENTE', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    paid: { label: 'PAGADO', cls: 'bg-green-100 text-green-800 border-green-200' },
    processing: { label: 'PROCESANDO', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    shipped: { label: 'ENVIADO', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    delivered: { label: 'ENTREGADO', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    cancelled: { label: 'CANCELADO', cls: 'bg-red-100 text-red-800 border-red-200' },
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto animate-pulse space-y-6">
        <div className="grid grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-xl h-32 border border-gray-200" />)}
        </div>
        <div className="bg-white rounded-xl h-96 border border-gray-200" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-6 md:space-y-8 min-w-0">
      {/* MOBILE & DESKTOP OPERATIONAL SUMMARY CARD: OPERACIÓN DE HOY */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-2xl p-4 sm:p-6 shadow-xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="font-black text-sm sm:text-base uppercase tracking-wider text-white">
              Operación de Hoy
            </h2>
          </div>
          <Link
            to="/admin/orders"
            className="text-xs font-black text-emerald-400 hover:underline flex items-center gap-1"
          >
            Ver Operación <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <Link
            to="/admin/orders"
            className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 p-4 rounded-xl flex items-center justify-between text-left transition-colors"
          >
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Collectibles Propios</span>
              <span className="text-xl font-black text-emerald-400 block mt-0.5">{stats.collectiblesPending} por preparar</span>
            </div>
            <span className="px-3 py-1 bg-emerald-500 text-slate-950 font-black rounded-lg text-xs shrink-0 shadow-xs">
              Preparar
            </span>
          </Link>

          <Link
            to="/admin/marketplace"
            className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 p-4 rounded-xl flex items-center justify-between text-left transition-colors"
          >
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Marketplace Vendors</span>
              <span className="text-xl font-black text-amber-400 block mt-0.5">{stats.mktPendingOrders} pedidos ({stats.mktPendingVendors} vendors)</span>
            </div>
            <span className="px-3 py-1 bg-amber-500 text-slate-950 font-black rounded-lg text-xs shrink-0 shadow-xs">
              Supervisar
            </span>
          </Link>
        </div>
      </div>

      {/* KPI Grid: 1 col <390px, 2 cols 390px-1023px, 4 cols >=1024px */}
      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Total Revenue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Ingresos Totales</div>
            <div className="p-2 bg-green-50 rounded-lg shrink-0"><DollarSign className="w-5 h-5 text-green-600" /></div>
          </div>
          <div className="mt-3 sm:mt-4 flex items-baseline flex-wrap gap-1">
            <div className="text-2xl sm:text-3xl font-black text-gray-900">${stats.totalRevenue.toLocaleString()}</div>
            <div className="flex items-center text-[10px] sm:text-xs font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
              <ArrowUpRight className="w-3 h-3 mr-0.5" /> Tiempo Real
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">De pedidos pagados, enviados y entregados</p>
        </div>

        {/* Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Pedidos</div>
            <div className="p-2 bg-blue-50 rounded-lg shrink-0"><ShoppingCart className="w-5 h-5 text-blue-600" /></div>
          </div>
          <div className="mt-3 sm:mt-4 flex items-baseline gap-2 flex-wrap">
            <div className="text-2xl sm:text-3xl font-black text-gray-900">{stats.activeOrders}</div>
            {stats.pendingOrders > 0 && (
              <span className="text-[10px] sm:text-xs font-bold text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Clock className="w-3 h-3" /> {stats.pendingOrders} pendientes
              </span>
            )}
          </div>
          <Link to="/admin/orders" className="text-xs text-primary-600 font-bold mt-2 block hover:underline">Ver todos →</Link>
        </div>

        {/* Products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Productos</div>
            <div className="p-2 bg-purple-50 rounded-lg shrink-0"><Package className="w-5 h-5 text-purple-600" /></div>
          </div>
          <div className="mt-3 sm:mt-4 flex items-baseline gap-2 flex-wrap">
            <div className="text-2xl sm:text-3xl font-black text-gray-900">{stats.totalProducts}</div>
            {stats.lowStockCount > 0 && (
              <span className="text-[10px] sm:text-xs font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {stats.lowStockCount} bajo stock
              </span>
            )}
          </div>
          <Link to="/admin/products" className="text-xs text-primary-600 font-bold mt-2 block hover:underline">Gestionar →</Link>
        </div>

        {/* Customers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Clientes</div>
            <div className="p-2 bg-indigo-50 rounded-lg shrink-0"><Users className="w-5 h-5 text-indigo-600" /></div>
          </div>
          <div className="mt-3 sm:mt-4 flex items-baseline">
            <div className="text-2xl sm:text-3xl font-black text-gray-900">{stats.totalCustomers}</div>
          </div>
          <Link to="/admin/customers" className="text-xs text-primary-600 font-bold mt-2 block hover:underline">Ver CRM →</Link>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-8">
        {/* Recent Orders */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
              <FileText className="w-4 h-4 text-gray-400" /> Últimos Pedidos
            </h3>
            <Link to="/admin/orders" className="text-xs sm:text-sm font-bold text-primary-600 hover:text-primary-700">
              Ver todos →
            </Link>
          </div>

          <ResponsiveDataList
            items={recentOrders}
            keyExtractor={(o) => o.id}
            emptyTitle="Aún no hay pedidos"
            emptyDescription="Los pedidos aparecerán aquí cuando los clientes compren en la tienda."
            renderCard={(o) => {
              const st = statusMap[o.status] || { label: o.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
              const profile = o.customer;
              const customerName = profile?.first_name || profile?.email || 'Anónimo';
              return (
                <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-primary-600 text-sm">
                      Pedido #{o.id.slice(0, 8)}
                    </span>
                    <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-gray-100 py-2">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Cliente</span>
                      <span className="font-bold text-gray-800 truncate block">{customerName}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Total</span>
                      <span className="font-black text-gray-900 text-sm">${Number(o.total_amount).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-gray-400">
                      Fecha: {new Date(o.created_at).toLocaleDateString('es')}
                    </span>
                    <button
                      onClick={() => navigate('/admin/orders')}
                      className="px-3 py-1.5 bg-primary-50 text-primary-700 hover:bg-primary-100 font-bold rounded-lg transition-colors flex items-center gap-1 min-h-[36px]"
                    >
                      Ver pedido <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            }}
            renderTableHeader={() => (
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">ID</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Cliente</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Total</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Fecha</th>
              </tr>
            )}
            renderTableRow={(o) => {
              const st = statusMap[o.status] || { label: o.status, cls: 'bg-gray-100 text-gray-600' };
              const profile = o.customer;
              return (
                <tr key={o.id} onClick={() => navigate('/admin/orders')} className="hover:bg-gray-50/50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4 text-sm font-black text-primary-600 group-hover:text-primary-700">{o.id.slice(0, 8)}...</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-700">{profile?.first_name || profile?.email || 'Anónimo'}</td>
                  <td className="px-6 py-4 text-sm font-black text-gray-900">${Number(o.total_amount).toLocaleString()}</td>
                  <td className="px-6 py-4"><span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md border ${st.cls}`}>{st.label}</span></td>
                  <td className="px-6 py-4 text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('es')}</td>
                </tr>
              );
            }}
          />
        </div>

        {/* Quick Access & Products */}
        <div className="space-y-6">
          {/* Quick Access */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm sm:text-base">
              <TrendingUp className="w-4 h-4 text-gray-400" /> Acceso Rápido
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Productos', href: '/admin/products', icon: Package, color: 'bg-purple-50 text-purple-600 hover:bg-purple-100' },
                { name: 'Pedidos', href: '/admin/orders', icon: ShoppingCart, color: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
                { name: 'Reembolsos', href: '/admin/refunds', icon: RefreshCw, color: 'bg-rose-50 text-rose-600 hover:bg-rose-100' },
                { name: 'Marcas', href: '/admin/brands', icon: Star, color: 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100' },
                { name: 'Banners', href: '/admin/banners', icon: Eye, color: 'bg-pink-50 text-pink-600 hover:bg-pink-100' },
                { name: 'Afiliados', href: '/admin/affiliates', icon: Users, color: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' },
                ...(features.marketplaceEnabled ? [{ name: 'Marketplace', href: '/admin/marketplace', icon: Store, color: 'bg-teal-50 text-teal-600 hover:bg-teal-100' }] : []),
                { name: 'Settings', href: '/admin/settings', icon: SettingsIcon, color: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
              ].map(q => (
                <Link key={q.name} to={q.href} className={`flex items-center gap-2 px-3 py-3 rounded-lg text-xs sm:text-sm font-bold transition-colors min-h-[44px] ${q.color}`}>
                  <q.icon className="w-4 h-4 shrink-0" /> <span className="truncate">{q.name}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Products */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                <Package className="w-4 h-4 text-gray-400" /> Productos Recientes
              </h3>
            </div>
            {topProducts.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No hay productos aún</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {topProducts.map((p: any) => {
                  const stock = p.product_variants?.reduce((s: number, v: any) => s + (v.inventory_count || 0), 0) || 0;
                  return (
                    <div key={p.id} className="px-4 sm:px-6 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs sm:text-sm font-bold text-gray-800 truncate max-w-[180px] sm:max-w-[200px]">{p.title}</p>
                        <p className="text-xs text-gray-400">{stock} unidades</p>
                      </div>
                      <span className="text-xs sm:text-sm font-black text-gray-900 shrink-0">${Number(p.base_price).toLocaleString()}</span>
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

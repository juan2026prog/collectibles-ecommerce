import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart3, TrendingUp, TrendingDown, ShoppingCart, Package, MapPin, RefreshCw } from 'lucide-react';

interface VAnalyticsProps {
  activeStoreId?: string;
}

export default function VAnalytics({ activeStoreId }: VAnalyticsProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function loadStats() {
      setLoading(true);
      try {
        const vendorId = user!.id;

        // 1. Fetch order items for sales history, conversion rate, avg ticket, etc.
        let query = supabase
          .from('order_items')
          .select(`
            id, price, quantity, created_at, vendor_store_id,
            order:orders(id, status, shipping_address),
            product:products(id, title)
          `)
          .eq('vendor_id', vendorId);

        if (activeStoreId) {
          query = query.eq('vendor_store_id', activeStoreId);
        }

        const { data: items } = await query;
        const allItems = items || [];

        // 2. Filter active items
        const nonCancelledItems = allItems.filter(item => item.order?.status !== 'cancelled');

        // Total orders
        const uniqueOrderIds = new Set(nonCancelledItems.map(item => item.order?.id).filter(Boolean));
        const totalOrders = uniqueOrderIds.size;

        // Total sales revenue
        const totalSales = nonCancelledItems.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);

        // Average ticket
        const avgTicket = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

        // Cancellations count
        const cancellations = allItems.filter(item => item.order?.status === 'cancelled').length;

        // Top products calculation
        const productSales: Record<string, { name: string; sold: number; revenue: number }> = {};
        nonCancelledItems.forEach(item => {
          const prodId = item.product?.id;
          if (!prodId) return;
          const title = item.product?.title || 'Producto';
          if (!productSales[prodId]) {
            productSales[prodId] = { name: title, sold: 0, revenue: 0 };
          }
          productSales[prodId].sold += item.quantity;
          productSales[prodId].revenue += Number(item.price) * item.quantity;
        });
        const topProducts = Object.values(productSales)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        // Sales by day
        const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        const daySales: Record<string, number> = { Lun: 0, Mar: 0, Mie: 0, Jue: 0, Vie: 0, Sab: 0, Dom: 0 };
        
        // Let's populate the last 7 days of sales
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        nonCancelledItems.forEach(item => {
          const date = new Date(item.created_at);
          if (date >= oneWeekAgo) {
            const dayName = days[date.getDay()];
            daySales[dayName] = (daySales[dayName] || 0) + Number(item.price) * item.quantity;
          }
        });
        const salesByDay = Object.entries(daySales).map(([day, amount]) => ({ day, amount }));

        // Low stock / Dead stock count
        let lowStockQuery = supabase
          .from('vendor_product_variants')
          .select(`
            id, sku, inventory_count, 
            product:vendor_products!inner(id, title, vendor_id, product_id)
          `)
          .eq('product.vendor_id', vendorId)
          .eq('inventory_count', 0); // Out of stock

        const { data: rawLowStock } = await lowStockQuery.limit(50);
        let filteredDeadStock = rawLowStock || [];
        if (activeStoreId && filteredDeadStock.length > 0) {
          const prodIds = filteredDeadStock.map(x => x.product.product_id).filter(Boolean);
          const { data: storeProds } = await supabase
            .from('products')
            .select('id, vendor_store_id')
            .in('id', prodIds);
            
          const validProdIds = new Set(
            storeProds?.filter(p => p.vendor_store_id === activeStoreId).map(p => p.id) || []
          );
          filteredDeadStock = filteredDeadStock.filter(x => validProdIds.has(x.product.product_id));
        }

        const deadStock = filteredDeadStock.map(x => ({
          name: x.product?.title || 'Producto',
          sku: x.sku,
          stock: x.inventory_count,
          lastSale: '--'
        })).slice(0, 5);

        // Fetch store specific conversion, followers, rating
        let storeStats: any = null;
        if (activeStoreId) {
          const { data } = await supabase
            .from('vendor_stores')
            .select('*')
            .eq('id', activeStoreId)
            .single();
          storeStats = data;
        }

        setStats({
          totalOrders,
          avgTicket,
          cancellations,
          returns: 0,
          conversionRate: storeStats ? (storeStats.response_rate || 98) : 98,
          salesByDay,
          topProducts,
          deadStock,
          totalRevenue: totalSales,
          followers: storeStats ? storeStats.followers_count : 0
        });

      } catch (err) {
        console.error('Analytics load error:', err);
      }
      setLoading(false);
    }
    loadStats();
  }, [user, activeStoreId]);

  if (loading || !stats) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-8 h-8 text-primary-600 animate-spin" />
        <p className="text-sm font-medium text-gray-500 animate-pulse">Cargando estadísticas de desempeño...</p>
      </div>
    );
  }

  const max = Math.max(...stats.salesByDay.map((d: any) => d.amount), 1);

  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div>
         <div className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-3">Intelligence Hub</div>
         <h2 className="text-5xl font-black text-gray-900">Análisis de Desempeño</h2>
         <p className="text-sm text-gray-500 font-bold mt-3 uppercase tracking-[0.2em]">Métricas críticas de conversión y optimización de catálogo</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Total Orders" value={stats.totalOrders} />
        <Stat label="Avg Ticket" value={`$${stats.avgTicket.toLocaleString()}`} />
        <Stat label="Cancellations" value={stats.cancellations} />
        <Stat label="Seguidores" value={stats.followers} />
        <Stat label="Entregas" value={`${stats.conversionRate}%`} />
      </div>

      {/* Sales Chart */}
      <div className="bg-white rounded-[2.5rem] border border-gray-200 p-12 group hover:bg-gray-50 transition-all shadow-sm">
        <div className="flex justify-between items-center mb-12">
           <div className="flex items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center shadow-sm">
                 <BarChart3 className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                 <h3 className="text-[11px] font-black text-primary-600 uppercase tracking-[0.4em] mb-1">Revenue Stream</h3>
                 <h4 className="text-2xl font-black text-gray-900 uppercase tracking-widest">Ventas Diarias (Última Semana)</h4>
              </div>
           </div>
           <div className="text-right">
              <p className="text-4xl font-black text-gray-900 group-hover:text-primary-600 transition-colors">${stats.totalRevenue.toLocaleString()}</p>
              <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mt-2 flex items-center justify-end gap-2">
                <TrendingUp className="w-4 h-4" /> Actividad reciente
              </p>
           </div>
        </div>
        <div className="flex items-end gap-3 h-72">
          {stats.salesByDay.map((d: any) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-6 group/bar">
              <span className="text-[11px] font-black text-gray-500 group-hover/bar:text-gray-900 transition-colors uppercase tracking-widest">${(d.amount / 1000).toFixed(1)}k</span>
              <div className="w-full bg-gray-50 relative rounded-xl group-hover/bar:border-primary-600/30 transition-all overflow-hidden border border-gray-100" style={{ height: `${(d.amount / max) * 100}%` }}>
                <div className="absolute inset-0 bg-gradient-to-t from-[#f00856] to-[#ff2c68] opacity-80 transform translate-y-full group-hover/bar:translate-y-0 transition-transform duration-700 ease-out shadow-sm"></div>
                <div className="absolute inset-0 bg-gray-50 group-hover/bar:opacity-0 transition-opacity"></div>
              </div>
              <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest group-hover/bar:text-gray-900 transition-colors">{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Products */}
        <div className="bg-white rounded-[2rem] border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-10 border-b border-gray-100 bg-gray-50 flex items-center gap-6">
             <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-primary-600" />
              </div>
              <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.4em]">Top Selling Assets</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.topProducts.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No hay registros de ventas.</div>
            ) : (
              stats.topProducts.map((p: any, i: number) => (
                <div key={p.name} className="p-8 flex items-center gap-8 hover:bg-gray-50 transition-colors group">
                  <span className="text-3xl font-black text-slate-800 group-hover:text-primary-600 transition-colors w-10">0{i + 1}</span>
                  <div className="flex-1">
                     <p className="text-lg font-black text-gray-900 uppercase tracking-widest group-hover:translate-x-3 transition-transform">{p.name}</p>
                     <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest mt-2">{p.sold} unidades vendidas</p>
                  </div>
                  <span className="font-black text-xl text-gray-900 group-hover:text-emerald-500 transition-colors tracking-tighter">${p.revenue.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Dead Stock / Out of Stock */}
        <div className="bg-white rounded-[2rem] border border-primary-600/30 bg-primary-50 p-10 group hover:bg-primary-100 transition-all shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
             <TrendingDown className="w-48 h-48 text-gray-900 -rotate-12" />
          </div>
          <div className="flex items-center gap-6 mb-12 relative z-10">
             <div className="w-16 h-16 rounded-2xl bg-primary-200 flex items-center justify-center border border-primary-600/30 shadow-sm">
                <TrendingDown className="w-8 h-8 text-primary-600" />
             </div>
             <div>
                <h3 className="text-[11px] font-black text-primary-600 uppercase tracking-[0.4em] mb-1">Stock Warning</h3>
                <h4 className="text-2xl font-black text-gray-900 uppercase tracking-widest">Productos Agotados (Sin Stock)</h4>
             </div>
          </div>
          <div className="grid grid-cols-1 gap-6 relative z-10">
            {stats.deadStock.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No tienes productos agotados.</div>
            ) : (
              stats.deadStock.map((d: any) => (
                <div key={d.sku} className="soft rounded-[1.5rem] p-8 border border-gray-200 bg-white flex justify-between items-center group-hover:border-primary-600/40 transition-all hover:scale-[1.01] shadow-sm">
                  <div>
                     <span className="text-lg font-black text-gray-900 uppercase tracking-widest">{d.name}</span>
                     <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest mt-2 bg-gray-50 px-2 py-1 rounded inline-block">SKU: {d.sku}</p>
                  </div>
                  <div className="text-right">
                     <p className="text-lg text-primary-600 font-black uppercase tracking-tighter">Sin Stock</p>
                     <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-2">Revisar inventario</p>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="soft rounded-3xl p-10 group hover:bg-gray-50 transition-all border border-gray-100 hover:border-primary-300 shadow-sm">
      <p className="text-3xl font-black text-gray-900 group-hover:text-primary-600 transition-colors mb-4 tracking-tighter">{value}</p>
      <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em]">{label}</p>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  DollarSign, ShoppingCart, Package, AlertTriangle, Clock, 
  ArrowRight, CreditCard, Truck, UploadCloud, Settings, Link2, PlusCircle
} from 'lucide-react';

export default function VOverview() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  
  const [stats, setStats] = useState({
    salesMonth: 0,
    ordersCount: 0,
    pendingBalance: 0,
    activeProducts: 0
  });

  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  
  // Onboarding state
  const [onboarding, setOnboarding] = useState({
    profile: false,
    kyc: false,
    billing: false,
    shipping: false,
    mercadolibre: false,
    isComplete: false
  });

  useEffect(() => {
    if (!user) return;
    loadDashboardData();
  }, [user]);

  async function loadDashboardData() {
    setLoading(true);
    try {
      const vendorId = user!.id;
      
      // 1. Fetch Payouts (for pending balance and sales of the month)
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      
      const { data: payouts } = await supabase
        .from('vendor_payouts')
        .select('amount, status, created_at')
        .eq('vendor_id', vendorId);

      const pList = payouts || [];
      const salesM = pList.filter(p => p.created_at >= startOfMonth && (p.status === 'paid' || p.status === 'settlable' || p.status === 'pending')).reduce((sum, p) => sum + Number(p.amount), 0);
      const pendingF = pList.filter(p => p.status === 'pending' || p.status === 'settlable').reduce((sum, p) => sum + Number(p.amount), 0);

      // 2. Fetch Active Products
      const { count: prodCount } = await supabase
        .from('vendor_products')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .eq('status', 'active');

      // 3. Fetch Recent Orders (by joining order_items)
      const { data: orderItems } = await supabase
        .from('order_items')
        .select(`
          order_id,
          price,
          quantity,
          order:orders(id, created_at, status, customer:profiles(first_name, last_name, email))
        `)
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(20);

      // Unique orders mapping
      const uniqueOrdersMap = new Map();
      (orderItems || []).forEach((oi: any) => {
        if (!oi.order) return;
        if (!uniqueOrdersMap.has(oi.order_id)) {
          uniqueOrdersMap.set(oi.order_id, {
            ...oi.order,
            total_amount: Number(oi.price) * Number(oi.quantity)
          });
        } else {
          const existing = uniqueOrdersMap.get(oi.order_id);
          existing.total_amount += Number(oi.price) * Number(oi.quantity);
        }
      });
      const uniqueOrders = Array.from(uniqueOrdersMap.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // 4. Fetch Low Stock
      const { data: lowStockData } = await supabase
        .from('vendor_product_variants')
        .select(`
          id, sku, inventory_count, 
          product:vendor_products!inner(id, title, vendor_id)
        `)
        .eq('product.vendor_id', vendorId)
        .lt('inventory_count', 5)
        .order('inventory_count', { ascending: true })
        .limit(5);

      // 5. Build Alerts (KYC, ML, Logistics) & Onboarding
      const { data: vendorData } = await supabase
        .from('vendors')
        .select('store_name, tax_id, kyc_status, vendor_payment_settings, shipping_settings')
        .eq('id', vendorId)
        .single();

      const { data: mlConn } = await supabase
        .from('ml_seller_accounts')
        .select('status')
        .eq('vendor_id', vendorId)
        .maybeSingle();

      let hasShipping = false;
      if (vendorData?.shipping_settings) {
        const s = vendorData.shipping_settings as any;
        hasShipping = !!(
          s.dac?.active ||
          s.ues?.active ||
          s.soydelivery?.active ||
          s.correo_uruguayo?.active ||
          s.pickup?.active ||
          s.manual?.active
        );
      }
      
      const obProfile = !!vendorData?.store_name;
      const obKyc = !!vendorData?.tax_id && vendorData?.kyc_status !== 'pending'; // or just checking if they submitted documents
      const obBilling = !!vendorData?.vendor_payment_settings?.account_number;
      const obShipping = hasShipping;
      const obML = mlConn?.status === 'active';

      setOnboarding({
        profile: obProfile,
        kyc: !!vendorData?.tax_id, // At least submitted tax_id
        billing: obBilling,
        shipping: obShipping,
        mercadolibre: obML,
        isComplete: obProfile && !!vendorData?.tax_id && obBilling && obShipping && obML
      });

      const newAlerts = [];
      if (vendorData?.kyc_status === 'pending') {
        newAlerts.push({ type: 'warning', msg: 'Tu cuenta está pendiente de validación KYC. Algunas funciones podrían estar limitadas.', link: '/vendor?tab=settings' });
      }
      if (vendorData?.kyc_status === 'rejected') {
        newAlerts.push({ type: 'error', msg: 'Tus documentos KYC fueron rechazados. Por favor revisa y vuelve a enviarlos.', link: '/vendor?tab=settings' });
      }
      if (!mlConn || mlConn.status !== 'active') {
        newAlerts.push({ type: 'info', msg: 'No has conectado tu cuenta de Mercado Libre. Pierdes alcance de ventas.', link: '/vendor?tab=mercadolibre' });
      }
      if (!hasDac && !hasSoyDelivery) {
        newAlerts.push({ type: 'warning', msg: 'No has configurado una cuenta logística (DAC o SoyDelivery). Las etiquetas no se generarán automáticamente.', link: '/vendor?tab=shipping' });
      }

      setStats({
        salesMonth: salesM,
        ordersCount: uniqueOrders.length, // total history we fetched or similar
        pendingBalance: pendingF,
        activeProducts: prodCount || 0
      });
      setRecentOrders(uniqueOrders.slice(0, 5));
      setLowStock(lowStockData || []);
      setAlerts(newAlerts);

    } catch (err) {
      console.error('Overview fetch error:', err);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-xl h-32 border border-gray-200" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl h-96 border border-gray-200" />
          <div className="bg-white rounded-xl h-96 border border-gray-200" />
        </div>
      </div>
    );
  }

  const statusMap: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    paid: { label: 'Pagado', cls: 'bg-green-100 text-green-800 border-green-200' },
    processing: { label: 'Procesando', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    shipped: { label: 'Enviado', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    delivered: { label: 'Entregado', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-800 border-red-200' },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {!onboarding.isComplete && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Comienza a vender en Collectibles</h2>
          <p className="text-sm text-gray-500 mb-6">Completa estos pasos para activar tu tienda y empezar a recibir pedidos.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Link to="/vendor?tab=settings" className={`p-4 rounded-xl border ${onboarding.profile ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-black'} flex flex-col items-center text-center transition-colors`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 ${onboarding.profile ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                1
              </div>
              <span className="text-sm font-bold text-gray-900">Perfil</span>
              <span className="text-xs text-gray-500 mt-1">Logo y datos</span>
            </Link>

            <Link to="/vendor?tab=settings" className={`p-4 rounded-xl border ${onboarding.kyc ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-black'} flex flex-col items-center text-center transition-colors`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 ${onboarding.kyc ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                2
              </div>
              <span className="text-sm font-bold text-gray-900">Documentación</span>
              <span className="text-xs text-gray-500 mt-1">RUT y Fiscal</span>
            </Link>

            <Link to="/vendor?tab=settings" className={`p-4 rounded-xl border ${onboarding.billing ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-black'} flex flex-col items-center text-center transition-colors`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 ${onboarding.billing ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                3
              </div>
              <span className="text-sm font-bold text-gray-900">Cobros</span>
              <span className="text-xs text-gray-500 mt-1">Cuenta bancaria</span>
            </Link>

            <Link to="/vendor?tab=settings" className={`p-4 rounded-xl border ${onboarding.shipping ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-black'} flex flex-col items-center text-center transition-colors`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 ${onboarding.shipping ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                4
              </div>
              <span className="text-sm font-bold text-gray-900">Logística</span>
              <span className="text-xs text-gray-500 mt-1">DAC / SoyDelivery</span>
            </Link>

            <Link to="/vendor?tab=settings" className={`p-4 rounded-xl border ${onboarding.mercadolibre ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-black'} flex flex-col items-center text-center transition-colors`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 ${onboarding.mercadolibre ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                5
              </div>
              <span className="text-sm font-bold text-gray-900">Sincronización</span>
              <span className="text-xs text-gray-500 mt-1">Mercado Libre</span>
            </Link>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, i) => (
            <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${
              alert.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
              alert.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
              'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">{alert.msg}</p>
              </div>
              <Link to={alert.link} className="text-sm font-bold underline whitespace-nowrap hover:opacity-80">
                Solucionar
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Ventas Mes</div>
            <div className="p-2 bg-emerald-50 rounded-lg"><DollarSign className="w-5 h-5 text-emerald-600" /></div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-gray-900">${stats.salesMonth.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Pedidos (Histórico)</div>
            <div className="p-2 bg-blue-50 rounded-lg"><ShoppingCart className="w-5 h-5 text-blue-600" /></div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-gray-900">{stats.ordersCount}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Fondos Pendientes</div>
            <div className="p-2 bg-amber-50 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-gray-900">${stats.pendingBalance.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Prod. Activos</div>
            <div className="p-2 bg-purple-50 rounded-lg"><Package className="w-5 h-5 text-purple-600" /></div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-gray-900">{stats.activeProducts}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Pedidos Recientes</h2>
            <Link to="/vendor?tab=orders" className="text-xs font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1">
              Ver todos <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex-1 overflow-x-auto">
            {recentOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No tienes pedidos recientes.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pedido</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Importe</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentOrders.map(o => {
                    const st = statusMap[o.status] || { label: o.status, cls: 'bg-gray-100 text-gray-800' };
                    return (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          #{o.id.substring(0,8).toUpperCase()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {o.customer?.first_name} {o.customer?.last_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                          ${o.total_amount.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Low Stock & Quick Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" /> Stock Crítico
              </h2>
            </div>
            <div className="p-2">
              {lowStock.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">Tu inventario está saludable.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {lowStock.map(p => (
                    <div key={p.id} className="p-4 flex items-center justify-between hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="min-w-0 pr-4">
                        <div className="font-bold text-gray-900 truncate text-sm">{p.product?.title || 'Producto Sin Título'}</div>
                        <div className="text-xs font-mono text-gray-500 mt-0.5">SKU: {p.sku || 'N/A'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded bg-orange-100 text-orange-800 text-xs font-black">
                          {p.inventory_count} un.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
             <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Acciones Rápidas</h2>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <Link to="/vendor?tab=products" className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-primary-50 rounded-xl border border-gray-200 hover:border-primary-200 transition-colors group text-center">
                <PlusCircle className="w-6 h-6 text-gray-400 group-hover:text-primary-600 mb-2" />
                <span className="text-xs font-bold text-gray-700 group-hover:text-primary-800">Crear Producto</span>
              </Link>
              <Link to="/vendor?tab=mercadolibre" className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-yellow-50 rounded-xl border border-gray-200 hover:border-yellow-200 transition-colors group text-center">
                <UploadCloud className="w-6 h-6 text-gray-400 group-hover:text-yellow-600 mb-2" />
                <span className="text-xs font-bold text-gray-700 group-hover:text-yellow-800">Importar ML</span>
              </Link>
              <Link to="/vendor?tab=shipping" className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-blue-50 rounded-xl border border-gray-200 hover:border-blue-200 transition-colors group text-center">
                <Truck className="w-6 h-6 text-gray-400 group-hover:text-blue-600 mb-2" />
                <span className="text-xs font-bold text-gray-700 group-hover:text-blue-800">Conectar Envío</span>
              </Link>
              <Link to="/vendor?tab=settings" className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-purple-50 rounded-xl border border-gray-200 hover:border-purple-200 transition-colors group text-center">
                <CreditCard className="w-6 h-6 text-gray-400 group-hover:text-purple-600 mb-2" />
                <span className="text-xs font-bold text-gray-700 group-hover:text-purple-800">Cuentas Cobro</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

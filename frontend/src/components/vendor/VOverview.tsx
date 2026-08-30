import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  DollarSign, ShoppingCart, Package, AlertTriangle, Clock, 
  ArrowRight, CreditCard, Truck, UploadCloud, PlusCircle,
  Store
} from 'lucide-react';
import { resolveImage } from '../../lib/imageUtils';
import { isRealPaidOrder } from '../../lib/payments';
import VendorOnboardingWidget from './VendorOnboardingWidget';
import ResponsiveDataList from '../admin/ResponsiveDataList';

interface VOverviewProps {
  onChangeTab?: (tab: string) => void;
  activeStoreId?: string;
}

export default function VOverview({ onChangeTab, activeStoreId }: VOverviewProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [storeStats, setStoreStats] = useState<any>(null);
  
  const [stats, setStats] = useState({
    salesMonth: 0,
    ordersCount: 0,
    pendingBalance: 0,
    activeProducts: 0,
    pendingPrepCount: 0,
    preparedDispatchCount: 0
  });

  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  
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
  }, [user, activeStoreId]);

  async function loadDashboardData() {
    setLoading(true);
    try {
      const vendorId = user!.id;
      
      let currentStore: any = null;
      if (activeStoreId) {
        const { data } = await supabase
          .from('vendor_stores')
          .select('*')
          .eq('id', activeStoreId)
          .single();
        currentStore = data;
      }
      setStoreStats(currentStore);
      
      const { data: payouts } = await supabase
        .from('vendor_payouts')
        .select('amount, status, created_at')
        .eq('vendor_id', vendorId);

      const pList = payouts || [];
      const pendingF = pList.filter(p => p.status === 'pending' || p.status === 'settlable').reduce((sum, p) => sum + Number(p.amount), 0);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      let salesQuery = supabase
        .from('order_items')
        .select('unit_price, quantity, order:orders(created_at, status, payment_status, is_test_order, payment_provider, payment_provider_reference, payment_id)')
        .eq('vendor_id', vendorId);

      if (activeStoreId) {
        salesQuery = salesQuery.eq('vendor_store_id', activeStoreId);
      }

      const { data: allItems } = await salesQuery;
      const salesM = (allItems || [])
        .filter(item => (item.order as any)?.created_at >= startOfMonth && isRealPaidOrder(item.order))
        .reduce((sum, item) => sum + Number((item as any).unit_price || (item as any).price || 0) * Number(item.quantity), 0);

      let activeProductsQuery = supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .eq('status', 'published')
        .eq('is_active', true);
        
      if (activeStoreId) {
        activeProductsQuery = activeProductsQuery.eq('vendor_store_id', activeStoreId);
      }
      
      const { count: prodCount } = await activeProductsQuery;

      let orderItemsQuery = supabase
        .from('order_items')
        .select(`
          order_id,
          unit_price,
          quantity,
          vendor_store_id,
          order:orders(id, created_at, status, customer:profiles(first_name, last_name, email))
        `)
        .eq('vendor_id', vendorId);

      if (activeStoreId) {
        orderItemsQuery = orderItemsQuery.eq('vendor_store_id', activeStoreId);
      }

      const { data: orderItems } = await orderItemsQuery.limit(20);

      const uniqueOrdersMap = new Map();
      (orderItems || []).forEach((oi: any) => {
        if (!oi.order) return;
        const itemPrice = Number(oi.unit_price || oi.price || 0);
        if (!uniqueOrdersMap.has(oi.order_id)) {
          uniqueOrdersMap.set(oi.order_id, {
            ...oi.order,
            total_amount: itemPrice * Number(oi.quantity)
          });
        } else {
          const existing = uniqueOrdersMap.get(oi.order_id);
          existing.total_amount += itemPrice * Number(oi.quantity);
        }
      });
      const uniqueOrders = Array.from(uniqueOrdersMap.values()).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      let lowStockQuery = supabase
        .from('product_variants')
        .select('id, sku, inventory_count, product:products!inner(id, title, vendor_id, vendor_store_id)')
        .eq('product.vendor_id', vendorId)
        .lt('inventory_count', 5);

      if (activeStoreId) {
        lowStockQuery = lowStockQuery.eq('product.vendor_store_id', activeStoreId);
      }

      const { data: lowStockData } = await lowStockQuery;

      const { data: vendorData } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', vendorId)
        .single();

      const { data: bankInfo } = await supabase
        .from('vendor_bank_accounts')
        .select('id')
        .eq('vendor_id', vendorId)
        .limit(1);

      const { data: mlConn } = await supabase
        .from('mercadolibre_tokens')
        .select('id')
        .eq('user_id', vendorId)
        .maybeSingle();

      const obProfile = !!vendorData?.store_name && !!vendorData?.support_email;
      const obBilling = (bankInfo || []).length > 0;
      const hasDac = !!vendorData?.dac_account_number;
      const hasSoyDelivery = !!vendorData?.soydelivery_account;
      const obShipping = hasDac || hasSoyDelivery;
      const obML = !!mlConn?.id;

      setOnboarding({
        profile: obProfile,
        kyc: !!vendorData?.tax_id,
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
      if (!mlConn || !mlConn.id) {
        newAlerts.push({ type: 'info', msg: 'No has conectado tu cuenta de Mercado Libre. Pierdes alcance de ventas.', link: '/vendor?tab=mercadolibre' });
      }
      if (!hasDac && !hasSoyDelivery) {
        newAlerts.push({ type: 'warning', msg: 'No has configurado una cuenta logística (DAC o SoyDelivery). Las etiquetas no se generarán automáticamente.', link: '/vendor?tab=shipping' });
      }

      // Fetch exact suborder counts for operational action block
      const { data: subordersData } = await supabase
        .from('order_suborders')
        .select('id, status, parentOrder:orders(payment_status, status)')
        .eq('vendor_id', vendorId);

      const pendingPrep = (subordersData || []).filter(s => 
        (s.parentOrder?.payment_status === 'approved' || s.parentOrder?.status === 'paid') &&
        (!s.status || s.status === 'pendiente' || s.status === 'preparando')
      ).length;

      const preparedDispatch = (subordersData || []).filter(s => 
        s.status === 'preparado'
      ).length;

      setStats({
        salesMonth: salesM,
        ordersCount: uniqueOrders.length,
        pendingBalance: pendingF,
        activeProducts: prodCount || 0,
        pendingPrepCount: pendingPrep,
        preparedDispatchCount: preparedDispatch
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
        <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-4 gap-6">
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
    pending: { label: 'PENDIENTE', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    paid: { label: 'PAGADO', cls: 'bg-green-100 text-green-800 border-green-200' },
    processing: { label: 'PROCESANDO', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    shipped: { label: 'ENVIADO', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    delivered: { label: 'ENTREGADO', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    cancelled: { label: 'CANCELADO', cls: 'bg-red-100 text-red-800 border-red-200' },
  };

  return (
    <div className="space-y-6 animate-fade-in min-w-0">
      
      {/* TOP OPERATIONAL BLOCK: PEDIDOS QUE REQUIEREN ACCIÓN */}
      {(stats.pendingPrepCount > 0 || stats.preparedDispatchCount > 0) && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-amber-400 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              <h2 className="font-black text-sm sm:text-base uppercase tracking-wider">
                Pedidos que Requieren Acción
              </h2>
            </div>
            <button
              onClick={() => onChangeTab ? onChangeTab('orders') : undefined}
              className="text-xs font-black underline hover:text-amber-100 flex items-center gap-1"
            >
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {stats.pendingPrepCount > 0 && (
              <button
                onClick={() => onChangeTab ? onChangeTab('orders') : undefined}
                className="bg-white/10 hover:bg-white/20 border border-white/20 p-3 rounded-xl flex items-center justify-between text-left transition-colors"
              >
                <div>
                  <span className="font-black text-lg block">{stats.pendingPrepCount}</span>
                  <span className="text-amber-100 text-[11px] font-bold">por preparar</span>
                </div>
                <span className="px-3 py-1 bg-white text-amber-900 font-bold rounded-lg text-xs shrink-0 shadow-xs">
                  Preparar
                </span>
              </button>
            )}

            {stats.preparedDispatchCount > 0 && (
              <button
                onClick={() => onChangeTab ? onChangeTab('orders') : undefined}
                className="bg-white/10 hover:bg-white/20 border border-white/20 p-3 rounded-xl flex items-center justify-between text-left transition-colors"
              >
                <div>
                  <span className="font-black text-lg block">{stats.preparedDispatchCount}</span>
                  <span className="text-amber-100 text-[11px] font-bold">esperando despacho</span>
                </div>
                <span className="px-3 py-1 bg-white text-amber-900 font-bold rounded-lg text-xs shrink-0 shadow-xs">
                  Despachar
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Onboarding Guide Widget */}
      <VendorOnboardingWidget />

      {activeStoreId && storeStats && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between min-w-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {storeStats.logo_url ? (
              <img src={resolveImage(storeStats.logo_url)} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-gray-100 shadow-sm shrink-0" />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0">
                <Store className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-gray-900 leading-none truncate">{storeStats.store_name}</h2>
                <span className="bg-primary-50 text-primary-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-primary-100">
                  Tienda Oficial
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate max-w-xs sm:max-w-md">{storeStats.description || 'Ecosistema de Tiendas Oficiales en Collectibles.'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center bg-gray-50/80 border border-gray-200 rounded-xl p-3 w-full sm:w-auto">
            <div>
              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Seguidores</span>
              <span className="text-sm sm:text-base font-black text-gray-900 mt-0.5 block">{storeStats.followers_count}</span>
            </div>
            <div className="sm:border-l sm:border-gray-200 sm:pl-4">
              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Calificación</span>
              <span className="text-sm sm:text-base font-black text-gray-900 mt-0.5 block">⭐ {Number(storeStats.rating || 0.0).toFixed(1)}</span>
            </div>
            <div className="sm:border-l sm:border-gray-200 sm:pl-4">
              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Entregas</span>
              <span className="text-sm sm:text-base font-black text-emerald-600 mt-0.5 block">{Number(storeStats.response_rate || 100).toFixed(0)}%</span>
            </div>
            <div className="sm:border-l sm:border-gray-200 sm:pl-4">
              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Resp. Prom.</span>
              <span className="text-sm sm:text-base font-black text-gray-900 mt-0.5 block">{storeStats.response_time_minutes || '--'} m</span>
            </div>
          </div>
        </div>
      )}

      {/* Block 6 Pasos Configuración Rápida */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Comienza a vender en Collectibles</h2>
        <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6">Completa estos pasos para activar tu tienda y empezar a recibir pedidos.</p>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { num: 1, title: 'Perfil', desc: 'Logo y datos', tab: 'profile' },
            { num: 2, title: 'Documentación', desc: 'RUT y Fiscal', tab: 'documents' },
            { num: 3, title: 'Cobros', desc: 'Cuenta bancaria', tab: 'billing' },
            { num: 4, title: 'Logística', desc: 'DAC / SoyDelivery', tab: 'shipping' },
            { num: 5, title: 'Sincronización', desc: 'Mercado Libre', tab: 'mercadolibre' },
            { num: 6, title: 'Notificaciones', desc: 'WhatsApp y Alertas', tab: 'notifications' },
          ].map((item) => (
            <Link
              key={item.num}
              to={`/vendor?tab=settings&sub=${item.tab}`}
              className="p-3 sm:p-4 rounded-xl border border-gray-200 hover:border-black flex flex-col items-center text-center transition-colors hover:shadow-sm bg-white min-h-[100px] justify-center"
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center mb-2 font-bold text-xs">
                {item.num}
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-900 leading-tight">{item.title}</span>
              <span className="text-[10px] text-gray-500 mt-0.5 truncate w-full">{item.desc}</span>
            </Link>
          ))}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, i) => (
            <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${
              alert.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
              alert.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
              'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium">{alert.msg}</p>
              </div>
              <Link to={alert.link} className="text-xs sm:text-sm font-bold underline whitespace-nowrap hover:opacity-80 shrink-0">
                Solucionar
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* KPI Grid: 1 col <390px, 2 col 390px-1023px, 4 col >=1024px */}
      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Ventas Mes</div>
            <div className="p-2 bg-emerald-50 rounded-lg shrink-0"><DollarSign className="w-5 h-5 text-emerald-600" /></div>
          </div>
          <div className="mt-3 sm:mt-4">
            <div className="text-2xl sm:text-3xl font-black text-gray-900">${stats.salesMonth.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Pedidos (Histórico)</div>
            <div className="p-2 bg-blue-50 rounded-lg shrink-0"><ShoppingCart className="w-5 h-5 text-blue-600" /></div>
          </div>
          <div className="mt-3 sm:mt-4">
            <div className="text-2xl sm:text-3xl font-black text-gray-900">{stats.ordersCount}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Fondos Pendientes</div>
            <div className="p-2 bg-amber-50 rounded-lg shrink-0"><Clock className="w-5 h-5 text-amber-600" /></div>
          </div>
          <div className="mt-3 sm:mt-4">
            <div className="text-2xl sm:text-3xl font-black text-gray-900">${stats.pendingBalance.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div className="text-gray-500 font-medium text-xs tracking-widest uppercase">Prod. Activos</div>
            <div className="p-2 bg-purple-50 rounded-lg shrink-0"><Package className="w-5 h-5 text-purple-600" /></div>
          </div>
          <div className="mt-3 sm:mt-4">
            <div className="text-2xl sm:text-3xl font-black text-gray-900">{stats.activeProducts}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-widest">Pedidos Recientes</h2>
            <Link to="/vendor?tab=orders" className="text-xs font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1">
              Ver todos <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <ResponsiveDataList
            items={recentOrders}
            keyExtractor={(o) => o.id}
            emptyTitle="Sin pedidos recientes"
            emptyDescription="No tienes pedidos registrados recientemente."
            renderCard={(o) => {
              const st = statusMap[o.status] || { label: o.status, cls: 'bg-gray-100 text-gray-800 border-gray-200' };
              const custName = o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : 'Cliente';
              return (
                <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-sm">
                      Pedido #{o.id.substring(0, 8).toUpperCase()}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-gray-100 py-2">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Cliente</span>
                      <span className="font-bold text-gray-800 truncate block">{custName}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Importe</span>
                      <span className="font-black text-gray-900 text-sm">${o.total_amount.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-gray-400">
                      Fecha: {new Date(o.created_at).toLocaleDateString()}
                    </span>
                    <Link
                      to="/vendor?tab=orders"
                      className="px-3 py-1.5 bg-primary-50 text-primary-700 hover:bg-primary-100 font-bold rounded-lg transition-colors min-h-[36px] flex items-center"
                    >
                      Ver pedido
                    </Link>
                  </div>
                </div>
              );
            }}
            renderTableHeader={() => (
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pedido</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Importe</th>
              </tr>
            )}
            renderTableRow={(o) => {
              const st = statusMap[o.status] || { label: o.status, cls: 'bg-gray-100 text-gray-800 border-gray-200' };
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
            }}
          />
        </div>

        {/* Low Stock & Quick Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" /> Stock Crítico
              </h2>
            </div>
            <div className="p-2">
              {lowStock.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">Tu inventario está saludable.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {lowStock.map(p => (
                    <div key={p.id} className="p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="min-w-0 pr-4">
                        <div className="font-bold text-gray-900 truncate text-xs sm:text-sm">{p.product?.title || 'Producto Sin Título'}</div>
                        <div className="text-[11px] font-mono text-gray-500 mt-0.5">SKU: {p.sku || 'N/A'}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
             <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50/50">
              <h2 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-widest">Acciones Rápidas</h2>
            </div>
            <div className="p-3 sm:p-4 grid grid-cols-2 gap-3">
              <Link to="/vendor?tab=products" className="flex flex-col items-center justify-center p-3 sm:p-4 bg-gray-50 hover:bg-primary-50 rounded-xl border border-gray-200 hover:border-primary-200 transition-colors group text-center min-h-[70px]">
                <PlusCircle className="w-5 h-5 text-gray-400 group-hover:text-primary-600 mb-1" />
                <span className="text-xs font-bold text-gray-700 group-hover:text-primary-800">Crear Producto</span>
              </Link>
              <Link to="/vendor?tab=mercadolibre" className="flex flex-col items-center justify-center p-3 sm:p-4 bg-gray-50 hover:bg-yellow-50 rounded-xl border border-gray-200 hover:border-yellow-200 transition-colors group text-center min-h-[70px]">
                <UploadCloud className="w-5 h-5 text-gray-400 group-hover:text-yellow-600 mb-1" />
                <span className="text-xs font-bold text-gray-700 group-hover:text-yellow-800">Importar ML</span>
              </Link>
              <Link to="/vendor?tab=shipping" className="flex flex-col items-center justify-center p-3 sm:p-4 bg-gray-50 hover:bg-blue-50 rounded-xl border border-gray-200 hover:border-blue-200 transition-colors group text-center min-h-[70px]">
                <Truck className="w-5 h-5 text-gray-400 group-hover:text-blue-600 mb-1" />
                <span className="text-xs font-bold text-gray-700 group-hover:text-blue-800">Conectar Envío</span>
              </Link>
              <Link to="/vendor?tab=settings" className="flex flex-col items-center justify-center p-3 sm:p-4 bg-gray-50 hover:bg-purple-50 rounded-xl border border-gray-200 hover:border-purple-200 transition-colors group text-center min-h-[70px]">
                <CreditCard className="w-5 h-5 text-gray-400 group-hover:text-purple-600 mb-1" />
                <span className="text-xs font-bold text-gray-700 group-hover:text-purple-800">Cuentas Cobro</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

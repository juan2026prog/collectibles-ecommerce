import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Eye, ChevronDown, Package, Truck, PhoneCall, X, Save, Ban, AlertTriangle, UserX, Gift, RefreshCw, FileText, Clock } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { createDacShipment, getDacLabel, trackDacShipment } from '../../lib/dac';

const SUPABASE_URL = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const ORDER_STATUSES = [
  { value: 'pending', label: 'Pendiente de Pago', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'paid', label: 'Pagado', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'en_preparacion', label: 'En Preparación', color: 'bg-blue-100 text-blue-700' },
  { value: 'despachado', label: 'Despachado', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'en_transito', label: 'En Tránsito', color: 'bg-purple-100 text-purple-700' },
  { value: 'para_retirar', label: 'Listo para Retirar', color: 'bg-orange-100 text-orange-800' },
  { value: 'entregado', label: 'Entregado', color: 'bg-green-100 text-green-800' },
  { value: 'abandonada', label: 'Abandonada', color: 'bg-gray-100 text-gray-700' },
  { value: 'cancelada', label: 'Cancelada', color: 'bg-red-100 text-red-700' }
];

export default function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isSendingDiscount, setIsSendingDiscount] = useState(false);

  // DAC shipment details state
  const [dacShipment, setDacShipment] = useState<any | null>(null);
  const [loadingDac, setLoadingDac] = useState(false);
  
  // DAC Form inputs
  const [dacCustomerName, setDacCustomerName] = useState('');
  const [dacCustomerPhone, setDacCustomerPhone] = useState('');
  const [dacCustomerAddress, setDacCustomerAddress] = useState('');
  const [dacCustomerCity, setDacCustomerCity] = useState('');
  const [dacCustomerDepartment, setDacCustomerDepartment] = useState('');
  const [dacWeight, setDacWeight] = useState('1.0');
  const [dacQuantity, setDacQuantity] = useState('1');
  const [dacObs, setDacObs] = useState('');
  
  // Action loaders
  const [isCreatingDac, setIsCreatingDac] = useState(false);
  const [isRegeneratingLabel, setIsRegeneratingLabel] = useState(false);
  const [isSyncingTracking, setIsSyncingTracking] = useState(false);
  const [isDacActive, setIsDacActive] = useState(false);

  // Added for products and suborders
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [orderSuborders, setOrderSuborders] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const { toast } = useToast();
  const { confirm, prompt } = useConfirmModal();

  useEffect(() => { fetchOrders(); }, [statusFilter, channelFilter]);

  useEffect(() => {
    async function checkDacActive() {
      try {
        const { data } = await supabase
          .from('delivery_providers_admin')
          .select('is_active')
          .eq('provider_key', 'dac')
          .maybeSingle();
        if (data) {
          setIsDacActive(data.is_active);
        }
      } catch (err) {
        console.error("Error checking DAC active status:", err);
      }
    }
    checkDacActive();
  }, []);

  useEffect(() => {
    if (selectedOrder) {
      loadDacShipmentForOrder(selectedOrder.id);
      
      // Prefill values from order address
      const addr = selectedOrder.shipping_address || {};
      const firstName = addr.first_name || selectedOrder.customer?.first_name || '';
      const lastName = addr.last_name || selectedOrder.customer?.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      
      setDacCustomerName(fullName || 'Cliente Collectibles');
      setDacCustomerPhone(selectedOrder.customer_phone || addr.phone || '');
      
      const street = addr.street || '';
      const apt = addr.apartment ? ` Apto ${addr.apartment}` : '';
      setDacCustomerAddress(`${street}${apt}`.trim() || 'Dirección no provista');
      setDacCustomerCity(addr.city || '');
      setDacCustomerDepartment(addr.department || '');
      
      setDacWeight('1.0');
      setDacQuantity('1');
      setDacObs('');
      
      loadOrderItemsAndSuborders(selectedOrder.id);
    } else {
      setDacShipment(null);
      setOrderItems([]);
      setOrderSuborders([]);
    }
  }, [selectedOrder]);

  async function loadOrderItemsAndSuborders(orderId: string) {
    setLoadingItems(true);
    try {
      // Load items
      const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select(`
          *,
          product:products(title),
          variant:product_variants(sku, name, product:products(title)),
          vendor:vendors(store_name)
        `)
        .eq('order_id', orderId);
      
      if (itemsErr) throw itemsErr;
      setOrderItems(items || []);

      // Load suborders
      const { data: suborders, error: subordersErr } = await supabase
        .from('order_suborders')
        .select('*')
        .eq('parent_order_id', orderId);
      
      if (subordersErr) throw subordersErr;
      setOrderSuborders(suborders || []);
    } catch (err: any) {
      console.error("Error loading items/suborders:", err.message);
      toast.error("No se pudieron cargar los productos de la orden.");
    } finally {
      setLoadingItems(false);
    }
  }

  async function loadDacShipmentForOrder(orderId: string) {
    setLoadingDac(true);
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .eq('order_id', orderId)
        .eq('provider_key', 'dac')
        .maybeSingle();

      if (error) throw error;
      setDacShipment(data || null);
    } catch (err: any) {
      console.error("Error loading DAC shipment:", err.message);
    } finally {
      setLoadingDac(false);
    }
  }

  async function handleCreateDacShipment() {
    if (isCreatingDac) return;
    if (!selectedOrder) return;
    
    // Front-end validations requested by checklist
    if (dacShipment) {
      toast.warning("Este pedido ya tiene un envío DAC asociado.");
      return;
    }
    if (!dacCustomerName.trim()) {
      toast.warning("Falta el nombre del destinatario.");
      return;
    }
    if (!dacCustomerPhone.trim()) {
      toast.warning("Falta el teléfono del destinatario.");
      return;
    }
    if (!dacCustomerAddress.trim()) {
      toast.warning("Falta la dirección de entrega.");
      return;
    }
    if (!dacCustomerCity.trim()) {
      toast.warning("Falta la localidad/ciudad.");
      return;
    }
    if (!dacCustomerDepartment.trim()) {
      toast.warning("Falta el departamento.");
      return;
    }
    const weightVal = Number(dacWeight);
    if (isNaN(weightVal) || weightVal <= 0) {
      toast.warning("Falta el peso del paquete (debe ser mayor a 0 kg).");
      return;
    }
    const qtyVal = Number(dacQuantity);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      toast.warning("La cantidad de bultos debe ser al menos 1.");
      return;
    }
    
    setIsCreatingDac(true);
    try {
      const { success, shipment, error } = await createDacShipment({
        order_id: selectedOrder.id,
        customer_name: dacCustomerName,
        customer_phone: dacCustomerPhone,
        customer_address: dacCustomerAddress,
        customer_city: dacCustomerCity,
        customer_department: dacCustomerDepartment,
        package_weight: weightVal,
        package_quantity: qtyVal,
        observations: dacObs
      });

      if (!success) throw new Error(error || "Fallo desconocido al crear el envío");

      toast.success("¡Envío y guía DAC creados correctamente!");
      setDacShipment(shipment || null);
      fetchOrders();
      if (shipment) {
        setSelectedOrder({
          ...selectedOrder,
          tracking_number: shipment.tracking_code,
          tracking_provider: 'DAC'
        });
      }
    } catch (e: any) {
      console.error("Create DAC Shipment error:", e);
      toast.error(`Error al crear envío DAC: ${e.message || e}`);
    } finally {
      setIsCreatingDac(false);
    }
  }

  async function handleRetryDacShipment() {
    if (isCreatingDac) return;
    if (!selectedOrder) return;
    
    setIsCreatingDac(true);
    try {
      const { success, shipment, error } = await createDacShipment({
        order_id: selectedOrder.id,
        customer_name: '',
        customer_phone: '',
        customer_address: '',
        customer_city: '',
        customer_department: '',
        package_weight: 1.0,
        package_quantity: 1
      });

      if (!success) throw new Error(error || "Fallo al reintentar la creación de la guía DAC");

      toast.success("¡Guía y etiqueta DAC reintentadas correctamente!");
      setDacShipment(shipment || null);
      fetchOrders();
      if (shipment) {
        setSelectedOrder({
          ...selectedOrder,
          tracking_number: shipment.tracking_code,
          tracking_provider: 'DAC'
        });
      }
    } catch (e: any) {
      console.error("Retry DAC Shipment error:", e);
      toast.error(`Error al reintentar envío DAC: ${e.message || e}`);
      loadDacShipmentForOrder(selectedOrder.id);
    } finally {
      setIsCreatingDac(false);
    }
  }

  async function handleRegenerateLabel() {
    if (!selectedOrder || !dacShipment) return;
    
    setIsRegeneratingLabel(true);
    try {
      const { success, error } = await getDacLabel(selectedOrder.id);
      
      if (!success) throw new Error(error || "No se pudo recuperar la etiqueta");

      toast.success("¡Etiqueta DAC generada correctamente!");
      loadDacShipmentForOrder(selectedOrder.id);
    } catch (e: any) {
      console.error("Regenerate label error:", e);
      toast.error(`Error de etiqueta DAC: ${e.message || e}`);
    } finally {
      setIsRegeneratingLabel(false);
    }
  }

  async function handleSyncTracking() {
    if (!selectedOrder || !dacShipment) return;
    
    setIsSyncingTracking(true);
    try {
      const { success, rawStatus, description, error } = await trackDacShipment(selectedOrder.id);
      
      if (!success) throw new Error(error || "No se pudo sincronizar el tracking");

      toast.success(`Estado sincronizado: ${rawStatus} (${description})`);
      loadDacShipmentForOrder(selectedOrder.id);
      fetchOrders();
    } catch (e: any) {
      console.error("Sync tracking error:", e);
      toast.error(`Error de tracking DAC: ${e.message || e}`);
    } finally {
      setIsSyncingTracking(false);
    }
  }


  async function fetchOrders() {
    setLoading(true);
    let query = supabase.from('orders').select('*, customer:profiles(email, first_name, last_name)').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (channelFilter === 'web') {
      query = query.is('ml_order_id', null);
    } else if (channelFilter === 'mercadolibre') {
      query = query.not('ml_order_id', 'is', null);
    }
    const { data } = await query;
    setOrders(data || []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('orders').update({ status }).eq('id', id);
    fetchOrders();
    if (selectedOrder?.id === id) {
      setSelectedOrder({ ...selectedOrder, status });
    }
  }

  async function saveOrderDetails(updatedData: any) {
    await supabase.from('orders').update({
      tracking_number: updatedData.tracking_number,
      tracking_provider: updatedData.tracking_provider,
      delivery_notes: updatedData.delivery_notes,
      is_assisted_purchase: updatedData.is_assisted_purchase
    }).eq('id', updatedData.id);
    
    setSelectedOrder(null);
    fetchOrders();
  }

  async function handleCancelOrder() {
    if (!selectedOrder) return;
    const isPending = selectedOrder.status === 'pending';
    const reason = await prompt("Por favor ingresa la razón de la cancelación. Esta será enviada al cliente:");
    if (reason === null) return;
    
    const confirmMessage = isPending 
      ? `¿Estás SEGURO de que deseas cancelar esta orden? Al estar pendiente, no se procesará reembolso de dinero.` 
      : `¿Estás SEGURO de que deseas cancelar esta orden y devolver el dinero? Esta acción no se puede deshacer.`;

    if (!(await confirm(confirmMessage, { danger: true }))) return;

    setIsCancelling(true);
    try {
      const url = `${SUPABASE_URL}/functions/v1/refund-order`;
      
      const res = await fetch(url, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ANON_KEY}`,
            'apikey': ANON_KEY
         },
         body: JSON.stringify({ orderId: selectedOrder.id, reason: reason || "Cancelada por el administrador" })
      });
      
      let data;
      try {
        data = await res.json();
      } catch {
        const text = await res.text();
        throw new Error(`Error ${res.status}: ${text || res.statusText}`);
      }
      
      if (!res.ok) throw new Error(data.error || `Error ${res.status} al cancelar la orden`);
      
      if (isPending) {
         toast.success("La orden pendiente fue cancelada exitosamente.");
      } else {
         if (data.refundSuccess) {
           const details = data.refundDetails || {};
           const testWarning = details.isTestMode ? '\n\n⚠️ ATENCIÓN: Estás usando un token de PRUEBA (TEST). Este reembolso solo se procesó en el sandbox de MercadoPago y NO se reflejará en la tarjeta de crédito real del cliente.' : '';
           toast.success(`Orden cancelada y reembolso procesado. Refund ID: ${details.refund_id || 'N/A'}${testWarning}`, 8000);
         } else {
           const details = data.refundDetails || {};
           toast.error(`La orden fue cancelada, pero el reembolso NO se pudo procesar. Error: ${details.error || 'Desconocido'}`);
         }
      }
        
      setSelectedOrder(null);
      fetchOrders();
    } catch (e: any) {
      console.error('Cancel order error:', e);
      alert(`Error al cancelar: ${e.message}`);
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleBlockUser() {
    if (!selectedOrder || !selectedOrder.customer?.id) {
       toast.warning("Esta orden no parece tener un usuario registrado para bloquear.");
       return;
    }
    
    if (!(await confirm(`¿Estás SEGURO de que deseas bloquear irrevocablemente al usuario? No podrá volver a comprar ni iniciar sesión en su cuenta.`, { danger: true }))) return;

    setIsBlocking(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/block-user`, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ANON_KEY}`,
            'apikey': ANON_KEY
         },
         body: JSON.stringify({ userId: selectedOrder.customer.id })
      });
      
      const data = await res.json();
      // Also mark as blocked locally in DB if column exists (optional fallback handled here too)
      await supabase.from('profiles').update({ is_blocked: true }).eq('id', selectedOrder.customer.id).catch(() => {});

      if (!res.ok) throw new Error(data.error || "Error al bloquear usuario");
      
      toast.success("Usuario bloqueado exitosamente.");
    } catch (e: any) {
      toast.error(`Error al bloquear: ${e.message}`);
    } finally {
      setIsBlocking(false);
    }
  }

  async function handleSendDiscount() {
    if (!selectedOrder) return;
    const discountCode = await prompt("Ingresa el cupón de descuento que deseas enviarle al cliente:", { defaultValue: "VUELVE10" });
    if (discountCode === null) return;
    
    setIsSendingDiscount(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/transactional-emails`, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ANON_KEY}`,
            'apikey': ANON_KEY
         },
         body: JSON.stringify({ 
           type: 'abandoned_order_discount', 
           order: selectedOrder, 
           discountCode: discountCode 
         })
      });
      
      if (!res.ok) {
        let errMsg = `Error ${res.status}`;
        try { const d = await res.json(); errMsg = d.error || errMsg; } catch { /* ignore */ }
        throw new Error(errMsg);
      }
      
      // 2. Change status to abandonada
      if (selectedOrder.status !== 'abandonada') {
         await supabase.from('orders').update({ status: 'abandonada' }).eq('id', selectedOrder.id);
         toast.success("Descuento enviado y orden marcada como Abandonada.");
      } else {
         toast.success("Descuento enviado exitosamente.");
      }
      
      fetchOrders();
      setSelectedOrder(null);
    } catch (e: any) {
      console.error('Send discount error:', e);
      toast.error(`Error al enviar descuento: ${e.message}`);
    } finally {
      setIsSendingDiscount(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Órdenes de Venta</h2>
          <p className="text-sm text-gray-500 mt-1">Gestión de logística y seguimiento</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button 
              onClick={() => setChannelFilter('all')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${channelFilter === 'all' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-550 hover:text-gray-900'}`}
            >
              Todas
            </button>
            <button 
              onClick={() => setChannelFilter('web')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${channelFilter === 'web' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-550 hover:text-gray-900'}`}
            >
              Web
            </button>
            <button 
              onClick={() => setChannelFilter('mercadolibre')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${channelFilter === 'mercadolibre' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-550 hover:text-gray-900'}`}
            >
              Mercado Libre
            </button>
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-input w-48 text-sm font-medium">
            <option value="all">Ver Todos los Estados</option>
            {ORDER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Orden ID / Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estado y Logística</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Tags</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Cargando órdenes...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No hay órdenes para mostrar</td></tr>
              ) : orders.map(o => {
                const statusObj = ORDER_STATUSES.find(s => s.value === o.status) || ORDER_STATUSES[0];
                return (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => setSelectedOrder(o)}
                          className="text-sm font-mono font-bold text-primary-600 hover:text-primary-800 hover:underline transition-all text-left"
                        >
                          #{o.id.slice(0,8).toUpperCase()}
                        </button>
                        {o.ml_order_id && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-black bg-yellow-100 text-yellow-800 border border-yellow-250 flex items-center gap-0.5" title={`Mercado Libre ID: ${o.ml_order_id}`}>
                            ML 🛒
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{o.customer?.email || o.customer_email || 'Sin usuario asociado'}</p>
                      {o.ml_order_id && (
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">ML ID: {o.ml_order_id}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900">${o.total_amount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative inline-block">
                        <select
                          value={o.status}
                          onChange={e => updateStatus(o.id, e.target.value)}
                          className={`appearance-none px-3 py-1 pr-7 rounded-full text-xs font-bold cursor-pointer border border-transparent hover:border-gray-300 focus:ring-0 ${statusObj.color}`}
                        >
                          {ORDER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none ${statusObj.color.split(' ')[1]}`} />
                      </div>
                      {o.tracking_number && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <Truck className="w-3 h-3" /> {o.tracking_provider}: {o.tracking_number}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {o.is_assisted_purchase && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-pink-100 text-pink-700" title="Venta cerrada por soporte/WhatsApp">
                          <PhoneCall className="w-3 h-3" /> Asistida
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setSelectedOrder(o)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg group transition-colors">
                        <Eye className="w-4 h-4" />
                        <span className="sr-only">Ver Detalles</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ORDER DETAILS */}
      {selectedOrder && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col animate-slide-in-left">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-gray-400" />
                  Orden #{selectedOrder.id.slice(0,8).toUpperCase()}
                  {selectedOrder.ml_order_id && (
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-black bg-yellow-100 text-yellow-800 border border-yellow-250 flex items-center gap-0.5">
                      ML 🛒
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{new Date(selectedOrder.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 text-gray-400 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* MERCADO LIBRE ALERT BOX */}
              {selectedOrder.ml_order_id && (
                <div className="p-3.5 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800 leading-relaxed">
                  <p className="font-bold flex items-center gap-1">
                    <span>🛒 Pedido de Mercado Libre</span>
                  </p>
                  <p className="mt-1 text-yellow-750">Este pedido fue importado automáticamente desde Mercado Libre en tiempo real.</p>
                  <p className="mt-1 font-mono text-[10px] text-yellow-600">ID de Mercado Libre: {selectedOrder.ml_order_id}</p>
                </div>
              )}
              
              {/* PRODUCTOS DE LA ORDEN */}
              <div className="space-y-4 bg-white p-4 rounded-xl border border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4" /> Productos de la Orden
                </h4>
                {loadingItems ? (
                  <p className="text-xs text-gray-500 text-center py-4">Cargando productos...</p>
                ) : orderItems.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">No se encontraron productos.</p>
                ) : (
                  <div className="space-y-6">
                    {orderSuborders.length > 0 ? (
                      orderSuborders.map(suborder => {
                        const subItems = orderItems.filter(item => item.suborder_id === suborder.id);
                        return (
                          <div key={suborder.id} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="bg-gray-50 p-3 border-b border-gray-200 flex justify-between items-center">
                              <div>
                                <h5 className="font-bold text-sm text-gray-900">{suborder.vendor_name || 'Collectibles'}</h5>
                                <p className="text-[10px] text-gray-500 font-mono mt-0.5">{suborder.suborder_number}</p>
                              </div>
                              <div className="text-right">
                                <span className="inline-block px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-bold uppercase text-gray-700">
                                  {suborder.status}
                                </span>
                                {suborder.tracking_number && (
                                  <p className="text-[10px] text-blue-600 mt-1 font-bold flex items-center justify-end gap-1">
                                    <Truck className="w-3 h-3" /> {suborder.tracking_number}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {subItems.length > 0 ? subItems.map(item => (
                                <OrderItemRow key={item.id} item={item} />
                              )) : (
                                <p className="text-xs text-gray-400 p-3 text-center">Sin productos (error de datos)</p>
                              )}
                            </div>
                            <div className="bg-gray-50 p-3 border-t border-gray-200 flex justify-between items-center text-xs">
                              <span className="font-medium text-gray-500">Subtotal Vendor</span>
                              <span className="font-bold text-gray-900">${suborder.product_subtotal}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="divide-y divide-gray-100">
                          {orderItems.map(item => (
                            <OrderItemRow key={item.id} item={item} />
                          ))}
                        </div>
                        <div className="bg-gray-50 p-3 border-t border-gray-200 flex justify-between items-center text-xs">
                          <span className="font-medium text-gray-500">Total Productos</span>
                          <span className="font-bold text-gray-900">${selectedOrder.subtotal_products || selectedOrder.total_amount}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* STATUS & COMPRA ASISTIDA */}
              <div className="space-y-4 bg-white p-4 rounded-xl border border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Operación</h4>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Estado de la Orden</label>
                  <select 
                    value={selectedOrder.status} 
                    onChange={e => setSelectedOrder({...selectedOrder, status: e.target.value})}
                    className="form-input font-medium"
                  >
                    {ORDER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <label className="flex items-center gap-3 p-3 border border-pink-100 bg-pink-50/50 rounded-lg cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedOrder.is_assisted_purchase} 
                    onChange={e => setSelectedOrder({...selectedOrder, is_assisted_purchase: e.target.checked})}
                    className="w-4 h-4 text-pink-600 border-pink-300 rounded focus:ring-pink-500"
                  />
                  <div>
                    <span className="text-sm font-bold text-pink-900 block">Compra Asistida</span>
                    <span className="text-[10px] text-pink-700">Marca esto si la venta se cerró vía Callcenter / WhatsApp</span>
                  </div>
                </label>
              </div>

              {/* RECOVERY ZONE - only for pending / abandonada */}
              {(selectedOrder.status === 'pending' || selectedOrder.status === 'abandonada') && (
                <div className="space-y-4 bg-purple-50 p-4 rounded-xl border border-purple-200">
                  <h4 className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Gift className="w-4 h-4" /> Recuperación de Orden
                  </h4>
                  <p className="text-xs text-purple-700 mb-4">
                    Comunícate con el cliente enviando un descuento especial por Email o WhatsApp para incentivarlo a completar su compra.
                  </p>
                  <button 
                    onClick={handleSendDiscount}
                    disabled={isSendingDiscount}
                    className="w-full py-3 bg-purple-600 text-white border justify-center border-purple-700 hover:bg-purple-700 rounded-lg flex items-center gap-2 font-bold transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Gift className="w-5 h-5" /> {isSendingDiscount ? 'Enviando...' : 'Ofrecer Descuento y Marcar Abandonada'}
                  </button>
                </div>
              )}

              {/* ACTIONS ZONE */}
              <div className="space-y-4 bg-red-50 p-4 rounded-xl border border-red-200">
                <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Zona Peligrosa
                </h4>

                {/* CANCELAR ORDEN - always visible except if already cancelada */}
                {selectedOrder.status !== 'cancelada' && (
                  <>
                    <p className="text-xs text-red-700">
                      {selectedOrder.status === 'pending' 
                        ? 'Cancelar la orden sin reembolso (pendiente de pago). Se revertirá el stock y se notificará al cliente.'
                        : selectedOrder.status === 'paid'
                          ? 'Cancelar la orden y procesar reembolso automático vía Mercado Pago. Se revertirá el stock.'
                          : 'Cancelar la orden y revertir el stock de los productos. Se notificará al cliente.'}
                    </p>
                    <button 
                      onClick={handleCancelOrder}
                      disabled={isCancelling || isBlocking}
                      className="w-full py-3 bg-white text-red-600 border justify-center border-red-200 hover:bg-red-600 hover:text-white rounded-lg flex items-center gap-2 font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Ban className="w-5 h-5" /> 
                      {isCancelling 
                        ? 'Procesando...' 
                        : selectedOrder.status === 'paid' 
                          ? 'Cancelar Orden y Reembolsar' 
                          : 'Cancelar Orden'}
                    </button>
                  </>
                )}

                {selectedOrder.status === 'cancelada' && (
                  <p className="text-xs text-red-700 italic">Esta orden ya fue cancelada.</p>
                )}

                {/* BLOQUEAR USUARIO */}
                {selectedOrder.customer?.id && (
                  <button 
                    onClick={handleBlockUser}
                    disabled={isBlocking || isCancelling}
                    className="w-full py-3 bg-red-600 text-white border justify-center border-red-700 hover:bg-red-700 rounded-lg flex items-center gap-2 font-bold transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <UserX className="w-5 h-5" /> {isBlocking ? 'Bloqueando Usuario...' : 'Bloquear a este Usuario (Ban)'}
                  </button>
                )}
              </div>

              {/* LOGISTICS CARD */}
              <div className="space-y-4 bg-white p-4 rounded-xl border border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Envíos y Rastreo Manual
                </h4>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Empresa de Logística</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ej. MercadoEnvios, UES, Correo Uruguayo"
                    value={selectedOrder.tracking_provider || ''} 
                    onChange={e => setSelectedOrder({...selectedOrder, tracking_provider: e.target.value})} 
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Número de Seguimiento (Tracking ID)</label>
                  <input 
                    type="text" 
                    className="form-input font-mono" 
                    placeholder="ej. UY-123456789"
                    value={selectedOrder.tracking_number || ''} 
                    onChange={e => setSelectedOrder({...selectedOrder, tracking_number: e.target.value})} 
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Notas Internas de Despacho</label>
                  <textarea 
                    className="form-input min-h-[80px] text-sm" 
                    placeholder="Notas para los preparadores de pedidos..."
                    value={selectedOrder.delivery_notes || ''} 
                    onChange={e => setSelectedOrder({...selectedOrder, delivery_notes: e.target.value})} 
                  />
                </div>
              </div>

              {/* DAC / GRUPO AGENCIA SHIPPING MODULE */}
              {(isDacActive || selectedOrder.shipping_method === 'dac_home' || selectedOrder.shipping_method === 'dac_agency') && (() => {
                const isDacOrder = selectedOrder.shipping_method === 'dac_home' || selectedOrder.shipping_method === 'dac_agency';
                const isOrderPaid = selectedOrder.status === 'paid' || selectedOrder.payment_status === 'approved';
                const hasNoTracking = !selectedOrder.tracking_number;
                const isDacError = dacShipment?.shipping_status === 'error';
                const isDacPending = !dacShipment && isDacOrder && isOrderPaid && hasNoTracking;

                return (
                  <div className="space-y-4 bg-white p-4 rounded-xl border border-orange-200 shadow-sm bg-orange-50/10">
                    <div className="flex items-center justify-between border-b border-orange-100 pb-2 mb-2">
                      <h4 className="text-xs font-black text-orange-850 uppercase tracking-wider flex items-center gap-2">
                        <Truck className="w-4 h-4 text-orange-600" /> Envíos DAC (Grupo Agencia)
                      </h4>
                      {dacShipment && !isDacError && (
                        <span className="text-[9px] font-bold text-orange-600 bg-orange-50 border border-orange-150 px-2 py-0.5 rounded-full">
                          DAC Activo
                        </span>
                      )}
                      {isDacError && (
                        <span className="text-[9px] font-bold text-red-650 bg-red-50 border border-red-150 px-2 py-0.5 rounded-full">
                          Fallo de Conexión
                        </span>
                      )}
                      {isDacPending && (
                        <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-150 px-2 py-0.5 rounded-full animate-pulse">
                          Pendiente de Generación
                        </span>
                      )}
                    </div>

                    {loadingDac ? (
                      <p className="text-xs text-gray-400 text-center py-4">Cargando datos de envío DAC...</p>
                    ) : (
                      <>
                        {/* BANNERS FOR AUTOMATED FLOW */}
                        {isDacPending && (
                          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg flex flex-col gap-2 text-xs">
                            <div className="flex items-start gap-2">
                              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-bold">DAC pendiente de generar</p>
                                <p className="text-amber-705 text-[11px] mt-0.5">El pago está aprobado, pero la guía DAC aún no ha sido creada de manera automática.</p>
                              </div>
                            </div>
                            <button
                              onClick={handleRetryDacShipment}
                              disabled={isCreatingDac}
                              className="self-start px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {isCreatingDac ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Generando Guía...</span>
                                </>
                              ) : (
                                <>
                                  <Truck className="w-3 h-3" />
                                  <span>Generar Guía DAC ahora</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {isDacError && (
                          <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg flex flex-col gap-2 text-xs">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-650 shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="font-bold">Error DAC - Reintentar</p>
                                <p className="text-red-750 text-[11px] mt-0.5">Pago aprobado, pero DAC no pudo crear la guía. Reintentar.</p>
                                {dacShipment.provider_response?.error && (
                                  <div className="mt-2 bg-red-100/50 p-2 rounded border border-red-200/50 font-mono text-[10px] break-words text-red-900 select-all">
                                    Detalle Técnico: {dacShipment.provider_response.error}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={handleRetryDacShipment}
                              disabled={isCreatingDac}
                              className="self-start px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {isCreatingDac ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Reintentando...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Reintentar crear guía DAC</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {/* MANUAL FORM OR SUCCESS STATE */}
                        {(!dacShipment || isDacError) ? (
                          // DAC Create Shipment / Retry Override Form
                          <div className="space-y-3 text-xs">
                            <div className="bg-orange-50/50 p-2.5 rounded-lg border border-orange-100 leading-relaxed text-[10px] text-orange-900 font-medium">
                              Puedes realizar modificaciones manuales abajo y forzar la generación de la guía en caso de que existan errores en la dirección original.
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Nombre Destinatario</label>
                                <input 
                                  type="text" 
                                  className="form-input text-xs py-1"
                                  value={dacCustomerName}
                                  onChange={e => setDacCustomerName(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Teléfono Destinatario</label>
                                <input 
                                  type="text" 
                                  className="form-input text-xs py-1"
                                  value={dacCustomerPhone}
                                  onChange={e => setDacCustomerPhone(e.target.value)}
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Dirección de Entrega</label>
                              <input 
                                type="text" 
                                className="form-input text-xs py-1"
                                value={dacCustomerAddress}
                                onChange={e => setDacCustomerAddress(e.target.value)}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Localidad/Ciudad</label>
                                <input 
                                  type="text" 
                                  className="form-input text-xs py-1"
                                  value={dacCustomerCity}
                                  onChange={e => setDacCustomerCity(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Departamento</label>
                                <input 
                                  type="text" 
                                  className="form-input text-xs py-1"
                                  value={dacCustomerDepartment}
                                  onChange={e => setDacCustomerDepartment(e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Peso Paquetes (kg)</label>
                                <input 
                                  type="number" 
                                  step="0.1"
                                  min="0.1"
                                  className="form-input text-xs py-1"
                                  value={dacWeight}
                                  onChange={e => setDacWeight(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Cantidad de Bultos</label>
                                <input 
                                  type="number" 
                                  min="1"
                                  step="1"
                                  className="form-input text-xs py-1"
                                  value={dacQuantity}
                                  onChange={e => setDacQuantity(e.target.value)}
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Observaciones</label>
                              <input 
                                type="text" 
                                placeholder="Ej. Entregar por la tarde" 
                                className="form-input text-xs py-1"
                                value={dacObs}
                                onChange={e => setDacObs(e.target.value)}
                              />
                            </div>

                            <button
                              onClick={handleCreateDacShipment}
                              disabled={isCreatingDac}
                              className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition-colors"
                            >
                              {isCreatingDac ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>Generando Guía DAC...</span>
                                </>
                              ) : (
                                <>
                                  <Truck className="w-4 h-4" />
                                  <span>Crear Guía y Etiqueta DAC</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          // DAC Shipment Stats and Action View
                          <div className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-gray-50 p-3 rounded-lg border border-gray-150 font-medium">
                              <div>
                                <span className="text-[9px] font-bold text-gray-400 uppercase block">Código Rastreo</span>
                                <span className="font-mono text-gray-900 font-bold select-all">{dacShipment.tracking_code || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-bold text-gray-400 uppercase block">Estado Envío</span>
                                <div className="flex flex-col gap-1 mt-0.5">
                                  <span className={`inline-block text-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    dacShipment.shipping_status === 'delivered' ? 'bg-green-100 text-green-800' :
                                    dacShipment.shipping_status === 'out_for_delivery' ? 'bg-indigo-100 text-indigo-800' :
                                    dacShipment.shipping_status === 'in_transit' ? 'bg-purple-100 text-purple-800' :
                                    dacShipment.shipping_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                    'bg-blue-100 text-blue-800' // documented
                                  }`}>
                                    {dacShipment.shipping_status === 'delivered' ? 'Entregado' :
                                     dacShipment.shipping_status === 'out_for_delivery' ? 'En reparto' :
                                     dacShipment.shipping_status === 'in_transit' ? 'En tránsito' :
                                     dacShipment.shipping_status === 'rejected' ? 'Rechazado' : 'Documentado'}
                                  </span>
                                  
                                  {/* SUCCESS STAGE BADGES REQUESTED BY CHECKLIST */}
                                  {dacShipment.shipping_label_url ? (
                                    <span className="inline-block text-center px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-250 rounded-full text-[9px] font-extrabold">
                                      Etiqueta lista para imprimir
                                    </span>
                                  ) : dacShipment.shipping_status === 'documented' ? (
                                    <span className="inline-block text-center px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-250 rounded-full text-[9px] font-extrabold">
                                      Guía DAC generada
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="col-span-2 border-t border-gray-250 pt-2 mt-1">
                                <span className="text-[9px] font-bold text-gray-400 uppercase block">Dirección de Destino</span>
                                <span className="text-gray-700 text-[10px]">
                                  {dacShipment.customer_address}, {dacShipment.customer_city}, {dacShipment.customer_department}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2">
                              {dacShipment.shipping_label_url ? (
                                <div className="flex flex-col gap-2 w-full">
                                  <a
                                    href={dacShipment.shipping_label_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-center flex items-center justify-center gap-1.5 shadow-sm transition-colors text-xs"
                                  >
                                    <FileText className="w-4 h-4" />
                                    Descargar / Imprimir etiqueta DAC
                                  </a>
                                  <button
                                    onClick={handleRegenerateLabel}
                                    disabled={isRegeneratingLabel}
                                    className="w-full py-2.5 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 text-xs"
                                  >
                                    <RefreshCw className={`w-4 h-4 ${isRegeneratingLabel ? 'animate-spin' : ''}`} />
                                    {isRegeneratingLabel ? 'Regenerando etiqueta...' : 'Regenerar etiqueta DAC'}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={handleRegenerateLabel}
                                  disabled={isRegeneratingLabel}
                                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 text-xs"
                                >
                                  <RefreshCw className={`w-4 h-4 ${isRegeneratingLabel ? 'animate-spin' : ''}`} />
                                  {isRegeneratingLabel ? 'Regenerando etiqueta...' : 'Regenerar etiqueta DAC'}
                                </button>
                              )}

                              <button
                                onClick={handleSyncTracking}
                                disabled={isSyncingTracking}
                                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-850 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 text-xs"
                                title="Sincronizar tracking con DAC"
                              >
                                <RefreshCw className={`w-4 h-4 ${isSyncingTracking ? 'animate-spin' : ''}`} />
                                Sincronizar Estado Tracking
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}


            </div>
            
            <div className="p-4 border-t bg-white">
              <button 
                onClick={() => saveOrderDetails(selectedOrder)}
                className="w-full btn-primary py-3 flex justify-center items-center gap-2"
              >
                <Save className="w-5 h-5" /> Guardar Cambios
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

function OrderItemRow({ item }: { item: any }) {
  const productName = item.product_name || item.product?.title || item.variant?.product?.title || 'Producto Desconocido';
  const sku = item.sku || item.variant?.sku || 'N/A';
  const vendorName = item.vendor?.store_name || 'Collectibles';
  const variantName = item.variant?.name || '';
  
  return (
    <div className="p-3 flex items-start gap-3">
      <div className="w-12 h-12 bg-gray-100 rounded border border-gray-200 flex-shrink-0 flex items-center justify-center">
        <Package className="w-5 h-5 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <h6 className="text-sm font-bold text-gray-900 truncate">{productName} {variantName ? `- ${variantName}` : ''}</h6>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <span className="text-[10px] font-mono text-gray-500">SKU: {sku}</span>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 rounded">Vendor: {vendorName}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-gray-600 font-medium">{item.quantity} x ${item.unit_price}</span>
          <span className="text-sm font-black text-gray-900">${item.final_total || (item.quantity * item.unit_price)}</span>
        </div>
      </div>
    </div>
  );
}

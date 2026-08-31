import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  Package, Truck, FileText, RefreshCw, AlertTriangle, CheckCircle, 
  Clock, XCircle, ShieldAlert, Eye, Copy, Check, ExternalLink, 
  MapPin, DollarSign, Calendar, X, Lock, ShieldCheck 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/admin/Toast';
import ShipmentLabelModal from '../ShipmentLabelModal';
import ResponsiveDataList from '../admin/ResponsiveDataList';
import { BackofficePrimaryAction, BackofficePageHeader, BackofficeStatusBadge, BackofficeTabs, BackofficeSearch } from '../backoffice';
import { isOrderPaymentApproved } from '../../lib/payments';

export default function VOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [suborders, setSuborders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Drawer & Detail States
  const [activeSuborderNumber, setActiveSuborderNumber] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Manual Tracking Form State
  const [manualCarrier, setManualCarrier] = useState('');
  const [manualTrackingNo, setManualTrackingNo] = useState('');
  const [manualTrackingUrl, setManualTrackingUrl] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [savingTracking, setSavingTracking] = useState(false);

  // Modal State for Labels/Slips
  const [labelModalSuborderId, setLabelModalSuborderId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'label' | 'slip'>('label');

  // Quick Filter State
  const [quickFilter, setQuickFilter] = useState<'all' | 'pending' | 'prepared' | 'dispatched'>('all');
  
  // Preparation Bottom Sheet State
  const [showPrepareModal, setShowPrepareModal] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSuborders();
    } else {
      setLoading(false);
    }
  }, [user]);

  // Sync drawer open state with URL search params (supporting deep links: suborder, order_id, order_number, order)
  useEffect(() => {
    const subParam = searchParams.get('suborder') || searchParams.get('order_id') || searchParams.get('order_number') || searchParams.get('order');
    if (subParam) {
      setActiveSuborderNumber(subParam);
      loadSuborderDetailByParam(subParam);
    } else {
      setActiveSuborderNumber(null);
      setDetailData(null);
    }
  }, [searchParams, user?.id]);

  async function fetchSuborders() {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_suborders')
        .select(`
          *,
          parentOrder:orders (
            id,
            status,
            payment_status,
            payment_provider,
            payment_method,
            customer_phone,
            customer_name,
            shipping_address
          )
        `)
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSuborders(data || []);
    } catch (err: any) {
      console.error('Error fetching vendor suborders:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSuborderDetailByParam(param: string) {
    setLoadingDetail(true);
    try {
      // 1. Strict vendor ownership resolution when receiving order_id from push notifications
      if (user?.id) {
        const { data: vendorSub } = await supabase
          .from('order_suborders')
          .select('id, suborder_number')
          .eq('vendor_id', user.id)
          .or(`id.eq.${param},suborder_number.eq.${param},parent_order_id.eq.${param}`)
          .maybeSingle();

        if (vendorSub?.id) {
          const { data: detailData, error: detailErr } = await supabase.rpc('get_vendor_suborder_details', {
            p_suborder_id: vendorSub.id
          });
          if (!detailErr && detailData) {
            setDetailData(detailData);
            if (detailData.suborder) {
              setManualCarrier(detailData.suborder.shipping_provider || '');
              setManualTrackingNo(detailData.suborder.tracking_number || '');
              setManualTrackingUrl(detailData.suborder.tracking_url || '');
            }
            return;
          }
        }
      }

      // 2. Fallback query by suborder number
      const { data, error } = await supabase.rpc('get_vendor_suborder_details_by_number', {
        p_suborder_number: param
      });

      if (error) throw error;
      setDetailData(data);

      if (data?.suborder) {
        setManualCarrier(data.suborder.shipping_provider || '');
        setManualTrackingNo(data.suborder.tracking_number || '');
        setManualTrackingUrl(data.suborder.tracking_url || '');
      }
    } catch (err: any) {
      console.error('Error loading suborder detail:', err.message);
      toast.error(`No se pudo cargar el detalle de la suborden: ${err.message}`);
    } finally {
      setLoadingDetail(false);
    }
  }

  function openSuborderDrawer(suborderNo: string) {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', 'orders');
    newParams.set('suborder', suborderNo);
    setSearchParams(newParams);
  }

  function closeSuborderDrawer() {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('suborder');
    setSearchParams(newParams);
  }

  async function handleUpdatePreparationStatus(newStatus: string) {
    if (!detailData?.suborder?.id) return;
    if (!isOrderPaymentApproved(detailData?.order)) {
      toast.error('No podés modificar la preparación de un pedido sin pago confirmado.');
      return;
    }

    try {
      const { error } = await supabase
        .from('order_suborders')
        .update({ status: newStatus })
        .eq('id', detailData.suborder.id);

      if (error) throw error;
      toast.success(`Estado actualizado a: ${newStatus}`);
      if (activeSuborderNumber) loadSuborderDetailByNumber(activeSuborderNumber);
      fetchSuborders();
    } catch (err: any) {
      toast.error(`Error actualizando preparación: ${err.message}`);
    }
  }

  async function handleSaveManualTracking(e: React.FormEvent) {
    e.preventDefault();
    if (!detailData?.suborder?.id) return;
    if (!isOrderPaymentApproved(detailData?.order)) {
      toast.error('No se puede guardar información de seguimiento en una orden sin pago confirmado.');
      return;
    }

    setSavingTracking(true);
    try {
      const { error } = await supabase
        .from('order_suborders')
        .update({
          shipping_provider: manualCarrier.trim(),
          tracking_number: manualTrackingNo.trim(),
          tracking_url: manualTrackingUrl.trim(),
          status: 'shipped'
        })
        .eq('id', detailData.suborder.id);

      if (error) throw error;
      toast.success('Información de seguimiento guardada correctamente.');
      if (activeSuborderNumber) loadSuborderDetailByParam(activeSuborderNumber);
      fetchSuborders();
    } catch (err: any) {
      toast.error(`Error al guardar tracking: ${err.message}`);
    } finally {
      setSavingTracking(false);
    }
  }

  function copyShippingAddressToClipboard(addressObj: any) {
    if (!addressObj || addressObj.address_protected) return;

    const text = `
Destinatario: ${addressObj.first_name || ''} ${addressObj.last_name || ''}
Calle: ${addressObj.street || ''} ${addressObj.apartment ? 'Apto ' + addressObj.apartment : ''}
Barrio/Localidad: ${addressObj.barrio || ''} ${addressObj.city || ''}
Departamento: ${addressObj.department || ''} (CP: ${addressObj.postal_code || 'S/C'})
País: ${addressObj.country || 'Uruguay'}
Teléfono: ${addressObj.phone || detailData?.order?.customer_phone || 'N/A'}
Referencias: ${addressObj.reference || 'N/A'}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopiedAddress(true);
    toast.success('Dirección de entrega copiada al portapapeles.');
    setTimeout(() => setCopiedAddress(false), 2500);
  }

  function renderPaymentBadge(payStatus: string) {
    switch (payStatus) {
      case 'approved':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> PAGO CONFIRMADO
            </span>
            <span className="text-[11px] text-emerald-700 font-bold">Podés preparar y despachar el pedido.</span>
          </div>
        );
      case 'initiated':
      case 'pending':
      case 'processing':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-md bg-amber-100 text-amber-900 border border-amber-300">
              <Clock className="w-3.5 h-3.5 text-amber-600" /> PAGO PENDIENTE
            </span>
            <span className="text-[11px] text-amber-700 font-bold">No prepares ni despaches todavía.</span>
          </div>
        );
      case 'rejected':
      case 'failed':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-md bg-rose-100 text-rose-900 border border-rose-300">
              <XCircle className="w-3.5 h-3.5 text-rose-600" /> PAGO RECHAZADO
            </span>
            <span className="text-[11px] text-rose-700 font-bold">El comprador no completó el pago.</span>
          </div>
        );
      case 'expired':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-md bg-slate-200 text-slate-800 border border-slate-300">
              <XCircle className="w-3.5 h-3.5 text-slate-500" /> PAGO EXPIRADO
            </span>
            <span className="text-[11px] text-slate-700 font-bold">La sesión de pago venció. No preparar.</span>
          </div>
        );
      case 'refunded':
      case 'cancelled':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-md bg-purple-100 text-purple-900 border border-purple-300">
              <AlertTriangle className="w-3.5 h-3.5 text-purple-600" /> PAGO CANCELADO / REEMBOLSADO
            </span>
            <span className="text-[11px] text-purple-700 font-bold">Pedido cancelado. No despachar.</span>
          </div>
        );
      default:
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-md bg-orange-100 text-orange-900 border border-orange-300">
              <ShieldAlert className="w-3.5 h-3.5 text-orange-600" /> PAGO EN REVISIÓN
            </span>
            <span className="text-[11px] text-orange-700 font-bold">No despaches hasta confirmación de Collectibles.</span>
          </div>
        );
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            Gestión de Pedidos (Subórdenes)
          </h1>
          <p className="text-gray-500 mt-1">Monitoreo de estado de pago, preparación e información financiera de cada paquete.</p>
        </div>
        <button 
          onClick={fetchSuborders}
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Quick Filter Chips for Mobile & Desktop */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setQuickFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors min-h-[36px] border ${
            quickFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Todos ({suborders.length})
        </button>
        <button
          onClick={() => setQuickFilter('pending')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors min-h-[36px] border ${
            quickFilter === 'pending'
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Por preparar ({suborders.filter(s => (s.parentOrder?.payment_status === 'approved') && (!s.status || s.status === 'pendiente')).length})
        </button>
        <button
          onClick={() => setQuickFilter('prepared')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors min-h-[36px] border ${
            quickFilter === 'prepared'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Preparados ({suborders.filter(s => s.status === 'preparado').length})
        </button>
        <button
          onClick={() => setQuickFilter('dispatched')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors min-h-[36px] border ${
            quickFilter === 'dispatched'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Despachados ({suborders.filter(s => s.status === 'despachado').length})
        </button>
      </div>

      {/* Orders Responsive List */}
      <ResponsiveDataList
        items={suborders.filter(sub => {
          const isApproved = sub.parentOrder?.payment_status === 'approved' || sub.parentOrder?.status === 'paid';
          if (quickFilter === 'pending') return isApproved && (!sub.status || sub.status === 'pendiente' || sub.status === 'preparando');
          if (quickFilter === 'prepared') return sub.status === 'preparado';
          if (quickFilter === 'dispatched') return sub.status === 'despachado';
          return true;
        })}
        keyExtractor={(sub) => sub.id}
        loading={loading}
        emptyTitle="No hay subórdenes registradas"
        emptyDescription="Aún no tienes subórdenes en tu tienda."
        renderCard={(sub) => {
          const addr = sub.parentOrder?.shipping_address || {};
          const clientName = sub.parentOrder?.customer_name || `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || 'Cliente Oculto';
          const isPaymentApproved = (sub.parentOrder?.payment_status === 'approved') || (sub.parentOrder?.status === 'paid');
          const gross = Number(sub.product_subtotal || 0);
          const shipCost = Number(sub.shipping_cost || 0);
          const mktFee = Number(sub.marketplace_fee || 0);
          const feeShare = Number(sub.payment_fee_share || 0);
          const net = Number(sub.vendor_net_amount || (gross + shipCost - mktFee - feeShare));
          const subNumber = sub.suborder_number || sub.id;
          const statusOp = sub.status === 'ready_to_ship' ? 'PREPARADO' : sub.status === 'shipped' ? 'DESPACHADO' : sub.status === 'delivered' ? 'ENTREGADO' : 'POR PREPARAR';

          return (
            <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-3.5 space-y-2.5 shadow-2xs min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-extrabold text-gray-900 text-sm">
                  #{subNumber}
                </span>
                <span className="text-[11px] font-medium text-gray-400">
                  {new Date(sub.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>{renderPaymentBadge(sub.parentOrder?.payment_status || (isPaymentApproved ? 'approved' : 'pending'))}</div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                  sub.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                  sub.status === 'shipped' ? 'bg-blue-100 text-blue-800' :
                  sub.status === 'ready_to_ship' ? 'bg-indigo-100 text-indigo-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  {statusOp}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs border-t border-b border-gray-100 py-2">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Neto a Cobrar</span>
                  <span className="font-black text-emerald-700 text-sm">${net.toFixed(2)} UYU</span>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Cliente</span>
                  <span className="font-bold text-gray-800 truncate max-w-[140px] block">{clientName}</span>
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={() => openSuborderDrawer(subNumber)}
                  className="w-full bg-[#f00856] hover:bg-[#ff2c68] text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 min-h-[48px] shadow-sm cursor-pointer active:scale-95"
                >
                  <Package className="w-4 h-4" />
                  {isPaymentApproved && sub.status !== 'delivered' ? 'Preparar pedido' : 'Ver detalle del pedido'}
                </button>
              </div>
            </div>
          );
        }}
        renderTableHeader={() => (
          <tr>
            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Suborden / Fecha</th>
            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Cliente</th>
            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado de Pago</th>
            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Finanzas Estimadas</th>
            <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Logística / Tracking</th>
            <th className="px-6 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Acción</th>
          </tr>
        )}
        renderTableRow={(sub) => {
          const addr = sub.parentOrder?.shipping_address || {};
          const clientName = sub.parentOrder?.customer_name || `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || 'Cliente Oculto';
          const isPaymentApproved = (sub.parentOrder?.payment_status === 'approved') || (sub.parentOrder?.status === 'paid');

          const gross = Number(sub.product_subtotal || 0);
          const shipCost = Number(sub.shipping_cost || 0);
          const mktFee = Number(sub.marketplace_fee || 0);
          const feeShare = Number(sub.payment_fee_share || 0);
          const net = Number(sub.vendor_net_amount || (gross + shipCost - mktFee - feeShare));

          const subNumber = sub.suborder_number || sub.id;

          return (
            <tr 
              key={sub.id} 
              onClick={() => openSuborderDrawer(subNumber)}
              className="hover:bg-slate-50/90 cursor-pointer transition-colors group"
              tabIndex={0}
              aria-label={`Ver detalle de suborden ${subNumber}`}
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="font-bold text-gray-900 text-sm group-hover:text-emerald-700 flex items-center gap-1.5 transition-colors">
                  {subNumber}
                  <Eye className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-all" />
                </div>
                <div className="text-xs text-gray-500">{new Date(sub.created_at).toLocaleDateString()}</div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                {clientName}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {renderPaymentBadge(sub.parentOrder?.payment_status || (isPaymentApproved ? 'approved' : 'pending'))}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-xs">
                <div className="flex flex-col">
                  <span className="font-bold text-gray-900">Neto: ${net.toFixed(2)} UYU</span>
                  <span className="text-[10px] text-gray-500">
                    Prod: ${gross} | Com: -${mktFee} | Liq: <span className="font-semibold capitalize text-emerald-700">{sub.liquidation_status || 'pendiente'}</span>
                  </span>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">{sub.shipping_method || 'Standard'}</span>
                  {sub.tracking_number ? (
                    <div className="flex items-center gap-1 text-[11px] text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded w-fit border border-blue-100 font-mono">
                      <Truck className="w-3 h-3" />
                      {sub.shipping_provider ? `${sub.shipping_provider.toUpperCase()}: ` : ''}{sub.tracking_number}
                    </div>
                  ) : (
                    <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1 w-fit">
                      {['pickup', 'local'].includes((sub.shipping_method || '').toLowerCase()) ? 'Listo para retiro' : 'Rastreo pendiente'}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openSuborderDrawer(subNumber);
                  }}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 mx-auto"
                >
                  <Eye className="w-3.5 h-3.5" /> Ver Detalle
                </button>
              </td>
            </tr>
          );
        }}
      />

      {/* SUBORDER DETAIL DRAWER (RESPONSIVE) */}
      {activeSuborderNumber && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={closeSuborderDrawer} />
          
          <div className="fixed inset-y-0 right-0 w-full md:w-[640px] bg-white z-50 shadow-2xl flex flex-col animate-slide-in-left border-l border-gray-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-slate-950">
                    Suborden
                  </span>
                  <h3 className="font-black text-lg font-mono">{activeSuborderNumber}</h3>
                </div>
                {detailData?.order?.order_number && (
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    Orden Principal: #{detailData.order.order_number} | {detailData.suborder?.created_at ? new Date(detailData.suborder.created_at).toLocaleString('es-UY', { timeZone: 'America/Montevideo' }) : ''}
                  </p>
                )}
              </div>
              <button 
                onClick={closeSuborderDrawer} 
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="Cerrar detalle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
              {loadingDetail ? (
                <div className="py-20 text-center text-gray-400 space-y-2">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
                  <p className="text-xs font-bold">Cargando información completa de la suborden...</p>
                </div>
              ) : !detailData ? (
                <div className="py-12 text-center text-gray-500">No se encontraron datos para la suborden.</div>
              ) : (
                <>
                  {/* CANCELLATION WARNING BANNER */}
                  {(detailData.suborder?.status === 'cancelada' || ['cancelled', 'refunded'].includes(detailData.order?.payment_status)) && (
                    <div className="bg-rose-50 border-2 border-rose-300 p-4 rounded-2xl text-rose-900 space-y-1 shadow-sm animate-fade-in">
                      <div className="flex items-center gap-2 font-black text-sm text-rose-800">
                        <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                        PEDIDO CANCELADO
                      </div>
                      <p className="text-xs font-bold text-rose-700 leading-relaxed">
                        Este pedido fue cancelado. No prepares ni despaches los productos.
                      </p>
                    </div>
                  )}

                  {/* PROMINENT MOBILE OPERATIONAL HEADER */}
                  <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white p-5 rounded-2xl shadow-md space-y-4 border border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                          Resumen Operativo Vendor
                        </span>
                        <h3 className="text-xl font-black font-mono tracking-tight text-white mt-0.5">
                          Pedido #{detailData.order?.order_number || activeSuborderNumber}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono">
                          Suborden: {activeSuborderNumber}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Total de tus productos</span>
                        <span className="text-lg font-black text-emerald-400 font-mono">
                          ${detailData.suborder?.product_subtotal || detailData.suborder?.vendor_net_amount || 0} UYU
                        </span>
                        {detailData.suborder?.vendor_net_amount && (
                          <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                            Neto a cobrar: ${detailData.suborder.vendor_net_amount} UYU
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800 text-xs font-bold">
                      {isOrderPaymentApproved(detailData?.order) ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-black uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> PAGO APROBADO
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-black uppercase tracking-wider flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-400" /> PAGO PENDIENTE
                        </span>
                      )}

                      <span className={`px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border ${
                        detailData.suborder?.status === 'despachado' || detailData.suborder?.status === 'shipped' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' :
                        detailData.suborder?.status === 'preparado' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                        detailData.suborder?.status === 'preparando' || detailData.suborder?.status === 'preparing' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                        detailData.suborder?.status === 'cancelada' || detailData.suborder?.status === 'cancelled' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                        'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}>
                        {detailData.suborder?.status === 'despachado' || detailData.suborder?.status === 'shipped' ? 'DESPACHADO' :
                         detailData.suborder?.status === 'preparado' ? 'PREPARADO' :
                         detailData.suborder?.status === 'preparando' || detailData.suborder?.status === 'preparing' ? 'EN PREPARACIÓN' :
                         detailData.suborder?.status === 'cancelada' || detailData.suborder?.status === 'cancelled' ? 'CANCELADO' :
                         'PENDIENTE DE PREPARACIÓN'}
                      </span>

                      <span className="text-slate-400 text-xs ml-auto font-medium">
                        {detailData.items?.length || 0} {detailData.items?.length === 1 ? 'producto' : 'productos'}
                      </span>
                    </div>

                    {/* DYNAMIC PRIMARY CTA ACCORDING TO OPERATIONAL STATE */}
                    {isOrderPaymentApproved(detailData?.order) && !['cancelled', 'cancelada', 'refunded'].includes(detailData?.suborder?.status) && (
                      <div className="pt-2">
                        {(!detailData.suborder?.status || detailData.suborder?.status === 'pendiente') && (
                          <button
                            onClick={() => setShowPrepareModal(true)}
                            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 min-h-[48px]"
                          >
                            <Package className="w-5 h-5" /> Preparar Pedido
                          </button>
                        )}

                        {detailData.suborder?.status === 'preparando' && (
                          <button
                            onClick={() => handleUpdatePreparationStatus('preparado')}
                            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 min-h-[48px]"
                          >
                            <CheckCircle className="w-5 h-5" /> Marcar como Preparado
                          </button>
                        )}

                        {detailData.suborder?.status === 'preparado' && (
                          <button
                            onClick={() => {
                              const formEl = document.querySelector('form');
                              if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-black text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 min-h-[48px]"
                          >
                            <Truck className="w-5 h-5" /> Despachar Pedido
                          </button>
                        )}

                        {detailData.suborder?.status === 'despachado' && (
                          <div className="p-3 bg-slate-800/80 rounded-xl text-xs text-slate-300 flex items-center justify-between">
                            <span className="font-bold text-white flex items-center gap-1.5">
                              <Truck className="w-4 h-4 text-indigo-400" /> Pedido Despachado
                            </span>
                            <span className="font-mono text-emerald-400 font-bold">
                              {detailData.suborder?.tracking_number || 'En tránsito'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SECTION 1: ESTADO DEL PAGO */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" /> Estado del Pago
                    </h4>

                    {renderPaymentBadge(detailData.order?.payment_status)}

                    <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Pasarela / Método</span>
                        <span className="font-bold text-gray-900 capitalize">{detailData.order?.payment_provider || detailData.order?.payment_method || 'Pasarela Web'}</span>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Subtotal Suborden</span>
                        <span className="font-black text-emerald-700">${detailData.suborder?.product_subtotal} UYU</span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: PRODUCTOS A PREPARAR (STRICT ISOLATION) */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center justify-between border-b border-gray-100 pb-2">
                      <span className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-indigo-600" /> Productos a Preparar
                      </span>
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-150">
                        Exclusivo de tu tienda ({detailData.items?.length || 0})
                      </span>
                    </h4>

                    <div className="divide-y divide-gray-100 space-y-3">
                      {detailData.items && detailData.items.length > 0 ? (
                        detailData.items.map((item: any) => (
                          <div key={item.id} className="pt-3 first:pt-0 flex items-start gap-3">
                            <div className="w-14 h-14 bg-gray-100 rounded-xl border border-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                              {(item.image_url || item.product_image_url) ? (
                                <img 
                                  src={item.image_url || item.product_image_url} 
                                  alt={item.product_name || 'Producto'} 
                                  className="w-full h-full object-cover" 
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                    const parent = (e.target as HTMLElement).parentElement;
                                    if (parent) {
                                      const placeholder = document.createElement('div');
                                      placeholder.className = 'w-full h-full flex items-center justify-center bg-gray-100 text-gray-400';
                                      placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package w-6 h-6"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="m7.5 4.5 8.7 5"/></svg>';
                                      parent.appendChild(placeholder);
                                    }
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300">
                                  <Package className="w-6 h-6" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h5 className="text-sm font-bold text-gray-900 leading-tight">{item.product_name}</h5>
                                  {item.variant_name && <p className="text-xs text-gray-500 mt-0.5 font-medium">Variante: {item.variant_name}</p>}
                                  <p className="text-[10px] font-mono text-gray-400 mt-0.5">SKU: {item.sku}</p>
                                </div>
                                {item.is_preorder && (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[9px] font-black rounded-md uppercase border border-amber-300 shrink-0">
                                    Preventa
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 flex items-center justify-between text-xs">
                                <span className="font-semibold text-gray-700">{item.quantity} un. x ${item.unit_price}</span>
                                <span className="font-black text-gray-900">${item.final_total} UYU</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 py-4 text-center">No hay productos asociados a esta suborden.</p>
                      )}
                    </div>
                  </div>

                  {/* SECTION 3: DATOS DEL CLIENTE Y ENTREGA */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-rose-600" /> Datos de Destino / Cliente
                      </h4>

                      {!detailData.order?.shipping_address?.address_protected && (
                        <button
                          onClick={() => copyShippingAddressToClipboard(detailData.order?.shipping_address)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1"
                        >
                          {copiedAddress ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          {copiedAddress ? '¡Copiada!' : 'Copiar Dirección'}
                        </button>
                      )}
                    </div>

                    {detailData.order?.shipping_address?.address_protected ? (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                        <p className="font-bold flex items-center gap-1">
                          <Lock className="w-4 h-4 text-amber-600" /> Dirección Protegida
                        </p>
                        <p className="text-amber-800 text-[11px] leading-relaxed">
                          {detailData.order.shipping_address.protection_message}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-150 text-xs space-y-2">
                        <div className="font-bold text-sm text-gray-900">{detailData.order?.customer_name || 'Cliente'}</div>
                        
                        <div className="text-gray-700 leading-relaxed font-medium">
                          <p>{detailData.order?.shipping_address?.street} {detailData.order?.shipping_address?.apartment ? `Apto ${detailData.order.shipping_address.apartment}` : ''}</p>
                          <p>{detailData.order?.shipping_address?.barrio} {detailData.order?.shipping_address?.city}, {detailData.order?.shipping_address?.department} (CP: {detailData.order?.shipping_address?.postal_code || 'S/C'})</p>
                          <p className="text-gray-500 font-bold mt-1">Teléfono: {detailData.order?.customer_phone || 'N/A'}</p>
                          {detailData.order?.shipping_address?.reference && (
                            <p className="text-gray-500 italic mt-1">Ref: {detailData.order.shipping_address.reference}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SECTION 4: MÉTODO DE ENVÍO Y RASTREO */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">
                      <Truck className="w-4 h-4 text-blue-600" /> Logística y Tracking
                    </h4>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Método Seleccionado</span>
                        <span className="font-bold text-gray-900 uppercase">{detailData.suborder?.shipping_method || 'Standard'}</span>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Proveedor Logístico</span>
                        <span className="font-bold text-gray-900 uppercase">{detailData.suborder?.shipping_provider || 'DAC'}</span>
                      </div>
                    </div>

                    {/* Manual Tracking Input Form */}
                    <form onSubmit={handleSaveManualTracking} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                      <h5 className="text-xs font-bold text-slate-800">Actualizar Código de Seguimiento</h5>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Empresa Courier</label>
                          <input
                            type="text"
                            placeholder="Ej. DAC, UES, SoyDelivery"
                            disabled={detailData.order?.payment_status !== 'approved'}
                            value={manualCarrier}
                            onChange={(e) => setManualCarrier(e.target.value)}
                            className="form-input text-xs disabled:bg-gray-200 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Número Tracking</label>
                          <input
                            type="text"
                            placeholder="Ej. UY-99887766"
                            disabled={detailData.order?.payment_status !== 'approved'}
                            value={manualTrackingNo}
                            onChange={(e) => setManualTrackingNo(e.target.value)}
                            className="form-input text-xs font-mono disabled:bg-gray-200 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={savingTracking || detailData.order?.payment_status !== 'approved'}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${savingTracking ? 'animate-spin' : ''}`} />
                        Guardar Tracking y Marcar Despachado
                      </button>
                    </form>
                  </div>

                  {/* SECTION 5: RESUMEN FINANCIERO DEL VENDOR */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" /> Resumen Financiero de la Suborden
                    </h4>

                    <div className="space-y-1.5 text-xs text-gray-700">
                      <div className="flex justify-between">
                        <span>Total de tus productos:</span>
                        <span className="font-bold">${detailData.suborder?.product_subtotal} UYU</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Costo de Envío Paquete:</span>
                        <span className="font-bold">${detailData.suborder?.shipping_cost || 0} UYU</span>
                      </div>
                      <div className="flex justify-between text-rose-700">
                        <span>Comisión Marketplace Collectibles (5%):</span>
                        <span className="font-bold">-${detailData.suborder?.marketplace_fee || 0} UYU</span>
                      </div>
                      {Number(detailData.suborder?.payment_fee_share || 0) > 0 && (
                        <div className="flex justify-between text-rose-700">
                          <span>Comisión Pasarela Compartida:</span>
                          <span className="font-bold">-${detailData.suborder?.payment_fee_share} UYU</span>
                        </div>
                      )}
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-black text-emerald-800">
                        <span>Neto Estimado a Cobrar:</span>
                        <span>${detailData.suborder?.vendor_net_amount} UYU</span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 6: HISTORIAL OPERATIVO */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">
                      <Clock className="w-4 h-4 text-slate-600" /> Historial Operativo
                    </h4>

                    <div className="relative pl-5 space-y-3 text-xs before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                      {detailData.events && detailData.events.length > 0 ? (
                        detailData.events.map((ev: any) => (
                          <div key={ev.id} className="relative">
                            <div className="absolute -left-5 top-1 w-2.5 h-2.5 rounded-full bg-slate-800 ring-2 ring-white" />
                            <p className="font-bold text-gray-900 uppercase text-[10px]">{ev.event_type}</p>
                            <p className="text-gray-600 text-[11px]">{ev.processing_result || 'Evento registrado'}</p>
                            <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
                              {new Date(ev.created_at).toLocaleString('es-UY', { timeZone: 'America/Montevideo' })}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 italic">No hay historial registrado aún.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer Actions (Sticky Bottom on Desktop & Mobile with safe area insets) */}
            <div className="p-4 border-t border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3 pb-[max(16px,env(safe-area-inset-bottom))]">
              {detailData?.order?.payment_status === 'approved' && detailData?.suborder?.status !== 'cancelada' && (
                <div className="w-full md:hidden mb-2">
                  {(!detailData.suborder?.status || detailData.suborder?.status === 'pendiente') && (
                    <button
                      onClick={() => setShowPrepareModal(true)}
                      className="w-full py-3 bg-emerald-600 text-white font-black text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 min-h-[48px]"
                    >
                      <Package className="w-5 h-5" /> Preparar Pedido
                    </button>
                  )}

                  {detailData.suborder?.status === 'preparando' && (
                    <button
                      onClick={() => handleUpdatePreparationStatus('preparado')}
                      className="w-full py-3 bg-emerald-600 text-white font-black text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 min-h-[48px]"
                    >
                      <CheckCircle className="w-5 h-5" /> Marcar como Preparado
                    </button>
                  )}

                  {detailData.suborder?.status === 'preparado' && (
                    <button
                      onClick={() => {
                        const formEl = document.querySelector('form');
                        if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="w-full py-3 bg-indigo-600 text-white font-black text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 min-h-[48px]"
                    >
                      <Truck className="w-5 h-5" /> Despachar Pedido
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  if (detailData?.suborder?.id) {
                    setLabelModalSuborderId(detailData.suborder.id);
                    setModalTab('label');
                  }
                }}
                disabled={detailData?.order?.payment_status !== 'approved'}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
                title={detailData?.order?.payment_status === 'approved' ? 'Ver Etiqueta' : 'Bloqueado: Pago no confirmado'}
              >
                <Truck className="w-4 h-4" /> Etiqueta DAC
              </button>

              <button
                onClick={() => {
                  if (detailData?.suborder?.id) {
                    setLabelModalSuborderId(detailData.suborder.id);
                    setModalTab('slip');
                  }
                }}
                disabled={detailData?.order?.payment_status !== 'approved'}
                className="flex-1 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
                title={detailData?.order?.payment_status === 'approved' ? 'Imprimir Packing Slip' : 'Bloqueado: Pago no confirmado'}
              >
                <FileText className="w-4 h-4" /> Packing Slip
              </button>
            </div>
          </div>
        </>
      )}

      {/* PREPARATION CONFIRMATION BOTTOM SHEET */}
      {showPrepareModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center animate-fade-in">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setShowPrepareModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-6 space-y-4 z-10 shadow-2xl pb-[max(24px,env(safe-area-inset-bottom))]">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto sm:hidden" />
            
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg text-gray-900">Preparar Pedido</h3>
                <p className="text-xs text-gray-500 font-mono">Suborden #{activeSuborderNumber}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-gray-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex justify-between">
                <span className="font-semibold text-gray-500">Productos en paquete:</span>
                <span className="font-bold text-gray-900">{detailData?.items?.length || 0} ítems</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-gray-500">Cliente:</span>
                <span className="font-bold text-gray-900">{detailData?.order?.customer_name || 'Cliente'}</span>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium pt-2 border-t border-slate-200">
                Confirma que vas a empaquetar los productos para dejarlos listos para despacho.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setShowPrepareModal(false);
                  handleUpdatePreparationStatus('preparando');
                }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl transition-colors min-h-[48px] shadow-sm"
              >
                Comenzar preparación
              </button>
              <button
                onClick={() => setShowPrepareModal(false)}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors min-h-[44px]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Shipment Label / Slip Modal */}
      {labelModalSuborderId && (
        <ShipmentLabelModal
          suborderId={labelModalSuborderId}
          initialTab={modalTab}
          onClose={() => {
            setLabelModalSuborderId(null);
            fetchSuborders();
          }}
        />
      )}
    </div>
  );
}

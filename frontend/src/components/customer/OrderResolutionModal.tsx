import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../admin/Toast';
import { 
  X, AlertCircle, Clock, ShieldCheck, Truck, RefreshCw, Upload, 
  CheckCircle2, Package, ArrowRight, ArrowLeft, HelpCircle, AlertTriangle, FileText
} from 'lucide-react';

export interface ResolutionModalProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdRequest?: any) => void;
  onViewRequests?: () => void;
}

export type ResolutionStep = 'intent' | 'items' | 'reason' | 'confirm' | 'success';

export default function OrderResolutionModal({
  order,
  isOpen,
  onClose,
  onSuccess,
  onViewRequests
}: ResolutionModalProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<ResolutionStep>('intent');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [createdRequestData, setCreatedRequestData] = useState<any>(null);

  // Subórdenes / Selección granular para pedidos mixtos
  const suborders = order?.order_suborders || [];
  const [selectedSuborderId, setSelectedSuborderId] = useState<string>(
    suborders.length > 0 ? suborders[0].id : ''
  );

  const selectedSuborder = suborders.find((s: any) => s.id === selectedSuborderId) || suborders[0] || null;

  // Items de la orden filtrados por la suborden seleccionada (o todos si no hay suborden definida)
  const orderItems = (order?.order_items || []).filter((item: any) => 
    selectedSuborder ? item.suborder_id === selectedSuborder.id : true
  );

  const [selectedOrderItemId, setSelectedOrderItemId] = useState<string>('');
  const selectedOrderItem = orderItems.find((it: any) => it.id === selectedOrderItemId) || null;

  // Determinar modelo comercial de la selección de forma fiable:
  const hasIntlItemsInSuborder = orderItems.some((it: any) => 
    (it.international_order_items && it.international_order_items.length > 0) ||
    Boolean(it.product?.is_international)
  );

  const isInternational = Boolean(selectedSuborder?.is_international) || (
    selectedOrderItem 
      ? Boolean(selectedOrderItem.international_order_items?.length > 0 || selectedOrderItem.product?.is_international)
      : hasIntlItemsInSuborder
  );

  const isVendor = Boolean(!isInternational && selectedSuborder && !selectedSuborder.is_collectibles_order && selectedSuborder.vendor_id);
  const isCollectiblesNational = !isInternational && !isVendor;

  // Evaluar estado Zinc si es internacional
  const intlItemsToCheck = selectedOrderItem
    ? (selectedOrderItem.international_order_items || [])
    : orderItems.flatMap((it: any) => it.international_order_items || []);

  const approvedZincStatuses = [
    'zinc_order_created',
    'zinc_processing',
    'purchased',
    'warehouse_received',
    'shipped',
    'shipped_to_courier',
    'delivered',
    'delivered_to_courier'
  ];

  const isZincApproved = isInternational && intlItemsToCheck.some((z: any) => 
    approvedZincStatuses.includes(z.purchase_status) || Boolean(z.zinc_order_id)
  );

  const isZincSubmitting = isInternational && intlItemsToCheck.some((z: any) => 
    z.purchase_status === 'zinc_submitting'
  );

  const canCancelInternationalVoluntary = isInternational && !isZincApproved && !isZincSubmitting;

  // Ventana de 10 minutos para cancelación inmediata nacional
  const approvedPayment = order?.payments?.find((p: any) => p.status === 'approved');
  const realPaymentDateStr = order?.paid_at || order?.payment_processed_at || approvedPayment?.approved_at;
  const paymentDate = realPaymentDateStr ? new Date(realPaymentDateStr).getTime() : 0;
  const diffMinutes = paymentDate > 0 ? (Date.now() - paymentDate) / (1000 * 60) : 999;
  const isWithin10m = isCollectiblesNational && ['paid', 'confirmed'].includes(order?.status) && diffMinutes <= 10;

  // Form State
  const [selectedIntent, setSelectedIntent] = useState<string>(
    ['delivered', 'received'].includes(order?.status) ? 'return' : 'cancel'
  );
  const [requestType, setRequestType] = useState<string>('voluntary_return');
  const [reasonCategory, setReasonCategory] = useState<string>('');
  const [reasonText, setReasonText] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const [evidencePreviews, setEvidencePreviews] = useState<{ path: string; previewUrl: string }[]>([]);

  if (!isOpen || !order) return null;

  // Calcular monto involucrado estimado
  const targetRefundAmount = selectedOrderItem 
    ? Number(selectedOrderItem.final_total || selectedOrderItem.total_price || (selectedOrderItem.unit_price * (selectedOrderItem.quantity || 1)))
    : (selectedSuborder ? Number(selectedSuborder.product_subtotal || selectedSuborder.subtotal || order.total_amount) : Number(order.total_amount));

  // Selección de Intención en Paso 1
  const handleSelectIntent = (intentKey: string) => {
    setSelectedIntent(intentKey);
    if (intentKey === 'cancel') {
      if (isWithin10m) {
        setRequestType('cancel_immediate_10m');
      } else if (canCancelInternationalVoluntary) {
        setRequestType('cancel_international_zinc');
      } else if (isVendor) {
        setRequestType('cancel_vendor_policy');
      } else {
        setRequestType('cancel_before_payment');
      }
    } else if (intentKey === 'wrong_product') {
      setRequestType('wrong_product');
    } else if (intentKey === 'damaged') {
      setRequestType('damaged_in_transit');
    } else if (intentKey === 'defective') {
      setRequestType('defective_product');
    } else if (intentKey === 'not_delivered') {
      setRequestType('not_delivered');
    } else if (intentKey === 'return') {
      setRequestType('voluntary_return');
    } else {
      setRequestType('voluntary_return');
    }

    // Si tiene más de una suborden o items, ir al paso 2; si es orden simple, ir a motivo
    if (suborders.length > 1 || orderItems.length > 1) {
      setCurrentStep('items');
    } else {
      setCurrentStep('reason');
    }
  };

  // Subida de evidencias a Supabase Storage
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El tamaño máximo permitido por fotografía es de 10 MB.');
      return;
    }

    setUploadingImage(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error('Sesión no encontrada');

      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/${order.id}/${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage
        .from('order-dispute-evidence')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: signData } = await supabase.storage
        .from('order-dispute-evidence')
        .createSignedUrl(filePath, 3600);

      setEvidenceImages(prev => [...prev, filePath]);
      setEvidencePreviews(prev => [...prev, { path: filePath, previewUrl: signData?.signedUrl || '' }]);
      toast.success('Fotografía agregada a la evidencia de tu solicitud.');
    } catch (uploadErr: any) {
      console.error('Error subiendo imagen privada:', uploadErr);
      toast.error('Error al subir imagen de evidencia: ' + uploadErr.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleConfirmSubmit = async () => {
    const finalReason = reasonText.trim() || reasonCategory || 'Solicitud de posventa del cliente';
    if (!finalReason) {
      toast.error('Por favor selecciona o escribe el motivo.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        toast.error('Debes iniciar sesión para realizar esta gestión.');
        return;
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co'}/functions/v1/request-order-resolution`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId: order.id,
          suborderId: selectedSuborder?.id || null,
          orderItemId: selectedOrderItemId || null,
          requestType,
          reason: finalReason,
          notes: customerNotes,
          evidenceImages
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Error al procesar la solicitud');
      }

      setCreatedRequestData({
        id: data.requestId || data.request?.id || `REQ-${Date.now().toString().slice(-6)}`,
        status: data.status || data.request?.status || (data.refund?.refundSuccess ? 'REFUNDED' : 'UNDER_REVIEW'),
        message: data.message || 'Solicitud recibida exitosamente.',
        amount: targetRefundAmount,
        currency: order.currency || 'UYU'
      });

      setCurrentStep('success');
      toast.success(data.message || 'Gestión registrada correctamente');
      onSuccess(data);
    } catch (err: any) {
      console.error('Error enviando resolución:', err);
      toast.error(err.message || 'Error inesperado al enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const isEvidenceRequired = ['wrong_product', 'damaged_in_transit', 'defective_product'].includes(requestType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0e131f] border border-white/10 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header con Stepper Contextual */}
        <div className="p-5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                  Autogestión de Pedido
                </span>
                <span className="font-mono text-xs text-rose-400 font-bold">
                  {order.order_number || `#${order.id.slice(0, 8).toUpperCase()}`}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                {currentStep === 'intent' && '¿Qué necesitás resolver?'}
                {currentStep === 'items' && 'Seleccionar productos de la compra'}
                {currentStep === 'reason' && 'Motivo y detalles del caso'}
                {currentStep === 'confirm' && 'Confirmar solicitud de posventa'}
                {currentStep === 'success' && 'Gestión en curso'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de Pasos visual */}
        {currentStep !== 'success' && (
          <div className="px-6 py-2.5 bg-black/40 border-b border-white/5 flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span className={currentStep === 'intent' ? 'text-rose-400 font-black' : ''}>1. Problema</span>
            <span className="text-slate-600">→</span>
            {(suborders.length > 1 || orderItems.length > 1) && (
              <>
                <span className={currentStep === 'items' ? 'text-rose-400 font-black' : ''}>2. Artículos</span>
                <span className="text-slate-600">→</span>
              </>
            )}
            <span className={currentStep === 'reason' ? 'text-rose-400 font-black' : ''}>
              {(suborders.length > 1 || orderItems.length > 1) ? '3. Motivo' : '2. Motivo'}
            </span>
            <span className="text-slate-600">→</span>
            <span className={currentStep === 'confirm' ? 'text-rose-400 font-black' : ''}>Confirmación</span>
          </div>
        )}

        {/* Body Dinámico según Paso */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">

          {/* ════════════════ PASO 1: INTENCIÓN ════════════════ */}
          {currentStep === 'intent' && (
            <div className="space-y-3">
              <p className="text-slate-400 text-xs">
                Seleccioná la situación que describe lo que te ocurrió con este pedido para ofrecerte la solución adecuada:
              </p>

              <div className="grid grid-cols-1 gap-2.5">
                {/* Opción Cancelar Compra */}
                {!['cancelled', 'cancelada', 'refunded', 'delivered'].includes(order.status) && (
                  <button
                    type="button"
                    onClick={() => handleSelectIntent('cancel')}
                    className="p-3.5 rounded-2xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/40 text-left transition flex items-start gap-3.5 group"
                  >
                    <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 group-hover:bg-rose-500 group-hover:text-white transition">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-white text-sm group-hover:text-rose-300">Quiero cancelar mi compra</h4>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        {isWithin10m && '¡Tenés la ventana de 10 min de cancelación inmediata activa! Reembolso automático.'}
                        {!isWithin10m && isCollectiblesNational && 'El pedido aún no fue despachado. Solicitá la detención antes de que salga.'}
                        {isInternational && canCancelInternationalVoluntary && 'La compra aún no fue enviada a USA/Zinc. Puede cancelarse pre-compra.'}
                        {isInternational && isZincApproved && 'Compra internacional confirmada con proveedor exterior (no admite cancelación voluntaria).'}
                        {isVendor && 'Gestionar cancelación conforme a la política comercial del vendedor.'}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-rose-400 group-hover:translate-x-1 transition" />
                  </button>
                )}

                {/* Opción Producto Diferente */}
                <button
                  type="button"
                  onClick={() => handleSelectIntent('wrong_product')}
                  className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-left transition flex items-start gap-3.5 group"
                >
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-white text-sm group-hover:text-purple-300">Recibí un producto diferente</h4>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      El artículo que llegó no coincide con el modelo, variante o descripción que compraste.
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition" />
                </button>

                {/* Opción Dañado o Defectuoso */}
                <button
                  type="button"
                  onClick={() => handleSelectIntent('damaged')}
                  className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-left transition flex items-start gap-3.5 group"
                >
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-white text-sm group-hover:text-amber-300">El producto llegó dañado o defectuoso</h4>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      La caja vino golpeada por el courier o la figura presenta roturas / desperfectos de origen.
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition" />
                </button>

                {/* Opción No Llegó */}
                <button
                  type="button"
                  onClick={() => handleSelectIntent('not_delivered')}
                  className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-left transition flex items-start gap-3.5 group"
                >
                  <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-white text-sm group-hover:text-blue-300">Mi compra no llegó</h4>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      El plazo prometido se venció y el seguimiento no muestra entrega.
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition" />
                </button>

                {/* Opción Devolver Producto / Arrepentimiento */}
                <button
                  type="button"
                  onClick={() => handleSelectIntent('return')}
                  className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-left transition flex items-start gap-3.5 group"
                >
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-white text-sm group-hover:text-emerald-300">Quiero devolver el producto</h4>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Desistimiento legal uruguayo (Ley 17.250 Art. 16, 5 días hábiles con producto en su estado original) o devolución comercial.
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition" />
                </button>

                {/* Opción Tengo otro problema */}
                <button
                  type="button"
                  onClick={() => handleSelectIntent('other')}
                  className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-left transition flex items-start gap-3.5 group"
                >
                  <div className="p-2 rounded-xl bg-slate-500/20 text-slate-400">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-white text-sm group-hover:text-slate-200">Tengo otro problema</h4>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Consultas sobre facturación, cobranza o incidencias particulares que requieran evaluación humana.
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition" />
                </button>
              </div>
            </div>
          )}

          {/* ════════════════ PASO 2: SELECCIÓN GRANULAR ════════════════ */}
          {currentStep === 'items' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-slate-400 text-xs">
                  Tu pedido cuenta con múltiples paquetes o artículos. Elegí exactamente qué querés incluir:
                </p>
              </div>

              {/* Selector de Suborden en Pedidos Mixtos */}
              {suborders.length > 1 && (
                <div>
                  <label className="block text-zinc-300 font-bold mb-1.5 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-indigo-400" /> Paquete / Vendedor:
                  </label>
                  <select
                    value={selectedSuborderId}
                    onChange={(e) => {
                      setSelectedSuborderId(e.target.value);
                      setSelectedOrderItemId('');
                    }}
                    className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none focus:border-rose-500"
                  >
                    {suborders.map((sub: any, idx: number) => {
                      const sModel = sub.is_international ? 'Internacional' : (sub.is_collectibles_order ? 'Collectibles Oficial' : `Vendedor: ${sub.vendor?.store_name || 'Vendedor'}`);
                      return (
                        <option key={sub.id} value={sub.id}>
                          Paquete #{idx + 1} — {sModel} (${sub.product_subtotal || 0} {order.currency || 'UYU'})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Selector de Ítems */}
              <div>
                <label className="block text-zinc-300 font-bold mb-1.5">
                  Artículo específico a gestionar:
                </label>
                <div className="space-y-2">
                  <div
                    onClick={() => setSelectedOrderItemId('')}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      selectedOrderItemId === ''
                        ? 'bg-rose-500/10 border-rose-500/50 text-white font-bold'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-rose-400" />
                      <span>Gestionar el paquete completo ({orderItems.length} artículos)</span>
                    </div>
                    <span className="font-mono text-xs text-white font-bold">
                      ${selectedSuborder?.product_subtotal || order.total_amount} {order.currency || 'UYU'}
                    </span>
                  </div>

                  {orderItems.map((item: any) => {
                    const isSelected = selectedOrderItemId === item.id;
                    const itemPrice = item.final_total || item.total_price || (item.unit_price * (item.quantity || 1));
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedOrderItemId(item.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-rose-500/10 border-rose-500/50 text-white font-bold'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-rose-500 bg-rose-500' : 'border-slate-500'}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div>
                            <p className="text-white font-semibold">{item.product_name || item.product?.title || 'Artículo'}</p>
                            <p className="text-[11px] text-slate-400">Cantidad: {item.quantity}</p>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold text-white">
                          ${itemPrice} {order.currency || 'UYU'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Advertencias de Modelo */}
              {isInternational && isZincApproved && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Aviso de compra internacional:</strong>
                    <p className="text-[11px] text-amber-200 mt-0.5">
                      Este paquete ya fue confirmado con el proveedor internacional. Podrás solicitar revisiones por daño o falla, pero no cancelación voluntaria.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ PASO 3: MOTIVO Y DETALLES ════════════════ */}
          {currentStep === 'reason' && (
            <div className="space-y-4">
              <div>
                <label className="block text-zinc-300 font-bold mb-1.5">
                  Motivo principal:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    'Compré por error / me arrepentí (Retracto Ley 17.250)',
                    'Cancelación comercial antes del despacho',
                    'Producto defectuoso de fábrica / Falla',
                    'Caja o figura golpeada durante el transporte',
                    'Me enviaron un artículo o variante distinta',
                    'Paquete no entregado en plazo acordado',
                    'Devolución comercial voluntaria',
                    'Otro motivo o consulta de posventa'
                  ].map((motivo) => (
                    <button
                      key={motivo}
                      type="button"
                      onClick={() => {
                        setReasonCategory(motivo);
                        setReasonText(motivo);
                      }}
                      className={`p-2.5 rounded-xl border text-left text-xs transition ${
                        reasonCategory === motivo
                          ? 'bg-rose-500/15 border-rose-500 text-white font-bold'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {motivo}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 font-bold mb-1.5">
                  Explicación detallada:
                </label>
                <textarea
                  rows={3}
                  placeholder="Contanos brevemente qué ocurrió para agilizar el proceso..."
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/15 rounded-xl p-3 text-white placeholder-slate-500 outline-none focus:border-rose-500 resize-none text-xs"
                />
              </div>

              {/* Subida de fotografías si corresponde */}
              {isEvidenceRequired && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-zinc-300 font-bold">
                      Fotografías de evidencia (Requerido para daños/fallas):
                    </label>
                    <span className="text-[10px] text-slate-400">Hasta 10 MB (JPG/PNG)</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl flex items-center gap-2 text-white font-bold transition">
                      <Upload className="w-4 h-4 text-rose-400" />
                      <span>{uploadingImage ? 'Subiendo evidencia...' : 'Cargar fotografía'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        disabled={uploadingImage}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {evidenceImages.length} imagen{evidenceImages.length !== 1 ? 'es' : ''} cargada{evidenceImages.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {evidencePreviews.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {evidencePreviews.map((item, idx) => (
                        <div key={idx} className="relative group w-14 h-14 rounded-xl overflow-hidden border border-white/20">
                          <img src={item.previewUrl || '/placeholder.png'} alt="Evidencia" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              setEvidenceImages(prev => prev.filter(p => p !== item.path));
                              setEvidencePreviews(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="absolute inset-0 bg-red-600/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════════════ PASO 4: CONFIRMACIÓN Y CONSECUENCIAS ════════════════ */}
          {currentStep === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                  Resumen de la Solicitud
                </h4>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Pedido</span>
                    <span className="text-white font-mono font-bold">{order.order_number || `#${order.id.slice(0,8)}`}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Importe a Gestionar</span>
                    <span className="text-emerald-400 font-mono font-bold">${targetRefundAmount} {order.currency || 'UYU'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[10px]">Alcance</span>
                    <span className="text-white font-medium">
                      {selectedOrderItem ? `Artículo individual: ${selectedOrderItem.product_name || 'Ítem seleccionado'}` : 'Paquete completo'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[10px]">Motivo</span>
                    <span className="text-white font-medium">{reasonText || reasonCategory}</span>
                  </div>
                </div>
              </div>

              {/* Consecuencias y tiempos reales verificados */}
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-2 text-blue-200">
                <h5 className="font-bold flex items-center gap-1.5 text-xs text-blue-300">
                  <ShieldCheck className="w-4 h-4" /> Qué sucederá a continuación:
                </h5>
                <ul className="space-y-1.5 text-[11px] text-slate-300 list-disc list-inside">
                  {requestType === 'legal_withdrawal' ? (
                    <li>Derecho de Retracto (Ley 17.250 Art. 16): dispones de 5 días hábiles desde la entrega para desistir. El producto debe restituirse en su empaque original sin uso.</li>
                  ) : isWithin10m ? (
                    <li>Ventana comercial de cancelación inmediata activa: el reembolso se procesará de forma automatizada hacia tu medio de pago de Mercado Pago.</li>
                  ) : (
                    <li>Tu solicitud se registrará de inmediato en el sistema de posventa interno con un número identificador único.</li>
                  )}
                  <li>El seguimiento cronológico y las actualizaciones de estado se reflejan en tiempo real en la sección <b>Mis Gestiones</b>.</li>
                  {isVendor && <li>Al ser un producto de vendedor asociado, este intervendrá formalmente para validar la logística de retorno en un plazo de hasta 48 horas hábiles.</li>}
                  {isInternational && (
                    <li>Compras internacionales: conforme a la normativa, se verifica el estado logístico del operador exterior para coordinar la reversión sin cargos indebidos.</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* ════════════════ PASO 5: ÉXITO Y SEGUIMIENTO ════════════════ */}
          {currentStep === 'success' && createdRequestData && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="text-[10px] uppercase font-black text-emerald-400 tracking-widest bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
                  Solicitud Registrada
                </span>
                <h3 className="text-lg font-black text-white mt-2">
                  {createdRequestData.status === 'REFUNDED' ? '¡Cancelación y Reembolso Confirmados!' : 'Gestión Iniciada con Éxito'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {createdRequestData.message}
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 max-w-sm mx-auto text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Identificador:</span>
                  <span className="text-white font-mono font-bold">{createdRequestData.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Monto:</span>
                  <span className="text-emerald-400 font-mono font-bold">${createdRequestData.amount} {createdRequestData.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Estado inicial:</span>
                  <span className="text-rose-400 font-bold uppercase">{createdRequestData.status}</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                {onViewRequests && (
                  <button
                    onClick={() => {
                      onClose();
                      onViewRequests();
                    }}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" /> Ver en Mis Gestiones
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer con Navegación de Pasos */}
        {currentStep !== 'success' && (
          <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
            {currentStep !== 'intent' ? (
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 'confirm') setCurrentStep('reason');
                  else if (currentStep === 'reason') {
                    if (suborders.length > 1 || orderItems.length > 1) setCurrentStep('items');
                    else setCurrentStep('intent');
                  } else if (currentStep === 'items') setCurrentStep('intent');
                }}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition font-bold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Volver
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition font-bold"
              >
                Cancelar
              </button>

              {currentStep === 'items' && (
                <button
                  type="button"
                  onClick={() => setCurrentStep('reason')}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition flex items-center gap-1.5"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {currentStep === 'reason' && (
                <button
                  type="button"
                  onClick={() => {
                    if (!reasonText.trim() && !reasonCategory) {
                      toast.error('Por favor seleccioná o escribí un motivo.');
                      return;
                    }
                    setCurrentStep('confirm');
                  }}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition flex items-center gap-1.5"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {currentStep === 'confirm' && (
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={submitting}
                  className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-600/30 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmar Gestión</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

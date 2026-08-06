import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Store, CreditCard, MapPin, Truck, Sparkles, Package, HelpCircle, 
  CheckCircle2, Clock, AlertTriangle, ArrowRight, ShieldCheck, Minimize2, 
  ExternalLink, FileText, ChevronRight, X, DollarSign, Send, Check
} from 'lucide-react';

export default function VendorOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [onboardingData, setOnboardingData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [showFreeShippingModal, setShowFreeShippingModal] = useState(false);
  const [showSalesWorkflowModal, setShowSalesWorkflowModal] = useState(false);
  const [ackFreeShipping, setAckFreeShipping] = useState(false);
  const [ackSalesWorkflow, setAckSalesWorkflow] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchOnboardingStatus();
  }, [user]);

  async function fetchOnboardingStatus() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_vendor_onboarding_status', {
        p_vendor_id: user!.id
      });

      if (error) throw error;
      setOnboardingData(data);
    } catch (err) {
      console.error('Error fetching onboarding status:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleMinimize = async () => {
    try {
      await supabase.rpc('toggle_onboarding_minimized', { p_minimized: true });
    } catch (err) {
      console.error('Error minimizing onboarding:', err);
    }
    navigate('/vendor');
  };

  const handleCtaClick = (step: any) => {
    if (step.ctaPath === 'action:free_shipping_modal') {
      setShowFreeShippingModal(true);
    } else if (step.ctaPath === 'action:sales_workflow_modal') {
      setShowSalesWorkflowModal(true);
    } else if (step.ctaPath) {
      navigate(step.ctaPath);
    }
  };

  const handleConfirmFreeShipping = async () => {
    if (!ackFreeShipping) return;
    setModalSaving(true);
    try {
      await supabase.rpc('acknowledge_onboarding_item', {
        p_item_type: 'free_shipping_rule',
        p_item_version: '1.0'
      });
      setShowFreeShippingModal(false);
      fetchOnboardingStatus();
    } catch (err) {
      console.error('Error acknowledging free shipping rule:', err);
    } finally {
      setModalSaving(false);
    }
  };

  const handleConfirmSalesWorkflow = async () => {
    if (!ackSalesWorkflow) return;
    setModalSaving(true);
    try {
      await supabase.rpc('acknowledge_onboarding_item', {
        p_item_type: 'sales_workflow',
        p_item_version: '1.0'
      });
      setShowSalesWorkflowModal(false);
      fetchOnboardingStatus();
    } catch (err) {
      console.error('Error acknowledging sales workflow:', err);
    } finally {
      setModalSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_vendor_onboarding_for_review');
      if (error) throw error;
      await fetchOnboardingStatus();
    } catch (err: any) {
      console.error('Error submitting onboarding for review:', err);
      alert('Error al enviar a revisión: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full" />
          <p className="text-xs text-gray-400 font-semibold tracking-wider uppercase">Cargando guía de primeros pasos...</p>
        </div>
      </div>
    );
  }

  const { completedSteps = 0, totalSteps = 7, percentage = 0, isComplete = false, status = 'onboarding', steps = [], adminNotes = '' } = onboardingData || {};

  const getStepIcon = (code: string) => {
    switch (code) {
      case 'store_profile': return Store;
      case 'payout_account': return CreditCard;
      case 'dispatch_address': return MapPin;
      case 'shipping_methods': return Truck;
      case 'free_shipping_rule': return Sparkles;
      case 'first_product': return Package;
      case 'sales_workflow': return HelpCircle;
      default: return CheckCircle2;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto space-y-8 pb-20">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-primary-500/20 text-primary-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-primary-500/40 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary-400" /> Guía de Configuración Inicial
              </span>
              <span className="text-xs font-mono text-gray-400">Paso a Paso</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Empezá a vender en Collectibles</h1>
            <p className="text-sm text-gray-400">
              Completá estos pasos para configurar tu tienda y comenzar a recibir pedidos.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleMinimize}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-bold rounded-xl transition-colors border border-gray-700 flex items-center gap-2"
            >
              <Minimize2 className="w-4 h-4" /> Minimizar Guía
            </button>
          </div>
        </div>

        {/* Global Progress Card */}
        <div className="bg-gradient-to-r from-gray-800 via-gray-850 to-gray-800 rounded-3xl p-6 sm:p-8 border border-gray-700 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Avance de Configuración</span>
              <h2 className="text-2xl font-black text-white">
                Configuración de tu tienda: <span className="text-primary-400">{completedSteps} de {totalSteps} pasos completados</span> · {percentage}%
              </h2>
            </div>

            <div className="text-right">
              {status === 'active' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/40 rounded-full text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" /> Tienda Aprobada & Activa
                </span>
              )}
              {status === 'pending_review' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full text-xs font-bold">
                  <Clock className="w-4 h-4 animate-pulse" /> En Revisión por Administración
                </span>
              )}
              {status === 'changes_required' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/40 rounded-full text-xs font-bold">
                  <AlertTriangle className="w-4 h-4" /> Cambios Solicitados por Admin
                </span>
              )}
              {status === 'onboarding' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded-full text-xs font-bold">
                  <Clock className="w-4 h-4" /> En Configuración
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="w-full bg-gray-900 rounded-full h-3 overflow-hidden p-0.5 border border-gray-700">
              <div
                className="bg-gradient-to-r from-primary-600 via-primary-500 to-pink-500 h-full rounded-full transition-all duration-500 shadow-lg shadow-primary-500/50"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* Special Banner Messages */}
          {status === 'pending_review' && (
            <div className="bg-amber-950/40 border border-amber-500/30 p-4 rounded-2xl text-xs text-amber-200 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-amber-300 font-bold mb-0.5">¡Información enviada a revisión!</strong>
                El equipo administrativo de Collectibles.uy está revisando tus datos de tienda, cuenta de cobro, dirección y primer producto. Te notificaremos una vez aprobada para habilitar la recepción de pedidos.
              </div>
            </div>
          )}

          {status === 'changes_required' && (
            <div className="bg-red-950/40 border border-red-500/30 p-4 rounded-2xl text-xs text-red-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-red-300 font-bold mb-0.5">La administración solicitó correcciones en tu tienda:</strong>
                <p className="text-gray-300 mt-1 italic font-sans bg-black/30 p-2.5 rounded-xl border border-red-500/20">
                  "{adminNotes || 'Revisá las tarjetas señaladas a continuación y corregí los datos correspondientes.'}"
                </p>
              </div>
            </div>
          )}

          {status === 'active' && (
            <div className="bg-green-950/40 border border-green-500/30 p-4 rounded-2xl text-xs text-green-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
                <div>
                  <strong className="block text-green-300 font-bold text-sm">¡Tu tienda está 100% pronta para vender!</strong>
                  Ya podés recibir compras, gestionar inventario y recibir pagos los miércoles.
                </div>
              </div>
              <button
                onClick={() => navigate('/vendor')}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shrink-0"
              >
                IR A MI PANEL VENDOR
              </button>
            </div>
          )}
        </div>

        {/* Step Cards List */}
        <div className="space-y-4">
          {steps.map((step: any) => {
            const StepIcon = getStepIcon(step.code);
            const isCompleted = step.status === 'completed';
            const isChangesRequired = step.status === 'changes_required';

            return (
              <div
                key={step.code}
                className={`bg-gray-800 rounded-3xl p-6 border transition-all shadow-lg ${
                  isCompleted 
                    ? 'border-green-500/30 bg-gray-800/90' 
                    : isChangesRequired
                    ? 'border-red-500/50 bg-red-950/20'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  
                  <div className="flex items-start gap-4 flex-1">
                    {/* Icon Box */}
                    <div className={`p-3.5 rounded-2xl shrink-0 flex items-center justify-center font-bold text-base ${
                      isCompleted 
                        ? 'bg-green-500/20 text-green-400 border border-green-500/40' 
                        : isChangesRequired
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    }`}>
                      {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <StepIcon className="w-6 h-6" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-gray-400">PASO {step.number}</span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                          step.badge === 'Obligatorio' 
                            ? 'bg-primary-500/20 text-primary-300 border-primary-500/40' 
                            : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                        }`}>
                          {step.badge}
                        </span>

                        {isCompleted && (
                          <span className="bg-green-500/20 text-green-400 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-green-500/30 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Completado
                          </span>
                        )}

                        {isChangesRequired && (
                          <span className="bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-500/30 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Corrección Requerida
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-black text-white">{step.title}</h3>
                      <p className="text-xs text-gray-300 leading-relaxed">{step.description}</p>

                      {/* Missing fields warning */}
                      {!isCompleted && step.missingFields && step.missingFields.length > 0 && (
                        <div className="pt-2 text-xs text-amber-400 space-y-1">
                          <span className="font-bold text-[11px] uppercase tracking-wider block text-gray-400">Falta completar:</span>
                          <ul className="list-disc list-inside space-y-0.5 text-gray-300 pl-1">
                            {step.missingFields.map((mf: string, idx: number) => (
                              <li key={idx}>{mf}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Admin rejection reason */}
                      {isChangesRequired && step.rejectionReason && (
                        <div className="pt-2 text-xs text-red-300 bg-red-950/50 p-2.5 rounded-xl border border-red-500/30">
                          <strong className="block font-bold">Observación del Administrador:</strong>
                          {step.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right CTA Button */}
                  <div className="shrink-0 flex items-center justify-end">
                    {isCompleted ? (
                      <button
                        onClick={() => handleCtaClick(step)}
                        className="px-4 py-2 bg-gray-700/80 hover:bg-gray-700 text-gray-200 text-xs font-bold rounded-xl transition-colors border border-gray-600 flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4 text-green-400" /> EDITAR DATOS
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCtaClick(step)}
                        className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-primary-500/20 flex items-center gap-2"
                      >
                        {step.ctaText} <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                </div>
              </div>
            );
          })}
        </div>

        {/* Final Submission Card */}
        {isComplete && status !== 'active' && status !== 'pending_review' && (
          <div className="bg-gradient-to-r from-primary-950 via-dark-900 to-primary-950 rounded-3xl p-8 border border-primary-500/50 shadow-2xl text-center space-y-4 animate-bounce-short">
            <div className="inline-flex p-3 bg-primary-500/20 text-primary-400 rounded-full border border-primary-500/40">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-white">¡Completaste los 7 pasos de tu tienda!</h3>
            <p className="text-sm text-gray-300 max-w-xl mx-auto">
              Tus datos de tienda, cuenta bancaria, dirección, envíos y primer producto están listos. Envía tu tienda a revisión administrativa para quedar habilitado para recibir ventas reales.
            </p>

            <div className="pt-2 flex justify-center">
              <button
                onClick={handleSubmitForReview}
                disabled={submitting}
                className="px-8 py-3.5 bg-primary-600 hover:bg-primary-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-primary-500/30 flex items-center gap-2"
              >
                <Send className="w-5 h-5" /> {submitting ? 'ENVIANDO A REVISIÓN...' : 'ENVIAR PARA REVISIÓN ADMINISTRATIVA'}
              </button>
            </div>
          </div>
        )}

      </div>

      {/* MODAL PASO 5: ENVÍO GRATIS */}
      {showFreeShippingModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-gray-900 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-primary-500/20 animate-fade-in">
            <div className="bg-gradient-to-r from-dark-900 to-primary-950 text-white p-6 relative">
              <button
                onClick={() => setShowFreeShippingModal(false)}
                className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="bg-primary-500/20 text-primary-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-primary-500/40 flex items-center gap-1 w-fit mb-2">
                <Sparkles className="w-3 h-3 text-primary-400" /> Regla Comercial Obligatoria
              </span>
              <h3 className="text-xl font-black text-white">Regla de Envío Gratis en Collectibles</h3>
            </div>

            <div className="p-6 space-y-4 text-xs text-gray-700 leading-relaxed">
              <div className="bg-primary-50 border border-primary-200 p-4 rounded-2xl space-y-2">
                <p className="font-bold text-primary-900 text-sm">
                  Envío gratis obligatorio desde UYU 1.500 en productos de tu propia tienda.
                </p>
                <p className="text-primary-800 text-xs">
                  El costo del courier será asumido por tu tienda y se calculará individualmente por Vendor.
                </p>
              </div>

              <ul className="space-y-2 text-gray-600 list-disc list-inside">
                <li>Aplica a compras donde la suma de tus productos supere UYU 1.500.</li>
                <li>Si el comprador agrega productos de otros vendors, cada tienda aplica su propio umbral.</li>
                <li>Garantiza transparencia y mayor tasa de conversión para tu tienda.</li>
              </ul>

              <label className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ackFreeShipping}
                  onChange={(e) => setAckFreeShipping(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer shrink-0"
                />
                <span className="font-semibold text-gray-800 text-xs">
                  Confirmo que he leído y acepto la regla de envío gratis desde UYU 1.500 para mi tienda.
                </span>
              </label>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowFreeShippingModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmFreeShipping}
                disabled={!ackFreeShipping || modalSaving}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all"
              >
                {modalSaving ? 'GUARDANDO...' : 'CONFIRMAR REGLA DE ENVÍO GRATIS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PASO 7: CÓMO FUNCIONA UNA VENTA */}
      {showSalesWorkflowModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-gray-900 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-primary-500/20 animate-fade-in">
            <div className="bg-gradient-to-r from-dark-900 to-primary-950 text-white p-6 relative">
              <button
                onClick={() => setShowSalesWorkflowModal(false)}
                className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="bg-blue-500/20 text-blue-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-blue-500/40 flex items-center gap-1 w-fit mb-2">
                <HelpCircle className="w-3 h-3 text-blue-400" /> Guía Operativa
              </span>
              <h3 className="text-xl font-black text-white">¿Cómo funciona una venta en Collectibles?</h3>
            </div>

            <div className="p-6 space-y-4 text-xs text-gray-700 max-h-[60vh] overflow-y-auto">
              {/* Flow Steps Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                  <span className="font-mono text-primary-600 font-bold text-xs">1. Compra & Pago Aprobado</span>
                  <p className="text-gray-600 text-[11px]">El comprador realiza la compra y se aprueba el pago en la plataforma.</p>
                </div>
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                  <span className="font-mono text-primary-600 font-bold text-xs">2. Notificación al Vendor</span>
                  <p className="text-gray-600 text-[11px]">Recibís el pedido en tu panel y se descuenta el stock de tu inventario.</p>
                </div>
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                  <span className="font-mono text-primary-600 font-bold text-xs">3. Empaque & Preparación</span>
                  <p className="text-gray-600 text-[11px]">Embalás el paquete con protección adecuada e imprimís la etiqueta de envío.</p>
                </div>
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                  <span className="font-mono text-primary-600 font-bold text-xs">4. Despacho & Tracking</span>
                  <p className="text-gray-600 text-[11px]">Entregás al courier seleccionado (DAC, SoyDelivery, Distrilogic) y registrás el número de seguimiento.</p>
                </div>
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                  <span className="font-mono text-primary-600 font-bold text-xs">5. Entrega al Cliente</span>
                  <p className="text-gray-600 text-[11px]">El paquete se entrega y el estado cambia automáticamente a Entregado.</p>
                </div>
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                  <span className="font-mono text-primary-600 font-bold text-xs">6. Liquidación Miércoles</span>
                  <p className="text-gray-600 text-[11px]">Collectibles liquida los fondos descontando la comisión del 5% a tu cuenta de cobro.</p>
                </div>
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                <strong className="block text-xs font-bold text-amber-950">REGLAS OPERATIVAS CLAVE:</strong>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800">
                  <li>No despachar pedidos en estado de pago pendiente.</li>
                  <li>Mantener tu inventario sincronizado para evitar cancelaciones.</li>
                  <li>Emitir factura o comprobante legal DGI según corresponda.</li>
                </ul>
              </div>

              <label className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ackSalesWorkflow}
                  onChange={(e) => setAckSalesWorkflow(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer shrink-0"
                />
                <span className="font-semibold text-gray-800 text-xs">
                  Entendí cómo funciona el flujo de venta, empaque, envío y liquidaciones en Collectibles.
                </span>
              </label>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowSalesWorkflowModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSalesWorkflow}
                disabled={!ackSalesWorkflow || modalSaving}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all"
              >
                {modalSaving ? 'GUARDANDO...' : 'ENTENDÍ CÓMO FUNCIONAN LAS VENTAS'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

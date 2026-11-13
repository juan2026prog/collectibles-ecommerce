import React, { useState } from 'react';
import { 
  FileText, Clock, CheckCircle2, AlertCircle, RefreshCw, 
  ExternalLink, ChevronRight, X, Image as ImageIcon, MessageSquare, ShieldCheck
} from 'lucide-react';

export interface CustomerRequestsTabProps {
  requests: any[];
  loading: boolean;
  onRefresh: () => void;
  formatRequestAmount: (amount: number, sourceCurrency?: string | null) => string;
}

export function mapRequestStatusBadge(status: string) {
  switch (status) {
    case 'REQUESTED':
    case 'UNDER_REVIEW':
      return {
        label: 'En revisión por Collectibles',
        desc: 'Tu solicitud fue recibida y está siendo evaluada por nuestro equipo de posventa.',
        color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        icon: Clock
      };
    case 'WAITING_VENDOR':
      return {
        label: 'Esperando respuesta del vendedor',
        desc: 'El vendedor asociado tiene tu caso asignado para coordinar la resolución.',
        color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        icon: Clock
      };
    case 'WAITING_SUPPLIER':
      return {
        label: 'Esperando al proveedor internacional',
        desc: 'Estamos confirmando el estado del pedido y flete con el operador exterior.',
        color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        icon: RefreshCw
      };
    case 'WAITING_RETURN':
      return {
        label: 'Esperando devolución del producto',
        desc: 'Tu solicitud fue autorizada. Por favor despachá el paquete o acércalo a nuestro punto de retiro.',
        color: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
        icon: RefreshCw
      };
    case 'RETURN_RECEIVED':
      return {
        label: 'Producto recibido en depósito',
        desc: 'El artículo ingresó a control de calidad para verificar su condición.',
        color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        icon: ShieldCheck
      };
    case 'APPROVED':
    case 'CANCELLATION_CONFIRMED':
      return {
        label: 'Cancelación aprobada',
        desc: 'La cancelación fue autorizada y se encuentra en trámite de reversión financiera.',
        color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        icon: CheckCircle2
      };
    case 'REFUND_PENDING':
    case 'REFUND_PROCESSING':
      return {
        label: 'Reembolso en proceso',
        desc: 'La pasarela de pago (Mercado Pago) está procesando la acreditación de tu dinero.',
        color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        icon: RefreshCw
      };
    case 'REFUNDED':
      return {
        label: 'Reembolso confirmado',
        desc: 'El dinero fue acreditado exitosamente en tu medio de pago.',
        color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        icon: CheckCircle2
      };
    case 'REJECTED':
      return {
        label: 'Solicitud no procedente',
        desc: 'El caso fue desestimado por política o falta de requisitos.',
        color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        icon: AlertCircle
      };
    case 'REFUND_FAILED':
      return {
        label: 'Fallo al reintegrar dinero',
        desc: 'Hubo una incidencia con la pasarela. El equipo administrativo intervendrá manualmente.',
        color: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
        icon: AlertCircle
      };
    case 'CLOSED':
      return {
        label: 'Gestión finalizada',
        desc: 'El caso fue cerrado.',
        color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
        icon: CheckCircle2
      };
    default:
      return {
        label: status || 'En proceso',
        desc: 'Caso registrado en sistema.',
        color: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
        icon: Clock
      };
  }
}

export function mapRequestTypeLabel(reqType: string) {
  if (reqType === 'handy_payment_review') return 'Verificación y cancelación de pago Handy';
  switch (reqType) {
    case 'cancel_immediate_10m':
      return 'Cancelación Inmediata (10 min)';
    case 'cancel_before_payment':
      return 'Cancelación de Pedido';
    case 'cancel_international_zinc':
      return 'Cancelación Internacional Pre-Compra';
    case 'cancel_vendor_policy':
      return 'Cancelación por Política de Vendedor';
    case 'legal_withdrawal':
      return 'Arrepentimiento / Desistimiento Legal';
    case 'voluntary_return':
      return 'Devolución Comercial';
    case 'defective_product':
      return 'Producto Defectuoso / Falla de Fábrica';
    case 'wrong_product':
      return 'Producto Equivocado Recibido';
    case 'damaged_in_transit':
      return 'Producto Dañado por Courier';
    case 'not_delivered':
      return 'Compra No Entregada';
    default:
      return reqType || 'Gestión de Posventa';
  }
}

export default function CustomerRequestsTab({
  requests,
  loading,
  onRefresh,
  formatRequestAmount
}: CustomerRequestsTabProps) {
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white/[0.02] border border-white/10 rounded-3xl text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
        <p className="text-xs font-bold text-slate-400">Cargando tus gestiones de posventa...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20">
              Centro de Resoluciones
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {requests.length} gestión{requests.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <h2 className="text-xl font-black text-white mt-1">Mis Gestiones</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Seguí el estado en tiempo real de tus cancelaciones, devoluciones y reclamos de posventa sin salir de tu cuenta.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-white/10 transition"
        >
          <RefreshCw className="w-4 h-4 text-rose-400" /> Actualizar
        </button>
      </div>

      {/* Lista de Solicitudes */}
      {requests.length === 0 ? (
        <div className="p-12 text-center bg-white/[0.02] border border-white/10 rounded-3xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-500">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No tenés gestiones activas ni reclamos</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Cuando inicies una cancelación o solicites una devolución sobre algún pedido, podrás seguir su evolución transparente desde esta sección.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const badge = mapRequestStatusBadge(req.status);
            const BadgeIcon = badge.icon;
            const typeLabel = mapRequestTypeLabel(req.request_type);
            const reqOrderNumber = req.order?.order_number || (req.order_id ? `#${req.order_id.slice(0, 8).toUpperCase()}` : 'Pedido');

            return (
              <div
                key={req.id}
                className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 rounded-2xl p-5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${badge.color}`}>
                      <BadgeIcon className="w-3 h-3" />
                      {badge.label}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      ID: {req.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      · {new Date(req.created_at).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white truncate flex items-center gap-2">
                    <span>{typeLabel}</span>
                    <span className="text-slate-500 font-normal">en</span>
                    <span className="font-mono text-rose-400">{reqOrderNumber}</span>
                  </h4>

                  <p className="text-xs text-slate-300 line-clamp-1">
                    Motivo: <span className="text-slate-400">{req.reason || 'Sin motivo detallado'}</span>
                  </p>

                  <p className="text-[11px] text-slate-500">
                    {badge.desc}
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-white/5">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Importe Involucrado</span>
                    <span className="text-sm font-black font-mono text-emerald-400">
                      {formatRequestAmount(Number(req.amount_approved ?? req.amount_requested ?? 0), req.currency ?? req.order?.currency)}
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedRequest(req)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 font-bold text-xs rounded-xl border border-rose-500/30 transition"
                  >
                    <span>Ver detalle</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Detalle de Gestión */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0e131f] border border-white/10 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                    Detalle de Gestión
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {new Date(selectedRequest.created_at).toLocaleString('es-UY')}
                  </span>
                </div>
                <h3 className="text-base font-black text-white mt-1">
                  {mapRequestTypeLabel(selectedRequest.request_type)}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-white/5 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Estado Badge */}
            {(() => {
              const b = mapRequestStatusBadge(selectedRequest.status);
              const Icon = b.icon;
              return (
                <div className={`p-3.5 rounded-2xl border ${b.color} space-y-1`}>
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Icon className="w-4 h-4" />
                    <span>Estado: {b.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {b.desc}
                  </p>
                </div>
              );
            })()}

            {/* Datos Técnicos y Montos */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-xs space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Código de solicitud:</span>
                <span className="text-white font-mono font-bold">{selectedRequest.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Orden asociada:</span>
                <span className="text-rose-400 font-mono font-bold">
                  {selectedRequest.order?.order_number || selectedRequest.order_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Modelo comercial:</span>
                <span className="text-white capitalize">{selectedRequest.business_model?.replace('_', ' ') || 'Nacional'}</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-2">
                <span className="text-slate-400">Monto solicitado:</span>
                <span className="text-white font-mono font-bold">
                  {formatRequestAmount(Number(selectedRequest.amount_requested ?? 0), selectedRequest.currency ?? selectedRequest.order?.currency)}
                </span>
              </div>
              {Number(selectedRequest.amount_approved) > 0 && (
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Monto autorizado / devuelto:</span>
                  <span className="font-mono">
                    {formatRequestAmount(Number(selectedRequest.amount_approved), selectedRequest.currency ?? selectedRequest.order?.currency)}
                  </span>
                </div>
              )}
            </div>

            {/* Motivo y Notas */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Motivo declarado:</label>
                <p className="text-white bg-white/5 p-3 rounded-xl border border-white/5">
                  {selectedRequest.reason || 'Sin detalles'}
                </p>
              </div>

              {selectedRequest.customer_notes && (
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Tus comentarios:</label>
                  <p className="text-slate-300 bg-white/5 p-3 rounded-xl border border-white/5">
                    {selectedRequest.customer_notes}
                  </p>
                </div>
              )}

              {selectedRequest.vendor_notes && (
                <div>
                  <label className="text-purple-400 font-bold block mb-1">Respuesta oficial del vendedor:</label>
                  <p className="text-slate-300 bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">
                    {selectedRequest.vendor_notes}
                  </p>
                </div>
              )}

              {/* Mensaje al cliente del equipo de soporte (sin exponer notas técnicas privadas) */}
              {selectedRequest.admin_notes && !selectedRequest.admin_notes.toLowerCase().startsWith('internal:') && !selectedRequest.admin_notes.toLowerCase().startsWith('[secret]') && (
                <div>
                  <label className="text-rose-400 font-bold block mb-1">Respuesta del equipo Collectibles:</label>
                  <p className="text-slate-300 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                    {selectedRequest.admin_notes}
                  </p>
                </div>
              )}
            </div>

            {/* Fotos de Evidencia */}
            {Array.isArray(selectedRequest.evidence_images) && selectedRequest.evidence_images.length > 0 && (
              <div>
                <label className="text-slate-400 font-bold block text-xs mb-1.5 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-rose-400" /> Evidencias adjuntas ({selectedRequest.evidence_images.length}):
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedRequest.evidence_images.map((imgPath: string, idx: number) => (
                    <div key={idx} className="p-2 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-300 font-mono">
                      Foto #{idx + 1}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

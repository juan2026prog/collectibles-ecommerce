import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../admin/Toast';
import { X, AlertCircle, Clock, ShieldCheck, Truck, RefreshCw, Upload, CheckCircle2 } from 'lucide-react';

interface ResolutionModalProps {
  order: any;
  suborder?: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function OrderResolutionModal({
  order,
  suborder,
  isOpen,
  onClose,
  onSuccess
}: ResolutionModalProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [requestType, setRequestType] = useState<string>('voluntary_return');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');

  if (!isOpen || !order) return null;

  // Determinar modelo
  const isInternational = Boolean(suborder?.is_international || order.is_international);
  const isVendor = Boolean(!isInternational && suborder && !suborder.is_collectibles_order && suborder.vendor_id);
  const isCollectiblesNational = !isInternational && !isVendor;

  // Ventana de 10 minutos para cancelación inmediata nacional
  const paymentDate = new Date(order.paid_at || order.created_at).getTime();
  const diffMinutes = (Date.now() - paymentDate) / (1000 * 60);
  const isWithin10m = isCollectiblesNational && ['paid', 'pagado'].includes(order.status) && diffMinutes <= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Por favor especifica el motivo.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        toast.error('Debes iniciar sesión para realizar esta solicitud.');
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
          suborderId: suborder?.id || null,
          requestType,
          reason,
          notes,
          evidenceImages
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar solicitud');
      }

      toast.success(data.message || 'Solicitud enviada correctamente');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddImage = () => {
    if (newImageUrl.trim() && !evidenceImages.includes(newImageUrl.trim())) {
      setEvidenceImages([...evidenceImages, newImageUrl.trim()]);
      setNewImageUrl('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-zinc-800/50">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-rose-500" />
              Gestión de Pedido #{order.order_number}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isCollectiblesNational && 'Collectibles Nacional (Stock Propio)'}
              {isVendor && `Vendido por Vendor: ${suborder?.vendor_store_name || 'Tercero'}`}
              {isInternational && 'Catálogo Internacional (Sourcing USA)'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Alerta de modelo comercial */}
          {isCollectiblesNational && isWithin10m && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl flex items-start gap-2.5 text-emerald-400">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Ventana de Cancelación Inmediata Activa:</strong>
                <p className="text-[11px] text-emerald-300 mt-0.5">
                  Han transcurrido {Math.floor(diffMinutes)} min desde tu pago. Puedes solicitar la cancelación inmediata con reversión directa a tu método de pago.
                </p>
              </div>
            </div>
          )}

          {isInternational && (
            <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-xl flex items-start gap-2.5 text-blue-400">
              <Truck className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Política Internacional (USA / Zinc):</strong>
                <p className="text-[11px] text-blue-300 mt-0.5">
                  Las compras internacionales se despachan al casillero en Miami. La cancelación está sujeta a la confirmación real de Amazon/Zinc antes de que sea despachado.
                </p>
              </div>
            </div>
          )}

          {/* Selector de Tipo de Solicitud */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1.5">Tipo de Solicitud:</label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-rose-500"
            >
              {isWithin10m && (
                <option value="cancel_immediate_10m">Cancelación Inmediata (Ventana 10 minutos)</option>
              )}
              {isInternational && (
                <option value="cancel_international_zinc">Solicitar Cancelación Internacional en Zinc</option>
              )}
              {isVendor && (
                <option value="cancel_vendor_policy">Cancelación según política del vendedor</option>
              )}
              <option value="legal_withdrawal">Derecho de Arrepentimiento Legal (5 días hábiles)</option>
              <option value="voluntary_return">Devolución Comercial Voluntaria</option>
              <option value="defective_product">Producto Defectuoso / Falla de Origen</option>
              <option value="wrong_product">Producto Equivocado Recibido</option>
              <option value="damaged_in_transit">Producto Dañado durante el Transporte</option>
            </select>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1.5">Motivo Principal:</label>
            <input
              type="text"
              placeholder="Ej: Embalaje dañado en transporte / Cancelación antes del envío"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Detalles adicionales */}
          <div>
            <label className="block text-zinc-300 font-semibold mb-1.5">Detalles / Explicación:</label>
            <textarea
              rows={3}
              placeholder="Describe lo ocurrido para agilizar la revisión..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Evidencia Fotográfica (Para daños o inspecciones) */}
          {['defective_product', 'wrong_product', 'damaged_in_transit'].includes(requestType) && (
            <div>
              <label className="block text-zinc-300 font-semibold mb-1.5">Fotos de Evidencia (Producto, Caja, Etiqueta Courier):</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="URL de la imagen (Supabase Storage o externa)"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder-zinc-500"
                />
                <button
                  type="button"
                  onClick={handleAddImage}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-medium"
                >
                  Agregar
                </button>
              </div>
              {evidenceImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {evidenceImages.map((img, i) => (
                    <div key={i} className="relative group w-12 h-12 rounded-lg overflow-hidden border border-white/20">
                      <img src={img} alt="Evidencia" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setEvidenceImages(evidenceImages.filter((_, idx) => idx !== i))}
                        className="absolute inset-0 bg-red-600/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmar Solicitud</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

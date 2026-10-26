import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../admin/Toast';
import { X, AlertCircle, Clock, ShieldCheck, Truck, RefreshCw, Upload, CheckCircle2, Package } from 'lucide-react';

interface ResolutionModalProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function OrderResolutionModal({
  order,
  isOpen,
  onClose,
  onSuccess
}: ResolutionModalProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Subórdenes / Selección granular para pedidos mixtos
  const suborders = order?.order_suborders || [];
  const [selectedSuborderId, setSelectedSuborderId] = useState<string>(
    suborders.length > 0 ? suborders[0].id : ''
  );

  const selectedSuborder = suborders.find((s: any) => s.id === selectedSuborderId) || suborders[0] || null;

  // Determinar modelo comercial de la selección de forma fiable:
  // Si los items de la orden contienen international_order_items -> Internacional
  const hasIntlItems = (order?.order_items || []).some((it: any) => 
    it.international_order_items && it.international_order_items.length > 0
  );
  const isInternational = hasIntlItems || Boolean(selectedSuborder?.is_international);
  const isVendor = Boolean(!isInternational && selectedSuborder && !selectedSuborder.is_collectibles_order && selectedSuborder.vendor_id);
  const isCollectiblesNational = !isInternational && !isVendor;

  const [requestType, setRequestType] = useState<string>('voluntary_return');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const [evidencePreviews, setEvidencePreviews] = useState<{ path: string; previewUrl: string }[]>([]);

  if (!isOpen || !order) return null;

  // Ventana de 10 minutos para cancelación inmediata nacional basada en fecha real de pago
  const approvedPayment = order.payments?.find((p: any) => p.status === 'approved');
  const realPaymentDateStr = approvedPayment?.created_at || order.paid_at;
  const paymentDate = realPaymentDateStr ? new Date(realPaymentDateStr).getTime() : 0;
  const diffMinutes = paymentDate > 0 ? (Date.now() - paymentDate) / (1000 * 60) : 999;
  const isWithin10m = isCollectiblesNational && ['paid', 'confirmed'].includes(order.status) && diffMinutes <= 10;

  // Subida segura de fotografías a Supabase Storage (Bucket Privado order-dispute-evidence)
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

      const { data, error } = await supabase.storage
        .from('order-dispute-evidence')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      // Generar Signed URL temporal de 24 horas para visualización segura sin bucket público
      // Generar Signed URL temporal solo para la vista previa local inmediata
      const { data: signData } = await supabase.storage
        .from('order-dispute-evidence')
        .createSignedUrl(filePath, 3600);

      // Guardar ruta permanente en el array de evidencias para la base de datos
      setEvidenceImages(prev => [...prev, filePath]);
      setEvidencePreviews(prev => [...prev, { path: filePath, previewUrl: signData?.signedUrl || '' }]);
      toast.success('Fotografía de evidencia subida y protegida correctamente.');
    } catch (uploadErr: any) {
      console.error('Error subiendo imagen privada:', uploadErr);
      toast.error('Error al subir imagen privada: ' + uploadErr.message);
    } finally {
      setUploadingImage(false);
    }
  };

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
          suborderId: selectedSuborder?.id || null,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-zinc-800/50">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-rose-500" />
              Gestión de Pedido #{order.order_number || order.id?.slice(0, 8)}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isCollectiblesNational && 'Collectibles Nacional (Stock Propio)'}
              {isVendor && `Vendido por Vendor: ${selectedSuborder?.vendor?.store_name || selectedSuborder?.vendor_store?.store_name || 'Vendedor Autorizado'}`}
              {isInternational && 'Catálogo Internacional (Sourcing USA vía Zinc)'}
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
          {/* Selector de Suborden en Pedidos Mixtos */}
          {suborders.length > 1 && (
            <div>
              <label className="block text-zinc-300 font-semibold mb-1.5 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-indigo-400" /> Seleccionar Paquete / Suborden a Gestionar:
              </label>
              <select
                value={selectedSuborderId}
                onChange={(e) => setSelectedSuborderId(e.target.value)}
                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-rose-500"
              >
                {suborders.map((sub: any, idx: number) => {
                  const sModel = sub.is_international ? 'Internacional' : (sub.is_collectibles_order ? 'Collectibles Nacional' : `Vendor: ${sub.vendor?.store_name || 'Vendedor'}`);
                  return (
                    <option key={sub.id} value={sub.id}>
                      Paquete #{idx + 1} — {sModel} (${sub.product_subtotal || 0} {order.currency || 'UYU'})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Alerta de modelo comercial */}
          {isCollectiblesNational && isWithin10m && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl flex items-start gap-2.5 text-emerald-400">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Ventana de Cancelación Inmediata Activa:</strong>
                <p className="text-[11px] text-emerald-300 mt-0.5">
                  Han transcurrido {Math.floor(diffMinutes)} min desde tu pago confirmado. Podés cancelar inmediatamente sin demoras administrativas.
                </p>
              </div>
            </div>
          )}

          {isInternational && (
            <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-xl flex items-start gap-2.5 text-blue-400">
              <Truck className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Política Internacional (USA / Zinc 2.0):</strong>
                <p className="text-[11px] text-blue-300 mt-0.5">
                  La cancelación está sujeta a la confirmación auténtica de detención en el proveedor (Amazon) antes de que sea despachado al casillero en Miami.
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

          {/* Carga de Fotografías Segura (Storage) */}
          {['defective_product', 'wrong_product', 'damaged_in_transit'].includes(requestType) && (
            <div>
              <label className="block text-zinc-300 font-semibold mb-1.5">
                Fotos de Evidencia (Producto, Caja, Etiqueta Courier):
              </label>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-xl flex items-center gap-2 text-white font-medium">
                  <Upload className="w-4 h-4 text-rose-400" />
                  <span>{uploadingImage ? 'Subiendo...' : 'Subir Fotografía'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={uploadingImage}
                    className="hidden"
                  />
                </label>
                <span className="text-[11px] text-zinc-400">Archivos JPG, PNG o WebP protegidos.</span>
              </div>

              {evidencePreviews.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {evidencePreviews.map((item, i) => (
                    <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-white/20">
                      <img src={item.previewUrl || '/placeholder.png'} alt="Evidencia" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setEvidenceImages(prev => prev.filter(p => p !== item.path));
                          setEvidencePreviews(prev => prev.filter((_, idx) => idx !== i));
                        }}
                        className="absolute inset-0 bg-red-600/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      >
                        <X className="w-4 h-4" />
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

import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Loader2, 
  Download, 
  ExternalLink,
  HelpCircle,
  FileText
} from 'lucide-react';

export interface InternationalReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string;
  internationalOrderItemId?: string;
  zincOrderId?: string;
  currentPurchaseStatus?: string;
  onSuccess?: () => void;
}

const RETURN_REASONS = [
  { value: 'no_longer_needed', label: 'Cancelación del cliente / Ya no es necesario' },
  { value: 'wrong_item', label: 'Producto equivocado entregado por el retailer' },
  { value: 'damaged', label: 'Producto dañado / roto en el casillero' },
  { value: 'defective', label: 'Producto defectuoso / no funciona' },
  { value: 'not_as_described', label: 'No coincide con la descripción del producto' },
  { value: 'forced_cancellation', label: 'Cancelación forzada por el comercio' },
  { value: 'other', label: 'Otro motivo' },
];

export default function InternationalReturnModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  internationalOrderItemId,
  zincOrderId,
  currentPurchaseStatus,
  onSuccess,
}: InternationalReturnModalProps) {
  const [reason, setReason] = useState<string>('no_longer_needed');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('zinc-create-return', {
        body: {
          order_id: orderId,
          international_order_item_id: internationalOrderItemId,
          reason,
          notes: notes.trim() || undefined,
        },
      });

      if (fnErr) {
        throw new Error(fnErr.message || 'Error al comunicarse con la función de devolución.');
      }

      if (!data?.success && data?.error) {
        throw new Error(data.error);
      }

      setSuccessData(data.return_request);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error inesperado al solicitar la devolución.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-transparent border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">
                Solicitud de Devolución en Miami (RMA)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Orden {orderNumber ? `#${orderNumber}` : orderId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Policy Notice */}
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Política de Devolución Exclusiva en Miami
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              La devolución solo aplica mientras el paquete se encuentra en el casillero en Miami antes de ser despachado a Uruguay. 
              Zinc y el retailer proporcionarán las etiquetas prepagas en EE.UU. para enviar el paquete de regreso.
            </p>
            {currentPurchaseStatus && (
              <p className="text-xs font-mono text-amber-900 dark:text-amber-200">
                Estado actual: <strong>{currentPurchaseStatus}</strong>
              </p>
            )}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successData ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  Devolución Registrada en Zinc con Éxito
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Estado en Zinc: <span className="font-bold uppercase">{successData.status}</span>
                </p>
                {successData.zinc_return_id && (
                  <p className="text-xs font-mono text-emerald-900 dark:text-emerald-200">
                    ID RMA: {successData.zinc_return_id}
                  </p>
                )}
              </div>

              {/* Labels */}
              {Array.isArray(successData.label_urls) && successData.label_urls.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Etiquetas de Envío Prepago (EE.UU.):
                  </label>
                  <div className="space-y-2">
                    {successData.label_urls.map((url: string, idx: number) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-sky-600 dark:text-sky-400 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Etiqueta de Retorno #{idx + 1} (PDF)
                        </span>
                        <Download className="w-4 h-4" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Las etiquetas de devolución se generarán en breve y se actualizarán automáticamente vía Webhook.
                </p>
              )}

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-xs font-bold transition-all shadow-md"
                >
                  Entendido / Cerrar
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Motivo de la Devolución (Oficial Zinc API V2)
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all disabled:opacity-50"
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Notas explicativas para el casillero / Zinc (Opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={loading}
                  rows={3}
                  placeholder="Ej: Cliente canceló su pedido antes de la consolidación en Miami. Solicitar retorno inmediato a Amazon."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all resize-none disabled:opacity-50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white text-xs font-bold shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando en Zinc...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      Confirmar Devolución en Miami
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

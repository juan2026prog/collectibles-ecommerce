import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Info, CheckCircle, ExternalLink, X, FileText, Sparkles } from 'lucide-react';

interface VendorTermsReminderModalProps {
  doc: any;
  onDismiss: () => void;
}

export default function VendorTermsReminderModal({ doc, onDismiss }: VendorTermsReminderModalProps) {
  const navigate = useNavigate();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleUnderstand = async () => {
    if (dontShowAgain && doc?.id) {
      setSaving(true);
      try {
        await supabase.rpc('dismiss_vendor_terms_notice', {
          p_legal_document_id: doc.id
        });
      } catch (err) {
        console.error('Error saving notice dismissal preference:', err);
      } finally {
        setSaving(false);
      }
    }
    onDismiss();
  };

  const handleViewFullTerms = () => {
    onDismiss();
    navigate('/vendor?tab=settings&sub=terms');
  };

  const effectiveDateFormatted = doc?.effective_at
    ? new Date(doc.effective_at).toLocaleDateString('es-UY', { year: 'numeric', month: 'long', day: 'numeric' })
    : '5 de Agosto de 2026';

  return (
    <div className="fixed inset-0 z-40 bg-dark-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-primary-500/20 animate-fade-in my-8">
        
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-dark-900 via-primary-950 to-dark-900 p-6 text-white border-b border-primary-500/30 flex items-start justify-between relative">
          <div className="space-y-1 pr-6">
            <div className="flex items-center gap-2">
              <span className="bg-primary-500/20 text-primary-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-primary-500/40 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary-400" /> Recordatorio Operativo
              </span>
              <span className="text-xs font-mono text-gray-400">Versión {doc?.version || '1.0'}</span>
            </div>
            <h3 className="text-xl font-black text-white tracking-tight">
              Condiciones importantes para operar tu tienda
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              Recordá que al vender en Collectibles aceptaste los Términos y Condiciones para Vendors. Revisá especialmente las reglas de comisión, liquidaciones, stock, facturación, envíos y devoluciones.
            </p>
          </div>

          <button
            onClick={onDismiss}
            title="Cerrar aviso por esta sesión"
            className="p-1.5 bg-dark-800/80 hover:bg-dark-700 text-gray-400 hover:text-white rounded-full transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compact Visual Summary Grid */}
        <div className="p-6 bg-gray-50 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700">
            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-2.5">
              <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Comisión 5%</p>
                <p className="text-[11px] text-gray-500">Sobre valor de productos vendidos.</p>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-2.5">
              <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Liquidaciones Miércoles</p>
                <p className="text-[11px] text-gray-500">Pagos periódicos por ventas entregadas.</p>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-2.5">
              <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Envío Gratis &gt; UYU 1.500</p>
                <p className="text-[11px] text-gray-500">Por tienda. Costo asumido por Vendor.</p>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-2.5">
              <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-gray-900">SoyDelivery / Flex (Cuenta Propia)</p>
                <p className="text-[11px] text-gray-500">Credenciales de API propias obligatorias.</p>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-2.5">
              <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-gray-900">DAC & Distrilogic</p>
                <p className="text-[11px] text-gray-500">Tarifa estándar o cuenta propia.</p>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-2.5">
              <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Responsabilidad DGI & Stock</p>
                <p className="text-[11px] text-gray-500">Facturación directa y garantía del producto.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
            <span>Versión: <strong className="text-gray-800">{doc?.version || '1.0'}</strong></span>
            <span>Vigente desde: <strong className="text-gray-800">{effectiveDateFormatted}</strong></span>
          </div>
        </div>

        {/* Footer controls */}
        <div className="bg-white px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs font-medium text-gray-800">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
            />
            <span>No mostrar nuevamente este aviso para la versión {doc?.version || '1.0'}.</span>
          </label>

          <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
            <button
              onClick={handleViewFullTerms}
              className="px-4 py-2 text-xs font-bold text-gray-700 hover:text-primary-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <FileText className="w-4 h-4" /> VER TÉRMINOS COMPLETOS
            </button>

            <button
              onClick={handleUnderstand}
              disabled={saving}
              className="px-6 py-2 text-xs font-black uppercase tracking-wider text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all shadow-md shadow-primary-500/20 flex items-center justify-center gap-1.5"
            >
              {saving ? 'GUARDANDO...' : 'ENTENDIDO'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

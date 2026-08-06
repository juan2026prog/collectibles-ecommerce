import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, LogOut, ExternalLink, Printer, CheckCircle, FileText, AlertCircle, RefreshCw } from 'lucide-react';

interface VendorTermsAcceptanceProps {
  onAccepted?: () => void;
}

export default function VendorTermsAcceptance({ onAccepted }: VendorTermsAcceptanceProps) {
  const { signOut, user } = useAuth();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchActiveTerms();
  }, []);

  async function fetchActiveTerms() {
    setLoading(true);
    setError(null);
    try {
      // Fetch via RPC or fallback select
      const { data: rpcDoc, error: rpcErr } = await supabase.rpc('get_active_vendor_terms');
      if (!rpcErr && rpcDoc) {
        setDoc(rpcDoc);
      } else {
        const { data, error: selectErr } = await supabase
          .from('legal_documents')
          .select('*')
          .eq('document_type', 'vendor_terms')
          .eq('is_active', true)
          .order('effective_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (selectErr) throw selectErr;
        if (!data) throw new Error('No se encontró un documento legal activo.');
        setDoc(data);
      }
    } catch (err: any) {
      console.error('Error al cargar Términos y Condiciones:', err);
      setError(err.message || 'Error al obtener los términos vigentes.');
    } finally {
      setLoading(false);
    }
  }

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Allow a 20px threshold for bottom detection
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setHasScrolledToBottom(true);
    }
  };

  const handleAccept = async () => {
    if (!isChecked || !hasScrolledToBottom || !doc) return;

    setAccepting(true);
    setError(null);

    try {
      const userAgent = window.navigator.userAgent;
      const deviceMeta = {
        platform: window.navigator.platform,
        language: window.navigator.language,
        screen: `${window.screen.width}x${window.screen.height}`,
      };

      const { data, error: rpcError } = await supabase.rpc('accept_vendor_terms', {
        p_document_id: doc.id,
        p_user_agent: userAgent,
        p_device_metadata: deviceMeta,
        p_source: 'vendor_first_login'
      });

      if (rpcError) throw rpcError;

      if (data && data.success) {
        if (onAccepted) {
          onAccepted();
        } else {
          window.location.reload();
        }
      } else {
        throw new Error('La respuesta de aceptación no fue confirmada.');
      }
    } catch (err: any) {
      console.error('Error al aceptar Términos y Condiciones:', err);
      setError('Error al registrar la aceptación: ' + (err.message || 'Intente nuevamente.'));
    } finally {
      setAccepting(false);
    }
  };

  const handleOpenNewTab = () => {
    if (!doc) return;
    const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-dark-900/95 backdrop-blur-md flex flex-col items-center justify-center p-4 text-white">
        <div className="animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mb-4" />
        <p className="text-sm font-semibold tracking-wide text-gray-300">Cargando Términos y Condiciones vigentes...</p>
      </div>
    );
  }

  if (error && !doc) {
    return (
      <div className="fixed inset-0 z-50 bg-dark-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h3 className="text-xl font-bold text-gray-900">Error de Configuración Legal</h3>
          <p className="text-sm text-gray-600">{error}</p>
          <div className="pt-4 flex flex-col gap-2">
            <button
              onClick={fetchActiveTerms}
              className="w-full py-2.5 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Reintentar
            </button>
            <button
              onClick={() => signOut()}
              className="w-full py-2.5 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  const effectiveFormatted = doc?.effective_at
    ? new Date(doc.effective_at).toLocaleDateString('es-UY', { year: 'numeric', month: 'long', day: 'numeric' })
    : '5 de Agosto de 2026';

  return (
    <div className="fixed inset-0 z-50 bg-dark-900/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200 animate-fade-in">
        
        {/* Header (Non-closeable) */}
        <div className="bg-gradient-to-r from-dark-900 via-dark-800 to-primary-950 text-white p-6 border-b border-dark-700 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-primary-600/30 text-primary-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-primary-500/30">
                Requerimiento Obligatorio
              </span>
              <span className="text-xs font-mono text-gray-400">Versión {doc?.version || '1.0'}</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">Antes de comenzar</h2>
            <p className="text-xs text-gray-300">
              Para activar tu tienda, necesitás leer y aceptar los Términos y Condiciones para Vendedores de Collectibles.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenNewTab}
              title="Abrir en nueva pestaña"
              className="p-2 bg-dark-800 hover:bg-dark-700 text-gray-300 hover:text-white rounded-lg transition-colors border border-dark-700 text-xs font-semibold flex items-center gap-1.5"
            >
              <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">Nueva pestaña</span>
            </button>
            <button
              onClick={handlePrint}
              title="Imprimir o guardar como PDF"
              className="p-2 bg-dark-800 hover:bg-dark-700 text-gray-300 hover:text-white rounded-lg transition-colors border border-dark-700 text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Imprimir</span>
            </button>
          </div>
        </div>

        {/* Document Metadata Bar */}
        <div className="bg-gray-50 px-6 py-2.5 border-b border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-600 font-medium gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary-600" />
            <span className="font-bold text-gray-800">{doc?.title || 'Términos y Condiciones para Vendedores'}</span>
          </div>
          <div>Vigencia: <span className="font-semibold text-gray-800">{effectiveFormatted}</span></div>
        </div>

        {/* Main Document Content Area (Scrollable) */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 bg-white space-y-4">
          {!hasScrolledToBottom && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              Por favor, desplazate hasta el final del documento para habilitar la casilla de aceptación.
            </div>
          )}

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto max-h-[380px] p-5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 space-y-4 leading-relaxed font-sans scrollbar-thin scrollbar-thumb-gray-300"
          >
            <div className="whitespace-pre-line font-sans">
              {doc?.content}
            </div>

            {/* UX Summary Card at bottom of scroll content */}
            <div className="mt-8 pt-6 border-t border-gray-300 bg-white p-5 rounded-xl border shadow-sm space-y-3">
              <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" /> Resumen de Condiciones Clave
              </h4>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs text-gray-700">
                <li className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="font-bold text-primary-700">• Comisión del 5%:</span> Sobre ventas brutas procesadas en la plataforma.
                </li>
                <li className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="font-bold text-primary-700">• Liquidaciones semanales:</span> Transferencias los días miércoles por ventas entregadas.
                </li>
                <li className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="font-bold text-primary-700">• Envío Gratis UYU 1.500:</span> Aplica por tienda y el costo bonificado es a cargo del vendor.
                </li>
                <li className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="font-bold text-primary-700">• SoyDelivery / Flex:</span> Cuenta propia del vendor obligatoria con despacho propio.
                </li>
                <li className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="font-bold text-primary-700">• DAC / Distrilogic:</span> Integración estándar DAC o uso de cuenta corporativa propia.
                </li>
                <li className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <span className="font-bold text-primary-700">• Responsabilidad legal:</span> El vendor responde por stock, autenticidad y facturación DGI.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Error message banner */}
        {error && (
          <div className="mx-6 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 font-bold">&times;</button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <label className={`flex items-center gap-3 cursor-pointer select-none text-xs font-medium ${!hasScrolledToBottom ? 'opacity-50 cursor-not-allowed text-gray-400' : 'text-gray-900'}`}>
            <input
              type="checkbox"
              disabled={!hasScrolledToBottom || accepting}
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              className="w-5 h-5 text-primary-600 rounded border-gray-300 focus:ring-primary-500 disabled:opacity-50 cursor-pointer"
            />
            <span>
              He leído y acepto los Términos y Condiciones para Vendedores de Collectibles, versión {doc?.version || '1.0'}.
            </span>
          </label>

          <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
            <button
              onClick={() => signOut()}
              disabled={accepting}
              className="px-4 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> CERRAR SESIÓN
            </button>

            <button
              onClick={handleAccept}
              disabled={!isChecked || !hasScrolledToBottom || accepting}
              className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-primary-500/20 flex items-center justify-center gap-2"
            >
              {accepting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  REGISTRANDO...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" /> ACEPTAR Y ACTIVAR MI TIENDA
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

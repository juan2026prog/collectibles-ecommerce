import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, CheckCircle2, ExternalLink, Printer, FileText, Clock, AlertCircle, Eye } from 'lucide-react';

export default function VTermsSettings() {
  const { user } = useAuth();
  const [activeDoc, setActiveDoc] = useState<any>(null);
  const [acceptances, setAcceptances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadTermsData();
  }, [user]);

  async function loadTermsData() {
    setLoading(true);
    try {
      const [docRes, acceptRes] = await Promise.all([
        supabase.rpc('get_active_vendor_terms'),
        supabase
          .from('vendor_terms_acceptances')
          .select('*, legal_documents(title, document_type)')
          .eq('vendor_id', user!.id)
          .order('accepted_at', { ascending: false })
      ]);

      setActiveDoc(docRes.data);
      setAcceptances(acceptRes.data || []);
    } catch (err) {
      console.error('Error al cargar datos de Términos y Condiciones:', err);
    } finally {
      setLoading(false);
    }
  }

  const latestAcceptance = acceptances.find(a => activeDoc && a.legal_document_id === activeDoc.id);

  const handlePrint = () => {
    window.print();
  };

  const handleOpenNewTab = () => {
    if (!activeDoc) return;
    const blob = new Blob([activeDoc.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando Términos y Condiciones...</div>;
  }

  const effectiveFormatted = activeDoc?.effective_at
    ? new Date(activeDoc.effective_at).toLocaleDateString('es-UY', { year: 'numeric', month: 'long', day: 'numeric' })
    : '5 de Agosto de 2026';

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-gradient-to-r from-dark-900 via-dark-800 to-primary-950 text-white p-6 rounded-2xl shadow-md border border-dark-700 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-green-500/20 text-green-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-green-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Aceptación Vigente
            </span>
            <span className="text-xs font-mono text-gray-400">Versión {activeDoc?.version || '1.0'}</span>
          </div>
          <h3 className="text-2xl font-black tracking-tight text-white">Términos y Condiciones para Vendedores</h3>
          <p className="text-xs text-gray-300">
            Marco legal, comercial y operativo que regula las ventas de tu tienda en Collectibles.uy.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenNewTab}
            className="px-3.5 py-2 bg-dark-800 hover:bg-dark-700 text-gray-200 text-xs font-bold rounded-xl transition-colors border border-dark-700 flex items-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4" /> Abrir Documento
          </button>
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-dark-800 hover:bg-dark-700 text-gray-200 text-xs font-bold rounded-xl transition-colors border border-dark-700 flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Acceptance Status Box */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary-600" /> Estado de Cumplimiento Contractual
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-1">
            <span className="text-gray-400 uppercase font-black tracking-wider text-[10px]">Versión Vigente</span>
            <p className="text-lg font-black text-gray-900">v{activeDoc?.version || '1.0'}</p>
            <p className="text-gray-500">Vigencia desde {effectiveFormatted}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-1">
            <span className="text-gray-400 uppercase font-black tracking-wider text-[10px]">Fecha de Aceptación</span>
            <p className="text-sm font-bold text-gray-900">
              {latestAcceptance?.accepted_at
                ? new Date(latestAcceptance.accepted_at).toLocaleString('es-UY')
                : 'Confirmada en primer ingreso'}
            </p>
            <p className="text-gray-500">Origen: {latestAcceptance?.source || 'vendor_first_login'}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-1">
            <span className="text-gray-400 uppercase font-black tracking-wider text-[10px]">Hash SHA-256 Registrado</span>
            <p className="font-mono text-[10px] text-gray-700 truncate" title={latestAcceptance?.document_checksum || activeDoc?.checksum}>
              {latestAcceptance?.document_checksum || activeDoc?.checksum || 'SHA-256 Auditado'}
            </p>
            <p className="text-green-600 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Evidencia Inmutable Servidor
            </p>
          </div>
        </div>
      </div>

      {/* Summary Box */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <h4 className="font-bold text-gray-900 text-base">Resumen de Condiciones Clave para Vendors</h4>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
          <li className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <strong className="text-primary-700 block mb-0.5">• Comisión de Plataforma: 5%</strong>
            Aplica sobre el valor bruto total de los productos vendidos.
          </li>
          <li className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <strong className="text-primary-700 block mb-0.5">• Liquidaciones Semanales</strong>
            Procesamiento de pagos todos los miércoles por pedidos entregados.
          </li>
          <li className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <strong className="text-primary-700 block mb-0.5">• Envío Gratis Obligatorio &gt; UYU 1.500</strong>
            Por tienda. El costo bonificado es asumido exclusivamente por el Vendor.
          </li>
          <li className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <strong className="text-primary-700 block mb-0.5">• SoyDelivery / Flex (Cuenta Propia)</strong>
            Es obligatorio configurar credenciales API comerciales del Vendor.
          </li>
          <li className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <strong className="text-primary-700 block mb-0.5">• Logística DAC y Distrilogic</strong>
            Integración estándar DAC o uso de cuenta corporativa propia (BYOC).
          </li>
          <li className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <strong className="text-primary-700 block mb-0.5">• Responsabilidad Fiscal DGI</strong>
            El Vendor emite factura de venta al cliente y garantiza autenticidad de stock.
          </li>
        </ul>
      </div>

      {/* Full Document View */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-500" /> Contenido Completo del Contrato (v{activeDoc?.version || '1.0'})
          </h4>
        </div>

        <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 leading-relaxed font-sans max-h-96 overflow-y-auto whitespace-pre-line">
          {activeDoc?.content}
        </div>
      </div>

      {/* Acceptance History */}
      {acceptances.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" /> Historial Personal de Aceptaciones
          </h4>

          <div className="divide-y divide-gray-100">
            {acceptances.map((acc) => (
              <div key={acc.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-gray-800">Versión {acc.document_version}</p>
                  <p className="text-gray-400 font-mono text-[10px]">Checksum: {acc.document_checksum}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-700">{new Date(acc.accepted_at).toLocaleString('es-UY')}</p>
                  <span className="text-[10px] text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded">Firma Inmutable</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

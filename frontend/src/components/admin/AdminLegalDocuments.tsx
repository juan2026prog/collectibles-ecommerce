import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, ShieldCheck, Clock, Plus, Eye, CheckCircle2, AlertTriangle, Search, Download, RefreshCw, FileCode, RotateCcw, EyeOff } from 'lucide-react';
import { useToast } from './Toast';
import { useConfirmModal } from './ConfirmModal';

export default function AdminLegalDocuments() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [acceptances, setAcceptances] = useState<any[]>([]);
  const [noticePreferences, setNoticePreferences] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'compliance' | 'versions'>('compliance');
  const [searchTerm, setSearchTerm] = useState('');
  
  // New document version state
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [newTitle, setNewTitle] = useState('Términos y Condiciones para Vendedores de Collectibles');
  const [newContent, setNewContent] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Evidence detail modal
  const [selectedEvidence, setSelectedEvidence] = useState<any | null>(null);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [docsRes, acceptRes, prefRes, vendorsRes] = await Promise.all([
        supabase.from('legal_documents').select('*').order('created_at', { ascending: false }),
        supabase.from('vendor_terms_acceptances').select('*, profiles:accepted_by(email, first_name, last_name)').order('accepted_at', { ascending: false }),
        supabase.from('vendor_notice_preferences').select('*'),
        supabase.from('vendors').select('*, profiles:id(email, first_name, last_name)').order('created_at', { ascending: false })
      ]);

      setDocuments(docsRes.data || []);
      setAcceptances(acceptRes.data || []);
      setNoticePreferences(prefRes.data || []);
      setVendors(vendorsRes.data || []);
    } catch (err: any) {
      console.error('Error fetching legal documents and audit data:', err);
      toast.error('Error al cargar datos legales: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Calculate SHA-256 hex string in browser
  async function calculateChecksum(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function handlePublishNewVersion(e: React.FormEvent) {
    e.preventDefault();
    if (!newVersion || !newTitle || !newContent) {
      toast.error('Todos los campos son obligatorios.');
      return;
    }

    if (!(await confirm(`¿Estás seguro de que deseas publicar la versión ${newVersion}? Todos los vendedores deberán aceptar nuevamente antes de operar.`))) {
      return;
    }

    setPublishing(true);
    try {
      const checksum = await calculateChecksum(newContent);

      // Deactivate all previous vendor_terms
      await supabase
        .from('legal_documents')
        .update({ is_active: false })
        .eq('document_type', 'vendor_terms');

      // Insert new active version
      const { data, error } = await supabase
        .from('legal_documents')
        .insert({
          document_type: 'vendor_terms',
          version: newVersion,
          title: newTitle,
          content: newContent,
          checksum: checksum,
          is_active: true,
          acceptance_required: true,
          effective_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`Versión ${newVersion} publicada exitosamente.`);
      setShowNewVersionModal(false);
      setNewVersion('');
      setNewContent('');
      fetchData();
    } catch (err: any) {
      console.error('Error al publicar nueva versión legal:', err);
      toast.error('Error al publicar: ' + err.message);
    } finally {
      setPublishing(false);
    }
  }

  async function handleResetNotice(vendorId: string, legalDocId: string, storeName: string) {
    if (!(await confirm(`¿Estás seguro de que deseas restablecer el aviso informativo para el vendedor "${storeName}"? Volverá a mostrarse en su próximo ingreso sin alterar su firma legal.`))) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc('reset_vendor_terms_notice', {
        p_vendor_id: vendorId,
        p_legal_document_id: legalDocId
      });

      if (error) throw error;

      toast.success(`Recordatorio restablecido para ${storeName}`);
      fetchData();
    } catch (err: any) {
      console.error('Error al restablecer recordatorio:', err);
      toast.error('Error al restablecer: ' + err.message);
    }
  }

  const activeDoc = documents.find(d => d.document_type === 'vendor_terms' && d.is_active);

  // Map compliance status per vendor
  const complianceData = vendors.map(v => {
    const latestAcceptance = acceptances.find(a => a.vendor_id === v.id);
    const noticePref = noticePreferences.find(p => p.vendor_id === v.id && activeDoc && p.legal_document_id === activeDoc.id && p.notice_type === 'vendor_terms_reminder');
    
    let complianceStatus: 'accepted' | 'pending' | 'requires_reacceptance' = 'pending';

    if (latestAcceptance) {
      if (activeDoc && latestAcceptance.legal_document_id === activeDoc.id) {
        complianceStatus = 'accepted';
      } else {
        complianceStatus = 'requires_reacceptance';
      }
    }

    return {
      vendor: v,
      latestAcceptance,
      noticePref,
      complianceStatus
    };
  });

  const filteredCompliance = complianceData.filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const storeName = (item.vendor.store_name || '').toLowerCase();
    const email = (item.vendor.profiles?.email || '').toLowerCase();
    return storeName.includes(term) || email.includes(term);
  });

  const maskIp = (ip?: string) => {
    if (!ip) return '—';
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
    return ip.slice(0, 8) + '***';
  };

  const exportComplianceCsv = () => {
    const headers = ['Vendor ID', 'Tienda', 'Email', 'Estado Cumplimiento', 'Aviso Informativo', 'Versión Aceptada', 'Fecha Aceptación', 'IP Enmascarada', 'Versión Vigente'];
    const rows = complianceData.map(c => [
      c.vendor.id,
      `"${c.vendor.store_name || ''}"`,
      `"${c.vendor.profiles?.email || ''}"`,
      c.complianceStatus,
      c.noticePref?.dismissed ? 'Ocultado por Vendor' : 'Visible en Próximo Ingreso',
      c.latestAcceptance?.document_version || 'N/A',
      c.latestAcceptance?.accepted_at ? new Date(c.latestAcceptance.accepted_at).toLocaleString('es-UY') : 'N/A',
      maskIp(c.latestAcceptance?.ip_address),
      activeDoc?.version || 'N/A'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `auditoria_terminos_vendors_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary-600" /> Documentos Legales & Términos Vendor
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Gestión de versiones contractuales, trazabilidad inmutable y auditoría de aceptaciones de Vendedores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (activeDoc) {
                setNewVersion((parseFloat(activeDoc.version) + 0.1).toFixed(1));
                setNewContent(activeDoc.content);
              } else {
                setNewVersion('1.0');
              }
              setShowNewVersionModal(true);
            }}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm rounded-xl transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Publicar Nueva Versión
          </button>
          <button
            onClick={fetchData}
            className="p-2 text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-xl transition-colors"
            title="Refrescar datos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Version Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Versión Vigente</span>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-gray-900">v{activeDoc?.version || '1.0'}</span>
            <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Activa
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate" title={activeDoc?.title}>
            {activeDoc?.title || 'Términos y Condiciones para Vendedores'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Vendors Registrados</span>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-gray-900">{vendors.length}</span>
            <span className="text-xs font-bold text-gray-500">100% Auditados</span>
          </div>
          <p className="text-xs text-gray-500">Trazabilidad con Hash SHA-256 e IP</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Tasa de Cumplimiento</span>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-primary-600">
              {vendors.length > 0
                ? `${Math.round((complianceData.filter(c => c.complianceStatus === 'accepted').length / vendors.length) * 100)}%`
                : '100%'}
            </span>
            <span className="text-xs font-bold text-gray-500">
              {complianceData.filter(c => c.complianceStatus === 'accepted').length} / {vendors.length}
            </span>
          </div>
          <p className="text-xs text-gray-500">Versión vigente aceptada</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex items-center justify-between">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('compliance')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'compliance'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Auditoría de Cumplimiento ({vendors.length})
          </button>
          <button
            onClick={() => setActiveTab('versions')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'versions'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <FileCode className="w-4 h-4" /> Historial de Versiones ({documents.length})
          </button>
        </div>

        {activeTab === 'compliance' && (
          <button
            onClick={exportComplianceCsv}
            className="mb-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Registro CSV
          </button>
        )}
      </div>

      {/* Tab 1: Compliance Audit */}
      {activeTab === 'compliance' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por tienda o email de vendor..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400">Cargando registros de cumplimiento...</div>
            ) : filteredCompliance.length === 0 ? (
              <div className="p-12 text-center text-gray-400">No se encontraron vendedores registrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left divide-y divide-gray-200">
                  <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Tienda / Vendor</th>
                      <th className="px-6 py-3">Usuario / Email</th>
                      <th className="px-6 py-3">Firma Legal</th>
                      <th className="px-6 py-3">Aviso Informativo</th>
                      <th className="px-6 py-3">Versión Aceptada</th>
                      <th className="px-6 py-3">Fecha de Aceptación</th>
                      <th className="px-6 py-3">IP (Enmascarada)</th>
                      <th className="px-6 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {filteredCompliance.map(({ vendor: v, latestAcceptance: acc, noticePref, complianceStatus }) => (
                      <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-gray-900">{v.store_name}</td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-600">{v.profiles?.email || '—'}</td>
                        <td className="px-6 py-4">
                          {complianceStatus === 'accepted' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Aceptado
                            </span>
                          )}
                          {complianceStatus === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                              <Clock className="w-3.5 h-3.5" /> Pendiente
                            </span>
                          )}
                          {complianceStatus === 'requires_reacceptance' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                              <AlertTriangle className="w-3.5 h-3.5" /> Requiere Nueva Versión
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {noticePref?.dismissed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                              <EyeOff className="w-3.5 h-3.5 text-gray-400" /> Ocultado por Vendor
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Eye className="w-3.5 h-3.5 text-indigo-500" /> Visible en Próximo Ingreso
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-bold">
                          {acc ? `v${acc.document_version}` : 'Ninguna'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          {acc?.accepted_at ? new Date(acc.accepted_at).toLocaleString('es-UY') : '—'}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-400">
                          {maskIp(acc?.ip_address)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {acc && (
                              <button
                                onClick={() => setSelectedEvidence({ ...acc, vendor: v, noticePref })}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" /> Evidencia
                              </button>
                            )}
                            {activeDoc && noticePref?.dismissed && (
                              <button
                                onClick={() => handleResetNotice(v.id, activeDoc.id, v.store_name)}
                                title="Volver a mostrar el aviso informativo en el próximo ingreso del Vendor"
                                className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Restablecer Recordatorio
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Version History */}
      {activeTab === 'versions' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <div key={doc.id} className="p-6 flex flex-wrap items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-gray-900">Versión {doc.version}</span>
                    {doc.is_active ? (
                      <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-black uppercase rounded-full">Activa Vigente</span>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-black uppercase rounded-full">Histórica</span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-gray-800">{doc.title}</h4>
                  <p className="text-xs text-gray-400 font-mono">Checksum SHA-256: {doc.checksum}</p>
                  <p className="text-xs text-gray-500">
                    Vigencia: {new Date(doc.effective_at).toLocaleDateString('es-UY')} · Creado: {new Date(doc.created_at).toLocaleString('es-UY')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" /> Previsualizar Documento
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal 1: New Version Creator */}
      {showNewVersionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FileCode className="w-5 h-5 text-primary-600" /> Publicar Nueva Versión de Términos Vendor
              </h3>
              <button onClick={() => setShowNewVersionModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
            </div>

            <form onSubmit={handlePublishNewVersion} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Versión *</label>
                  <input
                    type="text"
                    required
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    placeholder="Ej: 1.1 o 2.0"
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Título del Documento *</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Contenido de los Términos (Markdown) *</label>
                <textarea
                  required
                  rows={14}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono leading-relaxed focus:ring-2 focus:ring-primary-500"
                  placeholder="Ingrese el contrato contractual completo..."
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Al publicar esta versión, la anterior quedará inactiva y **todos los vendedores registrados deberán aceptarla en su próximo ingreso**.
              </div>

              <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewVersionModal(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={publishing}
                  className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-primary-500/20"
                >
                  {publishing ? 'Publicando...' : 'Publicar Versión Obligatoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Evidence Viewer */}
      {selectedEvidence && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-600" /> Registro Inmutable de Evidencia Legal
              </h3>
              <button onClick={() => setSelectedEvidence(null)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
            </div>

            <div className="space-y-3 text-xs text-gray-700">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-1">
                <p className="font-bold text-gray-900">Vendedor: {selectedEvidence.vendor?.store_name}</p>
                <p className="text-gray-500">Email: {selectedEvidence.profiles?.email}</p>
                <p className="text-gray-500">ID Vendor: <span className="font-mono">{selectedEvidence.vendor_id}</span></p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-gray-500">Versión Contractual:</span>
                  <span className="font-bold font-mono text-gray-900">v{selectedEvidence.document_version}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-gray-500">Fecha y Hora Servidor:</span>
                  <span className="font-semibold text-gray-900">{new Date(selectedEvidence.accepted_at).toLocaleString('es-UY')}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-gray-500">Dirección IP de Origen:</span>
                  <span className="font-mono text-gray-900">{selectedEvidence.ip_address || 'Registrada por servidor'}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-gray-500">Origen de Transacción:</span>
                  <span className="font-semibold text-gray-900">{selectedEvidence.source}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="font-bold text-gray-500">Estado del Aviso Informativo:</span>
                  <span className="font-bold text-gray-900">
                    {selectedEvidence.noticePref?.dismissed ? `Ocultado el ${new Date(selectedEvidence.noticePref.dismissed_at).toLocaleDateString('es-UY')}` : 'Visible'}
                  </span>
                </div>
              </div>

              <div>
                <span className="font-bold text-gray-500 block mb-1">Checksum SHA-256 del Contenido:</span>
                <p className="bg-gray-900 text-green-400 p-2.5 rounded-lg font-mono text-[10px] break-all select-all">
                  {selectedEvidence.document_checksum}
                </p>
              </div>

              <div>
                <span className="font-bold text-gray-500 block mb-1">User Agent & Dispositivo:</span>
                <p className="bg-gray-100 p-2 rounded text-[10px] font-mono text-gray-600 break-all">
                  {selectedEvidence.user_agent}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedEvidence(null)}
                className="px-4 py-2 bg-gray-900 text-white font-bold text-xs rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Document Preview */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{previewDoc.title}</h3>
                <span className="text-xs font-mono text-gray-500">Versión {previewDoc.version}</span>
              </div>
              <button onClick={() => setPreviewDoc(null)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 text-sm text-gray-800 whitespace-pre-line leading-relaxed font-sans bg-gray-50">
              {previewDoc.content}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end bg-white">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-gray-900 text-white font-bold text-xs rounded-xl"
              >
                Cerrar Previsualización
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

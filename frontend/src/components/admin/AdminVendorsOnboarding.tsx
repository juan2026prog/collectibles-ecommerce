import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from './Toast';
import { useConfirmModal } from './ConfirmModal';
import { 
  Store, CheckCircle2, Clock, AlertTriangle, Eye, RefreshCw, 
  Search, Check, X, ShieldCheck, CreditCard, MapPin, Truck, Sparkles, Package, HelpCircle, MessageSquare
} from 'lucide-react';

export default function AdminVendorsOnboarding() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null);
  const [vendorOnbStatus, setVendorOnbStatus] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Admin Review Form State
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectedStepsMap, setRejectedStepsMap] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchVendors();
  }, []);

  async function fetchVendors() {
    setLoading(true);
    try {
      // Fetch vendors with profiles & onboarding progress
      const { data: vendorList, error } = await supabase
        .from('vendors')
        .select(`
          *,
          profiles:id(email, first_name, last_name),
          vendor_onboarding_progress(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVendors(vendorList || []);
    } catch (err: any) {
      console.error('Error fetching vendors for onboarding review:', err);
      toast.error('Error al cargar vendedores: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openReviewModal(vendor: any) {
    setSelectedVendor(vendor);
    setLoadingDetails(true);
    setAdminNotes('');
    setRejectedStepsMap({});

    try {
      const { data } = await supabase.rpc('get_vendor_onboarding_status', {
        p_vendor_id: vendor.id
      });
      setVendorOnbStatus(data);
    } catch (err: any) {
      console.error('Error loading vendor onboarding status:', err);
      toast.error('Error al cargar evaluación de onboarding.');
    } finally {
      setLoadingDetails(false);
    }
  }

  const handleApprove = async () => {
    if (!selectedVendor) return;
    if (!(await confirm(`¿Estás seguro de que deseas APROBAR la tienda "${selectedVendor.store_name}"? La cuenta pasará a estado ACTIVA y podrá recibir ventas reales.`))) {
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase.rpc('admin_review_vendor_onboarding', {
        p_vendor_id: selectedVendor.id,
        p_action: 'approve',
        p_notes: adminNotes || 'Tienda aprobada para ventas.'
      });

      if (error) throw error;
      toast.success(`Tienda "${selectedVendor.store_name}" aprobada exitosamente.`);
      setSelectedVendor(null);
      fetchVendors();
    } catch (err: any) {
      console.error('Error approving vendor:', err);
      toast.error('Error al aprobar tienda: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!selectedVendor) return;
    if (Object.keys(rejectedStepsMap).length === 0) {
      toast.error('Debes seleccionar al menos un paso e indicar el motivo de corrección.');
      return;
    }

    if (!(await confirm(`¿Estás seguro de solicitar correcciones a la tienda "${selectedVendor.store_name}"?`))) {
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase.rpc('admin_review_vendor_onboarding', {
        p_vendor_id: selectedVendor.id,
        p_action: 'request_changes',
        p_notes: adminNotes || 'Revisá los detalles de corrección solicitados.',
        p_rejected_steps: rejectedStepsMap
      });

      if (error) throw error;
      toast.success(`Correcciones solicitadas a "${selectedVendor.store_name}".`);
      setSelectedVendor(null);
      fetchVendors();
    } catch (err: any) {
      console.error('Error requesting changes:', err);
      toast.error('Error al solicitar cambios: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const filteredVendors = vendors.filter(v => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const store = (v.store_name || '').toLowerCase();
    const email = (v.profiles?.email || '').toLowerCase();
    return store.includes(term) || email.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Store className="w-7 h-7 text-primary-600" /> Revisión & Aprobación de Onboarding Vendor
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Evaluación de los 7 pasos de configuración inicial para habilitar tiendas para la venta de productos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchVendors}
            className="p-2 text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-xl transition-colors"
            title="Refrescar vendedores"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por tienda o email..."
          className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Vendors Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Cargando vendedores...</div>
        ) : filteredVendors.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No se encontraron vendedores.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left divide-y divide-gray-200">
              <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                <tr>
                  <th className="px-6 py-3">Tienda / Vendor</th>
                  <th className="px-6 py-3">Email de Usuario</th>
                  <th className="px-6 py-3">Estado Comercial</th>
                  <th className="px-6 py-3">Progreso Onboarding</th>
                  <th className="px-6 py-3">Enviado a Revisión</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {filteredVendors.map((v) => {
                  const onbProg = v.vendor_onboarding_progress?.[0];
                  const onbStatus = onbProg?.status || v.status || 'onboarding';

                  return (
                    <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">{v.store_name}</td>
                      <td className="px-6 py-4 text-xs font-mono text-gray-600">{v.profiles?.email || '—'}</td>
                      <td className="px-6 py-4">
                        {onbStatus === 'active' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activo (Ventas Habilitadas)
                          </span>
                        )}
                        {onbStatus === 'pending_review' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 animate-pulse">
                            <Clock className="w-3.5 h-3.5" /> Pendiente de Revisión
                          </span>
                        )}
                        {onbStatus === 'changes_required' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5" /> Cambios Solicitados
                          </span>
                        )}
                        {onbStatus === 'onboarding' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                            <Clock className="w-3.5 h-3.5" /> En Configuración
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-bold text-gray-800">
                          {onbProg?.status === 'active' ? '7 / 7 pasos (100%)' : 'Auditado por RPC'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {onbProg?.submitted_for_review_at ? new Date(onbProg.submitted_for_review_at).toLocaleString('es-UY') : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openReviewModal(v)}
                          className="px-3.5 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 border border-primary-200 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
                        >
                          <Eye className="w-4 h-4" /> Revisar Configuración
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal Drawer */}
      {selectedVendor && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-primary-600 uppercase tracking-wider block">Auditoría de Onboarding</span>
                <h3 className="text-xl font-bold text-gray-900">Revisión de Tienda: {selectedVendor.store_name}</h3>
              </div>
              <button onClick={() => setSelectedVendor(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingDetails || !vendorOnbStatus ? (
                <div className="p-8 text-center text-gray-400">Evaluando datos reales del vendedor...</div>
              ) : (
                <>
                  {/* Progress Header */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-400 uppercase font-bold block">Progreso Técnico</span>
                      <p className="text-lg font-black text-gray-900">
                        {vendorOnbStatus.completedSteps} de {vendorOnbStatus.totalSteps} pasos completados ({vendorOnbStatus.percentage}%)
                      </p>
                    </div>
                    <div className="w-36 bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div className="bg-primary-600 h-full rounded-full" style={{ width: `${vendorOnbStatus.percentage}%` }} />
                    </div>
                  </div>

                  {/* 7 Steps Overview */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-gray-900 text-sm">Evaluación Técnica de Pasos Obligatorios:</h4>
                    {vendorOnbStatus.steps.map((st: any) => (
                      <div key={st.code} className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">Paso {st.number}: {st.title}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              st.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {st.status === 'completed' ? 'Válido' : 'Pendiente'}
                            </span>
                          </div>
                        </div>

                        {st.missingFields && st.missingFields.length > 0 && (
                          <p className="text-red-600 font-semibold text-[11px]">
                            Campos faltantes: {st.missingFields.join(', ')}
                          </p>
                        )}

                        {/* Rejected Step Selector */}
                        <div className="pt-2 border-t border-gray-200 flex items-start gap-2">
                          <input
                            type="checkbox"
                            id={`rej_${st.code}`}
                            checked={!!rejectedStepsMap[st.code]}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setRejectedStepsMap({ ...rejectedStepsMap, [st.code]: 'Por favor revisá y corregí esta sección.' });
                              } else {
                                const copy = { ...rejectedStepsMap };
                                delete copy[st.code];
                                setRejectedStepsMap(copy);
                              }
                            }}
                            className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          />
                          <label htmlFor={`rej_${st.code}`} className="font-bold text-gray-700 cursor-pointer">
                            Solicitar corrección específica en este paso
                          </label>
                        </div>

                        {rejectedStepsMap[st.code] !== undefined && (
                          <input
                            type="text"
                            value={rejectedStepsMap[st.code]}
                            onChange={(e) => setRejectedStepsMap({ ...rejectedStepsMap, [st.code]: e.target.value })}
                            placeholder="Indicar motivo de corrección para el Vendor..."
                            className="w-full p-2 bg-white border border-gray-300 rounded-lg text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* General Admin Notes */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-700">Observaciones Generales del Administrador</label>
                    <textarea
                      rows={3}
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Escribí aquí sugerencias o comentarios para el Vendor..."
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => setSelectedVendor(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded-xl"
              >
                Cancelar
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleRequestChanges}
                  disabled={processing}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-4 h-4" /> Solicitar Correcciones
                </button>

                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Aprobar Tienda (Activar Ventas)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

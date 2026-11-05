import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  ShieldCheck, Clock, CheckCircle2, AlertCircle, RefreshCw, 
  MessageSquare, ChevronRight, X, FileText, ArrowRight
} from 'lucide-react';

export default function VIncidents() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);
  const [vendorNotes, setVendorNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadVendorRequests = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Obtener el vendor_id correspondiente al usuario logueado
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id, store_name')
        .eq('user_id', user.id)
        .maybeSingle();

      const vendorId = vendor?.id || user.id;

      // 2. Consultar unified_order_requests para este vendor
      const { data, error } = await supabase
        .from('unified_order_requests')
        .select(`
          *,
          order:orders(id, order_number, total_amount, status),
          suborder:order_suborders(id, suborder_number, product_subtotal)
        `)
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err: any) {
      console.error('Error fetching vendor unified requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVendorRequests();
  }, [user]);

  const handleUpdateNotes = async () => {
    if (!selectedReq || !vendorNotes.trim()) return;
    setSavingNotes(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { data, error } = await supabase.rpc('update_vendor_request_notes', {
        p_request_id: selectedReq.id,
        p_vendor_notes: vendorNotes.trim()
      });

      if (error) throw error;

      setSuccessMsg('Respuesta registrada correctamente.');
      await loadVendorRequests();
      setSelectedReq((prev: any) => ({ ...prev, vendor_notes: vendorNotes.trim() }));
    } catch (err: any) {
      console.error('Error saving vendor notes:', err);
      setErrorMsg(err.message || 'Error al guardar respuesta.');
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <div className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-2">Posventa & Garantías</div>
          <h2 className="text-4xl font-black text-gray-900">Gestiones de Devolución y Reclamos</h2>
          <p className="text-sm text-gray-500 font-bold mt-2 uppercase tracking-[0.1em]">
            Reclamos y solicitudes de compradores asignadas a tus productos
          </p>
        </div>

        <button
          onClick={loadVendorRequests}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition"
        >
          <RefreshCw className="w-4 h-4 text-primary-600" /> Actualizar Casos
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-gray-400">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-primary-500" />
            <p className="font-bold text-xs">Cargando solicitudes de compradores...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-16 text-center text-gray-400 space-y-2">
            <ShieldCheck className="w-12 h-12 mx-auto text-emerald-400 mb-2" />
            <h3 className="text-base font-bold text-gray-800">Sin incidencias ni reclamos pendientes</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Todas las ventas están al día. Cuando un comprador inicie una devolución o solicitud sobre tus productos, aparecerá aquí para tu intervención formal.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  <th className="p-6">ID / Fecha</th>
                  <th className="p-6">Pedido / Suborden</th>
                  <th className="p-6">Tipo</th>
                  <th className="p-6 text-right">Monto</th>
                  <th className="p-6">Estado</th>
                  <th className="p-6">Motivo Declarado</th>
                  <th className="p-6 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {requests.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-6">
                      <div className="font-mono font-bold text-gray-900">{req.id.slice(0, 8).toUpperCase()}</div>
                      <div className="text-[11px] text-gray-400">{new Date(req.created_at).toLocaleDateString('es-UY')}</div>
                    </td>
                    <td className="p-6">
                      <div className="font-bold text-gray-900">{req.order?.order_number || req.order_id?.slice(0, 8)}</div>
                      <div className="text-[11px] text-gray-400 font-mono">{req.suborder?.suborder_number}</div>
                    </td>
                    <td className="p-6 font-semibold capitalize text-gray-800">
                      {req.request_type?.replace(/_/g, ' ')}
                    </td>
                    <td className="p-6 text-right font-mono font-bold text-gray-900">
                      ${Number(req.amount_requested || 0).toFixed(2)} {req.currency || 'UYU'}
                    </td>
                    <td className="p-6">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        req.status === 'WAITING_VENDOR' ? 'bg-amber-100 text-amber-800' :
                        req.status === 'REFUNDED' ? 'bg-emerald-100 text-emerald-800' :
                        req.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="p-6 max-w-xs truncate text-gray-600 font-medium" title={req.reason}>
                      {req.reason}
                    </td>
                    <td className="p-6 text-right">
                      <button
                        onClick={() => {
                          setSelectedReq(req);
                          setVendorNotes(req.vendor_notes || '');
                          setErrorMsg('');
                          setSuccessMsg('');
                        }}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl text-xs transition"
                      >
                        Responder Caso
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Responder Solicitud Vendor */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-5 border border-gray-100">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary-600">
                  Gestión #{selectedReq.id.slice(0, 8).toUpperCase()}
                </span>
                <h3 className="text-base font-black text-gray-900 mt-0.5">
                  Respuesta Oficial de Vendedor
                </h3>
              </div>
              <button onClick={() => setSelectedReq(null)} className="p-1 rounded-lg text-gray-400 hover:text-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Motivo del Comprador:</span>
                <span className="font-bold text-gray-900">{selectedReq.reason}</span>
              </div>
              {selectedReq.customer_notes && (
                <div>
                  <span className="text-gray-500 block mb-0.5">Detalles del Comprador:</span>
                  <p className="text-gray-700 bg-white p-2.5 rounded-xl border border-gray-200">{selectedReq.customer_notes}</p>
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-bold text-gray-700 block">
                Tu dictamen / instrucción de logística de retorno:
              </label>
              <textarea
                rows={4}
                value={vendorNotes}
                onChange={e => setVendorNotes(e.target.value)}
                placeholder="Indica si aceptas la devolución, el procedimiento para recibir el artículo o tu respuesta al reclamo..."
                className="w-full p-3 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-[11px] text-gray-400">
                Esta respuesta quedará visible para el comprador y el equipo de Collectibles.
              </p>
            </div>

            {errorMsg && <p className="text-xs text-red-600 font-bold">{errorMsg}</p>}
            {successMsg && <p className="text-xs text-emerald-600 font-bold">{successMsg}</p>}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setSelectedReq(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-xs font-bold"
              >
                Cerrar
              </button>
              <button
                onClick={handleUpdateNotes}
                disabled={savingNotes}
                className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
              >
                {savingNotes ? 'Guardando...' : 'Enviar Respuesta Oficial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

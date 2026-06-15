import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Truck, Search, FileText, Download, ExternalLink, Printer, 
  RefreshCw, Package, CheckCircle, Clock 
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import ShipmentLabelModal from '../ShipmentLabelModal';

export default function AdminLogisticsLabels() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProvider, setFilterProvider] = useState('all');
  const { toast } = useToast();

  // Modal State
  const [selectedSuborderId, setSelectedSuborderId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'label' | 'slip'>('label');

  useEffect(() => {
    fetchShipments();
  }, []);

  async function fetchShipments() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select(`
          *,
          suborder:order_suborders (
            id,
            suborder_number,
            shipping_method,
            shipping_provider,
            vendor_id,
            vendors (
              id,
              store_name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setShipments(data || []);
    } catch (err: any) {
      console.error('Error fetching admin shipments:', err.message);
      toast.error('Error al cargar etiquetas logísticas: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerateShipment(s: any) {
    if (!window.confirm("¿Estás seguro de que deseas regenerar esta etiqueta? Se eliminará el registro actual y se recreará.")) return;
    
    const subId = s.suborder_id || s.suborder?.id;
    if (!subId) {
      toast.error("No se encontró ID de suborden para regenerar.");
      return;
    }

    try {
      // 1. Delete shipment record
      const { error: delErr } = await supabase
        .from('shipments')
        .delete()
        .eq('id', s.id);
      
      if (delErr) throw delErr;

      // 2. Invoke appropriate edge function based on provider
      const provider = s.provider_key?.toLowerCase();
      if (provider === 'dac') {
        const { error: invokeErr } = await supabase.functions.invoke('dac-create-shipment', {
          body: { order_id: subId }
        });
        if (invokeErr) throw invokeErr;
      } else if (provider === 'ues') {
        const { error: invokeErr } = await supabase.functions.invoke('ues-create-shipment', {
          body: { order_id: subId }
        });
        if (invokeErr) throw invokeErr;
      } else if (provider === 'soydelivery') {
        const { error: invokeErr } = await supabase.functions.invoke('soydelivery-sync', {
          body: { order_id: subId }
        });
        if (invokeErr) throw invokeErr;
      } else {
        // For other methods, deleting is enough; the next viewing will create a new label automatically
        toast.success("Etiqueta manual restablecida. Se recreará al abrir el visualizador.");
      }

      toast.success("Etiqueta regenerada con éxito.");
      fetchShipments();
    } catch (err: any) {
      console.error("Error regenerating shipment:", err.message);
      toast.error("Error al regenerar etiqueta: " + err.message);
    }
  }

  function handleOpenModal(suborderId: string, tab: 'label' | 'slip') {
    setModalTab(tab);
    setSelectedSuborderId(suborderId);
  }

  // Filtering
  const filteredShipments = shipments.filter(s => {
    const term = search.toLowerCase();
    const matchesSearch = 
      (s.tracking_code?.toLowerCase().includes(term)) ||
      (s.customer_name?.toLowerCase().includes(term)) ||
      (s.suborder?.suborder_number?.toLowerCase().includes(term)) ||
      (s.order_id?.toLowerCase().includes(term)) ||
      (s.suborder?.vendors?.store_name?.toLowerCase().includes(term));
      
    const matchesProvider = filterProvider === 'all' || s.provider_key === filterProvider;

    return matchesSearch && matchesProvider;
  });

  // Unique list of providers for filter dropdown
  const providers = Array.from(new Set(shipments.map(s => s.provider_key).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex-1 flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por tracking, suborden, cliente o vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Provider Filter */}
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los Operadores</option>
            {providers.map(p => (
              <option key={p} value={p}>{p.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={fetchShipments}
          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors flex items-center gap-1.5 text-xs font-bold self-start md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Etiqueta / Suborden</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Courier</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tracking</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">PDF Oficial</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Etiqueta Collectibles</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Packing Slip</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">Cargando envíos...</td></tr>
              ) : filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                    <p className="font-semibold text-sm">No se encontraron envíos.</p>
                  </td>
                </tr>
              ) : (
                filteredShipments.map(s => {
                  const subId = s.suborder_id || s.suborder?.id;
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      {/* Etiqueta / Suborden */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-gray-900 text-sm">
                          {s.suborder?.suborder_number || `ORDER-${s.order_id?.slice(0, 8).toUpperCase()}`}
                        </div>
                        <div className="text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{s.customer_name}</div>
                      </td>

                      {/* Courier */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-semibold text-gray-700 capitalize">{s.provider_key}</span>
                        <div className="text-[10px] text-gray-500 capitalize">{s.suborder?.shipping_method || 'Standard'}</div>
                      </td>

                      {/* Tracking */}
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-sm font-bold text-slate-700">
                        {s.tracking_code || '-'}
                      </td>

                      {/* Vendor */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {s.suborder?.vendors?.store_name || <span className="text-gray-400 italic">Desconocido</span>}
                      </td>

                      {/* PDF Oficial */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {s.shipping_label_url ? (
                          <a 
                            href={s.shipping_label_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 font-bold text-xs px-2.5 py-1 rounded hover:bg-blue-100 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> PDF Oficial
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No disponible</span>
                        )}
                      </td>

                      {/* Etiqueta Collectibles */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {subId ? (
                          <button
                            onClick={() => handleOpenModal(subId, 'label')}
                            className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-2.5 py-1 rounded transition-colors shadow-sm"
                          >
                            <Printer className="w-3.5 h-3.5" /> Impresora
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Sin suborden</span>
                        )}
                      </td>

                      {/* Packing Slip */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {subId ? (
                          <button
                            onClick={() => handleOpenModal(subId, 'slip')}
                            className="inline-flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs px-2.5 py-1 rounded transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5 text-slate-500" /> Packing Slip
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Sin suborden</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-6 py-4 whitespace-nowrap text-center text-xs space-x-1">
                        {subId && (
                          <>
                            <button
                              onClick={() => handleOpenModal(subId, 'label')}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded transition-colors"
                            >
                              Reimprimir
                            </button>
                            <button
                              onClick={() => handleRegenerateShipment(s)}
                              className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2 py-1 rounded transition-colors"
                            >
                              Regenerar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shipment Modal */}
      {selectedSuborderId && (
        <ShipmentLabelModal
          suborderId={selectedSuborderId}
          initialTab={modalTab}
          onClose={() => {
            setSelectedSuborderId(null);
            fetchShipments();
          }}
        />
      )}
    </div>
  );
}

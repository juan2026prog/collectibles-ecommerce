// frontend/src/components/vendor/VEnvios.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/admin/Toast';
import { 
  Truck, Package, AlertCircle, CheckCircle2, ChevronRight, X, Clock, HelpCircle, 
  Download, Printer, RefreshCw, Eye, Search, ExternalLink, MapPin
} from 'lucide-react';
import ShipmentLabelModal from '../ShipmentLabelModal';

interface Shipment {
  id: string;
  order_id: string;
  suborder_id: string;
  provider_key: string;
  tracking_code: string | null;
  internal_reference: string;
  shipping_status: string;
  shipping_label_url: string | null;
  package_number: number;
  total_packages: number;
  created_at: string;
  guide_created_at: string | null;
  suborder?: {
    suborder_number: string;
    shipping_method: string;
    shipping_provider: string;
    observations: string | null;
    order_items: {
      products: { title: string } | null;
      quantity: number;
    }[];
  };
}

export default function VEnvios({ activeStoreId }: { activeStoreId?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [eventsMap, setEventsMap] = useState<Record<string, any>>({});
  
  // Filtering & UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courierFilter, setCourierFilter] = useState('all');
  
  // Detail Modals
  const [selectedLabelSuborderId, setSelectedLabelSuborderId] = useState<string | null>(null);
  const [selectedTimelineShipment, setSelectedTimelineShipment] = useState<Shipment | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // KPIs
  const [kpis, setKpis] = useState({
    total: 0,
    preparando: 0,
    enCola: 0,
    enTransito: 0,
    entregados: 0,
    conError: 0,
    avgDespachoHrs: 0,
    mainCourier: 'N/A',
    pendingLabel: 0
  });

  const loadShipments = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch shipments for suborders belonging to this vendor
      const { data, error } = await supabase
        .from('shipments')
        .select(`
          *,
          suborder:order_suborders!inner(
            id, suborder_number, vendor_id, shipping_method, shipping_provider, observations,
            order_items(quantity, products(title))
          )
        `)
        .eq('suborder.vendor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list: Shipment[] = (data || []).map((s: any) => ({
        ...s,
        suborder: {
          suborder_number: s.suborder?.suborder_number,
          shipping_method: s.suborder?.shipping_method,
          shipping_provider: s.suborder?.shipping_provider,
          observations: s.suborder?.observations,
          order_items: Array.isArray(s.suborder?.order_items) ? s.suborder.order_items : []
        }
      }));

      setShipments(list);

      // 2. Fetch latest event per shipment in parallel to display in the table
      if (list.length > 0) {
        const shipIds = list.map(s => s.id);
        const { data: latestEvents } = await supabase
          .from('shipment_events')
          .select('shipment_id, event_type, description, created_at')
          .in('shipment_id', shipIds)
          .order('created_at', { ascending: true }); // Earliest first so we can map latest below
        
        const map: Record<string, any> = {};
        if (latestEvents) {
          latestEvents.forEach(e => {
            map[e.shipment_id] = e; // Overwrites so we get the last one chronologically
          });
        }
        setEventsMap(map);
      }

      // 3. Compute KPIs
      let preparando = 0;
      let enCola = 0;
      let enTransito = 0;
      let entregados = 0;
      let conError = 0;
      let pendingLabel = 0;
      let dispatchTimesSum = 0;
      let dispatchTimesCount = 0;
      const courierCounts: Record<string, number> = {};

      list.forEach(s => {
        const status = s.shipping_status;
        if (status === 'draft' || status === 'pending_real_tracking') preparando++;
        else if (status === 'queued' || status === 'processing') enCola++;
        else if (status === 'in_transit' || status === 'picked_up' || status === 'out_for_delivery') enTransito++;
        else if (status === 'delivered') entregados++;
        else if (status === 'failed') conError++;

        if (status === 'created' && !s.shipping_label_url) pendingLabel++;

        const courier = s.provider_key || 'unknown';
        courierCounts[courier] = (courierCounts[courier] || 0) + 1;

        if (s.guide_created_at) {
          const diff = new Date(s.guide_created_at).getTime() - new Date(s.created_at).getTime();
          dispatchTimesSum += Math.max(0, diff);
          dispatchTimesCount++;
        }
      });

      // Find main courier
      let mainCourier = 'N/A';
      let maxCount = 0;
      Object.entries(courierCounts).forEach(([c, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mainCourier = c.toUpperCase();
        }
      });

      const avgDespachoHrs = dispatchTimesCount > 0 
        ? Math.round((dispatchTimesSum / dispatchTimesCount) / 3600000) 
        : 0;

      setKpis({
        total: list.length,
        preparando,
        enCola,
        enTransito,
        entregados,
        conError,
        avgDespachoHrs,
        mainCourier,
        pendingLabel
      });

    } catch (err: any) {
      toast({ title: 'Error', message: `No se pudieron cargar los envíos: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShipments();
  }, [user]);

  // Load timeline events
  const viewTimeline = async (shipment: Shipment) => {
    setSelectedTimelineShipment(shipment);
    setLoadingTimeline(true);
    try {
      const { data, error } = await supabase
        .from('shipment_events')
        .select('id, event_type, description, provider_status, created_at, created_by')
        .eq('shipment_id', shipment.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTimelineEvents(data || []);
    } catch (err: any) {
      toast({ title: 'Error', message: `No se pudieron cargar los eventos: ${err.message}`, type: 'error' });
    } finally {
      setLoadingTimeline(false);
    }
  };

  // Mark pickup shipment as ready
  const markAsReady = async (shipId: string) => {
    try {
      const { error } = await supabase
        .from('shipments')
        .update({ shipping_status: 'waiting_pickup', updated_at: new Date().toISOString() })
        .eq('id', shipId);

      if (error) throw error;
      
      // Log event
      await supabase.from('shipment_events').insert({
        shipment_id: shipId,
        event_type: 'waiting_pickup',
        description: 'Vendedor marcó el paquete como listo para retiro.',
        provider_status: 'waiting_pickup',
        created_by: 'vendor'
      });

      toast({ title: 'Éxito', message: 'Envío marcado como listo para retiro', type: 'success' });
      loadShipments();
    } catch (err: any) {
      toast({ title: 'Error', message: `Error al actualizar: ${err.message}`, type: 'error' });
    }
  };

  // Filter shipments list
  const filteredShipments = shipments.filter(s => {
    const q = searchQuery.toLowerCase();
    const refMatch = s.internal_reference.toLowerCase().includes(q) || 
                     (s.tracking_code || '').toLowerCase().includes(q) ||
                     (s.suborder?.suborder_number || '').toLowerCase().includes(q);

    const statusMatch = statusFilter === 'all' || 
                        (statusFilter === 'preparando' && ['draft', 'pending_real_tracking'].includes(s.shipping_status)) ||
                        (statusFilter === 'queued' && ['queued', 'processing'].includes(s.shipping_status)) ||
                        (statusFilter === 'transito' && ['in_transit', 'picked_up', 'out_for_delivery'].includes(s.shipping_status)) ||
                        (statusFilter === 'entregados' && s.shipping_status === 'delivered') ||
                        (statusFilter === 'error' && s.shipping_status === 'failed');

    const courierMatch = courierFilter === 'all' || s.provider_key === courierFilter;

    return refMatch && statusMatch && courierMatch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="text-sm font-bold text-gray-500">Cargando tus envíos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Mis Envíos</h2>
          <p className="text-sm text-gray-500 mt-1">Controla tus guías, etiquetas oficiales y el estado de entrega en tiempo real.</p>
        </div>
        <button onClick={loadShipments} className="btn-secondary gap-2">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <button onClick={() => setStatusFilter('all')} className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${statusFilter === 'all' ? 'border-blue-600 shadow-sm ring-1 ring-blue-600/10' : 'border-gray-200'}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Envíos</div>
          <div className="text-xl font-black text-gray-900 mt-1">{kpis.total}</div>
        </button>
        <button onClick={() => setStatusFilter('preparando')} className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${statusFilter === 'preparando' ? 'border-blue-600 shadow-sm ring-1 ring-blue-600/10' : 'border-gray-200'}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-amber-500">Preparando</div>
          <div className="text-xl font-black text-amber-600 mt-1">{kpis.preparando}</div>
        </button>
        <button onClick={() => setStatusFilter('queued')} className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${statusFilter === 'queued' ? 'border-blue-600 shadow-sm ring-1 ring-blue-600/10' : 'border-gray-200'}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-blue-500">En Cola</div>
          <div className="text-xl font-black text-blue-600 mt-1">{kpis.enCola}</div>
        </button>
        <button onClick={() => setStatusFilter('transito')} className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${statusFilter === 'transito' ? 'border-blue-600 shadow-sm ring-1 ring-blue-600/10' : 'border-gray-200'}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-indigo-500">Tránsito</div>
          <div className="text-xl font-black text-indigo-600 mt-1">{kpis.enTransito}</div>
        </button>
        <button onClick={() => setStatusFilter('entregados')} className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${statusFilter === 'entregados' ? 'border-blue-600 shadow-sm ring-1 ring-blue-600/10' : 'border-gray-200'}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-green-500">Entregados</div>
          <div className="text-xl font-black text-green-600 mt-1">{kpis.entregados}</div>
        </button>
        <button onClick={() => setStatusFilter('error')} className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${statusFilter === 'error' ? 'border-blue-600 shadow-sm ring-1 ring-blue-600/10' : 'border-gray-200'}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-red-500">Errores</div>
          <div className="text-xl font-black text-red-600 mt-1">{kpis.conError}</div>
        </button>
        <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 text-left col-span-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SLA Despacho</div>
          <div className="text-xl font-black text-slate-700 mt-1">{kpis.avgDespachoHrs} hrs</div>
        </div>
        <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 text-left col-span-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Courier Principal</div>
          <div className="text-sm font-black text-slate-700 mt-2 truncate uppercase">{kpis.mainCourier}</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-450" />
          </span>
          <input
            type="text"
            placeholder="Buscar por referencia, tracking..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <select
            value={courierFilter}
            onChange={(e) => setCourierFilter(e.target.value)}
            className="w-full md:w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="all">Todos los couriers</option>
            <option value="dac">DAC</option>
            <option value="soydelivery">SoyDelivery</option>
            <option value="pickup">Retiro en Local</option>
            <option value="manual">Manual / Propio</option>
          </select>
        </div>
      </div>

      {/* Shipments Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-150 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                <th className="py-4 px-5">Pedido / Suborden</th>
                <th className="py-4 px-5">Productos</th>
                <th className="py-4 px-5">Courier</th>
                <th className="py-4 px-5">Bulto</th>
                <th className="py-4 px-5">Estado</th>
                <th className="py-4 px-5">Tracking</th>
                <th className="py-4 px-5">Último Evento</th>
                <th className="py-4 px-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-500 font-medium">
                    No se encontraron envíos para los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                filteredShipments.map((s) => {
                  const latestEv = eventsMap[s.id];
                  const isPickup = s.provider_key === 'pickup';
                  const isManual = s.provider_key === 'manual';

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-5">
                        <div className="font-black text-gray-900">COL-{s.suborder?.suborder_number}</div>
                        <div className="text-[10px] text-gray-400 font-bold font-mono">Ref: {s.internal_reference}</div>
                      </td>
                      <td className="py-4 px-5 max-w-[200px]">
                        <div className="truncate text-gray-700 font-bold">
                          {s.suborder?.order_items.map(item => `${item.quantity}x ${item.products?.title || 'Producto'}`).join(', ') || 'Sin ítems'}
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <span className="font-bold text-xs uppercase text-slate-650 bg-slate-100 px-2 py-0.5 rounded border">
                          {s.provider_key}
                        </span>
                      </td>
                      <td className="py-4 px-5 font-mono text-xs font-bold text-gray-700">
                        {s.package_number} / {s.total_packages}
                      </td>
                      <td className="py-4 px-5">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                          s.shipping_status === 'delivered' ? 'bg-green-50 border-green-200 text-green-700' :
                          ['in_transit', 'picked_up', 'out_for_delivery'].includes(s.shipping_status) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                          ['queued', 'processing'].includes(s.shipping_status) ? 'bg-blue-50 border-blue-200 text-blue-700' :
                          s.shipping_status === 'failed' ? 'bg-red-50 border-red-200 text-red-700' :
                          'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>
                          {s.shipping_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-4 px-5 font-mono text-xs font-bold text-gray-800">
                        {s.tracking_code && !(s.tracking_code.startsWith('COL-') || s.tracking_code.startsWith('SHIP-') || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.tracking_code)) ? s.tracking_code : 
                         (s.shipping_status === 'pending_real_tracking' || ['queued', 'retry_scheduled', 'processing'].includes(s.shipping_status)) && ['dac', 'soydelivery', 'ues'].includes((s.provider_key || '').toLowerCase()) ? (
                           <span className="text-[10px] text-amber-600 font-sans block w-fit font-bold">
                             Rastreo pendiente
                           </span>
                         ) : '-'}
                      </td>
                      <td className="py-4 px-5 max-w-[180px]">
                        <div className="truncate text-xs text-gray-500 font-medium">
                          {latestEv ? latestEv.description : 'Guía registrada'}
                        </div>
                        {latestEv && (
                          <span className="text-[9px] text-gray-400 block font-mono mt-0.5">
                            {new Date(latestEv.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-right space-x-2">
                        <button
                          onClick={() => viewTimeline(s)}
                          className="p-1.5 text-gray-400 hover:text-slate-700 rounded transition-colors inline-flex items-center"
                          title="Ver Timeline"
                        >
                          <Clock className="w-4 h-4" />
                        </button>
                        
                        {isPickup && s.shipping_status === 'ready_to_ship' && (
                          <button
                            onClick={() => markAsReady(s.id)}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold px-2 py-1 rounded transition-colors"
                          >
                            Listo
                          </button>
                        )}

                        {s.shipping_label_url ? (
                          <a
                            href={s.shipping_label_url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-indigo-500 hover:text-indigo-700 rounded transition-colors inline-flex items-center"
                            title="Descargar Etiqueta Oficial"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        ) : (
                          <button
                            onClick={() => setSelectedLabelSuborderId(s.suborder_id)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 rounded transition-colors inline-flex items-center"
                            title="Generar/Imprimir Etiqueta"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
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

      {/* Label Generation Modal Trigger */}
      {selectedLabelSuborderId && (
        <ShipmentLabelModal
          suborderId={selectedLabelSuborderId}
          onClose={() => {
            setSelectedLabelSuborderId(null);
            loadShipments();
          }}
        />
      )}

      {/* Simplified Timeline Modal */}
      {selectedTimelineShipment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 text-lg">Timeline de Envío</h3>
                <p className="text-xs text-gray-500">Ref: {selectedTimelineShipment.internal_reference} | Bulto {selectedTimelineShipment.package_number} de {selectedTimelineShipment.total_packages}</p>
              </div>
              <button onClick={() => setSelectedTimelineShipment(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {loadingTimeline ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
                </div>
              ) : timelineEvents.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-6">
                  No hay eventos registrados para este envío todavía.
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-100 ml-3 pl-6 space-y-6">
                  {timelineEvents.map((ev, idx) => (
                    <div key={ev.id} className="relative">
                      {/* Event point */}
                      <span className="absolute -left-9 top-1 w-5 h-5 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-700 capitalize">
                          {ev.event_type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{ev.description}</p>
                      {ev.provider_status && (
                        <span className="inline-block mt-1 text-[9px] font-bold bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded font-mono text-gray-400">
                          Status: {ev.provider_status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-gray-100 flex justify-end">
              <button onClick={() => setSelectedTimelineShipment(null)} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

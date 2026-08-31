import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Truck, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

export default function AdminLogisticsConnections() {
  const [connections, setConnections] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, { count: number; trackings: string[] }>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchConnections = async () => {
    setLoading(true);
    try {
      let connData: any[] | null = null;
      
      const { data: primaryData, error: primaryErr } = await supabase
        .from('vendor_shipping_connections')
        .select(`
          id, provider, account_name, connection_status, last_tested_at, last_error, updated_at, vendor_id,
          vendors ( id, store_name )
        `)
        .order('updated_at', { ascending: false });

      if (primaryErr) {
        // Fallback: Query vendor_shipping_connections without nested join
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('vendor_shipping_connections')
          .select('id, provider, account_name, connection_status, last_tested_at, last_error, updated_at, vendor_id')
          .order('updated_at', { ascending: false });
        if (fallbackErr) throw fallbackErr;

        // Populate vendor info separately if needed
        const vendorIds = Array.from(new Set((fallbackData || []).map(c => c.vendor_id).filter(Boolean)));
        let vendorsMap: Record<string, any> = {};
        if (vendorIds.length > 0) {
          const { data: vList } = await supabase.from('vendors').select('id, store_name').in('id', vendorIds);
          if (vList) {
            vList.forEach(v => { vendorsMap[v.id] = v; });
          }
        }
        connData = (fallbackData || []).map(c => ({
          ...c,
          vendors: vendorsMap[c.vendor_id] || null
        }));
      } else {
        connData = primaryData;
      }

      // Fetch all shipments for stats
      const { data: shipData, error: shipErr } = await supabase
        .from('shipments')
        .select('provider_key, tracking_code, order_suborders!inner(vendor_id)')
        .not('tracking_code', 'is', null);

      const computedStats: Record<string, { count: number; trackings: string[] }> = {};
      if (shipData) {
        shipData.forEach((s: any) => {
          const vId = s.order_suborders?.vendor_id;
          const provider = s.provider_key;
          if (!vId || !provider) return;
          const key = `${vId}_${provider}`;
          if (!computedStats[key]) {
            computedStats[key] = { count: 0, trackings: [] };
          }
          computedStats[key].count += 1;
          if (s.tracking_code && !computedStats[key].trackings.includes(s.tracking_code) && computedStats[key].trackings.length < 3) {
            computedStats[key].trackings.push(s.tracking_code);
          }
        });
      }

      setStats(computedStats);
      setConnections(connData || []);
    } catch (err: any) {
      toast.error('Error al cargar conexiones: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Conexiones Logísticas</h1>
          <p className="text-xs text-gray-500 mt-0.5">Supervisa las integraciones de envío de los vendedores.</p>
        </div>
        <button onClick={fetchConnections} className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* MOBILE LIST CARDS (< md) */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <div className="bg-white rounded-xl p-6 text-center text-xs text-gray-400 font-medium border border-gray-200 animate-pulse">
            Cargando conexiones logísticas...
          </div>
        ) : connections.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center text-xs text-gray-400 font-medium border border-gray-200">
            No hay conexiones registradas.
          </div>
        ) : (
          connections.map(conn => {
            const key = `${conn.vendor_id}_${conn.provider}`;
            const connStats = stats[key] || { count: 0, trackings: [] };
            const isConnected = conn.connection_status === 'connected';

            return (
              <div key={conn.id} className="bg-white rounded-xl border border-gray-200 p-3.5 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="font-bold text-gray-900 text-sm capitalize">{conn.provider}</span>
                    {conn.account_name && (
                      <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                        {conn.account_name}
                      </span>
                    )}
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    isConnected ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                  }`}>
                    {isConnected ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </div>

                <div className="text-xs text-gray-600 pt-1 border-t border-gray-100 flex items-center justify-between">
                  <span className="font-medium text-gray-800">{conn.vendors?.store_name || 'Vendedor s/nombre'}</span>
                  <span className="font-bold text-gray-900">{connStats.count} envíos</span>
                </div>

                {conn.last_error && (
                  <div className="text-[11px] text-rose-600 bg-rose-50/60 p-2 rounded-lg border border-rose-100 font-mono truncate" title={conn.last_error}>
                    Error: {conn.last_error}
                  </div>
                )}

                {connStats.trackings.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 overflow-x-auto no-scrollbar pt-0.5">
                    <span className="font-bold shrink-0">Trackings:</span>
                    {connStats.trackings.map((t: string) => (
                      <span key={t} className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-gray-700 shrink-0">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE (>= md) */}
      <div className="hidden md:block bg-white rounded-xl shadow-2xs border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Vendor</th>
              <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Proveedor</th>
              <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Última Prueba</th>
              <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Envíos</th>
              <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Trackings Recientes</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : connections.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No hay conexiones registradas.</td></tr>
            ) : (
              connections.map(conn => {
                const key = `${conn.vendor_id}_${conn.provider}`;
                const connStats = stats[key] || { count: 0, trackings: [] };
                return (
                  <tr key={conn.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-bold text-gray-900">{conn.vendors?.store_name || 'Desconocido'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-gray-400" />
                        <span className="font-bold capitalize">{conn.provider}</span>
                        {conn.account_name && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-2">
                            {conn.account_name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {conn.connection_status === 'connected' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 gap-1">
                          <CheckCircle className="w-3 h-3" /> ACTIVO
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 gap-1">
                          <AlertTriangle className="w-3 h-3" /> INACTIVO
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      {conn.last_tested_at ? new Date(conn.last_tested_at).toLocaleString() : 'Nunca'}
                      {conn.last_error && <div className="text-xs text-red-500 mt-1 truncate max-w-[200px]" title={conn.last_error}>{conn.last_error}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-900 font-bold">
                      {connStats.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      {connStats.trackings.length === 0 ? (
                        <span className="text-gray-400 italic">Ninguno</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {connStats.trackings.map((t: string) => (
                            <span key={t} className="px-2 py-0.5 bg-gray-100 border rounded font-mono text-gray-700">
                              {t}
                            </span>
                          ))}
                        </div>
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
  );
}

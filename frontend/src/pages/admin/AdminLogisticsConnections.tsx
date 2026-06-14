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
      const { data: connData, error: connErr } = await supabase
        .from('vendor_shipping_connections')
        .select(`
          id, provider, account_name, connection_status, last_tested_at, last_error, updated_at, vendor_id,
          vendors ( id, company_name, store_name, email )
        `)
        .order('updated_at', { ascending: false });

      if (connErr) throw connErr;

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conexiones Logísticas</h1>
          <p className="text-sm text-gray-500 mt-1">Supervisa las integraciones de envío (API Keys) de los vendedores.</p>
        </div>
        <button onClick={fetchConnections} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Última Prueba / Error</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad Envíos</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trackings Recientes</th>
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
                      <div className="font-medium text-gray-900">{conn.vendors?.store_name || conn.vendors?.company_name || 'Desconocido'}</div>
                      <div className="text-sm text-gray-500">{conn.vendors?.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-gray-400" />
                        <span className="font-medium capitalize">{conn.provider}</span>
                        {conn.account_name && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-2">
                            {conn.account_name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {conn.connection_status === 'connected' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 gap-1">
                          <CheckCircle className="w-3 h-3" /> Conectado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 gap-1">
                          <AlertTriangle className="w-3 h-3" /> Error / Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {conn.last_tested_at ? new Date(conn.last_tested_at).toLocaleString() : 'Nunca'}
                      {conn.last_error && <div className="text-xs text-red-500 mt-1 truncate max-w-[200px]" title={conn.last_error}>{conn.last_error}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
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

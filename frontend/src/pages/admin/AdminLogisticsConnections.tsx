import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Truck, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

export default function AdminLogisticsConnections() {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendor_shipping_connections')
        .select(`
          id, provider, account_name, connection_status, last_tested_at, last_error, updated_at,
          vendors ( id, company_name, email )
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConnections(data || []);
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Última Prueba</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : connections.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No hay conexiones registradas.</td></tr>
            ) : (
              connections.map(conn => (
                <tr key={conn.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{conn.vendors?.company_name || 'Desconocido'}</div>
                    <div className="text-sm text-gray-500">{conn.vendors?.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-gray-400" />
                      <span className="font-medium capitalize">{conn.provider}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-2">
                        {conn.account_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {conn.connection_status === 'connected' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 gap-1">
                        <CheckCircle className="w-3 h-3" /> Conectado
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 gap-1">
                        <AlertTriangle className="w-3 h-3" /> Error
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {conn.last_tested_at ? new Date(conn.last_tested_at).toLocaleString() : 'Nunca'}
                    {conn.last_error && <div className="text-xs text-red-500 mt-1 truncate max-w-[200px]" title={conn.last_error}>{conn.last_error}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => toast.info('Acción reservada para futuras versiones.')} className="text-blue-600 hover:text-blue-900">
                      Ver Detalles
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';

export default function AdminAffiliates() {
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('affiliates').select('*, profiles(email)');
      if (data) setAffiliates(data);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold dark:text-white">Influencers / Afiliados</h2>
        <button className="btn-primary">Nuevo Afiliado</button>
      </div>
      
      {loading ? (
        <div className="animate-pulse h-40 bg-gray-100 rounded-xl" />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 text-sm font-semibold text-gray-600">Cupón / Código</th>
                <th className="p-4 text-sm font-semibold text-gray-600">Usuario</th>
                <th className="p-4 text-sm font-semibold text-gray-600">Comisión Base</th>
                <th className="p-4 text-sm font-semibold text-gray-600">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map(aff => (
                <tr key={aff.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4 text-sm font-bold text-primary-600">{aff.code}</td>
                  <td className="p-4 text-sm text-gray-700">{aff.profiles?.email || 'N/A'}</td>
                  <td className="p-4 text-sm text-gray-700">{aff.base_commission_rate}%</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${aff.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {aff.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
              {affiliates.length === 0 && (
                <tr><td colSpan={4} className="p-4 text-center text-gray-500">No hay afiliados registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

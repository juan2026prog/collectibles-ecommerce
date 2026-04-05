import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import { Search, MoreVertical, CreditCard, DollarSign, Share2 } from 'lucide-react';

export default function AdminAffiliates() {
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('affiliates').select('*, profiles(full_name, email)');
      if (data) setAffiliates(data);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white">Influencers / Afiliados</h2>
          <p className="text-sm text-gray-500 mt-1">Gestión de códigos, comisiones y liquidación de ganancias.</p>
        </div>
        <button className="btn-primary">Nuevo Afiliado</button>
      </div>

      {loading ? (
        <div className="animate-pulse h-40 bg-gray-100 rounded-xl" />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex gap-4 bg-gray-50">
             <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Buscar afiliado o código..." className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500" />
             </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-black text-gray-500 uppercase tracking-widest">
                  <th className="p-4">Nombre</th>
                  <th className="p-4">Usuario</th>
                  <th className="p-4">Código</th>
                  <th className="p-4">Redes Sociales</th>
                  <th className="p-4">Área</th>
                  <th className="p-4">Comisión</th>
                  <th className="p-4">Ventas</th>
                  <th className="p-4">Usos del Código</th>
                  <th className="p-4 text-blue-600">Ganancia</th>
                  <th className="p-4 text-green-600">Pagos</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {affiliates.map(aff => {
                  // Fallbacks in case columns aren't filled yet
                  const nombre = aff.profiles?.full_name || aff.name || 'Sin Nombre';
                  const usuario = aff.profiles?.email || 'N/D';
                  const redes = aff.social_links || '@' + (aff.profiles?.full_name?.split(' ')[0]?.toLowerCase() || 'insta');
                  const area = aff.niche || aff.area || 'General';
                  const ventas = aff.total_sales || 0;
                  const usos = aff.code_uses || 0;
                  const ganancia = aff.earned_commissions || aff.total_earnings || 0;
                  const pagos = aff.paid_commissions || aff.total_paid || 0;

                  return (
                    <tr key={aff.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-bold text-gray-900 text-sm">{nombre}</td>
                      <td className="p-4 text-sm text-gray-500">{usuario}</td>
                      <td className="p-4">
                         <span className="font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg text-xs">{aff.code}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Share2 className="w-3.5 h-3.5 text-pink-600" />
                          <span>{redes}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-600">
                         <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">{area}</span>
                      </td>
                      <td className="p-4 text-sm font-bold text-gray-900">{aff.base_commission_rate}%</td>
                      <td className="p-4 text-sm font-bold text-gray-700">${ventas.toLocaleString()}</td>
                      <td className="p-4 text-sm font-bold text-gray-700 text-center">{usos}</td>
                      <td className="p-4 text-sm font-black text-blue-600">${ganancia.toLocaleString()}</td>
                      <td className="p-4 text-sm font-black text-green-600">${pagos.toLocaleString()}</td>
                      <td className="p-4 text-right">
                         <button className="text-gray-400 hover:text-gray-900 transition-colors">
                           <MoreVertical className="w-4 h-4" />
                         </button>
                      </td>
                    </tr>
                  );
                })}
                {affiliates.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-gray-400 font-medium">No hay afiliados registrados en el sistema.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

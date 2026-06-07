import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Store, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

export default function AdminVendors() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVendors();
  }, []);

  async function fetchVendors() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select(`
          *,
          profiles:user_id(email, first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVendors(data || []);
    } catch (err) {
      console.error('Error fetching vendors:', err);
    }
    setLoading(false);
  }

  async function updateVendorStatus(vendorId: string, status: string) {
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ status })
        .eq('id', vendorId);

      if (error) throw error;
      
      setVendors(current =>
        current.map(v => v.id === vendorId ? { ...v, status } : v)
      );
    } catch (err) {
      console.error('Error updating vendor status:', err);
      alert('Error al actualizar el estado del vendor.');
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500 animate-pulse">Cargando vendors...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-teal-600" />
            Marketplace Vendors
          </h1>
          <p className="text-gray-500 mt-1">
            Gestiona los vendedores de la plataforma.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {vendors.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Store className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="font-semibold">No hay vendedores registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Tienda</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Usuario</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Contacto</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendors.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {v.logo_url ? (
                          <img src={v.logo_url} alt="" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                            <Store className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-gray-900">{v.store_name}</div>
                          <div className="text-xs text-gray-400">Slug: {v.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">{v.profiles?.first_name} {v.profiles?.last_name}</div>
                      <div className="text-xs text-gray-500">{v.profiles?.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">{v.contact_email || 'No especificado'}</div>
                      <div className="text-xs text-gray-500">{v.contact_phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      {v.status === 'active' && <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-green-100 text-green-800"><CheckCircle className="w-3 h-3" /> Activo</span>}
                      {v.status === 'pending' && <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3" /> Pendiente</span>}
                      {v.status === 'suspended' && <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3" /> Suspendido</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {v.status !== 'active' && (
                          <button
                            onClick={() => updateVendorStatus(v.id, 'active')}
                            className="text-xs font-bold text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" /> Aprobar
                          </button>
                        )}
                        {v.status !== 'suspended' && (
                          <button
                            onClick={() => updateVendorStatus(v.id, 'suspended')}
                            className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" /> Suspender
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
  );
}

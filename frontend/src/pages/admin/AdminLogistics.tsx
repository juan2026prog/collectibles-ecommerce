import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, MapPin, Truck, Plus } from 'lucide-react';

export default function AdminLogistics() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    try {
      const { data, error } = await supabase.from('warehouses').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setWarehouses(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Logística y Depósitos</h2>
          <p className="text-gray-500 mt-1">Gestión de bodegas, correos integrados y reglas de pesos/volumetría.</p>
        </div>
        <button className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
          <Plus className="w-5 h-5" />
          Nuevo Depósito
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Depósitos Activos</p>
            <h3 className="text-2xl font-bold text-gray-900">{warehouses.length}</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-lg text-purple-600">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Envíos en Tránsito</p>
            <h3 className="text-2xl font-bold text-gray-900">0</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="bg-orange-100 p-3 rounded-lg text-orange-600">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Sin Dimensión/Peso</p>
            <h3 className="text-2xl font-bold text-gray-900">5</h3>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Listado de Bodegas / Sucursales</h3>
        </div>
        <ul className="divide-y divide-gray-200">
          {loading ? (
            <li className="p-6 text-center text-gray-500">Cargando...</li>
          ) : warehouses.length === 0 ? (
            <li className="p-6 text-center text-gray-500">No hay depósitos registrados. Usa el botón "Nuevo Depósito" para crear uno.</li>
          ) : (
            warehouses.map(w => (
              <li key={w.id} className="p-6 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="bg-gray-100 p-3 rounded-full">
                    <MapPin className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{w.name}</h4>
                    <p className="text-sm text-gray-500">{w.location}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${w.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {w.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                  <button className="text-primary-600 hover:text-primary-800 text-sm font-medium ml-4">Editar</button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

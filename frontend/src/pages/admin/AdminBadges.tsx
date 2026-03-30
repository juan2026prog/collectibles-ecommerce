import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ShieldCheck, Tags, Search, Check } from 'lucide-react';

export default function AdminBadges() {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBadge, setSelectedBadge] = useState('hot');
  const [loading, setLoading] = useState(true);

  // Predefined default badges
  const BADGES = [
    { id: 'hot', label: 'HOT', color: 'bg-red-500 text-white' },
    { id: 'new', label: 'NEW', color: 'bg-green-500 text-white' },
    { id: 'sale', label: 'SALE', color: 'bg-blue-500 text-white' },
    { id: 'preorder', label: 'PRE-ORDER', color: 'bg-orange-500 text-white' },
    { id: 'soldout', label: 'SOLD OUT', color: 'bg-gray-500 text-white' }
  ];

  useEffect(() => { fetchProducts(); }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase.from('products').select('id, title, badge, category:categories(name)').order('title');
    setProducts(data || []);
    setLoading(false);
  }

  async function handleAssignBadge(productId: string, badgeValue: string | null) {
    await supabase.from('products').update({ badge: badgeValue }).eq('id', productId);
    fetchProducts();
  }

  async function handleMassAssign() {
    if (!confirm(`¿Asignar la cocarda [${selectedBadge.toUpperCase()}] a todos los productos filtrados?`)) return;
    const filterIds = filteredProducts.map(p => p.id);
    await supabase.from('products').update({ badge: selectedBadge }).in('id', filterIds);
    fetchProducts();
  }

  async function handleMassClear() {
    if (!confirm(`¿Quitar cocardas a todos los productos filtrados?`)) return;
    const filterIds = filteredProducts.map(p => p.id);
    await supabase.from('products').update({ badge: null }).in('id', filterIds);
    fetchProducts();
  }

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase()) || 
    p.category?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary-600" /> Gestor de Cocardas
          </h2>
          <p className="text-sm text-gray-500 mt-1">Asigna etiquetas gráficas visuales a tus productos.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-lg mb-4">Acciones Masivas</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Seleccionar Cocarda</label>
                <div className="flex flex-wrap gap-2">
                  {BADGES.map(b => (
                    <button 
                      key={b.id} 
                      onClick={() => setSelectedBadge(b.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                        selectedBadge === b.id ? 'border-primary-500 ' + b.color : 'border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500">Aplica la cocarda a los {filteredProducts.length} productos que coinciden con tu búsqueda actual.</p>
              
              <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <button onClick={handleMassAssign} className="w-full bg-dark-900 border border-dark-900 text-white font-medium py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors">
                  Aplicar Masivamente
                </button>
                <button onClick={handleMassClear} className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                  Quitar Cocardas
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar productos o categorías para asignar cocardas..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none shadow-sm"
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Producto</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Categoría</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Cocarda Actual</th>
                    <th className="p-4 text-right text-xs font-bold text-gray-500 uppercase">Cambio Rápido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-400">Cargando...</td></tr>
                  ) : filteredProducts.map(p => {
                    const badgeObj = BADGES.find(b => b.id === p.badge);
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="p-4 text-sm font-semibold text-gray-900">{p.title}</td>
                        <td className="p-4 text-sm text-gray-500">{p.category?.name || '-'}</td>
                        <td className="p-4">
                          {p.badge ? (
                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${badgeObj?.color || 'bg-gray-200 text-black'}`}>
                              {p.badge}
                            </span>
                          ) : <span className="text-gray-300 text-xs">- Ninguna -</span>}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {p.badge !== selectedBadge && (
                              <button onClick={() => handleAssignBadge(p.id, selectedBadge)} title="Asignar seleccionada" className="p-1.5 bg-primary-50 text-primary-600 rounded hover:bg-primary-100">
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {p.badge && (
                              <button onClick={() => handleAssignBadge(p.id, null)} title="Quitar cocarda" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                                <Tags className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

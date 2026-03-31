import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ShieldCheck, Tags, Search, Check, Plus, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { MediaPickerModal } from '../../components/MediaPickerModal';

interface CustomBadge {
  id: string;
  label: string;
  color: string;
  bg_color: string;
  text_color: string;
  custom_image?: string;
}

export default function AdminBadges() {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBadge, setSelectedBadge] = useState('hot');
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<CustomBadge[]>([
    { id: 'hot', label: 'HOT', color: 'bg-red-500 text-white', bg_color: '#ef4444', text_color: '#ffffff' },
    { id: 'new', label: 'NEW', color: 'bg-green-500 text-white', bg_color: '#22c55e', text_color: '#ffffff' },
    { id: 'sale', label: 'SALE', color: 'bg-blue-500 text-white', bg_color: '#3b82f6', text_color: '#ffffff' },
    { id: 'preorder', label: 'PRE-ORDER', color: 'bg-orange-500 text-white', bg_color: '#f97316', text_color: '#ffffff' },
    { id: 'soldout', label: 'SOLD OUT', color: 'bg-gray-500 text-white', bg_color: '#6b7280', text_color: '#ffffff' }
  ]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBadge, setEditingBadge] = useState<CustomBadge | null>(null);
  const [newBadgeLabel, setNewBadgeLabel] = useState('');
  const [newBadgeBg, setNewBadgeBg] = useState('#3b82f6');
  const [newBadgeText, setNewBadgeText] = useState('#ffffff');
  const [newBadgeImage, setNewBadgeImage] = useState('');
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const BADGES = badges;

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase.from('products').select('id, title, badge, category:categories(name)').order('title');
    setProducts(data || []);
    setLoading(false);
  }

  async function loadCustomBadges() {
    const { data } = await supabase.from('badges').select('*').order('sort_order');
    if (data && data.length > 0) {
      setBadges([
        { id: 'hot', label: 'HOT', color: 'bg-red-500 text-white', bg_color: '#ef4444', text_color: '#ffffff' },
        { id: 'new', label: 'NEW', color: 'bg-green-500 text-white', bg_color: '#22c55e', text_color: '#ffffff' },
        { id: 'sale', label: 'SALE', color: 'bg-blue-500 text-white', bg_color: '#3b82f6', text_color: '#ffffff' },
        { id: 'preorder', label: 'PRE-ORDER', color: 'bg-orange-500 text-white', bg_color: '#f97316', text_color: '#ffffff' },
        { id: 'soldout', label: 'SOLD OUT', color: 'bg-gray-500 text-white', bg_color: '#6b7280', text_color: '#ffffff' },
        ...data.map((b: any) => ({
          id: b.id,
          label: b.label,
          color: '',
          bg_color: b.bg_color || '#3b82f6',
          text_color: b.text_color || '#ffffff',
          custom_image: b.custom_image || null
        }))
      ]);
    }
  }

  useEffect(() => { fetchProducts(); loadCustomBadges(); }, []);

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

  async function handleCreateBadge() {
    if (!newBadgeLabel.trim()) return alert('El texto de la cocarda es requerido');
    
    const newBadge: CustomBadge = {
      id: `custom_${Date.now()}`,
      label: newBadgeLabel.toUpperCase(),
      color: '',
      bg_color: newBadgeBg,
      text_color: newBadgeText,
      custom_image: newBadgeImage || undefined
    };

    await supabase.from('badges').insert({
      label: newBadge.label,
      bg_color: newBadge.bg_color,
      text_color: newBadge.text_color,
      custom_image: newBadge.custom_image || null,
      is_active: true,
      sort_order: badges.length
    });

    setNewBadgeLabel('');
    setNewBadgeBg('#3b82f6');
    setNewBadgeText('#ffffff');
    setNewBadgeImage('');
    setShowCreateModal(false);
    loadCustomBadges();
  }

  async function handleDeleteBadge(badgeId: string) {
    if (!confirm('¿Eliminar esta cocarda?')) return;
    await supabase.from('badges').delete().eq('id', badgeId);
    loadCustomBadges();
  }

  function getBadgeStyle(badge: CustomBadge) {
    if (badge.custom_image) {
      return { backgroundImage: `url(${badge.custom_image})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    return { backgroundColor: badge.bg_color, color: badge.text_color };
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
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">Seleccionar Cocarda</label>
                  <button onClick={() => setShowCreateModal(true)} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Crear Nueva
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {BADGES.map(b => (
                    <div key={b.id} className="relative group">
                      <button 
                        onClick={() => setSelectedBadge(b.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                          selectedBadge === b.id ? 'border-primary-500' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        style={getBadgeStyle(b)}
                      >
                        {b.custom_image ? '' : b.label}
                      </button>
                      {!['hot', 'new', 'sale', 'preorder', 'soldout'].includes(b.id) && (
                        <button 
                          onClick={() => handleDeleteBadge(b.id)}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <Trash2 className="w-2 h-2" />
                        </button>
                      )}
                    </div>
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

      {/* CREATE BADGE MODAL */}
      {showCreateModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowCreateModal(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">Nueva Cocarda Personalizada</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="form-label">Texto de la Cocarda *</label>
                <input 
                  className="form-input" 
                  value={newBadgeLabel} 
                  onChange={e => setNewBadgeLabel(e.target.value)}
                  placeholder="Ej: OFERTA, DESTACADO, LIMONIADA"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Color de Fondo</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={newBadgeBg}
                      onChange={e => setNewBadgeBg(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <input 
                      type="text"
                      value={newBadgeBg}
                      onChange={e => setNewBadgeBg(e.target.value)}
                      className="form-input text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label">Color de Texto</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={newBadgeText}
                      onChange={e => setNewBadgeText(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <input 
                      type="text"
                      value={newBadgeText}
                      onChange={e => setNewBadgeText(e.target.value)}
                      className="form-input text-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="form-label">Vista Previa</label>
                <div className="flex justify-center py-4">
                  <span 
                    className="px-4 py-2 rounded-lg text-sm font-bold"
                    style={{ backgroundColor: newBadgeBg, color: newBadgeText }}
                  >
                    {newBadgeLabel || 'TEXTO'}
                  </span>
                </div>
              </div>

              <div className="border-t pt-4">
                <label className="form-label">Opcional: Imagen Personalizada (en lugar de texto)</label>
                <div className="flex gap-2">
                  <input 
                    className="form-input flex-1" 
                    value={newBadgeImage}
                    onChange={e => setNewBadgeImage(e.target.value)}
                    placeholder="URL de imagen o selecciona de la biblioteca"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowMediaPicker(true)}
                    className="btn-secondary px-3"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                </div>
                {newBadgeImage && (
                  <div className="mt-2 flex justify-center">
                    <img src={newBadgeImage} alt="Preview" className="h-12 object-contain" />
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleCreateBadge} className="btn-primary flex-1 gap-2">
                <Plus className="w-4 h-4" /> Crear Cocarda
              </button>
            </div>
          </div>
        </>
      )}

      {/* MEDIA PICKER */}
      <MediaPickerModal 
        isOpen={showMediaPicker} 
        onClose={() => setShowMediaPicker(false)} 
        onSelect={(url) => { setNewBadgeImage(url); setShowMediaPicker(false); }}
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ShieldCheck, Search, Plus, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { MediaPickerModal } from '../../components/MediaPickerModal';

interface BadgeConfig {
  url: string;
  position: 'top-left' | 'top-right';
  size: 'small' | 'medium' | 'large';
  start_date?: string;
  end_date?: string;
}

interface CustomBadge {
  id: string;
  label: string;
  custom_image: string | null;
  config?: BadgeConfig;
}

export default function AdminBadges() {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<CustomBadge[]>([]);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const [newBadgeLabel, setNewBadgeLabel] = useState('');
  const [newBadgeImage, setNewBadgeImage] = useState('');
  const [newBadgePosition, setNewBadgePosition] = useState<'top-left' | 'top-right'>('top-left');
  const [newBadgeSize, setNewBadgeSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [newBadgeStartDate, setNewBadgeStartDate] = useState('');
  const [newBadgeEndDate, setNewBadgeEndDate] = useState('');

  const [showMediaPicker, setShowMediaPicker] = useState(false);

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase.from('products').select('id, title, badge, category:categories(name)').order('title');
    setProducts(data || []);
    setLoading(false);
  }

  async function loadCustomBadges() {
    const { data } = await supabase.from('badges').select('*').order('sort_order');
    if (data) {
      setBadges(data.map((b: any) => {
        let config;
        try { config = JSON.parse(b.custom_image || '{}'); } catch { config = { url: b.custom_image }; }
        return {
          id: b.slug || b.id,
          label: b.label || 'Cocarda Visual',
          custom_image: b.custom_image,
          config
        };
      }));
    }
  }

  useEffect(() => { fetchProducts(); loadCustomBadges(); }, []);

  function getProductBadges(badgeString: string | null): string[] {
    if (!badgeString) return [];
    return badgeString.split(',').map(s => s.trim()).filter(Boolean);
  }

  async function handleToggleBadge(productId: string, currentBadges: string | null, badgeToToggle: string) {
    let list = getProductBadges(currentBadges);
    if (list.includes(badgeToToggle)) {
      list = list.filter(b => b !== badgeToToggle);
    } else {
      if (list.length >= 3) return alert('Un producto puede tener un máximo de 3 cocardas.');
      list.push(badgeToToggle);
    }
    await supabase.from('products').update({ badge: list.join(',') || null }).eq('id', productId);
    fetchProducts();
  }

  async function handleMassAssign() {
    if (!selectedBadge) return alert('Selecciona una cocarda primero');
    if (!confirm(`¿Asignar esta cocarda a todos los productos filtrados? Los productos que ya tengan 3 cocardas se ignorarán si no la tienen.`)) return;
    
    for (const p of filteredProducts) {
      let list = getProductBadges(p.badge);
      if (!list.includes(selectedBadge) && list.length < 3) {
        list.push(selectedBadge);
        await supabase.from('products').update({ badge: list.join(',') }).eq('id', p.id);
      }
    }
    fetchProducts();
  }

  async function handleMassClear() {
    if (!selectedBadge) return alert('Selecciona una cocarda primero para quitarla');
    if (!confirm(`¿Quitar la cocarda seleccionada de todos los productos filtrados?`)) return;
    
    for (const p of filteredProducts) {
      let list = getProductBadges(p.badge);
      if (list.includes(selectedBadge)) {
        list = list.filter(b => b !== selectedBadge);
        await supabase.from('products').update({ badge: list.join(',') || null }).eq('id', p.id);
      }
    }
    fetchProducts();
  }

  async function handleCreateBadge() {
    if (!newBadgeImage) return alert('Debes seleccionar una imagen PNG para la cocarda.');
    if (!newBadgeLabel.trim()) return alert('Debes dar un nombre interno a esta cocarda.');
    
    const config: BadgeConfig = {
      url: newBadgeImage,
      position: newBadgePosition,
      size: newBadgeSize,
      start_date: newBadgeStartDate || undefined,
      end_date: newBadgeEndDate || undefined
    };

    await supabase.from('badges').insert({
      label: newBadgeLabel.toUpperCase(),
      bg_color: 'transparent',
      text_color: '#ffffff',
      custom_image: JSON.stringify(config),
      is_active: true,
      sort_order: badges.length
    });

    setNewBadgeLabel('');
    setNewBadgeImage('');
    setNewBadgePosition('top-left');
    setNewBadgeSize('medium');
    setNewBadgeStartDate('');
    setNewBadgeEndDate('');
    setShowCreateModal(false);
    loadCustomBadges();
  }

  async function handleDeleteBadge(badgeId: string) {
    if (!confirm('¿Eliminar esta cocarda de la base de datos?')) return;
    await supabase.from('badges').delete().eq('id', badgeId).or(`slug.eq.${badgeId}`);
    loadCustomBadges();
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
            <ShieldCheck className="w-6 h-6 text-primary-600" /> Gestor de Cocardas PNG
          </h2>
          <p className="text-sm text-gray-500 mt-1">Sube tus imágenes PNG y asígnalas. Hasta 3 por producto.</p>
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
                <div className="grid grid-cols-2 gap-2">
                  {badges.map(b => (
                    <div key={b.id} className="relative group">
                      <button 
                        onClick={() => setSelectedBadge(b.id)}
                        className={`w-full p-2 rounded-lg text-xs font-bold border-2 transition-all flex flex-col items-center justify-center gap-2 h-20 ${
                          selectedBadge === b.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {b.config?.url ? (
                          <img src={b.config.url} alt={b.label} className="h-8 object-contain" />
                        ) : (
                          <span className="text-gray-400">{b.label}</span>
                        )}
                        <span className="truncate w-full text-center">{b.label}</span>
                      </button>
                      <button 
                        onClick={() => handleDeleteBadge(b.id)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer shadow-md"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {badges.length === 0 && <p className="text-xs text-gray-400 col-span-2">No hay cocardas creadas.</p>}
                </div>
              </div>
              
              <div className="flex flex-col gap-2 pt-4 border-t border-gray-100">
                <button onClick={handleMassAssign} disabled={!selectedBadge} className="w-full bg-dark-900 disabled:opacity-50 border border-dark-900 text-white font-medium py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors">
                  Añadir a Filtrados
                </button>
                <button onClick={handleMassClear} disabled={!selectedBadge} className="w-full bg-white disabled:opacity-50 border border-gray-300 text-red-600 font-medium py-2 rounded-lg text-sm hover:bg-red-50 transition-colors">
                  Quitar de Filtrados
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
              placeholder="Buscar productos o categorías..." 
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
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Cocardas (Max 3)</th>
                    <th className="p-4 text-right text-xs font-bold text-gray-500 uppercase">Añadir/Quitar Seleccionada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={3} className="p-6 text-center text-gray-400">Cargando...</td></tr>
                  ) : filteredProducts.map(p => {
                    const badgeList = getProductBadges(p.badge);
                    const hasSelected = selectedBadge ? badgeList.includes(selectedBadge) : false;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="p-4 text-sm font-semibold text-gray-900">{p.title}</td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {badgeList.map(bid => {
                              const bObj = badges.find(b => b.id === bid);
                              if (bObj?.config?.url) return <img key={bid} src={bObj.config.url} className="h-6 object-contain" title={bObj.label} alt={bObj.label} />;
                              return <span key={bid} className="px-2 py-0.5 bg-gray-200 text-[10px] rounded font-bold uppercase">{bObj?.label || bid}</span>;
                            })}
                            {badgeList.length === 0 && <span className="text-gray-300 text-xs">- Ninguna -</span>}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            disabled={!selectedBadge}
                            onClick={() => selectedBadge && handleToggleBadge(p.id, p.badge, selectedBadge)}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                              !selectedBadge ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                              hasSelected ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' : 
                              'bg-primary-50 text-primary-600 hover:bg-primary-100 border border-primary-200'
                            }`}
                          >
                            {hasSelected ? 'Quitar' : 'Asignar'}
                          </button>
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

      {showCreateModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowCreateModal(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">Nueva Cocarda PNG</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              <div className="bg-primary-50 p-4 rounded-xl border border-primary-100">
                <h4 className="font-bold text-primary-800 text-sm mb-2">RECOMENDACIONES DE IMAGEN</h4>
                <ul className="text-xs text-primary-700 space-y-1 list-disc list-inside">
                  <li>Formato PNG transparente</li>
                  <li>Tamaño recomendado: 500x500 px</li>
                  <li>Peso máximo: 200kb</li>
                </ul>
              </div>

              <div>
                <label className="form-label">Nombre interno (solo para ti)</label>
                <input 
                  className="form-input" 
                  value={newBadgeLabel} 
                  onChange={e => setNewBadgeLabel(e.target.value)}
                  placeholder="Ej: OFERTA_50, VERANO_25"
                />
              </div>

              <div>
                <label className="form-label">Archivo de imagen PNG (Obligatorio)</label>
                <div className="flex gap-2">
                  <input 
                    className="form-input flex-1" 
                    value={newBadgeImage}
                    onChange={e => setNewBadgeImage(e.target.value)}
                    placeholder="Escribe URL o selecciona..."
                  />
                  <button type="button" onClick={() => setShowMediaPicker(true)} className="btn-secondary px-3">
                    <ImageIcon className="w-4 h-4" />
                  </button>
                </div>
                {newBadgeImage && (
                  <div className="mt-4 p-4 border rounded-xl flex justify-center bg-gray-50 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
                    <img src={newBadgeImage} alt="Preview" className="h-20 object-contain drop-shadow-md" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="form-label">Posición</label>
                   <select className="form-input" value={newBadgePosition} onChange={e => setNewBadgePosition(e.target.value as any)}>
                     <option value="top-left">Top Left (Izquierda)</option>
                     <option value="top-right">Top Right (Derecha)</option>
                   </select>
                 </div>
                 <div>
                   <label className="form-label">Tamaño (Desktop)</label>
                   <select className="form-input" value={newBadgeSize} onChange={e => setNewBadgeSize(e.target.value as any)}>
                     <option value="small">Pequeño (~80px)</option>
                     <option value="medium">Mediano (~100px)</option>
                     <option value="large">Grande (~120px)</option>
                   </select>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="form-label">Vigencia Inicio (Opcional)</label>
                   <input type="datetime-local" className="form-input text-xs" value={newBadgeStartDate} onChange={e => setNewBadgeStartDate(e.target.value)} />
                 </div>
                 <div>
                   <label className="form-label">Vigencia Fin (Opcional)</label>
                   <input type="datetime-local" className="form-input text-xs" value={newBadgeEndDate} onChange={e => setNewBadgeEndDate(e.target.value)} />
                 </div>
              </div>

            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleCreateBadge} className="btn-primary flex-1 gap-2">
                <Plus className="w-4 h-4" /> Crear
              </button>
            </div>
          </div>
        </>
      )}

      <MediaPickerModal 
        isOpen={showMediaPicker} 
        onClose={() => setShowMediaPicker(false)} 
        onSelect={(url) => { setNewBadgeImage(url); setShowMediaPicker(false); }}
      />
    </div>
  );
}

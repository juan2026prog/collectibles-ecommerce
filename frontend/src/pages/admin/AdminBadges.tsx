import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ShieldCheck, Search, Plus, Trash2, Upload, Image as ImageIcon, CheckSquare, Square } from 'lucide-react';
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
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
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

  async function fetchData() {
    setLoading(true);
    const [prodRes, catRes, brandRes] = await Promise.all([
      supabase.from('products').select('id, title, badge, category_id, brand_id, category:categories(name), brand:brands(name)').order('title'),
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('brands').select('id, name').order('name')
    ]);
    
    setProducts(prodRes.data || []);
    setCategories(catRes.data || []);
    setBrands(brandRes.data || []);
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

  useEffect(() => { fetchData(); loadCustomBadges(); }, []);

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
    fetchData();
  }

  const filteredProducts = products.filter(p => {
    let matches = true;
    if (search) {
      matches = p.title.toLowerCase().includes(search.toLowerCase()) || 
                p.category?.name?.toLowerCase().includes(search.toLowerCase()) ||
                p.brand?.name?.toLowerCase().includes(search.toLowerCase());
    }
    if (selectedCategory && p.category_id !== selectedCategory) matches = false;
    if (selectedBrand && p.brand_id !== selectedBrand) matches = false;
    return matches;
  });

  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedProductIds.has(p.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      const newSet = new Set(selectedProductIds);
      filteredProducts.forEach(p => newSet.delete(p.id));
      setSelectedProductIds(newSet);
    } else {
      const newSet = new Set(selectedProductIds);
      filteredProducts.forEach(p => newSet.add(p.id));
      setSelectedProductIds(newSet);
    }
  }

  function toggleProductSelection(id: string) {
    const newSet = new Set(selectedProductIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedProductIds(newSet);
  }

  async function handleMassAssign() {
    if (!selectedBadge) return alert('Selecciona una cocarda primero');
    const targetProducts = selectedProductIds.size > 0 
      ? products.filter(p => selectedProductIds.has(p.id)) 
      : filteredProducts;

    if (targetProducts.length === 0) return alert('No hay productos seleccionados ni filtrados.');

    if (!confirm(`¿Asignar esta cocarda a los ${targetProducts.length} productos? Los productos que ya tengan 3 cocardas se ignorarán si no la tienen.`)) return;
    
    for (const p of targetProducts) {
      let list = getProductBadges(p.badge);
      if (!list.includes(selectedBadge) && list.length < 3) {
        list.push(selectedBadge);
        await supabase.from('products').update({ badge: list.join(',') }).eq('id', p.id);
      }
    }
    fetchData();
    setSelectedProductIds(new Set());
  }

  async function handleMassClear() {
    if (!selectedBadge) return alert('Selecciona una cocarda primero para quitarla');
    const targetProducts = selectedProductIds.size > 0 
      ? products.filter(p => selectedProductIds.has(p.id)) 
      : filteredProducts;

    if (targetProducts.length === 0) return alert('No hay productos seleccionados ni filtrados.');

    if (!confirm(`¿Quitar la cocarda seleccionada de los ${targetProducts.length} productos?`)) return;
    
    for (const p of targetProducts) {
      let list = getProductBadges(p.badge);
      if (list.includes(selectedBadge)) {
        list = list.filter(b => b !== selectedBadge);
        await supabase.from('products').update({ badge: list.join(',') || null }).eq('id', p.id);
      }
    }
    fetchData();
    setSelectedProductIds(new Set());
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary-600" /> Gestor de Cocardas PNG
          </h2>
          <p className="text-sm text-gray-500 mt-1">Sube tus imágenes PNG y asígnalas a productos, categorías o marcas. Hasta 3 por producto.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm sticky top-24">
            <h3 className="font-bold text-lg mb-4">Selector de Cocarda</h3>
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-gray-700">Cocarda Activa</label>
                  <button onClick={() => setShowCreateModal(true)} className="text-xs text-primary-600 hover:text-primary-700 font-bold flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Crear Nueva
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {badges.map(b => (
                    <div key={b.id} className="relative group">
                      <button 
                        onClick={() => setSelectedBadge(b.id)}
                        className={`w-full p-2 rounded-xl text-xs font-bold border-2 transition-all flex flex-col items-center justify-center gap-2 h-24 ${
                          selectedBadge === b.id ? 'border-primary-500 bg-primary-50 shadow-md' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {b.config?.url ? (
                          <img src={b.config.url} alt={b.label} className="h-10 object-contain drop-shadow-sm" />
                        ) : (
                          <span className="text-gray-400">{b.label}</span>
                        )}
                        <span className="truncate w-full text-center text-[10px] uppercase text-gray-600 leading-tight">{b.label}</span>
                      </button>
                      <button 
                        onClick={() => handleDeleteBadge(b.id)}
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg hover:scale-110"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {badges.length === 0 && <p className="text-xs text-gray-400 col-span-2 text-center py-4 bg-gray-50 rounded-lg">No hay cocardas creadas.</p>}
                </div>
              </div>
              
              <div className="pt-5 border-t border-gray-100">
                <h4 className="font-bold text-sm text-gray-900 mb-3">Acción de Asignación</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Aplica la cocarda seleccionada a los <strong className="text-primary-600 font-black">{selectedProductIds.size > 0 ? `${selectedProductIds.size} seleccionados` : `${filteredProducts.length} filtrados`}</strong>.
                </p>
                <div className="flex flex-col gap-2">
                  <button onClick={handleMassAssign} disabled={!selectedBadge || (filteredProducts.length === 0 && selectedProductIds.size === 0)} className="w-full bg-dark-900 disabled:opacity-50 disabled:cursor-not-allowed border border-dark-900 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-gray-800 transition-all shadow-sm">
                    Añadir Cocarda
                  </button>
                  <button onClick={handleMassClear} disabled={!selectedBadge || (filteredProducts.length === 0 && selectedProductIds.size === 0)} className="w-full bg-white disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 text-red-600 font-bold py-2.5 rounded-xl text-sm hover:bg-red-50 hover:border-red-200 transition-all">
                    Quitar Cocarda
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-3">
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
               <input 
                 type="text" 
                 placeholder="Buscar por nombre..." 
                 value={search}
                 onChange={e => setSearch(e.target.value)}
                 className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
               />
             </div>
             <select 
               value={selectedCategory} 
               onChange={e => setSelectedCategory(e.target.value)} 
               className="w-full sm:w-48 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
             >
               <option value="">Todas las Categorías</option>
               {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
             </select>
             <select 
               value={selectedBrand} 
               onChange={e => setSelectedBrand(e.target.value)} 
               className="w-full sm:w-48 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
             >
               <option value="">Todas las Marcas</option>
               {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
             </select>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="max-h-[700px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr className="border-b border-gray-200">
                    <th className="p-4 w-10">
                      <button onClick={toggleSelectAll} className="text-gray-400 hover:text-primary-600 transition-colors">
                        {allFilteredSelected ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5" />}
                      </button>
                    </th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Producto</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Categoría / Marca</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Cocardas (Max 3)</th>
                    <th className="p-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Acción Rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-medium">Cargando catálogo...</td></tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-medium">No hay productos que coincidan con los filtros.</td></tr>
                  ) : filteredProducts.map(p => {
                    const badgeList = getProductBadges(p.badge);
                    const hasSelected = selectedBadge ? badgeList.includes(selectedBadge) : false;
                    const isChecked = selectedProductIds.has(p.id);
                    
                    return (
                      <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${isChecked ? 'bg-primary-50/30' : ''}`}>
                        <td className="p-4">
                          <button onClick={() => toggleProductSelection(p.id)} className="text-gray-400 hover:text-primary-600 transition-colors">
                            {isChecked ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5" />}
                          </button>
                        </td>
                        <td className="p-4">
                          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{p.title}</p>
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          <p className="text-xs text-gray-500 mb-0.5">{p.category?.name || 'Sin Categoría'}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">{p.brand?.name || 'Sin Marca'}</p>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {badgeList.map(bid => {
                              const bObj = badges.find(b => b.id === bid);
                              if (bObj?.config?.url) return <img key={bid} src={bObj.config.url} className="h-6 w-auto object-contain drop-shadow-sm bg-white rounded p-0.5 border border-gray-100" title={bObj.label} alt={bObj.label} />;
                              return <span key={bid} className="px-2 py-1 bg-gray-100 text-gray-600 border border-gray-200 text-[9px] rounded font-bold uppercase tracking-wider">{bObj?.label || bid}</span>;
                            })}
                            {badgeList.length === 0 && <span className="text-gray-300 text-xs italic">- Ninguna -</span>}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            disabled={!selectedBadge}
                            onClick={() => selectedBadge && handleToggleBadge(p.id, p.badge, selectedBadge)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              !selectedBadge ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                              hasSelected ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 shadow-sm' : 
                              'bg-primary-50 text-primary-600 hover:bg-primary-100 border border-primary-200 shadow-sm'
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
                <Trash2 className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              <div className="bg-primary-50 p-5 rounded-2xl border border-primary-100 shadow-inner">
                <h4 className="font-bold text-primary-800 text-sm mb-3">RECOMENDACIONES DE IMAGEN</h4>
                <ul className="text-xs text-primary-700 space-y-2">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span> Formato PNG transparente</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span> Tamaño recomendado: 500x500 px</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span> Peso máximo: 200kb</li>
                </ul>
              </div>

              <div>
                <label className="text-sm font-bold text-gray-700 mb-1.5 block">Nombre interno (solo para ti)</label>
                <input 
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all" 
                  value={newBadgeLabel} 
                  onChange={e => setNewBadgeLabel(e.target.value)}
                  placeholder="Ej: OFERTA_50, VERANO_25"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-gray-700 mb-1.5 block">Archivo de imagen PNG (Obligatorio)</label>
                <div className="flex gap-2">
                  <input 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all flex-1" 
                    value={newBadgeImage}
                    onChange={e => setNewBadgeImage(e.target.value)}
                    placeholder="Escribe URL o selecciona..."
                  />
                  <button type="button" onClick={() => setShowMediaPicker(true)} className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </button>
                </div>
                {newBadgeImage && (
                  <div className="mt-4 p-6 border rounded-2xl flex justify-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
                    <img src={newBadgeImage} alt="Preview" className="h-24 object-contain drop-shadow-xl" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="text-sm font-bold text-gray-700 mb-1.5 block">Posición</label>
                   <select className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-primary-500 outline-none" value={newBadgePosition} onChange={e => setNewBadgePosition(e.target.value as any)}>
                     <option value="top-left">Izquierda (Top-Left)</option>
                     <option value="top-right">Derecha (Top-Right)</option>
                   </select>
                 </div>
                 <div>
                   <label className="text-sm font-bold text-gray-700 mb-1.5 block">Tamaño (Desktop)</label>
                   <select className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-primary-500 outline-none" value={newBadgeSize} onChange={e => setNewBadgeSize(e.target.value as any)}>
                     <option value="small">Pequeño (~80px)</option>
                     <option value="medium">Mediano (~100px)</option>
                     <option value="large">Grande (~120px)</option>
                   </select>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="text-sm font-bold text-gray-700 mb-1.5 block">Inicio (Opcional)</label>
                   <input type="datetime-local" className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:border-primary-500 outline-none" value={newBadgeStartDate} onChange={e => setNewBadgeStartDate(e.target.value)} />
                 </div>
                 <div>
                   <label className="text-sm font-bold text-gray-700 mb-1.5 block">Fin (Opcional)</label>
                   <input type="datetime-local" className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:border-primary-500 outline-none" value={newBadgeEndDate} onChange={e => setNewBadgeEndDate(e.target.value)} />
                 </div>
              </div>

            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3 bg-gray-50">
              <button onClick={() => setShowCreateModal(false)} className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-100 transition-colors flex-1">Cancelar</button>
              <button onClick={handleCreateBadge} className="px-6 py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-md shadow-primary-500/20 flex-1 flex items-center justify-center gap-2">
                <Plus className="w-5 h-5" /> Guardar
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

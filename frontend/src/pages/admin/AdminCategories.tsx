import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, Upload, List, Grid3X3 } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { MediaPickerModal } from '../../components/MediaPickerModal';

async function uploadCategoryImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const sanitized = file.name.replace(`.${ext}`, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const path = `categories/${Date.now()}-${sanitized}.${ext}`;
  const { error } = await supabase.storage.from('public-assets').upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
  return data.publicUrl;
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEmpty, setShowEmpty] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [form, setForm] = useState({ name: '', slug: '', image_url: '', sort_order: 0, ml_category_id: '', parent_id: '', is_active: true, subtitle: '', badge: '', mobile_image_url: '' });

  const [uploadingImage, setUploadingImage] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [activeMediaField, setActiveMediaField] = useState<'image_url' | 'mobile_image_url' | null>(null);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, field: 'image_url' | 'mobile_image_url') {
    if (!e.target.files?.[0]) return;
    setUploadingImage(true);
    try {
      const url = await uploadCategoryImage(e.target.files[0]);
      setForm(prev => ({ ...prev, [field]: url }));
      toast.success('Imagen subida');
    } catch { toast.error('Error al subir imagen'); }
    setUploadingImage(false);
  }

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    try {
      const { data: cats } = await supabase
        .from('categories_with_published_counts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
        
      const { data: preview, error } = await supabase.rpc('get_batch_classification_preview');
      if (error) throw error;
      
      const sorted = sortHierarchically(cats || []);
      setCategories(sorted);
      setPreviewItems(preview || []);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    }
    setLoading(false);
  }

  function sortHierarchically(list: any[]) {
    const map = new Map(list.map(c => [c.id, { ...c, children: [] }]));
    const roots: any[] = [];
    
    list.forEach(c => {
      const node = map.get(c.id);
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    const flattened: any[] = [];
    const traverse = (node: any, level: number) => {
      const childIds: string[] = [];
      const collectIds = (n: any) => {
        n.children.forEach((child: any) => {
          childIds.push(child.id);
          collectIds(child);
        });
      };
      collectIds(node);

      flattened.push({ ...node, level, subcategoryIds: childIds });
      node.children.forEach((child: any) => traverse(child, level + 1));
    };
    
    roots.forEach(root => traverse(root, 0));
    return flattened;
  }

  function getCategoryStats(catId: string, childrenIds: string[] = []) {
    const allIds = [catId, ...childrenIds];
    
    const publishedCount = categories
      .filter(c => allIds.includes(c.id))
      .reduce((sum, c) => sum + (c.published_products_count || 0), 0);
    
    const pendingCount = previewItems.filter(p => 
      p.status === 'Curation Queue' && 
      allIds.includes(p.suggested_category_id) && 
      !p.is_exception
    ).length;
    
    const conflictsCount = previewItems.filter(p => 
      p.is_exception && 
      (allIds.includes(p.category_id) || allIds.includes(p.suggested_category_id))
    ).length;
    
    return {
      publishedCount,
      pendingCount,
      conflictsCount
    };
  }

  function openCreate() { setEditing(null); setForm({ name: '', slug: '', image_url: '', sort_order: 0, ml_category_id: '', parent_id: '', is_active: true, subtitle: '', badge: '', mobile_image_url: '' }); setShowForm(true); }
  function openEdit(c: any) { setEditing(c); setForm({ name: c.name, slug: c.slug, image_url: c.image_url || '', sort_order: c.sort_order, ml_category_id: c.metadata?.ml_category_id || '', parent_id: c.parent_id || '', is_active: c.is_active ?? true, subtitle: c.metadata?.subtitle || '', badge: c.metadata?.badge || '', mobile_image_url: c.metadata?.mobile_image_url || '' }); setShowForm(true); }

  async function handleSave() {
    const payload = { 
      name: form.name, 
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), 
      image_url: form.image_url || null, 
      sort_order: form.sort_order,
      parent_id: form.parent_id || null,
      is_active: form.is_active,
      metadata: { 
        ml_category_id: form.ml_category_id || null,
        subtitle: form.subtitle || null,
        badge: form.badge || null,
        mobile_image_url: form.mobile_image_url || null
      }
    };
    if (editing) await supabase.from('categories').update(payload).eq('id', editing.id);
    else await supabase.from('categories').insert(payload);
    setShowForm(false); 
    fetch();
    toast.success(editing ? 'Categoría actualizada' : 'Categoría creada');
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Eliminar esta categoría permanentemente?', { danger: true }))) return;
    await supabase.from('categories').delete().eq('id', id);
    fetch();
    toast.success('Categoría eliminada');
  }

  const filteredCategories = categories.filter(c => {
    if (showEmpty) return true;
    const stats = getCategoryStats(c.id, c.subcategoryIds || []);
    return stats.publishedCount > 0;
  });

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
           <h2 className="text-2xl font-bold dark:text-white">Categorías</h2>
           <p className="text-sm text-gray-500 mt-1">Administra las agrupaciones de productos ({categories.length} totales)</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm hover:bg-gray-50 transition-colors">
            <input 
              type="checkbox" 
              checked={showEmpty} 
              onChange={e => setShowEmpty(e.target.checked)} 
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span>Mostrar vacías</span>
          </label>
          <div className="flex bg-gray-100 rounded-lg p-1 border">
            <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'}`} title="Vista de lista">
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'}`} title="Vista de grilla">
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>
          <button onClick={openCreate} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Crear Categoría</button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Imagen</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Productos</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Slug</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estado / Curación</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Mercado Libre</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Orden</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : filteredCategories.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No hay categorías que coincidan</td></tr>
              ) : filteredCategories.map(c => {
                const stats = getCategoryStats(c.id, c.subcategoryIds || []);
                
                // Progress Bar Math
                const subTotal = c.subcategoryIds?.length || 0;
                const subWithStock = categories.filter(sub => sub.parent_id === c.id && (sub.published_products_count || 0) > 0).length;
                const subEmptyCount = subTotal - subWithStock;
                const progress = subTotal > 0 ? (subWithStock / subTotal) * 100 : 0;

                // Status Badges
                let badge = (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>⚪ Vacía
                  </span>
                );
                if (stats.conflictsCount > 0) {
                  badge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span>🔴 Conflictos ({stats.conflictsCount})
                    </span>
                  );
                } else if (stats.pendingCount > 0) {
                  badge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>🟡 Pendiente ({stats.pendingCount})
                    </span>
                  );
                } else if (stats.publishedCount > 0) {
                  badge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>🟢 Con productos
                    </span>
                  );
                }

                return (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="w-12 h-12 rounded-lg bg-gray-50 border overflow-hidden flex items-center justify-center">
                        {c.image_url ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-gray-300" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          {c.level > 0 && <span className="text-gray-300 ml-2">└─</span>}
                          <span className={`font-bold ${c.level > 0 ? 'text-gray-600 text-sm' : 'text-gray-900 text-base'}`}>{c.name}</span>
                        </div>
                        {c.level === 0 && subTotal > 0 && (
                          <div className="mt-2 text-xs text-gray-500 space-y-1 bg-gray-50/80 p-2 rounded-lg border border-gray-150">
                            <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                              <span>Subcats: {subTotal} (Con stock: {subWithStock} | Vacías: {subEmptyCount})</span>
                              <span className="text-primary-600 font-bold">{Math.round(progress)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-primary-500 h-full rounded-full transition-all duration-500" 
                                style={{ width: `${progress}%` }} 
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        {stats.publishedCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">/{c.slug}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        {badge}
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${c.is_active !== false ? 'text-green-600' : 'text-red-500'}`}>
                          {c.is_active !== false ? 'Visible en tienda' : 'Oculto en tienda'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {c.metadata?.ml_category_id ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                          {c.metadata.ml_category_id}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Sin mapear</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-medium">{c.sort_order}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(c)} className="p-2 text-gray-450 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(c.id)} className="p-2 text-gray-450 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? <p className="text-gray-400 col-span-4 text-center py-12">Cargando categorías...</p> :
          filteredCategories.length === 0 ? <p className="text-gray-400 col-span-4 text-center py-12">No hay categorías que coincidan</p> :
          filteredCategories.map(c => {
            const stats = getCategoryStats(c.id, c.subcategoryIds || []);
            
            // Progress Bar Math
            const subTotal = c.subcategoryIds?.length || 0;
            const subWithStock = categories.filter(sub => sub.parent_id === c.id && (sub.published_products_count || 0) > 0).length;
            const subEmptyCount = subTotal - subWithStock;
            const progress = subTotal > 0 ? (subWithStock / subTotal) * 100 : 0;

            // Status Badges
            let badge = (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                ⚪ Vacía
              </span>
            );
            if (stats.conflictsCount > 0) {
              badge = (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 animate-pulse">
                  🔴 Conflictos ({stats.conflictsCount})
                </span>
              );
            } else if (stats.pendingCount > 0) {
              badge = (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  🟡 Pendiente ({stats.pendingCount})
                </span>
              );
            } else if (stats.publishedCount > 0) {
              badge = (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  🟢 Con productos
                </span>
              );
            }

            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-all group flex flex-col relative overflow-hidden">
                <div className="w-full h-32 bg-gray-50 border border-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                   <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded shadow-sm z-10">
                     {stats.publishedCount} uds.
                   </div>
                   {c.image_url ? (
                      <img src={c.image_url} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                   ) : (
                      <ImageIcon className="w-8 h-8 text-gray-300" />
                   )}
                </div>
                
                <div className="flex items-center justify-between gap-2 border-b pb-2 mb-2">
                  <h3 className="font-bold text-gray-900 truncate">{c.name}</h3>
                  {c.level > 0 && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold border">Subcat</span>}
                </div>
                <div className="flex-1 space-y-2 mb-4">
                   <div className="flex justify-between items-center text-xs">
                     <span className="font-semibold text-gray-400">Estado:</span>
                     {badge}
                   </div>
                   <p className="text-xs text-gray-500 flex justify-between"><span className="font-semibold text-gray-400">Visibilidad:</span> {c.is_active !== false ? <span className="text-[10px] bg-green-100 text-green-800 px-1.5 rounded font-bold border border-green-200">Visible</span> : <span className="text-[10px] bg-red-150 text-red-800 px-1.5 rounded font-bold border border-red-200">Oculta</span>}</p>
                   <p className="text-xs text-gray-500 flex justify-between"><span className="font-semibold text-gray-400">URL / Slug:</span> <span className="font-mono text-[10px] bg-gray-100 px-1 rounded truncate ml-2">/{c.slug}</span></p>
                   <p className="text-xs text-gray-500 flex justify-between items-center">
                      <span className="font-semibold text-gray-400">ML ID:</span> 
                      {c.metadata?.ml_category_id ? (
                        <span className="font-mono text-[10px] bg-purple-50 text-purple-800 px-1.5 py-0.5 rounded border border-purple-100 truncate ml-2">{c.metadata.ml_category_id}</span>
                      ) : (
                        <span className="text-[10px] text-gray-450 font-medium font-semibold">Sin mapear</span>
                      )}
                   </p>
                   <p className="text-xs text-gray-500 flex justify-between"><span className="font-semibold text-gray-400">Orden:</span> <span>{c.sort_order}</span></p>
                   
                   {c.level === 0 && subTotal > 0 && (
                     <div className="mt-2 pt-2 border-t text-xs text-gray-500 space-y-1">
                       <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                         <span>Subcats: {subTotal} ({subWithStock} activas)</span>
                         <span className="text-primary-600 font-bold">{Math.round(progress)}%</span>
                       </div>
                       <div className="w-full bg-gray-205 rounded-full h-1 overflow-hidden">
                         <div 
                           className="bg-primary-500 h-full rounded-full transition-all duration-300" 
                           style={{ width: `${progress}%` }} 
                         />
                       </div>
                     </div>
                   )}
                </div>
                
                <div className="flex gap-2 pt-2 border-t">
                  <button onClick={() => openEdit(c)} className="btn-secondary flex-1 py-1.5 px-3 text-xs gap-1 border-gray-200 text-gray-700 hover:bg-gray-100 shadow-none"><Pencil className="w-3 h-3" /> Editar</button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-xl font-bold">{editing ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Nombre <span className="text-red-500">*</span></label>
                 <input className="form-input w-full" value={form.name} onChange={e => setForm({...form, name: e.target.value, slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')})} placeholder="Ej: Coleccionables" />
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Regla de URL (Slug)</label>
                 <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm font-mono">/</span>
                    <input className="form-input flex-1 rounded-l-none font-mono text-sm" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="coleccionables" />
                 </div>
              </div>
              <ImageField 
                label="Imagen Desktop" 
                value={form.image_url} 
                onChange={v => setForm({...form, image_url: v})} 
                onUpload={e => handleImageUpload(e, 'image_url')} 
                onPickMedia={() => { setActiveMediaField('image_url'); setShowMediaPicker(true); }} 
                uploading={uploadingImage} 
              />
              <ImageField 
                label="Imagen Mobile (Opcional)" 
                value={form.mobile_image_url} 
                onChange={v => setForm({...form, mobile_image_url: v})} 
                onUpload={e => handleImageUpload(e, 'mobile_image_url')} 
                onPickMedia={() => { setActiveMediaField('mobile_image_url'); setShowMediaPicker(true); }} 
                uploading={uploadingImage} 
              />
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Subtítulo / Micro Storytelling</label>
                 <input className="form-input w-full" value={form.subtitle} onChange={e => setForm({...form, subtitle: e.target.value})} placeholder="Ej: Marvel, Anime y Ediciones Especiales" />
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Badge Opcional</label>
                 <input className="form-input w-full" value={form.badge} onChange={e => setForm({...form, badge: e.target.value})} placeholder="Ej: NUEVO, EXCLUSIVO" />
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Orden de Visualización</label>
                 <input type="number" className="form-input w-full" value={form.sort_order} onChange={e => setForm({...form, sort_order: parseInt(e.target.value) || 0})} />
                 <p className="text-[10px] text-gray-400 mt-1">Números menores se muestran primero en el listado visual.</p>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <input type="checkbox" id="is_active" className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
                <div>
                  <label htmlFor="is_active" className="block text-sm font-bold text-gray-900">Categoría Visible</label>
                  <p className="text-xs text-gray-500">Si desmarcas esta opción, la categoría no se mostrará a los clientes.</p>
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                 <label className="block text-xs font-black text-yellow-800 uppercase tracking-widest mb-1.5">Categoría Padre</label>
                 <select className="form-input w-full border-yellow-300 focus:ring-yellow-500 focus:border-yellow-500" value={form.parent_id} onChange={e => setForm({...form, parent_id: e.target.value})}>
                    <option value="">(Ninguna - Es categoría raíz)</option>
                    {categories.filter(c => c.id !== editing?.id && c.level === 0).map(c => (
                       <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                 </select>
              </div>
              <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                 <label className="block text-xs font-black text-yellow-800 uppercase tracking-widest mb-1.5">ID Categoría Mercado Libre (Opcional)</label>
                 <input className="form-input w-full border-yellow-300 focus:ring-yellow-500 focus:border-yellow-500" value={form.ml_category_id} onChange={e => setForm({...form, ml_category_id: e.target.value})} placeholder="Ej: MLU1051" />
                 <p className="text-[10px] text-yellow-700 mt-1">
                   Los productos importados con esta categoría de Mercado Libre se asignarán a esta categoría automáticamente. 
                   El exportador también sugerirá publicar en esta categoría.
                 </p>
              </div>
            </div>
            <div className="flex gap-3 mt-8 pt-4 border-t">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 w-full transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(37,99,235,0.3)]"><Save className="w-4 h-4" /> Guardar</button>
            </div>
          </div>
        </>
      )}
      <MediaPickerModal 
        isOpen={showMediaPicker} 
        onClose={() => { setShowMediaPicker(false); setActiveMediaField(null); }} 
        multiple={false}
        onSelect={(url) => { 
          if (activeMediaField) setForm(prev => ({ ...prev, [activeMediaField]: url })); 
          setShowMediaPicker(false); 
          setActiveMediaField(null); 
        }} 
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED: Image Field Component
// ═══════════════════════════════════════════════════════════════
function ImageField({ label, value, onChange, onUpload, onPickMedia, uploading }: {
  label: string; value: string; onChange: (v: string) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onPickMedia: () => void; uploading?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input className="form-input flex-1 text-sm font-mono" value={value} onChange={e => onChange(e.target.value)} placeholder="https://..." />
        <button type="button" onClick={onPickMedia} className="btn-secondary flex-shrink-0 px-3 bg-gray-50 border border-gray-300 hover:bg-gray-100 rounded-lg shadow-none" title="Galería"><ImageIcon className="w-4 h-4 text-gray-500" /></button>
        <label className={`btn-secondary flex-shrink-0 cursor-pointer px-3 bg-gray-50 border border-gray-300 hover:bg-gray-100 rounded-lg shadow-none ${uploading ? 'opacity-50 pointer-events-none' : ''}`} title="Subir">
          <Upload className="w-4 h-4 text-gray-500" />
          <input type="file" className="hidden" accept="image/*" onChange={onUpload} />
        </label>
      </div>
      {value && <img src={value} alt="Preview" className="w-10 h-10 mt-2 object-cover rounded border border-gray-200" />}
    </div>
  );
}

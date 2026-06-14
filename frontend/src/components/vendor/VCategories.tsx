import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, Upload, List, Grid3X3 } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import { useAuth } from '../../contexts/AuthContext';

export default function VCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [form, setForm] = useState({ name: '', slug: '', image_url: '', sort_order: 0, ml_category_id: '', parent_id: '', is_active: true, subtitle: '', badge: '', mobile_image_url: '' });

  const [uploadingImage, setUploadingImage] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [activeMediaField, setActiveMediaField] = useState<'image_url' | 'mobile_image_url' | null>(null);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  async function uploadCategoryImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop();
    const sanitized = file.name.replace(`.${ext}`, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const path = `categories/${user?.id}-${Date.now()}-${sanitized}.${ext}`;
    const { error } = await supabase.storage.from('public-assets').upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
    return data.publicUrl;
  }

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

  useEffect(() => { if (user) fetchCategories(); }, [user]);

  async function fetchCategories() {
    setLoading(true);
    const { data } = await supabase
      .from('categories')
      .select('*, product_categories(count)')
      .eq('owner_vendor_id', user!.id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    
    const sorted = sortHierarchically(data || []);
    setCategories(sorted);
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
      flattened.push({ ...node, level });
      node.children.forEach((child: any) => traverse(child, level + 1));
    };
    
    roots.forEach(root => traverse(root, 0));
    return flattened;
  }

  function openCreate() { setEditing(null); setForm({ name: '', slug: '', image_url: '', sort_order: 0, ml_category_id: '', parent_id: '', is_active: true, subtitle: '', badge: '', mobile_image_url: '' }); setShowForm(true); }
  function openEdit(c: any) { setEditing(c); setForm({ name: c.name, slug: c.slug, image_url: c.image_url || '', sort_order: c.sort_order, ml_category_id: c.metadata?.ml_category_id || '', parent_id: c.parent_id || '', is_active: c.is_active ?? true, subtitle: c.metadata?.subtitle || '', badge: c.metadata?.badge || '', mobile_image_url: c.metadata?.mobile_image_url || '' }); setShowForm(true); }

  async function handleSave() {
    let slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    // Append vendor prefix to slug to avoid global collisions
    if (!slug.includes(`-v${user!.id.substring(0,4)}`)) {
        slug = `${slug}-v${user!.id.substring(0,4)}`;
    }

    const payload = { 
      name: form.name, 
      slug, 
      image_url: form.image_url || null, 
      sort_order: form.sort_order,
      parent_id: form.parent_id || null,
      is_active: form.is_active,
      owner_vendor_id: user!.id,
      status: 'pending_review',
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
    fetchCategories();
    toast.success(editing ? 'Categoría actualizada' : 'Categoría creada');
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Eliminar esta categoría permanentemente?', { danger: true }))) return;
    await supabase.from('categories').delete().eq('id', id);
    fetchCategories();
    toast.success('Categoría eliminada');
  }

  return (
    <div className="animation-fade-in text-gray-900">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
        <div>
           <h2 className="text-2xl font-bold">Mis Categorías</h2>
           <p className="text-sm text-gray-500 mt-1">Administra tus propias agrupaciones de productos ({categories.length} creadas)</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1 hidden sm:flex">
            <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`} title="Vista de lista">
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`} title="Vista de grilla">
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"><Plus className="w-4 h-4" /> Crear Categoría</button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Imagen</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Nombre</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Productos</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : categories.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No tienes categorías personalizadas</td></tr>
              ) : categories.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-50 border overflow-hidden flex items-center justify-center">
                      {c.image_url ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-gray-300" />}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {c.level > 0 && <span className="text-gray-300 ml-2">└─</span>}
                      <span className={`font-semibold ${c.level > 0 ? 'text-gray-600' : 'text-gray-900'}`}>{c.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500"><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">{c.product_categories?.[0]?.count || 0}</span></td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {c.is_active !== false ? (
                        <span className="inline-flex items-center w-max px-2 py-0.5 rounded text-[9px] font-bold bg-green-100 text-green-800 tracking-wider">VISIBLE</span>
                      ) : (
                        <span className="inline-flex items-center w-max px-2 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-800 tracking-wider">OCULTA</span>
                      )}
                      
                      {c.status === 'approved' && (
                        <span className="inline-flex items-center w-max px-2 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 tracking-wider">APROBADA</span>
                      )}
                      {c.status === 'pending_review' && (
                        <span className="inline-flex items-center w-max px-2 py-0.5 rounded text-[9px] font-bold bg-yellow-100 text-yellow-800 tracking-wider">PENDIENTE</span>
                      )}
                      {c.status === 'rejected' && (
                        <span className="inline-flex items-center w-max px-2 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-800 tracking-wider">RECHAZADA</span>
                      )}
                      {c.status === 'merged' && (
                        <span className="inline-flex items-center w-max px-2 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-800 tracking-wider">FUSIONADA</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(c.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? <p className="text-gray-400 col-span-4 text-center py-12">Cargando...</p> :
          categories.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all flex flex-col">
              <div className="w-full h-32 bg-gray-50 border border-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                 <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded shadow-sm z-10">
                   {c.product_categories?.[0]?.count || 0}
                 </div>
                 {c.image_url ? (
                    <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                 ) : (
                    <ImageIcon className="w-8 h-8 text-gray-300" />
                 )}
              </div>
              <h3 className="font-bold text-gray-900 border-b pb-2 mb-2">{c.name}</h3>
              <div className="flex-1 space-y-1 mb-4 text-xs">
                 <p className="flex justify-between items-center"><span className="text-gray-400">Estado:</span> {c.is_active !== false ? <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-bold">VISIBLE</span> : <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-bold">OCULTA</span>}</p>
                 <p className="flex justify-between items-center"><span className="text-gray-400">Orden:</span> <span className="font-mono">{c.sort_order}</span></p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(c)} className="flex-1 py-2 px-3 text-xs bg-gray-50 font-bold border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-lg flex items-center justify-center gap-1 transition-colors"><Pencil className="w-3 h-3" /> Editar</button>
                <button onClick={() => handleDelete(c.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg border border-transparent transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-xl font-bold">{editing ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Nombre <span className="text-red-500">*</span></label>
                 <input className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={form.name} onChange={e => setForm({...form, name: e.target.value, slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')})} placeholder="Ej: Coleccionables Exclusivos" />
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Regla de URL (Slug)</label>
                 <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-200 bg-gray-100 text-gray-500 text-sm font-mono">/</span>
                    <input className="w-full bg-gray-50 border border-gray-200 rounded-r-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="coleccionables-exclusivos" disabled={!!editing} />
                 </div>
              </div>
              <ImageField 
                label="Imagen Destacada" 
                value={form.image_url} 
                onChange={v => setForm({...form, image_url: v})} 
                onUpload={e => handleImageUpload(e, 'image_url')} 
                onPickMedia={() => { setActiveMediaField('image_url'); setShowMediaPicker(true); }} 
                uploading={uploadingImage} 
              />
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Orden de Visualización</label>
                 <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={form.sort_order} onChange={e => setForm({...form, sort_order: parseInt(e.target.value) || 0})} />
              </div>
              <div className="flex items-center gap-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <input type="checkbox" id="is_active" className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
                <div>
                  <label htmlFor="is_active" className="block text-sm font-bold text-gray-900">Categoría Visible</label>
                  <p className="text-xs text-gray-500">Si desmarcas esta opción, la categoría no se mostrará a los clientes.</p>
                </div>
              </div>
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                 <label className="block text-xs font-black text-blue-800 uppercase tracking-widest mb-1.5">Categoría Padre</label>
                 <select className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={form.parent_id} onChange={e => setForm({...form, parent_id: e.target.value})}>
                    <option value="">(Ninguna - Es categoría raíz)</option>
                    {categories.filter(c => c.id !== editing?.id && c.level === 0).map(c => (
                       <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                 </select>
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

function ImageField({ label, value, onChange, onUpload, onPickMedia, uploading }: {
  label: string; value: string; onChange: (v: string) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onPickMedia: () => void; uploading?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" value={value} onChange={e => onChange(e.target.value)} placeholder="https://..." />
        <button type="button" onClick={onPickMedia} className="flex-shrink-0 px-3 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-sm" title="Galería"><ImageIcon className="w-4 h-4 text-gray-500" /></button>
        <label className={`flex-shrink-0 cursor-pointer px-3 flex items-center justify-center bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-sm ${uploading ? 'opacity-50 pointer-events-none' : ''}`} title="Subir">
          <Upload className="w-4 h-4 text-gray-500" />
          <input type="file" className="hidden" accept="image/*" onChange={onUpload} />
        </label>
      </div>
      {value && <img src={value} alt="Preview" className="w-10 h-10 mt-2 object-cover rounded border border-gray-200" />}
    </div>
  );
}

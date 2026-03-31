import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, List, Grid3X3 } from 'lucide-react';

export default function AdminCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [form, setForm] = useState({ name: '', slug: '', image_url: '', sort_order: 0 });

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from('categories').select('*').order('sort_order', { ascending: true });
    setCategories(data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm({ name: '', slug: '', image_url: '', sort_order: 0 }); setShowForm(true); }
  function openEdit(c: any) { setEditing(c); setForm({ name: c.name, slug: c.slug, image_url: c.image_url || '', sort_order: c.sort_order }); setShowForm(true); }

  async function handleSave() {
    const payload = { 
      name: form.name, 
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), 
      image_url: form.image_url || null, 
      sort_order: form.sort_order 
    };
    if (editing) await supabase.from('categories').update(payload).eq('id', editing.id);
    else await supabase.from('categories').insert(payload);
    setShowForm(false); 
    fetch();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta categoría permanentemente?')) return;
    await supabase.from('categories').delete().eq('id', id);
    fetch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
           <h2 className="text-2xl font-bold dark:text-white">Categorías</h2>
           <p className="text-sm text-gray-500 mt-1">Administra las agrupaciones de productos ({categories.length} totales)</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Imagen</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Slug</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Orden</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : categories.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No hay categorías</td></tr>
              ) : categories.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-50 border overflow-hidden flex items-center justify-center">
                      {c.image_url ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-gray-300" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-gray-900">{c.name}</td>
                  <td className="px-6 py-4 font-mono text-sm text-gray-500">/{c.slug}</td>
                  <td className="px-6 py-4 text-gray-500">{c.sort_order}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
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
          {loading ? <p className="text-gray-400 col-span-4 text-center py-12">Cargando categorías...</p> :
          categories.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-all group flex flex-col">
              <div className="w-full h-32 bg-gray-50 border border-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                 {c.image_url ? (
                    <img src={c.image_url} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                 ) : (
                    <ImageIcon className="w-8 h-8 text-gray-300" />
                 )}
              </div>
              
              <h3 className="font-bold text-gray-900 border-b pb-2 mb-2">{c.name}</h3>
              <div className="flex-1 space-y-1 mb-4">
                 <p className="text-xs text-gray-500 flex justify-between"><span className="font-medium text-gray-400">URL / Slug:</span> <span className="font-mono text-[10px] bg-gray-100 px-1 rounded truncate ml-2">/{c.slug}</span></p>
                 <p className="text-xs text-gray-500 flex justify-between"><span className="font-medium text-gray-400">Orden:</span> <span>{c.sort_order}</span></p>
              </div>
              
              <div className="flex gap-2">
                <button onClick={() => openEdit(c)} className="btn-secondary flex-1 py-1.5 px-3 text-xs gap-1 border-gray-200 text-gray-700 hover:bg-gray-100 shadow-none"><Pencil className="w-3 h-3" /> Editar</button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
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
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Logo / Archivo Adjunto (URL URL)</label>
                 <div className="flex gap-2">
                    <input className="form-input flex-1 text-sm" placeholder="https://..." value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} />
                    {form.image_url && <img src={form.image_url} className="w-10 h-10 object-cover rounded border border-gray-200" />}
                 </div>
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Orden de Visualización</label>
                 <input type="number" className="form-input w-full" value={form.sort_order} onChange={e => setForm({...form, sort_order: parseInt(e.target.value) || 0})} />
                 <p className="text-[10px] text-gray-400 mt-1">Números menores se muestran primero en el listado visual.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-8 pt-4 border-t">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 w-full transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(37,99,235,0.3)]"><Save className="w-4 h-4" /> Guardar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

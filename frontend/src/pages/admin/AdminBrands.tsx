import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, List, Grid3X3 } from 'lucide-react';

export default function AdminBrands() {
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [form, setForm] = useState({ name: '', slug: '', description: '', logo_url: '' });

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from('brands').select('*').order('name', { ascending: true });
    setBrands(data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm({ name: '', slug: '', description: '', logo_url: '' }); setShowForm(true); }
  function openEdit(b: any) { setEditing(b); setForm({ name: b.name, slug: b.slug, description: b.description || '', logo_url: b.logo_url || '' }); setShowForm(true); }

  async function handleSave() {
    const payload = { 
      name: form.name, 
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), 
      description: form.description || null,
      logo_url: form.logo_url || null
    };
    if (editing) await supabase.from('brands').update(payload).eq('id', editing.id);
    else await supabase.from('brands').insert(payload);
    setShowForm(false); 
    fetch();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta marca permanentemente?')) return;
    await supabase.from('brands').delete().eq('id', id);
    fetch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
           <h2 className="text-2xl font-bold dark:text-white">Marcas</h2>
           <p className="text-sm text-gray-500 mt-1">Gestión del directorio de marcas ({brands.length} totales)</p>
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
          <button onClick={openCreate} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Nueva Marca</button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Logo</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Slug</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Descripción</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : brands.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No hay marcas</td></tr>
              ) : brands.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-50 border overflow-hidden flex items-center justify-center">
                      {b.logo_url ? <img src={b.logo_url} alt={b.name} className="w-full h-full object-contain" /> : <ImageIcon className="w-5 h-5 text-gray-300" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-gray-900">{b.name}</td>
                  <td className="px-6 py-4 font-mono text-sm text-gray-500">/{b.slug}</td>
                  <td className="px-6 py-4 text-gray-500 text-sm max-w-xs truncate">{b.description || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(b)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(b.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? <p className="text-gray-400 col-span-4 text-center py-12">Cargando marcas...</p> :
          brands.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-all group flex flex-col">
              <div className="w-full h-32 bg-gray-50 border border-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden p-4">
                 {b.logo_url ? (
                    <img src={b.logo_url} alt={b.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                 ) : (
                    <ImageIcon className="w-10 h-10 text-gray-300" />
                 )}
              </div>
              
              <h3 className="font-bold text-gray-900 border-b pb-2 mb-2">{b.name}</h3>
              <div className="flex-1 space-y-1 mb-4">
                 <p className="text-xs text-gray-500 flex justify-between"><span className="font-medium text-gray-400">Slug:</span> <span className="font-mono text-[10px] bg-gray-100 px-1 rounded truncate ml-2">/{b.slug}</span></p>
                 {b.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{b.description}</p>}
              </div>
              
              <div className="flex gap-2">
                <button onClick={() => openEdit(b)} className="btn-secondary flex-1 py-1.5 px-3 text-xs gap-1 border-gray-200 text-gray-700 hover:bg-gray-100 shadow-none"><Pencil className="w-3 h-3" /> Editar</button>
                <button onClick={() => handleDelete(b.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
          {!loading && brands.length === 0 && (
             <div className="col-span-4 text-center py-16 bg-white border border-dashed border-gray-300 rounded-xl">
                <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-900">No hay marcas configuradas</h3>
                <p className="text-gray-500 text-sm mt-1 mb-4">Empieza agregando las marcas de los productos que vendes.</p>
                <button onClick={openCreate} className="btn-primary mx-auto">Crear la primera marca</button>
             </div>
          )}
        </div>
      )}

      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-xl font-bold">{editing ? 'Editar Marca' : 'Nueva Marca'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Nombre comercial <span className="text-red-500">*</span></label>
                 <input className="form-input w-full" value={form.name} onChange={e => setForm({...form, name: e.target.value, slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')})} placeholder="Ej: Funko" />
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Regla de URL (Slug)</label>
                 <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm font-mono">/brands/</span>
                    <input className="form-input flex-1 rounded-l-none font-mono text-sm" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="funko" />
                 </div>
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Logo (URL de Imagen)</label>
                 <div className="flex gap-2">
                    <input className="form-input flex-1 text-sm" placeholder="https://..." value={form.logo_url} onChange={e => setForm({...form, logo_url: e.target.value})} />
                    {form.logo_url && <img src={form.logo_url} className="w-10 h-10 object-contain rounded border border-gray-200 bg-gray-50 p-1" />}
                 </div>
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Descripción Corta</label>
                 <textarea rows={3} className="form-input w-full text-sm resize-none" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Breve biografía de la marca para SEO..." />
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

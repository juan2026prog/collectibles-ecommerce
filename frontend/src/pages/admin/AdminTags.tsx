import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Tag as TagIcon, Search } from 'lucide-react';

export default function AdminTags() {
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', slug: '' });

  useEffect(() => { fetchTags(); }, []);

  async function fetchTags() {
    setLoading(true);
    const { data } = await supabase.from('tags').select('*').order('name', { ascending: true });
    setTags(data || []);
    setLoading(false);
  }

  function openCreate() { 
    setEditing(null); 
    setForm({ name: '', slug: '' }); 
    setShowForm(true); 
  }

  function openEdit(t: any) { 
    setEditing(t); 
    setForm({ name: t.name, slug: t.slug }); 
    setShowForm(true); 
  }

  async function handleSave() {
    const slugValue = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const payload = { name: form.name, slug: slugValue };
    
    if (editing) {
      await supabase.from('tags').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('tags').insert(payload);
    }
    
    setShowForm(false); 
    fetchTags();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta etiqueta? Se quitará de todos los productos.')) return;
    await supabase.from('tags').delete().eq('id', id);
    fetchTags();
  }

  const filteredTags = tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-2xl font-black text-dark-900 uppercase tracking-tight">Etiquetas / Tags</h2>
           <p className="text-sm text-gray-500 mt-1">Gestión global de palabras clave para el catálogo.</p>
        </div>
        <button onClick={openCreate} className="btn-primary gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 border-indigo-600">
           <Plus className="w-5 h-5" /> Nueva Etiqueta
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
         <div className="p-4 border-b bg-gray-50/50 flex gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar etiquetas..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium" />
            </div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">{filteredTags.length} etiquetas encontradas</div>
         </div>
         
         <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
               <thead className="bg-gray-50/80">
                  <tr className="text-left">
                     <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nombre</th>
                     <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Slug</th>
                     <th className="px-8 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Acciones</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                  {loading ? (
                     <tr><td colSpan={3} className="px-8 py-12 text-center text-gray-400 animate-pulse font-medium">Cargando etiquetas...</td></tr>
                  ) : filteredTags.length === 0 ? (
                     <tr><td colSpan={3} className="px-8 py-12 text-center text-gray-400 font-medium">No se encontraron etiquetas.</td></tr>
                  ) : filteredTags.map(tag => (
                     <tr key={tag.id} className="hover:bg-indigo-50/20 transition-all group">
                        <td className="px-8 py-4">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                 <TagIcon className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-dark-900 group-hover:text-indigo-600 transition-colors">{tag.name}</span>
                           </div>
                        </td>
                        <td className="px-8 py-4 font-mono text-xs text-gray-400">{tag.slug}</td>
                        <td className="px-8 py-4 text-right">
                           <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(tag)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                              <button onClick={() => handleDelete(tag.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      {showForm && (
        <>
          <div className="fixed inset-0 bg-dark-900/60 z-[110] backdrop-blur-sm animate-fade-in" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white z-[120] rounded-3xl shadow-2xl p-8 animate-scale-in">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-gray-900">{editing ? 'Editar Etiqueta' : 'Nueva Etiqueta'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-6">
              <div>
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Nombre de la etiqueta</label>
                 <input className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold text-dark-900 outline-none focus:border-indigo-500 focus:bg-white transition-all" 
                   autoFocus
                   value={form.name} onChange={e => setForm({...form, name: e.target.value, slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')})} placeholder="Ej: Marvel" />
              </div>
              
              <div>
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Slug (URL)</label>
                 <div className="flex items-center px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl overflow-hidden">
                    <span className="text-gray-400 font-mono text-sm mr-2">/</span>
                    <input className="flex-1 bg-transparent font-mono text-sm outline-none text-indigo-600" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="marvel" />
                 </div>
              </div>
            </div>

            <div className="flex gap-3 mt-10">
              <button onClick={() => setShowForm(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 font-black rounded-2xl hover:bg-gray-200 transition-all uppercase text-xs tracking-widest">Cancelar</button>
              <button onClick={handleSave} disabled={!form.name} 
                className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all uppercase text-xs tracking-widest disabled:opacity-30 flex items-center justify-center gap-2 shadow-xl shadow-indigo-100">
                <Save className="w-4 h-4" /> Guardar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

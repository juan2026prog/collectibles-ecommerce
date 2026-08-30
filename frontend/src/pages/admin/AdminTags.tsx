import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Tag as TagIcon, Search } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

export default function AdminTags() {
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', slug: '' });

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

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
    toast.success(editing ? 'Etiqueta actualizada' : 'Etiqueta creada');
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Eliminar esta etiqueta? Se quitará de todos los productos.', { danger: true }))) return;
    await supabase.from('tags').delete().eq('id', id);
    fetchTags();
    toast.success('Etiqueta eliminada');
  }

  const filteredTags = tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Etiquetas</h2>
          <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200">
            {tags.length} {tags.length === 1 ? 'etiqueta' : 'etiquetas'}
          </span>
        </div>
        <button onClick={openCreate} className="bg-[#f00856] hover:bg-[#ff2c68] text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl cursor-pointer min-h-[44px] shadow-sm active:scale-95 flex items-center justify-center gap-1.5 transition-all">
          <Plus className="w-4 h-4" /> Nueva Etiqueta
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden flex flex-col">
         <div className="p-3 sm:p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar etiquetas..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium bg-white min-h-[44px]" />
            </div>
            <div className="text-xs font-bold text-gray-500">{filteredTags.length} encontradas</div>
         </div>
         
         {/* Mobile Card List (<768px) */}
         <div className="md:hidden divide-y divide-gray-100">
            {loading ? (
               <div className="p-6 text-center text-gray-400 text-xs font-bold animate-pulse">Cargando etiquetas...</div>
            ) : filteredTags.length === 0 ? (
               <div className="p-6 text-center text-gray-400 text-xs font-medium">No se encontraron etiquetas</div>
            ) : filteredTags.map(tag => (
               <div key={tag.id} className="p-3.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                     <div className="p-2 bg-gray-100 rounded-lg text-gray-600 shrink-0">
                        <TagIcon className="w-4 h-4" />
                     </div>
                     <div className="min-w-0">
                        <span className="font-bold text-gray-900 text-sm block truncate">{tag.name}</span>
                        <span className="font-mono text-xs text-gray-400 block truncate">{tag.slug}</span>
                     </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                     <button onClick={() => openEdit(tag)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <Pencil className="w-4 h-4" />
                     </button>
                     <button onClick={() => handleDelete(tag.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
               </div>
            ))}
         </div>

         {/* Desktop Table View (>=768px) */}
         <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
               <thead className="bg-gray-50/80">
                  <tr className="text-left">
                     <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nombre</th>
                     <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Slug</th>
                     <th className="px-6 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Acciones</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                  {loading ? (
                     <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 animate-pulse font-medium">Cargando etiquetas...</td></tr>
                  ) : filteredTags.length === 0 ? (
                     <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 font-medium">No se encontraron etiquetas.</td></tr>
                  ) : filteredTags.map(tag => (
                     <tr key={tag.id} className="hover:bg-gray-50/50 transition-all group">
                        <td className="px-6 py-3.5">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                                 <TagIcon className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-gray-900 text-sm">{tag.name}</span>
                           </div>
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs text-gray-500">{tag.slug}</td>
                        <td className="px-6 py-3.5 text-right">
                           <div className="flex justify-end gap-1">
                              <button onClick={() => openEdit(tag)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white z-[120]  shadow-2xl p-8 animate-scale-in">
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

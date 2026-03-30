import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdminPages() {
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ title: '', slug: '', content: '', status: 'published' });

  useEffect(() => { fetchPages(); }, []);

  async function fetchPages() {
    setLoading(true);
    const { data } = await supabase.from('pages').select('*').order('created_at', { ascending: false });
    setPages(data || []);
    setLoading(false);
  }

  function openCreate() { 
     setEditing(null); 
     setForm({ title: '', slug: '', content: '', status: 'published' }); 
     setShowForm(true); 
  }
  
  function openEdit(p: any) { 
     setEditing(p); 
     setForm({ title: p.title, slug: p.slug, content: p.content || '', status: p.status }); 
     setShowForm(true); 
  }

  async function handleSave() {
    const payload = { 
      title: form.title, 
      slug: form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), 
      content: form.content || null,
      status: form.status,
      updated_at: new Date().toISOString()
    };
    if (editing) await supabase.from('pages').update(payload).eq('id', editing.id);
    else await supabase.from('pages').insert(payload);
    setShowForm(false); 
    fetchPages();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta página de forma definitiva?')) return;
    await supabase.from('pages').delete().eq('id', id);
    fetchPages();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
           <h2 className="text-2xl font-bold dark:text-white">Páginas Institucionales</h2>
           <p className="text-sm text-gray-500 mt-1">Crea páginas estáticas (Contacto, Políticas, FAQs).</p>
        </div>
        <button onClick={openCreate} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Crear Página</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
           <div className="p-12 text-center text-gray-400 flex flex-col items-center">
              <RefreshCw className="w-8 h-8 animate-spin mb-4" /> Cargando páginas...
           </div>
        ) : pages.length === 0 ? (
           <div className="text-center py-16">
              <h3 className="text-lg font-bold text-gray-900 mb-1">No hay páginas creadas</h3>
              <p className="text-gray-500 text-sm mb-4">Empieza añadiendo tu política de privacidad o sobre nosotros.</p>
              <button onClick={openCreate} className="btn-primary mx-auto">Crear tu primera página</button>
           </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
             <thead className="bg-gray-50">
               <tr>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Título</th>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">URL (Slug)</th>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Estado</th>
                 <th className="px-6 py-3 text-right text-xs font-black text-gray-500 uppercase tracking-widest">Acciones</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
               {pages.map(p => (
                 <tr key={p.id} className="hover:bg-gray-50">
                   <td className="px-6 py-4 font-bold text-sm text-gray-900">{p.title}</td>
                   <td className="px-6 py-4 text-sm font-mono text-blue-600">/page/{p.slug}</td>
                   <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded ${p.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                         {p.status === 'published' ? 'Publicado' : 'Borrador'}
                      </span>
                   </td>
                   <td className="px-6 py-4 text-right flex justify-end gap-2">
                     <Link to={`/page/${p.slug}`} target="_blank" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Ver en tienda"><ExternalLink className="w-4 h-4" /></Link>
                     <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Editar"><Pencil className="w-4 h-4" /></button>
                     <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                   </td>
                 </tr>
               ))}
             </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white z-50 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold">{editing ? 'Editar Página' : 'Nueva Página'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Título de la Página *</label>
                    <input className="form-input w-full" value={form.title} onChange={e => setForm({...form, title: e.target.value, slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')})} placeholder="Ej: Quiénes Somos" autoFocus />
                 </div>
                 <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Ruta URL (Slug)</label>
                    <div className="flex">
                       <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm font-mono">/page/</span>
                       <input className="form-input flex-1 rounded-l-none font-mono text-sm" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} />
                    </div>
                 </div>
              </div>
              
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5 flex justify-between">
                    <span>Contenido (Soporta HTML)</span>
                    <a href="https://wordhtml.com/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline normal-case">Usar editor externo sugerido</a>
                 </label>
                 <textarea rows={12} className="form-input w-full font-mono text-sm bg-gray-50 focus:bg-white transition-colors" value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="<h1>Bienvenido...</h1><p>Nuestra historia...</p>" />
              </div>
              
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Visibilidad</label>
                 <select className="form-input w-full" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="published">🟢 Publicado (Visible en tienda)</option>
                    <option value="draft">🟡 Borrador (Oculto)</option>
                 </select>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={!form.title} className="px-8 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"><Save className="w-4 h-4" /> Guardar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

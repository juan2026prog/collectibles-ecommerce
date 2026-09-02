import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Eye, EyeOff, LayoutTemplate, Layers } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

export default function AdminThemes() {
  const [themes, setThemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    is_active: true,
    sort_order: 0
  });

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchThemes();
  }, []);

  async function fetchThemes() {
    setLoading(true);
    let { data, error } = await supabase
      .from('themes_with_counts')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error || !data) {
      const fb = await supabase.from('themes').select('*').order('sort_order', { ascending: true });
      data = fb.data || [];
    }

    setThemes(data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', slug: '', description: '', is_active: true, sort_order: themes.length + 1 });
    setShowForm(true);
  }

  function openEdit(t: any) {
    setEditing(t);
    setForm({
      name: t.name,
      slug: t.slug,
      description: t.description || '',
      is_active: t.is_active ?? true,
      sort_order: t.sort_order || 0
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;

    const payload = {
      name: form.name.trim(),
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: form.description || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
      updated_at: new Date().toISOString()
    };

    if (editing) {
      const { error } = await supabase.from('themes').update(payload).eq('id', editing.id);
      if (error) {
        toast.error('Error al actualizar el Theme: ' + error.message);
        return;
      }
      toast.success('Theme actualizado');
    } else {
      const { error } = await supabase.from('themes').insert(payload);
      if (error) {
        toast.error('Error al crear el Theme: ' + error.message);
        return;
      }
      toast.success('Theme creado');
    }

    setShowForm(false);
    fetchThemes();
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Eliminar este Theme permanentemente?', { danger: true }))) return;
    await supabase.from('themes').delete().eq('id', id);
    fetchThemes();
    toast.success('Theme eliminado');
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Themes (Temáticas Comercial)</h2>
          <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-1 rounded-full border border-purple-200">
            {themes.length} {themes.length === 1 ? 'theme' : 'themes'}
          </span>
        </div>

        <button onClick={openCreate} className="bg-[#f00856] hover:bg-[#ff2c68] text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl cursor-pointer min-h-[44px] shadow-sm active:scale-95 flex items-center justify-center gap-1.5 transition-all">
          <Plus className="w-4 h-4" /> Nuevo Theme
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Slug / Ruta</th>
              <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Licencias Asociadas</th>
              <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Productos Publicados</th>
              <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Orden</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">Cargando Themes...</td></tr>
            ) : themes.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No hay Themes configurados</td></tr>
            ) : themes.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-bold text-gray-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>{t.name}</span>
                </td>
                <td className="px-6 py-4 font-mono text-xs text-gray-500">/themes/{t.slug}</td>
                <td className="px-6 py-4 text-center font-bold text-purple-700">{t.active_licenses_count ?? 0}</td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    (t.published_product_count ?? 0) > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {t.published_product_count ?? 0}
                  </span>
                </td>
                <td className="px-6 py-4 text-center text-gray-500">{t.sort_order || 0}</td>
                <td className="px-6 py-4">
                  {t.is_active !== false ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Activo</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Inactivo</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(t)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(t.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-xl font-bold">{editing ? 'Editar Theme' : 'Nuevo Theme'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Nombre del Theme <span className="text-red-500">*</span></label>
                <input
                  className="form-input w-full"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value, slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') })}
                  placeholder="Ej: Cine & TV"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Slug URL</label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-xs font-mono">/themes/</span>
                  <input
                    className="form-input flex-1 rounded-l-none font-mono text-xs"
                    value={form.slug}
                    onChange={e => setForm({ ...form, slug: e.target.value })}
                    placeholder="cine-tv"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Descripción</label>
                <textarea rows={3} className="form-input w-full text-xs resize-none" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Breve resumen del Theme comercial..." />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Orden de Visualización</label>
                <input type="number" className="form-input w-full text-xs" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
              </div>

              <div className="flex items-center gap-2 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                <input type="checkbox" id="is_active_theme" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 text-purple-600 rounded" />
                <label htmlFor="is_active_theme" className="text-xs font-bold text-gray-900 cursor-pointer">Theme Activo</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full">Cancelar</button>
              <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 w-full flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Guardar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

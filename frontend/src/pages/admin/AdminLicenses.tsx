import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Sparkles, List, Grid3X3, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

export default function AdminLicenses() {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [form, setForm] = useState({ name: '', slug: '', description: '', logo_url: '', is_active: true, sort_order: 0 });

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => { fetchLicenses(); }, []);

  async function fetchLicenses() {
    setLoading(true);
    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) {
      toast.error('Error al cargar licencias: ' + error.message);
    } else {
      setLicenses(data || []);
    }
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', slug: '', description: '', logo_url: '', is_active: true, sort_order: 0 });
    setShowForm(true);
  }

  function openEdit(lic: any) {
    setEditing(lic);
    setForm({
      name: lic.name,
      slug: lic.slug,
      description: lic.description || '',
      logo_url: lic.logo_url || '',
      is_active: lic.is_active ?? true,
      sort_order: lic.sort_order || 0
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('El nombre de la licencia es obligatorio.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: form.description || null,
      logo_url: form.logo_url || null,
      is_active: form.is_active,
      sort_order: form.sort_order
    };

    if (editing) {
      const { error } = await supabase.from('licenses').update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Licencia actualizada');
    } else {
      const { error } = await supabase.from('licenses').insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success('Licencia creada');
    }

    setShowForm(false);
    fetchLicenses();
  }

  async function handleDelete(id: string) {
    const confirmed = await confirm({
      title: '¿Eliminar Licencia?',
      message: 'Esta acción eliminará la licencia. Los productos asociados perderán la vinculación a esta licencia.',
      type: 'warning'
    });
    if (!confirmed) return;

    const { error } = await supabase.from('licenses').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Licencia eliminada');
      fetchLicenses();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-500">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold dark:text-white">Licencias y Franquicias</h2>
              <p className="text-sm text-gray-500 mt-0.5">Gestión de la propiedad intelectual, personajes y universos ({licenses.length} activas)</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
            <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>
          <button onClick={openCreate} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nueva Licencia
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-gray-200 dark:border-slate-800 text-center text-gray-400">
          Cargando licencias...
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs text-gray-700 dark:text-slate-300 divide-y divide-gray-200 dark:divide-slate-800">
            <thead className="bg-gray-50 dark:bg-slate-950 font-bold uppercase tracking-wider text-[10px] text-gray-500">
              <tr>
                <th className="py-3.5 px-4">Nombre Licencia</th>
                <th className="py-3.5 px-4">Slug</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4">Orden</th>
                <th className="py-3.5 px-4">Descripción</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {licenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400">No hay licencias registradas.</td>
                </tr>
              ) : (
                licenses.map(lic => (
                  <tr key={lic.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      {lic.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-500 text-[11px]">/{lic.slug}</td>
                    <td className="py-3 px-4">
                      {lic.is_active ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800 border border-green-200">Activa</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">Inactiva</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-500 font-semibold">{lic.sort_order || 0}</td>
                    <td className="py-3 px-4 text-gray-500 max-w-xs truncate">{lic.description || '-'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(lic)} className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(lic.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {licenses.map(lic => (
            <div key={lic.id} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4 shadow-sm space-y-2">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">{lic.name}</h3>
                <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">/{lic.slug}</span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{lic.description || 'Sin descripción'}</p>
              <div className="flex justify-between items-center pt-2 border-t text-xs">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${lic.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                  {lic.is_active ? 'Activa' : 'Inactiva'}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(lic)} className="p-1 text-gray-400 hover:text-amber-600"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(lic.id)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">{editing ? 'Editar Licencia' : 'Nueva Licencia'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Nombre de la Licencia *</label>
                <input
                  type="text"
                  placeholder="Ej: Marvel, Star Wars, Pokémon..."
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-xl focus:outline-none focus:border-amber-500 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Slug (URL)</label>
                <input
                  type="text"
                  placeholder="marvel"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-xl focus:outline-none focus:border-amber-500 dark:bg-slate-950 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Descripción</label>
                <textarea
                  rows={3}
                  placeholder="Breve reseña de la propiedad o universo..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-xl focus:outline-none focus:border-amber-500 dark:bg-slate-950 dark:text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Orden de Visualización</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-xs border rounded-xl focus:outline-none focus:border-amber-500 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-slate-300 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                Licencia Activa (Visible en catálogo y filtros)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-gray-200"
              >
                Cancelar
              </button>

              <button
                onClick={handleSave}
                disabled={!form.name.trim()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

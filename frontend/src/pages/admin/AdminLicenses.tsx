import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, List, Grid3X3, Search, Star, Eye, EyeOff, Check, ShieldCheck, Upload, Info, ChevronRight } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import { validateImageFile, uploadOptimizedMedia } from '../../utils/responsiveMedia';

export default function AdminLicenses() {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [themesList, setThemesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'sort_order' | 'name' | 'published_desc'>('sort_order');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [activeMediaTarget, setActiveMediaTarget] = useState<'logo' | 'banner' | null>(null);
  const [processingImage, setProcessingImage] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    logo_url: '',
    logo_alt: '',
    banner_url: '',
    is_active: true,
    is_featured: false,
    sort_order: 0,
    selectedThemeIds: [] as string[]
  });

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchThemes();
  }, []);

  useEffect(() => {
    fetchLicenses();
  }, [sortBy]);

  async function fetchThemes() {
    const { data } = await supabase.from('themes').select('*').order('sort_order');
    setThemesList(data || []);
  }

  async function fetchLicenses() {
    setLoading(true);
    let query = supabase.from('licenses_with_counts').select('*');

    if (sortBy === 'sort_order') {
      query = query.order('sort_order', { ascending: true }).order('name', { ascending: true });
    } else if (sortBy === 'name') {
      query = query.order('name', { ascending: true });
    } else if (sortBy === 'published_desc') {
      query = query.order('published_product_count', { ascending: false });
    }

    let { data, error } = await query;
    if (error || !data) {
      // Fallback to licenses table
      const fb = await supabase.from('licenses').select('*').order('sort_order', { ascending: true });
      data = fb.data || [];
    }

    // Fetch license_themes for each license
    const { data: ltData } = await supabase.from('license_themes').select('license_id, theme_id, themes(id, name, slug)');
    const ltMap = new Map<string, any[]>();
    if (ltData) {
      ltData.forEach(item => {
        const existing = ltMap.get(item.license_id) || [];
        if (item.themes) existing.push(item.themes);
        ltMap.set(item.license_id, existing);
      });
    }

    const fullLicenses = (data || []).map(l => ({
      ...l,
      themes: ltMap.get(l.id) || []
    }));

    setLicenses(fullLicenses);
    setLoading(false);
  }

  async function handleDirectLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingImage(true);
    try {
      const specs = await validateImageFile(file, 'license');
      if (!specs.isValid) {
        toast.error(`Imagen no válida: ${specs.errors.join(' ')}`);
        setProcessingImage(false);
        return;
      }

      if (specs.warnings.length > 0) {
        toast.warning(specs.warnings.join(' '));
      }

      toast.info('Optimizando y generando derivados responsive en WebP...');
      const { mainUrl } = await uploadOptimizedMedia(file, 'license', form.slug || form.name);
      setForm(prev => ({ ...prev, logo_url: mainUrl }));
      toast.success('Logo optimizado y subido con éxito.');
    } catch (err: any) {
      toast.error('Error al procesar la imagen: ' + err.message);
    } finally {
      setProcessingImage(false);
      if (e.target) e.target.value = '';
    }
  }

  async function openCreate() {
    setEditing(null);
    setForm({
      name: '',
      slug: '',
      description: '',
      logo_url: '',
      logo_alt: '',
      banner_url: '',
      is_active: true,
      is_featured: false,
      sort_order: 0,
      selectedThemeIds: []
    });
    setShowForm(true);
  }

  async function openEdit(l: any) {
    setEditing(l);
    setForm({
      name: l.name,
      slug: l.slug,
      description: l.description || '',
      logo_url: l.logo_url || '',
      logo_alt: l.logo_alt || '',
      banner_url: l.banner_url || '',
      is_active: l.is_active ?? true,
      is_featured: l.is_featured ?? false,
      sort_order: l.sort_order || 0,
      selectedThemeIds: l.themes ? l.themes.map((t: any) => t.id) : []
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;

    const payload = {
      name: form.name.trim(),
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: form.description || null,
      logo_url: form.logo_url || null,
      logo_alt: form.logo_alt?.trim() || `Logo de ${form.name.trim()}`,
      banner_url: form.banner_url || null,
      is_active: form.is_active,
      is_featured: form.is_featured,
      sort_order: form.sort_order,
      updated_at: new Date().toISOString()
    };

    let licenseId = editing?.id;

    if (editing) {
      const { error } = await supabase.from('licenses').update(payload).eq('id', editing.id);
      if (error) {
        toast.error('Error al actualizar la licencia: ' + error.message);
        return;
      }
    } else {
      const { data, error } = await supabase.from('licenses').insert(payload).select('id').single();
      if (error || !data) {
        toast.error('Error al crear la licencia: ' + (error?.message || 'Error desconocido'));
        return;
      }
      licenseId = data.id;
    }

    // Save Theme associations (license_themes)
    if (licenseId) {
      await supabase.from('license_themes').delete().eq('license_id', licenseId);
      if (form.selectedThemeIds.length > 0) {
        const inserts = form.selectedThemeIds.map(tId => ({
          license_id: licenseId,
          theme_id: tId
        }));
        await supabase.from('license_themes').insert(inserts);
      }
    }

    setShowForm(false);
    fetchLicenses();
    toast.success(editing ? 'Licencia actualizada' : 'Licencia creada');
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Eliminar esta licencia permanentemente?', { danger: true }))) return;
    await supabase.from('licenses').delete().eq('id', id);
    setSelectedIds(prev => prev.filter(item => item !== id));
    fetchLicenses();
    toast.success('Licencia eliminada');
  }

  async function handleBulkVisibility(visible: boolean) {
    if (selectedIds.length === 0) return;
    const actionLabel = visible ? 'activas' : 'inactivas';
    if (!(await confirm(`¿Marcar las ${selectedIds.length} licencias seleccionadas como ${actionLabel}?`))) return;

    setLoading(true);
    await supabase.from('licenses').update({ is_active: visible }).in('id', selectedIds);
    setSelectedIds([]);
    fetchLicenses();
    toast.success(`${selectedIds.length} licencias marcadas como ${actionLabel}`);
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!(await confirm(`¿Eliminar las ${selectedIds.length} licencias seleccionadas permanentemente?`, { danger: true }))) return;

    setLoading(true);
    await supabase.from('licenses').delete().in('id', selectedIds);
    setSelectedIds([]);
    fetchLicenses();
    toast.success(`${selectedIds.length} licencias eliminadas`);
  }

  const filteredLicenses = licenses.filter(l => 
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Licencias</h2>
          <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200">
            {licenses.length} {licenses.length === 1 ? 'licencia' : 'licencias'}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar licencia..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-white border border-gray-200 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:border-primary-500 shadow-2xs w-44 sm:w-56"
            />
          </div>

          {/* Sorting */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer"
            >
              <option value="sort_order">Visualización</option>
              <option value="name">Nombre (A-Z)</option>
              <option value="published_desc">Más productos publicados</option>
            </select>
          </div>

          <div className="flex bg-gray-100/90 rounded-xl p-1">
            <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${viewMode === 'list' ? 'bg-white shadow-2xs text-primary-600 font-bold' : 'text-gray-500'}`}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${viewMode === 'grid' ? 'bg-white shadow-2xs text-primary-600 font-bold' : 'text-gray-500'}`}>
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>

          <button onClick={openCreate} className="bg-[#f00856] hover:bg-[#ff2c68] text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl cursor-pointer min-h-[44px] shadow-sm active:scale-95 flex items-center justify-center gap-1.5 transition-all">
            <Plus className="w-4 h-4" /> Nueva Licencia
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-blue-800">Acciones en lote:</span>
            <span className="text-xs bg-blue-200 text-blue-850 px-2 py-0.5 rounded-full font-bold">{selectedIds.length} seleccionadas</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleBulkVisibility(true)} className="px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Activar
            </button>
            <button onClick={() => handleBulkVisibility(false)} className="px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5" /> Desactivar
            </button>
            <button onClick={handleBulkDelete} className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          </div>
        </div>
      )}

      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-12 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={filteredLicenses.length > 0 && selectedIds.length === filteredLicenses.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? filteredLicenses.map(l => l.id) : [])}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Logo</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Licencia</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Themes</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Totales</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Publicados</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Destacada</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400">Cargando licencias...</td></tr>
              ) : filteredLicenses.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400">No se encontraron licencias</td></tr>
              ) : filteredLicenses.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(l.id)}
                      onChange={(e) => setSelectedIds(e.target.checked ? [...selectedIds, l.id] : selectedIds.filter(id => id !== l.id))}
                      className="w-4 h-4 text-primary-600 rounded"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="w-10 h-10 rounded-lg bg-gray-50 border overflow-hidden flex items-center justify-center p-1">
                      {l.logo_url ? <img src={l.logo_url} alt={l.name} className="w-full h-full object-contain" /> : <ImageIcon className="w-4 h-4 text-gray-300" />}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-gray-900">{l.name}</div>
                    <div className="font-mono text-xs text-gray-400">/licencias/{l.slug}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {l.themes && l.themes.length > 0 ? (
                        l.themes.map((t: any) => (
                          <span key={t.id} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md font-bold">
                            {t.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 italic">Sin asignar</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center font-semibold text-gray-700">{l.total_product_count ?? 0}</td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      (l.published_product_count ?? 0) > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {l.published_product_count ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {l.is_active !== false ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Activa</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Inactiva</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {l.is_featured ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Sí
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(l)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(l.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredLicenses.map(l => (
            <div key={l.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all flex flex-col relative">
              <div className="w-full h-28 bg-gray-50 border border-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden p-3">
                {l.logo_url ? <img src={l.logo_url} alt={l.name} className="w-full h-full object-contain" /> : <ImageIcon className="w-8 h-8 text-gray-300" />}
              </div>
              <h3 className="font-bold text-gray-900 border-b pb-2 mb-2">{l.name}</h3>
              <div className="flex-1 space-y-1 mb-4 text-xs text-gray-500">
                <p className="flex justify-between"><span className="text-gray-400 font-medium">Publicados:</span> <span className="font-bold text-gray-900">{l.published_product_count ?? 0}</span></p>
                <p className="flex justify-between"><span className="text-gray-400 font-medium">Estado:</span> {l.is_active !== false ? <span className="text-green-700 bg-green-50 px-1.5 rounded">Activa</span> : <span className="text-red-700 bg-red-50 px-1.5 rounded">Inactiva</span>}</p>
                <div className="pt-1 flex flex-wrap gap-1">
                  {l.themes && l.themes.map((t: any) => (
                    <span key={t.id} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 rounded font-bold">{t.name}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(l)} className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1"><Pencil className="w-3.5 h-3.5" /> Editar</button>
                <button onClick={() => handleDelete(l.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white z-50 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-xl font-bold">{editing ? 'Editar Licencia' : 'Nueva Licencia'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Nombre Franquicia / Licencia <span className="text-red-500">*</span></label>
                <input
                  className="form-input w-full"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value, slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') })}
                  placeholder="Ej: Star Wars"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Slug URL</label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-xs font-mono">/licencias/</span>
                  <input
                    className="form-input flex-1 rounded-l-none font-mono text-xs"
                    value={form.slug}
                    onChange={e => setForm({ ...form, slug: e.target.value })}
                    placeholder="star-wars"
                  />
                </div>
              </div>

              {/* Themes Multi-select */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Themes Asociados (Temáticas)</label>
                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                  {themesList.map(t => {
                    const isChecked = form.selectedThemeIds.includes(t.id);
                    return (
                      <label key={t.id} className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 hover:text-gray-900">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setForm({ ...form, selectedThemeIds: [...form.selectedThemeIds, t.id] });
                            } else {
                              setForm({ ...form, selectedThemeIds: form.selectedThemeIds.filter(id => id !== t.id) });
                            }
                          }}
                          className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                        />
                        <span>{t.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Logo Upload & Management */}
              <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-black text-gray-700 uppercase tracking-widest flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-primary-600" /> Logo Oficial de la Licencia
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="file"
                      ref={logoFileInputRef}
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      onChange={handleDirectLogoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={processingImage}
                      onClick={() => logoFileInputRef.current?.click()}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" /> Subir Imagen
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveMediaTarget('logo'); setShowMediaPicker(true); }}
                      className="px-2.5 py-1 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-blue-600" /> Biblioteca
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    className="form-input flex-1 text-xs font-mono"
                    value={form.logo_url}
                    onChange={e => setForm({ ...form, logo_url: e.target.value })}
                    placeholder="https://..."
                  />
                  {form.logo_url && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, logo_url: '' })}
                      className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg font-bold border border-red-200"
                    >
                      Quitar
                    </button>
                  )}
                </div>

                {/* Specs Notice */}
                <div className="bg-blue-50/80 border border-blue-200/80 rounded-lg p-2.5 text-[11px] text-blue-900 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" /> Medidas y Especificaciones Recomendadas:
                  </div>
                  <ul className="list-disc list-inside pl-1 text-[10px] space-y-0.5 text-blue-800">
                    <li><strong className="font-bold">Tamaño mínimo requerido:</strong> 1200 × 600 px</li>
                    <li><strong className="font-bold">Relación recomendada:</strong> 2:1</li>
                    <li><strong className="font-bold">Peso recomendado:</strong> &lt; 250 KB</li>
                    <li><strong className="font-bold">Formato:</strong> WebP o PNG transparente (Fondo oscuro)</li>
                    <li><strong className="font-bold">Safe Area:</strong> Dejar ~10% de margen alrededor del logo.</li>
                  </ul>
                </div>

                {/* ALT Text Input */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Texto Alternativo (ALT Text SEO)</label>
                  <input
                    className="form-input w-full text-xs"
                    value={form.logo_alt}
                    onChange={e => setForm({ ...form, logo_alt: e.target.value })}
                    placeholder={`Logo de ${form.name || 'Licencia'}`}
                  />
                </div>
              </div>

              {/* STOREFRONT PREVIEWS (DARK MODE) */}
              {form.logo_url && (
                <div className="bg-[#05070f] p-4 rounded-2xl border border-white/10 space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-white/10 pb-2">
                    Vista Previa en Storefront (Fondo Oscuro)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Card Preview */}
                    <div className="bg-[#090d18] border border-white/10 rounded-xl p-3 flex flex-col items-center text-center">
                      <div className="text-[9px] font-bold text-slate-500 mb-2 uppercase">Card /licencias</div>
                      <div className="w-full h-16 bg-white/5 rounded-lg p-2 flex items-center justify-center border border-white/5 mb-2">
                        <img src={form.logo_url} alt={form.logo_alt || form.name} className="max-h-full max-w-full object-contain" />
                      </div>
                      <span className="text-xs font-bold text-white truncate max-w-full">{form.name || 'Nombre Licencia'}</span>
                    </div>

                    {/* Dropdown Item Preview */}
                    <div className="bg-[#05070f] border border-white/10 rounded-xl p-3 flex flex-col justify-center">
                      <div className="text-[9px] font-bold text-slate-500 mb-2 uppercase">Dropdown Menú</div>
                      <div className="px-2.5 py-1.5 bg-[#f00856]/10 rounded-lg flex items-center gap-2 border border-[#f00856]/30">
                        <div className="w-8 h-5 rounded bg-white/5 border border-white/10 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                          <img src={form.logo_url} alt="" className="w-full h-full object-contain" />
                        </div>
                        <span className="text-xs font-bold text-white truncate">{form.name || 'Nombre Licencia'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Banner URL (opcional)</label>
                <input className="form-input w-full text-xs" value={form.banner_url} onChange={e => setForm({ ...form, banner_url: e.target.value })} placeholder="https://..." />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Descripción</label>
                <textarea rows={3} className="form-input w-full text-xs resize-none" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción de la franquicia para SEO..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Orden</label>
                  <input type="number" className="form-input w-full text-xs" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer py-2">
                    <input type="checkbox" checked={form.is_featured} onChange={e => setForm({ ...form, is_featured: e.target.checked })} className="w-4 h-4 text-amber-500 rounded" />
                    <span className="text-xs font-bold text-gray-700">Licencia Destacada</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 text-blue-600 rounded" />
                <label htmlFor="is_active" className="text-xs font-bold text-gray-900 cursor-pointer">Licencia Activa</label>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full">Cancelar</button>
              <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 w-full flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Guardar</button>
            </div>
          </div>
        </>
      )}

      {/* Media Picker Modal Integration */}
      <MediaPickerModal
        isOpen={showMediaPicker}
        onClose={() => { setShowMediaPicker(false); setActiveMediaTarget(null); }}
        multiple={false}
        rootPath="licenses"
        onSelect={(url) => {
          if (activeMediaTarget === 'logo') {
            setForm(prev => ({ ...prev, logo_url: url }));
          } else if (activeMediaTarget === 'banner') {
            setForm(prev => ({ ...prev, banner_url: url }));
          }
          setShowMediaPicker(false);
          setActiveMediaTarget(null);
        }}
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, List, Grid3X3, Check, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

export default function AdminBrands() {
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'sort_order' | 'name' | 'name_desc'>('sort_order');
  const [form, setForm] = useState({ name: '', slug: '', description: '', logo_url: '', is_active: true, sort_order: 0, status: 'approved' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => { fetch(); }, [sortBy]);

  async function fetch() {
    setLoading(true);
    let query = supabase.from('brands').select('*');
    
    if (sortBy === 'sort_order') {
      query = query.order('sort_order', { ascending: true }).order('name', { ascending: true });
    } else if (sortBy === 'name') {
      query = query.order('name', { ascending: true });
    } else if (sortBy === 'name_desc') {
      query = query.order('name', { ascending: false });
    }

    const { data } = await query;
    setBrands(data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm({ name: '', slug: '', description: '', logo_url: '', is_active: true, sort_order: 0, status: 'approved' }); setShowForm(true); }
  function openEdit(b: any) { setEditing(b); setForm({ name: b.name, slug: b.slug, description: b.description || '', logo_url: b.logo_url || '', is_active: b.is_active ?? true, sort_order: b.sort_order || 0, status: b.status || 'approved' }); setShowForm(true); }

  async function handleSave() {
    const payload = { 
      name: form.name, 
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), 
      description: form.description || null,
      logo_url: form.logo_url || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
      status: form.status
    };
    if (editing) await supabase.from('brands').update(payload).eq('id', editing.id);
    else await supabase.from('brands').insert(payload);
    setShowForm(false); 
    fetch();
    toast.success(editing ? 'Marca actualizada' : 'Marca creada');
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Eliminar esta marca permanentemente?', { danger: true }))) return;
    await supabase.from('brands').delete().eq('id', id);
    setSelectedIds(prev => prev.filter(item => item !== id));
    fetch();
    toast.success('Marca eliminada');
  }

  async function handleApprove(id: string) {
    if (!(await confirm('¿Aprobar esta marca?'))) return;
    try {
      const { error } = await supabase
        .from('brands')
        .update({ status: 'approved', approved_at: new Date().toISOString(), is_active: true })
        .eq('id', id);
      if (error) throw error;
      toast.success('Marca aprobada');
      fetch();
    } catch (err: any) {
      toast.error('Error al aprobar la marca: ' + err.message);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!(await confirm(`¿Eliminar las ${selectedIds.length} marcas seleccionadas permanentemente?`, { danger: true }))) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('brands')
        .delete()
        .in('id', selectedIds);
      
      if (error) throw error;
      toast.success(`${selectedIds.length} marcas eliminadas`);
      setSelectedIds([]);
      fetch();
    } catch (err: any) {
      toast.error('Error al eliminar marcas: ' + err.message);
      setLoading(false);
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.length === 0) return;
    if (!(await confirm(`¿Aprobar las ${selectedIds.length} marcas seleccionadas?`))) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({ status: 'approved', approved_at: new Date().toISOString(), is_active: true })
        .in('id', selectedIds);
      
      if (error) throw error;
      toast.success(`${selectedIds.length} marcas aprobadas`);
      setSelectedIds([]);
      fetch();
    } catch (err: any) {
      toast.error('Error al aprobar marcas: ' + err.message);
      setLoading(false);
    }
  }

  async function handleBulkVisibility(visible: boolean) {
    if (selectedIds.length === 0) return;
    const actionLabel = visible ? 'visibles' : 'ocultas';
    if (!(await confirm(`¿Marcar las ${selectedIds.length} marcas seleccionadas como ${actionLabel}?`))) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({ is_active: visible })
        .in('id', selectedIds);
      
      if (error) throw error;
      toast.success(`${selectedIds.length} marcas marcadas como ${actionLabel}`);
      setSelectedIds([]);
      fetch();
    } catch (err: any) {
      toast.error('Error al actualizar visibilidad: ' + err.message);
      setLoading(false);
    }
  }

  // Check if any selected brand is pending review
  const hasPendingSelected = brands.some(b => selectedIds.includes(b.id) && b.status === 'pending_review');

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
           <h2 className="text-2xl font-bold dark:text-white">Marcas</h2>
           <p className="text-sm text-gray-500 mt-1">Gestión del directorio de marcas ({brands.length} totales)</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Sorting Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ordenar por:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none shadow-sm"
            >
              <option value="sort_order">Orden de Visualización</option>
              <option value="name">Nombre (A-Z)</option>
              <option value="name_desc">Nombre (Z-A)</option>
            </select>
          </div>

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

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 shadow-sm animate-scale-in">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-blue-800">Acciones en lote:</span>
            <span className="text-xs bg-blue-200 text-blue-850 px-2 py-0.5 rounded-full font-bold">{selectedIds.length} seleccionadas</span>
          </div>
          <div className="flex items-center gap-2">
            {hasPendingSelected && (
              <button 
                onClick={handleBulkApprove} 
                className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors border border-transparent"
              >
                <Check className="w-3.5 h-3.5" /> Aprobar Seleccionadas
              </button>
            )}
            <button 
              onClick={() => handleBulkVisibility(true)} 
              className="px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Eye className="w-3.5 h-3.5" /> Marcar Visibles
            </button>
            <button 
              onClick={() => handleBulkVisibility(false)} 
              className="px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <EyeOff className="w-3.5 h-3.5" /> Marcar Ocultas
            </button>
            <button 
              onClick={handleBulkDelete} 
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors border border-transparent"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar Seleccionadas
            </button>
          </div>
        </div>
      )}

      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-12 px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={brands.length > 0 && selectedIds.length === brands.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(brands.map(b => b.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Logo</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Slug</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Visibilidad</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Aprobación</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Orden</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Descripción</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : brands.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400">No hay marcas</td></tr>
              ) : brands.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(b.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(prev => [...prev, b.id]);
                        } else {
                          setSelectedIds(prev => prev.filter(id => id !== b.id));
                        }
                      }}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-12 h-12 rounded-lg bg-gray-50 border overflow-hidden flex items-center justify-center">
                      {b.logo_url ? <img src={b.logo_url} alt={b.name} className="w-full h-full object-contain" /> : <ImageIcon className="w-5 h-5 text-gray-300" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-gray-900">{b.name}</td>
                  <td className="px-6 py-4 font-mono text-sm text-gray-500">/{b.slug}</td>
                  <td className="px-6 py-4">
                    {b.is_active !== false ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Visible</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Oculta</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {b.status === 'approved' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Aprobada</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-250 animate-pulse">Pendiente</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500">{b.sort_order || 0}</td>
                  <td className="px-6 py-4 text-gray-500 text-sm max-w-xs truncate">{b.description || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      {b.status === 'pending_review' && (
                        <button onClick={() => handleApprove(b.id)} className="p-2 text-green-600 hover:text-green-850 hover:bg-green-50 rounded-lg" title="Aprobar Marca">
                          <Check className="w-4 h-4" />
                        </button>
                      )}
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
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-all group flex flex-col relative shadow-sm">
              <input
                type="checkbox"
                checked={selectedIds.includes(b.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds(prev => [...prev, b.id]);
                  } else {
                    setSelectedIds(prev => prev.filter(id => id !== b.id));
                  }
                }}
                className="absolute top-4 left-4 z-10 w-4 h-4 text-primary-600 rounded focus:ring-primary-500 bg-white"
              />
              <div className="w-full h-32 bg-gray-50 border border-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden p-4">
                 {b.logo_url ? (
                    <img src={b.logo_url} alt={b.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                 ) : (
                    <ImageIcon className="w-10 h-10 text-gray-300" />
                 )}
              </div>
              
              <h3 className="font-bold text-gray-900 border-b pb-2 mb-2 pl-6">{b.name}</h3>
              <div className="flex-1 space-y-1 mb-4">
                 <p className="text-xs text-gray-500 flex justify-between"><span className="font-medium text-gray-400">Visibilidad:</span> {b.is_active !== false ? <span className="text-[10px] bg-green-100 text-green-800 px-1.5 rounded">Visible</span> : <span className="text-[10px] bg-red-100 text-red-800 px-1.5 rounded">Oculta</span>}</p>
                 <p className="text-xs text-gray-500 flex justify-between"><span className="font-medium text-gray-400">Aprobación:</span> {b.status === 'approved' ? <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 rounded">Aprobada</span> : <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 rounded animate-pulse">Pendiente</span>}</p>
                 <p className="text-xs text-gray-500 flex justify-between"><span className="font-medium text-gray-400">Orden:</span> <span>{b.sort_order || 0}</span></p>
                 <p className="text-xs text-gray-500 flex justify-between"><span className="font-medium text-gray-400">Slug:</span> <span className="font-mono text-[10px] bg-gray-100 px-1.5 rounded truncate ml-2">/{b.slug}</span></p>
                 {b.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{b.description}</p>}
              </div>
              
              <div className="flex gap-2">
                {b.status === 'pending_review' ? (
                  <button onClick={() => handleApprove(b.id)} className="btn-secondary flex-1 py-1.5 px-3 text-xs gap-1 border-green-200 text-green-700 bg-green-50 hover:bg-green-100 shadow-none"><Check className="w-3.5 h-3.5" /> Aprobar</button>
                ) : (
                  <button onClick={() => openEdit(b)} className="btn-secondary flex-1 py-1.5 px-3 text-xs gap-1 border-gray-200 text-gray-700 hover:bg-gray-100 shadow-none"><Pencil className="w-3 h-3" /> Editar</button>
                )}
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
                 <textarea rows={3} className="form-input w-full text-sm resize-none" value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} placeholder="Breve biografía de la marca para SEO..." />
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Orden de Visualización</label>
                 <input type="number" className="form-input w-full" value={form.sort_order} onChange={e => setForm({...form, sort_order: parseInt(e.target.value) || 0})} />
              </div>
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Estado de Aprobación</label>
                 <select 
                   className="form-input w-full" 
                   value={form.status} 
                   onChange={e => setForm({...form, status: e.target.value})}
                 >
                   <option value="approved">Aprobada</option>
                   <option value="pending_review">Pendiente de Revisión</option>
                 </select>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <input type="checkbox" id="is_active" className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
                <div>
                  <label htmlFor="is_active" className="block text-sm font-bold text-gray-900">Marca Activa</label>
                  <p className="text-xs text-gray-500">Si desmarcas esta opción, la marca no se mostrará a los clientes ni en el carrusel.</p>
                </div>
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

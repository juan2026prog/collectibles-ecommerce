import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Layers, Plus, Trash2, Save, X, Search, GripVertical, Link2, Copy, Check, Upload } from 'lucide-react';

interface ProductGroup {
  id?: string;
  name: string;
  slug: string;
  description: string;
  type: 'manual' | 'auto';
  rules_json: string;
  is_active: boolean;
  show_on_home: boolean;
  sort_order: number;
  badge_image_url?: string | null;
  badge_storage_path?: string | null;
  badge_alt_text?: string | null;
  badge_updated_at?: string | null;
}

export default function AdminGroups() {
  const [groups, setGroups] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProductGroup | null>(null);
  const [search, setSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Badge upload/management states
  const [originalBadgePath, setOriginalBadgePath] = useState<string | null>(null);
  const [uploadingBadge, setUploadingBadge] = useState(false);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const [badgeWarning, setBadgeWarning] = useState<string | null>(null);
  const [badgeSuccess, setBadgeSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // List filter state
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'with_badge' | 'no_badge'>('all');

  const handleCopyLink = (slug: string, id: string) => {
    const url = `${window.location.origin}/collection/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => { fetchGroups(); fetchProducts(); }, []);

  async function fetchGroups() {
    setLoading(true);
    const { data } = await supabase.from('product_groups').select('*, product_group_items(product_id)').order('sort_order');
    setGroups(data || []);
    setLoading(false);
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('id, title, base_price, status').order('title');
    setProducts(data || []);
  }

  // Client-side UUID generator to support folder structuring in Storage before database INSERT
  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function startNew() {
    setEditing({
      id: generateUUID(),
      name: '',
      slug: '',
      description: '',
      type: 'manual',
      rules_json: '{}',
      is_active: true,
      show_on_home: true,
      sort_order: groups.length,
      badge_image_url: null,
      badge_storage_path: null,
      badge_alt_text: '',
      badge_updated_at: null
    });
    setOriginalBadgePath(null);
    setSelectedProducts([]);
    setBadgeError(null);
    setBadgeWarning(null);
    setBadgeSuccess(false);
  }

  function startEdit(g: any) {
    setEditing({
      ...g,
      show_on_home: g.show_on_home !== false,
      badge_alt_text: g.badge_alt_text || ''
    });
    setOriginalBadgePath(g.badge_storage_path || null);
    setSelectedProducts((g.product_group_items || []).map((pi: any) => pi.product_id));
    setBadgeError(null);
    setBadgeWarning(null);
    setBadgeSuccess(false);
  }

  // Image validation helper
  const validateImage = (file: File): Promise<{ valid: boolean; error?: string; warn?: string }> => {
    return new Promise((resolve) => {
      const allowedTypes = ['image/png', 'image/webp'];
      const allowedExts = ['png', 'webp'];
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (!allowedTypes.includes(file.type) || !ext || !allowedExts.includes(ext)) {
        return resolve({ valid: false, error: 'Formato no permitido. Solo se aceptan archivos PNG y WebP.' });
      }
      
      if (file.size > 1024 * 1024) {
        return resolve({ valid: false, error: 'El peso del archivo supera el límite de 1 MB.' });
      }
      
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const width = img.width;
        const height = img.height;
        
        if (width < 128 || height < 128) {
          return resolve({ 
            valid: false, 
            error: `Dimensiones insuficientes: la imagen tiene ${width}x${height}px, pero el mínimo es 128x128px.` 
          });
        }
        
        const ratio = width / height;
        let warn: string | undefined = undefined;
        if (Math.abs(ratio - 1) > 0.05) {
          warn = 'Para obtener mejores resultados recomendamos utilizar una imagen cuadrada.';
        }
        
        resolve({ valid: true, warn });
      };
      img.onerror = () => {
        resolve({ valid: false, error: 'El archivo no es una imagen válida o está dañado.' });
      };
    });
  };

  // Upload badge to storage
  async function handleBadgeUpload(file: File) {
    if (!editing || !editing.id) return;
    setUploadingBadge(true);
    setBadgeError(null);
    setBadgeWarning(null);
    setBadgeSuccess(false);

    try {
      const validation = await validateImage(file);
      if (!validation.valid) {
        setBadgeError(validation.error || 'Imagen inválida');
        return;
      }
      if (validation.warn) {
        setBadgeWarning(validation.warn);
      }

      const ext = file.name.split('.').pop()?.toLowerCase();
      const sanitizedName = file.name.replace(`.${ext}`, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
      const storagePath = `group-badges/${editing.id}/${Date.now()}-${sanitizedName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('public-assets').getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      // Delete the previous temporary or old badge from storage if they replaced it
      const oldStoragePath = editing.badge_storage_path;
      if (oldStoragePath && oldStoragePath !== originalBadgePath) {
        await supabase.storage.from('public-assets').remove([oldStoragePath]).catch(e => {
          console.error('Error removing old temporary badge:', e);
        });
      }

      setEditing(prev => prev ? {
        ...prev,
        badge_image_url: publicUrl,
        badge_storage_path: storagePath,
        badge_updated_at: new Date().toISOString()
      } : null);

      setBadgeSuccess(true);
      setTimeout(() => setBadgeSuccess(false), 2500);

    } catch (err: any) {
      console.error('Error uploading badge:', err);
      setBadgeError(err.message || 'Error al subir la imagen.');
    } finally {
      setUploadingBadge(false);
    }
  }

  // Remove badge action
  async function handleDeleteBadge() {
    if (!editing) return;
    setBadgeError(null);
    setBadgeWarning(null);
    setBadgeSuccess(false);

    const storagePath = editing.badge_storage_path;
    // We only remove from storage immediately if it's a new temporary file upload.
    // If it was already saved in DB, we wait until they click "Guardar Colección" or delete it immediately.
    // To be consistent, let's delete it from storage immediately if it differs from original.
    if (storagePath && storagePath !== originalBadgePath) {
      setUploadingBadge(true);
      try {
        await supabase.storage.from('public-assets').remove([storagePath]);
      } catch (err: any) {
        console.error('Error removing temporary badge from storage:', err);
      } finally {
        setUploadingBadge(false);
      }
    }

    setEditing(prev => prev ? {
      ...prev,
      badge_image_url: null,
      badge_storage_path: null,
      badge_alt_text: '',
      badge_updated_at: new Date().toISOString()
    } : null);
  }

  // Cancel edit modal action
  async function handleCancel() {
    // Clean up newly uploaded temporary badge if we are cancelling
    if (editing && editing.badge_storage_path && editing.badge_storage_path !== originalBadgePath) {
      await supabase.storage.from('public-assets').remove([editing.badge_storage_path]).catch(e => {
        console.error('Error removing cancelled temporary badge:', e);
      });
    }
    setEditing(null);
  }

  async function saveGroup() {
    if (!editing || !editing.name) return;
    const slug = editing.slug || editing.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const payload = { ...editing, slug, rules_json: editing.rules_json || '{}' };
    delete (payload as any).product_group_items;

    const groupId = editing.id;
    if (!groupId) return;

    // If they saved and had a different badge path, we should delete the OLD original badge path from storage
    if (originalBadgePath && editing.badge_storage_path !== originalBadgePath) {
      await supabase.storage.from('public-assets').remove([originalBadgePath]).catch(e => {
        console.error('Error removing old badge on save:', e);
      });
    }

    const isNew = !groups.some(g => g.id === groupId);
    if (!isNew) {
      await supabase.from('product_groups').update(payload).eq('id', groupId);
    } else {
      await supabase.from('product_groups').insert(payload);
    }

    if (editing.type === 'manual') {
      await supabase.from('product_group_items').delete().eq('group_id', groupId);
      if (selectedProducts.length > 0) {
        await supabase.from('product_group_items').insert(selectedProducts.map(pid => ({ group_id: groupId, product_id: pid })));
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setEditing(null);
    fetchGroups();
  }

  async function deleteGroup(id: string) {
    if (!confirm('¿Eliminar esta colección?')) return;
    
    // Find the group to delete its badge from storage
    const groupToDelete = groups.find(x => x.id === id);
    if (groupToDelete && groupToDelete.badge_storage_path) {
      await supabase.storage.from('public-assets').remove([groupToDelete.badge_storage_path]).catch(e => {
        console.error('Error removing badge of deleted group:', e);
      });
    }

    await supabase.from('product_group_items').delete().eq('group_id', id);
    await supabase.from('product_groups').delete().eq('id', id);
    fetchGroups();
  }

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleBadgeUpload(file);
    }
  };

  const filteredProducts = products.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  );

  const filteredGroups = groups.filter(g => {
    if (badgeFilter === 'with_badge') return !!g.badge_image_url;
    if (badgeFilter === 'no_badge') return !g.badge_image_url;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Layers className="w-6 h-6 text-primary-600" /> Colecciones y Grupos</h2>
          <p className="text-sm text-gray-500 mt-1">Agrupa productos para la vitrina, promociones o campañas de marketing</p>
        </div>
        <div className="flex gap-2">
          {saved && <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1"><Save className="w-4 h-4" /> Guardado</span>}
          <button onClick={startNew} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nueva Colección</button>
        </div>
      </div>

      {/* Editor Modal */}
      {editing && (
        <div className="bg-white rounded-xl border-2 border-primary-200 shadow-lg p-6 space-y-5">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg">{groups.some(x => x.id === editing.id) ? 'Editar' : 'Nueva'} Colección</h3>
            <button onClick={handleCancel} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Nombre</label>
              <input className="form-input w-full" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Ofertas de Verano" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Slug</label>
              <input className="form-input w-full font-mono text-blue-600" value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value })} placeholder="ofertas-verano" />
              {editing.slug && (
                <p className="text-[11px] text-gray-400 mt-1 font-mono flex items-center gap-1">
                  <Link2 className="w-3 h-3 text-slate-400" /> Link: <span className="text-gray-600 font-semibold">{window.location.origin}/collection/{editing.slug}</span>
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Descripción</label>
            <textarea rows={2} className="form-input w-full" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="Descripción de la colección..." />
          </div>

          {/* Cocarda del grupo o colección */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-4">
            <h4 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Cocarda de la grupo o colección</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Upload Zone */}
              <div>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    isDragging ? 'border-primary-500 bg-primary-50/20 scale-[1.01]' : 'border-gray-300 hover:border-primary-400 bg-white'
                  }`}
                  onClick={() => document.getElementById('badge-file-input')?.click()}
                >
                  <input
                    type="file"
                    id="badge-file-input"
                    className="hidden"
                    accept="image/png, image/webp"
                    onChange={e => e.target.files?.[0] && handleBadgeUpload(e.target.files[0])}
                  />
                  <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-gray-700">Arrastra o haz clic para subir cocarda</p>
                  <p className="text-[10px] text-gray-400 mt-1">PNG o WebP · Máx. 1 MB</p>
                </div>
                
                {/* Ayuda y Recomendaciones */}
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">
                    Formato recomendado: PNG con fondo transparente, imagen cuadrada de 512 × 512 px y peso máximo de 1 MB. También se acepta WebP.
                  </p>
                  <p className="text-[10px] text-amber-600 font-bold leading-relaxed">
                    Utilizá una cocarda con poco texto, bordes claros y buen contraste para que se vea correctamente sobre las imágenes de los productos.
                  </p>
                </div>
              </div>

              {/* Preview and details */}
              <div className="flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest">Vista Previa</label>
                  <div className="relative w-24 h-24 bg-white border border-gray-200 rounded-lg flex items-center justify-center overflow-hidden p-2 shadow-inner">
                    {uploadingBadge ? (
                      <div className="text-xs text-gray-400 animate-pulse font-medium">Subiendo...</div>
                    ) : editing.badge_image_url ? (
                      <img
                        src={editing.badge_image_url}
                        alt="Vista previa"
                        className="w-full h-full object-contain mix-blend-multiply"
                      />
                    ) : (
                      <div className="text-xs text-gray-300 text-center font-medium">Sin cocarda</div>
                    )}
                  </div>
                  
                  {/* Status Messages */}
                  {badgeError && <p className="text-[11px] text-red-600 font-bold bg-red-50 border border-red-100 p-2 rounded-lg">{badgeError}</p>}
                  {badgeWarning && <p className="text-[11px] text-amber-600 font-bold bg-amber-50 border border-amber-100 p-2 rounded-lg">{badgeWarning}</p>}
                  {badgeSuccess && <p className="text-[11px] text-green-600 font-bold bg-green-50 border border-green-100 p-2 rounded-lg">¡Imagen cargada correctamente!</p>}
                </div>

                <div className="space-y-3">
                  {editing.badge_image_url && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => document.getElementById('badge-file-input')?.click()}
                        className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                      >
                        Cambiar cocarda
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteBadge}
                        className="btn-secondary py-1.5 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300 flex items-center gap-1.5"
                      >
                        Eliminar cocarda
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Texto Alternativo</label>
                    <input
                      className="form-input w-full text-xs"
                      value={editing.badge_alt_text || ''}
                      onChange={e => setEditing({ ...editing, badge_alt_text: e.target.value })}
                      placeholder="Ej: Oferta Especial de Verano"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Tipo</label>
              <select className="form-input w-full" value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value as any })}>
                <option value="manual">Manual (seleccionar productos)</option>
                <option value="auto">Automático (reglas)</option>
              </select>
            </div>
            <div className="flex items-center pb-2.5">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500 border-gray-300" />
                <span className="text-sm font-bold text-gray-700">Colección Activa</span>
              </label>
            </div>
            <div className="flex items-center pb-2.5">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={editing.show_on_home} onChange={e => setEditing({ ...editing, show_on_home: e.target.checked })} className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500 border-gray-300" />
                <span className="text-sm font-bold text-gray-700">Mostrar en la Home</span>
              </label>
            </div>
          </div>

          {/* Product Selector for manual type */}
          {editing.type === 'manual' && (
            <div className="border rounded-xl overflow-hidden bg-gray-50">
              <div className="p-3 border-b bg-white">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="form-input pl-10 w-full text-sm" placeholder="Buscar productos para agregar..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <p className="text-xs text-gray-500 mt-2">{selectedProducts.length} productos seleccionados</p>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                {filteredProducts.map(p => (
                  <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white cursor-pointer transition-colors">
                    <input type="checkbox" checked={selectedProducts.includes(p.id)} onChange={() => {
                      setSelectedProducts(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]);
                    }} className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium text-gray-700 flex-1">{p.title}</span>
                    <span className="text-xs font-bold text-gray-400">${p.base_price}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={handleCancel} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={saveGroup} className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" /> Guardar Colección</button>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      {!editing && groups.length > 0 && (
        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 w-fit">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Filtro Cocarda:</span>
          <button
            onClick={() => setBadgeFilter('all')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              badgeFilter === 'all' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            Todas ({groups.length})
          </button>
          <button
            onClick={() => setBadgeFilter('with_badge')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              badgeFilter === 'with_badge' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            Con Cocarda ({groups.filter(x => x.badge_image_url).length})
          </button>
          <button
            onClick={() => setBadgeFilter('no_badge')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              badgeFilter === 'no_badge' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            Sin Cocarda ({groups.filter(x => !x.badge_image_url).length})
          </button>
        </div>
      )}

      {/* Groups List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 animate-pulse">Cargando colecciones...</div>
      ) : filteredGroups.length === 0 && !editing ? (
        <div className="bg-white p-12 rounded-xl border border-dashed border-gray-300 text-center">
          <Layers className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-bold text-gray-500">No se encontraron colecciones</p>
          <p className="text-sm text-gray-400 mt-1">Crea una colección o cambia el filtro de búsqueda</p>
          {groups.length === 0 && (
            <button onClick={startNew} className="mt-4 btn-primary text-sm">Crear primera colección</button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map(g => (
            <div key={g.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-4">
                <GripVertical className="w-5 h-5 text-gray-300 group-hover:text-gray-400 cursor-grab" />
                
                {/* Badge Thumbnail */}
                <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-200 p-1 flex-shrink-0 relative group/thumb">
                  {g.badge_image_url ? (
                    <>
                      <img
                        src={g.badge_image_url}
                        alt={g.badge_alt_text || `Cocarda de ${g.name}`}
                        className="w-full h-full object-contain transition-transform group-hover/thumb:scale-125"
                      />
                      {/* Hover Tooltip Preview */}
                      <div className="absolute hidden group-hover/thumb:flex items-center justify-center bg-white border border-gray-200 rounded-xl p-2 shadow-2xl z-50 left-16 top-1/2 -translate-y-1/2 w-28 h-28 pointer-events-none">
                        <img src={g.badge_image_url} alt="" className="max-w-full max-h-full object-contain" />
                      </div>
                    </>
                  ) : (
                    <Layers className="w-5 h-5 text-gray-300" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-gray-900">{g.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${g.is_active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                      {g.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${g.show_on_home ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                      {g.show_on_home ? 'En Home' : 'Oculta en Home'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${g.badge_image_url ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                      {g.badge_image_url ? 'Con Cocarda' : 'Sin Cocarda'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-100">
                      {g.type === 'manual' ? 'Manual' : 'Auto'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{g.description || 'Sin descripción'} · <span className="font-bold">{g.product_group_items?.length || 0} productos</span></p>
                  {g.is_active && (
                    <div className="mt-2.5 flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 w-fit">
                      <span className="text-slate-400 font-mono">Enlace público:</span>
                      <a
                        href={`/collection/${g.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 font-bold flex items-center gap-0.5"
                      >
                        /collection/{g.slug} <Link2 className="w-3 h-3" />
                      </a>
                      <span className="text-slate-200">|</span>
                      <button
                        onClick={() => handleCopyLink(g.slug, g.id)}
                        className="text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1 transition-colors"
                      >
                        {copiedId === g.id ? (
                          <>
                            <Check className="w-3 h-3 text-green-600" />
                            <span className="text-green-600">¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copiar enlace</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(g)} className="btn-secondary text-xs py-1.5 px-3">Editar</button>
                <button onClick={() => deleteGroup(g.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

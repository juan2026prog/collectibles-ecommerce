import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Layers, Plus, Trash2, Save, X, Package, Search, Link2, Copy, Check, Upload, Store } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface StoreCollection {
  id?: string;
  vendor_store_id: string;
  name: string;
  slug: string;
  description: string;
  banner_url: string;
  seo_title: string;
  seo_description: string;
  is_active: boolean;
}

interface VCollectionsProps {
  activeStoreId?: string;
}

export default function VCollections({ activeStoreId }: VCollectionsProps) {
  const { user } = useAuth();
  const [collections, setCollections] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StoreCollection | null>(null);
  const [search, setSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const handleCopyLink = (slug: string, id: string) => {
    const url = `${window.location.origin}/collection/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    if (user && activeStoreId) {
      fetchCollections();
      fetchProducts();
    } else {
      setCollections([]);
      setProducts([]);
    }
  }, [user, activeStoreId]);

  async function fetchCollections() {
    if (!activeStoreId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendor_store_collections')
        .select('*, vendor_store_collection_products(product_id)')
        .eq('vendor_store_id', activeStoreId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCollections(data || []);
    } catch (err) {
      console.error('Error loading collections:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProducts() {
    if (!activeStoreId) return;
    try {
      // Fetch only products belonging to this vendor store
      const { data, error } = await supabase
        .from('products')
        .select('id, title, base_price, status')
        .eq('vendor_store_id', activeStoreId)
        .neq('status', 'archived')
        .order('title');
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error loading products:', err);
    }
  }

  async function uploadImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop();
    const sanitized = file.name.replace(`.${ext}`, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const path = `collections/${activeStoreId}-${Date.now()}-${sanitized}.${ext}`;
    
    const { error } = await supabase.storage
      .from('public-assets')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw error;

    const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0] || !editing) return;
    const file = e.target.files[0];
    setUploadingBanner(true);
    try {
      const url = await uploadImage(file);
      setEditing(prev => prev ? { ...prev, banner_url: url } : null);
    } catch (err: any) {
      alert('Error al subir imagen: ' + err.message);
    } finally {
      setUploadingBanner(false);
    }
  }

  function startNew() {
    if (!activeStoreId) return;
    setEditing({
      vendor_store_id: activeStoreId,
      name: '',
      slug: '',
      description: '',
      banner_url: '',
      seo_title: '',
      seo_description: '',
      is_active: true
    });
    setSelectedProducts([]);
  }

  function startEdit(c: any) {
    setEditing({
      id: c.id,
      vendor_store_id: c.vendor_store_id,
      name: c.name,
      slug: c.slug,
      description: c.description || '',
      banner_url: c.banner_url || '',
      seo_title: c.seo_title || '',
      seo_description: c.seo_description || '',
      is_active: c.is_active
    });
    setSelectedProducts((c.vendor_store_collection_products || []).map((cp: any) => cp.product_id));
  }

  async function saveCollection() {
    if (!editing || !editing.name || !activeStoreId) return;
    try {
      const baseSlug = editing.slug || editing.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const finalSlug = baseSlug.replace(/(^-|-$)/g, '');

      const payload = {
        ...editing,
        slug: finalSlug,
      };

      let collectionId = editing.id;
      if (editing.id) {
        const { error } = await supabase.from('vendor_store_collections').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('vendor_store_collections').insert(payload).select().single();
        if (error) throw error;
        collectionId = data?.id;
      }

      if (collectionId) {
        // Delete existing items for this collection
        const { error: delErr } = await supabase.from('vendor_store_collection_products').delete().eq('collection_id', collectionId);
        if (delErr) throw delErr;

        if (selectedProducts.length > 0) {
          const { error: insErr } = await supabase.from('vendor_store_collection_products').insert(
            selectedProducts.map(pid => ({ collection_id: collectionId, product_id: pid }))
          );
          if (insErr) throw insErr;
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(null);
      fetchCollections();
    } catch (err: any) {
      alert('Error al guardar colección: ' + err.message);
    }
  }

  async function deleteCollection(id: string) {
    if (!confirm('¿Eliminar esta colección?')) return;
    try {
      await supabase.from('vendor_store_collection_products').delete().eq('collection_id', id);
      await supabase.from('vendor_store_collections').delete().eq('id', id);
      fetchCollections();
    } catch (err: any) {
      alert('Error al eliminar colección: ' + err.message);
    }
  }

  if (!activeStoreId) {
    return (
      <div className="bg-white rounded-[2rem] border border-gray-200 p-12 text-center max-w-xl mx-auto shadow-sm">
        <Store className="w-16 h-16 mx-auto text-[#f00856] mb-6" />
        <h3 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-wider">Selecciona tu Tienda Oficial</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Para gestionar las colecciones de productos (ej. Colección Star Wars, Icons), selecciona la tienda oficial correspondiente en la barra de control superior.
        </p>
      </div>
    );
  }

  const filteredProducts = products.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary-600" /> Colecciones de la Tienda
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Crea colecciones agrupadas (como marcas o sagas) para estructurar tu vitrina virtual independiente.
          </p>
        </div>
        <div className="flex gap-2">
          {saved && (
            <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          <button onClick={startNew} className="px-4 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Nueva Colección
          </button>
        </div>
      </div>

      {/* Editor Modal / Container */}
      {editing && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-4 shadow-inner">
          <div className="flex justify-between items-center border-b border-gray-200 pb-2">
            <h3 className="font-bold text-base text-gray-900">{editing.id ? 'Editar' : 'Nueva'} Colección</h3>
            <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-200 rounded transition-colors">
              <X className="w-4.5 h-4.5 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Nombre de Colección</label>
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" 
                value={editing.name} 
                onChange={e => setEditing({ ...editing, name: e.target.value })} 
                placeholder="Ej. Lego Star Wars" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Slug (Identificador en URL)</label>
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white font-mono text-blue-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" 
                value={editing.slug} 
                onChange={e => setEditing({ ...editing, slug: e.target.value })} 
                placeholder="lego-star-wars" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">SEO Title (Opcional)</label>
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" 
                value={editing.seo_title} 
                onChange={e => setEditing({ ...editing, seo_title: e.target.value })} 
                placeholder="Título optimizado para motores de búsqueda" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">SEO Description (Opcional)</label>
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" 
                value={editing.seo_description} 
                onChange={e => setEditing({ ...editing, seo_description: e.target.value })} 
                placeholder="Descripción para motores de búsqueda (máx 160 caracteres)" 
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Banner de la Colección</label>
            <div className="flex gap-3">
              <input 
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" 
                value={editing.banner_url} 
                onChange={e => setEditing({ ...editing, banner_url: e.target.value })} 
                placeholder="https://ejemplo.com/banner.jpg" 
              />
              <label className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-1.5 shadow-sm">
                <Upload className="w-4 h-4" /> 
                {uploadingBanner ? 'Subiendo...' : 'Subir'}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={uploadingBanner} />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Descripción de Colección</label>
            <textarea 
              rows={2} 
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" 
              value={editing.description} 
              onChange={e => setEditing({ ...editing, description: e.target.value })} 
              placeholder="Escribe algo sobre esta colección de productos..." 
            />
          </div>

          <div className="flex items-center pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={editing.is_active} 
                onChange={e => setEditing({ ...editing, is_active: e.target.checked })} 
                className="w-4.5 h-4.5 rounded text-primary-600 focus:ring-primary-500 border-gray-300" 
              />
              <span className="text-xs font-bold text-gray-700">Colección Activa y Visible en Vitrina</span>
            </label>
          </div>

          {/* Product Selector */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="p-3 border-b border-gray-100 bg-gray-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white" 
                  placeholder="Buscar entre tus productos de la tienda..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 p-2 space-y-1">
              {filteredProducts.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">No hay productos que coincidan.</div>
              ) : (
                filteredProducts.map(p => {
                  const isChecked = selectedProducts.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedProducts(prev => prev.filter(id => id !== p.id));
                          } else {
                            setSelectedProducts(prev => [...prev, p.id]);
                          }
                        }}
                        className="rounded text-primary-600 focus:ring-primary-500 border-gray-300 w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{p.title}</p>
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">Precio: ${p.base_price} · Estado: {p.status}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <div className="bg-gray-50/50 px-4 py-2.5 border-t border-gray-100 text-[10px] font-black text-slate-500 uppercase tracking-widest flex justify-between items-center">
              <span>{selectedProducts.length} seleccionados</span>
              <button 
                type="button" 
                onClick={() => setSelectedProducts(products.map(p => p.id))}
                className="text-primary-600 hover:underline"
              >
                Seleccionar todos
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditing(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={saveCollection} className="px-4 py-2 bg-primary-600 rounded-lg text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-sm flex items-center gap-1.5">
              <Save className="w-4 h-4" /> Guardar
            </button>
          </div>
        </div>
      )}

      {/* Collections List */}
      {loading ? (
        <div className="p-8 text-center text-gray-500">Cargando colecciones...</div>
      ) : collections.length === 0 ? (
        <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-200 rounded-xl">
          No has creado ninguna colección para esta tienda. ¡Haz clic en "Nueva Colección" arriba!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {collections.map(c => (
            <div key={c.id} className="p-5 border border-gray-200 rounded-xl bg-gray-50/40 hover:bg-gray-50 transition-all flex flex-col justify-between shadow-sm relative group">
              <div>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 leading-snug">{c.name}</h3>
                    <p className="text-[10px] font-mono text-blue-600 mt-1 flex items-center gap-1">
                      <LinkIcon className="w-3 h-3 text-slate-400" /> slug: {c.slug}
                    </p>
                  </div>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${c.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-150 text-gray-500 border-gray-250'}`}>
                    {c.is_active ? 'Activa' : 'Borrador'}
                  </span>
                </div>
                {c.banner_url && (
                  <img src={c.banner_url} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-200 my-3 shadow-inner" />
                )}
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{c.description || 'Sin descripción'}</p>
                <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                    {c.vendor_store_collection_products?.length || 0} Productos
                  </span>
                  {c.seo_title && (
                    <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                      SEO Title
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-150">
                <button 
                  onClick={() => handleCopyLink(c.slug, c.id)}
                  className="p-2 border border-gray-300 rounded-lg text-gray-600 bg-white hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-1 text-xs font-bold"
                  title="Copiar enlace público"
                >
                  {copiedId === c.id ? <Check className="w-3.5 h-3.5 text-green-500 animate-pulse" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === c.id ? 'Copiado' : 'Copiar Link'}
                </button>
                <button 
                  onClick={() => startEdit(c)}
                  className="p-2 border border-gray-300 rounded-lg text-gray-600 bg-white hover:bg-gray-50 transition-colors shadow-sm"
                  title="Editar"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => deleteCollection(c.id)}
                  className="p-2 border border-red-200 rounded-lg text-red-600 bg-white hover:bg-red-50 transition-colors shadow-sm"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

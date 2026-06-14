import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Layers, Plus, Trash2, Save, X, Package, Search, GripVertical, Link2, Copy, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

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
}

export default function VCollections() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProductGroup | null>(null);
  const [search, setSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLink = (slug: string, id: string) => {
    const url = `${window.location.origin}/collection/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    if (user) {
      fetchGroups();
      fetchProducts();
    }
  }, [user]);

  async function fetchGroups() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_groups')
        .select('*, product_group_items(product_id)')
        .eq('owner_vendor_id', user!.id)
        .order('sort_order');
      if (error) throw error;
      setGroups(data || []);
    } catch (err) {
      console.error('Error loading groups:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProducts() {
    try {
      // Fetch all vendor's own products (published, active, pending, draft) except archived ones
      const { data, error } = await supabase
        .from('products')
        .select('id, title, base_price, status')
        .eq('vendor_id', user!.id)
        .neq('status', 'archived')
        .order('title');
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error loading products:', err);
    }
  }

  function startNew() {
    setEditing({
      name: '',
      slug: '',
      description: '',
      type: 'manual',
      rules_json: '{}',
      is_active: true,
      show_on_home: false,
      sort_order: groups.length
    });
    setSelectedProducts([]);
  }

  function startEdit(g: any) {
    setEditing({
      ...g,
      show_on_home: g.show_on_home === true
    });
    setSelectedProducts((g.product_group_items || []).map((pi: any) => pi.product_id));
  }

  async function saveGroup() {
    if (!editing || !editing.name || !user) return;
    try {
      const baseSlug = editing.slug || editing.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      // Suffix the slug to prevent global collisions
      const finalSlug = baseSlug.includes(`-v${user.id.substring(0, 4)}`) 
        ? baseSlug 
        : `${baseSlug.replace(/-+$/, '')}-v${user.id.substring(0, 4)}`;

      const payload = { 
        ...editing, 
        slug: finalSlug, 
        rules_json: editing.rules_json || '{}',
        owner_vendor_id: user.id
      };
      delete (payload as any).product_group_items;

      let groupId = editing.id;
      if (editing.id) {
        const { error } = await supabase.from('product_groups').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('product_groups').insert(payload).select().single();
        if (error) throw error;
        groupId = data?.id;
      }

      if (groupId && editing.type === 'manual') {
        // Delete existing items for this group
        const { error: delErr } = await supabase.from('product_group_items').delete().eq('group_id', groupId);
        if (delErr) throw delErr;

        if (selectedProducts.length > 0) {
          // Insert selected products (which are all verified to belong to this vendor)
          const { error: insErr } = await supabase.from('product_group_items').insert(
            selectedProducts.map(pid => ({ group_id: groupId, product_id: pid }))
          );
          if (insErr) throw insErr;
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(null);
      fetchGroups();
    } catch (err: any) {
      alert('Error al guardar colección: ' + err.message);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm('¿Eliminar esta colección?')) return;
    try {
      await supabase.from('product_group_items').delete().eq('group_id', id);
      await supabase.from('product_groups').delete().eq('id', id);
      fetchGroups();
    } catch (err: any) {
      alert('Error al eliminar colección: ' + err.message);
    }
  }

  const filteredProducts = products.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary-600" /> Mis Colecciones y Grupos
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Agrupa tus productos publicados para utilizarlos en promociones, campañas o destacarlos.
          </p>
        </div>
        <div className="flex gap-2">
          {saved && (
            <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1">
              <Save className="w-3.5 h-3.5" /> Guardado
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
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Nombre</label>
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" 
                value={editing.name} 
                onChange={e => setEditing({ ...editing, name: e.target.value })} 
                placeholder="Ej. Ofertas Pop!" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Slug (Identificador en URL)</label>
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white font-mono text-blue-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" 
                value={editing.slug} 
                onChange={e => setEditing({ ...editing, slug: e.target.value })} 
                placeholder="ej-ofertas-pop" 
              />
              {editing.slug && user && (
                <p className="text-[10px] text-gray-400 mt-1 font-mono flex items-center gap-1">
                  <Link2 className="w-3 h-3 text-slate-400" /> URL: <span className="text-gray-600 font-semibold">{window.location.origin}/collection/{editing.slug.includes(`-v${user.id.substring(0, 4)}`) ? editing.slug : `${editing.slug.replace(/-+$/, '')}-v${user.id.substring(0, 4)}`}</span>
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Descripción</label>
            <textarea 
              rows={2} 
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" 
              value={editing.description} 
              onChange={e => setEditing({ ...editing, description: e.target.value })} 
              placeholder="Descripción breve de tu colección..." 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Tipo</label>
              <select 
                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none transition-all" 
                value={editing.type} 
                onChange={e => setEditing({ ...editing, type: e.target.value as any })}
              >
                <option value="manual">Manual (Selección individual)</option>
              </select>
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={editing.is_active} 
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })} 
                  className="w-4.5 h-4.5 rounded text-primary-600 focus:ring-primary-500 border-gray-300" 
                />
                <span className="text-xs font-bold text-gray-700">Colección Activa</span>
              </label>
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none opacity-50 cursor-not-allowed" title="Solo los administradores pueden activar en Home general">
                <input 
                  type="checkbox" 
                  checked={editing.show_on_home} 
                  disabled 
                  className="w-4.5 h-4.5 rounded text-primary-600 focus:ring-primary-500 border-gray-300 cursor-not-allowed" 
                />
                <span className="text-xs font-bold text-gray-700">Mostrar en Home Global</span>
              </label>
            </div>
          </div>

          {/* Product Selector */}
          {editing.type === 'manual' && (
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
              <div className="p-3 border-b border-gray-100 bg-gray-50/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white" 
                    placeholder="Buscar entre tus productos publicados..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-2 font-bold uppercase tracking-wider">{selectedProducts.length} productos seleccionados</p>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                {filteredProducts.map(p => (
                  <label key={p.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      checked={selectedProducts.includes(p.id)} 
                      onChange={() => {
                        setSelectedProducts(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]);
                      }} 
                      className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300" 
                    />
                    <span className="text-xs font-semibold text-gray-800 flex-1 flex items-center gap-2 flex-wrap">
                      {p.title}
                      {p.status !== 'published' && p.status !== 'active' && (
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                          p.status === 'draft' ? 'bg-gray-100 text-gray-500 border border-gray-200' :
                          p.status === 'pending_taxonomy_review' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                          'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {p.status === 'draft' ? 'Borrador' :
                           p.status === 'pending_taxonomy_review' ? 'Pendiente' :
                           p.status}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-black text-slate-400">${p.base_price}</span>
                  </label>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="p-4 text-center text-xs text-gray-400 italic">No tienes productos publicados que coincidan</div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-xs font-bold border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
              Cancelar
            </button>
            <button onClick={saveGroup} className="px-4 py-2 text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm shadow-primary-200">
              <Save className="w-3.5 h-3.5" /> Guardar Colección
            </button>
          </div>
        </div>
      )}

      {/* Groups List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 animate-pulse font-bold">Cargando colecciones...</div>
      ) : groups.length === 0 && !editing ? (
        <div className="p-12 rounded-xl border-2 border-dashed border-gray-200 text-center">
          <Layers className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-bold text-gray-600 text-sm">No tienes colecciones creadas</p>
          <p className="text-xs text-gray-400 mt-1">Crea colecciones personalizadas para agrupar tus productos y usarlos en promociones.</p>
          <button onClick={startNew} className="mt-4 px-4 py-2 text-xs font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm">
            Crear tu primera colección
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className="border border-gray-100 rounded-xl p-4 flex items-center justify-between hover:border-primary-100 hover:shadow-sm transition-all group bg-white">
              <div className="flex items-center gap-4">
                <GripVertical className="w-4.5 h-4.5 text-gray-300 group-hover:text-gray-400 cursor-grab" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-gray-900 text-sm">{g.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${g.is_active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                      {g.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-100">
                      {g.type === 'manual' ? 'Manual' : 'Auto'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {g.description || 'Sin descripción'} · <span className="font-bold text-primary-600">{g.product_group_items?.length || 0} productos</span>
                  </p>
                  
                  {g.is_active && (
                    <div className="mt-2 flex items-center gap-2 text-[10px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1 w-fit">
                      <span className="text-slate-400 font-mono">Enlace público:</span>
                      <a
                        href={`/collection/${g.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 font-bold flex items-center gap-0.5"
                      >
                        /collection/{g.slug} <Link2 className="w-2.5 h-2.5" />
                      </a>
                      <span className="text-slate-200">|</span>
                      <button
                        onClick={() => handleCopyLink(g.slug, g.id)}
                        className="text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1 transition-colors"
                      >
                        {copiedId === g.id ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-green-600" />
                            <span className="text-green-600">¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(g)} className="px-3 py-1.5 text-xs font-bold border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
                  Editar
                </button>
                <button onClick={() => deleteGroup(g.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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

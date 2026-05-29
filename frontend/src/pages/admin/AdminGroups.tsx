import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Layers, Plus, Trash2, Save, X, Package, Search, GripVertical, Link2, Copy, Check } from 'lucide-react';

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

export default function AdminGroups() {
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

  function startNew() {
    setEditing({ name: '', slug: '', description: '', type: 'manual', rules_json: '{}', is_active: true, show_on_home: true, sort_order: groups.length });
    setSelectedProducts([]);
  }

  function startEdit(g: any) {
    setEditing({
      ...g,
      show_on_home: g.show_on_home !== false
    });
    setSelectedProducts((g.product_group_items || []).map((pi: any) => pi.product_id));
  }

  async function saveGroup() {
    if (!editing || !editing.name) return;
    const slug = editing.slug || editing.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const payload = { ...editing, slug, rules_json: editing.rules_json || '{}' };
    delete (payload as any).product_group_items;

    let groupId = editing.id;
    if (editing.id) {
      await supabase.from('product_groups').update(payload).eq('id', editing.id);
    } else {
      const { data } = await supabase.from('product_groups').insert(payload).select().single();
      groupId = data?.id;
    }

    if (groupId && editing.type === 'manual') {
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
    await supabase.from('product_group_items').delete().eq('group_id', id);
    await supabase.from('product_groups').delete().eq('id', id);
    fetchGroups();
  }

  const filteredProducts = products.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  );

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
            <h3 className="font-bold text-lg">{editing.id ? 'Editar' : 'Nueva'} Colección</h3>
            <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-400" /></button>
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
            <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={saveGroup} className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" /> Guardar Colección</button>
          </div>
        </div>
      )}

      {/* Groups List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 animate-pulse">Cargando colecciones...</div>
      ) : groups.length === 0 && !editing ? (
        <div className="bg-white p-12 rounded-xl border border-dashed border-gray-300 text-center">
          <Layers className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-bold text-gray-500">No hay colecciones creadas</p>
          <p className="text-sm text-gray-400 mt-1">Crea una colección para agrupar productos en la vitrina</p>
          <button onClick={startNew} className="mt-4 btn-primary text-sm">Crear primera colección</button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-4">
                <GripVertical className="w-5 h-5 text-gray-300 group-hover:text-gray-400 cursor-grab" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-gray-900">{g.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${g.is_active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                      {g.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${g.show_on_home ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                      {g.show_on_home ? 'En Home' : 'Oculta en Home'}
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

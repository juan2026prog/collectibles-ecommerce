import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Search, Eye, X, Upload, Save, AlertCircle } from 'lucide-react';
import { useRef } from 'react';
import { ImageIcon } from 'lucide-react';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import ImportModal from '../../components/admin/ImportModal';
import type { ParsedProduct } from '../../lib/bulkImportUtils';
import { downloadTemplate } from '../../lib/bulkImportUtils';

interface Product {
  id: string;
  title: string;
  slug: string;
  base_price: number;
  compare_at_price: number | null;
  status: string;
  badge: string | null;
  is_featured: boolean;
  category: { id?: string, name: string } | null;
  brand: { id?: string, name: string } | null;
  images: { id?: string, url: string }[];
  variants: { id?: string, inventory_count: number; sku?: string }[];
  created_at: string;
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  const [form, setForm] = useState({
    title: '', slug: '', description: '', short_description: '',
    base_price: '', compare_at_price: '', cost: '', sku: '', stock: '10', status: 'draft',
    badge: '', is_featured: false, category_id: '', brand_id: '',
    seo_title: '', seo_description: '', image_url: '', video_url: ''
  });

  useEffect(() => { fetchProducts(); fetchMeta(); }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*, category:categories(id, name), brand:brands(id, name), images:product_images(id, url), variants:product_variants(id, inventory_count, sku)')
      .order('created_at', { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  async function fetchMeta() {
    const [{ data: cats }, { data: brs }] = await Promise.all([
      supabase.from('categories').select('id, name').order('sort_order'),
      supabase.from('brands').select('id, name').order('sort_order'),
    ]);
    setCategories(cats || []);
    setBrands(brs || []);
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: '', slug: '', description: '', short_description: '', base_price: '', compare_at_price: '', cost: '', sku: `SKU-${Date.now()}`, stock: '10', status: 'draft', badge: '', is_featured: false, category_id: '', brand_id: '', seo_title: '', seo_description: '', image_url: '', video_url: '' });
    setShowForm(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({
      title: product.title, slug: product.slug, description: '', short_description: '',
      base_price: product.base_price.toString(), compare_at_price: product.compare_at_price?.toString() || '',
      cost: '', sku: product.variants?.[0]?.sku || `SKU-${Date.now()}`, stock: product.variants?.[0]?.inventory_count?.toString() || '10',
      status: product.status, badge: product.badge || '', is_featured: product.is_featured,
      category_id: product.category?.id || '', brand_id: product.brand?.id || '', seo_title: '', seo_description: '',
      image_url: product.images?.[0]?.url || '', video_url: ''
    });
    setShowForm(true);
  }

  async function handleDuplicate(product: Product) {
    if (!confirm('¿Duplicar este producto?')) return;
    const { data: newProduct } = await supabase.from('products').insert({
      title: `${product.title} (Copia)`,
      slug: `${product.slug}-copia-${Date.now()}`,
      base_price: product.base_price,
      status: 'draft',
      is_featured: false
    }).select().single();
    if (newProduct) {
      await supabase.from('product_variants').insert({ product_id: newProduct.id, sku: `SKU-${Date.now()}`, name: 'Standard', inventory_count: 0 });
    }
    fetchProducts();
  }

  async function handleArchive(id: string) {
    await supabase.from('products').update({ status: 'archived' }).eq('id', id);
    fetchProducts();
  }

  async function handleSave() {
    try {
      if (!form.title) throw new Error("El título es obligatorio");

      const payload = {
        title: form.title,
        slug: form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: form.description,
        short_description: form.short_description,
        base_price: parseFloat(form.base_price) || 0,
        compare_at_price: form.compare_at_price ? parseFloat(form.compare_at_price) : null,
        status: form.status,
        badge: form.badge || null,
        is_featured: form.is_featured,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
      };

      if (editing) {
        const { error: updateError } = await supabase.from('products').update(payload).eq('id', editing.id);
        if (updateError) throw updateError;

        // Image Update
        if (form.image_url) {
          const existingImage = editing.images?.[0];
          if (existingImage && existingImage.id) {
            await supabase.from('product_images').update({ url: form.image_url }).eq('id', existingImage.id);
          } else {
            await supabase.from('product_images').insert({ product_id: editing.id, url: form.image_url, is_primary: true, sort_order: 0 });
          }
        } else {
          const existingImage = editing.images?.[0];
          if (existingImage && existingImage.id) {
            await supabase.from('product_images').delete().eq('id', existingImage.id);
          }
        }

        // Variant Update
        const existingVariant = editing.variants?.[0];
        if (existingVariant && existingVariant.id) {
          await supabase.from('product_variants').update({ sku: form.sku, inventory_count: parseInt(form.stock) || 0 }).eq('id', existingVariant.id);
        }
      } else {
        const { data: newProduct, error: insertError } = await supabase.from('products').insert(payload).select().single();
        if (insertError) throw insertError;
        
        if (newProduct && form.image_url) {
          await supabase.from('product_images').insert({ product_id: newProduct.id, url: form.image_url, is_primary: true, sort_order: 0 });
        }
        if (newProduct) {
          await supabase.from('product_variants').insert({ product_id: newProduct.id, sku: form.sku || `SKU-${Date.now()}`, name: 'Standard', inventory_count: parseInt(form.stock) || 0 });
        }
      }
      setShowForm(false);
      fetchProducts();
    } catch (err: any) {
      alert(`Error al guardar: ${err.message}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this product?')) return;
    await supabase.from('products').delete().eq('id', id);
    fetchProducts();
  }

  // --- BULK IMPORTER LOGIC ---
  async function handleImportConfirm(parsedDocs: ParsedProduct[]) {
    setShowImport(false);
    setImporting(true);
    let successCount = 0;
    
    try {
      for (const prod of parsedDocs) {
        // Resolve Category ID
        let catId = null;
        if (prod.category_name) {
          const cat = categories.find(c => c.name.toLowerCase() === prod.category_name?.trim().toLowerCase());
          catId = cat?.id || null;
        }

        // Resolve Brand ID
        let brandId = null;
        if (prod.brand_name) {
          const brand = brands.find(b => b.name.toLowerCase() === prod.brand_name?.trim().toLowerCase());
          brandId = brand?.id || null;
        }

        const payload = {
          title: prod.title.trim(),
          slug: prod.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4),
          base_price: prod.base_price,
          compare_at_price: prod.compare_at_price || null,
          status: 'draft',
          category_id: catId,
          brand_id: brandId,
          is_featured: false,
          description: prod.description || null,
        };

        const { data: newProd } = await supabase.from('products').insert(payload).select().single();
        if (newProd) {
          await supabase.from('product_variants').insert({
            product_id: newProd.id,
            sku: prod.sku?.trim() || `SKU-${Date.now()}`,
            name: 'Standard',
            inventory_count: prod.stock || 0
          });

          if (prod.image_url?.trim()) {
            await supabase.from('product_images').insert({ product_id: newProd.id, url: prod.image_url.trim(), is_primary: true, sort_order: 0 });
          }
          successCount++;
        }
      }
      alert(`¡Importación completada! Se cargaron ${successCount} productos exitosamente.`);
    } catch (err: any) {
      alert('Error importando: ' + err.message);
    } finally {
      setImporting(false);
      fetchProducts();
    }
  }

  const filtered = products.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  const totalStock = (p: Product) => p.variants?.reduce((s, v) => s + v.inventory_count, 0) || 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Search products..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} disabled={importing} className="btn-secondary gap-2 text-sm px-4 py-2">
            <Upload className="w-4 h-4" /> {importing ? 'Importando...' : 'Importar CSV / Excel'}
          </button>
          <button onClick={openCreate} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Nuevo Producto</button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 flex gap-2">
          <button className="text-sm font-medium text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100">Edición Masiva</button>
          <button className="text-sm font-medium text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100">Exportar CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No products found</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={p.images?.[0]?.url || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-lg object-cover border" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 line-clamp-1">{p.title}</p>
                        {p.badge && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary-100 text-primary-700">{p.badge}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-gray-900">${p.base_price}</span>
                    {p.compare_at_price && <span className="ml-1 text-xs text-gray-400 line-through">${p.compare_at_price}</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-bold ${totalStock(p) <= 3 ? 'text-red-600' : 'text-green-600'}`}>
                      {totalStock(p)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      p.status === 'published' ? 'bg-green-100 text-green-700' :
                      p.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.category?.name || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a href={`/p/${p.slug}`} target="_blank" title="Ver" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Eye className="w-4 h-4" /></a>
                      <button onClick={() => openEdit(p)} title="Editar" className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDuplicate(p)} title="Duplicar" className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </button>
                      <button onClick={() => handleArchive(p.id)} title="Archivar" className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ CREATE/EDIT MODAL ═══ */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowForm(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white z-50 shadow-2xl flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">{editing ? 'Edit Product' : 'New Product'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="form-label">Title *</label>
                <input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Slug</label>
                <input className="form-input" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="auto-generated" />
              </div>
                <div>
                  <label className="form-label">Price *</label>
                  <input type="number" className="form-input" value={form.base_price} onChange={e => setForm({...form, base_price: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">Compare Price</label>
                  <input type="number" className="form-input" value={form.compare_at_price} onChange={e => setForm({...form, compare_at_price: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">Costo (interno)</label>
                  <input type="number" className="form-input" value={form.cost} onChange={e => setForm({...form, cost: e.target.value})} />
                </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">SKU</label>
                  <input className="form-input" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">Stock</label>
                  <input type="number" className="form-input" value={form.stock} onChange={e => setForm({...form, stock: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Category</label>
                  <select className="form-input" value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}>
                    <option value="">Select...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Brand</label>
                  <select className="form-input" value={form.brand_id} onChange={e => setForm({...form, brand_id: e.target.value})}>
                    <option value="">Select...</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Status</label>
                  <select className="form-input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Badge</label>
                  <select className="form-input" value={form.badge} onChange={e => setForm({...form, badge: e.target.value})}>
                    <option value="">None</option>
                    <option value="hot">HOT</option>
                    <option value="new">NEW</option>
                    <option value="sale">SALE</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">Breve Descripción Comercial</label>
                <textarea className="form-input min-h-[50px]" value={form.short_description} onChange={e => setForm({...form, short_description: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Description Completa</label>
                <textarea className="form-input min-h-[100px]" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div>
                <label className="form-label mb-1">Image URL</label>
                <div className="flex gap-2">
                  <input className="form-input flex-1" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} placeholder="https://..." />
                  <button onClick={() => setShowMediaPicker(true)} type="button" className="btn-secondary px-3" title="Seleccionar de Biblioteca">
                    <ImageIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="form-label">Video URL (YouTube/MP4)</label>
                <input className="form-input" value={form.video_url} onChange={e => setForm({...form, video_url: e.target.value})} placeholder="Opcional" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} className="w-4 h-4 rounded text-primary-600" />
                <span className="text-sm font-medium">Featured product</span>
              </label>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} className="btn-primary flex-1 gap-2"><Save className="w-4 h-4" /> Save</button>
            </div>
          </div>
        </>
      )}

      {/* ═══ IMPORT MODAL ═══ */}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onConfirm={handleImportConfirm} />
      )}

      {/* ═══ MEDIA PICKER MODAL ═══ */}
      <MediaPickerModal 
        isOpen={showMediaPicker} 
        onClose={() => setShowMediaPicker(false)} 
        onSelect={(url) => setForm({ ...form, image_url: url })} 
      />
    </div>
  );
}

import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Search, Eye, X, Upload, Save, AlertCircle, Check, Loader2, ImageIcon, ChevronUp, ChevronDown, Trash } from 'lucide-react';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import ImportModal from '../../components/admin/ImportModal';
import type { ParsedProduct } from '../../lib/bulkImportUtils';

function getProductImage(product: any): string {
  const img = product.images?.[0];
  if (!img?.url) return 'https://via.placeholder.com/40';
  if (img.url.match(/^[a-f0-9-]{36}$/)) return 'https://via.placeholder.com/40';
  return img.url;
}

interface InlineEditProps {
  value: string | number;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  onSave: (value: any) => Promise<void>;
  className?: string;
}

function InlineEdit({ value, type = 'text', options = [], onSave, className = '' }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => { setLocalValue(value); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    if (localValue === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(localValue); setEditing(false); } catch (err) { setLocalValue(value); console.error(err); } finally { setSaving(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setLocalValue(value); setEditing(false); }
  };

  if (editing) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {type === 'select' ? (
          <select ref={inputRef as any} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleSave} onKeyDown={handleKeyDown} className="text-sm border-2 border-primary-500 rounded px-2 py-1 bg-white focus:outline-none">
            {options.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
          </select>
        ) : (
          <input ref={inputRef as any} type={type} value={localValue} onChange={(e) => setLocalValue(type === 'number' ? Number(e.target.value) : e.target.value)} onBlur={handleSave} onKeyDown={handleKeyDown} className="text-sm border-2 border-primary-500 rounded px-2 py-1 w-24 focus:outline-none" />
        )}
        {saving && <Loader2 className="w-4 h-4 animate-spin text-primary-500" />}
      </div>
    );
  }

  return (
    <div onDoubleClick={() => !saving && setEditing(true)} className={`cursor-pointer hover:bg-primary-50 hover:text-primary-700 px-2 py-1 -mx-2 rounded transition-colors ${className}`} title="Doble click para editar">
      {type === 'select' ? options.find(o => o.value === value)?.label || value : value}
    </div>
  );
}

// �"��"��"� REUSABLE SIDEBAR UI WIDGET �"��"��"�
function SidebarWidget({ title, children, onToggle }: { title: string, children: React.ReactNode, onToggle?: () => void }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="bg-white border text-sm overflow-hidden shadow-sm">
      <div className="px-3 py-2 border-b bg-gray-50/50 flex justify-between items-center group cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
         <h4 className="font-bold text-gray-600">{title}</h4>
         <div className="flex items-center gap-1">
            <button className="text-gray-400 group-hover:text-primary-500"><ChevronUp className={`w-3.5 h-3.5 transition-transform ${!isOpen ? 'rotate-180' : ''}`} /></button>
         </div>
      </div>
      {isOpen && <div className="p-3">{children}</div>}
    </div>
  );
}

interface Product {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  base_price: number;
  compare_at_price: number | null;
  status: string;
  badge: string | null;
  is_featured: boolean;
  category: { id?: string, name: string } | null;
  brand: { id?: string, name: string } | null;
  images: { id?: string, url: string }[];
  variants: { id?: string, inventory_count: number; sku?: string }[];
  ml_item_id?: string;
  ml_category_id?: string;
  metadata?: any;
  created_at: string;
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState<false | 'featured' | 'gallery'>(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{ id: string, field: string } | null>(null);
  const [inlineValue, setInlineValue] = useState<any>(null);
  
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'Todos'>(50);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  
  const [form, setForm] = useState({
    title: '', slug: '', description: '', short_description: '',
    base_price: '', compare_at_price: '', sku: '', stock: '10', status: 'published',
    badge: '', is_featured: false, category_id: '', brand_id: '',
    image_url: '', video_url: '',
    // Many-to-many
    categories: [] as string[],
    tags: [] as string[],
    brands: [] as string[],
    gallery: [] as { url: string }[]
  });

  const [tagInput, setTagInput] = useState('');
  const [newCatInput, setNewCatInput] = useState('');
  const [newBrandInput, setNewBrandInput] = useState('');

  useEffect(() => { fetchProducts(); fetchMeta(); }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*, product_categories(categories(id, name)), brand:brands(id, name), images:product_images(id, url), variants:product_variants(id, inventory_count, sku)')
      .order('created_at', { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  async function fetchMeta() {
    const [{ data: cats }, { data: brs }, { data: tgs }] = await Promise.all([
      supabase.from('categories').select('id, name').order('sort_order'),
      supabase.from('brands').select('id, name').order('sort_order'),
      supabase.from('tags').select('id, name').order('name'),
    ]);
    setCategories(cats || []);
    setBrands(brs || []);
    setTags(tgs || []);
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: '', slug: '', description: '', short_description: '', base_price: '', compare_at_price: '', sku: `SKU-${Date.now()}`, stock: '10', status: 'published', badge: '', is_featured: false, category_id: '', brand_id: '', image_url: '', video_url: '', categories: [], tags: [], brands: [], gallery: [] });
    setShowForm(true);
  }

  async function openEdit(product: Product) {
    setEditing(product);
    
    // Fetch associated junction data
    const [{ data: pCats }, { data: pTags }] = await Promise.all([
       supabase.from('product_categories').select('category_id').eq('product_id', product.id),
       supabase.from('product_tags').select('tags(id, name)').eq('product_id', product.id)
    ]);

    setForm({
      title: product.title, 
      slug: product.slug, 
      description: product.description || '', 
      short_description: product.short_description || '',
      base_price: product.base_price.toString(), 
      compare_at_price: product.compare_at_price?.toString() || '',
      sku: product.variants?.[0]?.sku || `SKU-${Date.now()}`, 
      stock: product.variants?.[0]?.inventory_count?.toString() || '10',
      status: product.status, 
      badge: product.badge || '', 
      is_featured: product.is_featured,
      category_id: product.category?.id || '', 
      brand_id: product.brand?.id || '',
      image_url: product.images?.[0]?.url || '', 
      video_url: '',
      categories: pCats?.map(c => c.category_id) || [],
      tags: (pTags as any)?.map((t:any) => t.tags.name) || [],
      brands: product.brand?.id ? [product.brand.id] : [],
      gallery: product.images?.slice(1) || []
    });
    setShowForm(true);
  }

  async function handleSave() {
    try {
      if (!form.title) throw new Error("El título es obligatorio");
      let titleSlug = form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'); if (!editing && !form.slug) { titleSlug = `${titleSlug.replace(/-+$/, '')}-`; }

      const payload = {
        title: form.title, slug: titleSlug, description: form.description, short_description: form.short_description,
        base_price: parseFloat(form.base_price) || 0, compare_at_price: form.compare_at_price ? parseFloat(form.compare_at_price) : null,
        status: form.status, badge: form.badge || null, is_featured: form.is_featured,
        brand_id: form.brands[0] || null, category_id: form.categories[0] || null
      };

      let productId = editing?.id;
      if (editing) {
        const { error: updProdErr } = await supabase.from('products').update(payload).eq('id', productId).select().single();
        if (updProdErr) throw updProdErr;
      } else {
        const { data: newProd, error: insertError } = await supabase.from('products').insert(payload).select().single();
        if (insertError) throw insertError;
        productId = newProd.id;
      }

      if (!productId) return;

      // �"��"��"� Media �"��"��"�
      await supabase.from('product_images').delete().eq('product_id', productId);
      const imagesPayload = [];
      if (form.image_url) imagesPayload.push({ product_id: productId, url: form.image_url, is_primary: true, sort_order: 0 });
      form.gallery.forEach((g, i) => imagesPayload.push({ product_id: productId, url: g.url, is_primary: false, sort_order: i + 1 }));
      if (imagesPayload.length > 0) {
        const { error: insImgErr } = await supabase.from('product_images').insert(imagesPayload);
        if (insImgErr) throw insImgErr;
      }

      // 📦 Variants 📦
      const skuVal = form.sku || `SKU-${Date.now()}`;
      const { error: varErr } = await supabase.from('product_variants').upsert({ product_id: productId, sku: skuVal, name: 'Standard', inventory_count: parseInt(form.stock) || 0 }, { onConflict: 'product_id' });
      if (varErr) throw varErr;

      // 📦 Junctions 📦
      const [delCats, delTags] = await Promise.all([
        supabase.from('product_categories').delete().eq('product_id', productId),
        supabase.from('product_tags').delete().eq('product_id', productId)
      ]);
      if (delCats.error) throw delCats.error;
      if (delTags.error) throw delTags.error;
      
      if (form.categories.length > 0) {
        const { error: insCatErr } = await supabase.from('product_categories').insert(form.categories.map(cid => ({ product_id: productId, category_id: cid })));
        if (insCatErr) throw insCatErr;
      }

      // Handle Tags (Ensure they exist)
      if (form.tags.length > 0) {
        for (const tagName of form.tags) {
           const slugTag = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
           const { data: tag } = await supabase.from('tags').upsert({ name: tagName, slug: slugTag }, { onConflict: 'name' }).select().single();
           if (tag) await supabase.from('product_tags').insert({ product_id: productId, tag_id: tag.id });
        }
      }

      setShowForm(false);
      fetchProducts();
      fetchMeta();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }

  const addTag = () => {
    if (!tagInput.trim() || form.tags.includes(tagInput.trim())) return;
    setForm({ ...form, tags: [...form.tags, tagInput.trim()] });
    setTagInput('');
  };

  const removeTag = (t: string) => setForm({ ...form, tags: form.tags.filter(tag => tag !== t) });

  const toggleCategory = (id: string) => {
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(id) ? prev.categories.filter(cid => cid !== id) : [...prev.categories, id]
    }));
  };

  const toggleBrand = (id: string) => {
    setForm(prev => ({
      ...prev,
      brands: prev.brands.includes(id) ? prev.brands.filter(bid => bid !== id) : [id] 
    }));
  };

  const handleAddCategory = async () => {
    if (!newCatInput.trim()) return;
    try {
      const slug = newCatInput.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      const { data, error } = await supabase.from('categories').insert({ name: newCatInput, slug }).select().single();
      if (error) throw error;
      setCategories([...categories, data]);
      toggleCategory(data.id);
      setNewCatInput('');
    } catch (err: any) { alert(err.message); }
  };

  const handleAddBrand = async () => {
    if (!newBrandInput.trim()) return;
    try {
      const slug = newBrandInput.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      const { data, error } = await supabase.from('brands').insert({ name: newBrandInput, slug }).select().single();
      if (error) throw error;
      setBrands([...brands, data]);
      toggleBrand(data.id);
      setNewBrandInput('');
    } catch (err: any) { alert(err.message); }
  };

  const handleInlineUpdate = async (id: string, field: string, value: any) => {
    try {
      const updates: any = {};
      
      // Handle special fields
      if (field === 'category_id') {
        const { error } = await supabase.from('product_categories').delete().eq('product_id', id);
        if (error) throw error;
        if (value) {
          const { error: insErr } = await supabase.from('product_categories').insert({ product_id: id, category_id: value });
          if (insErr) throw insErr;
          const { error: updErr } = await supabase.from('products').update({ category_id: value }).eq('id', id).select().single();
          if (updErr) throw updErr;
        } else {
          const { error: updErr2 } = await supabase.from('products').update({ category_id: null }).eq('id', id).select().single();
          if (updErr2) throw updErr2;
        }
      } else if (field === 'stock') {
        const { data: vars } = await supabase.from('product_variants').select('id').eq('product_id', id).limit(1);
        if (vars && vars.length > 0) {
          const { error } = await supabase.from('product_variants').update({ inventory_count: parseInt(value) || 0 }).eq('id', vars[0].id).select().single();
          if (error) throw error;
        } else {
          await supabase.from('product_variants').insert({ product_id: id, sku: `SKU-${Date.now()}`, name: 'Standard', inventory_count: parseInt(value) || 0 });
        }
      } else {
        updates[field] = value;
        const { error } = await supabase.from('products').update(updates).eq('id', id).select().single();
        if (error) throw error;
      }
      
      setInlineEdit(null);
      fetchProducts();
    } catch (err: any) {
      alert(`Error updating: ${err.message}`);
    }
  };

  const handleGenerateAI = async (action: 'improve' | 'generate') => {
    if (action === 'generate' && !form.title) { alert("Ingresa un título primero"); return; }
    setLoadingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: { action, currentText: form.description, prompt: form.title }
      });
      if (error) throw error;
      if (data.success) {
        setForm({ ...form, description: data.text });
      } else {
        throw new Error(data.error || "Error de la IA");
      }
    } catch (err: any) {
      alert(`Error IA: ${err.message}`);
    } finally {
      setLoadingAI(false);
    }
  };

  const handleBulkPublish = async () => {
    if (!confirm(`¿Publicar ${selectedProducts.length} productos seleccionados?`)) return;
    try {
       await supabase.from('products').update({ status: 'published' }).in('id', selectedProducts);
       setSelectedProducts([]);
       fetchProducts();
    } catch (err: any) { alert(err.message); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar permanente ${selectedProducts.length} productos seleccionados? Esta acción no se puede deshacer.`)) return;
    try {
       await supabase.from('products').delete().in('id', selectedProducts);
       setSelectedProducts([]);
       fetchProducts();
    } catch (err: any) { alert(err.message); }
  };

  const addToGallery = (url: string) => setForm({ ...form, gallery: [...form.gallery, { url }] });
  const removeFromGallery = (idx: number) => setForm({ ...form, gallery: form.gallery.filter((_, i) => i !== idx) });

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-2xl font-black text-dark-900">Productos <span className="bg-blue-600 text-white text-[8px] px-1 py-0.5 rounded ml-2">v2</span></h2>
            <p className="text-gray-500 text-sm italic">Gestión de catálogo y stock</p>
          </div>
          
          <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-sm hover:border-blue-400 transition-colors">
            <input 
              type="checkbox" 
              className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" 
              checked={products.length > 0 && products.slice(0, itemsPerPage === 'Todos' ? products.length : itemsPerPage).every(p => selectedProducts.includes(p.id))}
              onChange={(e) => {
                const currentList = products.slice(0, itemsPerPage === 'Todos' ? products.length : (itemsPerPage as number));
                if (e.target.checked) setSelectedProducts(currentList.map(p => p.id));
                else setSelectedProducts([]);
              }}
            />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar Página</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowImport(true)} className="btn-secondary px-4 py-2 text-sm gap-2"><Upload className="w-4 h-4" /> Importar</button>
          <button onClick={openCreate} className="btn-primary gap-2 bg-blue-600 hover:bg-blue-700 border-blue-600"><Plus className="w-5 h-5" /> Añadir nuevo</button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border shadow-sm min-h-[calc(100vh-160px)] flex flex-col overflow-hidden">
         <div className="p-4 border-b bg-gray-50/50 flex gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar productos..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500" />
            </div>
            <div className="flex gap-4 items-center">
               <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-bold">Mostrar:</span>
                  <select className="border-gray-200 border rounded text-xs p-1" value={itemsPerPage} onChange={(e) => { setItemsPerPage(e.target.value === 'Todos' ? 'Todos' : Number(e.target.value)); setCurrentPage(1); }}>
                     <option value="50">50</option>
                     <option value="200">200</option>
                     <option value="Todos">Todos</option>
                  </select>
               </div>
               <div className="flex gap-2 text-xs font-bold text-gray-500">
                  <button className="px-3 py-1.5 hover:bg-white rounded-md border border-transparent hover:border-gray-200 transition-all">Todos</button>
                  <button className="px-3 py-1.5 hover:bg-white rounded-md border border-transparent hover:border-gray-200 transition-all">Publicados</button>
                  <button className="px-3 py-1.5 hover:bg-white rounded-md border border-transparent hover:border-gray-200 transition-all">Borradores</button>
               </div>
            </div>
         </div>
         {selectedProducts.length > 0 && (
            <div className="bg-blue-50 border-b border-blue-100 px-6 py-2.5 flex gap-4 items-center animate-fade-in">
               <span className="text-sm font-bold text-blue-800 tracking-tight">{selectedProducts.length} seleccionados</span>
               <div className="flex gap-2">
                 <button onClick={handleBulkPublish} className="btn-secondary py-1 text-xs px-4 text-green-700 bg-white border-green-200 hover:bg-green-50 shadow-sm">Publicar Todos</button>
                 <button onClick={handleBulkDelete} className="btn-secondary py-1 text-xs px-4 text-red-600 bg-white border-red-200 hover:bg-red-50 shadow-sm">Eliminar Todos</button>
               </div>
            </div>
         )}
         <div className="flex-1 overflow-auto">
            <table className="min-w-full divide-y divide-gray-100">
               <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                 <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                   <th className="px-6 py-4 w-12">
                     {(() => {
                        const filtered = products.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
                        const currentSubset = itemsPerPage === 'Todos' ? filtered : filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
                        return (
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300" 
                            checked={selectedProducts.length > 0 && currentSubset.every(p => selectedProducts.includes(p.id))}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedProducts(currentSubset.map((p: any) => p.id));
                              else setSelectedProducts([]);
                            }}
                          />
                        );
                     })()}
                   </th>
                   <th className="px-6 py-4">Producto</th>
                   <th className="px-6 py-4">Precio</th>
                   <th className="px-6 py-4">Categoría</th>
                   <th className="px-6 py-4">Stock</th>
                   <th className="px-6 py-4">Estado</th>
                   <th className="px-6 py-4 text-right">Fecha</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                 {loading ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400 animate-pulse">Cargando catálogo...</td></tr>
                 ) : (() => {
                    const filtered = products.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
                    const currentSubset = itemsPerPage === 'Todos' ? filtered : filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
                    return currentSubset.map((p: any) => {
                    const primaryCat = p.product_categories?.[0]?.categories;
                    return (
                    <tr key={p.id} className="hover:bg-blue-50/20 group transition-all" title="Haz clic en cualquier campo para editarlo en línea">
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300" 
                          checked={selectedProducts.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedProducts([...selectedProducts, p.id]);
                            else setSelectedProducts(selectedProducts.filter(id => id !== p.id));
                          }}
                          onClick={e => e.stopPropagation()} 
                        />
                      </td>
                      <td className="px-6 py-4 cursor-pointer hover:bg-white transition-colors rounded" onDoubleClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'title'}); setInlineValue(p.title); }}>
                         <div className="flex items-center gap-4">
                            <img src={getProductImage(p)} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-100 shadow-sm" />
                            <div>
                               {inlineEdit?.id === p.id && inlineEdit.field === 'title' ? (
                                  <input autoFocus type="text" className="w-48 p-1 border rounded text-xs font-bold text-dark-900" 
                                    value={inlineValue} onChange={e => setInlineValue(e.target.value)}
                                    onBlur={() => handleInlineUpdate(p.id, 'title', inlineValue)}
                                    onKeyDown={e => e.key === 'Enter' && handleInlineUpdate(p.id, 'title', inlineValue)}
                                    onClick={e => e.stopPropagation()} />
                               ) : (
                                  <p className="font-bold text-dark-900 group-hover:text-blue-600 transition-colors">{p.title}</p>
                               )}
                               <div className="flex gap-1 items-center mt-0.5">
                                  <span className="text-[9px] font-mono text-gray-400 uppercase">{p.variants?.[0]?.sku || '-'}</span>
                                  {p.ml_item_id && <div className="w-6 h-3 bg-yellow-400 rounded-sm text-[8px] flex items-center justify-center font-bold text-blue-900 ml-1">ML</div>}
                               </div>
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-4 font-black text-dark-800 text-sm whitespace-nowrap cursor-pointer hover:bg-white transition-colors rounded" onDoubleClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'base_price'}); setInlineValue(p.base_price); }}>
                        {inlineEdit?.id === p.id && inlineEdit.field === 'base_price' ? (
                          <input autoFocus type="number" className="w-24 p-1 border rounded text-xs font-bold" value={inlineValue} onChange={e => setInlineValue(e.target.value)} onBlur={() => handleInlineUpdate(p.id, 'base_price', inlineValue)} onKeyDown={e => e.key === 'Enter' && handleInlineUpdate(p.id, 'base_price', inlineValue)} onClick={e => e.stopPropagation()} />
                        ) : (
                          <span>UYU {p.base_price.toLocaleString()}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-gray-500 cursor-pointer hover:bg-white transition-colors rounded" onDoubleClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'category_id'}); setInlineValue(primaryCat?.id || ''); }}>
                        {inlineEdit?.id === p.id && inlineEdit.field === 'category_id' ? (
                          <select 
                            autoFocus
                            className="bg-white border rounded text-[10px] p-1 font-bold outline-none"
                            value={inlineValue || ''}
                            onChange={e => { setInlineValue(e.target.value); handleInlineUpdate(p.id, 'category_id', e.target.value); }}
                            onBlur={() => setInlineEdit(null)}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="">- Sin Categoría -</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        ) : (
                          primaryCat?.name || '-'
                        )}
                      </td>
                      <td className="px-6 py-4 cursor-pointer hover:bg-white transition-colors rounded" onDoubleClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'stock'}); setInlineValue(p.variants?.[0]?.inventory_count || 0); }}>
                         {inlineEdit?.id === p.id && inlineEdit.field === 'stock' ? (
                            <input autoFocus type="number" className="w-16 p-1 border rounded text-xs font-bold text-center" value={inlineValue} onChange={e => setInlineValue(e.target.value)} onBlur={() => handleInlineUpdate(p.id, 'stock', inlineValue)} onKeyDown={e => e.key === 'Enter' && handleInlineUpdate(p.id, 'stock', inlineValue)} onClick={e => e.stopPropagation()} />
                         ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight text-blue-700 bg-blue-50 border border-blue-100">
                               {p.variants?.[0]?.inventory_count || 0} u.
                            </span>
                         )}
                      </td>
                      <td className="px-6 py-4 cursor-pointer hover:bg-white transition-colors rounded" onDoubleClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'status'}); setInlineValue(p.status); }}>
                        {inlineEdit?.id === p.id && inlineEdit.field === 'status' ? (
                           <select autoFocus className="bg-white border rounded text-[10px] p-1 font-bold outline-none" value={inlineValue} onChange={e => { setInlineValue(e.target.value); handleInlineUpdate(p.id, 'status', e.target.value); }} onBlur={() => setInlineEdit(null)} onClick={e => e.stopPropagation()}>
                             <option value="published">Visible</option>
                             <option value="draft">Borrador</option>
                             <option value="archived">Archivado</option>
                           </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${p.status === 'published' ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-100'}`}>
                             {p.status === 'published' ? 'Visible' : 'Oculto'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-xs font-medium text-gray-400">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="text-blue-500 hover:underline mr-3 text-xs font-bold">Detalles</button>
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                 );
                 });
                 })()}
               </tbody>
            </table>
         </div>
         {itemsPerPage !== 'Todos' && (
            <div className="bg-white border-t px-6 py-3 flex items-center justify-between text-xs text-gray-500">
               <span>Página {currentPage}</span>
               <div className="flex items-center gap-2">
                 <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Anterior</button>
                 <button disabled={products.filter(p => p.title.toLowerCase().includes(search.toLowerCase())).length <= currentPage * itemsPerPage} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Siguiente</button>
               </div>
            </div>
         )}
      </div>

      {/* �"��"��"� MODERN PRODUCT EDITOR (WORDPRESS INSPIRED) �"��"��"� */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex animate-fade-in">
           <div className="absolute inset-0 bg-dark-900/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
           <div className="relative w-full max-w-6xl mx-auto my-6 bg-[#f0f0f1] shadow-2xl rounded-xl overflow-hidden flex flex-col font-sans">
              
              {/* Toolbar */}
              <div className="h-14 bg-white border-b flex items-center justify-between px-6">
                 <h3 className="font-bold text-gray-700">{editing ? 'Editar Producto' : 'Añadir nuevo producto'}</h3>
                 <div className="flex gap-2">
                    <button onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-md">Cerrar</button>
                    <button onClick={handleSave} className="bg-blue-600 px-6 py-1.5 text-sm font-black text-white hover:bg-blue-700 rounded-md shadow-lg shadow-blue-200 transition-all transform active:scale-95 flex items-center gap-2">
                       <Save className="w-4 h-4" /> Guardar Producto
                    </button>
                 </div>
              </div>

              {/* Editor Layout */}
              <div className="flex-1 overflow-y-auto p-8">
                 <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    
                    {/* Main Content (Left) */}
                    <div className="lg:col-span-3 space-y-6">
                       <div className="bg-white p-6 border shadow-sm space-y-4">
                          <input 
                            placeholder="Introduce el título aquí" 
                            className="w-full text-2xl font-bold py-2 border-b-2 border-transparent focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
                            value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                          />
                          <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                             <span className="font-bold">Enlace permanente:</span>
                             <span className="text-blue-500 underline">https://collectibles-ecommerce.com/p/</span>
                             <input className="bg-transparent border-none outline-none text-blue-500 p-0 hover:bg-white focus:bg-white w-full" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} />
                          </div>
                       </div>

                       <div className="bg-white border shadow-sm">
                          <div className="px-4 py-2 border-b bg-gray-50/50 flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <Pencil className="w-4 h-4 text-gray-400" />
                                <span className="text-sm font-bold text-gray-600">Descripción del producto</span>
                             </div>
                             <div className="flex gap-2">
                                <button 
                                  type="button"
                                  onClick={() => handleGenerateAI('improve')}
                                  disabled={loadingAI}
                                  className="text-[10px] font-black uppercase tracking-tight bg-purple-50 text-purple-600 px-3 py-1 rounded hover:bg-purple-100 flex items-center gap-1.5 transition-all disabled:opacity-50"
                                >
                                   {loadingAI ? <Loader2 className="w-3 h-3 animate-spin"/> : <span className="text-purple-400">�S�</span>} 
                                   Mejorar con IA
                                </button>
                             </div>
                          </div>
                          <div className="p-4">
                             <textarea 
                               placeholder="Escribe aquí la descripción detallada..." 
                               className="w-full min-h-[300px] text-sm p-4 border rounded-lg focus:ring-2 focus:ring-blue-500/5 outline-none resize-none"
                               value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                             />
                          </div>
                       </div>

                       <div className="bg-white border shadow-sm">
                          <div className="px-4 py-2 border-b bg-gray-50/50 flex items-center gap-2">
                             <Pencil className="w-4 h-4 text-gray-400" />
                             <span className="text-sm font-bold text-gray-600">Precios e Inventario</span>
                          </div>
                          <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
                             <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Precio ($)</label>
                                <input type="number" className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white outline-none" value={form.base_price} onChange={e => setForm({...form, base_price: e.target.value})} />
                             </div>
                             <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Precio Rebajado</label>
                                <input type="number" className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white outline-none" value={form.compare_at_price} onChange={e => setForm({...form, compare_at_price: e.target.value})} />
                             </div>
                             <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">SKU</label>
                                <input className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white outline-none" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} />
                             </div>
                             <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Stock</label>
                                <input type="number" className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white outline-none font-bold text-blue-600" value={form.stock} onChange={e => setForm({...form, stock: e.target.value})} />
                             </div>
                          </div>
                       </div>

                       {/* ML Special Data */}
                       {editing?.ml_item_id && (
                          <div className="bg-blue-600 rounded-xl p-6 text-white shadow-xl shadow-blue-200">
                             <h4 className="font-bold flex items-center gap-2 mb-2">
                                <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-blue-900 font-bold text-[10px]">ML</div>
                                Datos de Mercado Libre (Solo lectura)
                             </h4>
                             <p className="text-xs text-blue-100 max-w-lg">Este producto está vinculado a una publicación de Mercado Libre. La sincronización automática actualizará el stock y los precios según tus reglas.</p>
                             <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono bg-blue-700/50 p-4 rounded-lg">
                                <div><span className="opacity-50">ID Item:</span> {editing.ml_item_id}</div>
                                <div><span className="opacity-50">Estado ML:</span> {editing.metadata?.ml_status || 'Active'}</div>
                                <div><span className="opacity-50">Vendidos:</span> {editing.metadata?.sold_quantity || 0}</div>
                                <div><span className="opacity-50">Salud:</span> {editing.metadata?.health || '100%'}</div>
                             </div>
                          </div>
                       )}
                    </div>

                    {/* Sidebar Widgets (Right) */}
                    <div className="lg:col-span-1 space-y-6">
                       
                       {/* WIDGET: PUBLICAR */}
                       <SidebarWidget title="Publicar">
                          <div className="space-y-4">
                             <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500 font-bold">Estado:</span>
                                <select className="bg-transparent border-none p-0 text-blue-600 font-bold outline-none cursor-pointer" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                                   <option value="published">Visible</option>
                                   <option value="draft">Borrador</option>
                                   <option value="archived">Archivado</option>
                                </select>
                             </div>
                             <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500 font-bold">Visibilidad:</span>
                                <span className="text-blue-600 font-bold">Público</span>
                             </div>
                             <label className="flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer">
                                <input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} className="rounded text-blue-600" />
                                ¿Destacar en portada?
                             </label>
                             <div className="pt-3 border-t flex justify-end">
                                <button className="text-[10px] font-bold text-red-500 hover:underline">Mover a la papelera</button>
                             </div>
                          </div>
                       </SidebarWidget>

                       {/* WIDGET: CATEGORÍAS */}
                       <SidebarWidget title="Categorías del producto">
                          <div className="space-y-3">
                             <div className="border rounded-md max-h-48 overflow-y-auto p-2 bg-gray-50/30">
                                {categories.map(cat => (
                                   <label key={cat.id} className="flex items-center gap-2 py-1 px-1 hover:bg-white rounded transition-colors cursor-pointer text-xs">
                                      <input type="checkbox" checked={form.categories.includes(cat.id)} onChange={() => toggleCategory(cat.id)} className="rounded border-gray-300 text-blue-600" />
                                      {cat.name}
                                   </label>
                                ))}
                             </div>
                              <div className="flex gap-2">
                                <input 
                                  value={newCatInput} onChange={e => setNewCatInput(e.target.value)}
                                  placeholder="Nueva categoría..." className="flex-1 text-xs p-1.5 border rounded outline-none focus:border-blue-500" 
                                />
                                <button type="button" onClick={handleAddCategory} className="bg-blue-50 text-blue-600 px-3 rounded font-bold text-[10px] hover:bg-blue-100">
                                   Añadir
                                </button>
                              </div>
                          </div>
                       </SidebarWidget>

                       {/* WIDGET: ETIQUETAS */}
                       <SidebarWidget title="Etiquetas del producto">
                          <div className="space-y-3">
                             <div className="flex gap-2">
                                <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} 
                                  placeholder="Ej: Comic, Retro..." className="flex-1 text-xs px-2 py-1.5 border rounded outline-none focus:border-blue-500" />
                                <button onClick={addTag} className="bg-gray-100 border text-[10px] font-black px-3 rounded hover:bg-gray-200">Añadir</button>
                             </div>
                             <div className="flex flex-wrap gap-1">
                                {form.tags.map(t => (
                                   <span key={t} className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border">
                                      {t} <button onClick={() => removeTag(t)}><X className="w-2.5 h-2.5" /></button>
                                   </span>
                                ))}
                             </div>
                          </div>
                       </SidebarWidget>

                       {/* WIDGET: MARCAS */}
                       <SidebarWidget title="Marcas (Brands)">
                          <div className="space-y-3">
                             <div className="border rounded-md max-h-48 overflow-y-auto p-2 bg-gray-50/30">
                                {brands.map(b => (
                                   <label key={b.id} className="flex items-center gap-2 py-1 px-1 hover:bg-white rounded transition-colors cursor-pointer text-xs">
                                      <input type="checkbox" checked={form.brands.includes(b.id)} onChange={() => toggleBrand(b.id)} className="rounded border-gray-300 text-blue-600" />
                                      {b.name}
                                   </label>
                                ))}
                             </div>
                              <div className="flex gap-2">
                                <input 
                                  value={newBrandInput} onChange={e => setNewBrandInput(e.target.value)}
                                  placeholder="Nueva marca..." className="flex-1 text-xs p-1.5 border rounded outline-none focus:border-blue-500" 
                                />
                                <button type="button" onClick={handleAddBrand} className="bg-blue-50 text-blue-600 px-3 rounded font-bold text-[10px] hover:bg-blue-100">
                                   Añadir
                                </button>
                              </div>
                          </div>
                       </SidebarWidget>

                       {/* WIDGET: IMAGEN DESTACADA */}
                       <SidebarWidget title="Imagen del producto">
                          <div className="space-y-3">
                             {form.image_url ? (
                                <div className="group relative aspect-square rounded-xl border overflow-hidden bg-gray-50 cursor-pointer" onClick={() => setShowMediaPicker('featured')}>
                                   <img src={form.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                   <div className="absolute inset-0 bg-dark-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                                      Cambiar imagen
                                   </div>
                                </div>
                             ) : (
                                <button onClick={() => setShowMediaPicker('featured')} className="w-full aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-500 hover:text-blue-500 transition-all">
                                   <ImageIcon className="w-10 h-10 mb-2 opacity-20" />
                                   <span className="text-[10px] font-black uppercase tracking-widest">Establecer imagen</span>
                                </button>
                             )}
                             <button onClick={() => setForm({...form, image_url: ''})} className="text-red-500 hover:underline text-[10px] font-bold">Eliminar imagen del producto</button>
                          </div>
                       </SidebarWidget>

                       {/* WIDGET: GALERÍA */}
                       <SidebarWidget title="Galería del producto">
                          <div className="space-y-3">
                             <div className="grid grid-cols-4 gap-2">
                                {form.gallery.map((g, idx) => (
                                   <div key={idx} className="group relative aspect-square border rounded-md overflow-hidden bg-gray-50">
                                      <img src={g.url} alt="" className="w-full h-full object-cover" />
                                      <button onClick={() => removeFromGallery(idx)} className="absolute top-0 right-0 p-1 bg-red-600 text-white rounded-bl-md opacity-0 group-hover:opacity-100"><Trash className="w-3 h-3" /></button>
                                   </div>
                                ))}
                             </div>
                             <button onClick={() => setShowMediaPicker('gallery')} className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1">
                                Añadir imágenes a la galería
                             </button>
                          </div>
                       </SidebarWidget>

                    </div>
                 </div>
              </div>

           </div>

           {/* Media Picker handled outside the big modal component logic but uses setForm */}
        </div>
      )}

      {/* �"��"��"� MODALS & OVERLAYS �"��"��"� */}
      <MediaPickerModal 
        isOpen={showMediaPicker !== false} 
        onClose={() => setShowMediaPicker(false)} 
        multiple={showMediaPicker === 'gallery'}
        onSelect={(url) => {
           if (showMediaPicker === 'featured') {
              setForm(prev => ({ ...prev, image_url: url }));
           } else {
              addToGallery(url);
           }
           setShowMediaPicker(false);
        }}
        onMultipleSelect={(urls) => {
           if (showMediaPicker === 'gallery') {
              setForm(prev => ({ ...prev, gallery: [...prev.gallery, ...urls.map(url => ({ url }))] }));
           }
           setShowMediaPicker(false);
        }}
      />

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onConfirm={ (docs) => { /* Reuse current bulk logic */ fetchProducts(); } } />
      )}
    </div>
  );
}


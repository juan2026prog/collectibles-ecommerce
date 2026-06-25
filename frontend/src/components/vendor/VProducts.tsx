import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Search, Eye, X, Upload, Save, AlertCircle, Check, Loader2, ImageIcon, ChevronUp, ChevronDown, Trash, Copy } from 'lucide-react';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import ImportModal from '../../components/admin/ImportModal';
import type { ParsedProduct } from '../../lib/bulkImportUtils';
import { getProductImage } from '../../lib/imageUtils';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';

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
    <div onClick={() => !saving && setEditing(true)} className={`cursor-pointer hover:bg-primary-50 hover:text-primary-700 px-2 py-1 -mx-2 rounded transition-colors ${className}`} title="Haz click para editar">
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
  is_active: boolean;
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

export default function VProducts() {
  const { user } = useAuth();
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

  const { toast } = useToast();
  const { confirm } = useConfirmModal();
  
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'Todos'>(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterBrand, setFilterBrand] = useState<string>('');
  
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  
  const [form, setForm] = useState({
    title: '', slug: '', description: '', short_description: '',
    base_price: '', compare_at_price: '', sku: '', stock: '10', status: 'published',
    badge: '', is_featured: false, is_active: true, category_id: '', brand_id: '',
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
      .eq('vendor_id', user?.id)
      .order('created_at', { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  async function fetchMeta() {
    const [{ data: cats }, { data: brs }, { data: tgs }] = await Promise.all([
      supabase.from('categories').select('id, name, status, parent_id').or(`owner_vendor_id.eq.${user?.id},status.eq.approved`).order('sort_order'),
      supabase.from('brands').select('id, name, status').or(`owner_vendor_id.eq.${user?.id},status.eq.approved`).order('sort_order'),
      supabase.from('tags').select('id, name').order('name'),
    ]);
    setCategories(cats || []);
    setBrands(brs || []);
    setTags(tgs || []);
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: '', slug: '', description: '', short_description: '', base_price: '', compare_at_price: '', sku: `${Date.now()}`, stock: '10', status: 'published', badge: '', is_featured: false, is_active: true, category_id: '', brand_id: '', image_url: '', video_url: '', categories: [], tags: [], brands: [], gallery: [] });
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
      sku: product.variants?.[0]?.sku || `${Date.now()}`, 
      stock: product.variants?.[0]?.inventory_count?.toString() || '10',
      status: product.status, 
      badge: product.badge || '', 
      is_featured: product.is_featured,
      is_active: product.is_active !== false,
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

      // Check if selected brand is pending review
      const selectedBrandId = form.brands[0] || null;
      const isBrandPending = selectedBrandId ? brands.find(b => b.id === selectedBrandId)?.status === 'pending_review' : false;

      // Check if any of selected categories is pending review
      const isAnyCategoryPending = form.categories.some(cid => {
        const cat = categories.find(c => c.id === cid);
        return cat?.status === 'pending_review';
      });

      let finalStatus = form.status;
      if (isBrandPending || isAnyCategoryPending) {
        finalStatus = 'pending_taxonomy_review';
      }

      const payload = {
        title: form.title, slug: titleSlug, description: form.description, short_description: form.short_description,
        base_price: parseFloat(form.base_price) || 0, compare_at_price: form.compare_at_price ? parseFloat(form.compare_at_price) : null,
        status: finalStatus, badge: form.badge || null, is_featured: form.is_featured,
        is_active: (isBrandPending || isAnyCategoryPending) ? false : form.is_active,
        brand_id: selectedBrandId, category_id: form.categories[0] || null
      };

        let productId = editing?.id;
        if (editing) {
          const { error: updProdErr } = await supabase.from('products').update(payload).eq('id', productId).select().single();
          if (updProdErr) throw updProdErr;
        } else {
          const newPayload = { ...payload, vendor_id: user?.id };
          const { data: newProd, error: insertError } = await supabase.from('products').insert(newPayload).select().single();
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
      const skuVal = form.sku || `${Date.now()}`;
      if (editing && editing.variants?.[0]?.id) {
        const { error: varErr } = await supabase.from('product_variants').update({ sku: skuVal, inventory_count: parseInt(form.stock) || 0 }).eq('id', editing.variants[0].id);
        if (varErr) throw varErr;
      } else {
        const { error: varErr } = await supabase.from('product_variants').insert({ product_id: productId, sku: skuVal, name: 'Standard', inventory_count: parseInt(form.stock) || 0 });
        if (varErr) throw varErr;
      }

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
           let { data: tag } = await supabase.from('tags').select('*').eq('name', tagName).single();
           if (!tag) {
             const { data: newTag, error: tagErr } = await supabase.from('tags').insert({ name: tagName, slug: slugTag }).select().single();
             if (tagErr) console.error("Error creating tag:", tagErr);
             else tag = newTag;
           }
           if (tag) await supabase.from('product_tags').insert({ product_id: productId, tag_id: tag.id });
        }
      }

      setShowForm(false);
      fetchProducts();
      fetchMeta();
      toast.success(editing ? 'Producto actualizado' : 'Producto creado');
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
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
    if (!newCatInput.trim() || !user) return;
    try {
      let slug = newCatInput.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      slug = `${slug}-v${user.id.substring(0, 4)}`;
      const { data, error } = await supabase.from('categories').insert({ name: newCatInput.trim(), slug, owner_vendor_id: user.id, status: 'pending_review', is_active: true }).select().single();
      if (error) throw error;
      setCategories([...categories, data]);
      toggleCategory(data.id);
      setNewCatInput('');
      toast.success('Categoría propuesta (pendiente de revisión)');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAddBrand = async () => {
    if (!newBrandInput.trim() || !user) return;
    try {
      let slug = newBrandInput.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      slug = `${slug}-v${user.id.substring(0, 4)}`;
      const { data, error } = await supabase.from('brands').insert({ name: newBrandInput.trim(), slug, owner_vendor_id: user.id, status: 'pending_review', is_active: false, is_public: false, source: 'manual' }).select().single();
      if (error) throw error;
      setBrands([...brands, data]);
      toggleBrand(data.id);
      setNewBrandInput('');
      toast.success('Marca propuesta (pendiente de revisión)');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleInlineUpdate = async (id: string, field: string, value: any) => {
    try {
      const updates: any = {};
      
      // Handle special fields
      if (field === 'category_id') {
        const { error } = await supabase.from('product_categories').delete().eq('product_id', id);
        if (error) throw error;
        
        let newStatus = undefined;
        if (value) {
          const cat = categories.find(c => c.id === value);
          if (cat?.status === 'pending_review') {
            newStatus = 'pending_taxonomy_review';
          }
          const { error: insErr } = await supabase.from('product_categories').insert({ product_id: id, category_id: value });
          if (insErr) throw insErr;
          
          const productUpdates: any = { category_id: value };
          if (newStatus === 'pending_taxonomy_review') {
            productUpdates.status = newStatus;
            productUpdates.is_active = false;
          }
          
          const { error: updErr } = await supabase.from('products').update(productUpdates).eq('id', id).select().single();
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
          await supabase.from('product_variants').insert({ product_id: id, sku: `${Date.now()}`, name: 'Standard', inventory_count: parseInt(value) || 0 });
        }
      } else {
        updates[field] = value === '' ? null : value;
        // If updating brand_id, check if it's pending review
        if (field === 'brand_id' && value) {
          const br = brands.find(b => b.id === value);
          if (br?.status === 'pending_review') {
            updates.status = 'pending_taxonomy_review';
            updates.is_active = false;
          }
        }
        const { error } = await supabase.from('products').update(updates).eq('id', id).select().single();
        if (error) throw error;
      }
      
      setInlineEdit(null);
      fetchProducts();
      toast.success('Actualizado');
    } catch (err: any) {
      toast.error(`Error updating: ${err.message}`);
    }
  };

  const handleGenerateAI = async (action: 'improve' | 'generate') => {
    if (action === 'generate' && !form.title) { toast.warning("Ingresa un título primero"); return; }
    setLoadingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: { action, currentText: form.description, prompt: form.title }
      });
      if (error) throw error;
      if (data.success) {
        setForm({ ...form, description: data.text });
        toast.success('IA: Contenido generado');
      } else {
        throw new Error(data.error || "Error de la IA");
      }
    } catch (err: any) {
      toast.error(`Error IA: ${err.message}`);
    } finally {
      setLoadingAI(false);
    }
  };

  const handleBulkPublish = async () => {
    if (!(await confirm(`¿Publicar ${selectedProducts.length} productos seleccionados?`))) return;
    try {
       await supabase.from('products').update({ status: 'published' }).in('id', selectedProducts);
       setSelectedProducts([]);
       fetchProducts();
       toast.success(`${selectedProducts.length} productos publicados`);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleBulkDelete = async () => {
    if (!(await confirm(`¿Eliminar permanente ${selectedProducts.length} productos seleccionados? Esta acción no se puede deshacer.`, { danger: true }))) return;
    try {
       await supabase.from('products').delete().in('id', selectedProducts);
       setSelectedProducts([]);
       fetchProducts();
       toast.success(`${selectedProducts.length} productos eliminados`);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm(`¿Eliminar producto permanentemente?`, { danger: true }))) return;
    try {
       await supabase.from('products').delete().eq('id', id);
       fetchProducts();
       toast.success(`Producto eliminado`);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDuplicate = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirm(`¿Duplicar el producto "${product.title}"?`))) return;
    
    setLoading(true);
    try {
      // 1. Fetch junctions (categories, tags) of the original product
      const [{ data: pCats }, { data: pTags }] = await Promise.all([
         supabase.from('product_categories').select('category_id').eq('product_id', product.id),
         supabase.from('product_tags').select('tag_id').eq('product_id', product.id)
      ]);

      // 2. Insert new product
      const newTitle = `${product.title} (Copia)`;
      const baseSlug = product.slug ? `${product.slug}-copia` : newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      // Ensure slug is unique by appending a random suffix
      const newSlug = `${baseSlug.replace(/-+$/, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const brandId = product.brand?.id || product.brand_id || null;
      const catId = product.category?.id || product.category_id || null;
      const isBrandPending = brandId ? brands.find(b => b.id === brandId)?.status === 'pending_review' : false;
      const isCatPending = catId ? categories.find(c => c.id === catId)?.status === 'pending_review' : false;

      const payload = {
        vendor_id: user.id,
        title: newTitle,
        slug: newSlug,
        description: product.description,
        short_description: product.short_description,
        base_price: product.base_price,
        compare_at_price: product.compare_at_price,
        status: (isBrandPending || isCatPending) ? 'pending_taxonomy_review' : 'draft',
        is_active: (isBrandPending || isCatPending) ? false : (product.is_active !== false),
        badge: product.badge,
        is_featured: product.is_featured,
        brand_id: brandId,
        category_id: catId
      };

      const { data: newProd, error: insertError } = await supabase.from('products').insert(payload).select().single();
      if (insertError) throw insertError;

      const newProductId = newProd.id;

      // 3. Duplicate Images
      if (product.images && product.images.length > 0) {
        const imagesPayload = product.images.map((img, i) => ({
          product_id: newProductId,
          url: img.url,
          is_primary: (img as any).is_primary ?? (i === 0),
          sort_order: (img as any).sort_order ?? i
        }));
        const { error: insImgErr } = await supabase.from('product_images').insert(imagesPayload);
        if (insImgErr) throw insImgErr;
      }

      // 4. Duplicate Variants (generate new SKU to avoid unique constraint conflict)
      const originalSku = product.variants?.[0]?.sku || '';
      const newSku = originalSku ? `${originalSku}-COPY` : `${Date.now()}`;
      const originalStock = product.variants?.[0]?.inventory_count || 0;
      
      const { error: varErr } = await supabase.from('product_variants').insert({
        product_id: newProductId,
        sku: newSku,
        name: 'Standard',
        inventory_count: originalStock
      });
      if (varErr) throw varErr;

      // 5. Duplicate junctions
      const insertPromises = [];
      if (pCats && pCats.length > 0) {
        insertPromises.push(
          supabase.from('product_categories').insert(pCats.map(c => ({ product_id: newProductId, category_id: c.category_id })))
        );
      }
      if (pTags && pTags.length > 0) {
        insertPromises.push(
          supabase.from('product_tags').insert(pTags.map(t => ({ product_id: newProductId, tag_id: t.tag_id })))
        );
      }

      if (insertPromises.length > 0) {
        const results = await Promise.all(insertPromises);
        const errorResult = results.find(r => r.error);
        if (errorResult) throw errorResult.error;
      }

      toast.success('Producto duplicado correctamente (guardado como Borrador)');
      fetchProducts();
    } catch (err: any) {
      toast.error(`Error al duplicar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportConfirm = async (docs: ParsedProduct[]) => {
    setLoading(true);
    try {
      let currentCats = [...categories];
      let currentBrands = [...brands];

      for (const p of docs) {
        if (!p.title) continue;

        // Resolve Category
        let categoryId: string | null = null;
        if (p.category_name) {
          const normCat = p.category_name.trim().toLowerCase();
          let matchedCat = currentCats.find(c => c.name.trim().toLowerCase() === normCat);
          if (!matchedCat) {
            const catSlug = p.category_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
            const { data: newCat, error: catErr } = await supabase
              .from('categories')
              .insert({ name: p.category_name.trim(), slug: catSlug || `cat-${Date.now()}` })
              .select()
              .single();
            if (!catErr && newCat) {
              matchedCat = newCat;
              currentCats.push(newCat);
            }
          }
          categoryId = matchedCat?.id || null;
        }

        // Resolve Brand
        let brandId: string | null = null;
        if (p.brand_name) {
          const normBrand = p.brand_name.trim().toLowerCase();
          let matchedBrand = currentBrands.find(b => b.name.trim().toLowerCase() === normBrand);
          if (!matchedBrand) {
            const brandSlug = p.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
            const { data: newBrand, error: brandErr } = await supabase
              .from('brands')
              .insert({ name: p.brand_name.trim(), slug: brandSlug || `brand-${Date.now()}` })
              .select()
              .single();
            if (!brandErr && newBrand) {
              matchedBrand = newBrand;
              currentBrands.push(newBrand);
            }
          }
          brandId = matchedBrand?.id || null;
        }

        // Generate dynamic unique slug
        let baseSlug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        if (!baseSlug) baseSlug = 'producto';
        const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;

        // Insert Product
        const { data: newProd, error: prodErr } = await supabase
          .from('products')
          .insert({
            title: p.title.trim(),
            slug: uniqueSlug,
            description: p.description || null,
            base_price: p.base_price,
            compare_at_price: p.compare_at_price || null,
            status: 'published',
            is_active: true,
            category_id: categoryId,
            brand_id: brandId,
            is_featured: false
          })
          .select()
          .single();

        if (prodErr) {
          console.error("Error importing product:", p.title, prodErr);
          continue;
        }

        const productId = newProd.id;

        // Insert category junction
        if (categoryId) {
          await supabase.from('product_categories').insert({ product_id: productId, category_id: categoryId });
        }

        // Insert images if provided (supports multiple comma-separated URLs)
        if (p.image_url) {
          const imageUrls = p.image_url.split(',')
            .map(url => url.trim())
            .filter(url => url.startsWith('http'));

          if (imageUrls.length > 0) {
            const imagesPayload = imageUrls.map((url, idx) => ({
              product_id: productId,
              url,
              is_primary: idx === 0,
              sort_order: idx
            }));
            const { error: imgErr } = await supabase.from('product_images').insert(imagesPayload);
            if (imgErr) console.error("Error inserting product images:", imgErr);
          }
        }

        // Insert variant
        const skuVal = p.sku?.trim() || `sku-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await supabase.from('product_variants').insert({
          product_id: productId,
          sku: skuVal,
          name: 'Standard',
          inventory_count: p.stock
        });
      }

      toast.success(`¡Se importaron ${docs.length} productos correctamente!`);
      setShowImport(false);
      fetchProducts();
      fetchMeta();
    } catch (err: any) {
      console.error("Bulk import failed:", err);
      toast.error(`Error en la importación: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'created_at' || field === 'stock' ? 'desc' : 'asc');
    }
  };

  const getSortedProducts = (prods: any[]) => {
    return [...prods].sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case 'created_at':
          valA = new Date(a.created_at).getTime();
          valB = new Date(b.created_at).getTime();
          break;
        case 'category':
          valA = a.product_categories?.[0]?.categories?.name || '';
          valB = b.product_categories?.[0]?.categories?.name || '';
          break;
        case 'brand':
          valA = a.brand?.name || '';
          valB = b.brand?.name || '';
          break;
        case 'stock':
          valA = a.variants?.[0]?.inventory_count || 0;
          valB = b.variants?.[0]?.inventory_count || 0;
          break;
        case 'status':
          valA = a.status || '';
          valB = b.status || '';
          break;
        case 'is_active':
          valA = a.is_active !== false ? 1 : 0;
          valB = b.is_active !== false ? 1 : 0;
          break;
        default:
          valA = a[sortField] || '';
          valB = b[sortField] || '';
      }
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleBulkUpdate = async (field: string, value: string) => {
    if (!value || selectedProducts.length === 0) return;
    if (!(await confirm(`¿Aplicar este cambio a ${selectedProducts.length} productos seleccionados?`))) return;
    try {
       for (const id of selectedProducts) {
          if (field === 'category_id') {
             await supabase.from('product_categories').delete().eq('product_id', id);
             await supabase.from('product_categories').insert({ product_id: id, category_id: value });
             await supabase.from('products').update({ category_id: value }).eq('id', id);
          } else {
             await supabase.from('products').update({ [field]: value }).eq('id', id);
          }
       }
       setSelectedProducts([]);
       fetchProducts();
       toast.success(`${selectedProducts.length} productos actualizados`);
    } catch (err: any) { toast.error(err.message); }
  };

  const addToGallery = (url: string) => setForm({ ...form, gallery: [...form.gallery, { url }] });
  const removeFromGallery = (idx: number) => setForm({ ...form, gallery: form.gallery.filter((_, i) => i !== idx) });

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = filterCategory === '' || p.category_id === filterCategory || p.product_categories?.[0]?.categories?.id === filterCategory || p.category?.id === filterCategory;
      const matchesBrand = filterBrand === '' || p.brand?.id === filterBrand || p.brand_id === filterBrand;
      return matchesSearch && matchesCategory && matchesBrand;
    });
  }, [products, search, filterCategory, filterBrand]);

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
               <h2 className="text-2xl font-black text-dark-900">Productos <span className="bg-blue-600 text-white text-[8px] px-1 py-0.5 rounded ml-2 relative -top-1">v2</span></h2>
               {!loading && (
                 <span className="bg-gray-100/80 border border-gray-200 text-gray-500 text-[10px] font-black uppercase px-2 py-1 rounded-md tracking-widest hidden md:inline-flex items-center gap-1">
                   {products.length} {products.length === 1 ? 'Producto' : 'Productos'}
                 </span>
               )}
            </div>
            <p className="text-gray-500 text-sm italic mt-1">Gestión de catálogo y stock</p>
          </div>
          
          <div className="flex items-center gap-4 bg-white border border-gray-200 px-4 py-2 rounded-xl shadow-sm hover:border-blue-400 transition-colors">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" 
                checked={products.length > 0 && products.slice(0, itemsPerPage === 'Todos' ? products.length : itemsPerPage).every(p => selectedProducts.includes(p.id)) && selectedProducts.length !== products.length}
                onChange={(e) => {
                  const filtered = getSortedProducts(filteredProducts);
                  const currentSubset = itemsPerPage === 'Todos' ? filtered : filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
                  if (e.target.checked) {
                    const uniqueIds = Array.from(new Set([...selectedProducts, ...currentSubset.map((p: any) => p.id)]));
                    setSelectedProducts(uniqueIds);
                  } else {
                    const currentIds = currentSubset.map((p: any) => p.id);
                    setSelectedProducts(selectedProducts.filter(id => !currentIds.includes(id)));
                  }
                }}
              />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors">Página</span>
            </label>
            
            <div className="w-px h-4 bg-gray-200"></div>
            
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" 
                checked={products.length > 0 && products.length === selectedProducts.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedProducts(products.map(p => p.id));
                  else setSelectedProducts([]);
                }}
              />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors">Todos ({products.length})</span>
            </label>
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
                  <select className="border-gray-200 border rounded px-2 py-1 text-xs outline-none bg-white" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setCurrentPage(1); }}>
                    <option value="">Todas las categorías</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="border-gray-200 border rounded px-2 py-1 text-xs outline-none bg-white" value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setCurrentPage(1); }}>
                    <option value="">Todas las marcas</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
               </div>
            </div>
         </div>
         {selectedProducts.length > 0 && (
            <div className="bg-blue-50 border-b border-blue-100 px-6 py-2.5 flex gap-4 items-center animate-fade-in">
               <span className="text-sm font-bold text-blue-800 tracking-tight">{selectedProducts.length} seleccionados</span>
               <div className="flex gap-2">
                 <select className="border-blue-200 border rounded text-xs p-1 text-blue-700 bg-white" onChange={(e) => { handleBulkUpdate('category_id', e.target.value); e.target.value = ''; }}>
                   <option value="">Cambiar Categoría</option>
                   {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                 </select>
                 <select className="border-blue-200 border rounded text-xs p-1 text-blue-700 bg-white" onChange={(e) => { handleBulkUpdate('brand_id', e.target.value); e.target.value = ''; }}>
                   <option value="">Cambiar Marca</option>
                   {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                 </select>
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
                        const filtered = getSortedProducts(filteredProducts);
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
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('title')}>
                     Producto {sortField === 'title' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('base_price')}>
                     Precio {sortField === 'base_price' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('category')}>
                     Categoría {sortField === 'category' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('brand')}>
                     Marca {sortField === 'brand' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('stock')}>
                     Stock {sortField === 'stock' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('is_active')}>
                      Visible (ON/OFF) {sortField === 'is_active' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('status')}>
                      Estado {sortField === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                    </th>
                   <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('created_at')}>
                     Fecha {sortField === 'created_at' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                 {loading ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400 animate-pulse">Cargando catálogo...</td></tr>
                 ) : (() => {
                    const filtered = getSortedProducts(filteredProducts);
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
                      <td className="px-6 py-4 cursor-pointer hover:bg-white transition-colors rounded" onClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'title'}); setInlineValue(p.title); }}>
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
                      <td className="px-6 py-4 font-black text-dark-800 text-sm whitespace-nowrap cursor-pointer hover:bg-white transition-colors rounded" onClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'base_price'}); setInlineValue(p.base_price); }}>
                        {inlineEdit?.id === p.id && inlineEdit.field === 'base_price' ? (
                          <input autoFocus type="number" className="w-24 p-1 border rounded text-xs font-bold" value={inlineValue} onChange={e => setInlineValue(e.target.value)} onBlur={() => handleInlineUpdate(p.id, 'base_price', inlineValue)} onKeyDown={e => e.key === 'Enter' && handleInlineUpdate(p.id, 'base_price', inlineValue)} onClick={e => e.stopPropagation()} />
                        ) : (
                          <span>UYU {p.base_price.toLocaleString()}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-gray-500 cursor-pointer hover:bg-white transition-colors rounded" onClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'category_id'}); setInlineValue(primaryCat?.id || ''); }}>
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
                      <td className="px-6 py-4 text-xs font-bold text-gray-500 cursor-pointer hover:bg-white transition-colors rounded" onClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'brand_id'}); setInlineValue(p.brand?.id || ''); }}>
                        {inlineEdit?.id === p.id && inlineEdit.field === 'brand_id' ? (
                          <select 
                            autoFocus
                            className="bg-white border rounded text-[10px] p-1 font-bold outline-none"
                            value={inlineValue || ''}
                            onChange={e => { setInlineValue(e.target.value); handleInlineUpdate(p.id, 'brand_id', e.target.value); }}
                            onBlur={() => setInlineEdit(null)}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="">- Sin Marca -</option>
                            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        ) : (
                          p.brand?.name || '-'
                        )}
                      </td>
                      <td className="px-6 py-4 cursor-pointer hover:bg-white transition-colors rounded" onClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'stock'}); setInlineValue(p.variants?.[0]?.inventory_count || 0); }}>
                         {inlineEdit?.id === p.id && inlineEdit.field === 'stock' ? (
                            <input autoFocus type="number" className="w-16 p-1 border rounded text-xs font-bold text-center" value={inlineValue} onChange={e => setInlineValue(e.target.value)} onBlur={() => handleInlineUpdate(p.id, 'stock', inlineValue)} onKeyDown={e => e.key === 'Enter' && handleInlineUpdate(p.id, 'stock', inlineValue)} onClick={e => e.stopPropagation()} />
                         ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight text-blue-700 bg-blue-50 border border-blue-100">
                               {p.variants?.[0]?.inventory_count || 0} u.
                            </span>
                         )}
                      </td>
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={async () => {
                            const newActive = p.is_active !== false ? false : true;
                            try {
                              const { error } = await supabase
                                .from('products')
                                .update({ is_active: newActive })
                                .eq('id', p.id);
                              if (error) throw error;
                              setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, is_active: newActive } : prod));
                              toast.success(newActive ? 'Producto visible en la tienda' : 'Producto oculto en la tienda');
                            } catch (err: any) {
                              toast.error(`Error al cambiar estado: ${err.message}`);
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${p.is_active !== false ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${p.is_active !== false ? 'translate-x-5' : 'translate-x-0'}`}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-4 cursor-pointer hover:bg-white transition-colors rounded" onClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'status'}); setInlineValue(p.status); }}>
                        {inlineEdit?.id === p.id && inlineEdit.field === 'status' ? (
                           <select autoFocus className="bg-white border rounded text-[10px] p-1 font-bold outline-none" value={inlineValue} onChange={e => { setInlineValue(e.target.value); handleInlineUpdate(p.id, 'status', e.target.value); }} onBlur={() => setInlineEdit(null)} onClick={e => e.stopPropagation()}>
                             <option value="published">Visible</option>
                             <option value="pending_taxonomy_review">Pendiente Taxonomía</option>
                             <option value="draft">Borrador</option>
                             <option value="archived">Archivado</option>
                           </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                             p.status === 'published' ? 'text-green-700 bg-green-50' : 
                             p.status === 'pending_taxonomy_review' ? 'text-yellow-700 bg-yellow-50' :
                             'text-gray-500 bg-gray-100'
                           }`}>
                             {p.status === 'published' ? 'Visible' : 
                              p.status === 'pending_taxonomy_review' ? 'Pendiente Taxonomía' : 
                              'Oculto'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-xs font-medium text-gray-400">
                        <div className="flex justify-end gap-3 items-center mb-1">
                          <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="text-blue-500 hover:underline text-xs font-bold">Detalles</button>
                          <button onClick={(e) => handleDuplicate(p, e)} className="text-gray-500 hover:text-blue-600 transition-colors" title="Duplicar producto">
                             <Copy className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="text-red-400 hover:text-red-600 transition-colors" title="Eliminar producto">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
                 <button disabled={filteredProducts.length <= (currentPage * (typeof itemsPerPage === 'number' ? itemsPerPage : 0))} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Siguiente</button>
               </div>
            </div>
         )}
      </div>

      {/* 🚀 MODERN PRODUCT EDITOR (WORDPRESS INSPIRED) 🚀 */}
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
                                   {loadingAI ? <Loader2 className="w-3 h-3 animate-spin"/> : <span className="text-purple-400">✨</span>} 
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
                                   <option value="pending_taxonomy_review">Pendiente Taxonomía</option>
                                   <option value="draft">Borrador</option>
                                   <option value="archived">Archivado</option>
                                </select>
                             </div>
                             <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500 font-bold">Visibilidad:</span>
                                <span className="text-blue-600 font-bold">Público</span>
                             </div>
                             <label className="flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer select-none">
                                <input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
                                ¿Destacar en portada?
                             </label>
                             <label className="flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer select-none">
                                <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
                                ¿Producto activo (visible)?
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
        <ImportModal onClose={() => setShowImport(false)} onConfirm={handleImportConfirm} />
      )}
    </div>
  );
}


import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Search, Eye, X, Upload, Download, Save, AlertCircle, Check, Loader2, ImageIcon, ChevronUp, ChevronDown, Trash, Copy } from 'lucide-react';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import ImportModal from '../../components/admin/ImportModal';
import ExportModal from '../../components/admin/ExportModal';
import type { ParsedProduct } from '../../lib/bulkImportUtils';
import { getProductImage } from '../../lib/imageUtils';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';
import { slugify, generateUniqueSlug } from '../../lib/slugUtils';
import { CONDITION_OPTIONS, type StoreType, getConditionLabel, normalizeCondition } from '../../config/conditionConfig';
import { CardDetailsFormSection } from './CardDetailsFormSection';
import { type CardDetails, buildCategoryTreeOptions, isSportsCardCategory, isTCGCategory } from '../../config/tcgConfig';
import { validateProductForPublication, type PublicationValidationError } from '../../lib/productPublicationValidator';
import { mapDatabaseErrorToUserMessage } from '../../lib/databaseErrorMapper';
import ResponsiveDataList from '../admin/ResponsiveDataList';

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
  const [showExport, setShowExport] = useState(false);
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
  const [activeStores, setActiveStores] = useState<any[]>([]);
  const [storeBrands, setStoreBrands] = useState<any[]>([]);
  const [vendorStoreType, setVendorStoreType] = useState<StoreType>('standard');
  
  const [form, setForm] = useState({
    title: '', slug: '', description: '', short_description: '',
    base_price: '', compare_at_price: '', sku: '', stock: '10', status: 'published',
    badge: '', is_featured: false, is_active: true, category_id: '', brand_id: '',
    vendor_store_id: '',
    condition: '',
    condition_notes: '',
    image_url: '', video_url: '',
    card_details: {
      sport: '', player_character: '', team: '', set_collection: '', year_season: '',
      card_number: '', format: 'Single Card', is_rookie: false, is_autograph: false,
      is_graded: false, grading_company: 'PSA', grade: '10', game: '', rarity: '', language: 'Español'
    } as CardDetails,
    // Many-to-many
    categories: [] as string[],
    tags: [] as string[],
    brands: [] as string[],
    gallery: [] as { url: string }[]
  });

  const [tagInput, setTagInput] = useState('');
  const [newCatInput, setNewCatInput] = useState('');
  const [newBrandInput, setNewBrandInput] = useState('');

  const [licenses, setLicenses] = useState<any[]>([]);
  const [showBrandRequestModal, setShowBrandRequestModal] = useState(false);
  const [requestedBrandName, setRequestedBrandName] = useState('');
  const [brandRequestLoading, setBrandRequestLoading] = useState(false);

  const [showLicenseRequestModal, setShowLicenseRequestModal] = useState(false);
  const [requestedLicenseName, setRequestedLicenseName] = useState('');
  const [licenseRequestLoading, setLicenseRequestLoading] = useState(false);

  const [vendorPermissions, setVendorPermissions] = useState({
    can_request_categories: false,
    can_request_brands: false,
    can_request_licenses: false
  });

  const [validationErrors, setValidationErrors] = useState<PublicationValidationError[]>([]);
  const [textDuplicateWarning, setTextDuplicateWarning] = useState<any>(null);

  const getFieldError = (fieldName: string) => {
    return validationErrors.find(e => e.field === fieldName)?.message;
  };

  const [totalProductsCount, setTotalProductsCount] = useState<number>(0);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(search);
  const lastRequestId = useRef<number>(0);

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    if (user?.id) {
      fetchProducts();
    }
  }, [user?.id, debouncedSearch, filterCategory, filterBrand, currentPage, itemsPerPage, sortField, sortOrder]);

  useEffect(() => {
    if (user?.id) {
      fetchMeta();
    }
  }, [user?.id]);

  async function fetchProducts() {
    if (!user?.id) return;
    setLoading(true);
    const currentReqId = ++lastRequestId.current;
    const pageSizeNum = itemsPerPage === 'Todos' ? 1000 : Number(itemsPerPage);

    try {
      const { data, error } = await supabase.rpc('search_admin_products', {
        p_search: debouncedSearch.trim() || null,
        p_category_id: filterCategory || null,
        p_brand_id: filterBrand || null,
        p_vendor_id: user.id,
        p_status: null,
        p_page: currentPage,
        p_page_size: pageSizeNum,
        p_sort_field: sortField,
        p_sort_order: sortOrder
      });

      if (currentReqId !== lastRequestId.current) return;

      if (error) {
        console.error('[VPRODUCTS_SEARCH_ERROR]', error);
        toast.error('Error al cargar productos del vendedor: ' + error.message);
        setProducts([]);
        setTotalProductsCount(0);
      } else if (data && data.length > 0) {
        const total = Number(data[0].total_count || 0);
        const items = data[0].products || [];
        setTotalProductsCount(total);
        setProducts(items);
      } else {
        setTotalProductsCount(0);
        setProducts([]);
      }
    } catch (err: any) {
      if (currentReqId === lastRequestId.current) {
        console.error('[VPRODUCTS_FETCH_EXCEPTION]', err);
        toast.error('Error inesperado al consultar productos del vendedor.');
        setProducts([]);
        setTotalProductsCount(0);
      }
    } finally {
      if (currentReqId === lastRequestId.current) {
        setLoading(false);
      }
    }
  }

  async function fetchMeta() {
    const [{ data: cats }, { data: brs }, { data: lics }, { data: tgs }, { data: strs }, { data: stBrs }] = await Promise.all([
      supabase.from('categories').select('id, name, slug, status, parent_id').or(`owner_vendor_id.eq.${user?.id},status.eq.approved`).order('sort_order'),
      supabase.from('brands').select('id, name, status, brand_type, is_vendor_selectable').eq('status', 'approved').order('name'),
      supabase.from('licenses').select('id, name, slug').eq('is_active', true).order('name'),
      supabase.from('tags').select('id, name').order('name'),
      supabase.from('vendor_stores').select('id, store_name, status, store_type').eq('vendor_id', user?.id).eq('status', 'active'),
      supabase.from('vendor_store_brands').select('vendor_store_id, brand_id').eq('vendor_id', user?.id).eq('status', 'approved')
    ]);

    if (user?.id) {
      const { data: vPerm } = await supabase
        .from('vendors')
        .select('store_type, can_request_categories, can_request_brands, can_request_licenses')
        .eq('id', user.id)
        .maybeSingle();

      const resolvedStoreType = (vPerm?.store_type || strs?.[0]?.store_type || 'standard') as StoreType;
      setVendorStoreType(resolvedStoreType);

      if (vPerm) {
        setVendorPermissions({
          can_request_categories: !!vPerm.can_request_categories,
          can_request_brands: !!vPerm.can_request_brands,
          can_request_licenses: !!vPerm.can_request_licenses
        });
      }
    }

    // Filter brands for vendors: approved, manufacturer/other (no generic), is_vendor_selectable = true
    const GENERIC_NAMES = ['genérica', 'generica', 'generic', 'sin marca', 'no brand', 'n/a', 'na', 'desconocido', 'ninguna', '—', '-'];
    const validVendorBrands = (brs || []).filter(b => 
      b.brand_type !== 'generic' && 
      b.is_vendor_selectable !== false &&
      !GENERIC_NAMES.includes(b.name.toLowerCase().trim())
    );

    setCategories(cats || []);
    setBrands(validVendorBrands);
    setLicenses(lics || []);
    setTags(tgs || []);
    setActiveStores(strs || []);
    setStoreBrands(stBrs || []);
  }

  function openCreate() {
    setEditing(null);
    setForm({ 
      title: '', slug: '', description: '', short_description: '', base_price: '', compare_at_price: '', 
      sku: `${Date.now()}`, stock: '10', status: 'published', badge: '', is_featured: false, is_active: true, 
      category_id: '', brand_id: '', license_id: '',
      vendor_store_id: activeStores.length === 1 ? activeStores[0].id : '',
      condition: '',
      condition_notes: '',
      image_url: '', video_url: '',
      card_details: {
        sport: '', player_character: '', team: '', set_collection: '', year_season: '',
        card_number: '', format: 'Single Card', is_rookie: false, is_autograph: false,
        is_graded: false, grading_company: 'PSA', grade: '10', game: '', rarity: '', language: 'Español'
      },
      categories: [], tags: [], brands: [], gallery: [] 
    });
    setShowForm(true);
  }

  async function openEdit(product: Product) {
    setEditing(product);
    
    // Fetch associated junction data
    const [{ data: pCats }, { data: pTags }] = await Promise.all([
       supabase.from('product_categories').select('category_id').eq('product_id', product.id),
       supabase.from('product_tags').select('tags(id, name)').eq('product_id', product.id)
    ]);

    const existingCardDetails = (product as any).metadata?.card_details || {};

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
      license_id: (product as any).license_id || '',
      vendor_store_id: (product as any).vendor_store_id || '',
      condition: (product as any).condition || '',
      condition_notes: (product as any).condition_notes || '',
      image_url: product.images?.[0]?.url || '', 
      video_url: '',
      card_details: {
        sport: existingCardDetails.sport || '',
        player_character: existingCardDetails.player_character || '',
        team: existingCardDetails.team || '',
        set_collection: existingCardDetails.set_collection || '',
        year_season: existingCardDetails.year_season || '',
        card_number: existingCardDetails.card_number || '',
        format: existingCardDetails.format || 'Single Card',
        is_rookie: !!existingCardDetails.is_rookie,
        is_autograph: !!existingCardDetails.is_autograph,
        is_graded: !!existingCardDetails.is_graded,
        grading_company: existingCardDetails.grading_company || 'PSA',
        grade: existingCardDetails.grade || '10',
        game: existingCardDetails.game || '',
        rarity: existingCardDetails.rarity || '',
        language: existingCardDetails.language || 'Español'
      },
      categories: pCats?.map(c => c.category_id) || [],
      tags: (pTags as any)?.map((t:any) => t.tags.name) || [],
      brands: product.brand?.id ? [product.brand.id] : [],
      gallery: product.images?.slice(1) || []
    });
    setShowForm(true);
  }

  async function handleSave() {
    setValidationErrors([]);
    setTextDuplicateWarning(null);

    // 1. Run central validation engine
    const validation = validateProductForPublication({
      form: {
        title: form.title,
        base_price: form.base_price,
        compare_at_price: form.compare_at_price,
        categories: form.categories,
        category_id: form.category_id,
        brands: form.brands,
        brand_id: form.brand_id,
        image_url: form.image_url,
        stock: form.stock,
        condition: form.condition,
        vendor_id: user?.id
      },
      userRole: 'vendor',
      storeType: vendorStoreType,
      targetStatus: form.status as 'published' | 'draft' | 'archived',
      brandsList: brands,
      dbLicenses: licenses
    });

    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      const firstField = validation.errors[0]?.field;
      if (firstField) {
        setTimeout(() => {
          const element = document.getElementById(`field-${firstField}`) || document.querySelector(`[name="${firstField}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            (element as HTMLElement).focus?.();
          } else {
            const banner = document.getElementById('validation-summary-banner');
            banner?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
      return;
    }

    // 2. Check Duplicates when Publishing (Requirement 8)
    if (form.status === 'published') {
      const selectedBrandId = form.brands[0] || form.brand_id || null;
      const { data: dupData } = await supabase.rpc('check_duplicate_product', {
        p_title: form.title,
        p_brand_id: selectedBrandId,
        p_sku: form.sku || null,
        p_gtin: null,
        p_asin: null
      });

      if (dupData && dupData.length > 0) {
        const otherDup = dupData.find((d: any) => d.matched_product_id !== editing?.id);
        if (otherDup) {
          // Strong match (GTIN, SKU, ML Item ID) -> Hard Blocker for Vendor
          if (['sku', 'gtin', 'asin', 'ml_item_id'].includes(otherDup.match_type)) {
            setValidationErrors([{
              code: 'DUPLICATE_STRONG_MATCH',
              field: 'title',
              message: 'Ya existe un producto publicado con este mismo SKU o identificador comercial.',
              severity: 'HARD_BLOCKER'
            }]);
            return;
          }
          
          // Text similarity match (>=95%) -> Warning (Requirement 8)
          if (otherDup.similarity_score >= 0.95) {
            const { data: existingProd } = await supabase
              .from('products')
              .select('id, title, brand:brands(name), images:product_images(url)')
              .eq('id', otherDup.matched_product_id)
              .maybeSingle();

            setTextDuplicateWarning({
              id: otherDup.matched_product_id,
              title: existingProd?.title || 'Producto existente',
              brand_name: (existingProd as any)?.brand?.name || 'Marca no asignada',
              image_url: (existingProd as any)?.images?.[0]?.url || ''
            });
            return;
          }
        }
      }
    }

    // 3. Save Product (Draft or Published)
    try {
      setLoading(true);
      const normalizedCondition = normalizeCondition(form.condition);
      const slug = await generateUniqueSlug(form.title, editing?.id);
      const selectedBrandId = form.brands[0] || null;

      const currentMetadata = (editing as any)?.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(vendorStoreType === 'tcg' ? { card_details: form.card_details } : {})
      };

      const basePriceParsed = form.base_price !== '' && form.base_price !== null && form.base_price !== undefined ? parseFloat(String(form.base_price)) : null;

      const payload = {
        title: form.title.trim(),
        slug,
        description: form.description || null,
        short_description: form.short_description || null,
        base_price: basePriceParsed,
        compare_at_price: form.compare_at_price ? parseFloat(String(form.compare_at_price)) : null,
        status: form.status,
        badge: form.badge || null,
        is_featured: form.is_featured,
        is_active: form.is_active,
        brand_id: selectedBrandId,
        category_id: form.categories[0] || null,
        license_id: (form as any).license_id || null,
        vendor_store_id: form.vendor_store_id || null,
        condition: normalizedCondition,
        condition_notes: form.condition_notes ? form.condition_notes.trim() : null,
        metadata: updatedMetadata
      };

      console.log('[VENDOR_PRODUCTS_SAVE_PAYLOAD]', payload);

      let productId = editing?.id;
      let createdProductId: string | null = null;
      const targetStatus = form.status;

      if (editing) {
        // Keep status as draft or existing status during initial field update if publishing for first time,
        // ensuring DB triggers do not prematurely evaluate published guardrails before relations exist!
        const initialStatus = editing.status === 'published' ? (targetStatus === 'published' ? 'published' : 'draft') : 'draft';
        const initialPayload = { 
          ...payload, 
          status: initialStatus, 
          metadata: { ...payload.metadata, image_url: form.image_url || null } 
        };
        const { error: updProdErr } = await supabase.from('products').update(initialPayload).eq('id', productId).select().single();
        if (updProdErr) throw updProdErr;
      } else {
        // Transactional Staging Sequence: Insert as draft first to safely establish FK relations
        const newPayload = { 
          ...payload, 
          status: 'draft', 
          vendor_id: user?.id, 
          metadata: { ...payload.metadata, image_url: form.image_url || null } 
        };
        const { data: newProd, error: insertError } = await supabase.from('products').insert(newPayload).select().single();
        if (insertError) throw insertError;
        productId = newProd.id;
        createdProductId = newProd.id;
      }

      if (!productId) return;

      // Media
      await supabase.from('product_images').delete().eq('product_id', productId);
      const imagesPayload = [];
      if (form.image_url) imagesPayload.push({ product_id: productId, url: form.image_url, is_primary: true, sort_order: 0 });
      form.gallery.forEach((g, i) => imagesPayload.push({ product_id: productId, url: g.url, is_primary: false, sort_order: i + 1 }));
      if (imagesPayload.length > 0) {
        const { error: insImgErr } = await supabase.from('product_images').insert(imagesPayload);
        if (insImgErr) throw insImgErr;
      }

      // Variants
      const cleanInputSku = form.sku?.trim();
      const skuVal = (cleanInputSku && /^[0-9]{8,14}$/.test(cleanInputSku)) ? cleanInputSku : null;
      const stockParsed = form.stock !== '' ? parseInt(String(form.stock), 10) : 0;

      if (editing && editing.variants?.[0]?.id) {
        const { data: updVar, error: varErr } = await supabase
          .from('product_variants')
          .update({ sku: skuVal, inventory_count: stockParsed })
          .eq('id', editing.variants[0].id)
          .select('is_active')
          .single();

        if (varErr) throw varErr;

        // Buy Box check (Requirement 10)
        if (updVar && updVar.is_active === false && form.is_active === true) {
          toast.info("Este producto ya tiene stock disponible directamente en Collectibles. Tu oferta quedó pausada temporalmente y se reactivará según las reglas del marketplace.");
        }
      } else {
        const { error: varErr } = await supabase.from('product_variants').insert({
          product_id: productId,
          sku: skuVal,
          name: 'Standard',
          inventory_count: stockParsed
        });
        if (varErr) throw varErr;
      }

      // Junctions
      await Promise.all([
        supabase.from('product_categories').delete().eq('product_id', productId),
        supabase.from('product_tags').delete().eq('product_id', productId)
      ]);

      if (form.categories.length > 0) {
        const { error: insCatErr } = await supabase.from('product_categories').upsert(
          form.categories.map(cid => ({ product_id: productId, category_id: cid })),
          { onConflict: 'product_id,category_id', ignoreDuplicates: true }
        );
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

      // Final Server-Side Validation & Status Update
      if (targetStatus !== 'draft') {
        const { error: finalStatusErr } = await supabase
          .from('products')
          .update({ status: targetStatus })
          .eq('id', productId)
          .select()
          .single();
        if (finalStatusErr) throw finalStatusErr;
      }

      setShowForm(false);
      fetchProducts();
      fetchMeta();
      toast.success(editing ? 'Producto actualizado' : (targetStatus === 'published' ? 'Producto creado y publicado' : 'Producto guardado en borrador'));
    } catch (err: any) {
      console.error('[VProducts handleSave Runtime Error]', err);
      console.trace(err);
      const userMessage = mapDatabaseErrorToUserMessage(err);

      if (createdProductId && !editing) {
        // Product was successfully inserted as Draft in Step 1. Preserve it so user work is not lost!
        fetchProducts();
        fetchMeta();
        setShowForm(false);
        toast.warning(`No pudimos finalizar la publicación. El producto quedó guardado como borrador para que puedas revisarlo.\n\nMotivo: ${userMessage}`);
      } else {
        toast.error(userMessage);
      }
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
    setForm(prev => {
      const isSelecting = !prev.brands.includes(id);
      const nextBrands = isSelecting ? [id] : [];
      let nextStoreId = prev.vendor_store_id;

      if (isSelecting) {
        const matchedAssociation = storeBrands.find(sb => sb.brand_id === id);
        if (matchedAssociation) {
          nextStoreId = matchedAssociation.vendor_store_id;
        }
      }

      return {
        ...prev,
        brands: nextBrands,
        vendor_store_id: nextStoreId
      };
    });
  };

  const handleAddCategory = async () => {
    if (!vendorPermissions.can_request_categories) {
      return toast.error("No tienes permiso para solicitar nuevas categorías. Contacta al Administrador.");
    }
    if (!newCatInput.trim() || !user) return;
    try {
      const { error } = await supabase.from('vendor_category_requests').insert({
        vendor_id: user.id,
        requested_name: newCatInput.trim(),
        source: 'vendor_form',
        status: 'pending'
      });
      if (error) throw error;
      setNewCatInput('');
      toast.success('Solicitud de nueva categoría enviada al Administrador.');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAddBrand = async () => {
    toast.error("No se permite crear marcas personalizadas. Debes seleccionar una marca oficial aprobada del catálogo.");
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
          
          const productUpdates: any = { category_id: value };
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
      const newSlug = await generateUniqueSlug(newTitle);

      const brandId = product.brand?.id || product.brand_id || null;
      const catId = product.category?.id || product.category_id || null;
      const payload = {
        vendor_id: user.id,
        title: newTitle,
        slug: newSlug,
        description: product.description,
        short_description: product.short_description,
        base_price: product.base_price,
        compare_at_price: product.compare_at_price,
        status: 'draft',
        is_active: product.is_active !== false,
        badge: product.badge,
        is_featured: product.is_featured,
        brand_id: brandId,
        category_id: catId,
        condition: normalizeCondition((product as any).condition),
        condition_notes: (product as any).condition_notes?.trim() || null
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

      // 4. Duplicate Variants (generate unique SKU with random suffix to prevent unique constraint conflicts)
      const originalSku = product.variants?.[0]?.sku || '';
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      const cleanOriginalSku = originalSku ? originalSku.replace(/-COPY(-\d+)?$/gi, '') : `SKU-${Date.now()}`;
      const newSku = `${cleanOriginalSku}-COPY-${randSuffix}`;
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
        const uniqueSlug = await generateUniqueSlug(p.title);
        const isVintageOrMixed = vendorStoreType === 'vintage' || vendorStoreType === 'mixed';
        const normalizedCond = normalizeCondition(p.condition);
        const importStatus = (isVintageOrMixed && !normalizedCond) ? 'draft' : 'published';

        // Insert Product
        const { data: newProd, error: prodErr } = await supabase
          .from('products')
          .insert({
            title: p.title.trim(),
            slug: uniqueSlug,
            description: p.description || null,
            base_price: p.base_price,
            compare_at_price: p.compare_at_price || null,
            status: importStatus,
            is_active: true,
            category_id: categoryId,
            brand_id: brandId,
            condition: normalizedCond,
            condition_notes: p.condition_notes?.trim() || null,
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
    const sLower = search.toLowerCase().trim();
    return products.filter(p => {
      // Brand name resolution
      const rawBrandName = (Array.isArray(p.brand) ? p.brand[0]?.name : p.brand?.name) ||
        brands.find(b => b.id === (p.brand_id || p.brand?.id))?.name || '';
      const brandName = rawBrandName.toLowerCase();

      // Category name resolution
      const rawCatName = (Array.isArray(p.product_categories) ? p.product_categories[0]?.categories?.name : null) ||
        p.category?.name ||
        categories.find(c => c.id === (p.category_id || p.category?.id))?.name || '';
      const categoryName = rawCatName.toLowerCase();

      const matchesSearch = !sLower || 
        p.title.toLowerCase().includes(sLower) ||
        brandName.includes(sLower) ||
        categoryName.includes(sLower) ||
        p.ml_item_id?.toLowerCase().includes(sLower) ||
        (p.metadata?.gtin && String(p.metadata.gtin).toLowerCase().includes(sLower)) ||
        (p.metadata?.amazon_asin && String(p.metadata.amazon_asin).toLowerCase().includes(sLower)) ||
        (p.metadata?.external_product_id && String(p.metadata.external_product_id).toLowerCase().includes(sLower)) ||
        p.variants?.some((v: any) => 
          (v.sku && String(v.sku).toLowerCase().includes(sLower)) || 
          (v.legacy_sku && String(v.legacy_sku).toLowerCase().includes(sLower)) ||
          (v.sku_vendedor && String(v.sku_vendedor).toLowerCase().includes(sLower))
        );
      const matchesCategory = filterCategory === '' || p.category_id === filterCategory || p.product_categories?.[0]?.categories?.id === filterCategory || p.category?.id === filterCategory;
      const matchesBrand = filterBrand === '' || p.brand?.id === filterBrand || p.brand_id === filterBrand;
      return matchesSearch && matchesCategory && matchesBrand;
    });
  }, [products, search, filterCategory, filterBrand, brands, categories]);

  const brandReviewCount = useMemo(() => {
    const GENERIC_LIST = ['genérica', 'generica', 'generic', 'sin marca', 'no brand', 'n/a', 'na', 'desconocido', 'ninguna', '—', '-'];
    return products.filter(p => {
      if (p.status !== 'published') return false;
      if ((p as any).needs_brand_review) return true;
      if (!p.brand?.id && !(p as any).brand_id) return true;
      const bName = p.brand?.name || '';
      if (bName && GENERIC_LIST.includes(bName.toLowerCase().trim())) return true;
      return false;
    }).length;
  }, [products]);

  return (
    <div className="max-w-full">
      {/* Brand Review Alert Banner */}
      {brandReviewCount > 0 && (
        <div className="mb-6 p-4 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex items-center gap-3 animate-fade-in">
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-900">
              Tienes {brandReviewCount} producto(s) publicado(s) que requieren revisión de marca.
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Por reglas de catálogo y calidad, la marca actual no cumple con los estándares oficiales. Debes seleccionar una marca válida antes de re-publicar o guardar cambios.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
               <h2 className="text-2xl font-black text-dark-900">Productos <span className="bg-blue-600 text-white text-[8px] px-1 py-0.5 rounded ml-2 relative -top-1">v2</span></h2>
               {!loading && (
                 <span className="bg-gray-100/80 border border-gray-200 text-gray-500 text-[10px] font-black uppercase px-2 py-1 rounded-md tracking-widest hidden md:inline-flex items-center gap-1">
                   {totalProductsCount} {totalProductsCount === 1 ? 'Producto' : 'Productos'}
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
          <button onClick={() => setShowExport(true)} className="btn-secondary px-4 py-2 text-sm gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"><Download className="w-4 h-4 text-emerald-600" /> Exportar</button>
          <button onClick={() => setShowImport(true)} className="btn-secondary px-4 py-2 text-sm gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"><Upload className="w-4 h-4 text-blue-600" /> Importar</button>
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
             <ResponsiveDataList
               items={getSortedProducts(filteredProducts)}
               keyExtractor={(p: any) => p.id}
               loading={loading}
               emptyTitle="0 PRODUCTOS ENCONTRADOS"
               emptyDescription="No se encontraron productos en la tienda."
               renderCard={(p: any) => {
                 const primaryCat = p.product_categories?.[0]?.categories;
                 const isSelected = selectedProducts.includes(p.id);
                 const stock = p.variants?.[0]?.inventory_count || 0;

                 return (
                   <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 shadow-xs min-w-0">
                     <div className="flex items-start justify-between gap-3">
                       <div className="flex items-center gap-3 min-w-0">
                         <input 
                           type="checkbox" 
                           className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0" 
                           checked={isSelected}
                           onChange={(e) => {
                             if (e.target.checked) setSelectedProducts([...selectedProducts, p.id]);
                             else setSelectedProducts(selectedProducts.filter(id => id !== p.id));
                           }}
                         />
                         <img src={getProductImage(p)} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-100 shadow-xs shrink-0" />
                         <div className="min-w-0">
                           <h4 className="font-bold text-gray-900 text-xs sm:text-sm truncate">{p.title}</h4>
                           <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                             <span className="text-[10px] font-mono text-gray-400 uppercase">SKU: {p.variants?.[0]?.sku || '-'}</span>
                             {p.ml_item_id && <span className="bg-yellow-400 text-blue-900 text-[8px] font-black px-1 rounded">ML</span>}
                           </div>
                         </div>
                       </div>

                       <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${p.status === 'published' ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-100'}`}>
                         {p.status === 'published' ? 'Visible' : 'Oculto'}
                       </span>
                     </div>

                     <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-gray-100 py-2">
                       <div>
                         <span className="text-gray-400 block text-[10px] uppercase font-semibold">Precio</span>
                         <span className="font-black text-gray-900 text-sm">UYU {(p.base_price || 0).toLocaleString()}</span>
                       </div>
                       <div>
                         <span className="text-gray-400 block text-[10px] uppercase font-semibold">Stock</span>
                         <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] inline-block">
                           {stock} u.
                         </span>
                       </div>
                       <div>
                         <span className="text-gray-400 block text-[10px] uppercase font-semibold">Categoría</span>
                         <span className="font-medium text-gray-700 truncate block">{primaryCat?.name || '-'}</span>
                       </div>
                       <div>
                         <span className="text-gray-400 block text-[10px] uppercase font-semibold">Marca</span>
                         <span className="font-medium text-gray-700 truncate block">{p.brand?.name || '-'}</span>
                       </div>
                     </div>

                     <div className="flex items-center justify-between pt-1">
                       <span className="text-gray-400 text-[10px]">
                         {new Date(p.created_at).toLocaleDateString()}
                       </span>

                       <div className="flex items-center gap-2">
                         <button
                           onClick={() => openEdit(p)}
                           className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs transition-colors min-h-[36px]"
                         >
                           Editar
                         </button>
                         <button
                           onClick={(e) => handleDuplicate(p, e)}
                           className="p-2 text-gray-500 hover:text-blue-600 bg-gray-50 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
                           title="Duplicar producto"
                         >
                           <Copy className="w-4 h-4" />
                         </button>
                         <button
                           onClick={() => handleDelete(p.id)}
                           className="p-2 text-red-500 hover:text-red-700 bg-red-50 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
                           title="Eliminar producto"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </div>
                     </div>
                   </div>
                 );
               }}
               renderTableHeader={() => (
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
               )}
               renderTableRow={(p: any) => {
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
            }}
          />
         </div>
            <div className="bg-white border-t px-6 py-3 flex items-center justify-between text-xs text-gray-500">
               <span>Página {currentPage} de {Math.max(1, Math.ceil(totalProductsCount / (typeof itemsPerPage === 'number' ? itemsPerPage : 50)))} ({totalProductsCount} {totalProductsCount === 1 ? 'producto' : 'productos'} en total)</span>
               <div className="flex items-center gap-2">
                 <button disabled={currentPage <= 1 || loading} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Anterior</button>
                 <button disabled={currentPage >= Math.ceil(totalProductsCount / (typeof itemsPerPage === 'number' ? itemsPerPage : 50)) || loading} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Siguiente</button>
               </div>
            </div>
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
                 {/* Resumen Superior de Errores de Publicación */}
                 {validationErrors.length > 0 && (
                    <div className="mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-2xl shadow-sm animate-fade-in" id="validation-summary-banner">
                       <div className="flex items-center gap-3 text-red-900 font-bold mb-2">
                          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                          <span>Faltan {validationErrors.length} dato{validationErrors.length > 1 ? 's' : ''} para publicar este producto:</span>
                       </div>
                       <ul className="space-y-1.5 pl-8 list-disc text-xs text-red-700 font-semibold">
                          {validationErrors.map((err, idx) => (
                             <li key={idx} className="cursor-pointer hover:underline hover:text-red-900" onClick={() => {
                                const element = document.getElementById(`field-${err.field}`) || document.querySelector(`[name="${err.field}"]`);
                                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                (element as HTMLElement)?.focus?.();
                             }}>
                                {err.message}
                             </li>
                          ))}
                       </ul>
                    </div>
                 )}

                 {/* Banner de Advertencia de Duplicado Textual */}
                 {textDuplicateWarning && (
                    <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm animate-fade-in">
                       <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 text-xs">
                             <h4 className="font-bold text-amber-900 text-sm mb-1">Parece que ya existe un producto muy similar</h4>
                             <div className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-amber-200 my-2">
                                {textDuplicateWarning.image_url && (
                                   <img src={textDuplicateWarning.image_url} alt="" className="w-10 h-10 object-cover rounded border" />
                                )}
                                <div>
                                   <p className="font-bold text-gray-900">{textDuplicateWarning.title}</p>
                                   <p className="text-[11px] text-gray-500">Marca: {textDuplicateWarning.brand_name}</p>
                                </div>
                             </div>
                             <p className="text-amber-800 font-semibold mb-3">Revisá el producto existente para evitar duplicados en el catálogo.</p>
                             <div className="flex gap-2">
                                <button
                                   type="button"
                                   onClick={() => setTextDuplicateWarning(null)}
                                   className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700"
                                >
                                   Continuar de todos modos
                                </button>
                                <button
                                   type="button"
                                   onClick={() => {
                                      setShowForm(false);
                                      setTextDuplicateWarning(null);
                                   }}
                                   className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded text-xs font-bold hover:bg-amber-100"
                                >
                                   Volver a la lista
                                </button>
                             </div>
                          </div>
                       </div>
                    </div>
                 )}

                 <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    
                    {/* Main Content (Left) */}
                    <div className="lg:col-span-3 space-y-6">
                       <div className={`bg-white p-6 border shadow-sm space-y-4 rounded-xl transition-all ${getFieldError('title') ? 'border-red-400 ring-2 ring-red-100' : ''}`}>
                          <input 
                            id="field-title"
                            name="title"
                            placeholder="Introduce el título aquí" 
                            className="w-full text-2xl font-bold py-2 border-b-2 border-transparent focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
                            value={form.title} onChange={e => {
                              setForm({...form, title: e.target.value});
                              if (validationErrors.some(e => e.field === 'title')) setValidationErrors(prev => prev.filter(e => e.field !== 'title'));
                            }}
                          />
                          {getFieldError('title') && (
                            <p className="text-xs font-bold text-red-600 flex items-center gap-1.5 mt-1">
                              <AlertCircle className="w-3.5 h-3.5" />
                              {getFieldError('title')}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                             <span className="font-bold">Enlace permanente:</span>
                             <span className="text-blue-500 underline">https://collectibles-ecommerce.com/p/</span>
                             <span className="text-blue-600 font-mono select-all bg-blue-50 px-2 py-0.5 rounded font-semibold">{slugify(form.title) || form.slug || 'slug-automatico'}</span>
                          </div>
                       </div>

                       <div className="bg-white border shadow-sm rounded-xl">
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

                       <div className="bg-white border shadow-sm rounded-xl">
                          <div className="px-4 py-2 border-b bg-gray-50/50 flex items-center gap-2">
                             <Pencil className="w-4 h-4 text-gray-400" />
                             <span className="text-sm font-bold text-gray-600">Precios e Inventario</span>
                          </div>
                          <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
                             <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Precio ($)</label>
                                <input id="field-base_price" name="base_price" type="number" className={`w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white outline-none ${getFieldError('base_price') ? 'border-red-500 bg-red-50/20' : ''}`} value={form.base_price} onChange={e => {
                                  setForm({...form, base_price: e.target.value});
                                  if (validationErrors.some(err => err.field === 'base_price')) setValidationErrors(prev => prev.filter(err => err.field !== 'base_price'));
                                }} />
                                {getFieldError('base_price') && (
                                  <p className="text-[11px] font-bold text-red-600 flex items-center gap-1 mt-1">
                                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                    {getFieldError('base_price')}
                                  </p>
                                )}
                             </div>
                             <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Precio Rebajado</label>
                                <input type="number" className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white outline-none" value={form.compare_at_price} onChange={e => setForm({...form, compare_at_price: e.target.value})} />
                             </div>
                             <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">SKU (UPC / EAN / GTIN)</label>
                                <input className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white outline-none font-mono" placeholder="Ej: 887961308259" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} />
                                <span className="text-[9px] text-gray-400 block mt-1">Exclusivamente UPC / EAN / GTIN numérico.</span>
                             </div>
                             <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Stock</label>
                                <input id="field-stock" name="stock" type="number" className={`w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white outline-none font-bold text-blue-600 ${getFieldError('stock') ? 'border-red-500 bg-red-50/20' : ''}`} value={form.stock} onChange={e => {
                                  setForm({...form, stock: e.target.value});
                                  if (validationErrors.some(err => err.field === 'stock')) setValidationErrors(prev => prev.filter(err => err.field !== 'stock'));
                                }} />
                                {getFieldError('stock') && (
                                  <p className="text-[11px] font-bold text-red-600 flex items-center gap-1 mt-1">
                                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                    {getFieldError('stock')}
                                  </p>
                                )}
                             </div>
                          </div>

                         {/* 🃏 CARD DETAILS (TCG STORE & SPECIALIZED CATEGORIES) */}
                         {vendorStoreType === 'tcg' && (
                            <CardDetailsFormSection
                              categoryId={form.categories[0] || form.category_id}
                              categories={categories}
                              cardDetails={form.card_details}
                              onChange={updated => setForm(prev => ({ ...prev, card_details: updated }))}
                            />
                         )}

                        {/* 🏷️ CONDITION & CONDITION NOTES (VINTAGE / MIXED STORE) */}
                        {(vendorStoreType === 'vintage' || vendorStoreType === 'mixed') && (
                           <div className="bg-white border shadow-sm rounded-lg overflow-hidden">
                              <div className="px-4 py-2.5 border-b bg-purple-50/70 flex items-center justify-between">
                                 <div className="flex items-center gap-2">
                                    <span className="text-purple-900 font-bold text-sm">🏷️ Condition (Estado del Producto)</span>
                                    <span className="text-[10px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 px-2 py-0.5 rounded">Obligatorio al publicar</span>
                                 </div>
                              </div>
                              <div className="p-6 space-y-4">
                                 {!form.condition && (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2.5 text-amber-900 text-xs font-bold shadow-sm">
                                       <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                       <span>Este producto necesita que indiques su Condition.</span>
                                    </div>
                                 )}
                                 <div>
                                    <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest block mb-1">
                                       Condition *
                                    </label>
                                    <select
                                       id="field-condition"
                                       name="condition"
                                       value={form.condition}
                                       onChange={e => {
                                         setForm({...form, condition: e.target.value});
                                         if (validationErrors.some(err => err.field === 'condition')) setValidationErrors(prev => prev.filter(err => err.field !== 'condition'));
                                       }}
                                       className={`w-full p-2.5 border rounded-lg text-sm bg-white font-bold text-gray-800 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none ${getFieldError('condition') ? 'border-red-500 bg-red-50/20' : 'border-gray-300'}`}
                                    >
                                       <option value="">[ Select condition... ▼ ]</option>
                                       {CONDITION_OPTIONS.map(c => (
                                          <option key={c.value} value={c.value}>{c.label}</option>
                                       ))}
                                    </select>
                                    {getFieldError('condition') && (
                                       <p className="text-[11px] font-bold text-red-600 flex items-center gap-1 mt-1">
                                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                          {getFieldError('condition')}
                                       </p>
                                    )}
                                    <p className="text-[10px] text-gray-400 mt-1">
                                       Para publicar en tiendas {vendorStoreType === 'vintage' ? 'Vintage' : 'Mixed'}, debes seleccionar el estado comercial exacto.
                                    </p>
                                 </div>

                                 <div>
                                    <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest block mb-1">
                                       Condition Notes (Notas del Estado)
                                    </label>
                                    <input
                                       type="text"
                                       value={form.condition_notes}
                                       onChange={e => setForm({...form, condition_notes: e.target.value})}
                                       placeholder="Ej.: box has shelf wear, missing weapon, minor paint wear..."
                                       className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white border-gray-300 outline-none"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">
                                       Detalles opcionales sobre el empaque, accesorios faltantes o desgaste.
                                    </p>
                                 </div>
                              </div>
                           </div>
                        )}
                       </div>

                       {/* 🔒 Identificadores de Integración (Técnico / Solo Lectura) */}
                       {editing && (
                          <div className="bg-slate-900 rounded-xl p-5 text-white shadow-lg border border-slate-800">
                             <h4 className="font-bold flex items-center gap-2 mb-1 text-sm text-slate-200">
                                Identificadores de Integración
                             </h4>
                             <p className="text-[11px] text-slate-400 mb-3">Identificadores técnicos relacionales del sistema y marketplaces externos (No mostrados como SKU).</p>
                             <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                                <div><span className="text-slate-400 block text-[10px]">ML Item ID:</span> {editing.ml_item_id || '—'}</div>
                                <div><span className="text-slate-400 block text-[10px]">ID Externo:</span> {editing.metadata?.amazon_asin || editing.metadata?.external_product_id || '—'}</div>
                                <div><span className="text-slate-400 block text-[10px]">Vendor SKU:</span> {editing.variants?.[0]?.sku_vendedor || '—'}</div>
                                <div><span className="text-slate-400 block text-[10px]">UUID Interno:</span> {editing.id ? `${editing.id.substring(0, 8)}...` : '—'}</div>
                             </div>
                          </div>
                       )}

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
                        <SidebarWidget title="Categorías del producto *">
                           <div className="space-y-3" id="field-categories">
                              {getFieldError('categories') && (
                                 <p className="text-xs font-bold text-red-600 flex items-center gap-1.5 p-2 bg-red-50 rounded border border-red-200">
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                    {getFieldError('categories')}
                                 </p>
                              )}
                              <div className={`border rounded-md max-h-48 overflow-y-auto p-2 bg-gray-50/30 ${getFieldError('categories') ? 'border-red-400 ring-1 ring-red-200' : ''}`}>
                                 {categories.map(cat => (
                                    <label key={cat.id} className="flex items-center gap-2 py-1 px-1 hover:bg-white rounded transition-colors cursor-pointer text-xs">
                                       <input type="checkbox" checked={form.categories.includes(cat.id)} onChange={() => {
                                         toggleCategory(cat.id);
                                         if (validationErrors.some(e => e.field === 'categories')) setValidationErrors(prev => prev.filter(e => e.field !== 'categories'));
                                       }} className="rounded border-gray-300 text-blue-600" />
                                       {cat.name}
                                    </label>
                                 ))}
                              </div>
                               {vendorPermissions.can_request_categories ? (
                                 <div className="flex gap-2">
                                   <input 
                                     value={newCatInput} onChange={e => setNewCatInput(e.target.value)}
                                     placeholder="Solicitar nueva categoría..." className="flex-1 text-xs p-1.5 border rounded outline-none focus:border-blue-500" 
                                   />
                                   <button type="button" onClick={handleAddCategory} className="bg-blue-50 text-blue-600 px-3 rounded font-bold text-[10px] hover:bg-blue-100">
                                      Solicitar
                                   </button>
                                 </div>
                               ) : (
                                 <p className="text-[10px] text-gray-400 italic">
                                    Solicitud de nuevas categorías deshabilitada. Selecciona una categoría existente.
                                 </p>
                               )}
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
                        {/* WIDGET: TIENDAS (VENDIDO POR) */}
                        <SidebarWidget title="Tienda / Vendido por">
                           <div className="space-y-3">
                              <select 
                                 value={form.vendor_store_id} 
                                 onChange={e => setForm(prev => ({ ...prev, vendor_store_id: e.target.value }))}
                                 className="w-full text-xs p-2 border rounded bg-white outline-none focus:border-blue-500"
                              >
                                 <option value="">Ninguna (Collectibles)</option>
                                 {activeStores.map(store => (
                                    <option key={store.id} value={store.id}>{store.store_name}</option>
                                 ))}
                              </select>
                              <p className="text-[10px] text-gray-400">
                                 Define con qué identidad pública se venderá este producto.
                              </p>
                           </div>
                        </SidebarWidget>

                        {/* WIDGET: MARCA / FABRICANTE */}
                        <SidebarWidget title="MARCA / FABRICANTE *">
                           <div className="space-y-3" id="field-brands">
                              {getFieldError('brands') && (
                                 <p className="text-xs font-bold text-red-600 flex items-center gap-1.5 p-2 bg-red-50 rounded border border-red-200">
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                    {getFieldError('brands')}
                                 </p>
                              )}
                              <select
                                 id="select-brand"
                                 value={form.brands[0] || ''}
                                 onChange={e => {
                                    const val = e.target.value;
                                    setForm(prev => ({ ...prev, brand_id: val, brands: val ? [val] : [] }));
                                    if (validationErrors.some(err => err.field === 'brands')) setValidationErrors(prev => prev.filter(err => err.field !== 'brands'));
                                 }}
                                 className={`w-full text-xs p-2 border rounded bg-white outline-none focus:border-blue-500 font-bold text-gray-800 ${getFieldError('brands') ? 'border-red-500 bg-red-50/20' : ''}`}
                              >
                                 <option value="">-- Seleccionar Marca Oficial --</option>
                                 {brands.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                 ))}
                              </select>
                              <p className="text-[10px] text-gray-400">
                                 Indica quién fabrica/comercializa el producto (Obligatoria para publicar). Ej: Hasbro, Funko, Mattel, NECA.
                              </p>
                              <div className="pt-2 border-t flex justify-between items-center text-xs">
                                 <span className="text-gray-500 text-[11px]">¿No encontrás la marca?</span>
                                 {vendorPermissions.can_request_brands ? (
                                   <button
                                      type="button"
                                      onClick={() => { setRequestedBrandName(''); setShowBrandRequestModal(true); }}
                                      className="text-blue-600 hover:underline font-bold text-[11px]"
                                   >
                                      Solicitar nueva marca
                                   </button>
                                 ) : (
                                   <span className="text-gray-400 text-[10px] italic">
                                      Solicitud de marcas deshabilitada
                                   </span>
                                 )}
                              </div>
                           </div>
                        </SidebarWidget>

                        {/* WIDGET: LICENCIA / FRANQUICIA */}
                        <SidebarWidget title="LICENCIA / FRANQUICIA">
                           <div className="space-y-3">
                              <select
                                 value={(form as any).license_id || ''}
                                 onChange={e => {
                                    const val = e.target.value;
                                    setForm(prev => ({ ...prev, license_id: val } as any));
                                 }}
                                 className="w-full text-xs p-2 border rounded bg-white outline-none focus:border-blue-500 text-gray-800 font-semibold"
                              >
                                 <option value="">-- Sin Licencia / Opcional --</option>
                                 {licenses.map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                 ))}
                              </select>
                              <p className="text-[10px] text-gray-400">
                                 Indica la propiedad/personaje/universo cuando corresponda (Opcional). Ej: Marvel, Disney, Pokémon, Star Wars.
                              </p>
                              <div className="pt-2 border-t flex justify-between items-center text-xs">
                                 <span className="text-gray-500 text-[11px]">¿No encontrás la licencia?</span>
                                 {vendorPermissions.can_request_licenses ? (
                                   <button
                                      type="button"
                                      onClick={() => { setRequestedLicenseName(''); setShowLicenseRequestModal(true); }}
                                      className="text-blue-600 hover:underline font-bold text-[11px]"
                                   >
                                      Solicitar nueva licencia
                                   </button>
                                 ) : (
                                   <span className="text-gray-400 text-[10px] italic">
                                      Solicitud de licencias deshabilitada
                                   </span>
                                 )}
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
        </div>
      )}

      {/* MODALS & OVERLAYS */}
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
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            fetchProducts();
          }}
          userRole="vendor"
          currentVendorId={vendor?.id || null}
        />
      )}

      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          initialFilters={{
            search: search || '',
            categoryId: filterCategory || '',
            brandId: filterBrand || '',
            vendorId: vendor?.id || 'all',
            mbeType: '',
            argentinaStatus: '',
            status: ''
          }}
          selectedProductIds={selectedProducts}
          userRole="vendor"
          vendorId={vendor?.id || null}
        />
      )}

      {/* MODAL: SOLICITAR NUEVA MARCA */}
      {showBrandRequestModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-900 text-base">Solicitar Nueva Marca</h3>
              <button onClick={() => setShowBrandRequestModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Si la marca del fabricante de tus productos no se encuentra en el catálogo oficial de Collectibles, podés solicitar su incorporación. El Administrador revisará y aprobará la solicitud.
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre del Fabricante / Marca *</label>
                <input
                  type="text"
                  placeholder="Ej: Hasbro, Funko, PhatMojo..."
                  value={requestedBrandName}
                  onChange={(e) => setRequestedBrandName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-xl focus:outline-none focus:border-blue-500 font-semibold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowBrandRequestModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={!requestedBrandName.trim() || brandRequestLoading}
                onClick={async () => {
                  setBrandRequestLoading(true);
                  try {
                    const { error } = await supabase.from('vendor_brand_requests').insert({
                      vendor_id: user?.id,
                      requested_name: requestedBrandName.trim(),
                      source: 'vendor_form',
                      status: 'pending'
                    });
                    if (error) throw error;
                    toast.success('Solicitud de nueva marca enviada al Administrador.');
                    setShowBrandRequestModal(false);
                    setRequestedBrandName('');
                  } catch (err: any) {
                    toast.error('Error al solicitar marca: ' + err.message);
                  } finally {
                    setBrandRequestLoading(false);
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl disabled:opacity-50"
              >
                {brandRequestLoading ? 'Enviando...' : 'Enviar Solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SOLICITAR NUEVA LICENCIA */}
      {showLicenseRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-bold text-gray-900 text-base">Solicitar Nueva Licencia / Franquicia</h3>
              <button
                onClick={() => setShowLicenseRequestModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Si la franquicia o propiedad intelectual de tus productos no se encuentra disponible, podés solicitar su incorporación. El Administrador la revisará y asociará al catálogo.
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre de la Licencia / Franquicia *</label>
                <input
                  type="text"
                  placeholder="Ej: Star Wars, Marvel, Transformers..."
                  value={requestedLicenseName}
                  onChange={(e) => setRequestedLicenseName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-xl focus:outline-none focus:border-blue-500 font-semibold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowLicenseRequestModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={!requestedLicenseName.trim() || licenseRequestLoading}
                onClick={async () => {
                  setLicenseRequestLoading(true);
                  try {
                    const { error } = await supabase.from('vendor_license_requests').insert({
                      vendor_id: user?.id,
                      requested_name: requestedLicenseName.trim(),
                      source: 'vendor_form',
                      status: 'pending'
                    });
                    if (error) throw error;
                    toast.success('Solicitud de nueva licencia enviada al Administrador.');
                    setShowLicenseRequestModal(false);
                    setRequestedLicenseName('');
                  } catch (err: any) {
                    toast.error('Error al solicitar licencia: ' + err.message);
                  } finally {
                    setLicenseRequestLoading(false);
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl disabled:opacity-50"
              >
                {licenseRequestLoading ? 'Enviando...' : 'Enviar Solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


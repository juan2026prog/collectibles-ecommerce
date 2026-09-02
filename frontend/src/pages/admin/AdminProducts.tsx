import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Search, Eye, X, Upload, Download, Save, AlertCircle, Check, Loader2, ImageIcon, ChevronUp, ChevronDown, Trash, Copy, AlertTriangle, ExternalLink, CheckCircle2, Truck } from 'lucide-react';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import ImportModal from '../../components/admin/ImportModal';
import ExportModal from '../../components/admin/ExportModal';
import type { ParsedProduct } from '../../lib/bulkImportUtils';
import type { ProductFilterState } from '../../lib/productFilterTypes';
import { getProductImage } from '../../lib/imageUtils';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { slugify, generateUniqueSlug } from '../../lib/slugUtils';
import { CONDITION_OPTIONS, getConditionLabel, normalizeCondition } from '../../config/conditionConfig';
import { CardDetailsFormSection } from '../../components/vendor/CardDetailsFormSection';
import ResponsiveDataList from '../../components/admin/ResponsiveDataList';
import FilterDrawer from '../../components/admin/FilterDrawer';
import { BackofficePageHeader, BackofficeSearch, BackofficeActionMenu, BackofficeStatusBadge } from '../../components/backoffice';
import { type CardDetails, buildCategoryTreeOptions, isSportsCardCategory, isTCGCategory } from '../../config/tcgConfig';
import { validateProductForPublication, type PublicationValidationError } from '../../lib/productPublicationValidator';
import { mapDatabaseErrorToUserMessage } from '../../lib/databaseErrorMapper';
import {
  sanitizeMbePackagingType,
  isValidMbePackagingType,
  getMbePackagingLabel,
  mergeMbePackagingType,
  calculateArgentinaShippingStatus,
  type MbePackagingType
} from '../../lib/mbeLogisticsUtils';

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

// 📦 REUSABLE SIDEBAR UI WIDGET 📦
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

interface VendorOption {
  id: string;
  store_name: string;
  company_name?: string;
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
  vendor_id?: string | null;
  vendor?: { id: string; store_name?: string; company_name?: string } | null;
  category: { id?: string, name: string } | null;
  brand: { id?: string, name: string } | null;
  images: { id?: string, url: string }[];
  variants: { id?: string, inventory_count: number; sku?: string }[];
  ml_item_id?: string;
  ml_category_id?: string;
  metadata?: any;
  created_at: string;
}

interface DuplicateCandidateInfo {
  matched_product_id: string;
  similarity_score: number;
  match_type: string;
  title?: string;
  vendor_name?: string;
  sku?: string;
}

export default function AdminProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCandidateInfo | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<PublicationValidationError[]>([]);

  const getFieldError = (fieldName: string) => {
    return validationErrors.find(e => e.field === fieldName)?.message;
  };

  const { toast } = useToast();
  const { confirm } = useConfirmModal();
  
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'Todos'>(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterBrand, setFilterBrand] = useState<string>('');
  const [filterVendor, setFilterVendor] = useState<string>(searchParams.get('vendor') || 'all');
  const [filterMbe, setFilterMbe] = useState<string>(''); // '', 'mbe_pak', 'mbe_caja', 'unclassified'
  const [filterArgentina, setFilterArgentina] = useState<string>(''); // '', 'auto', 'quote'
  const [filterImageStatus, setFilterImageStatus] = useState<string>(''); // '', 'valid', 'missing', 'broken', 'placeholder', 'merchant_ready', 'not_merchant_ready'
  const [filterCommercialStatus, setFilterCommercialStatus] = useState<string>(''); // '', 'published', 'draft', 'inactive'
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const [bulkMbeModalOpen, setBulkMbeModalOpen] = useState(false);
  const [targetBulkMbeType, setTargetBulkMbeType] = useState<MbePackagingType>(null);
  const [bulkUpdatingMbe, setBulkUpdatingMbe] = useState(false);
  
  const [totalProductsCount, setTotalProductsCount] = useState<number>(0);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(search);
  const lastRequestId = useRef<number>(0);

  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  const [form, setForm] = useState({
    title: '', slug: '', description: '', short_description: '',
    base_price: '', compare_at_price: '', sku: '', stock: '10', status: 'published',
    badge: '', is_featured: false, is_active: true, category_id: '', brand_id: '', license_id: '',
    vendor_id: 'platform',
    condition: '', condition_notes: '',
    image_url: '', video_url: '',
    weight_kg: '',
    dimensions_length: '',
    dimensions_width: '',
    dimensions_height: '',
    mbe_packaging_type: '' as string,
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

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Trigger server-side fetch when search, filters, or pagination change
  useEffect(() => {
    fetchProducts();
  }, [debouncedSearch, filterCategory, filterBrand, filterVendor, currentPage, itemsPerPage, sortField, sortOrder]);

  useEffect(() => {
    fetchMeta();
  }, []);

  const handleVendorFilterChange = (val: string) => {
    setFilterVendor(val);
    setCurrentPage(1);
    const newParams = new URLSearchParams(searchParams);
    if (val === 'all') {
      newParams.delete('vendor');
    } else {
      newParams.set('vendor', val);
    }
    setSearchParams(newParams);
  };

  async function fetchProducts() {
    setLoading(true);
    const currentReqId = ++lastRequestId.current;
    const pageSizeNum = itemsPerPage === 'Todos' ? 1000 : Number(itemsPerPage);

    try {
      let query = supabase
        .from('products')
        .select(`
          id, title, slug, description, short_description, base_price, compare_at_price, status, is_active, badge, is_featured, vendor_id, metadata, created_at,
          category:categories(id, name),
          brand:brands!products_brand_id_fkey(id, name),
          vendor:vendors(id, store_name),
          images:product_images(id, url, is_primary, sort_order),
          variants:product_variants(id, sku, inventory_count)
        `, { count: 'exact' });

      if (debouncedSearch.trim()) {
        const q = debouncedSearch.trim();
        query = query.ilike('title', `%${q}%`);
      }
      if (filterCategory) query = query.eq('category_id', filterCategory);
      if (filterBrand) query = query.eq('brand_id', filterBrand);

      if (filterVendor && filterVendor !== 'all') {
        if (filterVendor === 'platform') {
          query = query.is('vendor_id', null);
        } else {
          query = query.eq('vendor_id', filterVendor);
        }
      }

      query = query.order(sortField || 'created_at', { ascending: sortOrder === 'asc' });

      if (itemsPerPage !== 'Todos') {
        const from = (currentPage - 1) * pageSizeNum;
        const to = from + pageSizeNum - 1;
        query = query.range(from, to);
      }

      const { data, count, error } = await query;

      // Ignore response if a newer search request was initiated
      if (currentReqId !== lastRequestId.current) return;

      if (error) {
        console.error('[ADMIN_PRODUCTS_SEARCH ERROR]', error);
        toast.error('Error al cargar productos: ' + error.message);
        setProducts([]);
        setTotalProductsCount(0);
      } else {
        setTotalProductsCount(count || 0);
        setProducts((data as any[]) || []);
      }
    } catch (err: any) {
      if (currentReqId === lastRequestId.current) {
        console.error('[ADMIN_PRODUCTS_FETCH_EXCEPTION]', err);
        toast.error('Error inesperado al consultar catálogo.');
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
    const [{ data: cats }, { data: brs }, { data: tgs }, { data: vds }, { data: lcs }] = await Promise.all([
      supabase.from('categories').select('id, name, slug, parent_id').order('sort_order'),
      supabase.from('brands').select('id, name').order('sort_order'),
      supabase.from('tags').select('id, name').order('name'),
      supabase.from('vendors').select('id, store_name, company_name').order('store_name'),
      supabase.from('licenses').select('id, name').eq('is_active', true).order('name')
    ]);
    setCategories(cats || []);
    setBrands(brs || []);
    setTags(tgs || []);
    setVendors(vds || []);
    setLicenses(lcs || []);
  }

  function openCreate() {
    setEditing(null);
    setForm({ 
      title: '', slug: '', description: '', short_description: '', base_price: '', compare_at_price: '', sku: `${Date.now()}`, stock: '10', status: 'published', badge: '', is_featured: false, is_active: true, category_id: '', brand_id: '', license_id: '', vendor_id: 'platform', condition: '', condition_notes: '', image_url: '', video_url: '', 
      weight_kg: '',
      dimensions_length: '',
      dimensions_width: '',
      dimensions_height: '',
      mbe_packaging_type: '',
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
    const existingPkg = sanitizeMbePackagingType((product as any).metadata?.packaging_type || (product as any).metadata?.mbe_service_type) || '';
    const weightVal = (product as any).weight_kg !== null && (product as any).weight_kg !== undefined ? String((product as any).weight_kg) : '';
    const dimLen = (product as any).dimensions?.length ?? (product as any).dimensions?.l ?? '';
    const dimWid = (product as any).dimensions?.width ?? (product as any).dimensions?.w ?? '';
    const dimHei = (product as any).dimensions?.height ?? (product as any).dimensions?.h ?? '';

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
      license_id: (product as any).license_id || (product as any).product_licenses?.[0]?.license_id || (product as any).product_licenses?.[0]?.license?.id || '',
      vendor_id: product.vendor_id || 'platform',
      condition: (product as any).condition || '',
      condition_notes: (product as any).condition_notes || '',
      image_url: product.images?.[0]?.url || '', 
      video_url: '',
      weight_kg: weightVal,
      dimensions_length: dimLen !== '' ? String(dimLen) : '',
      dimensions_width: dimWid !== '' ? String(dimWid) : '',
      dimensions_height: dimHei !== '' ? String(dimHei) : '',
      mbe_packaging_type: existingPkg,
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

  async function handleSave(options?: { allowDuplicateOverride?: boolean }) {
    let createdProductId: string | null = null;
    setValidationErrors([]);
    try {
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
          vendor_id: form.vendor_id === 'platform' ? null : form.vendor_id
        },
        userRole: 'admin',
        storeType: 'standard',
        targetStatus: form.status as 'published' | 'draft' | 'archived',
        brandsList: brands
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

      // Pre-publication Image Check
      if (form.status === 'published' && form.is_active) {
        const imgEval = evaluateProductImageQuality({
          images: form.image_url ? [{ url: form.image_url, is_primary: true }] : form.gallery,
          metadata: { image_url: form.image_url },
          is_active: form.is_active,
          status: form.status,
          base_price: form.base_price
        });

        if (imgEval.status === 'MISSING' || imgEval.status === 'BROKEN' || imgEval.status === 'PLACEHOLDER') {
          toast.warning(`Advertencia de Merchant Center: El producto se publicará en Collectibles, pero NO estará habilitado para Google Merchant (Estado Imagen: ${imgEval.status}).`);
        }
      }

      // 2. Check Duplicates when Publishing (Admin Warning + Override Modal)
      if (form.status === 'published' && !options?.allowDuplicateOverride) {
        const { data: dupData } = await supabase.rpc('check_duplicate_product', {
          p_title: form.title,
          p_brand_id: form.brands[0] || null,
          p_sku: form.sku || null,
          p_gtin: null,
          p_asin: null
        });

        if (dupData && dupData.length > 0) {
          const otherDup = dupData.find((d: any) => d.matched_product_id !== editing?.id && d.similarity_score >= 0.95);
          if (otherDup) {
            const { data: candidateProd } = await supabase
              .from('products')
              .select('id, title, vendor_id, vendor_store:vendor_stores(store_name), variants:product_variants(sku)')
              .eq('id', otherDup.matched_product_id)
              .maybeSingle();

            const vendorName = (candidateProd as any)?.vendor_store?.store_name || (candidateProd?.vendor_id ? 'Vendedor Marketplace' : 'Collectibles.uy');
            const candidateSku = (candidateProd as any)?.variants?.[0]?.sku || form.sku || 'N/A';

            setDuplicateWarning({
              matched_product_id: otherDup.matched_product_id,
              similarity_score: otherDup.similarity_score,
              match_type: otherDup.match_type,
              title: candidateProd?.title || form.title,
              vendor_name: vendorName,
              sku: candidateSku
            });
            setShowDuplicateModal(true);
            return;
          }
        }
      }

      const slug = await generateUniqueSlug(form.title, editing?.id);
      const targetVendorId = form.vendor_id === 'platform' ? null : form.vendor_id;

      const currentMetadata = (editing as any)?.metadata || {};
      const selectedCatId = form.categories[0] || form.category_id;
      const isCardCategory = isSportsCardCategory(selectedCatId, categories) || isTCGCategory(selectedCatId, categories);

      // Server-side validation rule 21: Reject invalid arbitrary strings
      if (!isValidMbePackagingType(form.mbe_packaging_type)) {
        toast.error('Tipo de packaging MBE inválido.');
        return;
      }

      const weightParsed = form.weight_kg !== '' && form.weight_kg !== null && form.weight_kg !== undefined ? parseFloat(String(form.weight_kg)) : null;

      let dimensionsParsed: any = null;
      const dimL = parseFloat(String(form.dimensions_length || 0));
      const dimW = parseFloat(String(form.dimensions_width || 0));
      const dimH = parseFloat(String(form.dimensions_height || 0));
      if (dimL > 0 && dimW > 0 && dimH > 0) {
        dimensionsParsed = { length: dimL, width: dimW, height: dimH };
      }

      const mergedMeta = mergeMbePackagingType(currentMetadata, form.mbe_packaging_type);
      if (isCardCategory) {
        mergedMeta.card_details = form.card_details;
      }

      const payload: any = {
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
        brand_id: form.brands[0] || null,
        category_id: form.categories[0] || null,
        license_id: form.license_id || null,
        vendor_id: targetVendorId,
        condition: normalizedCondition,
        condition_notes: normalizedNotes,
        weight_kg: weightParsed,
        dimensions: dimensionsParsed,
        metadata: mergedMeta
      };

      console.log('[ADMIN_PRODUCTS_SAVE_PAYLOAD]', payload);

      let productId = editing?.id;
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
        const initialPayload = { 
          ...payload, 
          status: 'draft', 
          metadata: { ...payload.metadata, image_url: form.image_url || null } 
        };
        const { data: newProd, error: insertError } = await supabase.from('products').insert(initialPayload).select().single();
        if (insertError) throw insertError;
        productId = newProd.id;
        createdProductId = newProd.id;
      }

      if (!productId) return;



      // 📦 Media 📦
      await supabase.from('product_images').delete().eq('product_id', productId);
      const imagesPayload = [];
      if (form.image_url) imagesPayload.push({ product_id: productId, url: form.image_url, is_primary: true, sort_order: 0 });
      form.gallery.forEach((g, i) => imagesPayload.push({ product_id: productId, url: g.url, is_primary: false, sort_order: i + 1 }));
      if (imagesPayload.length > 0) {
        const { error: insImgErr } = await supabase.from('product_images').insert(imagesPayload);
        if (insImgErr) throw insImgErr;
      }

      // 📦 Variants 📦
      const skuVal = form.sku?.trim() || null;
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

      // 📜 Audit Trail: Record Admin Duplicate Override decision if applicable 📜
      if (options?.allowDuplicateOverride && duplicateWarning?.matched_product_id && productId) {
        try {
          const auditPayload: any = {
            product_id: productId,
            related_product_id: duplicateWarning.matched_product_id,
            action_type: 'ignorado',
            details: `Admin override autorizó creación con similitud ${Math.round(duplicateWarning.similarity_score * 100)}% contra candidato ${duplicateWarning.matched_product_id}`
          };
          const { data: { session } } = await supabase.auth.getSession();
          const currentUserId = session?.user?.id;
          if (currentUserId) {
            auditPayload.admin_id = currentUserId;
          }
          await supabase.from('product_duplicate_history').insert(auditPayload);
        } catch (auditErr) {
          console.warn('[product_duplicate_history audit error]', auditErr);
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

      setShowDuplicateModal(false);
      setDuplicateWarning(null);
      setShowForm(false);
      fetchProducts();
      fetchMeta();
      toast.success(editing ? 'Producto actualizado' : (targetStatus === 'published' ? 'Producto creado y publicado' : 'Producto guardado en borrador'));
    } catch (err: any) {
      console.error('[AdminProducts handleSave Runtime Error]', err);
      console.trace(err);
      const userMessage = mapDatabaseErrorToUserMessage(err);

      if (createdProductId && !editing) {
        // Product was successfully inserted as Draft in Step 1. Preserve it so user work is not lost!
        fetchProducts();
        fetchMeta();
        setShowDuplicateModal(false);
        setDuplicateWarning(null);
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
      toast.success('Categoría creada');
    } catch (err: any) { toast.error(err.message); }
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
      toast.success('Marca creada');
    } catch (err: any) { toast.error(err.message); }
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
      // Fetch products properties to validate
      const { data: prodsToPub } = await supabase
        .from('products')
        .select('*, product_variants(sku, inventory_count), product_images(url)')
        .in('id', selectedProducts);

      if (prodsToPub) {
        for (const p of prodsToPub) {
          const errors = [];
          if (!p.category_id) errors.push("Falta categoría");
          if (!p.brand_id) errors.push("Falta marca");
          if (Number(p.base_price) <= 0) errors.push("Precio inválido");
          
          const skuVal = p.product_variants?.[0]?.sku;
          const stockVal = p.product_variants?.[0]?.inventory_count;
          if (stockVal === undefined || stockVal < 0) errors.push("Stock inválido");
          
          const primaryImage = p.product_images?.find((img: any) => img.is_primary)?.url || p.product_images?.[0]?.url;
          if (!primaryImage) errors.push("Imágenes suficientes");

          // Duplicate check
          const { data: dupData } = await supabase.rpc('check_duplicate_product', {
            p_title: p.title,
            p_brand_id: p.brand_id,
            p_sku: skuVal || null,
            p_gtin: null,
            p_asin: null
          });

          if (dupData && dupData.length > 0) {
            const otherDup = dupData.find((d: any) => d.matched_product_id !== p.id && d.similarity_score >= 0.95);
            if (otherDup) {
              errors.push("Conflicto de duplicado");
            }
          }

          if (errors.length > 0) {
            toast.error(`Producto "${p.title}" no cumple reglas de publicación: ${errors.join(', ')}`);
            return;
          }
        }
      }

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

  const handleDelete = async (product: Product) => {
    const vendorName = product.vendor?.store_name || product.vendor?.company_name;
    const confirmMsg = product.vendor_id && vendorName
      ? `¿Eliminar el producto "${product.title}" vendido por ${vendorName}? Esta acción no se puede deshacer.`
      : `¿Eliminar el producto "${product.title}" permanentemente? Esta acción no se puede deshacer.`;

    if (!(await confirm(confirmMsg, { danger: true }))) return;
    try {
       await supabase.from('products').delete().eq('id', product.id);
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

      const payload: any = {
        title: newTitle,
        slug: newSlug,
        description: product.description,
        short_description: product.short_description,
        base_price: product.base_price,
        compare_at_price: product.compare_at_price,
        status: 'draft', // Set to draft so they can review/edit
        is_active: product.is_active !== false,
        badge: product.badge,
        is_featured: product.is_featured,
        brand_id: product.brand?.id || product.brand_id || null,
        category_id: product.category?.id || product.category_id || null,
        vendor_id: product.vendor_id || null,
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
        const isComplete = Boolean(p.base_price && p.base_price > 0 && categoryId && brandId && p.image_url);
        const targetStatus = isComplete ? 'published' : 'draft';

        // Insert Product initially as Draft to safely establish FK relations
        const { data: newProd, error: prodErr } = await supabase
          .from('products')
          .insert({
            title: p.title.trim(),
            slug: uniqueSlug,
            description: p.description || null,
            base_price: p.base_price || null,
            compare_at_price: p.compare_at_price || null,
            status: 'draft',
            is_active: true,
            category_id: categoryId,
            brand_id: brandId,
            condition: normalizeCondition(p.condition),
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
          await supabase.from('product_categories').upsert(
            { product_id: productId, category_id: categoryId },
            { onConflict: 'product_id,category_id', ignoreDuplicates: true }
          );
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
        const cleanInputSku = p.sku?.trim();
        const skuVal = (cleanInputSku && cleanInputSku.length > 0) ? cleanInputSku : null;
        const stockVal = p.stock !== undefined && p.stock !== null && !isNaN(Number(p.stock)) ? Math.max(0, parseInt(String(p.stock), 10)) : 0;

        await supabase.from('product_variants').insert({
          product_id: productId,
          sku: skuVal,
          name: 'Standard',
          inventory_count: stockVal
        });

        // Final Server-Side Validation & Status Update
        if (targetStatus === 'published') {
          const { error: pubErr } = await supabase
            .from('products')
            .update({ status: 'published' })
            .eq('id', productId);
          
          if (pubErr) {
            console.warn(`Product "${p.title}" could not be published automatically, kept as draft:`, pubErr.message);
          }
        }
      }

      toast.success(`¡Se importaron ${docs.length} productos correctamente!`);
      setShowImport(false);
      fetchProducts();
      fetchMeta();
    } catch (err: any) {
      console.error("Bulk import failed:", err);
      toast.error(`Error en la importación: ${mapDatabaseErrorToUserMessage(err)}`);
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
        case 'vendor':
          valA = a.vendor?.store_name || a.vendor?.company_name || (a.vendor_id ? 'Vendor' : 'Collectibles');
          valB = b.vendor?.store_name || b.vendor?.company_name || (b.vendor_id ? 'Vendor' : 'Collectibles');
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

  const handleConfirmBulkMbeUpdate = async () => {
    if (selectedProducts.length === 0) return;
    setBulkUpdatingMbe(true);
    try {
      if (!isValidMbePackagingType(targetBulkMbeType)) {
        toast.error('Tipo de packaging MBE no válido');
        setBulkMbeModalOpen(false);
        return;
      }

      const { data: existingProds, error: fetchErr } = await supabase
        .from('products')
        .select('id, metadata')
        .in('id', selectedProducts);

      if (fetchErr) throw fetchErr;

      for (const prod of existingProds || []) {
        const mergedMeta = mergeMbePackagingType(prod.metadata, targetBulkMbeType);
        const { error: updErr } = await supabase
          .from('products')
          .update({ metadata: mergedMeta })
          .eq('id', prod.id);

        if (updErr) {
          console.error(`Error updating MBE packaging for product ${prod.id}:`, updErr);
        }
      }

      toast.success(`Se actualizó la clasificación MBE en ${selectedProducts.length} productos.`);
      setSelectedProducts([]);
      setBulkMbeModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      console.error('[Bulk MBE Update Error]', err);
      toast.error(`Error al actualizar masivamente MBE: ${err.message}`);
    } finally {
      setBulkUpdatingMbe(false);
    }
  };

  const evaluateProductImageQuality = (product: any) => {
    const images = product.images;
    let candidateUrl: string | null = null;

    if (Array.isArray(images) && images.length > 0) {
      const primary = images.find((img: any) => img.is_primary);
      candidateUrl = primary?.url || images[0]?.url || null;
    } else if (product.mockup_file_url) {
      candidateUrl = product.mockup_file_url;
    } else if (product.print_file_url) {
      candidateUrl = product.print_file_url;
    } else if (product.metadata?.image_url || product.metadata?.image || product.metadata?.images?.[0]) {
      candidateUrl = product.metadata.image_url || product.metadata.image || product.metadata.images?.[0];
    }

    if (!candidateUrl || !String(candidateUrl).trim()) {
      return { status: 'MISSING', merchantUsable: false, merchantReady: false };
    }

    const lower = String(candidateUrl).toLowerCase();
    if (
      lower.includes('isologocolle.jpg') ||
      lower.includes('via.placeholder.com') ||
      lower.includes('placeholder') ||
      lower.includes('no-image') ||
      lower.includes('noimage') ||
      lower.includes('data:image/svg')
    ) {
      return { status: 'PLACEHOLDER', merchantUsable: false, merchantReady: false };
    }

    const merchantUsable = true;
    const merchantReady = Boolean(product.is_active) && product.status === 'published' && merchantUsable && Number(product.base_price || 0) > 0;

    return { status: 'VALID', merchantUsable, merchantReady };
  };

  const handleRevalidateImages = async (scope: 'all' | 'published' | 'inactive' = 'all') => {
    toast.info(`Revalidando calidad de imágenes (${scope === 'all' ? 'Todo el catálogo' : scope})...`);
    let validCount = 0;
    let issueCount = 0;
    
    products.forEach((p: any) => {
      if (scope === 'published' && (p.status !== 'published' || !p.is_active)) return;
      if (scope === 'inactive' && p.is_active !== false) return;
      const res = evaluateProductImageQuality(p);
      if (res.status === 'VALID') validCount++;
      else issueCount++;
    });

    toast.success(`Revalidación completada: ${validCount} imágenes válidas, ${issueCount} observaciones.`);
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      // MBE filter
      if (filterMbe === 'mbe_pak') {
        if (sanitizeMbePackagingType(p.metadata?.packaging_type || p.metadata?.mbe_service_type) !== 'mbe_pak') return false;
      } else if (filterMbe === 'mbe_caja') {
        if (sanitizeMbePackagingType(p.metadata?.packaging_type || p.metadata?.mbe_service_type) !== 'mbe_caja') return false;
      } else if (filterMbe === 'unclassified') {
        if (sanitizeMbePackagingType(p.metadata?.packaging_type || p.metadata?.mbe_service_type) !== null) return false;
      }

      // Argentina status filter
      if (filterArgentina) {
        const arStatus = calculateArgentinaShippingStatus(p);
        if (filterArgentina === 'auto' && !arStatus.isEligible) return false;
        if (filterArgentina === 'quote' && arStatus.isEligible) return false;
      }

      // Commercial status filter
      if (filterCommercialStatus === 'published') {
        if (p.status !== 'published' || !p.is_active) return false;
      } else if (filterCommercialStatus === 'draft') {
        if (p.status !== 'draft') return false;
      } else if (filterCommercialStatus === 'inactive') {
        if (p.is_active !== false) return false;
      }

      // Image status filter
      if (filterImageStatus) {
        const evalRes = evaluateProductImageQuality(p);
        if (filterImageStatus === 'valid' && evalRes.status !== 'VALID') return false;
        if (filterImageStatus === 'missing' && evalRes.status !== 'MISSING') return false;
        if (filterImageStatus === 'broken' && evalRes.status !== 'BROKEN') return false;
        if (filterImageStatus === 'placeholder' && evalRes.status !== 'PLACEHOLDER') return false;
        if (filterImageStatus === 'merchant_ready' && !evalRes.merchantReady) return false;
        if (filterImageStatus === 'not_merchant_ready' && evalRes.merchantReady) return false;
        if (filterImageStatus === 'manual_action_required' && (evalRes.status === 'VALID')) return false;
      }

      return true;
    });
  }, [products, filterMbe, filterArgentina, filterCommercialStatus, filterImageStatus]);

  const unclassifiedMbeCount = useMemo(() => {
    return products.filter((p: any) => !sanitizeMbePackagingType(p.metadata?.packaging_type || p.metadata?.mbe_service_type)).length;
  }, [products]);

  const addToGallery = (url: string) => setForm({ ...form, gallery: [...form.gallery, { url }] });
  const removeFromGallery = (idx: number) => setForm({ ...form, gallery: form.gallery.filter((_, i) => i !== idx) });
  const maxPages = Math.max(1, Math.ceil(totalProductsCount / (typeof itemsPerPage === 'number' ? itemsPerPage : 50)));

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <div className="flex items-center gap-2">
             <h2 className="text-xl sm:text-2xl font-black text-dark-900">Productos</h2>
             {!loading && (
               <span className="bg-gray-100 border border-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                 {totalProductsCount}
               </span>
             )}
          </div>

          <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-2xs">
            <label className="flex items-center gap-1.5 cursor-pointer group text-xs font-bold text-gray-600">
              <input 
                type="checkbox" 
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" 
                checked={products.length > 0 && products.every(p => selectedProducts.includes(p.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    const uniqueIds = Array.from(new Set([...selectedProducts, ...products.map((p: any) => p.id)]));
                    setSelectedProducts(uniqueIds);
                  } else {
                    const currentIds = products.map((p: any) => p.id);
                    setSelectedProducts(selectedProducts.filter(id => !currentIds.includes(id)));
                  }
                }}
              />
              <span>Seleccionar</span>
              {selectedProducts.length > 0 && <span className="text-blue-600 font-extrabold">({selectedProducts.length})</span>}
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleRevalidateImages('all')}
            className="bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer min-h-[44px]"
            title="Inspeccionar y revalidar imágenes de todo el catálogo sin modificar productos"
          >
            <ImageIcon className="w-4 h-4 text-purple-600" /> Revalidar Imágenes
          </button>
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer min-h-[44px]"
          >
            <Download className="w-4 h-4 text-emerald-600" /> Exportar
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer min-h-[44px]"
          >
            <Upload className="w-4 h-4 text-blue-600" /> Importar
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="bg-[#f00856] hover:bg-[#ff2c68] text-white font-bold px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm cursor-pointer min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> Añadir
          </button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs min-h-[calc(100vh-160px)] flex flex-col overflow-hidden">
         <div className="p-3 sm:p-4 border-b bg-gray-50/50 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            {/* Search Input - Full Width on Mobile */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar productos por título, marca, SKU..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 bg-white" />
            </div>

            {/* Controls Row on Mobile */}
            <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
               <button
                 type="button"
                 onClick={() => setFilterDrawerOpen(true)}
                 className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 shadow-2xs min-h-[44px]"
               >
                 <span>Filtros</span>
                 {(filterCategory || filterBrand || (filterVendor && filterVendor !== 'all') || filterMbe || filterArgentina || filterCommercialStatus || filterImageStatus) && (
                   <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                 )}
               </button>

               {/* Desktop Only Inline Selects */}
               <div className="hidden md:flex gap-2 text-xs font-bold text-gray-500 flex-wrap items-center">
                  <select className="border-gray-200 border rounded-lg px-2 py-1.5 text-xs outline-none bg-white font-bold text-slate-700" value={filterCommercialStatus} onChange={e => { setFilterCommercialStatus(e.target.value); setCurrentPage(1); }}>
                    <option value="">Estado: Todos</option>
                    <option value="published">Publicados</option>
                    <option value="draft">Borradores</option>
                    <option value="inactive">Inactivos</option>
                  </select>
                  <select className="border-gray-200 border rounded-lg px-2 py-1.5 text-xs outline-none bg-white font-bold text-slate-700" value={filterImageStatus} onChange={e => { setFilterImageStatus(e.target.value); setCurrentPage(1); }}>
                    <option value="">Imagen: Todas</option>
                    <option value="valid">Imagen Válida</option>
                    <option value="missing">Sin Imagen</option>
                    <option value="broken">Imagen Rota</option>
                    <option value="placeholder">Placeholder / Logo</option>
                    <option value="merchant_ready">Merchant Ready</option>
                    <option value="not_merchant_ready">No Merchant Ready</option>
                    <option value="manual_action_required">⚠️ Requiere Acción Manual</option>
                  </select>
                  <select className="border-gray-200 border rounded-lg px-2 py-1.5 text-xs outline-none bg-white" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setCurrentPage(1); }}>
                    <option value="">Todas las categorías</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="border-gray-200 border rounded-lg px-2 py-1.5 text-xs outline-none bg-white" value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setCurrentPage(1); }}>
                    <option value="">Todas las marcas</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <select className="border-gray-200 border rounded-lg px-2 py-1.5 text-xs outline-none bg-white" value={filterVendor} onChange={e => handleVendorFilterChange(e.target.value)}>
                    <option value="all">Todos los vendedores</option>
                    <option value="platform">Solo Collectibles</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.store_name || v.company_name}</option>)}
                  </select>
                  <select className="border-gray-200 border rounded-lg px-2 py-1.5 text-xs outline-none bg-white font-bold text-slate-700" value={filterMbe} onChange={e => { setFilterMbe(e.target.value); setCurrentPage(1); }}>
                    <option value="">MBE: Todos</option>
                    <option value="mbe_pak">MBE PAK</option>
                    <option value="mbe_caja">MBE Caja</option>
                    <option value="unclassified">Sin definir</option>
                  </select>
               </div>
            </div>
         </div>

         {selectedProducts.length > 0 && (
            <div className="bg-blue-50 border-b border-blue-100 p-3 px-6 flex items-center justify-between animate-fade-in">
               <span className="text-xs font-bold text-blue-900">{selectedProducts.length} productos seleccionados</span>
               <div className="flex gap-2 items-center">
                  <select onChange={(e) => { if (e.target.value) { handleBulkUpdate('status', e.target.value); e.target.value = ''; } }} className="bg-white border border-blue-200 text-xs rounded px-2 py-1 font-bold text-gray-700 outline-none">
                     <option value="">Cambiar Estado...</option>
                     <option value="published">Visible (Publicado)</option>
                     <option value="draft">Borrador</option>
                     <option value="archived">Archivado</option>
                  </select>
                  <select onChange={(e) => { if (e.target.value) { handleBulkUpdate('category_id', e.target.value); e.target.value = ''; } }} className="bg-white border border-blue-200 text-xs rounded px-2 py-1 font-bold text-gray-700 outline-none">
                     <option value="">Cambiar Categoría...</option>
                     {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        if (e.target.value === 'mbe_pak') setTargetBulkMbeType('mbe_pak');
                        else if (e.target.value === 'mbe_caja') setTargetBulkMbeType('mbe_caja');
                        else if (e.target.value === 'mbe_none') setTargetBulkMbeType(null);
                        setBulkMbeModalOpen(true);
                        e.target.value = '';
                      }
                    }}
                    className="bg-white border border-blue-200 text-xs rounded px-2 py-1 font-bold text-gray-700 outline-none"
                  >
                     <option value="">Asignar MBE...</option>
                     <option value="mbe_pak">MBE PAK</option>
                     <option value="mbe_caja">MBE Caja</option>
                     <option value="mbe_none">Quitar clasificación MBE</option>
                  </select>
                  <button onClick={() => handleBulkDelete()} className="btn-danger text-xs px-3 py-1 flex items-center gap-1">
                     <Trash2 className="w-3.5 h-3.5" /> Eliminar seleccionados
                  </button>
               </div>
            </div>
         )}
         <div className="flex-1 overflow-auto">
             <ResponsiveDataList
               items={filteredProducts}
               keyExtractor={(p: any) => p.id}
               loading={loading}
               emptyTitle="0 PRODUCTOS ENCONTRADOS"
               emptyDescription="No se encontraron productos con los filtros seleccionados."
               renderCard={(p: any) => {
                 const isSelected = selectedProducts.includes(p.id);
                 const stock = p.variants?.[0]?.inventory_count || 0;
                 const sku = p.variants?.[0]?.sku;

                 return (
                   <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2 shadow-2xs min-w-0">
                     <div className="flex items-center justify-between gap-2">
                       <div className="flex items-center gap-2.5 min-w-0 flex-1">
                         <input 
                           type="checkbox" 
                           className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0" 
                           checked={isSelected}
                           onChange={(e) => {
                             if (e.target.checked) setSelectedProducts([...selectedProducts, p.id]);
                             else setSelectedProducts(selectedProducts.filter(id => id !== p.id));
                           }}
                         />
                         <img src={getProductImage(p)} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0" />
                         <div className="min-w-0 flex-1">
                           <h4 className="font-bold text-gray-900 text-xs truncate">{p.title}</h4>
                           {sku && <span className="text-[10px] font-mono text-gray-400 block truncate">SKU: {sku}</span>}
                         </div>
                       </div>

                       <BackofficeStatusBadge
                         status={p.status}
                         label={p.status === 'published' ? 'Visible' : 'Oculto'}
                         type={p.status === 'published' ? 'success' : 'neutral'}
                       />
                     </div>

                     <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                       <div className="flex items-center gap-2 text-xs">
                         <span className="font-black text-gray-900">${(p.base_price || 0).toLocaleString()}</span>
                         <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stock > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
                           Stock: {stock}
                         </span>
                       </div>

                       <div className="flex items-center gap-1.5">
                         <button
                           onClick={() => openEdit(p)}
                           className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold rounded-lg text-xs transition-colors min-h-[36px]"
                         >
                           Editar
                         </button>
                         <BackofficeActionMenu
                           items={[
                             { label: 'Duplicar', icon: Copy, onClick: () => handleDuplicate(p) },
                             { label: 'Eliminar', icon: Trash2, onClick: () => handleDelete(p), danger: true },
                           ]}
                         />
                       </div>
                     </div>
                   </div>
                 );
               }}
               renderTableHeader={() => (
                 <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                   <th className="px-6 py-4 w-12">
                     <input 
                       type="checkbox" 
                       className="rounded border-gray-300" 
                       checked={products.length > 0 && products.every(p => selectedProducts.includes(p.id))}
                       onChange={(e) => {
                         if (e.target.checked) setSelectedProducts(products.map((p: any) => p.id));
                         else setSelectedProducts([]);
                       }}
                     />
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
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('vendor')}>
                     Vendedor {sortField === 'vendor' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('stock')}>
                     Stock {sortField === 'stock' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-4 py-4">MBE</th>
                   <th className="px-4 py-4">Argentina</th>
                   <th className="px-4 py-4">Estado Imagen</th>
                   <th className="px-4 py-4">Merchant</th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('is_active')}>
                     Visible {sortField === 'is_active' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('status')}>
                     Estado {sortField === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-6 py-4">Condition</th>
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
                       <span>UYU {(p.base_price || 0).toLocaleString()}</span>
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
                   <td className="px-6 py-4 text-xs font-bold text-gray-500 cursor-pointer hover:bg-white transition-colors rounded" onDoubleClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'brand_id'}); setInlineValue(p.brand?.id || ''); }}>
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
                   <td className="px-6 py-4 whitespace-nowrap">
                     {p.vendor_id ? (
                       <span 
                         className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200"
                         title={`Producto vendido por ${p.vendor?.store_name || p.vendor?.company_name || 'Vendor'}`}
                       >
                         {p.vendor?.store_name || p.vendor?.company_name || 'Vendor Marketplace'}
                       </span>
                     ) : (
                       <span 
                         className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-100"
                         title="Producto propio de Collectibles"
                       >
                         COLLECTIBLES
                       </span>
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
                   <td className="px-4 py-4 whitespace-nowrap">
                     {(() => {
                       const pkg = sanitizeMbePackagingType(p.metadata?.packaging_type || p.metadata?.mbe_service_type);
                       if (pkg === 'mbe_pak') {
                         return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-sky-800 bg-sky-100 border border-sky-200">PAK</span>;
                       }
                       if (pkg === 'mbe_caja') {
                         return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-purple-800 bg-purple-100 border border-purple-200">CAJA</span>;
                       }
                       return <span className="px-2 py-0.5 rounded text-[10px] font-bold text-gray-400 bg-gray-100 border border-gray-200">Sin definir</span>;
                     })()}
                   </td>
                   <td className="px-4 py-4 whitespace-nowrap">
                     {(() => {
                       const arStatus = calculateArgentinaShippingStatus(p);
                       if (arStatus.isEligible) {
                         return (
                           <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black text-emerald-800 bg-emerald-100 border border-emerald-200" title="Envío automático a Argentina disponible">
                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                             Auto (AR)
                           </span>
                         );
                       }
                       return (
                         <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200" title={arStatus.reason || 'Requiere cotización manual'}>
                           <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                           Cotización (AR)
                         </span>
                       );
                     })()}
                   </td>
                   <td className="px-4 py-4 whitespace-nowrap">
                      {(() => {
                        const imgEval = evaluateProductImageQuality(p);
                        if (imgEval.status === 'VALID') {
                          return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-200">VALID</span>;
                        }
                        if (imgEval.status === 'MISSING') {
                          return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-red-800 bg-red-100 border border-red-200">MISSING</span>;
                        }
                        if (imgEval.status === 'BROKEN') {
                          return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-red-800 bg-red-100 border border-red-200">BROKEN</span>;
                        }
                        if (imgEval.status === 'PLACEHOLDER') {
                          return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-200">PLACEHOLDER</span>;
                        }
                        if (imgEval.status === 'TOO SMALL') {
                          return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-yellow-800 bg-yellow-100 border border-yellow-200">TOO SMALL</span>;
                        }
                        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-purple-800 bg-purple-100 border border-purple-200">REVIEW</span>;
                      })()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {(() => {
                        const imgEval = evaluateProductImageQuality(p);
                        if (imgEval.merchantReady) {
                          return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-200">READY</span>;
                        }
                        return <span className="px-2 py-0.5 rounded text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200">NO READY</span>;
                      })()}
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
                   <td className="px-6 py-4 text-xs font-bold text-gray-700 whitespace-nowrap">
                      {p.condition ? (
                        <span className="px-2 py-1 rounded bg-gray-100 border border-gray-200 text-gray-800 font-semibold">
                          {getConditionLabel(p.condition)}
                        </span>
                      ) : (
                        <span className="text-gray-300 font-mono">—</span>
                      )}
                   </td>
                   <td className="px-6 py-4 text-right text-xs font-medium text-gray-400">
                     <div className="flex justify-end gap-3 items-center mb-1">
                       <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="text-blue-500 hover:underline text-xs font-bold">Detalles</button>
                       <button onClick={(e) => handleDuplicate(p, e)} className="text-gray-500 hover:text-blue-600 transition-colors" title="Duplicar producto">
                          <Copy className="w-4 h-4" />
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); handleDelete(p); }} className="text-red-400 hover:text-red-600 transition-colors" title="Eliminar producto">
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
          {itemsPerPage !== 'Todos' && (
             <div className="bg-white border-t px-6 py-3 flex items-center justify-between text-xs text-gray-500">
                <span>Página {currentPage} de {maxPages} ({totalProductsCount} {totalProductsCount === 1 ? 'producto' : 'productos'} en total)</span>
                <div className="flex items-center gap-2">
                  <button disabled={currentPage <= 1 || loading} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Anterior</button>
                  <button disabled={currentPage >= maxPages || loading} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Siguiente</button>
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
                              if (validationErrors.some(err => err.field === 'title')) setValidationErrors(prev => prev.filter(err => err.field !== 'title'));
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
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">SKU</label>
                                <input className="w-full p-2.5 border rounded-lg text-sm bg-gray-50 focus:bg-white outline-none" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} />
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
                       </div>

                       {/* 🃏 CARD DETAILS (ALWAYS ACTIVE FOR ADMIN WHEN CARD CATEGORY IS SELECTED) */}
                       <CardDetailsFormSection
                         categoryId={form.categories[0] || form.category_id}
                         categories={categories}
                         cardDetails={form.card_details}
                         onChange={updated => setForm(prev => ({ ...prev, card_details: updated }))}
                       />

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
                       
                       {/* WIDGET: VENDEDOR / PROPIEDAD */}
                       <SidebarWidget title="Vendedor / Propiedad">
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Vendido por</label>
                             <select 
                               className="w-full border-gray-200 border rounded p-2 text-xs font-bold bg-white outline-none focus:border-blue-500"
                               value={form.vendor_id}
                               onChange={e => setForm({ ...form, vendor_id: e.target.value })}
                             >
                               <option value="platform">Collectibles (Propio)</option>
                               {vendors.map(v => (
                                 <option key={v.id} value={v.id}>{v.store_name || v.company_name || v.id}</option>
                               ))}
                             </select>
                             <p className="text-[10px] text-gray-400 italic">
                               {form.vendor_id === 'platform' 
                                 ? 'Producto gestionado y vendido directamente por Collectibles.' 
                                 : `Producto de la tienda marketplace ${vendors.find(v => v.id === form.vendor_id)?.store_name || 'Vendor'}.`}
                             </p>
                          </div>
                       </SidebarWidget>
                       
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
                                        if (validationErrors.some(err => err.field === 'categories')) setValidationErrors(prev => prev.filter(err => err.field !== 'categories'));
                                      }} className="rounded border-gray-300 text-blue-600" />
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
                       <SidebarWidget title="Marcas (Brands) *">
                          <div className="space-y-3" id="field-brands">
                             {getFieldError('brands') && (
                                <p className="text-xs font-bold text-red-600 flex items-center gap-1.5 p-2 bg-red-50 rounded border border-red-200">
                                   <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                   {getFieldError('brands')}
                                </p>
                             )}
                             <div className={`border rounded-md max-h-48 overflow-y-auto p-2 bg-gray-50/30 ${getFieldError('brands') ? 'border-red-400 ring-1 ring-red-200' : ''}`}>
                                {brands.map(b => (
                                   <label key={b.id} className="flex items-center gap-2 py-1 px-1 hover:bg-white rounded transition-colors cursor-pointer text-xs">
                                      <input type="checkbox" checked={form.brands.includes(b.id)} onChange={() => {
                                        toggleBrand(b.id);
                                        if (validationErrors.some(err => err.field === 'brands')) setValidationErrors(prev => prev.filter(err => err.field !== 'brands'));
                                      }} className="rounded border-gray-300 text-blue-600" />
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

                        {/* WIDGET: LICENCIA / FRANQUICIA */}
                        <SidebarWidget title="Licencia / Franquicia">
                           <div className="space-y-2">
                              <select
                                 value={form.license_id || ''}
                                 onChange={e => setForm({ ...form, license_id: e.target.value })}
                                 className="w-full text-xs p-2 border rounded bg-white outline-none focus:border-blue-500 font-semibold text-gray-800"
                              >
                                 <option value="">-- Sin Licencia (Opcional) --</option>
                                 {licenses.map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                 ))}
                              </select>
                              <p className="text-[10px] text-gray-400">
                                 Indica la franquicia o propiedad intelectual. El Theme deriva automáticamente.
                              </p>
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
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            fetchProducts();
            fetchMeta();
          }}
          userRole="admin"
        />
      )}

      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          initialFilters={{
            search,
            categoryId: filterCategory,
            brandId: filterBrand,
            vendorId: filterVendor,
            mbeType: filterMbe,
            argentinaStatus: filterArgentina,
            status: ''
          }}
          selectedProductIds={selectedProducts}
          userRole="admin"
        />
      )}

      {/* ⚠️ ADMIN DUPLICATE OVERRIDE MODAL ⚠️ */}
      {showDuplicateModal && duplicateWarning && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 text-white shadow-2xl space-y-6">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-3 bg-amber-500/20 rounded-xl">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Posible Duplicado Detectado</h3>
                <p className="text-xs text-slate-400">Similitud del {Math.round(duplicateWarning.similarity_score * 100)}% en el catálogo</p>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 space-y-2 text-sm">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Producto Existente Candidato</div>
              <p className="font-bold text-base text-white">{duplicateWarning.title}</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-2 border-t border-slate-700/50">
                <div><span className="text-slate-500">Vendedor:</span> {duplicateWarning.vendor_name || 'Collectibles.uy'}</div>
                <div><span className="text-slate-500">SKU:</span> {duplicateWarning.sku || 'N/A'}</div>
                <div className="col-span-2 text-slate-500 text-[10px] truncate">ID: {duplicateWarning.matched_product_id}</div>
              </div>
            </div>

            <div className="p-3 bg-slate-800/40 border border-slate-700/40 rounded-lg text-xs text-slate-300">
              ℹ️ <strong>Nota de Administrador:</strong> Puedes ver el producto candidato o forzar la publicación si se trata de una variante, edición especial o nuevo vendedor.
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.open(`/product/${duplicateWarning.matched_product_id}`, '_blank')}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Ver Existente
              </button>
              <button
                type="button"
                onClick={() => { setShowDuplicateModal(false); setDuplicateWarning(null); }}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-xs flex items-center justify-center transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📦 CONFIRMACIÓN DE CAMBIO MASIVO MBE 📦 */}
      {bulkMbeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 text-blue-600">
              <div className="p-3 bg-blue-50 rounded-xl">
                <Truck className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900">Asignar Clasificación MBE</h3>
                <p className="text-xs text-gray-500">Edición masiva de {selectedProducts.length} productos seleccionados</p>
              </div>
            </div>

            <div className="bg-gray-50 border rounded-xl p-4 text-xs space-y-2">
              <p className="text-gray-700 font-medium">
                Vas a asignar <strong>{getMbePackagingLabel(targetBulkMbeType)}</strong> a <strong>{selectedProducts.length}</strong> productos seleccionados.
              </p>
              <p className="text-gray-500 italic">
                Esta acción actualizará exclusivamente el tipo de paquete en la metadata (<code className="bg-gray-200 px-1 py-0.5 rounded text-[10px]">{'metadata.packaging_type'}</code>) conservando intactos el peso, dimensiones, precios, stock e imágenes.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={bulkUpdatingMbe}
                onClick={() => setBulkMbeModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={bulkUpdatingMbe}
                onClick={handleConfirmBulkMbeUpdate}
                className="px-5 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md shadow-blue-200 transition-all flex items-center gap-2"
              >
                {bulkUpdatingMbe && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 📦 FILTER DRAWER MOBILE BOTTOM SHEET 📦 */}
      {filterDrawerOpen && (
        <div className="fixed inset-0 z-[120] flex flex-col justify-end" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setFilterDrawerOpen(false)} />
          <div className="relative z-10 w-full bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] animate-slideUp">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
              <h3 className="font-bold text-gray-900 text-base">Filtros de Productos</h3>
              <button onClick={() => setFilterDrawerOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Categoría</label>
                <select className="w-full border border-gray-200 rounded-xl p-2.5 text-sm bg-white" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                  <option value="">Todas las categorías</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Marca</label>
                <select className="w-full border border-gray-200 rounded-xl p-2.5 text-sm bg-white" value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                  <option value="">Todas las marcas</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Vendedor</label>
                <select className="w-full border border-gray-200 rounded-xl p-2.5 text-sm bg-white" value={filterVendor} onChange={e => handleVendorFilterChange(e.target.value)}>
                  <option value="all">Todos los vendedores</option>
                  <option value="platform">Solo Collectibles</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.store_name || v.company_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Tipo MBE</label>
                <select className="w-full border border-gray-200 rounded-xl p-2.5 text-sm bg-white font-bold" value={filterMbe} onChange={e => setFilterMbe(e.target.value)}>
                  <option value="">MBE: Todos</option>
                  <option value="mbe_pak">MBE PAK</option>
                  <option value="mbe_caja">MBE Caja</option>
                  <option value="unclassified">Sin definir</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Estado Argentina</label>
                <select className="w-full border border-gray-200 rounded-xl p-2.5 text-sm bg-white font-bold" value={filterArgentina} onChange={e => setFilterArgentina(e.target.value)}>
                  <option value="">Estado AR: Todos</option>
                  <option value="auto">Envío automático</option>
                  <option value="quote">Requiere cotización</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center gap-3 sticky bottom-0 z-10">
              <button
                type="button"
                onClick={() => {
                  setFilterCategory('');
                  setFilterBrand('');
                  setFilterVendor('all');
                  setFilterMbe('');
                  setFilterArgentina('');
                  setFilterDrawerOpen(false);
                }}
                className="flex-1 py-3 px-4 bg-white border border-gray-300 rounded-xl font-bold text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-2 min-h-[44px]"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={() => { setCurrentPage(1); setFilterDrawerOpen(false); }}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-2 shadow-sm min-h-[44px]"
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


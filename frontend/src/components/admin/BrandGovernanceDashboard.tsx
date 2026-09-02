import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, Filter, Search, 
  Check, X, Edit3, EyeOff, Sparkles, History, ArrowRight, Building2, Tag, Loader2
} from 'lucide-react';
import { useToast } from './Toast';
import { useConfirmModal } from './ConfirmModal';
import { auditProductUnified } from "../../lib/brandGovernanceAuditEngine";
import type { UnifiedAuditResult, BrandClassification, RecommendedAction } from "../../lib/brandGovernanceAuditEngine";

interface ProductAuditItem {
  id: string;
  title: string;
  vendor_id: string;
  vendor_name: string;
  brand_id: string | null;
  brand_name: string;
  current_license_id?: string | null;
  current_license_name?: string | null;
  status: string;
  ml_item_id?: string;
  category_name?: string;
  is_brand_exception?: boolean;
  needs_brand_review?: boolean;
  auditResult: UnifiedAuditResult;
}

export function BrandGovernanceDashboard() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductAuditItem[]>([]);
  const [dbBrands, setDbBrands] = useState<Array<{ id: string; name: string; slug: string; brand_type?: string; is_vendor_selectable?: boolean }>>([]);
  const [dbLicenses, setDbLicenses] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [brandAliases, setBrandAliases] = useState<Array<{ alias: string; canonical_brand_id: string }>>([]);
  const [licenseAliases, setLicenseAliases] = useState<Array<{ alias: string; canonical_license_id: string }>>([]);
  const [vendors, setVendors] = useState<Array<{ id: string; store_name: string }>>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Filters
  const [classificationFilter, setClassificationFilter] = useState<string>('ALL');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoFixOnly, setAutoFixOnly] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'audit' | 'history' | 'requests'>('audit');
  const [brandRequests, setBrandRequests] = useState<any[]>([]);

  // Edit Drawer Modal State
  const [editingProduct, setEditingProduct] = useState<ProductAuditItem | null>(null);
  const [selectedNewBrandId, setSelectedNewBrandId] = useState<string>('');
  const [selectedNewLicenseId, setSelectedNewLicenseId] = useState<string>('');

  // Auto-Fix Confirmation Modal State
  const [showAutoFixModal, setShowAutoFixModal] = useState(false);
  const [autoFixExecuting, setAutoFixExecuting] = useState(false);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  // Load products, brands, licenses, aliases, vendors, audit logs, and brand requests
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch DB Brands
      const { data: bData, error: bErr } = await supabase
        .from('brands')
        .select('id, name, slug, brand_type, is_vendor_selectable')
        .order('name', { ascending: true });
      if (bErr) throw bErr;
      setDbBrands(bData || []);

      // 2. Fetch DB Licenses
      const { data: lData } = await supabase
        .from('licenses')
        .select('id, name, slug')
        .order('name', { ascending: true });
      setDbLicenses(lData || []);

      // 3. Fetch Aliases
      const [{ data: bAliases }, { data: lAliases }] = await Promise.all([
        supabase.from('brand_aliases').select('alias, canonical_brand_id'),
        supabase.from('license_aliases').select('alias, canonical_license_id')
      ]);
      setBrandAliases(bAliases || []);
      setLicenseAliases(lAliases || []);

      // 4. Fetch Vendors
      const { data: vData } = await supabase
        .from('vendors')
        .select('id, store_name')
        .order('store_name', { ascending: true });
      setVendors(vData || []);

      // Fetch Vendor Brand Requests
      const { data: reqData } = await supabase
        .from('vendor_brand_requests')
        .select('*, vendor:vendors(id, store_name, company_name)')
        .order('created_at', { ascending: false });
      setBrandRequests(reqData || []);

      // 5. Fetch Published Vendor Products (Paginated)
      let allProds: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error: pErr } = await supabase
          .from('products')
          .select(`
            id, title, status, vendor_id, brand_id, ml_item_id, metadata, ml_attributes,
            is_brand_exception, needs_brand_review,
            brand:brands!products_brand_id_fkey(id, name, brand_type),
            vendor:vendors(id, store_name, company_name),
            category:categories(id, name),
            product_licenses(license:licenses(id, name, slug))
          `)
          .not('vendor_id', 'is', null)
          .eq('status', 'published')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (pErr) throw pErr;

        if (batch && batch.length > 0) {
          allProds = allProds.concat(batch);
          page++;
          if (batch.length < pageSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      // Audit products using Unified Engine
      const audited: ProductAuditItem[] = allProds.map(p => {
        const brandName = p.brand?.name || '';
        const vendorName = p.vendor?.store_name || p.vendor?.company_name || 'Vendor Desconocido';
        const categoryName = p.category?.name || 'Sin Categoría';
        const currentLic = p.product_licenses?.[0]?.license;

        const auditRes = auditProductUnified(
          {
            ...p,
            brand_name: brandName
          },
          bData || [],
          lData || [],
          bAliases || [],
          lAliases || []
        );

        return {
          id: p.id,
          title: p.title || '',
          vendor_id: p.vendor_id,
          vendor_name: vendorName,
          brand_id: p.brand_id || p.brand?.id || null,
          brand_name: brandName || 'Sin Marca',
          current_license_id: currentLic?.id || null,
          current_license_name: currentLic?.name || null,
          status: p.status,
          ml_item_id: p.ml_item_id,
          category_name: categoryName,
          is_brand_exception: p.is_brand_exception || false,
          needs_brand_review: p.needs_brand_review || false,
          auditResult: auditRes
        };
      });

      setProducts(audited);

      // Fetch Audit Logs
      const { data: logs } = await supabase
        .from('vendor_brand_audit_logs')
        .select('*, product:products(title)')
        .order('created_at', { ascending: false })
        .limit(100);
      setAuditLogs(logs || []);

    } catch (err: any) {
      toast.error('Error al cargar datos de gobernanza: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered dataset
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Filter by classification
      if (classificationFilter !== 'ALL' && p.auditResult.classification !== classificationFilter) {
        return false;
      }
      // Filter by vendor
      if (vendorFilter !== 'ALL' && p.vendor_id !== vendorFilter) {
        return false;
      }
      // Filter by autofix eligible
      if (autoFixOnly && !p.auditResult.isAutoFixEligible) {
        return false;
      }
      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchBrand = p.brand_name.toLowerCase().includes(q);
        const matchVendor = p.vendor_name.toLowerCase().includes(q);
        const matchSuggBrand = (p.auditResult.suggestedBrandName || '').toLowerCase().includes(q);
        const matchSuggLic = (p.auditResult.suggestedLicenseName || '').toLowerCase().includes(q);
        if (!matchTitle && !matchBrand && !matchVendor && !matchSuggBrand && !matchSuggLic) {
          return false;
        }
      }
      return true;
    });
  }, [products, classificationFilter, vendorFilter, autoFixOnly, searchQuery]);

  // Breakdown for Auto-Fix Modal
  const autoFixSummary = useMemo(() => {
    const eligible = products.filter(p => p.auditResult.isAutoFixEligible);
    let brandOnly = 0;
    let licenseOnly = 0;
    let both = 0;

    eligible.forEach(p => {
      const fixBrand = p.auditResult.suggestedBrandId !== null && p.auditResult.suggestedBrandId !== p.brand_id;
      const fixLic = p.auditResult.suggestedLicenseId !== null && p.auditResult.suggestedLicenseId !== p.current_license_id;

      if (fixBrand && fixLic) both++;
      else if (fixBrand) brandOnly++;
      else if (fixLic) licenseOnly++;
    });

    const skipped = products.length - eligible.length;

    return { total: eligible.length, brandOnly, licenseOnly, both, skipped, eligibleItems: eligible };
  }, [products]);

  // Executive KPI Metrics
  const metrics = useMemo(() => {
    const total = products.length;
    const valid = products.filter(p => p.auditResult.classification === 'VALID_BRAND').length;
    const missing = products.filter(p => p.auditResult.classification === 'MISSING_BRAND').length;
    const generic = products.filter(p => p.auditResult.classification === 'GENERIC_BRAND').length;
    const license = products.filter(p => p.auditResult.classification === 'LICENSE_AS_BRAND').length;
    const ambiguous = products.filter(p => p.auditResult.classification === 'AMBIGUOUS_BRAND').length;
    const autoFixable = products.filter(p => p.auditResult.isAutoFixEligible).length;

    return { total, valid, missing, generic, license, ambiguous, autoFixable };
  }, [products]);

  // Apply single product correction (Brand + License)
  const handleApplyFix = async (productItem: ProductAuditItem, targetBrandId?: string, targetLicenseId?: string) => {
    const finalBrandId = targetBrandId || productItem.auditResult.suggestedBrandId;
    const finalLicenseId = targetLicenseId || productItem.auditResult.suggestedLicenseId;

    if (!finalBrandId && !finalLicenseId) {
      toast.error('No se determinó una marca ni licencia sugerida para aplicar.');
      return;
    }

    setActionLoading(productItem.id);
    try {
      const selectedBrand = dbBrands.find(b => b.id === finalBrandId);
      const selectedLicense = dbLicenses.find(l => l.id === finalLicenseId);

      const updates: any = {
        needs_brand_review: false,
        brand_audit_status: 'VALID_BRAND',
        suggested_brand_id: null,
        suggested_brand_name: null,
        suggested_license_id: null,
        suggested_license_name: null,
        recommended_action: 'KEEP'
      };

      if (finalBrandId) {
        updates.brand_id = finalBrandId;
      }

      // Update Product
      if (finalLicenseId) {
        updates.license_id = finalLicenseId;
      }

      const { error: updErr } = await supabase
        .from('products')
        .update(updates)
        .eq('id', productItem.id);
      if (updErr) throw updErr;

      // Audit Log
      await supabase.from('vendor_brand_audit_logs').insert({
        product_id: productItem.id,
        old_brand_id: productItem.brand_id,
        old_brand_name: productItem.brand_name,
        new_brand_id: finalBrandId || productItem.brand_id,
        new_brand_name: selectedBrand?.name || productItem.brand_name,
        old_licenses: productItem.current_license_name ? [productItem.current_license_name] : [],
        new_licenses: selectedLicense ? [selectedLicense.name] : (productItem.current_license_name ? [productItem.current_license_name] : []),
        reason: productItem.auditResult.reason,
        source: 'admin_dashboard_unified',
        confidence: productItem.auditResult.brandConfidenceScore,
        evidence: productItem.auditResult.evidence
      });

      toast.success(`Producto "${productItem.title.substring(0, 30)}..." actualizado con éxito.`);
      fetchData();
    } catch (err: any) {
      toast.error('Error al aplicar corrección: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Execute Bulk Auto-Fix with Confirmation
  const handleExecuteBulkAutoFix = async () => {
    const eligible = autoFixSummary.eligibleItems;
    if (eligible.length === 0) {
      toast.error('No hay productos elegibles para Auto-Fix de alta confianza.');
      return;
    }

    setAutoFixExecuting(true);
    let successCount = 0;
    try {
      for (const p of eligible) {
        const targetBrandId = p.auditResult.suggestedBrandId || p.brand_id;
        const targetLicenseId = p.auditResult.suggestedLicenseId || p.current_license_id;

        if (!targetBrandId && !targetLicenseId) continue;

        const selectedBrand = dbBrands.find(b => b.id === targetBrandId);
        const selectedLicense = dbLicenses.find(l => l.id === targetLicenseId);

        const updates: any = {
          needs_brand_review: false,
          brand_audit_status: 'VALID_BRAND',
          suggested_brand_id: null,
          suggested_brand_name: null,
          suggested_license_id: null,
          suggested_license_name: null,
          recommended_action: 'KEEP'
        };

        if (targetBrandId) {
          updates.brand_id = targetBrandId;
        }
        if (targetLicenseId) {
          updates.license_id = targetLicenseId;
        }

        await supabase.from('products').update(updates).eq('id', p.id);

        await supabase.from('vendor_brand_audit_logs').insert({
          product_id: p.id,
          old_brand_id: p.brand_id,
          old_brand_name: p.brand_name,
          new_brand_id: targetBrandId || p.brand_id,
          new_brand_name: selectedBrand?.name || p.brand_name,
          old_licenses: p.current_license_name ? [p.current_license_name] : [],
          new_licenses: selectedLicense ? [selectedLicense.name] : [],
          reason: 'Auto-Fix masivo de alta confianza',
          source: 'admin_bulk_autofix',
          confidence: p.auditResult.brandConfidenceScore,
          evidence: p.auditResult.evidence
        });

        successCount++;
      }

      toast.success(`Se aplicó Auto-Fix masivo a ${successCount} productos.`);
      setShowAutoFixModal(false);
      fetchData();
    } catch (err: any) {
      toast.error('Error durante el Auto-Fix masivo: ' + err.message);
    } finally {
      setAutoFixExecuting(false);
    }
  };

  // Toggle Exception Status
  const handleToggleException = async (productItem: ProductAuditItem) => {
    const newStatus = !productItem.is_brand_exception;
    const confirmText = newStatus 
      ? `¿Marcar "${productItem.title.substring(0, 30)}..." como Excepción de Marca Aprobada?`
      : `¿Remover la excepción de marca para "${productItem.title.substring(0, 30)}..."?`;

    if (!(await confirm({ title: 'Excepción de Marca', message: confirmText }))) return;

    setActionLoading(productItem.id);
    try {
      const { error } = await supabase
        .from('products')
        .update({
          is_brand_exception: newStatus,
          needs_brand_review: newStatus ? false : true
        })
        .eq('id', productItem.id);

      if (error) throw error;
      toast.success(newStatus ? 'Excepción activada.' : 'Excepción removida.');
      fetchData();
    } catch (err: any) {
      toast.error('Error al actualizar excepción: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Unpublish Product
  const handleUnpublish = async (productItem: ProductAuditItem) => {
    if (!(await confirm({
      title: 'Despublicar Producto',
      message: `¿Despublicar "${productItem.title.substring(0, 30)}..."? El producto pasará a estado Borrador (draft).`,
      type: 'warning'
    }))) return;

    setActionLoading(productItem.id);
    try {
      const { error } = await supabase
        .from('products')
        .update({ status: 'draft', needs_brand_review: true })
        .eq('id', productItem.id);

      if (error) throw error;
      toast.success('Producto despublicado a Borrador.');
      fetchData();
    } catch (err: any) {
      toast.error('Error al despublicar: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Gobernanza Unificada: Marca + Licencia</h2>
              <p className="text-xs text-slate-400">Auditoría continua, detección de franquicias y corrección del catálogo Vendor</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar Auditoría
          </button>

          <button
            onClick={() => setShowAutoFixModal(true)}
            disabled={loading || metrics.autoFixable === 0}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            Auto-Fix Alta Confianza ({metrics.autoFixable})
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Publicados Auditados</p>
          <p className="text-2xl font-black text-white mt-1">{metrics.total}</p>
          <span className="text-[10px] text-slate-500">100% Catálogo Vendor</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-emerald-950/40">
          <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Marcas Válidas</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{metrics.valid}</p>
          <span className="text-[10px] text-emerald-500/80">Sin inconsistencias</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-red-950/40">
          <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Sin Marca</p>
          <p className="text-2xl font-black text-red-400 mt-1">{metrics.missing}</p>
          <span className="text-[10px] text-red-500/80">brand_id es NULL</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-orange-950/40">
          <p className="text-[11px] font-bold text-orange-400 uppercase tracking-wider">Marca Genérica</p>
          <p className="text-2xl font-black text-orange-400 mt-1">{metrics.generic}</p>
          <span className="text-[10px] text-orange-500/80">Genérica / N/A</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-amber-950/40">
          <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Licencia como Marca</p>
          <p className="text-2xl font-black text-amber-400 mt-1">{metrics.license}</p>
          <span className="text-[10px] text-amber-500/80">Marvel, Disney, etc.</span>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-purple-950/40">
          <p className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">Marca Ambigua</p>
          <p className="text-2xl font-black text-purple-400 mt-1">{metrics.ambiguous}</p>
          <span className="text-[10px] text-purple-500/80">Contradicción en título</span>
        </div>
      </div>

      {/* Filter and View Controls */}
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
          {/* Subtabs */}
          <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'audit'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Auditoría ({filteredProducts.length})
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'requests'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              Solicitudes Vendor ({brandRequests.filter(r => r.status === 'pending').length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Historial ({auditLogs.length})
            </button>
          </div>

          {/* Filters Bar */}
          {activeTab === 'audit' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar producto, marca, tienda..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-48 lg:w-64"
                />
              </div>

              <select
                value={classificationFilter}
                onChange={(e) => setClassificationFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500 font-semibold"
              >
                <option value="ALL">Todas las Clasificaciones</option>
                <option value="MISSING_BRAND">Sin Marca (NULL)</option>
                <option value="GENERIC_BRAND">Marca Genérica</option>
                <option value="LICENSE_AS_BRAND">Licencia como Marca</option>
                <option value="AMBIGUOUS_BRAND">Marca Ambigua</option>
                <option value="UNKNOWN_BRAND">Marca Desconocida</option>
                <option value="VALID_BRAND">Marcas Válidas</option>
              </select>

              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500 font-semibold max-w-[180px] truncate"
              >
                <option value="ALL">Todos los Vendors</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.store_name}</option>
                ))}
              </select>

              <label className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFixOnly}
                  onChange={(e) => setAutoFixOnly(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-900"
                />
                {"Solo Auto-Fixable (>= 95%)"}
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-slate-900/60 p-12 rounded-2xl border border-slate-800 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-300">Ejecutando motor de auditoría unificado sobre el catálogo...</p>
        </div>
      ) : activeTab === 'audit' ? (
        /* Audit Table View */
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 divide-y divide-slate-800">
              <thead className="bg-slate-950 text-slate-400 font-black uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Producto / Vendor</th>
                  <th className="py-3.5 px-4">Marca Actual</th>
                  <th className="py-3.5 px-4">Licencia Actual</th>
                  <th className="py-3.5 px-4">Clasificación & Problema</th>
                  <th className="py-3.5 px-4">Marca Sugerida</th>
                  <th className="py-3.5 px-4">Licencia Sugerida</th>
                  <th className="py-3.5 px-4">Acción Recomendada</th>
                  <th className="py-3.5 px-4 text-right">Acciones Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No se encontraron productos que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(prod => {
                    const isPending = actionLoading === prod.id;
                    const res = prod.auditResult;

                    return (
                      <tr key={prod.id} className="hover:bg-slate-800/40 transition-colors">
                        {/* Producto & Vendor */}
                        <td className="py-3.5 px-4 max-w-xs">
                          <p className="font-bold text-white line-clamp-2">{prod.title}</p>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1 font-medium text-slate-300">
                              <Building2 className="w-3 h-3 text-slate-500" />
                              {prod.vendor_name}
                            </span>
                            {prod.ml_item_id && (
                              <span className="px-1.5 py-0.5 bg-yellow-400/20 text-yellow-300 rounded font-mono text-[9px] font-bold">
                                {prod.ml_item_id}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Marca Actual */}
                        <td className="py-3.5 px-4">
                          <span className={`font-semibold ${prod.brand_name === 'Sin Marca' ? 'text-red-400 italic' : 'text-slate-200'}`}>
                            {prod.brand_name}
                          </span>
                        </td>

                        {/* Licencia Actual */}
                        <td className="py-3.5 px-4">
                          {prod.current_license_name ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              {prod.current_license_name}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* Clasificación & Problema */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              res.classification === 'VALID_BRAND' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              res.classification === 'MISSING_BRAND' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              res.classification === 'GENERIC_BRAND' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                              res.classification === 'LICENSE_AS_BRAND' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            }`}>
                              {res.classification}
                            </span>
                            <p className="text-[11px] text-slate-400 line-clamp-2 max-w-xs">{res.reason}</p>
                          </div>
                        </td>

                        {/* Marca Sugerida */}
                        <td className="py-3.5 px-4">
                          {res.suggestedBrandName ? (
                            <div>
                              <span className="font-bold text-emerald-400 block">{res.suggestedBrandName}</span>
                              <span className="text-[10px] text-slate-400">Confianza: {Math.round(res.brandConfidenceScore * 100)}%</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">No sugerida</span>
                          )}
                        </td>

                        {/* Licencia Sugerida */}
                        <td className="py-3.5 px-4">
                          {res.suggestedLicenseName ? (
                            <div>
                              <span className="font-bold text-amber-400 block">{res.suggestedLicenseName}</span>
                              <span className="text-[10px] text-slate-400">Confianza: {Math.round(res.licenseConfidenceScore * 100)}%</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* Acción Recomendada */}
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-bold block w-fit ${
                            res.recommendedAction === 'AUTO_ASSIGN_BRAND_AND_LICENSE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                            res.recommendedAction === 'AUTO_ASSIGN_BRAND' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' :
                            res.recommendedAction === 'AUTO_ASSIGN_LICENSE' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                            res.recommendedAction === 'REQUIRES_VENDOR_ATTENTION' ? 'bg-red-500/20 text-red-300 border border-red-500/40' :
                            'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {res.recommendedAction}
                          </span>
                        </td>

                        {/* Acciones Admin */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex justify-end gap-1.5 items-center">
                            {/* [Corregir] */}
                            {(res.suggestedBrandId || res.suggestedLicenseId) && res.classification !== 'VALID_BRAND' && (
                              <button
                                onClick={() => handleApplyFix(prod)}
                                disabled={isPending}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold shadow-md transition-all flex items-center gap-1 disabled:opacity-50"
                                title="Aplicar corrección sugerida (Marca + Licencia)"
                              >
                                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Corregir
                              </button>
                            )}

                            {/* [Editar] */}
                            <button
                              onClick={() => {
                                setEditingProduct(prod);
                                setSelectedNewBrandId(prod.auditResult.suggestedBrandId || prod.brand_id || '');
                                setSelectedNewLicenseId(prod.auditResult.suggestedLicenseId || prod.current_license_id || '');
                              }}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-700 transition-all"
                              title="Editar Manualmente"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>

                            {/* [Excepción] */}
                            <button
                              onClick={() => handleToggleException(prod)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                                prod.is_brand_exception
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
                              }`}
                              title={prod.is_brand_exception ? 'Quitar Excepción' : 'Marcar como Excepción Aprobada'}
                            >
                              <Tag className="w-3 h-3 text-amber-400" />
                            </button>

                            {/* [Despublicar] */}
                            <button
                              onClick={() => handleUnpublish(prod)}
                              className="px-2 py-1 bg-red-950/40 hover:bg-red-900/60 text-red-300 rounded-lg text-[11px] font-semibold border border-red-900/50 transition-all"
                              title="Despublicar Producto"
                            >
                              <EyeOff className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'requests' ? (
        /* Brand Requests View */
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Tag className="w-4 h-4 text-indigo-400" />
            Solicitudes de Nueva Marca de Vendors
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-black tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Vendor</th>
                  <th className="py-3 px-4">Marca Solicitada</th>
                  <th className="py-3 px-4">Origen</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4 text-right">Acciones Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {brandRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500">No hay solicitudes registradas.</td>
                  </tr>
                ) : (
                  brandRequests.map(req => (
                    <tr key={req.id} className="hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-bold text-white">
                        {req.vendor?.store_name || req.vendor?.company_name || `Vendor ${req.vendor_id.slice(0, 6)}`}
                      </td>
                      <td className="py-3 px-4 font-bold text-emerald-400">
                        {req.requested_name}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[10px] uppercase">
                        {req.source}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          req.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          req.status === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {req.status === 'pending' && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={async () => {
                                const slugBase = req.requested_name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                                const { data: newBr, error } = await supabase.from('brands').insert({
                                  name: req.requested_name.trim(),
                                  slug: slugBase,
                                  status: 'approved',
                                  is_active: true,
                                  is_public: true,
                                  brand_type: 'manufacturer',
                                  is_vendor_selectable: true
                                }).select().single();
                                if (error) { toast.error('Error al crear marca: ' + error.message); return; }
                                await supabase.from('vendor_brand_requests').update({
                                  status: 'approved',
                                  resolved_brand_id: newBr.id,
                                  resolved_at: new Date().toISOString()
                                }).eq('id', req.id);
                                toast.success(`Marca "${req.requested_name}" aprobada e incorporada al catálogo.`);
                                fetchData();
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px]"
                            >
                              Aprobar y Crear
                            </button>

                            <button
                              onClick={async () => {
                                await supabase.from('vendor_brand_requests').update({
                                  status: 'rejected',
                                  resolved_at: new Date().toISOString()
                                }).eq('id', req.id);
                                toast.info('Solicitud rechazada');
                                fetchData();
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-[10px]"
                            >
                              Rechazar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* History Log View */
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            Historial de Cambios de Marca y Licencia
          </h3>

          <div className="divide-y divide-slate-800">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No hay registros históricos de cambios aún.</p>
            ) : (
              auditLogs.map(log => (
                <div key={log.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-white">{log.product?.title || `Producto ${log.product_id.slice(0, 8)}`}</span>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                      <span className="line-through text-slate-500">{log.old_brand_name || 'Sin marca'}</span>
                      <ArrowRight className="w-3 h-3 text-indigo-400" />
                      <span className="font-bold text-emerald-400">{log.new_brand_name}</span>
                      {log.new_licenses?.length > 0 && (
                        <span className="ml-2 text-amber-300 font-semibold">(Licencia: {log.new_licenses.join(', ')})</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-slate-500">
                    <p className="font-mono">{log.source || 'Admin'}</p>
                    <p>{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: MANUAL EDIT DRAWER */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-5 shadow-2xl text-white">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Asignar Marca y Licencia</h3>
                <p className="text-xs text-slate-400 truncate max-w-sm">{editingProduct.title}</p>
              </div>
              <button onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">MARCA / FABRICANTE *</label>
                <select
                  value={selectedNewBrandId}
                  onChange={(e) => setSelectedNewBrandId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Seleccionar Fabricante --</option>
                  {dbBrands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.brand_type === 'generic' ? '(Genérica)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">LICENCIA / FRANQUICIA (Opcional)</label>
                <select
                  value={selectedNewLicenseId}
                  onChange={(e) => setSelectedNewLicenseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-amber-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Sin Licencia / Opcional --</option>
                  {dbLicenses.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  handleApplyFix(editingProduct, selectedNewBrandId, selectedNewLicenseId);
                  setEditingProduct(null);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AUTO-FIX PREVIEW & CONFIRMATION */}
      {showAutoFixModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl text-white">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Confirmar Auto-Fix de Alta Confianza</h3>
              </div>
              <button onClick={() => setShowAutoFixModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Se ejecutará la corrección masiva sobre únicamente los productos con evidencia estructurada fuerte y confianza <span className="font-bold text-emerald-400">&gt;= 95%</span>.
              </p>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total elegibles para Auto-Fix:</span>
                  <span className="font-bold text-emerald-400">{autoFixSummary.total} productos</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">• Solo Marca:</span>
                  <span className="font-semibold text-slate-200">{autoFixSummary.brandOnly}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">• Solo Licencia:</span>
                  <span className="font-semibold text-slate-200">{autoFixSummary.licenseOnly}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">• Marca + Licencia:</span>
                  <span className="font-semibold text-slate-200">{autoFixSummary.both}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-800/60">
                  <span className="text-slate-500">Omitidos por ambigüedad / baja confianza:</span>
                  <span className="font-mono text-slate-400">{autoFixSummary.skipped}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowAutoFixModal(false)}
                disabled={autoFixExecuting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteBulkAutoFix}
                disabled={autoFixExecuting || autoFixSummary.total === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 disabled:opacity-50"
              >
                {autoFixExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {autoFixExecuting ? 'Ejecutando...' : 'Confirmar y Ejecutar Auto-Fix'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

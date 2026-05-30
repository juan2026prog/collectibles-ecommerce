import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Activity, RefreshCw, AlertCircle, CheckCircle2, Play, Settings, ShieldCheck, 
  Layers, ExternalLink, AlertTriangle, TrendingUp, Clock, ArrowRight, Search, 
  Sliders, Link2, HelpCircle, Ban, Trash2, Mail, Plus, X, Settings2, Save, 
  ImageIcon, Info, List, Grid3X3, Edit2, Check
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { updateCachedSettings } from '../../hooks/useSiteSettings';

// Edge Function helpers
async function callSyncEdge(body: any) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const session = (await supabase.auth.getSession()).data.session;
  const token = session?.access_token || '';
  const res = await fetch(`${supabaseUrl}/functions/v1/mercadolibre-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data?.error || data?.message || JSON.stringify(data)}`);
  if (!data.success) throw new Error(data.error || 'Error desconocido');
  return data;
}

async function callWebhookEdge(body: any) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const session = (await supabase.auth.getSession()).data.session;
  const token = session?.access_token || '';
  const res = await fetch(`${supabaseUrl}/functions/v1/mercadolibre-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data?.error || data?.message || JSON.stringify(data)}`);
  if (!data.success) throw new Error(data.error || 'Error desconocido');
  return data;
}

export default function AdminMercadoLibre() {
  const [activeTab, setActiveTab] = useState<'summary' | 'products' | 'sync' | 'diagnostic'>('summary');
  const [activeDiagTab, setActiveDiagTab] = useState<'metrics' | 'queue' | 'webhooks' | 'dlq' | 'oauth' | 'stock' | 'alerts'>('metrics');
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  // Settings state
  const [markupType, setMarkupType] = useState('percentage');
  const [markupValue, setMarkupValue] = useState('10');
  const [rulesEnabled, setRulesEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [webhooksEnabled, setWebhooksEnabled] = useState(true);

  // Global counts and stats
  const [stats, setStats] = useState({
    syncQueuePending: 0,
    syncQueueFailed: 0,
    webhookPending: 0,
    webhookProcessed: 0,
    webhookFailed: 0,
    dlqCount: 0,
    expiringTokens: 0,
    stockMismatches: 0,
    totalProductsML: 0,
    totalLinked: 0,
    totalPendingReview: 0,
    totalOrdersML: 0,
    totalOrdersWeb: 0,
    latencyAvg: 0,
    failureRate: 0,
    lastSyncTime: 'Nunca',
  });

  // DB Data lists
  const [sellers, setSellers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  
  // Tab 2 (Productos por revisar) states
  const [curationItems, setCurationItems] = useState<any[]>([]);
  const [curationLoading, setCurationLoading] = useState(false);
  const [curationStatusFilter, setCurationStatusFilter] = useState('review_needed');
  const [curationSearch, setCurationSearch] = useState('');
  const [curationCategoryFilter, setCurationCategoryFilter] = useState('all');
  const [selectedCurationItem, setSelectedCurationItem] = useState<any>(null);
  const [selectedCurationIds, setSelectedCurationIds] = useState<Set<string>>(new Set());

  // Tab 3 (Sincronización) states
  const [linkedProducts, setLinkedProducts] = useState<any[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);

  // Diagnostics states
  const [syncQueue, setSyncQueue] = useState<any[]>([]);
  const [webhooksList, setWebhooksList] = useState<any[]>([]);
  const [dlqList, setDlqList] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [mismatches, setMismatches] = useState<any[]>([]);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  // Curation Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    suggested_category_id: '',
    brand_id: '',
    detected_universe: '',
    detected_line: ''
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    price: 0,
    stock: 0,
    category_id: '',
    brand_id: '',
    universe: '',
    line: '',
    selected_image: ''
  });

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [foundProducts, setFoundProducts] = useState<any[]>([]);
  const [selectedProductToLink, setSelectedProductToLink] = useState<any>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');

  // Import Modal
  const [showImportModal, setShowImportModal] = useState(false);

  // Fetch initial global data
  useEffect(() => {
    fetchInitialData();
  }, [refreshTrigger, activeTab]);

  // Fetch curation items when curation filters change
  useEffect(() => {
    if (activeTab === 'products') {
      fetchCurationItems();
    }
  }, [activeTab, curationStatusFilter, curationCategoryFilter, refreshTrigger]);

  // Fetch sync/linked data when tab is active
  useEffect(() => {
    if (activeTab === 'sync') {
      fetchSyncTabData();
    }
  }, [activeTab, refreshTrigger]);

  // Fetch diagnostic data
  useEffect(() => {
    if (activeTab === 'diagnostic') {
      fetchDiagnosticTabData();
    }
  }, [activeTab, activeDiagTab, refreshTrigger]);

  async function fetchInitialData() {
    setLoading(true);
    try {
      // 1. Fetch site settings & connection status
      const { data: wsSetting } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['ml_webhooks_enabled', 'ml_price_markup_type', 'ml_price_markup_value', 'ml_price_rules_enabled']);
      
      const enabledKey = wsSetting?.find(s => s.key === 'ml_webhooks_enabled')?.value;
      const type = wsSetting?.find(s => s.key === 'ml_price_markup_type')?.value;
      const val = wsSetting?.find(s => s.key === 'ml_price_markup_value')?.value;
      const rules = wsSetting?.find(s => s.key === 'ml_price_rules_enabled')?.value;

      setWebhooksEnabled(enabledKey !== 'false');
      if (type) setMarkupType(type);
      if (val) setMarkupValue(val);
      if (rules !== undefined) setRulesEnabled(rules === 'true');

      // 2. Fetch connected sellers count
      const { data: dbSellers } = await supabase.from('ml_seller_accounts').select('*');
      setSellers(dbSellers || []);

      const expiring = dbSellers?.filter(s => {
        if (!s.expires_at) return true;
        const hoursLeft = (new Date(s.expires_at).getTime() - Date.now()) / (1000 * 60 * 60);
        return hoursLeft < 24;
      }).length || 0;

      // 3. Fetch linked, pending and total items counts
      const { count: linkedCount } = await supabase.from('ml_catalog_links').select('*', { count: 'exact', head: true });
      const { count: pendingCuration } = await supabase.from('ml_raw_items').select('*', { count: 'exact', head: true }).eq('status', 'review_needed');
      const { count: totalMLItems } = await supabase.from('ml_raw_items').select('*', { count: 'exact', head: true });

      // 4. Fetch orders segment
      const { count: mlOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).not('ml_order_id', 'is', null);
      const { count: webOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).is('ml_order_id', null);

      // 5. Fetch webhook events stats
      const { data: wStats } = await supabase.from('ml_incoming_events').select('status, processed_at, received_at');
      const wPending = wStats?.filter(w => w.status === 'pending' || w.status === 'processing').length || 0;
      const wProcessed = wStats?.filter(w => w.status === 'processed').length || 0;
      const wFailed = wStats?.filter(w => w.status === 'failed' || w.status === 'dead_letter').length || 0;

      // Get last sync time
      let lastSync = 'Nunca';
      const lastProcessedEvent = wStats?.filter(w => w.processed_at).sort((a,b) => new Date(b.processed_at!).getTime() - new Date(a.processed_at!).getTime())[0];
      if (lastProcessedEvent && lastProcessedEvent.processed_at) {
        lastSync = new Date(lastProcessedEvent.processed_at).toLocaleString();
      }

      let totalLat = 0;
      let latCount = 0;
      wStats?.forEach(w => {
        if (w.processed_at && w.received_at) {
          totalLat += new Date(w.processed_at).getTime() - new Date(w.received_at).getTime();
          latCount++;
        }
      });
      const avgLat = latCount > 0 ? Math.round(totalLat / latCount) : 0;
      const failRate = wStats && wStats.length > 0 ? Math.round((wFailed / wStats.length) * 100) : 0;

      // 6. Fetch DLQ count
      const { count: dlqCount } = await supabase.from('ml_dead_letter_queue').select('*', { count: 'exact', head: true });

      // 7. Fetch sync queue pending
      const { count: qPending } = await supabase.from('ml_sync_queue').select('*', { count: 'exact', head: true }).in('status', ['pending', 'failed']);

      setStats({
        syncQueuePending: qPending || 0,
        syncQueueFailed: 0,
        webhookPending: wPending,
        webhookProcessed: wProcessed,
        webhookFailed: wFailed,
        dlqCount: dlqCount || 0,
        expiringTokens: expiring,
        stockMismatches: mismatches.length,
        totalProductsML: totalMLItems || 0,
        totalLinked: linkedCount || 0,
        totalPendingReview: pendingCuration || 0,
        totalOrdersML: mlOrders || 0,
        totalOrdersWeb: webOrders || 0,
        latencyAvg: avgLat,
        failureRate: failRate,
        lastSyncTime: lastSync
      });
      
    } catch (e: any) {
      toast.error('Error cargando resumen: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategoriesAndBrands() {
    const { data: catData } = await supabase.from('categories').select('id, name, slug').order('name', { ascending: true });
    setCategories(catData || []);

    const { data: brandData } = await supabase.from('brands').select('id, name').order('name', { ascending: true });
    setBrands(brandData || []);
  }

  // Pestaña 2: Productos por revisar logic
  async function fetchCurationItems() {
    setCurationLoading(true);
    try {
      let query = supabase.from('ml_raw_items').select('*, ml_import_matches(*, products(id, title, base_price, product_images(url)))');
      
      if (curationStatusFilter !== 'all') {
        query = query.eq('status', curationStatusFilter);
      }
      
      query = query.order('created_at', { ascending: false });
      
      const { data, error } = await query;
      if (error) throw error;

      let filtered = data || [];
      if (curationCategoryFilter !== 'all') {
        filtered = filtered.filter(item => item.raw_payload?.normalized_metadata?.suggested_category_id === curationCategoryFilter);
      }
      
      setCurationItems(filtered);
      setSelectedCurationIds(new Set());
    } catch (err: any) {
      toast.error('Error al obtener productos por revisar: ' + err.message);
    } finally {
      setCurationLoading(false);
    }
  }

  // Pestaña 3: Sincronización logic
  async function fetchSyncTabData() {
    try {
      const { data: links, error } = await supabase
        .from('ml_catalog_links')
        .select('*, products(title, base_price), product_variants(sku, inventory_count)');
      if (error) throw error;
      setLinkedProducts(links || []);
    } catch (e: any) {
      toast.error('Error al cargar vinculaciones: ' + e.message);
    }
  }

  // Pestaña 4: Centro de Diagnóstico logic
  async function fetchDiagnosticTabData() {
    setDiagnosticsLoading(true);
    try {
      if (activeDiagTab === 'queue') {
        const { data } = await supabase
          .from('ml_sync_queue')
          .select('*, products(title)')
          .order('created_at', { ascending: false })
          .limit(50);
        setSyncQueue(data || []);
      } else if (activeDiagTab === 'webhooks') {
        const { data } = await supabase
          .from('ml_incoming_events')
          .select('*')
          .order('received_at', { ascending: false })
          .limit(50);
        setWebhooksList(data || []);
      } else if (activeDiagTab === 'dlq') {
        const { data } = await supabase
          .from('ml_dead_letter_queue')
          .select('*')
          .order('created_at', { ascending: false });
        setDlqList(data || []);
      } else if (activeDiagTab === 'alerts') {
        const { data } = await supabase
          .from('ml_alerts')
          .select('*')
          .order('last_triggered_at', { ascending: false })
          .limit(50);
        setAlerts(data || []);
      } else if (activeDiagTab === 'stock') {
        // Stock audit results are shown in grid
      }
    } catch (e: any) {
      toast.error('Error cargando diagnóstico: ' + e.message);
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  // Settings Actions
  async function saveSettings() {
    setSavingSettings(true);
    try {
      const rows = [
        { key: 'ml_price_markup_type', value: markupType, updated_at: new Date().toISOString() },
        { key: 'ml_price_markup_value', value: markupValue, updated_at: new Date().toISOString() },
        { key: 'ml_price_rules_enabled', value: rulesEnabled ? 'true' : 'false', updated_at: new Date().toISOString() }
      ];
      await Promise.all([
        supabase.from('site_settings').upsert(rows, { onConflict: 'key' }),
        supabase.from('public_site_config').upsert(rows, { onConflict: 'key' })
      ]);
      updateCachedSettings({
        'ml_price_markup_type': markupType,
        'ml_price_markup_value': markupValue,
        'ml_price_rules_enabled': rulesEnabled ? 'true' : 'false'
      });
      toast.success('Configuración de Mercado Libre guardada');
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error al guardar configuración: ' + e.message);
    } finally {
      setSavingSettings(false);
    }
  }

  // Connect account
  function handleConnectAccount() {
    const clientId = import.meta.env.VITE_ML_CLIENT_ID || (sellers.length > 0 ? sellers[0].seller_id : '');
    const redirectUri = import.meta.env.VITE_ML_REDIRECT_URI || `${window.location.origin}/callback`;
    
    if (!clientId) {
      toast.error('Error: No se encontró CLIENT_ID de Mercado Libre. Configúralo en las variables de entorno.');
      return;
    }

    const authUrl = `https://auth.mercadolibre.com.uy/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = authUrl;
  }

  // Sync Outgoing Action (Publicar productos Web -> ML)
  async function handlePublishCatalog() {
    setActionLoading(true);
    setSyncStatus(null);
    setSyncProgress(0);
    try {
      const { data: dbProducts } = await supabase.from('products').select('id');
      const productIds = dbProducts?.map(p => p.id) || [];
      
      if (productIds.length === 0) {
        toast.error('No hay productos locales para publicar.');
        return;
      }

      setSyncLoading(true);
      // Call publish edge action
      const data = await callSyncEdge({ action: 'publish', product_ids: productIds });
      toast.success(`Catálogo enviado a Mercado Libre. ${data.count || data.results?.length || 0} productos procesados.`);
      setRefreshTrigger(p => p + 1);
    } catch (err: any) {
      toast.error('Error en publicación: ' + err.message);
    } finally {
      setActionLoading(false);
      setSyncLoading(false);
    }
  }

  // Sync Outgoing Action (Sincronizar Stock/Precios ahora)
  async function handleSyncCatalog() {
    setActionLoading(true);
    setSyncLoading(true);
    try {
      const { data: dbProducts } = await supabase.from('products').select('id');
      const productIds = dbProducts?.map(p => p.id) || [];
      
      if (productIds.length === 0) {
        toast.error('No hay productos locales para sincronizar.');
        return;
      }

      const data = await callSyncEdge({ action: 'sync_stock', product_ids: productIds });
      toast.success(`Sincronización completada. ${data.count || data.results?.length || 0} productos actualizados.`);
      setRefreshTrigger(p => p + 1);
    } catch (err: any) {
      toast.error('Error en sincronización: ' + err.message);
    } finally {
      setActionLoading(false);
      setSyncLoading(false);
    }
  }

  // Curation actions
  async function handleIgnoreCuration(id: string) {
    if (!(await confirm('¿Desea marcar este producto como ignorado? No se creará en el catálogo local.', { danger: true }))) return;
    setActionLoading(true);
    try {
      await callSyncEdge({ action: 'curate_ignore', raw_item_id: id });
      toast.success('Producto ignorado');
      setSelectedCurationItem(null);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  function openEditCuration(item: any) {
    const meta = item.raw_payload?.normalized_metadata || {};
    setEditForm({
      title: meta.clean_title || item.title,
      suggested_category_id: meta.suggested_category_id || '',
      brand_id: meta.brand_id || '',
      detected_universe: meta.detected_universe || '',
      detected_line: meta.detected_line || ''
    });
    setShowEditModal(true);
  }

  async function saveEditCuration() {
    if (!selectedCurationItem) return;
    setActionLoading(true);
    try {
      await callSyncEdge({
        action: 'curate_edit_raw',
        raw_item_id: selectedCurationItem.id,
        title: editForm.title,
        suggested_category_id: editForm.suggested_category_id || null,
        brand_id: editForm.brand_id || null,
        detected_universe: editForm.detected_universe || null,
        detected_line: editForm.detected_line || null
      });
      toast.success('Información corregida guardada.');
      setShowEditModal(false);
      
      const { data } = await supabase
        .from('ml_raw_items')
        .select('*, ml_import_matches(*, products(id, title, base_price, product_images(url)))')
        .eq('id', selectedCurationItem.id)
        .single();
      if (data) setSelectedCurationItem(data);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Create Product from staging
  function openCreateProductModal() {
    if (!selectedCurationItem) return;
    const meta = selectedCurationItem.raw_payload?.normalized_metadata || {};
    setCreateForm({
      title: meta.clean_title || selectedCurationItem.title,
      description: selectedCurationItem.raw_payload?.description || selectedCurationItem.title,
      price: Number(selectedCurationItem.price || 0),
      stock: Number(selectedCurationItem.available_quantity || 0),
      category_id: meta.suggested_category_id || '',
      brand_id: meta.brand_id || '',
      universe: meta.detected_universe || '',
      line: meta.detected_line || '',
      selected_image: selectedCurationItem.thumbnail || ''
    });
    setShowCreateModal(true);
  }

  async function executeCreateProduct() {
    if (!selectedCurationItem) return;
    if (!createForm.title.trim()) {
      toast.error('El título es obligatorio');
      return;
    }
    if (!createForm.category_id) {
      toast.error('La categoría es obligatoria');
      return;
    }
    if (!(await confirm('¿Confirmas que deseas crear un nuevo producto en el catálogo? Quedará guardado en borrador (no público).'))) return;
    
    setActionLoading(true);
    try {
      await callSyncEdge({
        action: 'curate_create',
        raw_item_id: selectedCurationItem.id,
        title: createForm.title,
        description: createForm.description,
        price: createForm.price,
        stock: createForm.stock,
        category_id: createForm.category_id,
        brand_id: createForm.brand_id || null,
        universe: createForm.universe || null,
        line: createForm.line || null,
        selected_image: createForm.selected_image
      });
      toast.success('Producto creado y vinculado correctamente.');
      setShowCreateModal(false);
      setSelectedCurationItem(null);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Link Product Modal actions
  function openLinkProductModal() {
    setLinkSearch('');
    setFoundProducts([]);
    setSelectedProductToLink(null);
    setSelectedVariantId('');
    setShowLinkModal(true);
  }

  // Search local products
  useEffect(() => {
    if (linkSearch.trim().length > 1) {
      const delayDebounce = setTimeout(() => {
        searchLocalProducts();
      }, 300);
      return () => clearTimeout(delayDebounce);
    } else {
      setFoundProducts([]);
    }
  }, [linkSearch]);

  async function searchLocalProducts() {
    try {
      const { data } = await supabase
        .from('products')
        .select('id, title, base_price, product_variants(id, sku, name), product_images(url)')
        .ilike('title', `%${linkSearch}%`)
        .limit(10);
      setFoundProducts(data || []);
    } catch (_e) {}
  }

  async function executeLinkProduct(prodId: string, varId: string) {
    if (!selectedCurationItem) return;
    if (!(await confirm('¿Confirmas que deseas vincular esta publicación de Mercado Libre al producto local?'))) return;
    setActionLoading(true);
    try {
      await callSyncEdge({
        action: 'curate_link',
        raw_item_id: selectedCurationItem.id,
        product_id: prodId,
        variant_id: varId || null
      });
      toast.success('Sincronización establecida y stock vinculado.');
      setShowLinkModal(false);
      setSelectedCurationItem(null);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Bulk Curation Actions
  const toggleCurationSelect = (id: string) => {
    const next = new Set(selectedCurationIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCurationIds(next);
  };

  async function executeBulkAction(
    bulkAction: 'ignore' | 'assign_category' | 'assign_universe' | 'assign_brand' | 'link_strong', 
    params?: { categoryId?: string, universe?: string, brandId?: string }
  ) {
    if (selectedCurationIds.size === 0) return;
    const itemsCount = selectedCurationIds.size;
    let msg = `¿Desea aplicar esta acción a los ${itemsCount} productos seleccionados?`;
    if (bulkAction === 'ignore') {
      msg = `¿Confirmas que deseas ignorar los ${itemsCount} productos seleccionados?`;
    } else if (bulkAction === 'link_strong') {
      msg = `¿Confirmas que deseas vincular de forma masiva los ${itemsCount} productos? Solo se procesarán los que tengan coincidencia fuerte.`;
    }
    
    if (!(await confirm(msg))) return;
    setActionLoading(true);
    try {
      const res = await callSyncEdge({
        action: 'curate_bulk',
        raw_item_ids: Array.from(selectedCurationIds),
        bulk_action: bulkAction,
        category_id: params?.categoryId || null,
        universe: params?.universe || null,
        brand_id: params?.brandId || null
      });

      const successCount = res.results?.filter((r: any) => r.status === 'success')?.length || 0;
      const errorCount = (res.results?.length || 0) - successCount;
      if (errorCount > 0) {
        toast.success(`Acción completada: ${successCount} exitosos, ${errorCount} omitidos/error.`);
      } else {
        toast.success(`Acción completada con éxito para los ${successCount} productos.`);
      }
      setSelectedCurationIds(new Set());
      setSelectedCurationItem(null);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Diagnostics actions
  async function handleSweepWebhooks() {
    setActionLoading(true);
    try {
      const data = await callWebhookEdge({ action: 'sweep' });
      toast.success(`Barrido de eventos recibidos completado: ${data.swept_count} procesados.`);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error en barrido: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleProcessSyncQueue() {
    setActionLoading(true);
    try {
      const data = await callSyncEdge({ action: 'process_sync_queue' });
      toast.success(`Sincronizaciones pendientes procesadas: ${data.processed_count || 0} envíos realizados.`);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error en procesador de cola: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRunStockAudit() {
    setActionLoading(true);
    try {
      const data = await callSyncEdge({ action: 'stock_audit' });
      setMismatches(data.report || []);
      setStats(prev => ({ ...prev, stockMismatches: data.mismatch_count }));
      toast.success(`Verificación de stock finalizada. Desalineaciones: ${data.mismatch_count}`);
      setActiveDiagTab('stock');
    } catch (e: any) {
      toast.error('Error en verificar stock: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReconcile(linkIds: string[], target: 'master_to_all' | 'ml_to_all') {
    if (!(await confirm(`¿Estás seguro de alinear el stock para los registros seleccionados? Modo: ${target === 'master_to_all' ? 'Local -> Mercado Libre' : 'Mercado Libre -> Local'}`))) return;
    setActionLoading(true);
    try {
      const data = await callSyncEdge({ action: 'manual_reconcile', link_ids: linkIds, target });
      const successCount = data.results?.filter((r: any) => r.status === 'success').length || 0;
      toast.success(`Alineación completada: ${successCount} actualizados.`);
      handleRunStockAudit();
    } catch (e: any) {
      toast.error('Error alineando stock: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRequeueDlq(eventId: string) {
    if (!(await confirm('¿Re-encolar esta sincronización fallida? Volverá a intentarse.'))) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('ml_incoming_events')
        .update({
          status: 'pending',
          attempts: 0,
          last_error: null,
          processed_at: null
        })
        .eq('id', eventId);

      if (error) throw error;
      toast.success('Evento re-encolado. Ejecuta el Barrido de Eventos para procesar.');
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error al re-encolar: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRetryEvent(eventId: string) {
    setActionLoading(true);
    try {
      await callWebhookEdge({ action: 'process_event', event_id: eventId });
      toast.success('Procesamiento forzado finalizado.');
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Fallo en re-intento: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResolveAlert(alertId: string) {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('ml_alerts')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', alertId);
      if (error) throw error;
      toast.success('Alerta marcada como resuelta.');
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error al resolver: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteDlq(id: string) {
    if (!(await confirm('¿Eliminar definitivamente este reporte de error?', { danger: true }))) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('ml_dead_letter_queue').delete().eq('id', id);
      if (error) throw error;
      toast.success('Reporte eliminado de errores de sincronización.');
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleKillSwitch() {
    const nextState = !webhooksEnabled;
    const actionText = nextState ? 'ACTIVAR' : 'DESACTIVAR';
    
    if (!(await confirm(`¿Estás seguro de que deseas ${actionText} el procesamiento en tiempo real de Mercado Libre?`))) {
      return;
    }
    
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('site_settings')
        .upsert({
          key: 'ml_webhooks_enabled',
          value: nextState ? 'true' : 'false',
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
        
      if (error) throw error;
      setWebhooksEnabled(nextState);
      toast.success(`Integración con Mercado Libre ${nextState ? 'activada' : 'desactivada'} exitosamente.`);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error al cambiar el interruptor de emergencia: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Filter curation items matching query
  const filteredCurationItems = curationItems.filter(item => {
    const cleanTitleText = item.raw_payload?.normalized_metadata?.clean_title || item.title;
    const titleMatch = cleanTitleText.toLowerCase().includes(curationSearch.toLowerCase());
    const sku = item.raw_payload?.normalized_metadata?.extracted_seller_sku || '';
    const skuMatch = sku.toLowerCase().includes(curationSearch.toLowerCase());
    const itemIdMatch = item.ml_item_id.toLowerCase().includes(curationSearch.toLowerCase());
    return titleMatch || skuMatch || itemIdMatch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center font-bold text-blue-900 text-sm">ML</div>
            Mercado Libre Uruguay
          </h2>
          <p className="text-gray-500 mt-1">Vincula tu tienda Collectibles con tus publicaciones, stock y precios.</p>
        </div>

        {/* Global connection widget */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 px-4 py-2 bg-white border rounded-xl shadow-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${webhooksEnabled && sellers.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-black text-gray-400 leading-none">Estado de Sincronización</span>
              <span className="text-[11px] font-bold text-gray-800 mt-0.5">
                {sellers.length === 0 ? 'Cuenta desconectada' : !webhooksEnabled ? 'Pausada temporalmente' : 'Activo'}
              </span>
            </div>
          </div>
          
          <button 
            onClick={() => setRefreshTrigger(p => p + 1)}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl border transition-all active:scale-95"
            title="Actualizar datos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b overflow-x-auto scrollbar-hide bg-white rounded-xl shadow-sm border p-1">
        {[
          { id: 'summary', name: 'Resumen General', icon: TrendingUp },
          { id: 'products', name: 'Productos por revisar', icon: Layers },
          { id: 'sync', name: 'Sincronización & Stock', icon: ShieldCheck },
          { id: 'diagnostic', name: 'Centro de Diagnóstico', icon: Sliders }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-slate-900 text-white shadow-md' 
                  : 'text-gray-500 hover:text-slate-950 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* Loading state indicator */}
      {loading && activeTab === 'summary' ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <RefreshCw className="w-10 h-10 animate-spin mb-3 text-gray-300" />
          <span className="text-sm font-medium">Cargando panel de Mercado Libre...</span>
        </div>
      ) : (
        <div className="min-h-[500px]">
          
          {/* ══════════════════════════════════════════════════════════════
              PESTAÑA 1: RESUMEN GENERAL
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              {/* Connected Account & Status Panel */}
              <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                  <svg className="w-64 h-64" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9M12 4.15L5.6 7.75 12 11.35l6.4-3.6L12 4.15M5 15.91l6 3.38v-6.71L5 9.21v6.7m14 0v-6.7l-6 3.37v6.71l6-3.38z"/>
                  </svg>
                </div>
                <div className="relative z-10 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] tracking-widest font-black uppercase text-slate-400">Cuenta Conectada</span>
                      <h3 className="text-2xl font-black mt-1">
                        {sellers.length > 0 ? (sellers[0].nickname || sellers[0].seller_id) : 'Ninguna cuenta conectada'}
                      </h3>
                      {sellers.length > 0 && sellers[0].expires_at && (
                        <p className="text-xs text-slate-400 mt-1">
                          Token vence el: {new Date(sellers[0].expires_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={handleConnectAccount}
                        className="px-5 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-900 rounded-xl text-sm font-black transition-all flex items-center gap-2 shadow-lg shadow-yellow-400/10 active:scale-95"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {sellers.length > 0 ? 'Reconectar cuenta' : 'Conectar cuenta'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-800 pt-5">
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30">
                      <span className="text-slate-400 text-[10px] uppercase tracking-widest font-black block">Publicaciones Activas</span>
                      <span className="text-xl font-bold block mt-1">{stats.totalProductsML}</span>
                    </div>
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30">
                      <span className="text-slate-400 text-[10px] uppercase tracking-widest font-black block">Productos Vinculados</span>
                      <span className="text-xl font-bold block mt-1">{stats.totalLinked}</span>
                    </div>
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30">
                      <span className="text-slate-400 text-[10px] uppercase tracking-widest font-black block">Productos por revisar</span>
                      <span className="text-xl font-bold block mt-1 text-orange-400">{stats.totalPendingReview}</span>
                    </div>
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30">
                      <span className="text-slate-400 text-[10px] uppercase tracking-widest font-black block">Última Sincronización</span>
                      <span className="text-xs font-bold block mt-2 text-slate-200 truncate">{stats.lastSyncTime}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-base mb-1">Importar Catálogo (ML a Web)</h4>
                    <p className="text-xs text-gray-500 mb-4">Descarga productos activos de tu cuenta de Mercado Libre y colócalos en la cola para curación.</p>
                  </div>
                  <button 
                    onClick={() => setShowImportModal(true)}
                    className="btn-primary w-full bg-blue-600 border-blue-600 hover:bg-blue-700 flex justify-center items-center gap-2 py-2 text-xs"
                    disabled={actionLoading || sellers.length === 0}
                  >
                    Importar productos
                  </button>
                </div>

                <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mb-4">
                      <Play className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-base mb-1">Publicar en Mercado Libre</h4>
                    <p className="text-xs text-gray-500 mb-4">Envía nuevos productos cargados en tu e-commerce hacia Mercado Libre utilizando tus reglas de precio.</p>
                  </div>
                  <button 
                    onClick={handlePublishCatalog}
                    className="btn-primary w-full bg-yellow-400 text-blue-900 border-yellow-400 hover:bg-yellow-500 flex justify-center items-center gap-2 py-2 text-xs font-bold"
                    disabled={actionLoading || sellers.length === 0}
                  >
                    {syncLoading ? 'Publicando...' : 'Publicar productos'}
                  </button>
                </div>

                <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-base mb-1">Sincronizar Stock / Precios</h4>
                    <p className="text-xs text-gray-500 mb-4">Actualiza de forma bidireccional y masiva los inventarios y valores de productos asociados en tiempo real.</p>
                  </div>
                  <button 
                    onClick={handleSyncCatalog}
                    className="btn-secondary w-full border-green-200 text-green-700 bg-green-50 hover:bg-green-100 flex justify-center items-center gap-2 py-2 text-xs"
                    disabled={actionLoading || sellers.length === 0}
                  >
                    {syncLoading ? 'Sincronizando...' : 'Sincronizar ahora'}
                  </button>
                </div>
              </div>

              {/* Pricing Rules */}
              <div className="bg-white p-6 rounded-xl border shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Settings2 className="w-5 h-5 text-gray-500" /> 
                      Reglas de Precios
                    </h3>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                      <input 
                        type="checkbox" 
                        checked={rulesEnabled} 
                        onChange={e => setRulesEnabled(e.target.checked)} 
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="font-medium select-none text-xs">Activar ajuste de precios en importación</span>
                    </label>
                  </div>
                  <button 
                    onClick={saveSettings} 
                    disabled={savingSettings} 
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-2"
                  >
                    {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" /> } 
                    Guardar reglas
                  </button>
                </div>
                
                <p className="text-xs text-gray-500 mb-4 border-b pb-4">
                  Configura si los precios en la tienda local deben tener un aumento o reducción respecto al precio de Mercado Libre al sincronizar.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Ajuste de precio</label>
                    <select className="form-input w-full text-xs" value={markupType} onChange={e => setMarkupType(e.target.value)}>
                      <option value="percentage">Aumento Porcentual (%)</option>
                      <option value="fixed">Monto Fijo de Recargo ($ UYU)</option>
                      <option value="discount_percentage">Descuento Porcentual (%)</option>
                      <option value="equal">Precio Idéntico (1:1)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Valor del ajuste</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 font-bold text-xs">
                        {markupType.includes('percentage') ? '%' : '$'}
                      </span>
                      <input 
                        type="number" 
                        className="form-input flex-1 rounded-l-none text-xs" 
                        value={markupValue} 
                        onChange={e => setMarkupValue(e.target.value)} 
                        disabled={markupType === 'equal'} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              PESTAÑA 2: PRODUCTOS POR REVISAR (Curación Simplificada)
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'products' && (
            <div className="flex flex-col xl:flex-row gap-6 relative">
              {/* Left sidebar listing products */}
              <div className="w-full xl:w-2/5 bg-white border rounded-2xl shadow-sm flex flex-col h-[75vh] overflow-hidden">
                <div className="p-4 border-b space-y-3 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                      <Layers className="w-4 h-4 text-blue-600" />
                      Productos importados ({filteredCurationItems.length})
                    </h3>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setCurationStatusFilter('review_needed')}
                        className={`text-[10px] font-black uppercase px-2.5 py-1.5 rounded-full transition-colors ${curationStatusFilter === 'review_needed' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        Pendientes
                      </button>
                      <button 
                        onClick={() => setCurationStatusFilter('pending')}
                        className={`text-[10px] font-black uppercase px-2.5 py-1.5 rounded-full transition-colors ${curationStatusFilter === 'pending' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        Vinculados
                      </button>
                      <button 
                        onClick={() => setCurationStatusFilter('ignored')}
                        className={`text-[10px] font-black uppercase px-2.5 py-1.5 rounded-full transition-colors ${curationStatusFilter === 'ignored' ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        Ignorados
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-white border rounded-xl px-3 py-1.5 shadow-inner focus-within:ring-2 focus-within:ring-blue-500/20">
                      <Search className="w-4 h-4 text-gray-400" />
                      <input 
                        type="text" 
                        placeholder="Buscar por título, SKU..." 
                        className="text-xs bg-transparent outline-none w-full border-none ring-0 focus:ring-0" 
                        value={curationSearch}
                        onChange={e => setCurationSearch(e.target.value)}
                      />
                    </div>
                    
                    <select
                      value={curationCategoryFilter}
                      onChange={e => setCurationCategoryFilter(e.target.value)}
                      className="text-[11px] font-bold bg-white border text-blue-600 rounded-xl px-2 py-1.5 outline-none shadow-sm cursor-pointer"
                    >
                      <option value="all">Categorías</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                  {curationLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                      <RefreshCw className="w-8 h-8 animate-spin mb-2 text-gray-300" />
                      <span className="text-xs font-semibold">Cargando productos de Mercado Libre...</span>
                    </div>
                  ) : filteredCurationItems.length === 0 ? (
                    <div className="text-center py-20">
                      <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-xs font-medium">No se encontraron productos en esta lista.</p>
                    </div>
                  ) : (
                    filteredCurationItems.map(item => {
                      const meta = item.raw_payload?.normalized_metadata || {};
                      const sku = meta.extracted_seller_sku || '';
                      const matchesCount = item.ml_import_matches?.length || 0;
                      const hasStrongMatch = item.ml_import_matches?.some((m: any) => m.is_strong);

                      return (
                        <div 
                          key={item.id} 
                          className={`p-3.5 hover:bg-blue-50/20 transition-all flex gap-3 cursor-pointer ${selectedCurationItem?.id === item.id ? 'bg-blue-50/50 border-l-4 border-slate-900 pl-2.5' : ''}`}
                          onClick={() => setSelectedCurationItem(item)}
                        >
                          <div className="flex items-center" onClick={e => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={selectedCurationIds.has(item.id)}
                              onChange={() => toggleCurationSelect(item.id)}
                              className="rounded border-gray-300 text-blue-600 w-4 h-4 cursor-pointer"
                            />
                          </div>
                          
                          <div className="w-10 h-10 bg-gray-100 border rounded object-cover overflow-hidden flex-shrink-0">
                            <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <p className="font-bold text-[12px] text-gray-900 leading-tight truncate">{meta.clean_title || item.title}</p>
                              <span className="text-[11px] font-black text-blue-700">UYU${Math.round(item.price)}</span>
                            </div>
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">{item.ml_item_id}</p>
                            
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {sku && (
                                <span className="text-[9px] font-mono font-bold bg-gray-100 text-gray-500 px-1 rounded">{sku}</span>
                              )}
                              {matchesCount > 0 ? (
                                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${hasStrongMatch ? 'bg-red-150 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {matchesCount} Match{matchesCount > 1 ? 'es' : ''}
                                </span>
                              ) : (
                                <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-150 text-green-700">
                                  Nuevo
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right curation workspace */}
              <div className="flex-1 bg-white border rounded-2xl shadow-sm min-h-[75vh] flex flex-col overflow-hidden">
                {selectedCurationItem ? (
                  <div className="flex flex-col h-full divide-y">
                    {/* Header */}
                    <div className="p-5 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Revisando publicación ML</span>
                        <h2 className="text-base font-bold text-gray-900 mt-1 leading-tight flex items-center gap-2">
                          {selectedCurationItem.title}
                          <a href={selectedCurationItem.permalink} target="_blank" rel="noreferrer" title="Ver en Mercado Libre" className="text-blue-500 hover:text-blue-700">
                            <ExternalLink className="w-3.5 h-3.5 inline" />
                          </a>
                        </h2>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">ID Externo: {selectedCurationItem.ml_item_id}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => openEditCuration(selectedCurationItem)}
                          className="btn-secondary text-[11px] px-2.5 py-1.5 flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3 h-3" /> Editar Datos
                        </button>
                        <button 
                          onClick={() => handleIgnoreCuration(selectedCurationItem.id)}
                          className="px-2.5 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1 border border-red-100"
                        >
                          <Trash2 className="w-3 h-3" /> Ignorar
                        </button>
                      </div>
                    </div>

                    {/* Workspace contents */}
                    <div className="flex-1 p-5 flex flex-col md:flex-row gap-5 overflow-y-auto max-h-[50vh]">
                      {/* Left: Info card */}
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-col sm:flex-row gap-4 bg-gray-50 p-4 rounded-xl border">
                          <div className="w-20 h-20 bg-white border rounded object-cover overflow-hidden flex-shrink-0 shadow-sm mx-auto sm:mx-0">
                            <img src={selectedCurationItem.thumbnail} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 space-y-2 text-xs">
                            <p className="text-xs font-black text-gray-800 border-b pb-1.5">Datos Sugeridos</p>
                            <p className="flex justify-between border-b pb-1"><span className="text-gray-400">Título limpio:</span> <span className="font-semibold text-gray-900">{selectedCurationItem.raw_payload?.normalized_metadata?.clean_title || selectedCurationItem.title}</span></p>
                            <p className="flex justify-between border-b pb-1"><span className="text-gray-400">Marca:</span> <span className="font-semibold text-gray-900">{selectedCurationItem.raw_payload?.normalized_metadata?.brand_name || 'Ninguna'}</span></p>
                            <p className="flex justify-between border-b pb-1"><span className="text-gray-400">Categoría sugerida:</span> <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                              {categories.find(c => c.id === selectedCurationItem.raw_payload?.normalized_metadata?.suggested_category_id)?.name || 'Sin Categorizar'}
                            </span></p>
                            <div className="flex gap-4 pt-1">
                              <p><span className="text-gray-400 mr-2">Precio ML:</span> <strong className="text-xs text-blue-700">UYU${Math.round(selectedCurationItem.price)}</strong></p>
                              <p><span className="text-gray-400 mr-2">Stock:</span> <strong className="text-xs text-green-700">{selectedCurationItem.available_quantity} u.</strong></p>
                            </div>
                          </div>
                        </div>

                        <div className="border rounded-xl p-4">
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">Descripción del Producto</h4>
                          <div className="text-[11px] text-gray-600 bg-gray-50 p-3 rounded-lg border max-h-32 overflow-y-auto whitespace-pre-line leading-relaxed font-sans shadow-inner">
                            {selectedCurationItem.raw_payload?.description || 'Sin descripción.'}
                          </div>
                        </div>
                      </div>

                      {/* Right: Duplicate matches */}
                      <div className="w-full md:w-1/2 flex flex-col gap-4">
                        <div className="border rounded-xl p-4 flex-1 flex flex-col">
                          <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-500 border-b pb-2 mb-3 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-orange-500" />
                            Coincidencias en Catálogo ({selectedCurationItem.ml_import_matches?.length || 0})
                          </h4>

                          <div className="flex-1 space-y-3 overflow-y-auto max-h-56 pr-1">
                            {selectedCurationItem.ml_import_matches && selectedCurationItem.ml_import_matches.length > 0 ? (
                              selectedCurationItem.ml_import_matches.map((match: any) => {
                                const prod = match.products;
                                const score = Number(match.confidence_score) * 100;
                                const isStrong = match.is_strong;
                                const mainImg = prod?.product_images?.find((img: any) => img.is_main)?.url || prod?.product_images?.[0]?.url || '';

                                return (
                                  <div 
                                    key={match.id} 
                                    className={`p-3 rounded-xl border flex gap-3 transition-colors ${isStrong ? 'bg-red-50/20 border-red-100 hover:bg-red-50/40' : 'bg-gray-50/50 hover:bg-gray-50'}`}
                                  >
                                    <div className="w-9 h-9 bg-white border rounded object-cover overflow-hidden flex-shrink-0">
                                      {mainImg ? <img src={mainImg} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-gray-300 m-auto mt-2.5" />}
                                    </div>

                                    <div className="flex-1 min-w-0 text-[11px]">
                                      <p className="font-bold text-gray-900 truncate leading-snug">{prod?.title || 'Producto Eliminado'}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[9px] font-bold ${isStrong ? 'text-red-600' : 'text-gray-500'}`}>
                                          Coincidencia: {score.toFixed(0)}%
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center">
                                      <button 
                                        onClick={() => executeLinkProduct(prod.id, '')}
                                        className="px-2 py-1 text-[10px] font-black bg-slate-900 hover:bg-slate-800 text-white rounded shadow-sm hover:shadow active:scale-95 flex items-center gap-0.5"
                                      >
                                        Vincular
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-center py-6 text-gray-400">
                                <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-1.5" />
                                <p className="text-[11px] font-bold text-gray-500">Nuevo Producto</p>
                                <p className="text-[10px] text-gray-400 mt-1">No se detectaron duplicados en el catálogo local.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom action zone */}
                    <div className="p-5 bg-gray-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
                      <p className="text-xs text-gray-400 leading-tight">
                        Resuelve la publicación: vincúlalo a un coleccionable existente o crea un producto en borrador.
                      </p>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button 
                          onClick={openLinkProductModal}
                          disabled={actionLoading}
                          className="btn-secondary py-2 px-3 text-xs font-bold flex-1 sm:flex-none flex items-center justify-center gap-1.5 active:scale-95 bg-white"
                        >
                          <Link2 className="w-4 h-4 text-blue-600" /> Vincular producto
                        </button>
                        <button 
                          onClick={openCreateProductModal}
                          disabled={actionLoading}
                          className="btn-primary py-2 px-4 text-xs font-black flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-slate-900 border-slate-900 hover:bg-slate-800 active:scale-95 text-white shadow-md shadow-slate-900/10"
                        >
                          <Plus className="w-4 h-4" /> Crear producto
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 text-gray-400 my-auto">
                    <Layers className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="font-bold text-xs text-gray-500">Selecciona un producto del listado izquierdo</p>
                    <p className="text-[11px] text-gray-400 mt-1">Haz clic en un producto para revisarlo y publicarlo o vincularlo.</p>
                  </div>
                )}
              </div>

              {/* Bulk action floating panel */}
              {selectedCurationIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex flex-col md:flex-row items-center gap-4 z-40 border border-slate-700 animate-slide-up">
                  <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
                    <span className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center font-bold text-xs">{selectedCurationIds.size}</span>
                    <span className="text-[11px] font-bold text-slate-300">Seleccionados</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button 
                      onClick={() => executeBulkAction('ignore')}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-red-400 flex items-center gap-1 active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Ignorado
                    </button>

                    <select
                      onChange={e => {
                        if(e.target.value) {
                          executeBulkAction('assign_category', { categoryId: e.target.value });
                          e.target.value = '';
                        }
                      }}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border-none rounded-lg text-xs font-bold text-purple-300 outline-none cursor-pointer"
                    >
                      <option value="">Asignar Categoría...</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    <select
                      onChange={e => {
                        if(e.target.value) {
                          executeBulkAction('assign_brand', { brandId: e.target.value });
                          e.target.value = '';
                        }
                      }}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border-none rounded-lg text-xs font-bold text-blue-300 outline-none cursor-pointer"
                    >
                      <option value="">Asignar Marca...</option>
                      {brands.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>

                    <button 
                      onClick={() => executeBulkAction('link_strong')}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-black transition-all flex items-center gap-1 active:scale-95"
                    >
                      Vincular Coincidencias Fuertes
                    </button>
                    
                    <button 
                      onClick={() => setSelectedCurationIds(new Set())}
                      className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              PESTAÑA 3: SINCRONIZACIÓN & STOCK
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'sync' && (
            <div className="space-y-6">
              {/* Sync Dashboard top bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between bg-white border p-5 rounded-2xl shadow-sm gap-4">
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Sincronización Activa de Productos</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Controla los enlaces de stock y precios bidireccionales y gatilla alineaciones manuales.
                  </p>
                </div>
                <button 
                  onClick={handleSyncCatalog}
                  disabled={syncLoading || linkedProducts.length === 0}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  SINCRONIZAR AHORA
                </button>
              </div>

              {/* Discrepancies audit alert */}
              {stats.stockMismatches > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3 shadow-inner">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h4 className="font-bold text-xs">¡Diferencias de stock detectadas!</h4>
                    <p className="text-xs text-amber-700 mt-1">
                      El sistema detectó {stats.stockMismatches} desalineaciones de inventario entre tu tienda local y Mercado Libre. Ve al **Centro de Diagnóstico &gt; Verificar stock** para corregirlas.
                    </p>
                  </div>
                </div>
              )}

              {/* Linked Catalogue Table */}
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h4 className="font-bold text-sm text-gray-900">Productos Sincronizados ({linkedProducts.length})</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Coleccionable local</th>
                        <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">SKU</th>
                        <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">ID Mercado Libre</th>
                        <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-widest">Stock Local</th>
                        <th className="px-6 py-3 text-right pr-6 text-xs font-black text-gray-500 uppercase tracking-widest">Sincronizado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {linkedProducts.map(link => (
                        <tr key={link.id} className="hover:bg-gray-50/50">
                          <td className="px-6 py-4 font-bold text-gray-900">
                            {link.products?.title || 'Producto Eliminado'}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-gray-500">
                            {link.product_variants?.sku || 'N/A'}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-blue-600">
                            {link.ml_item_id}
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-gray-800">
                            {link.product_variants?.inventory_count ?? 0} u.
                          </td>
                          <td className="px-6 py-4 text-right pr-6 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-green-100 text-green-700">Completado</span>
                          </td>
                        </tr>
                      ))}
                      {linkedProducts.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-gray-500">No hay productos vinculados activamente. Ve a la pestaña "Productos por revisar" para asociar catálogo.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              PESTAÑA 4: CENTRO DE DIAGNÓSTICO (Solo visible a administradores)
              ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'diagnostic' && (
            <div className="space-y-6">
              {/* Emergency Switch and Diagnostics Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 text-white p-5 rounded-2xl shadow-xl">
                <div>
                  <h3 className="font-bold text-base text-yellow-400 flex items-center gap-1.5">
                    <Sliders className="w-5 h-5" />
                    Panel Técnico de Integración
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">Exclusivo para administradores. Supervisa eventos de red, reintentos de cola y switch de emergencia.</p>
                </div>
                
                {/* Emergency Kill Switch */}
                <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl shadow-inner">
                  <span className={`w-2.5 h-2.5 rounded-full ${webhooksEnabled ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  <div className="flex flex-col">
                    <span className="text-[8px] uppercase font-black text-slate-400 leading-none">Eventos en tiempo real</span>
                    <span className="text-[11px] font-bold text-slate-200 mt-0.5">{webhooksEnabled ? 'ACTIVOS' : 'APAGADOS'}</span>
                  </div>
                  <button
                    onClick={handleToggleKillSwitch}
                    disabled={actionLoading}
                    className={`w-10 h-5.5 rounded-full transition-all relative flex items-center p-0.5 ${
                      webhooksEnabled ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    style={{ width: '40px', height: '22px' }}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-all shadow absolute ${
                        webhooksEnabled ? 'right-1' : 'left-1'
                      }`}
                      style={{ top: '2px' }}
                    />
                  </button>
                </div>
              </div>

              {/* Sub tabs diagnostics */}
              <div className="flex border-b overflow-x-auto scrollbar-hide bg-white rounded-xl shadow-sm border p-1">
                {[
                  { id: 'metrics', name: 'Métricas de Red', icon: TrendingUp },
                  { id: 'queue', name: 'Sincronizaciones pendientes', icon: Layers },
                  { id: 'webhooks', name: 'Eventos recibidos', icon: Clock },
                  { id: 'dlq', name: 'Errores de sincronización', icon: AlertCircle },
                  { id: 'oauth', name: 'Cuentas conectadas', icon: Sliders },
                  { id: 'stock', name: 'Verificar stock', icon: ShieldCheck },
                  { id: 'alerts', name: 'Alertas registradas', icon: AlertTriangle }
                ].map(subTab => {
                  const Icon = subTab.icon;
                  return (
                    <button
                      key={subTab.id}
                      onClick={() => setActiveDiagTab(subTab.id as any)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                        activeDiagTab === subTab.id 
                          ? 'bg-slate-200 text-slate-900 shadow-inner' 
                          : 'text-gray-500 hover:text-slate-950 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {subTab.name}
                    </button>
                  );
                })}
              </div>

              {/* Diagnostics content */}
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden min-h-[350px] flex flex-col">
                {diagnosticsLoading ? (
                  <div className="flex flex-col items-center justify-center my-auto py-16 text-gray-400">
                    <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                    <span>Cargando logs del sistema...</span>
                  </div>
                ) : (
                  <>
                    {/* Diagnostic: Metrics */}
                    {activeDiagTab === 'metrics' && (
                      <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="border rounded-xl p-5 space-y-4">
                            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 pb-2 border-b">
                              <Clock className="w-5 h-5 text-blue-600" /> 
                              Tiempo de respuesta
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-slate-50 p-4 rounded-xl border text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Tiempo respuesta (Promedio)</p>
                                <p className="text-2xl font-black text-blue-600 mt-1">{stats.latencyAvg} ms</p>
                              </div>
                              <div className="bg-slate-50 p-4 rounded-xl border text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Tasa de error webhooks</p>
                                <p className="text-2xl font-black text-red-600 mt-1">{stats.failureRate}%</p>
                              </div>
                            </div>
                          </div>

                          <div className="border rounded-xl p-5 space-y-4">
                            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 pb-2 border-b">
                              <TrendingUp className="w-5 h-5 text-purple-600" />
                              Volumen de Eventos
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-slate-50 p-4 rounded-xl border text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Procesados exitosamente</p>
                                <p className="text-xl font-bold text-green-600 mt-1">{stats.webhookProcessed}</p>
                              </div>
                              <div className="bg-slate-50 p-4 rounded-xl border text-center">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Pendientes en cola</p>
                                <p className="text-xl font-bold text-yellow-600 mt-1">{stats.webhookPending}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 border rounded-xl flex items-center justify-between gap-4">
                          <div>
                            <h5 className="font-bold text-xs text-slate-800">Forzar reintentos de red</h5>
                            <p className="text-[11px] text-gray-500 mt-0.5">Dispara el barrido manual sobre eventos recibidos atascados o fallidos.</p>
                          </div>
                          <button 
                            onClick={handleSweepWebhooks} 
                            disabled={actionLoading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                          >
                            Barrido Eventos
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Diagnostic: Sincronizaciones pendientes (Sync Queue) */}
                    {activeDiagTab === 'queue' && (
                      <div className="flex-1 flex flex-col">
                        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                          <p className="text-xs text-gray-500">Muestra la cola de actualizaciones de stock salientes pendientes hacia Mercado Libre.</p>
                          <button 
                            onClick={handleProcessSyncQueue} 
                            disabled={actionLoading}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold"
                          >
                            Procesar cola
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Producto</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">ML Item ID</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Acción</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Estado</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Intentos</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Último Error</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {syncQueue.map(q => (
                                <tr key={q.id} className="hover:bg-gray-50/50">
                                  <td className="px-6 py-4 font-bold text-gray-900">
                                    {q.products?.title || 'Desconocido'}
                                    <span className="text-[9px] text-gray-400 block font-mono mt-0.5">{q.variant_id}</span>
                                  </td>
                                  <td className="px-6 py-4 font-mono text-blue-600">{q.ml_item_id}</td>
                                  <td className="px-6 py-4">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-gray-100 text-gray-700">{q.action}</span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                      q.status === 'processed' ? 'bg-green-100 text-green-700' :
                                      q.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-750'
                                    }`}>{q.status === 'failed' ? 'Error' : q.status === 'pending' ? 'Pendiente' : q.status === 'processing' ? 'Procesando' : 'Completado'}</span>
                                  </td>
                                  <td className="px-6 py-4 font-bold text-gray-700">{q.retry_count || 0}/3</td>
                                  <td className="px-6 py-4 text-[10px] text-red-600 font-mono truncate max-w-[200px]" title={q.last_error || ''}>
                                    {q.last_error || 'Ninguno'}
                                  </td>
                                </tr>
                              ))}
                              {syncQueue.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No hay sincronizaciones pendientes.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Diagnostic: Eventos recibidos (Webhooks) */}
                    {activeDiagTab === 'webhooks' && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Resource</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Topic</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Seller</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Estado</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Intentos</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                              <th className="px-6 py-3 text-right pr-6 text-xs font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {webhooksList.map(w => (
                              <tr key={w.id} className="hover:bg-gray-50/50">
                                <td className="px-6 py-4 font-mono text-gray-800">{w.resource}</td>
                                <td className="px-6 py-4">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-100">{w.topic}</span>
                                </td>
                                <td className="px-6 py-4 text-gray-600">{w.seller_id || 'Platform'}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                    w.status === 'processed' ? 'bg-green-100 text-green-700' :
                                    w.status === 'processing' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                    w.status === 'dead_letter' ? 'bg-purple-100 text-purple-700' : 'bg-yellow-100 text-yellow-750'
                                  }`}>{w.status === 'processed' ? 'Completado' : w.status === 'pending' ? 'Pendiente' : w.status === 'processing' ? 'Procesando' : w.status === 'failed' ? 'Error' : w.status}</span>
                                </td>
                                <td className="px-6 py-4 font-bold text-gray-700">{w.attempts || 0}</td>
                                <td className="px-6 py-4 text-gray-500">{new Date(w.received_at).toLocaleString()}</td>
                                <td className="px-6 py-4 text-right pr-6 whitespace-nowrap">
                                  <button 
                                    onClick={() => handleRetryEvent(w.id)}
                                    disabled={actionLoading}
                                    className="px-2 py-1 text-[9px] bg-slate-900 hover:bg-slate-800 text-white rounded font-bold transition-all active:scale-95"
                                  >
                                    Re-procesar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Diagnostic: Errores de Sincronización (DLQ Monitor) */}
                    {activeDiagTab === 'dlq' && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Resource</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Topic</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Seller</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Detalle Error</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                              <th className="px-6 py-3 text-right pr-6 text-xs font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {dlqList.map(d => (
                              <tr key={d.id} className="hover:bg-red-50/10">
                                <td className="px-6 py-4 font-mono text-red-700 font-bold">{d.resource}</td>
                                <td className="px-6 py-4">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-50 text-red-700 border border-red-100">{d.topic}</span>
                                </td>
                                <td className="px-6 py-4 text-gray-600">{d.seller_id}</td>
                                <td className="px-6 py-4 text-red-600 font-mono truncate max-w-[200px]" title={d.error_message || ''}>
                                  {d.error_message}
                                </td>
                                <td className="px-6 py-4 text-gray-500">{new Date(d.created_at).toLocaleString()}</td>
                                <td className="px-6 py-4 text-right pr-6 space-x-2 whitespace-nowrap">
                                  <button 
                                    onClick={() => handleRequeueDlq(d.event_id)}
                                    disabled={actionLoading}
                                    className="px-2 py-1 text-[9px] bg-green-600 hover:bg-green-700 text-white rounded font-bold transition-all active:scale-95"
                                  >
                                    Reintentar
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteDlq(d.id)}
                                    disabled={actionLoading}
                                    className="px-2 py-1 text-[9px] bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold transition-all active:scale-95"
                                  >
                                    Eliminar
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {dlqList.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                  <p className="font-bold text-gray-700 text-xs">Sin errores persistentes</p>
                                  <p className="text-[10px] text-gray-400 mt-1">Todos los eventos recibidos se procesaron correctamente.</p>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Diagnostic: Cuentas Conectadas (OAuth & Sellers) */}
                    {activeDiagTab === 'oauth' && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Vendedor (Nickname)</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Seller ID ML</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Expiración Token</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Estado</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">UUID Vendedor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {sellers.map(s => {
                              const hoursLeft = s.expires_at ? (new Date(s.expires_at).getTime() - Date.now()) / (1000 * 60 * 60) : 0;
                              const isExpired = hoursLeft <= 0;
                              const warning = hoursLeft > 0 && hoursLeft < 24;

                              return (
                                <tr key={s.id} className="hover:bg-gray-50/50">
                                  <td className="px-6 py-4 font-bold text-gray-900">
                                    {s.nickname || 'Plataforma / Tienda Oficial'}
                                  </td>
                                  <td className="px-6 py-4 font-mono text-gray-600">{s.seller_id}</td>
                                  <td className="px-6 py-4 text-gray-500">
                                    {s.expires_at ? new Date(s.expires_at).toLocaleString() : 'N/A'}
                                    {s.expires_at && (
                                      <span className="block text-[9px] text-gray-400 mt-0.5">
                                        {isExpired ? 'Expirado' : `Quedan ${Math.round(hoursLeft)} horas`}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                      isExpired ? 'bg-red-100 text-red-700' :
                                      warning ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                    }`}>
                                      {isExpired ? 'Expirado' : warning ? 'Advertencia' : 'Completado'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 font-mono text-gray-500">{s.vendor_id || 'Tienda Oficial (Platform)'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Diagnostic: Verificar stock (Stock Audit) */}
                    {activeDiagTab === 'stock' && (
                      <div className="p-5 flex-1 flex flex-col space-y-4">
                        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border">
                          <div>
                            <h4 className="font-bold text-slate-800 text-xs">Comparar existencias en el catálogo</h4>
                            <p className="text-[10px] text-gray-500 mt-0.5">Busca diferencias entre el stock maestro local, el stock del vendedor y Mercado Libre.</p>
                          </div>
                          <button 
                            onClick={handleRunStockAudit}
                            disabled={actionLoading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                          >
                            Verificar stock
                          </button>
                        </div>

                        {mismatches.length > 0 && (
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handleReconcile(mismatches.map(m => m.link_id), 'master_to_all')}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold"
                            >
                              Alinear: Local {"->"} Todo
                            </button>
                            <button 
                              onClick={() => handleReconcile(mismatches.map(m => m.link_id), 'ml_to_all')}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                            >
                              Alinear: ML {"->"} Todo
                            </button>
                          </div>
                        )}

                        <div className="overflow-x-auto border rounded-xl">
                          <table className="min-w-full divide-y divide-gray-200 text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">ID Publicación</th>
                                <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">SKU</th>
                                <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-widest bg-blue-50/10">Stock Local (Maestro)</th>
                                <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-widest bg-yellow-50/10">Stock Vendedor (Oferta)</th>
                                <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-widest bg-purple-50/10">Stock Mercado Libre</th>
                                <th className="px-6 py-3 text-right pr-6 text-xs font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {mismatches.map(m => (
                                <tr key={m.link_id} className="hover:bg-amber-50/10 bg-amber-50/5">
                                  <td className="px-6 py-4 font-mono text-gray-800 font-bold">{m.ml_item_id}</td>
                                  <td className="px-6 py-4 font-mono text-gray-500">{m.sku}</td>
                                  <td className="px-6 py-4 text-center font-bold text-blue-700 bg-blue-50/5">{m.master_stock} u.</td>
                                  <td className="px-6 py-4 text-center font-bold text-yellow-700 bg-yellow-50/5">{m.vendor_stock} u.</td>
                                  <td className="px-6 py-4 text-center font-bold text-purple-700 bg-purple-50/5">{m.staging_stock} u.</td>
                                  <td className="px-6 py-4 text-right pr-6 space-x-1.5 whitespace-nowrap">
                                    <button 
                                      onClick={() => handleReconcile([m.link_id], 'master_to_all')}
                                      disabled={actionLoading}
                                      className="px-2 py-1 text-[9px] bg-slate-900 hover:bg-slate-800 text-white rounded font-bold"
                                    >
                                      Usar Local
                                    </button>
                                    <button 
                                      onClick={() => handleReconcile([m.link_id], 'ml_to_all')}
                                      disabled={actionLoading}
                                      className="px-2 py-1 text-[9px] bg-blue-600 hover:bg-blue-750 text-white rounded font-bold"
                                    >
                                      Usar ML
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {mismatches.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                    <p className="font-bold text-gray-700 text-xs">Inventarios Alineados</p>
                                    <p className="text-[10px] text-gray-400 mt-1">Haz clic en "Verificar stock" para analizar consistencias.</p>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Diagnostic: Alertas */}
                    {activeDiagTab === 'alerts' && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Mensaje</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Tipo</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Severidad</th>
                              <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-widest">Repeticiones</th>
                              <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Último disparo</th>
                              <th className="px-6 py-3 text-right pr-6 text-xs font-black text-gray-500 uppercase tracking-widest">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {alerts.map(a => (
                              <tr key={a.id} className={`hover:bg-gray-50/50 ${a.resolved_at ? 'opacity-50' : ''}`}>
                                <td className="px-6 py-4 font-medium text-gray-900">
                                  {a.message}
                                  {a.details && (
                                    <pre className="text-[9px] text-gray-400 mt-1 font-mono max-h-12 overflow-y-auto whitespace-pre-wrap">{JSON.stringify(a.details)}</pre>
                                  )}
                                </td>
                                <td className="px-6 py-4 font-mono">{a.alert_type}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
                                    a.severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200' :
                                    a.severity === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                                  }`}>{a.severity === 'critical' ? 'Crítico' : a.severity === 'warning' ? 'Advertencia' : a.severity}</span>
                                </td>
                                <td className="px-6 py-4 text-center font-bold">{a.grouped_count || 1}</td>
                                <td className="px-6 py-4 text-gray-500">{new Date(a.last_triggered_at).toLocaleString()}</td>
                                <td className="px-6 py-4 text-right pr-6 whitespace-nowrap">
                                  {!a.resolved_at ? (
                                    <button 
                                      onClick={() => handleResolveAlert(a.id)}
                                      disabled={actionLoading}
                                      className="px-2 py-1 text-[9px] bg-slate-900 hover:bg-slate-800 text-white rounded font-bold"
                                    >
                                      Resolver
                                    </button>
                                  ) : (
                                    <span className="text-[9px] text-green-600 font-bold flex items-center gap-1 justify-end"><CheckCircle2 className="w-3.5 h-3.5" /> Resuelta</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {alerts.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No hay alertas registradas en el historial.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ═══ ML IMPORT SELECTOR MODAL ═══ */}
      {showImportModal && (
        <MLImportModal 
          onClose={() => setShowImportModal(false)} 
          onImport={(ids) => {
            setShowImportModal(false);
            // Trigger import action on edge function
            setActionLoading(true);
            setSyncLoading(true);
            callSyncEdge({ action: 'import', ml_item_ids: ids }).then(data => {
              toast.success(`Importación completada: ${data.count || data.results?.length || 0} ítems traídos a revisión.`);
              setRefreshTrigger(p => p + 1);
            }).catch(e => {
              toast.error('Error importando catálogo: ' + e.message);
            }).finally(() => {
              setActionLoading(false);
              setSyncLoading(false);
            });
          }}
          loading={actionLoading}
        />
      )}

      {/* ═══ FORM MODAL: EDIT staging raw metadata ═══ */}
      {showEditModal && selectedCurationItem && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white z-[60] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-gray-500" />
                Editar Datos del Producto
              </h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Título Curado / Limpio <span className="text-red-500">*</span></label>
                <input className="form-input w-full text-xs" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} placeholder="Ej: Funko Pop Harry Potter" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Categoría</label>
                  <select className="form-input w-full text-xs" value={editForm.suggested_category_id} onChange={e => setEditForm({...editForm, suggested_category_id: e.target.value})}>
                    <option value="">Selecciona...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Marca</label>
                  <select className="form-input w-full text-xs" value={editForm.brand_id} onChange={e => setEditForm({...editForm, brand_id: e.target.value})}>
                    <option value="">Selecciona...</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Universo / IP</label>
                  <input className="form-input w-full text-xs" value={editForm.detected_universe} onChange={e => setEditForm({...editForm, detected_universe: e.target.value})} placeholder="Marvel, DC, Star Wars..." />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Línea</label>
                  <input className="form-input w-full text-xs" value={editForm.detected_line} onChange={e => setEditForm({...editForm, detected_line: e.target.value})} placeholder="Marvel Legends, Pop!..." />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8 pt-4 border-t">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full transition-colors text-xs">Cancelar</button>
              <button onClick={saveEditCuration} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 w-full transition-colors flex items-center justify-center gap-2 text-xs shadow-md"><Save className="w-4 h-4" /> Guardar Cambios</button>
            </div>
          </div>
        </>
      )}

      {/* CREATE PRODUCT MODAL */}
      {showCreateModal && selectedCurationItem && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white z-[60] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Crear producto
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Título del Producto <span className="text-red-500">*</span></label>
                <input className="form-input w-full text-xs" value={createForm.title} onChange={e => setCreateForm({...createForm, title: e.target.value})} placeholder="Título del nuevo Coleccionable" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Descripción</label>
                <textarea className="form-input w-full h-24 text-xs font-sans" value={createForm.description} onChange={e => setCreateForm({...createForm, description: e.target.value})} placeholder="Escribe una descripción completa" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Precio Inicial (UYU)</label>
                  <input type="number" className="form-input w-full text-xs" value={createForm.price} onChange={e => setCreateForm({...createForm, price: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Inventario Inicial</label>
                  <input type="number" className="form-input w-full text-xs" value={createForm.stock} onChange={e => setCreateForm({...createForm, stock: Number(e.target.value)})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Categoría Catálogo <span className="text-red-500">*</span></label>
                  <select className="form-input w-full text-xs" value={createForm.category_id} onChange={e => setCreateForm({...createForm, category_id: e.target.value})}>
                    <option value="">Selecciona...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Marca Fabricante</label>
                  <select className="form-input w-full text-xs" value={createForm.brand_id} onChange={e => setCreateForm({...createForm, brand_id: e.target.value})}>
                    <option value="">Selecciona...</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Universo / IP</label>
                  <input className="form-input w-full text-xs" value={createForm.universe} onChange={e => setCreateForm({...createForm, universe: e.target.value})} placeholder="Ej: Marvel" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Línea de Colección</label>
                  <input className="form-input w-full text-xs" value={createForm.line} onChange={e => setCreateForm({...createForm, line: e.target.value})} placeholder="Ej: Funko POP" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2.5">Imagen Destacada (Principal)</label>
                <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
                  {(selectedCurationItem.raw_payload?.pictures || []).map((pic: any) => {
                    const imgUrl = pic.secure_url || pic.url || '';
                    const isSelected = createForm.selected_image === imgUrl;
                    return (
                      <div 
                        key={imgUrl} 
                        onClick={() => setCreateForm({...createForm, selected_image: imgUrl})}
                        className={`w-14 h-14 rounded-lg border-2 object-cover overflow-hidden flex-shrink-0 cursor-pointer transition-all ${isSelected ? 'border-blue-600 scale-95 shadow-md shadow-blue-500/20' : 'border-gray-200 opacity-60 hover:opacity-90'}`}
                      >
                        <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full transition-colors text-xs">Cancelar</button>
              <button onClick={executeCreateProduct} className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 w-full transition-colors flex items-center justify-center gap-2 text-xs"><Plus className="w-4 h-4" /> Crear y Vincular</button>
            </div>
          </div>
        </>
      )}

      {/* LINK PRODUCT TO EXISTING MASTER PRODUCT MODAL */}
      {showLinkModal && selectedCurationItem && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setShowLinkModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white z-[60] rounded-2xl shadow-2xl p-6 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Link2 className="w-5 h-5 text-gray-500" />
                Vincular producto
              </h3>
              <button onClick={() => setShowLinkModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4 flex-1 flex flex-col min-h-0">
              <div className="bg-slate-50 p-3 rounded-lg border text-xs">
                <span className="text-[9px] font-black uppercase text-gray-400 block">Producto de Mercado Libre:</span>
                <p className="font-bold text-gray-800 mt-0.5">{selectedCurationItem.title}</p>
                <p className="font-mono text-[10px] text-gray-400 mt-1">ID Publicación: {selectedCurationItem.ml_item_id} | SKU: {selectedCurationItem.raw_payload?.normalized_metadata?.extracted_seller_sku || 'Falta'}</p>
              </div>

              <div className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2 shadow-inner focus-within:ring-2 focus-within:ring-blue-500/20">
                <Search className="w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Buscar producto local por título..." 
                  className="text-xs bg-transparent outline-none w-full border-none ring-0 focus:ring-0" 
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                />
              </div>

              <div className="flex-1 overflow-y-auto divide-y border rounded-xl max-h-56">
                {foundProducts.map(p => {
                  const isSelected = selectedProductToLink?.id === p.id;
                  const mainImg = p.product_images?.find((img: any) => img.is_main)?.url || p.product_images?.[0]?.url || '';

                  return (
                    <div 
                      key={p.id} 
                      onClick={() => {
                        setSelectedProductToLink(p);
                        if (p.product_variants && p.product_variants.length > 0) {
                          setSelectedVariantId(p.product_variants[0].id);
                        }
                      }}
                      className={`p-3 flex gap-3 cursor-pointer hover:bg-blue-50/20 transition-all ${isSelected ? 'bg-blue-50/40 border-l-4 border-blue-600 pl-2' : ''}`}
                    >
                      <div className="w-10 h-10 bg-white border rounded object-cover overflow-shrink-0">
                        {mainImg ? <img src={mainImg} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-gray-300 m-auto mt-2.5" />}
                      </div>
                      <div className="text-xs flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate leading-snug">{p.title}</p>
                        <p className="text-[10px] text-gray-400 mt-1">Precio Local: UYU${p.base_price.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
                {linkSearch.trim().length > 1 && foundProducts.length === 0 && (
                  <p className="text-center py-8 text-xs text-gray-400 font-medium">No se encontraron productos coincidentes.</p>
                )}
                {linkSearch.trim().length <= 1 && (
                  <p className="text-center py-8 text-xs text-gray-400 font-medium">Escribe el título para comenzar a buscar.</p>
                )}
              </div>

              {selectedProductToLink && (
                <div className="bg-blue-50/50 p-4 border border-blue-100 rounded-xl space-y-3">
                  <h4 className="font-bold text-xs text-blue-900">Seleccionar Variante del Producto:</h4>
                  <div className="flex flex-col gap-2">
                    {selectedProductToLink.product_variants?.map((v: any) => (
                      <label key={v.id} className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer">
                        <input 
                          type="radio" 
                          name="variant_link_radio" 
                          checked={selectedVariantId === v.id}
                          onChange={() => setSelectedVariantId(v.id)}
                          className="text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        />
                        <span className="font-bold text-gray-900">{v.name}</span>
                        {v.sku && <span className="text-gray-400 font-mono text-[10px]">({v.sku})</span>}
                        <span className="ml-auto text-gray-500">Stock: {v.inventory_count} u.</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowLinkModal(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full transition-colors text-xs">Cancelar</button>
              <button 
                onClick={() => executeLinkProduct(selectedProductToLink.id, selectedVariantId)}
                disabled={!selectedProductToLink || !selectedVariantId}
                className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 w-full transition-colors flex items-center justify-center gap-2 text-xs disabled:opacity-50"
              >
                <Link2 className="w-4 h-4" /> Vincular ahora
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// Sub-component: ML Import Preview Modal (Spanish terminology applied)
function MLImportModal({ onClose, onImport, loading }: { onClose: () => void, onImport: (ids: string[]) => void, loading: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [fetchPhase, setFetchPhase] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(20);
  const [itemStatus, setItemStatus] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [orderBy, setOrderBy] = useState('relevance');

  const [categories, setCategories] = useState<any[]>([]);
  const [existingProducts, setExistingProducts] = useState<any[]>([]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchMLItems();
  }, [limit, itemStatus, orderBy]);

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('id, name, slug');
    setCategories(data || []);
  }

  function extractRealSkuFromML(item: any, variation: any = null) {
     let sku = null;
     let source = 'missing';
     const getFromAttr = (attrs: any[], code: string) => attrs?.find((a: any) => a.id === code)?.value_name;
     if (variation?.seller_custom_field) { sku = variation.seller_custom_field; source = 'seller_custom_field_var'; }
     else if (item.seller_custom_field) { sku = item.seller_custom_field; source = 'seller_custom_field'; }
     else if (getFromAttr(item.attributes, 'SELLER_SKU')) { sku = getFromAttr(item.attributes, 'SELLER_SKU'); source = 'seller_sku'; }
     else if (getFromAttr(item.attributes, 'SKU')) { sku = getFromAttr(item.attributes, 'SKU'); source = 'sku'; }
     else if (getFromAttr(item.attributes, 'GTIN')) { sku = getFromAttr(item.attributes, 'GTIN'); source = 'gtin'; }
     else if (getFromAttr(item.attributes, 'EAN')) { sku = getFromAttr(item.attributes, 'EAN'); source = 'ean'; }
     else if (getFromAttr(item.attributes, 'UPC')) { sku = getFromAttr(item.attributes, 'UPC'); source = 'upc'; }
     else if (getFromAttr(item.attributes, 'ISBN')) { sku = getFromAttr(item.attributes, 'ISBN'); source = 'isbn'; }
     if (!sku) { sku = null; source = 'missing'; }
     return { sku, source, generated_sku: `COL-ML-${item.id}` };
  }

  function getSuggestedCategory(title: string) {
    const t = title.toLowerCase();
    let slug = "otras-colecciones";
    if (t.includes("funko") || t.includes("pop!")) slug = "funko-pop";
    else if (t.includes("beyblade")) slug = "beyblade";
    else if (t.includes("panini") || t.includes("album") || t.includes("álbum") || t.includes("figuritas") || t.includes("sticker")) slug = "albumes-y-figuritas";
    else if (t.includes("peluche") || t.includes("plush") || t.includes("mascota")) slug = "peluches";
    else if (t.includes("mortal kombat") || t.includes("marvel legends") || t.includes("mcfarlane") || t.includes("neca") || t.includes("figura")) slug = "figuras-de-accion";
    else if (t.includes("lego")) slug = "lego";

    const match = categories.find(c => c.slug === slug) || categories.find(c => c.slug === 'otras-colecciones');
    return match ? match.name : 'Otra';
  }

  function getBrand(item: any) {
    return item.attributes?.find((a: any) => a.id === 'BRAND')?.value_name || 'Ninguna';
  }

  async function checkExistingProducts(newItems: any[]) {
      if (!newItems.length) return;
      const ids = newItems.map(i => i.id);
      const skus = newItems.map(i => extractRealSkuFromML(i).sku).filter(Boolean);

      const { data } = await supabase.from('products').select('id, title, ml_item_id, status, product_variants(sku)');
      if (data) {
          const relevant = data.filter((p: any) => {
              const pSku = p.product_variants?.[0]?.sku;
              return ids.includes(p.ml_item_id) || (pSku && skus.includes(pSku));
          });
          setExistingProducts(relevant);
      }
  }

  async function fetchMLItems() {
    setFetching(true);
    setFetchProgress(0);
    setFetchPhase('Buscando códigos en Mercado Libre...');
    setItems([]);
    try {
      const idsData = await callSyncEdge({ action: 'list_item_ids', limit, status: itemStatus, sort: orderBy });
      const allIds: string[] = idsData.item_ids || [];
      
      if (!allIds.length) {
        setItems([]);
        setFetching(false);
        return;
      }

      setFetchPhase(`Obteniendo detalles de ${allIds.length} publicaciones...`);
      const BATCH_SIZE = 50;
      const accumulated: any[] = [];
      
      for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const chunk = allIds.slice(i, i + BATCH_SIZE);
        const detailData = await callSyncEdge({ action: 'get_item_details', ml_ids: chunk });
        accumulated.push(...(detailData.items || []));
        setItems([...accumulated]);
        setFetchProgress(Math.round(((i + chunk.length) / allIds.length) * 100));
        await checkExistingProducts(detailData.items || []);
      }
      
      setFetchProgress(100);
    } catch (err: any) {
      console.error(err);
    } finally {
      setFetching(false);
      setFetchPhase('');
    }
  }

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-zoom-in">
        <div className="p-6 border-b flex items-center justify-between bg-gray-50 text-blue-900 border-blue-100">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              Seleccionar publicaciones a importar
            </h2>
            <div className="flex items-center flex-wrap gap-3 mt-3">
               <div className="flex items-center gap-2 mr-4 bg-white border border-blue-100 rounded-lg px-2.5 py-1.5 shadow-inner focus-within:ring-2 focus-within:ring-blue-500/20">
                 <Search className="w-3.5 h-3.5 text-gray-400" />
                 <input 
                   type="text" 
                   placeholder="Buscar publicaciones..." 
                   className="text-xs bg-transparent outline-none w-36 border-none ring-0 focus:ring-0" 
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                 />
               </div>

               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cant:</span>
               <select 
                 value={limit} 
                 onChange={(e) => setLimit(Number(e.target.value))}
                 className="text-xs font-bold bg-white border border-blue-200 text-blue-600 rounded-md px-2 py-1.5 outline-none shadow-sm"
               >
                 <option value={20}>20 productos</option>
                 <option value={50}>50 productos</option>
                 <option value={100}>100 productos</option>
                 <option value={-1}>Todos (Sin límite)</option>
               </select>

               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Estado:</span>
               <select 
                 value={itemStatus} 
                 onChange={(e) => setItemStatus(e.target.value)}
                 className="text-xs font-bold bg-white border border-blue-200 text-blue-600 rounded-md px-2 py-1.5 outline-none shadow-sm"
               >
                 <option value="active">Activas</option>
                 <option value="paused">Pausadas</option>
                 <option value="all">Todas</option>
               </select>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-0 bg-white">
          {fetching && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-blue-600">
              <RefreshCw className="w-10 h-10 animate-spin mb-4 text-blue-500" />
              <p className="font-bold text-xs">{fetchPhase || 'Sincronizando con Mercado Libre...'}</p>
              {fetchProgress > 0 && (
                <div className="w-64 mt-4">
                  <div className="flex justify-between text-[10px] font-black uppercase text-gray-400 mb-1">
                    <span>Progreso</span>
                    <span>{fetchProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${fetchProgress}%` }}></div>
                  </div>
                </div>
              )}
            </div>
          ) : !fetching && items.length === 0 ? (
            <div className="text-center py-24">
               <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
               <p className="text-gray-500 font-medium text-xs">No se encontraron productos activos.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b-2 border-gray-100 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest z-10">
                <tr>
                  <th className="p-4 w-12 pb-2">
                    <input 
                      type="checkbox" 
                      onChange={(e) => setSelected(e.target.checked ? new Set(filteredItems.map((i:any) => i.id)) : new Set())}
                      checked={selected.size === filteredItems.length && filteredItems.length > 0}
                      className="rounded border-gray-300 w-4 h-4 text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 pb-2 w-[30%]">Publicación en Mercado Libre</th>
                  <th className="p-4 pb-2 w-[20%]">SKU / Marca</th>
                  <th className="p-4 pb-2 w-[20%]">Precio / Stock</th>
                  <th className="p-4 pb-2 w-[15%]">Categoría sugerida</th>
                  <th className="p-4 pb-2 text-right pr-6 w-[15%]">Sugerencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredItems.map((item:any) => {
                  const skuInfo = extractRealSkuFromML(item);
                  const suggestedCat = getSuggestedCategory(item.title);
                  const brand = getBrand(item);
                  
                  let actionRec = 'Importar';
                  let matchReason = '';
                  
                  const exByMlId = existingProducts.find(p => p.ml_item_id === item.id);
                  const exBySku = existingProducts.find(p => p.product_variants?.[0]?.sku === skuInfo.sku && skuInfo.sku !== null);
                  
                  if (exByMlId) {
                      actionRec = 'Actualizar';
                      matchReason = 'Ya vinculado localmente';
                  } else if (exBySku) {
                      actionRec = 'Vincular';
                      matchReason = 'Coincide SKU con catálogo local';
                  }

                  return (
                    <tr key={item.id} className={`hover:bg-blue-50/20 transition-all ${selected.has(item.id) ? 'bg-blue-50/40' : ''}`}>
                      <td className="p-4 align-top">
                        <input 
                          type="checkbox" 
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-gray-300 text-blue-600 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="p-4 align-top">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded bg-gray-100 border object-cover overflow-hidden flex-shrink-0">
                             <img src={item.thumbnail?.replace('http://', 'https://')} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <p className="font-bold text-[12px] text-gray-800 leading-tight line-clamp-2">{item.title}</p>
                            <p className="text-[9px] text-gray-400 mt-1 font-mono">{item.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 align-top">
                         <div className="flex flex-col gap-1 text-[11px]">
                            {skuInfo.sku ? (
                               <span className="font-mono font-bold text-gray-700 bg-gray-150 px-1.5 py-0.5 rounded w-max">{skuInfo.sku}</span>
                            ) : (
                               <span className="font-mono text-[9px] text-orange-600 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded w-max">Sin SKU</span>
                            )}
                            <span className="text-[10px] font-bold text-gray-500 mt-1">Marca: {brand}</span>
                         </div>
                      </td>
                      <td className="p-4 align-top text-xs">
                         <div className="flex flex-col gap-0.5">
                            <span className="font-black text-blue-700">UYU ${item.price.toLocaleString()}</span>
                            <span className={`font-medium ${item.available_quantity > 0 ? 'text-green-600' : 'text-red-500'}`}>
                               {item.available_quantity || 0} disponibles
                            </span>
                         </div>
                      </td>
                      <td className="p-4 align-top text-xs">
                         <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100 truncate max-w-[120px] inline-block">{suggestedCat}</span>
                         {matchReason && (
                           <span className="block text-[9px] text-blue-600 mt-1 font-bold">{matchReason}</span>
                         )}
                      </td>
                      <td className="p-4 align-top text-right pr-6">
                         <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${actionRec === 'Importar' ? 'bg-green-150 text-green-700' : actionRec === 'Actualizar' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-750'}`}>
                           {actionRec}
                         </span>
                      </td>
                    </tr>
                  )})}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-5 border-t bg-white flex items-center justify-between relative z-20">
           <div className="flex flex-col">
              <span className="text-xs font-black text-blue-900">
                {selected.size} publicaciones seleccionadas para importar
              </span>
           </div>
           <div className="flex gap-3">
             <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-500 font-bold hover:bg-gray-100 text-xs transition-all">Cancelar</button>
             <button 
              onClick={() => onImport(Array.from(selected))}
              disabled={selected.size === 0 || loading}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-750 text-white font-black text-xs disabled:opacity-50 transition-all shadow-md active:scale-95"
             >
               {loading ? 'PROCESANDO...' : 'CONFIRMAR IMPORTACIÓN'}
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}

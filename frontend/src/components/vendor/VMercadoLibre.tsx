import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  RefreshCw, Link2, AlertTriangle, CheckCircle, Clock, Layers, 
  Search, ShieldAlert, Check, X, ToggleLeft, ToggleRight, ExternalLink
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

// Client-side cache to survive React unmounts when switching tabs
let cachedAccount: any = null;
let cachedClientId: string = '';
let cachedCategories: any[] = [];
let cachedItems: any[] = [];
let cachedLogs: any[] = [];
let cacheLoadedForUser: string | null = null;

export default function VMercadoLibre() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Connection states
  const [account, setAccount] = useState<any>(cachedAccount);
  const [loadingAccount, setLoadingAccount] = useState(!cachedAccount);
  const [dbClientId, setDbClientId] = useState(cachedClientId);
  
  // Staging items and links state
  const [items, setItems] = useState<any[]>(cachedItems);
  const [loadingItems, setLoadingItems] = useState(cachedItems.length === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Fast Job Queue states
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [pollingIntervalId, setPollingIntervalId] = useState<any | null>(null);

  // Logs state
  const [logs, setLogs] = useState<any[]>(cachedLogs);
  const [loadingLogs, setLoadingLogs] = useState(cachedLogs.length === 0);

  // Operation states
  const [actionLoading, setActionLoading] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [importSummaryReport, setImportSummaryReport] = useState<{
    total: number;
    imported: number;
    skipped: number;
    noEligible: number;
    errors: number;
  } | null>(null);
  
  // Import Filter states
  const [importStatusFilter, setImportStatusFilter] = useState('active');
  const [importLimitFilter, setImportLimitFilter] = useState('-1'); // -1 means All

  // Categories for publishing
  const [categories, setCategories] = useState<any[]>(cachedCategories);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});

  // Bulk Publish & Filters state
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [mlCategoryFilter, setMlCategoryFilter] = useState('all');
  const [mlBrandFilter, setMlBrandFilter] = useState('all');
  
  // Bulk Assign Category
  const [bulkCategory, setBulkCategory] = useState<string>('');

  useEffect(() => {
    if (user?.id) {
      if (cacheLoadedForUser !== user.id) {
        // Clear cache for new user session
        cachedAccount = null;
        cachedClientId = '';
        cachedCategories = [];
        cachedItems = [];
        cachedLogs = [];
        cacheLoadedForUser = user.id;

        // Reset state
        setAccount(null);
        setLoadingAccount(true);
        setDbClientId('');
        setCategories([]);
        setItems([]);
        setLoadingItems(true);
        setLogs([]);
        setLoadingLogs(true);
      }
      
      loadAccountDetails();
      loadClientId();
      loadCategories();
    }
  }, [user]);

  useEffect(() => {
    if (account?.seller_id) {
      loadItemsAndLinks();
      loadImportLogs();
      checkForActiveJobs();
    } else {
      setItems([]);
      setLogs([]);
      setLoadingItems(false);
      setLoadingLogs(false);
      setActiveJob(null);
      stopPollingJob();
    }
  }, [account, statusFilter]);

  useEffect(() => {
    return () => {
      if (pollingIntervalId) clearInterval(pollingIntervalId);
    };
  }, [pollingIntervalId]);

  async function checkForActiveJobs() {
    if (!account?.seller_id) return;
    try {
      const { data, error } = await supabase
        .from('ml_import_jobs')
        .select('*')
        .eq('seller_id', account.seller_id)
        .in('status', ['fetching_ids', 'pending', 'running', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        setActiveJob(data);
        startPollingJob(data.id);
      }
    } catch (err) {
      console.error("Error checking for active import jobs:", err);
    }
  }

  function startPollingJob(jobId: string) {
    stopPollingJob();
    
    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('ml_import_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (error) throw error;
        
        if (data) {
          setActiveJob(data);
          
          if (['completed', 'partial', 'failed', 'cancelled'].includes(data.status)) {
            clearInterval(interval);
            setPollingIntervalId(null);
            loadItemsAndLinks();
            loadImportLogs();
            toast.success(`Importación finalizada con estado: ${data.status}`);
          }
        }
      } catch (err) {
        console.error("Error polling job status:", err);
      }
    }, 3000);
    
    setPollingIntervalId(interval);
  }

  function stopPollingJob() {
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }
  }

  async function handlePublish(item: any) {
    const catId = selectedCategories[item.ml_item_id] || item.raw_payload?.normalized_metadata?.suggested_category_id;
    if (!catId) {
      toast.error('Selecciona una categoría para publicar');
      return;
    }

    setActionLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token || '';

      const res = await fetch(`${supabaseUrl}/functions/v1/mercadolibre-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'curate_create',
          raw_item_id: item.id,
          title: item.title,
          price: item.price,
          stock: item.available_quantity,
          category_id: catId,
          seller_id: account?.seller_id
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al publicar');
      }

      toast.success('Producto publicado y vinculado en tu tienda');
      loadItemsAndLinks(); // reload items to show updated sync toggles
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePublishBulk() {
    if (selectedItemIds.length === 0) return;
    
    // Check if all selected items have a category selected
    const missingCategories = selectedItemIds.filter(id => {
      const item = items.find(i => i.id === id);
      const catId = selectedCategories[item.ml_item_id] || item.raw_payload?.normalized_metadata?.suggested_category_id;
      return !catId;
    });

    if (missingCategories.length > 0) {
      toast.error('Selecciona una categoría para todos los productos seleccionados');
      return;
    }

    if (!confirm(`¿Estás seguro de publicar ${selectedItemIds.length} productos en tu tienda?`)) return;

    setActionLoading(true);
    let successCount = 0;
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token || '';

      for (const id of selectedItemIds) {
        const item = items.find(i => i.id === id);
        if (!item) continue;
        
        const catId = selectedCategories[item.ml_item_id] || item.raw_payload?.normalized_metadata?.suggested_category_id;

        const res = await fetch(`${supabaseUrl}/functions/v1/mercadolibre-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'curate_create',
            raw_item_id: item.id,
            title: item.title,
            price: item.price,
            stock: item.available_quantity,
            category_id: catId,
            seller_id: account?.seller_id
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          successCount++;
        }
      }

      toast.success(`${successCount} productos publicados y vinculados exitosamente`);
      setSelectedItemIds([]);
      loadItemsAndLinks();
    } catch (e: any) {
      toast.error(e.message || 'Error al publicar productos');
    } finally {
      setActionLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const { data } = await supabase.from('categories').select('id, name').order('name', { ascending: true });
      if (data) {
        setCategories(data);
        cachedCategories = data;
      }
    } catch (_e) { }
  }

  async function loadClientId() {
    try {
      const { data, error } = await supabase.rpc('get_public_ml_client_id');
      if (!error && data) {
        setDbClientId(data);
        cachedClientId = data;
      }
    } catch (_e) { /* best-effort */ }
  }

  async function loadAccountDetails() {
    if (!cachedAccount) setLoadingAccount(true);
    try {
      const { data, error } = await supabase
        .from('ml_seller_accounts')
        .select('*')
        .eq('vendor_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      setAccount(data || null);
      cachedAccount = data || null;
    } catch (err: any) {
      toast.error('Error al cargar la cuenta: ' + err.message);
    } finally {
      setLoadingAccount(false);
    }
  }

  async function loadItemsAndLinks() {
    if (cachedItems.length === 0) setLoadingItems(true);
    try {
      // Query raw items matching seller
      let query = supabase
        .from('ml_raw_items')
        .select('*, ml_catalog_links(sync_stock, sync_price, last_sync_status, last_synced_at, last_sync_error)')
        .eq('seller_id', account.seller_id)
        .order('updated_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
      cachedItems = data || [];
    } catch (err: any) {
      toast.error('Error al cargar items de catálogo: ' + err.message);
    } finally {
      setLoadingItems(false);
    }
  }

  async function loadImportLogs() {
    if (cachedLogs.length === 0) setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('ml_import_logs')
        .select('*')
        .eq('seller_id', account.seller_id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setLogs(data || []);
      cachedLogs = data || [];
    } catch (err: any) {
      toast.error('Error al cargar logs: ' + err.message);
    } finally {
      setLoadingLogs(false);
    }
  }

  // Connect Account OAuth Trigger
  function handleConnect() {
    const clientId = import.meta.env.VITE_ML_CLIENT_ID || dbClientId;
    if (!clientId) {
      toast.error('Configuración de Mercado Libre ausente (Falta Client ID).');
      return;
    }
    const redirectUri = `${window.location.origin}/vendor/ml/callback`;
    
    // Generate and store state token to prevent CSRF
    const stateToken = `vml_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
    localStorage.setItem('vml_oauth_state', stateToken);

    const authUrl = `https://auth.mercadolibre.com.uy/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${stateToken}`;
    
    toast.info('Redireccionando a Mercado Libre...');
    window.location.href = authUrl;
  }

  // Disconnect Account
  async function handleDisconnect() {
    if (!confirm('¿Deseas desconectar tu cuenta de Mercado Libre? Se detendrán todas las sincronizaciones.')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('ml_seller_accounts')
        .delete()
        .eq('vendor_id', user!.id);
      if (error) throw error;
      toast.success('Cuenta desconectada con éxito');
      setAccount(null);
      // Clear cache
      cachedAccount = null;
      cachedItems = [];
      cachedLogs = [];
    } catch (err: any) {
      toast.error('Error al desconectar: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Toggle Sync Settings
  async function toggleSyncSetting(mlItemId: string, setting: 'sync_stock' | 'sync_price', currentValue: boolean) {
    try {
      const { error } = await supabase
        .from('ml_catalog_links')
        .update({ [setting]: !currentValue })
        .eq('ml_item_id', mlItemId);

      if (error) throw error;
      toast.success('Sincronización actualizada');
      loadItemsAndLinks();
    } catch (err: any) {
      toast.error('Error al actualizar sincronización: ' + err.message);
    }
  }

  // Control handlers for active job
  async function handlePauseJob() {
    if (!activeJob) return;
    try {
      const { error } = await supabase
        .from('ml_import_jobs')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', activeJob.id);
      if (error) throw error;
      toast.success("Importación pausada.");
      setActiveJob({ ...activeJob, status: 'paused' });
    } catch (err: any) {
      toast.error("Error al pausar: " + err.message);
    }
  }

  async function handleResumeJob() {
    if (!activeJob) return;
    try {
      const { error } = await supabase
        .from('ml_import_jobs')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', activeJob.id);
      if (error) throw error;
      toast.success("Importación reanudada.");
      setActiveJob({ ...activeJob, status: 'pending' });
    } catch (err: any) {
      toast.error("Error al reanudar: " + err.message);
    }
  }

  async function handleCancelJob() {
    if (!activeJob) return;
    try {
      const { error } = await supabase
        .from('ml_import_jobs')
        .update({ status: 'cancelled', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', activeJob.id);
      if (error) throw error;
      
      await supabase
        .from('ml_import_job_items')
        .update({ status: 'cancelled' })
        .eq('job_id', activeJob.id)
        .eq('status', 'pending');
      
      toast.success("Importación cancelada.");
      stopPollingJob();
      setActiveJob(null);
      loadItemsAndLinks();
    } catch (err: any) {
      toast.error("Error al cancelar: " + err.message);
    }
  }

  async function handleRetryJobErrors() {
    if (!activeJob) return;
    try {
      const { error: itemsErr } = await supabase
        .from('ml_import_job_items')
        .update({ status: 'pending', attempts: 0, error_message: null, http_status: null })
        .eq('job_id', activeJob.id)
        .eq('status', 'failed');
      if (itemsErr) throw itemsErr;

      const { error: jobErr } = await supabase
        .from('ml_import_jobs')
        .update({ status: 'pending', error_items: 0, next_run_at: null, last_error: null, updated_at: new Date().toISOString() })
        .eq('id', activeJob.id);
      if (jobErr) throw jobErr;

      toast.success("Reintentando publicaciones con error...");
      setActiveJob({ ...activeJob, status: 'pending', error_items: 0, next_run_at: null, last_error: null });
      startPollingJob(activeJob.id);
    } catch (err: any) {
      toast.error("Error al reintentar: " + err.message);
    }
  }

  // Import Listings initial trigger (Fast Job Queue)
  async function handleImportListings() {
    if (actionLoading) return;
    setActionLoading(true);
    setImportProgress('Iniciando importación en segundo plano...');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token || '';

      // Call mercadolibre-sync to create import job
      const res = await fetch(`${supabaseUrl}/functions/v1/mercadolibre-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          action: 'create_import_job', 
          limit: parseInt(importLimitFilter), 
          status: importStatusFilter,
          seller_id: account?.seller_id 
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al iniciar la importación');
      }

      if (data.already_running) {
        toast.success("Ya tenés una importación en curso.");
      } else {
        toast.success(`Importación iniciada para ${data.total_items} publicaciones.`);
      }
      
      // Load and poll job
      const { data: jobData } = await supabase
        .from('ml_import_jobs')
        .select('*')
        .eq('id', data.job_id)
        .single();
      
      if (jobData) {
        setActiveJob(jobData);
        startPollingJob(jobData.id);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al iniciar importación');
    } finally {
      setActionLoading(false);
      setImportProgress('');
    }
  }

  // Derived options for filters
  const availableMlCategories = Array.from(new Set(items.map(i => i.raw_payload?.category_id).filter(Boolean)));
  const availableMlBrands = Array.from(new Set(items.map(i => {
    const rawAttrs = i.raw_payload?.attributes || [];
    return rawAttrs.find((a: any) => a.id === 'BRAND')?.value_name;
  }).filter(Boolean)));

  // Filter local items
  const filteredItems = items.filter(item => {
    const titleMatch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    const itemIdMatch = item.ml_item_id.toLowerCase().includes(searchQuery.toLowerCase());
    
    let mlCategoryMatch = true;
    if (mlCategoryFilter !== 'all') {
      mlCategoryMatch = item.raw_payload?.category_id === mlCategoryFilter;
    }

    let mlBrandMatch = true;
    if (mlBrandFilter !== 'all') {
      const rawAttrs = item.raw_payload?.attributes || [];
      const brand = rawAttrs.find((a: any) => a.id === 'BRAND')?.value_name;
      mlBrandMatch = brand === mlBrandFilter;
    }

    return (titleMatch || itemIdMatch) && mlCategoryMatch && mlBrandMatch;
  });

  return (
    <div className="space-y-8 animation-fade-in text-gray-900">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b border-gray-100 pb-4">
        <div>
           <h3 className="text-lg font-bold text-gray-900">Integración con Mercado Libre</h3>
           <p className="text-sm text-gray-500 mt-1">Sincronización bidireccional de catálogo, stock y precios</p>
        </div>
        
        {account && (
          <div className="flex gap-4">
            {(() => {
              const isTokenExpired = account?.expires_at ? new Date(account.expires_at) < new Date() : false;
              if (isTokenExpired) {
                return (
                  <button 
                    onClick={handleConnect}
                    className="bg-red-500 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <AlertTriangle className="w-4 h-4" /> 
                    Reautorizar Cuenta
                  </button>
                );
              }
              return (
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <select
                    value={importStatusFilter}
                    onChange={(e) => setImportStatusFilter(e.target.value)}
                    className="bg-white border border-gray-200 text-gray-700 text-sm font-medium px-3 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFE600]/50"
                    disabled={actionLoading}
                  >
                    <option value="active">Solo Activos</option>
                    <option value="all">Todos los estados</option>
                  </select>
                  
                  <select
                    value={importLimitFilter}
                    onChange={(e) => setImportLimitFilter(e.target.value)}
                    className="bg-white border border-gray-200 text-gray-700 text-sm font-medium px-3 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFE600]/50"
                    disabled={actionLoading}
                  >
                    <option value="-1">Importar Todos</option>
                    <option value="50">Últimos 50</option>
                    <option value="100">Últimos 100</option>
                  </select>

                  <button 
                    onClick={handleImportListings}
                    disabled={actionLoading}
                    className="bg-[#FFE600] text-black text-sm font-medium px-6 py-2.5 rounded-lg hover:brightness-95 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${actionLoading && 'animate-spin'}`} /> 
                    {actionLoading ? 'Procesando...' : 'Importar Publicaciones'}
                  </button>
                </div>
              );
            })()}

            <button 
              onClick={handleDisconnect}
              disabled={actionLoading}
              className="bg-white border border-gray-200 text-gray-700 text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors flex items-center gap-2 shadow-sm"
            >
              <X className="w-4 h-4" /> Desconectar
            </button>
          </div>
        )}
      </div>

      {importProgress && (
        <div className="bg-blue-650/10 border border-blue-500/20 p-4 rounded-3xl flex items-center gap-3 text-xs text-blue-400 animate-pulse animate-fade-in">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>{importProgress}</span>
        </div>
      )}

      {activeJob && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6 text-white shadow-xl relative overflow-hidden animate-fade-in">
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 ${
            activeJob.status === 'fetching_ids' ? 'bg-indigo-500' :
            activeJob.status === 'running' ? 'bg-blue-500' :
            activeJob.status === 'paused' ? 'bg-amber-500' :
            activeJob.status === 'failed' ? 'bg-red-500' :
            'bg-slate-500'
          }`} />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 relative z-10">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 text-yellow-400 ${['fetching_ids', 'running'].includes(activeJob.status) && 'animate-spin'}`} />
                Importación en Segundo Plano
              </h4>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">Job ID: {activeJob.id}</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 relative z-10">
              <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${
                activeJob.status === 'fetching_ids' ? 'bg-indigo-950 text-indigo-400 border-indigo-850 animate-pulse' :
                activeJob.status === 'running' ? 'bg-blue-950 text-blue-400 border-blue-800' :
                activeJob.status === 'paused' ? 'bg-amber-950 text-amber-400 border-amber-800' :
                activeJob.status === 'failed' ? 'bg-red-950 text-red-400 border-red-800' :
                activeJob.status === 'completed' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                activeJob.status === 'partial' ? 'bg-sky-950 text-sky-400 border-sky-800' :
                'bg-slate-950 text-slate-400 border-slate-800'
              }`}>
                {activeJob.status === 'fetching_ids' ? 'Escaneando Publicaciones' :
                 activeJob.status === 'running' ? (activeJob.next_run_at ? 'En Espera (Rate Limit)' : 'Procesando') :
                 activeJob.status === 'paused' ? 'Pausado' :
                 activeJob.status === 'failed' ? 'Fallado' :
                 activeJob.status === 'completed' ? 'Completado' :
                 activeJob.status === 'partial' ? 'Parcial (con errores)' :
                 activeJob.status === 'cancelled' ? 'Cancelado' : 'En cola / Pendiente'}
              </span>

              {activeJob.status === 'running' && (
                <button
                  onClick={handlePauseJob}
                  className="bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Pausar
                </button>
              )}

              {activeJob.status === 'paused' && (
                <button
                  onClick={handleResumeJob}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Reanudar
                </button>
              )}

              {activeJob.error_items > 0 && (activeJob.status === 'completed' || activeJob.status === 'partial' || activeJob.status === 'paused') && (
                <button
                  onClick={handleRetryJobErrors}
                  className="bg-blue-650 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Reintentar Errores
                </button>
              )}

              {['pending', 'running', 'paused', 'fetching_ids'].includes(activeJob.status) && (
                <button
                  onClick={handleCancelJob}
                  className="bg-red-650 hover:bg-red-750 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {(() => {
            const percent = activeJob.total_items > 0 
              ? Math.round((activeJob.processed_items / activeJob.total_items) * 100) 
              : 0;

            const isRateLimitPaused = activeJob.next_run_at && new Date(activeJob.next_run_at) > new Date();
            
            let estTimeStr = 'Calculando...';
            if (activeJob.estimated_finish_at) {
              const diffMs = new Date(activeJob.estimated_finish_at).getTime() - Date.now();
              const diffMins = Math.max(0, Math.ceil(diffMs / 60000));
              estTimeStr = diffMins > 60 
                ? `${Math.floor(diffMins / 60)}h ${diffMins % 60}m` 
                : `${diffMins} min`;
            } else if (activeJob.status === 'completed' || percent === 100) {
              estTimeStr = 'Finalizado';
            }

            const speed = activeJob.items_per_minute || 0;

            return (
              <div className="space-y-4 relative z-10">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span>Progreso de sincronización</span>
                  <span>{percent}% ({activeJob.processed_items} / {activeJob.total_items})</span>
                </div>
                
                <div className="w-full bg-slate-950 rounded-full h-3 border border-slate-800 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-yellow-400 to-[#FFE600] h-full rounded-full transition-all duration-500" 
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[10px] text-slate-400 border-t border-slate-800/50 pt-2">
                  <div className="flex items-center gap-4">
                    <span>
                      Velocidad actual: <span className="text-white font-bold">{speed} items/min</span>
                    </span>
                    <span>
                      Tiempo estimado: <span className="text-white font-bold">{estTimeStr}</span>
                    </span>
                  </div>

                  {activeJob.status === 'fetching_ids' && (
                    <span className="text-indigo-400 animate-pulse font-medium">
                      Obteniendo catálogo de Mercado Libre...
                    </span>
                  )}

                  {isRateLimitPaused && (
                    <span className="text-amber-400 font-bold animate-pulse flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Pausado por Rate Limit (429). Reanudando automáticamente...
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 relative z-10 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Detectado</span>
              <span className="text-lg font-black text-blue-400 block mt-1">{activeJob.total_items}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">En Cola</span>
              <span className="text-lg font-black text-slate-300 block mt-1">
                {activeJob.total_items - activeJob.processed_items}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Procesados</span>
              <span className="text-lg font-black text-purple-400 block mt-1">{activeJob.processed_items}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Importados</span>
              <span className="text-lg font-black text-emerald-400 block mt-1">{activeJob.imported_items}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Omitidos</span>
              <span className="text-lg font-black text-amber-400 block mt-1">{activeJob.skipped_items}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Errores</span>
              <span className="text-lg font-black text-red-500 block mt-1">{activeJob.error_items}</span>
            </div>
          </div>

          {/* Last Error display if any */}
          {activeJob.last_error && (
            <div className="bg-red-950/20 border border-red-800/40 p-4 rounded-xl text-xs text-red-400 relative z-10 flex gap-2 items-start font-mono">
              <span className="font-bold uppercase shrink-0">Último error:</span>
              <span>{activeJob.last_error}</span>
            </div>
          )}
        </div>
      )}

      {importSummaryReport && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Resultado de la última importación
            </h4>
            <button 
              onClick={() => setImportSummaryReport(null)}
              className="text-xs text-slate-400 hover:text-white underline font-bold"
            >
              Cerrar Reporte
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-black">Importados</div>
              <div className="text-xl font-black text-emerald-400 mt-1">{importSummaryReport.imported}</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-black">Omitidos</div>
              <div className="text-xl font-black text-amber-400 mt-1">{importSummaryReport.skipped}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Pausados / Sin stock</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-black">No Elegibles</div>
              <div className="text-xl font-black text-rose-400 mt-1">{importSummaryReport.noEligible}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Cerrados / Inactivos</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-black">Con Error</div>
              <div className="text-xl font-black text-red-500 mt-1">{importSummaryReport.errors}</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-black">Total Detectados</div>
              <div className="text-xl font-black text-white mt-1">{importSummaryReport.total}</div>
            </div>
          </div>
        </div>
      )}

      {/* Account connection status */}
      {account && account.expires_at && new Date(account.expires_at) < new Date() && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-3xl flex items-center gap-3 text-xs text-red-500 font-bold mb-4">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Tu conexión con Mercado Libre venció. Volvé a conectar tu cuenta para reanudar la sincronización.</span>
        </div>
      )}
      {loadingAccount ? (
        <div className="bg-white rounded-[2.5rem] border border-gray-200 p-12 text-center text-gray-500 animate-pulse text-xs uppercase tracking-widest">
          Cargando configuración de Mercado Libre...
        </div>
      ) : !account ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center space-y-4">
          <div className="w-12 h-12 bg-[#FFE600]/20 rounded-full flex items-center justify-center mx-auto">
            <Link2 className="w-6 h-6 text-[#b3a100]" />
          </div>
          <div className="max-w-sm mx-auto space-y-1">
            <h3 className="text-base font-bold text-gray-900">Conectar tu Tienda</h3>
            <p className="text-sm text-gray-500">
              Sincroniza stock bidireccionalmente y automatiza tu inventario en la plataforma.
            </p>
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 text-left">
              <p className="font-bold mb-1">¡Atención!</p>
              <p>Se abrirá Mercado Libre para autorizar tu cuenta. Si ya tenés una sesión iniciada, se conectará esa cuenta automáticamente. Si querés conectar otra cuenta distinta, <strong>cerrá sesión en Mercado Libre antes de continuar</strong>.</p>
            </div>
          </div>
          <button 
            onClick={handleConnect}
            className="bg-[#FFE600] text-black text-sm font-medium px-8 py-2.5 rounded-lg hover:brightness-95 transition-all mt-4"
          >
            Conectar Mercado Libre
          </button>
        </div>
      ) : (
        <>
          {/* Quick Connection Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <MiniStat label="Nick Mercado Libre" value={account.nickname} color="yellow" />
            <MiniStat label="Vendedor ID" value={account.seller_id} color="blue" />
            <MiniStat label="Items en Staging" value={items.length} color="purple" />
            <MiniStat label="Estado de Conexión" value="Conectado" color="green" />
          </div>

          {/* Sync Matrix */}
          <div className="bg-white rounded-[2.5rem] border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-10 md:p-12 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
               <div className="flex items-center gap-6">
                 <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center shadow-sm">
                    <Layers className="w-6 h-6 text-primary-600" />
                 </div>
                 <div>
                   <h3 className="text-[12px] font-black text-gray-900 uppercase tracking-[0.5em]">Staging Catalog Matrix</h3>
                   <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Items importados y vinculaciones del catálogo</p>
                 </div>
               </div>

               <div className="flex gap-2">
                 {selectedItemIds.length > 0 && (
                   <div className="flex items-center gap-2 mr-2 bg-blue-50 border border-blue-200 rounded-xl p-1 pr-2 shadow-sm">
                     <select
                       value={bulkCategory}
                       onChange={(e) => {
                         const newCat = e.target.value;
                         setBulkCategory(newCat);
                         if (newCat) {
                           const updates: Record<string, string> = {};
                           selectedItemIds.forEach(id => {
                             const item = items.find(i => i.id === id);
                             if (item) updates[item.ml_item_id] = newCat;
                           });
                           setSelectedCategories(prev => ({ ...prev, ...updates }));
                           toast.success(`Categoría asignada a ${selectedItemIds.length} ítems`);
                         }
                       }}
                       className="bg-white border border-gray-200 text-gray-700 text-xs px-2 py-1.5 rounded outline-none w-40 font-bold"
                     >
                       <option value="">Asignar Categoría...</option>
                       {categories.map(cat => (
                         <option key={cat.id} value={cat.id}>{cat.name}</option>
                       ))}
                     </select>
                     
                     <button 
                       onClick={handlePublishBulk}
                       disabled={actionLoading}
                       className="bg-blue-600 text-white text-xs font-bold px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                     >
                       Publicar {selectedItemIds.length}
                     </button>
                   </div>
                 )}

                 <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 shadow-inner focus-within:ring-2 focus-within:ring-pink-500/20">
                   <Search className="w-4 h-4 text-gray-500" />
                   <input 
                     type="text" 
                     placeholder="Buscar por título o ID..." 
                     className="text-xs bg-transparent outline-none w-48 border-none ring-0 focus:ring-0 text-gray-900" 
                     value={searchQuery}
                     onChange={e => setSearchQuery(e.target.value)}
                   />
                 </div>
                 
                 <select
                   value={statusFilter}
                   onChange={e => setStatusFilter(e.target.value)}
                   className="text-xs font-bold bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-2 py-2 outline-none cursor-pointer"
                 >
                   <option value="all">Ver Todos (Estados)</option>
                   <option value="review_needed">Revisión Requerida</option>
                   <option value="pending">Pendientes</option>
                   <option value="approved">Aprobados</option>
                   <option value="ignored">Ignorados</option>
                 </select>

                 <select
                   value={mlCategoryFilter}
                   onChange={e => setMlCategoryFilter(e.target.value)}
                   className="text-xs font-bold bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-2 py-2 outline-none cursor-pointer"
                 >
                   <option value="all">Todas las Categorías ML</option>
                   {availableMlCategories.map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                   ))}
                 </select>

                 <select
                   value={mlBrandFilter}
                   onChange={e => setMlBrandFilter(e.target.value)}
                   className="text-xs font-bold bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-2 py-2 outline-none cursor-pointer"
                 >
                   <option value="all">Todas las Marcas</option>
                   {availableMlBrands.map(brand => (
                     <option key={brand} value={brand}>{brand}</option>
                   ))}
                 </select>
               </div>
            </div>

            <div className="overflow-x-auto ">
              {loadingItems ? (
                <div className="text-center py-20 text-gray-500 text-xs">Cargando catálogo en staging...</div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-20 text-gray-500 text-xs">No se encontraron ítems.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em]">
                      <th className="p-4 w-12 text-center">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={filteredItems.length > 0 && selectedItemIds.length === filteredItems.filter(i => !i.ml_catalog_links?.[0] && i.status !== 'ignored').length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItemIds(filteredItems.filter(i => !i.ml_catalog_links?.[0] && i.status !== 'ignored').map(i => i.id));
                            } else {
                              setSelectedItemIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="p-4">Publicación / ID</th>
                      <th className="p-4 text-left">SKU</th>
                      <th className="p-4 text-center">Estado Staging</th>
                      <th className="p-4 text-right">Precio Staging</th>
                      <th className="p-4 text-center">Stock Staging</th>
                      <th className="p-4 text-center">Sincronizar Stock</th>
                      <th className="p-4 text-center">Sincronizar Precio</th>
                      <th className="p-4">Estado Sync</th>
                      <th className="p-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredItems.map(item => {
                      const link = item.ml_catalog_links?.[0];
                      const isLinked = !!link;
                      
                      const rawAttrs = item.raw_payload?.attributes || [];
                      const skuFallback = rawAttrs.find((a: any) => a.id === 'SELLER_SKU' || a.id === 'SKU')?.value_name;
                      const sku = item.raw_payload?.seller_custom_field || item.raw_payload?.normalized_metadata?.extracted_seller_sku || skuFallback || '—';

                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors group text-xs">
                          <td className="p-4 text-center">
                            {!isLinked && item.status !== 'ignored' && (
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={selectedItemIds.includes(item.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedItemIds(prev => [...prev, item.id]);
                                  else setSelectedItemIds(prev => prev.filter(id => id !== item.id));
                                }}
                              />
                            )}
                          </td>
                          <td className="p-4">
                             <div className="flex items-center gap-3">
                               <img src={item.thumbnail} alt="" className="w-10 h-10 object-cover border border-gray-200 rounded" />
                               <div className="min-w-0">
                                 <p className="font-black text-gray-900 text-[16px] group-hover:text-primary-600 transition-colors uppercase tracking-tight truncate max-w-sm">{item.title}</p>
                                 <div className="flex items-center gap-2 mt-1">
                                   <span className="font-mono text-[9px] text-gray-500 uppercase bg-gray-50 px-2 py-0.5 rounded">{item.ml_item_id}</span>
                                   <a href={item.permalink} target="_blank" rel="noreferrer" title="Ver en Mercado Libre" className="text-gray-500 hover:text-gray-900">
                                     <ExternalLink className="w-3.5 h-3.5" />
                                   </a>
                                 </div>
                               </div>
                             </div>
                          </td>
                          <td className="p-4 font-mono text-[10px] text-gray-600 uppercase">
                            {sku}
                          </td>
                          <td className="p-4 text-center">
                             <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-black tracking-wider ${
                               item.status === 'approved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                               item.status === 'review_needed' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                               item.status === 'ignored' ? 'bg-gray-100 text-gray-500' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                             }`}>
                               {item.status}
                             </span>
                          </td>
                          <td className="p-4 text-right text-[15px] font-black tracking-tighter">${Math.round(item.price)}</td>
                          <td className="p-4 text-center font-black text-[15px] tracking-tighter">{item.available_quantity} u.</td>
                          
                          {/* Sync Stock Toggle */}
                          <td className="p-4 text-center">
                            {isLinked ? (
                              <button 
                                onClick={() => toggleSyncSetting(item.ml_item_id, 'sync_stock', link.sync_stock)}
                                className="text-gray-500 hover:text-gray-900 transition-colors"
                              >
                                {link.sync_stock ? <ToggleRight className="w-8 h-8 text-pink-600" /> : <ToggleLeft className="w-8 h-8" />}
                              </button>
                            ) : <span className="text-[10px] text-gray-400 italic">No Vinculado</span>}
                          </td>

                          {/* Sync Price Toggle */}
                          <td className="p-4 text-center">
                            {isLinked ? (
                              <button 
                                onClick={() => toggleSyncSetting(item.ml_item_id, 'sync_price', link.sync_price)}
                                className="text-gray-500 hover:text-gray-900 transition-colors"
                              >
                                {link.sync_price ? <ToggleRight className="w-8 h-8 text-pink-600" /> : <ToggleLeft className="w-8 h-8" />}
                              </button>
                            ) : <span className="text-[10px] text-gray-400 italic">No Vinculado</span>}
                          </td>

                          <td className="p-4 font-medium">
                             {isLinked ? (
                               link.last_sync_status === 'synced' ? (
                                 <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Sincronizado</span>
                               ) : (
                                 <span className="text-red-400 flex items-center gap-1" title={link.last_sync_error || 'Fallo desconocido'}><ShieldAlert className="w-3.5 h-3.5" /> Fallido</span>
                               )
                             ) : '—'}
                          </td>

                          {/* Acciones */}
                          <td className="p-4 text-center min-w-[200px]">
                            {!isLinked && item.status !== 'ignored' ? (
                              <div className="flex flex-col gap-2">
                                <select 
                                  className="bg-white border border-gray-200 text-gray-700 text-[10px] px-2 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-full"
                                  value={selectedCategories[item.ml_item_id] || item.raw_payload?.normalized_metadata?.suggested_category_id || ''}
                                  onChange={(e) => setSelectedCategories(prev => ({ ...prev, [item.ml_item_id]: e.target.value }))}
                                >
                                  <option value="" disabled>Selecciona categoría...</option>
                                  {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handlePublish(item)}
                                  disabled={actionLoading}
                                  className="bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors w-full"
                                >
                                  Publicar en tienda
                                </button>
                              </div>
                            ) : isLinked ? (
                              <span className="text-[10px] text-gray-400 italic">Producto Activo</span>
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Logs Panel */}
          <div className="bg-white rounded-[2.5rem] border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-10 md:p-12 border-b border-gray-100 bg-gray-50 flex items-center gap-6">
               <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-gray-500" />
               </div>
               <div>
                 <h3 className="text-[12px] font-black text-gray-900 uppercase tracking-[0.5em]">Event Log / System Activity</h3>
                 <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Historial reciente de sincronizaciones y errores</p>
               </div>
            </div>
            
            <div className="overflow-x-auto ">
              {loadingLogs ? (
                <div className="text-center py-10 text-gray-500 text-xs">Cargando historial de eventos...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-xs">No hay actividad reciente en el historial.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <tbody className="divide-y divide-gray-100">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors group text-xs">
                        <td className="p-4 text-gray-500 font-black uppercase tracking-[0.2em] w-48">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-4 font-black text-gray-900 text-[15px] uppercase tracking-widest group-hover:text-primary-600 group-hover:translate-x-2 transition-all">
                          {log.action}
                        </td>
                        <td className="p-4 text-gray-500 font-medium">
                          {JSON.stringify(log.details)}
                        </td>
                        <td className="p-4">
                           <span className={`px-2.5 py-1.5 rounded-full shadow-lg text-[9px] uppercase font-black tracking-wider ${
                             log.status === 'success' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                           }`}>
                             {log.status === 'success' ? 'OK' : 'Error'}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  const getTheme = () => {
    if (color === 'yellow') return 'text-[#FFE600] group-hover:text-[#FFE600]';
    if (color === 'blue') return 'text-blue-400 group-hover:text-blue-500';
    if (color === 'green') return 'text-emerald-400 group-hover:text-emerald-500';
    return 'text-purple-400 group-hover:text-purple-500';
  };

  return (
    <div className="soft rounded-[2rem] p-10 group hover:bg-gray-50 transition-all border border-gray-100 hover:border-primary-300 shadow-sm overflow-hidden relative bg-white/[0.01]">
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-gray-50 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
      <p className={`text-4xl font-black mb-3 tracking-tighter relative z-10 truncate ${getTheme()}`}>{value}</p>
      <p className="text-[10px] font-black text-slate-650 uppercase tracking-[0.4em] relative z-10 group-hover:text-gray-500 transition-colors">{label}</p>
    </div>
  );
}

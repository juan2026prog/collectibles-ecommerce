import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Activity, RefreshCw, AlertCircle, CheckCircle2, Play, Settings, ShieldCheck, 
  Layers, ExternalLink, AlertTriangle, TrendingUp, Clock, ArrowRight, Search, 
  Sliders, Link, HelpCircle, Ban, Trash2, Mail
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

async function callSyncEdgeFunction(body: any) {
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

async function callWebhookEdgeFunction(body: any) {
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

export default function AdminMLOperations() {
  const [activeTab, setActiveTab] = useState<'metrics' | 'queue' | 'webhooks' | 'dlq' | 'oauth' | 'stock' | 'alerts'>('metrics');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  // Metrics & Stats
  const [stats, setStats] = useState({
    syncQueuePending: 0,
    syncQueueFailed: 0,
    webhookPending: 0,
    webhookProcessed: 0,
    webhookFailed: 0,
    dlqCount: 0,
    expiringTokens: 0,
    stockMismatches: 0,
    unlinkedMismatches: 0,
    totalOrdersML: 0,
    totalOrdersWeb: 0,
    latencyAvg: 0,
    failureRate: 0,
  });

  // Table Data State
  const [syncQueue, setSyncQueue] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [dlqList, setDlqList] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [mismatches, setMismatches] = useState<any[]>([]);

  // Search & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Emergency Kill Switch State
  const [webhooksEnabled, setWebhooksEnabled] = useState(true);

  useEffect(() => {
    fetchStatsAndData();
  }, [refreshTrigger, activeTab]);

  async function fetchStatsAndData() {
    setLoading(true);
    try {
      // 1. Fetch Sync Queue Stats
      const { data: qStats } = await supabase.from('ml_sync_queue').select('status');
      const qPending = qStats?.filter(q => q.status === 'pending').length || 0;
      const qFailed = qStats?.filter(q => q.status === 'failed').length || 0;

      // 2. Fetch Webhook Stats
      const { data: wStats } = await supabase.from('ml_incoming_events').select('status, processed_at, received_at');
      const wPending = wStats?.filter(w => w.status === 'pending' || w.status === 'processing').length || 0;
      const wProcessed = wStats?.filter(w => w.status === 'processed').length || 0;
      const wFailed = wStats?.filter(w => w.status === 'failed' || w.status === 'dead_letter').length || 0;

      // Calculate Latency Avg
      let totalLat = 0;
      let latCount = 0;
      wStats?.forEach(w => {
        if (w.processed_at && w.received_at) {
          const lat = new Date(w.processed_at).getTime() - new Date(w.received_at).getTime();
          totalLat += lat;
          latCount++;
        }
      });
      const avgLat = latCount > 0 ? Math.round(totalLat / latCount) : 0;
      const failRate = wStats && wStats.length > 0 ? Math.round((wFailed / wStats.length) * 100) : 0;

      // 3. Fetch DLQ Count
      const { count: dlqCount } = await supabase.from('ml_dead_letter_queue').select('*', { count: 'exact', head: true });

      // 4. Fetch Sellers & Token Expiry
      const { data: dbSellers } = await supabase.from('ml_seller_accounts').select('*');
      const expiring = dbSellers?.filter(s => {
        if (!s.expires_at) return true;
        const hoursLeft = (new Date(s.expires_at).getTime() - Date.now()) / (1000 * 60 * 60);
        return hoursLeft < 24; // Less than 24 hours left or expired
      }).length || 0;

      // 5. Fetch Orders segment
      const { count: mlOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).not('ml_order_id', 'is', null);
      const { count: webOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).is('ml_order_id', null);

      // 6. Fetch Catalog Links
      const { count: linkCount } = await supabase.from('ml_catalog_links').select('*', { count: 'exact', head: true });

      // Fetch Kill Switch status
      const { data: wsSetting } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'ml_webhooks_enabled')
        .maybeSingle();
      setWebhooksEnabled(wsSetting?.value !== 'false');

      setStats({
        syncQueuePending: qPending,
        syncQueueFailed: qFailed,
        webhookPending: wPending,
        webhookProcessed: wProcessed,
        webhookFailed: wFailed,
        dlqCount: dlqCount || 0,
        expiringTokens: expiring,
        stockMismatches: mismatches.length,
        unlinkedMismatches: linkCount === 0 ? 0 : 0, // Placeholder
        totalOrdersML: mlOrders || 0,
        totalOrdersWeb: webOrders || 0,
        latencyAvg: avgLat,
        failureRate: failRate,
      });

      // Load Tab-specific data
      if (activeTab === 'queue') {
        const { data } = await supabase
          .from('ml_sync_queue')
          .select('*, products(title)')
          .order('created_at', { ascending: false })
          .limit(50);
        setSyncQueue(data || []);
      } else if (activeTab === 'webhooks') {
        const { data } = await supabase
          .from('ml_incoming_events')
          .select('*')
          .order('received_at', { ascending: false })
          .limit(50);
        setWebhooks(data || []);
      } else if (activeTab === 'dlq') {
        const { data } = await supabase
          .from('ml_dead_letter_queue')
          .select('*')
          .order('created_at', { ascending: false });
        setDlqList(data || []);
      } else if (activeTab === 'oauth') {
        setSellers(dbSellers || []);
      } else if (activeTab === 'alerts') {
        const { data } = await supabase
          .from('ml_alerts')
          .select('*')
          .order('last_triggered_at', { ascending: false })
          .limit(50);
        setAlerts(data || []);
      }
    } catch (e: any) {
      toast.error('Error cargando operaciones: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  // Trigger webhooks sweep
  async function handleSweepWebhooks() {
    setActionLoading(true);
    try {
      const data = await callWebhookEdgeFunction({ action: 'sweep' });
      toast.success(`Barrido de webhooks completado: ${data.swept_count} procesados.`);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error en barrido: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Trigger sync queue worker
  async function handleProcessSyncQueue() {
    setActionLoading(true);
    try {
      const data = await callSyncEdgeFunction({ action: 'process_sync_queue' });
      toast.success(`Cola de sincronización procesada: ${data.processed_count || 0} envíos a ML realizados.`);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error en procesador de cola: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Stock Audit action
  async function handleRunStockAudit() {
    setActionLoading(true);
    try {
      const data = await callSyncEdgeFunction({ action: 'stock_audit' });
      setMismatches(data.report || []);
      setStats(prev => ({ ...prev, stockMismatches: data.mismatch_count }));
      toast.success(`Auditoría de stock finalizada. Inconsistencias: ${data.mismatch_count}`);
      setActiveTab('stock');
    } catch (e: any) {
      toast.error('Error en auditoría de stock: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Manual Reconcile action
  async function handleReconcile(linkIds: string[], target: 'master_to_all' | 'ml_to_all') {
    if (!(await confirm(`¿Estás seguro de alinear el stock para los registros seleccionados? Modo: ${target === 'master_to_all' ? 'Coleccionable -> Todos' : 'Mercado Libre -> Todos'}`))) return;
    setActionLoading(true);
    try {
      const data = await callSyncEdgeFunction({ action: 'manual_reconcile', link_ids: linkIds, target });
      const successCount = data.results?.filter((r: any) => r.status === 'success').length || 0;
      toast.success(`Reconciliación completada: ${successCount} alineados correctamente.`);
      handleRunStockAudit(); // Rerun audit
    } catch (e: any) {
      toast.error('Error reconciliando: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // DLQ Requeue action (database reset status to pending)
  async function handleRequeueDlq(eventId: string) {
    if (!(await confirm('¿Re-encolar este evento fallido? Volverá a estado Pendiente para re-intento.'))) return;
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
      toast.success('Evento re-encolado. Ejecuta el Barrido de Webhooks para procesar.');
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error al re-encolar: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Retry event action directly calling edge function process_event
  async function handleRetryEvent(eventId: string) {
    setActionLoading(true);
    try {
      await callWebhookEdgeFunction({ action: 'process_event', event_id: eventId });
      toast.success('Procesamiento forzado del webhook finalizado.');
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Fallo en re-intento: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Resolve Alert action
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

  // Delete DLQ entry
  async function handleDeleteDlq(id: string) {
    if (!(await confirm('¿Eliminar definitivamente este reporte de error?', { danger: true }))) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('ml_dead_letter_queue').delete().eq('id', id);
      if (error) throw error;
      toast.success('Reporte eliminado de la DLQ.');
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Toggle Kill Switch
  async function handleToggleKillSwitch() {
    const nextState = !webhooksEnabled;
    const actionText = nextState ? 'ACTIVAR' : 'DESACTIVAR';
    
    if (!(await confirm(`¿Estás seguro de que deseas ${actionText} el procesamiento en tiempo real de webhooks de Mercado Libre?`))) {
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
      toast.success(`Integración Mercado Libre ${nextState ? 'activada' : 'desactivada'} exitosamente.`);
    } catch (e: any) {
      toast.error('Error al cambiar el interruptor de emergencia: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <Activity className="w-7 h-7 text-red-500 animate-pulse" />
            Operations Center: Mercado Libre Enterprise
          </h2>
          <p className="text-gray-500 mt-1">Monitoreo de colas, resiliencia de inventario, auditoría de stock y alertas operativas.</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={handleSweepWebhooks} 
            disabled={actionLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md shadow-blue-500/10 transition-all active:scale-95 disabled:opacity-50"
          >
            {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Barrido Webhooks
          </button>
          
          <button 
            onClick={handleProcessSyncQueue} 
            disabled={actionLoading}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-yellow-950 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md shadow-yellow-500/10 transition-all active:scale-95 disabled:opacity-50"
          >
            {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Procesar Sync Queue
          </button>

          <button 
            onClick={handleRunStockAudit} 
            disabled={actionLoading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md shadow-purple-500/10 transition-all active:scale-95 disabled:opacity-50"
          >
            {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Auditar Stock (Catálogo)
          </button>

          {/* Emergency Kill Switch */}
          <div className="flex items-center gap-3 px-3 py-1 bg-gray-50 border rounded-xl shadow-inner">
            <span className={`w-2.5 h-2.5 rounded-full ${webhooksEnabled ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-black text-gray-400 leading-none">Webhooks ML</span>
              <span className="text-[11px] font-bold text-gray-800 mt-0.5">{webhooksEnabled ? 'Activos' : 'Apagados'}</span>
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

          <button 
            onClick={() => setRefreshTrigger(p => p + 1)}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl border transition-all active:scale-95"
            title="Refrescar datos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Operations Overview Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Sync Queue Pending Widget */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-lg relative overflow-hidden flex flex-col justify-between h-32">
          <div>
             <div className="flex justify-between items-center">
               <span className="text-[10px] tracking-widest font-black uppercase text-slate-400">Sync Queue</span>
               <Layers className="w-4 h-4 text-yellow-400" />
             </div>
             <h4 className="text-2xl font-black mt-2">{stats.syncQueuePending} <span className="text-xs font-bold text-slate-500">pending</span></h4>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Fallas en cola: {stats.syncQueueFailed}</p>
        </div>

        {/* Webhook Stream Latency */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-lg relative overflow-hidden flex flex-col justify-between h-32">
          <div>
             <div className="flex justify-between items-center">
               <span className="text-[10px] tracking-widest font-black uppercase text-slate-400">Webhook Latency</span>
               <Clock className="w-4 h-4 text-blue-400" />
             </div>
             <h4 className="text-2xl font-black mt-2">{stats.latencyAvg} <span className="text-xs font-bold text-slate-500">ms avg</span></h4>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Tasa fallas: {stats.failureRate}% | Pendientes: {stats.webhookPending}</p>
        </div>

        {/* Dead Letter Queue Widget */}
        <div className={`rounded-2xl p-5 border shadow-lg relative overflow-hidden flex flex-col justify-between h-32 text-white ${stats.dlqCount > 0 ? 'bg-red-950/80 border-red-900 shadow-red-900/5' : 'bg-slate-900 border-slate-800'}`}>
          <div>
             <div className="flex justify-between items-center">
               <span className="text-[10px] tracking-widest font-black uppercase text-slate-400">Dead Letter Queue</span>
               <AlertCircle className={`w-4 h-4 ${stats.dlqCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-500'}`} />
             </div>
             <h4 className="text-2xl font-black mt-2">{stats.dlqCount} <span className="text-xs font-bold text-slate-500">errores persistentes</span></h4>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Requieren inspección manual</p>
        </div>

        {/* Stock Mismatch Widget */}
        <div className={`rounded-2xl p-5 border shadow-lg relative overflow-hidden flex flex-col justify-between h-32 text-white ${stats.stockMismatches > 0 ? 'bg-amber-950/80 border-amber-900 shadow-amber-900/5' : 'bg-slate-900 border-slate-800'}`}>
          <div>
             <div className="flex justify-between items-center">
               <span className="text-[10px] tracking-widest font-black uppercase text-slate-400">Stock Mismatch</span>
               <AlertTriangle className={`w-4 h-4 ${stats.stockMismatches > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
             </div>
             <h4 className="text-2xl font-black mt-2">{stats.stockMismatches} <span className="text-xs font-bold text-slate-500">desalineados</span></h4>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Pedidos ML: {stats.totalOrdersML} | Web: {stats.totalOrdersWeb}</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b overflow-x-auto scrollbar-hide bg-white rounded-xl shadow-sm border p-1">
        {[
          { id: 'metrics', name: 'Métricas de Red', icon: TrendingUp },
          { id: 'queue', name: 'Sync Queue', icon: Layers },
          { id: 'webhooks', name: 'Webhooks Ingestados', icon: Clock },
          { id: 'dlq', name: 'DLQ Monitor', icon: AlertCircle },
          { id: 'oauth', name: 'OAuth & Sellers', icon: Sliders },
          { id: 'stock', name: 'Auditoría Stock', icon: ShieldCheck },
          { id: 'alerts', name: 'Historial de Alertas', icon: AlertTriangle }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
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

      {/* Workspace Area */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden min-h-[450px] flex flex-col">
        {loading ? (
          <div className="flex flex-col items-center justify-center my-auto py-24 text-gray-400 animate-pulse">
            <RefreshCw className="w-10 h-10 animate-spin mb-3 text-gray-300" />
            <span className="text-sm font-medium">Cargando operaciones en tiempo real...</span>
          </div>
        ) : (
          <>
            {/* ═══ TAB: METRICS ═══ */}
            {activeTab === 'metrics' && (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Webhook Traffic Metrics */}
                  <div className="border rounded-xl p-5 space-y-4">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                      <Clock className="w-5 h-5 text-blue-600" /> Trazabilidad de Webhooks
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-xl text-center border">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Procesados OK</p>
                        <p className="text-2xl font-black text-green-600 mt-1">{stats.webhookProcessed}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl text-center border">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Fallidos/DLQ</p>
                        <p className="text-2xl font-black text-red-600 mt-1">{stats.webhookFailed}</p>
                      </div>
                    </div>
                    <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 space-y-1">
                      <p><strong>Idempotencia:</strong> Protegida mediante índice único `(resource, sent_at)`.</p>
                      <p><strong>Anti-Spam:</strong> Filtra y esquiva eventos duplicados en menos de 50ms.</p>
                    </div>
                  </div>

                  {/* Channel Orders Breakdown */}
                  <div className="border rounded-xl p-5 space-y-4">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                      <TrendingUp className="w-5 h-5 text-purple-600" /> Rendimiento de Canales
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-xl text-center border">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Órdenes Mercado Libre</p>
                        <p className="text-2xl font-black text-blue-600 mt-1">{stats.totalOrdersML}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl text-center border">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Órdenes Storefront Web</p>
                        <p className="text-2xl font-black text-slate-700 mt-1">{stats.totalOrdersWeb}</p>
                      </div>
                    </div>
                    <div className="p-3.5 bg-purple-50 border border-purple-100 rounded-xl text-xs text-purple-800 space-y-1">
                      <p><strong>Inventario Doble:</strong> Cada compra reduce tanto la variante maestra como la oferta vendor.</p>
                      <p><strong>Aislamiento:</strong> RLS activo garantiza que los vendedores no interfieran en compras ajenas.</p>
                    </div>
                  </div>
                </div>

                {/* System Diagnostics Box */}
                <div className="bg-slate-900 text-white rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-sm text-yellow-400 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" /> Diagnóstico y Salud de Integración
                    </h4>
                    <p className="text-xs text-slate-300 mt-1">Inspección de tokens vencidos, queues colgadas y fallos de infraestructura.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleRunStockAudit} className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-white rounded-lg text-xs font-bold border border-slate-700">
                      Ejecutar Auto-Diagnóstico Stock
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ TAB: SYNC QUEUE ═══ */}
            {activeTab === 'queue' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Producto</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">ML Item ID</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Acción</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Reintentos</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Último Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {syncQueue.map(q => (
                      <tr key={q.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 font-bold text-gray-900">
                          {q.products?.title || 'Desconocido'}
                          <span className="text-[10px] text-gray-400 block font-mono mt-0.5">{q.variant_id}</span>
                        </td>
                        <td className="px-6 py-4 font-mono text-blue-600">{q.ml_item_id}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-gray-100 text-gray-700">{q.action}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            q.status === 'processed' ? 'bg-green-150 text-green-700' :
                            q.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-750'
                          }`}>{q.status}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-700">{q.retry_count || 0}/3</td>
                        <td className="px-6 py-4 text-xs text-red-600 font-mono truncate max-w-[200px]" title={q.last_error || ''}>
                          {q.last_error || 'Ninguno'}
                        </td>
                      </tr>
                    ))}
                    {syncQueue.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No hay tareas pendientes en la cola de sincronización.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ═══ TAB: WEBHOOKS ═══ */}
            {activeTab === 'webhooks' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Resource</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Topic</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Seller</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Intentos</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Fecha Recibido</th>
                      <th className="px-6 py-3 text-right pr-6 text-xs font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {webhooks.map(w => (
                      <tr key={w.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 font-mono text-xs text-gray-800">{w.resource}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-100">{w.topic}</span>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-gray-600">{w.seller_id || 'Platform'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            w.status === 'processed' ? 'bg-green-100 text-green-700' :
                            w.status === 'processing' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                            w.status === 'dead_letter' ? 'bg-purple-100 text-purple-700' : 'bg-yellow-100 text-yellow-750'
                          }`}>{w.status}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-700">{w.attempts || 0}</td>
                        <td className="px-6 py-4 text-xs text-gray-500">{new Date(w.received_at).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right pr-6 whitespace-nowrap">
                          <button 
                            onClick={() => handleRetryEvent(w.id)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-white rounded font-bold transition-all active:scale-95 disabled:opacity-50"
                          >
                            Forzar Proc.
                          </button>
                        </td>
                      </tr>
                    ))}
                    {webhooks.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">No se encontraron eventos de webhooks registrados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ═══ TAB: DLQ MONITOR ═══ */}
            {activeTab === 'dlq' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Resource</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Topic</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Seller</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Detalle Error</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Registrado</th>
                      <th className="px-6 py-3 text-right pr-6 text-xs font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {dlqList.map(d => (
                      <tr key={d.id} className="hover:bg-red-50/10">
                        <td className="px-6 py-4 font-mono text-xs text-red-700 font-bold">{d.resource}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-50 text-red-700 border border-red-100">{d.topic}</span>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-gray-600">{d.seller_id}</td>
                        <td className="px-6 py-4 text-xs text-red-600 font-mono truncate max-w-[200px]" title={d.error_message || ''}>
                          {d.error_message}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">{new Date(d.created_at).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right pr-6 space-x-2 whitespace-nowrap">
                          <button 
                            onClick={() => handleRequeueDlq(d.event_id)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 text-[10px] bg-green-600 hover:bg-green-700 text-white rounded font-bold transition-all active:scale-95"
                          >
                            Re-encolar
                          </button>
                          <button 
                            onClick={() => handleDeleteDlq(d.id)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 text-[10px] bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold transition-all active:scale-95"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {dlqList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                          <p className="font-bold text-gray-700">¡DLQ Vacía!</p>
                          <p className="text-xs text-gray-400">Todos los eventos de webhooks se procesan exitosamente.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ═══ TAB: OAUTH MONITOR ═══ */}
            {activeTab === 'oauth' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Vendedor (Nickname)</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Seller ID ML</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Expiración Token</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Token Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Vendor UUID</th>
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
                          <td className="px-6 py-4 text-xs font-medium">
                            {s.expires_at ? new Date(s.expires_at).toLocaleString() : 'N/A'}
                            {s.expires_at && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">
                                {isExpired ? 'Expirado' : `Quedan ${Math.round(hoursLeft)} horas`}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                              isExpired ? 'bg-red-100 text-red-700' :
                              warning ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {isExpired ? 'Expired' : warning ? 'Warning' : 'Active'}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-gray-500">{s.vendor_id || 'Tienda Oficial (Platform)'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ═══ TAB: AUDITORIA STOCK ═══ */}
            {activeTab === 'stock' && (
              <div className="flex-1 flex flex-col p-6 space-y-4">
                <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border">
                  <div>
                    <h3 className="font-bold text-gray-900">Reporte de Conciliación de Stock</h3>
                    <p className="text-xs text-gray-500 mt-1">Diferencias detectadas entre el inventario de variantes maestras, ofertas vendor y Mercado Libre.</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleReconcile(mismatches.map(m => m.link_id), 'master_to_all')}
                      disabled={actionLoading || mismatches.length === 0}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Reconciliar: Local {"->"} Todo
                    </button>
                    <button 
                      onClick={() => handleReconcile(mismatches.map(m => m.link_id), 'ml_to_all')}
                      disabled={actionLoading || mismatches.length === 0}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Reconciliar: ML {"->"} Todo
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">ML Item ID</th>
                        <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">SKU</th>
                        <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-widest bg-blue-50/20">Stock Master (Local)</th>
                        <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-widest bg-yellow-50/20">Stock Vendor (Offer)</th>
                        <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-widest bg-purple-50/20">Stock Staging (ML)</th>
                        <th className="px-6 py-3 text-right pr-6 text-xs font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {mismatches.map(m => (
                        <tr key={m.link_id} className="hover:bg-amber-50/20 bg-amber-50/10">
                          <td className="px-6 py-4 font-mono text-xs font-bold text-gray-700">
                            {m.ml_item_id}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-gray-500">{m.sku}</td>
                          <td className="px-6 py-4 text-center font-bold text-blue-700 bg-blue-50/10">{m.master_stock} u.</td>
                          <td className="px-6 py-4 text-center font-bold text-yellow-750 bg-yellow-50/10">{m.vendor_stock} u.</td>
                          <td className="px-6 py-4 text-center font-bold text-purple-700 bg-purple-50/10">{m.staging_stock} u.</td>
                          <td className="px-6 py-4 text-right pr-6 space-x-2 whitespace-nowrap">
                            <button 
                              onClick={() => handleReconcile([m.link_id], 'master_to_all')}
                              disabled={actionLoading}
                              className="px-2.5 py-1 text-[10px] bg-slate-900 hover:bg-slate-800 text-white rounded font-bold active:scale-95"
                            >
                              Sync Local
                            </button>
                            <button 
                              onClick={() => handleReconcile([m.link_id], 'ml_to_all')}
                              disabled={actionLoading}
                              className="px-2.5 py-1 text-[10px] bg-blue-600 hover:bg-blue-750 text-white rounded font-bold active:scale-95"
                            >
                              Sync ML
                            </button>
                          </td>
                        </tr>
                      ))}
                      {mismatches.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-16 text-center text-gray-500">
                            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                            <p className="font-bold text-lg text-gray-700">¡Catálogo en Perfecta Armonía!</p>
                            <p className="text-xs text-gray-400">Ejecuta la "Auditoría de Stock" arriba para contrastar inventarios.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══ TAB: ALERTS HISTORIAL ═══ */}
            {activeTab === 'alerts' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Mensaje de Alerta</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Tipo</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Severidad</th>
                      <th className="px-6 py-3 text-center text-xs font-black text-gray-500 uppercase tracking-widest">Repeticiones</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Último Disparo</th>
                      <th className="px-6 py-3 text-right pr-6 text-xs font-black text-gray-500 uppercase tracking-widest">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {alerts.map(a => (
                      <tr key={a.id} className={`hover:bg-gray-50/50 ${a.resolved_at ? 'opacity-50' : ''}`}>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {a.message}
                          {a.details && (
                            <pre className="text-[10px] text-gray-400 mt-1 font-mono max-h-16 overflow-y-auto whitespace-pre-wrap">{JSON.stringify(a.details)}</pre>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">{a.alert_type}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            a.severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200' :
                            a.severity === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>{a.severity}</span>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-gray-800">{a.grouped_count || 1}</td>
                        <td className="px-6 py-4 text-xs text-gray-500">{new Date(a.last_triggered_at).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right pr-6 whitespace-nowrap">
                          {!a.resolved_at ? (
                            <button 
                              onClick={() => handleResolveAlert(a.id)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-white rounded font-bold active:scale-95"
                            >
                              Resolver
                            </button>
                          ) : (
                            <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 justify-end"><CheckCircle2 className="w-3.5 h-3.5" /> Resuelta</span>
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
  );
}

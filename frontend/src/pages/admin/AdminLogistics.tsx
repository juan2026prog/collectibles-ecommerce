import React, { useState, useEffect } from 'react';
import {
  Truck, MapPin, Save, QrCode, FileText, CheckCircle2, ChevronRight, X, Edit2, Check,
  ToggleLeft, ToggleRight, Settings, Info, AlertCircle, RefreshCw, Calculator, Plus, Trash2,
  Eye, Activity
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { supabase } from '../../lib/supabase';
import { updateCachedSettings } from '../../hooks/useSiteSettings';

const INITIAL_ZONES = {
  near: { price: 169, label: 'Zonas cercanas', id: 'near', subzones: ['Zona 5', 'Zona 6', 'Zona 7'], barrios: [
    'Buceo','Carrasco','Carrasco Norte','Flor de Maroñas','Las Canteras','Malvín','Malvín Norte','Maroñas','Playa Verde','Pocitos Nuevo','Puerto Buceo','Punta Gorda','Unión',
    'Aguada','Barrio Sur','Centro','Ciudad Vieja','Cordón','Goes','Jacinto Vera','La Blanqueada','La Comercial','La Figurita','Larrañaga','Palermo','Parque Batlle','Parque Rodó','Pocitos','Punta Carretas','Reducto','Tres Cruces','Villa Biarritz','Villa Dolores','Villa Muñoz',
    'Aires Puros','Arroyo Seco','Atahualpa','Bella Vista','Belvedere','Bolívar','Brazo Oriental','Capurro','Casavalle','Castro','Cerrito','Ituzaingó','Jardines Hipódromo','La Teja','Las Acacias','Lavalleja','Marconi','Paso de las Duranas','Paso Molino','Peñarol','Piedras Blancas','Prado','Sayago','Villa Española'
  ] },
  medium: { price: 200, label: 'Zonas de media distancia', id: 'medium', subzones: ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 10'], barrios: [
    'Casabó','Cerro','La Paloma','Nuevo París','Pajas Blancas','Paso de la Arena','Punta Espinillo','Santiago Vázquez','Tres Ombúes','Victoria','Villa del Cerro',
    'Abayubá','Colón','Conciliación','Cuchilla Pereira','Lezica','Melilla',
    'Manga','Toledo Chico','Villa García',
    'Bañados de Carrasco','Bella Italia','Chacarita','Punta Rieles',
    'Ciudad de la Costa','Colinas de Carrasco','El Pinar','Lagomar','Lomas de Solymar','Parque Carrasco','Paso de Carrasco','Shangrilá','Solymar'
  ] },
  far: { price: 290, label: 'Zonas lejanas', id: 'far', subzones: ['Zona 8', 'Zona 9', 'Zona 11'], barrios: [
    'La Paz','Las Piedras','Progreso',
    'Barros Blancos','Joaquín Suárez','Pando','Toledo',
    'Ciudad de Canelones'
  ] }
};

export default function AdminLogistics() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'soydelivery' | 'dac' | 'general' | 'ues' | 'control-tower'>('dashboard');

  // Dashboard Stats State
  const [dbStats, setDbStats] = useState<{
    statusCounts: Record<string, number>;
    queuedCount: number;
    failedQueueCount: number;
    monitors: any[];
    topCouriers: { provider: string; count: number }[];
    topVendors: { vendor: string; count: number }[];
    avgSla: { provider: string; avgMins: number }[];
  }>({
    statusCounts: {},
    queuedCount: 0,
    failedQueueCount: 0,
    monitors: [],
    topCouriers: [],
    topVendors: [],
    avgSla: []
  });
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Operational Dashboard Shipments & Queue Lists
  const [adminShipments, setAdminShipments] = useState<any[]>([]);
  const [adminQueue, setAdminQueue] = useState<any[]>([]);
  const [latestEvents, setLatestEvents] = useState<Record<string, any>>({});
  
  // Card filter selection
  const [selectedCardFilter, setSelectedCardFilter] = useState<string>('all');

  // Filter toolbar inputs
  const [filterSearch, setFilterSearch] = useState('');
  const [filterCourier, setFilterCourier] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [filterSla, setFilterSla] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week'>('all');
  
  // Unique vendors list for filtering
  const [uniqueVendors, setUniqueVendors] = useState<string[]>([]);

  // Detailed Timeline modal state
  const [selectedTimelineShipment, setSelectedTimelineShipment] = useState<any | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [selectedRawResponse, setSelectedRawResponse] = useState<any | null>(null);

  // Alertas visuales state
  const [visualAlerts, setVisualAlerts] = useState<string[]>([]);

  async function loadDashboardData() {
    setLoadingDashboard(true);
    try {
      // 1. Fetch shipments with suborders details
      const { data: shipData, error: shipErr } = await supabase
        .from('shipments')
        .select(`
          *,
          suborder:order_suborders(
            id, suborder_number, vendor_id, shipping_method, shipping_provider, vendor_store_name,
            order_items(quantity, products(title))
          )
        `)
        .order('created_at', { ascending: false });

      if (shipErr) throw shipErr;
      const list = shipData || [];
      setAdminShipments(list);

      // Extract unique vendors for dropdown
      const vendorsSet = new Set<string>();
      list.forEach((s: any) => {
        const vName = s.suborder?.vendor_store_name || 'Collectibles';
        vendorsSet.add(vName);
      });
      setUniqueVendors(Array.from(vendorsSet));

      // 2. Fetch shipping queue items
      const { data: queueData } = await supabase
        .from('shipping_queue')
        .select('*');
      setAdminQueue(queueData || []);

      // 3. Fetch monitors
      const { data: monitorData } = await supabase
        .from('shipping_monitor')
        .select('*')
        .order('provider_code');

      // 4. Fetch latest event per shipment
      if (list.length > 0) {
        const shipIds = list.map(s => s.id);
        const { data: evData } = await supabase
          .from('shipment_events')
          .select('shipment_id, event_type, description, created_at')
          .in('shipment_id', shipIds)
          .order('created_at', { ascending: true }); // Chronological order
        
        const evMap: Record<string, any> = {};
        if (evData) {
          evData.forEach(e => {
            evMap[e.shipment_id] = e; // Keep the latest event
          });
        }
        setLatestEvents(evMap);
      }

      // Compute statistics counts
      const statusMap: Record<string, number> = {};
      const courierMap: Record<string, number> = {};
      const slaTotals: Record<string, { sum: number; count: number }> = {};
      let queuedCount = 0;
      let failedQueueCount = 0;

      list.forEach(s => {
        const status = s.shipping_status || 'unknown';
        statusMap[status] = (statusMap[status] || 0) + 1;

        const prov = s.provider_key || 'unknown';
        courierMap[prov] = (courierMap[prov] || 0) + 1;

        if (s.guide_created_at && s.created_at) {
          const diff = new Date(s.guide_created_at).getTime() - new Date(s.created_at).getTime();
          const mins = Math.max(0, diff / 60000);
          if (!slaTotals[prov]) {
            slaTotals[prov] = { sum: 0, count: 0 };
          }
          slaTotals[prov].sum += mins;
          slaTotals[prov].count += 1;
        }
      });

      if (queueData) {
        queueData.forEach(q => {
          if (q.status === 'queued') queuedCount++;
          if (q.status === 'failed' || q.status === 'retrying') failedQueueCount++;
        });
      }

      const topVendors = Array.from(vendorsSet).map(vendor => {
        const count = list.filter((s: any) => (s.suborder?.vendor_store_name || 'Collectibles') === vendor).length;
        return { vendor, count };
      }).sort((a, b) => b.count - a.count).slice(0, 5);

      const topCouriers = Object.entries(courierMap)
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count);

      const avgSla = Object.entries(slaTotals).map(([provider, details]) => ({
        provider,
        avgMins: Math.round(details.sum / details.count)
      }));

      setDbStats({
        statusCounts: statusMap,
        queuedCount,
        failedQueueCount,
        monitors: monitorData || [],
        topCouriers,
        topVendors,
        avgSla
      });

      // 5. Generate operational alerts dynamically
      const alertsList: string[] = [];
      
      monitorData?.forEach(m => {
        if (m.status === 'offline') {
          alertsList.push(`Alerta: Courier ${m.provider_code.toUpperCase()} se encuentra CAÍDO (offline).`);
        } else if (m.status === 'degraded' || (m.request_count > 0 && m.error_count / m.request_count > 0.3)) {
          alertsList.push(`Alerta: Courier ${m.provider_code.toUpperCase()} presenta alta tasa de errores (${Math.round((m.error_count / m.request_count) * 100)}%).`);
        }
      });

      const failedCount = list.filter(s => s.shipping_status === 'failed').length;
      if (failedCount > 0) {
        alertsList.push(`Advertencia: Existen ${failedCount} envíos con estado fallido (failed) permanente.`);
      }

      const fifteenMinsAgo = new Date(Date.now() - 15 * 60000);
      const delayedQueue = (queueData || []).filter(q => q.status === 'queued' && new Date(q.created_at) < fifteenMinsAgo).length;
      if (delayedQueue > 0) {
        alertsList.push(`Advertencia: Hay ${delayedQueue} envíos retrasados en cola por más de 15 minutos.`);
      }

      let slaBreaches = 0;
      list.forEach(s => {
        if (!s.guide_created_at && (Date.now() - new Date(s.created_at).getTime()) > 4 * 3600000) {
          slaBreaches++;
        }
      });
      if (slaBreaches > 0) {
        alertsList.push(`Advertencia: Se detectaron ${slaBreaches} guías pendientes de creación fuera del SLA de 4 horas.`);
      }

      setVisualAlerts(alertsList);

    } catch (err: any) {
      console.error("Error loading logistics dashboard data:", err.message);
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function handleRetryQueue(queueId: string, shipmentId: string) {
    try {
      const { error: queueErr } = await supabase
        .from('shipping_queue')
        .update({
          status: 'queued',
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          last_error: null
        })
        .eq('id', queueId);

      if (queueErr) throw queueErr;

      const { error: shipErr } = await supabase
        .from('shipments')
        .update({
          shipping_status: 'queued',
          error_message: null
        })
        .eq('id', shipmentId);

      if (shipErr) throw shipErr;

      await supabase.from('shipment_events').insert({
        shipment_id: shipmentId,
        event_type: 'queued',
        description: 'Administrador reinició manualmente la cola para reintento de envío.',
        provider_status: 'queued',
        created_by: 'admin'
      });

      toast.success("Envío encolado para reintento correctamente");
      loadDashboardData();
    } catch (err: any) {
      toast.error(`Error al reintentar: ${err.message}`);
    }
  }

  async function handleMarkResolved(shipmentId: string) {
    try {
      const { error } = await supabase
        .from('shipments')
        .update({
          shipping_status: 'ready_to_ship',
          error_message: null
        })
        .eq('id', shipmentId);

      if (error) throw error;

      await supabase.from('shipment_events').insert({
        shipment_id: shipmentId,
        event_type: 'resolved',
        description: 'Administrador marcó manualmente el envío como resuelto.',
        provider_status: 'resolved',
        created_by: 'admin'
      });

      toast.success("Envío marcado como resuelto");
      loadDashboardData();
    } catch (err: any) {
      toast.error(`Error al marcar como resuelto: ${err.message}`);
    }
  }

  async function viewTimeline(shipment: any) {
    setSelectedTimelineShipment(shipment);
    setLoadingTimeline(true);
    try {
      const { data, error } = await supabase
        .from('shipment_events')
        .select('*')
        .eq('shipment_id', shipment.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTimelineEvents(data || []);
    } catch (err: any) {
      toast.error(`Error al cargar el historial: ${err.message}`);
    } finally {
      setLoadingTimeline(false);
    }
  }

  function copyDiagnostic(s: any) {
    const qItem = adminQueue.find(q => q.shipment_id === s.id);
    const diag = `[DIAGNÓSTICO TÉCNICO LOGÍSTICO]
Shipment ID: ${s.id}
Suborden: COL-${s.suborder?.suborder_number || 'N/A'}
Vendor: ${s.suborder?.vendor_store_name || 'Collectibles'}
Courier: ${s.provider_key.toUpperCase()}
Estado: ${s.shipping_status}
Tracking Real: ${s.tracking_code || 'PENDIENTE'}
Referencia: ${s.internal_reference}
Bulto: ${s.package_number} de ${s.total_packages}
Intentos Cola: ${qItem?.attempts || 0}
Último Error: ${s.error_message || qItem?.last_error || 'Ninguno'}`;

    navigator.clipboard.writeText(diag);
    toast.success("Diagnóstico copiado al portapapeles");
  }

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboardData();
    }
  }, [activeTab]);
  
  // SoyDelivery state
  const [flexActive, setFlexActive] = useState(true);
  const [zonesData, setZonesData] = useState(INITIAL_ZONES);
  const [selectedZones, setSelectedZones] = useState<string[]>(['near', 'medium', 'far']);
  
  // UI States
  const [viewingZone, setViewingZone] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  const [sameday, setSameday] = useState(true);
  const [weekdayCutoff, setWeekdayCutoff] = useState('15:00');
  const [saturdayCutoff, setSaturdayCutoff] = useState('13:00');
  const [dacCutoff, setDacCutoff] = useState('14:00');
  const [saturdayActive, setSaturdayActive] = useState(true);
  const [sundayActive, setSundayActive] = useState(false);
  const [maxOrders, setMaxOrders] = useState('50');

  const [interiorPrice, setInteriorPrice] = useState('280');
  const [labelFormat, setLabelFormat] = useState('zebra');

  // SoyDelivery API Keys
  const [settings, setSettings] = useState<Record<string, string>>({});
  
  // DAC Config States
  const [dacEnabled, setDacEnabled] = useState(false);
  const [dacUsername, setDacUsername] = useState('');
  const [dacPassword, setDacPassword] = useState('');
  const [dacEnv, setDacEnv] = useState<'uat' | 'production'>('uat');
  const [dacApiUrl, setDacApiUrl] = useState('https://altis-ws.grupoagencia.com:444/GAgencia/GAgencia.asmx');
  const [dacKTipoGuia, setDacKTipoGuia] = useState(4);
  const [dacKTipoEnvio, setDacKTipoEnvio] = useState(1);
  const [dacKClienteDestinatario, setDacKClienteDestinatario] = useState(5);
  const [dacEntregaDomicilio, setDacEntregaDomicilio] = useState(1);
  const [dacEntregaAgencia, setDacEntregaAgencia] = useState(2);
  const [dacEsRecoleccion, setDacEsRecoleccion] = useState(1);
  const [dacUsaBolsa, setDacUsaBolsa] = useState(0);
  const [dacKOficinaOrigen, setDacKOficinaOrigen] = useState("800");
  const [dacKOficinaDestinoDefault, setDacKOficinaDestinoDefault] = useState<number>(601);

  // UES Config States
  const [uesEnabled, setUesEnabled] = useState(false);
  const [uesUsername, setUesUsername] = useState('');
  const [uesPassword, setUesPassword] = useState('');
  const [uesApiKey, setUesApiKey] = useState('');
  const [uesToken, setUesToken] = useState('');
  const [uesEnv, setUesEnv] = useState<'uat' | 'production'>('production');
  const [uesApiUrl, setUesApiUrl] = useState('https://api.ues.com.uy');

  // DAC Office Management States
  const [offices, setOffices] = useState<any[]>([]);
  const [newOfficeK, setNewOfficeK] = useState('');
  const [newOfficeName, setNewOfficeName] = useState('');
  const [newOfficeDep, setNewOfficeDep] = useState('');
  const [newOfficeCity, setNewOfficeCity] = useState('');
  const [newOfficeLoc, setNewOfficeLoc] = useState('');
  const [newOfficeAddress, setNewOfficeAddress] = useState('');
  const [newOfficePhone, setNewOfficePhone] = useState('');
  const [newOfficeSupportsPickup, setNewOfficeSupportsPickup] = useState(true);
  const [newOfficeSupportsDelivery, setNewOfficeSupportsDelivery] = useState(true);
  const [isLoadingOffices, setIsLoadingOffices] = useState(false);

  // Test Cost Panel States
  const [isTestingCost, setIsTestingCost] = useState(false);
  const [testRequestJson, setTestRequestJson] = useState('');
  const [testResponseJson, setTestResponseJson] = useState('');
  const [testDetectedCost, setTestDetectedCost] = useState<number | null>(null);
  const [testError, setTestError] = useState('');
  
  // Action state flags
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingDac, setIsTestingDac] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    async function loadSettings() {
      // Load site settings (SoyDelivery etc)
      const { data } = await supabase.from('site_settings').select('*');
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(item => { map[item.key] = item.value || ''; });
        setSettings(map);
        if (map['shipping_soydelivery_enabled'] === 'false') setFlexActive(false);
        if (map['shipping_soydelivery_cutoff_time']) setWeekdayCutoff(map['shipping_soydelivery_cutoff_time']);
        if (map['shipping_dac_cutoff_time']) setDacCutoff(map['shipping_dac_cutoff_time']);
      }

      // Load DAC settings
      try {
        const { data: dacProv } = await supabase
          .from('delivery_providers_admin')
          .select('id, provider_key, provider_name, is_active, environment, api_url, username, settings')
          .eq('provider_key', 'dac')
          .maybeSingle();

        if (dacProv) {
          setDacEnabled(dacProv.is_active);
          setDacUsername(dacProv.username || '');
          setDacPassword('');
          setDacEnv(dacProv.environment || 'uat');
          setDacApiUrl(dacProv.api_url || 'https://altis-ws.grupoagencia.com:444/GAgencia/GAgencia.asmx');
          
          const s = dacProv.settings || {};
          setDacKTipoGuia(s.k_tipo_guia !== undefined ? Number(s.k_tipo_guia) : 4);
          setDacKTipoEnvio(s.k_tipo_envio !== undefined ? Number(s.k_tipo_envio) : 1);
          setDacKClienteDestinatario(s.k_cliente_destinatario !== undefined ? Number(s.k_cliente_destinatario) : 5);
          setDacEntregaDomicilio(s.entrega_domicilio !== undefined ? Number(s.entrega_domicilio) : (s.entrega !== undefined ? Number(s.entrega) : 1));
          setDacEntregaAgencia(s.entrega_agencia !== undefined ? Number(s.entrega_agencia) : 2);
          setDacEsRecoleccion(s.es_recoleccion !== undefined ? Number(s.es_recoleccion) : 1);
          setDacUsaBolsa(s.usa_bolsa !== undefined ? Number(s.usa_bolsa) : 0);
          setDacKOficinaOrigen(s.k_oficina_origen !== undefined ? String(s.k_oficina_origen) : "800");
          setDacKOficinaDestinoDefault(s.k_oficina_destino_default !== undefined ? Number(s.k_oficina_destino_default) : 601);
        }
      } catch (err) {
        console.error("Error loading DAC provider config:", err);
      }

      // Load UES settings
      try {
        const { data: uesProv } = await supabase
          .from('delivery_providers_admin')
          .select('id, provider_key, provider_name, is_active, environment, api_url, username, settings')
          .eq('provider_key', 'ues')
          .maybeSingle();

        if (uesProv) {
          setUesEnabled(uesProv.is_active);
          setUesUsername(uesProv.username || '');
          setUesPassword('');
          setUesEnv((uesProv.environment as any) || 'production');
          setUesApiUrl(uesProv.api_url || 'https://api.ues.com.uy');
          
          const s = uesProv.settings || {};
          setUesApiKey(s.apiKey || '');
          setUesToken(s.token || '');
        }
      } catch (err) {
        console.error("Error loading UES provider config:", err);
      }
    }
    loadSettings();
    loadOffices();
  }, []);

  function updateSetting(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  function toggleZone(zoneId: string) {
    if (selectedZones.includes(zoneId)) {
      setSelectedZones(selectedZones.filter(z => z !== zoneId));
    } else {
      setSelectedZones([...selectedZones, zoneId]);
    }
  }

  function handleSavePrice(zoneId: keyof typeof INITIAL_ZONES) {
    if (editPriceValue && !isNaN(Number(editPriceValue))) {
      setZonesData({
        ...zonesData,
        [zoneId]: { ...zonesData[zoneId], price: Number(editPriceValue) }
      });
    }
    setEditingPrice(null);
  }

  function openPriceEditor(zoneId: string, currentPrice: number) {
    setEditingPrice(zoneId);
    setEditPriceValue(currentPrice.toString());
  }

  // Connection Test for DAC
  async function handleTestDacConnection() {
    if (!dacUsername || !dacPassword || !dacApiUrl) {
      toast.warning("Por favor ingresa usuario, contraseña y URL de API de DAC antes de probar.");
      return;
    }

    setIsTestingDac(true);
    try {
      const updateData: any = {
        username: dacUsername,
        api_url: dacApiUrl,
        environment: dacEnv,
        updated_at: new Date().toISOString()
      };
      if (dacPassword) {
        updateData.password_encrypted = dacPassword;
      }

      const { error: saveErr } = await supabase
        .from('delivery_providers')
        .update(updateData)
        .eq('provider_key', 'dac');

      if (saveErr) throw new Error(`Error al pre-guardar credenciales: ${saveErr.message}`);

      // 2. Invoke dac-login edge function
      const { data, error } = await supabase.functions.invoke('dac-login', {
        method: 'POST'
      });

      if (error) throw error;
      
      if (data && data.success) {
        toast.success("¡Conexión con DAC exitosa! Credenciales validadas y sesión SOAP establecida.");
      } else {
        throw new Error(data?.error || "Error desconocido al autenticar con DAC");
      }
    } catch (e: any) {
      console.error("[DAC Test Connection Error]:", e);
      toast.error(`Fallo de conexión DAC: ${e.message || e}`);
    } finally {
      setIsTestingDac(false);
    }
  }

  // Office list loader
  async function loadOffices() {
    setIsLoadingOffices(true);
    try {
      const { data, error } = await supabase
        .from('dac_offices')
        .select('*')
        .order('office_name', { ascending: true });
      if (error) throw error;
      setOffices(data || []);
    } catch (err: any) {
      console.error("Error loading offices:", err);
      toast.error(`Error al cargar oficinas: ${err.message}`);
    } finally {
      setIsLoadingOffices(false);
    }
  }

  // Office adder
  async function handleAddOffice(e: React.FormEvent) {
    e.preventDefault();
    if (!newOfficeK || !newOfficeName || !newOfficeDep) {
      toast.warning("Por favor completa al menos K_Oficina, Nombre y Departamento.");
      return;
    }
    try {
      const { data, error } = await supabase
        .from('dac_offices')
        .insert({
          k_oficina: Number(newOfficeK),
          office_name: newOfficeName.trim(),
          department: newOfficeDep.trim(),
          city: newOfficeCity.trim() || null,
          locality: newOfficeLoc.trim() || null,
          address: newOfficeAddress.trim() || null,
          phone: newOfficePhone.trim() || null,
          supports_pickup: newOfficeSupportsPickup,
          supports_delivery: newOfficeSupportsDelivery,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      toast.success(`Oficina ${newOfficeName} agregada con éxito.`);
      setNewOfficeK('');
      setNewOfficeName('');
      setNewOfficeDep('');
      setNewOfficeCity('');
      setNewOfficeLoc('');
      setNewOfficeAddress('');
      setNewOfficePhone('');
      setNewOfficeSupportsPickup(true);
      setNewOfficeSupportsDelivery(true);
      loadOffices();
    } catch (err: any) {
      console.error("Error adding office:", err);
      toast.error(`Error al agregar oficina: ${err.message}`);
    }
  }

  // Office deleter
  async function handleDeleteOffice(id: string) {
    if (!window.confirm("¿Estás seguro de eliminar esta oficina de DAC?")) return;
    try {
      const { error } = await supabase
        .from('dac_offices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success("Oficina eliminada con éxito.");
      loadOffices();
    } catch (err: any) {
      console.error("Error deleting office:", err);
      toast.error(`Error al eliminar oficina: ${err.message}`);
    }
  }

  // Cost calculation test for DAC
  async function handleTestCostCalculation() {
    setIsTestingCost(true);
    setTestError('');
    setTestRequestJson('');
    setTestResponseJson('');
    setTestDetectedCost(null);

    const reqBody = {
      Direccion_Destinatario: "Test",
      K_Oficina_Destino: Number(dacKOficinaDestinoDefault) || 601,
      Paquetes_Ampara: 1,
      Detalle_Paquetes: JSON.stringify([{ Cantidad: 1, Tipo: 1 }])
    };

    setTestRequestJson(JSON.stringify(reqBody, null, 2));

    try {
      // Temporarily save provider config to DB before testing so Deno function picks up latest inputs
      const tempUpdateData: any = {
        username: dacUsername,
        api_url: dacApiUrl,
        environment: dacEnv,
        settings: {
          k_tipo_guia: dacKTipoGuia,
          k_tipo_envio: dacKTipoEnvio,
          k_cliente_destinatario: dacKClienteDestinatario,
          entrega_domicilio: dacEntregaDomicilio,
          entrega_agencia: dacEntregaAgencia,
          es_recoleccion: dacEsRecoleccion,
          usa_bolsa: dacUsaBolsa,
          k_oficina_origen: dacKOficinaOrigen,
          k_oficina_destino_default: dacKOficinaDestinoDefault
        },
        updated_at: new Date().toISOString()
      };
      if (dacPassword) {
        tempUpdateData.password_encrypted = dacPassword;
      }

      const { error: saveErr } = await supabase
        .from('delivery_providers')
        .update(tempUpdateData)
        .eq('provider_key', 'dac');

      if (saveErr) throw new Error(`Error al pre-guardar configuración: ${saveErr.message}`);

      const { data, error } = await supabase.functions.invoke('dac-get-cost', {
        body: reqBody
      });

      if (error) throw error;

      setTestResponseJson(JSON.stringify(data, null, 2));

      if (data && data.success) {
        const costVal = data.cost !== undefined ? data.cost : (data.raw_response?.costo || data.costo);
        setTestDetectedCost(costVal);
        toast.success(`Cálculo de costo probado con éxito. Costo: $${costVal}`);
      } else {
        setTestError(data?.error || "Error al calcular costo en DAC");
        toast.error(`Error de cotización: ${data?.error || "Desconocido"}`);
      }
    } catch (e: any) {
      console.error("[DAC Test Cost Error]:", e);
      setTestError(e.message || "Error al invocar edge function dac-get-cost");
      toast.error(`Fallo de cotización: ${e.message || e}`);
    } finally {
      setIsTestingCost(false);
    }
  }

  // Global Save
  async function handleSave() {
    setIsSaving(true);
    try {
      // 1. Save SoyDelivery Settings
      const keysToSave = [
        'shipping_soydelivery_enabled',
        'shipping_soydelivery_api_id',
        'shipping_soydelivery_api_key',
        'shipping_soydelivery_negocio_id',
        'shipping_soydelivery_negocio_clave',
        'shipping_soydelivery_sandbox',
        'shipping_soydelivery_cutoff_time',
        'shipping_dac_cutoff_time'
      ];
      
      settings['shipping_soydelivery_enabled'] = flexActive ? 'true' : 'false';
      settings['shipping_soydelivery_cutoff_time'] = weekdayCutoff;
      settings['shipping_dac_cutoff_time'] = dacCutoff;

      const SECRET_KEYS = new Set([
        'shipping_soydelivery_api_key', 
        'shipping_soydelivery_api_id',
        'shipping_soydelivery_negocio_clave', 
        'shipping_soydelivery_negocio_id'
      ]);

      const settingsMap: Record<string, string> = {};
      for (const key of keysToSave) {
        const val = settings[key] || '';
        const isSecret = SECRET_KEYS.has(key);
        if (isSecret) {
          await supabase.from('site_settings').upsert({ 
            key, 
            value: val, 
            updated_at: new Date().toISOString() 
          }, { onConflict: 'key' });
        } else {
          await Promise.all([
            supabase.from('site_settings').upsert({ 
              key, 
              value: val, 
              updated_at: new Date().toISOString() 
            }, { onConflict: 'key' }),
            supabase.from('public_site_config').upsert({ 
              key, 
              value: val, 
              updated_at: new Date().toISOString() 
            }, { onConflict: 'key' })
          ]);
          settingsMap[key] = val;
        }
      }
      updateCachedSettings(settingsMap);

      const dacUpdateData: any = {
        is_active: dacEnabled,
        username: dacUsername,
        environment: dacEnv,
        api_url: dacApiUrl,
        settings: {
          k_tipo_guia: dacKTipoGuia,
          k_tipo_envio: dacKTipoEnvio,
          k_cliente_destinatario: dacKClienteDestinatario,
          entrega_domicilio: dacEntregaDomicilio,
          entrega_agencia: dacEntregaAgencia,
          es_recoleccion: dacEsRecoleccion,
          usa_bolsa: dacUsaBolsa,
          k_oficina_origen: dacKOficinaOrigen,
          k_oficina_destino_default: dacKOficinaDestinoDefault
        },
        updated_at: new Date().toISOString()
      };
      if (dacPassword) {
        dacUpdateData.password_encrypted = dacPassword;
      }

      const { error: dacErr } = await supabase
        .from('delivery_providers')
        .update(dacUpdateData)
        .eq('provider_key', 'dac');

      if (dacErr) throw dacErr;

      // Save UES Settings
      const uesUpdateData: any = {
        is_active: uesEnabled,
        username: uesUsername,
        environment: uesEnv,
        api_url: uesApiUrl,
        settings: {
          apiKey: uesApiKey,
          token: uesToken
        },
        updated_at: new Date().toISOString()
      };
      if (uesPassword) {
        uesUpdateData.password_encrypted = uesPassword;
      }

      const { error: uesErr } = await supabase
        .from('delivery_providers')
        .update(uesUpdateData)
        .eq('provider_key', 'ues');

      if (uesErr) throw uesErr;

      toast.success("Configuración de logística guardada correctamente");
    } catch (e: any) {
      console.error("[Logistics Save Error]:", e);
      toast.error(`Error al guardar configuración: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Logística y Envíos</h2>
          <p className="text-sm text-gray-500 mt-1">Configura las integraciones de envíos Flex (SoyDelivery), DAC y despacho al interior.</p>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="btn-primary gap-2">
          <Save className="w-4 h-4" /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2.5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'dashboard'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="w-4 h-4" /> Dashboard Operativo
        </button>
        <button
          onClick={() => setActiveTab('control-tower')}
          className={`px-4 py-2.5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'control-tower'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity className="w-4 h-4" /> Torre de Control
        </button>
        <button
          onClick={() => setActiveTab('soydelivery')}
          className={`px-4 py-2.5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'soydelivery'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="w-4 h-4" /> SoyDelivery (Flex)
        </button>
        <button
          onClick={() => setActiveTab('dac')}
          className={`px-4 py-2.5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'dac'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Settings className="w-4 h-4" /> DAC / Grupo Agencia
        </button>
        <button
          onClick={() => setActiveTab('ues')}
          className={`px-4 py-2.5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'ues'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="w-4 h-4" /> UES Envíos
        </button>
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2.5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'general'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <QrCode className="w-4 h-4" /> Formato de Etiquetas
        </button>
      </div>

      {/* TAB CONTENT: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Visual Alerts Banner */}
          {visualAlerts.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
              <h4 className="text-xs font-black text-red-800 uppercase tracking-widest flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Alertas Operativas Críticas
              </h4>
              <ul className="list-disc pl-5 text-xs text-red-700 font-semibold space-y-1">
                {visualAlerts.map((al, idx) => (
                  <li key={idx}>{al}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Torre de Control - 10 Tarjetas Operativas */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            
            <button 
              onClick={() => setSelectedCardFilter('queued')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'queued' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-blue-500">En Cola</div>
              <div className="text-xl font-black text-blue-600 mt-1">{dbStats.queuedCount}</div>
            </button>

            <button 
              onClick={() => setSelectedCardFilter('pending_tracking')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'pending_tracking' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-amber-500">Esperando Tracking</div>
              <div className="text-xl font-black text-amber-600 mt-1">{dbStats.statusCounts['pending_real_tracking'] || 0}</div>
            </button>

            <button 
              onClick={() => setSelectedCardFilter('error')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'error' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-red-500">Con Error</div>
              <div className="text-xl font-black text-red-600 mt-1">{(dbStats.statusCounts['failed'] || 0) + dbStats.failedQueueCount}</div>
            </button>

            <button 
              onClick={() => setSelectedCardFilter('courier_down')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'courier_down' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-rose-500">Courier Caído</div>
              <div className="text-xl font-black text-rose-600 mt-1">
                {dbStats.monitors.filter(m => m.status === 'offline').length}
              </div>
            </button>

            <button 
              onClick={() => setSelectedCardFilter('ready_to_ship')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'ready_to_ship' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-green-500">Listo para Retiro</div>
              <div className="text-xl font-black text-green-600 mt-1">
                {(dbStats.statusCounts['ready_to_ship'] || 0) + (dbStats.statusCounts['waiting_pickup'] || 0)}
              </div>
            </button>

            <button 
              onClick={() => setSelectedCardFilter('in_transit')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'in_transit' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-indigo-500">En Tránsito</div>
              <div className="text-xl font-black text-indigo-600 mt-1">
                {(dbStats.statusCounts['in_transit'] || 0) + (dbStats.statusCounts['picked_up'] || 0) + (dbStats.statusCounts['out_for_delivery'] || 0)}
              </div>
            </button>

            <button 
              onClick={() => setSelectedCardFilter('delivered_today')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'delivered_today' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-emerald-500">Entregados Hoy</div>
              <div className="text-xl font-black text-emerald-600 mt-1">
                {adminShipments.filter(s => s.shipping_status === 'delivered' && (s.delivered_at ? new Date(s.delivered_at).toDateString() === new Date().toDateString() : new Date().toDateString() === new Date().toDateString())).length}
              </div>
            </button>

            <button 
              onClick={() => setSelectedCardFilter('retry_needed')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'retry_needed' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-violet-500">Requieren Reintento</div>
              <div className="text-xl font-black text-violet-600 mt-1">
                {adminQueue.filter(q => q.status === 'retrying').length}
              </div>
            </button>

            <button 
              onClick={() => setSelectedCardFilter('pending_label')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'pending_label' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-orange-500">Sin Etiqueta</div>
              <div className="text-xl font-black text-orange-600 mt-1">
                {adminShipments.filter(s => s.shipping_status === 'created' && !s.shipping_label_url).length}
              </div>
            </button>

            <button 
              onClick={() => setSelectedCardFilter('manual')} 
              className={`p-4 rounded-xl border text-left transition-all bg-white hover:border-slate-350 ${selectedCardFilter === 'manual' ? 'border-blue-600 shadow-sm ring-1 ring-blue-650/10' : 'border-gray-250'}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-gray-500">Manual / Pickup</div>
              <div className="text-xl font-black text-gray-700 mt-1">
                {adminShipments.filter(s => ['manual', 'pickup'].includes(s.provider_key)).length}
              </div>
            </button>

          </div>

          {/* Secondary Filters Toolbar */}
          <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Buscar</label>
              <input
                type="text"
                placeholder="N° orden, tracking, ref..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Courier</label>
              <select
                value={filterCourier}
                onChange={e => setFilterCourier(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="all">Todos</option>
                <option value="dac">DAC</option>
                <option value="soydelivery">SoyDelivery</option>
                <option value="pickup">Pickup</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Vendedor</label>
              <select
                value={filterVendor}
                onChange={e => setFilterVendor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="all">Todos</option>
                {uniqueVendors.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">SLA</label>
              <select
                value={filterSla}
                onChange={e => setFilterSla(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="all">Cualquiera</option>
                <option value="ok">Dentro de SLA</option>
                <option value="delayed">Vencido</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Fecha</label>
              <select
                value={filterDateRange}
                onChange={e => setFilterDateRange(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="all">Historico</option>
                <option value="today">Hoy</option>
                <option value="week">Esta semana</option>
              </select>
            </div>
          </div>

          {/* Active Card Filter Indicator Banner */}
          {selectedCardFilter !== 'all' && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-lg text-xs">
              <span className="font-bold">Filtro activo por tarjeta: <span className="uppercase font-black text-blue-900">{selectedCardFilter.replace('_', ' ')}</span></span>
              <button onClick={() => setSelectedCardFilter('all')} className="font-black hover:underline">Quitar filtro</button>
            </div>
          )}

          {/* Table Operativa */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-150 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="py-4 px-5">Pedido</th>
                    <th className="py-4 px-5">Suborden</th>
                    <th className="py-4 px-5">Vendedor</th>
                    <th className="py-4 px-5">Courier</th>
                    <th className="py-4 px-5">Bulto</th>
                    <th className="py-4 px-5">Estado</th>
                    <th className="py-4 px-5">Tracking</th>
                    <th className="py-4 px-5">SLA</th>
                    <th className="py-4 px-5">Intentos / Error</th>
                    <th className="py-4 px-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredShipments.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-gray-400 font-medium">
                        No hay despachos registrados o que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredShipments.map(s => {
                      const qItem = adminQueue.find(q => q.shipment_id === s.id);
                      const sla = getSlaStatus(s);

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-5">
                            <div className="font-bold text-gray-900">#{s.order_id.slice(0, 8)}</div>
                            <div className="text-[10px] text-gray-400 font-bold">{new Date(s.created_at).toLocaleDateString()}</div>
                          </td>
                          <td className="py-4 px-5">
                            <div className="font-black text-gray-900">COL-{s.suborder?.suborder_number}</div>
                            <div className="text-[10px] text-slate-400 font-mono">Ref: {s.internal_reference}</div>
                            {s.shipping_charged_to_customer !== undefined && s.shipping_charged_to_customer !== null && (
                              <div className="text-[9px] font-bold text-slate-500 mt-1 flex gap-1 items-center bg-slate-100/50 px-1.5 py-0.5 rounded w-fit border border-gray-150">
                                <span>Costo: ${s.shipping_provider_cost}</span>
                                <span className="text-gray-300">|</span>
                                <span>Cobrado: ${s.shipping_charged_to_customer}</span>
                                <span className="text-gray-300">|</span>
                                <span className={Number(s.shipping_margin) >= 0 ? 'text-emerald-600 font-black' : 'text-rose-600 font-black'}>
                                  Margen: ${s.shipping_margin}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-5 font-bold text-gray-700">
                            {s.suborder?.vendor_store_name || 'Collectibles'}
                          </td>
                          <td className="py-4 px-5 uppercase text-xs font-black text-slate-600">
                            {s.provider_key}
                            {s.shipping_billing_mode && (
                              <div className="mt-1">
                                <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                  s.shipping_billing_mode === 'collectibles_envios' 
                                    ? 'bg-blue-50 text-blue-600 border border-blue-150' 
                                    : 'bg-amber-50 text-amber-600 border border-amber-150'
                                }`}>
                                  {s.shipping_billing_mode === 'collectibles_envios' ? 'Collectibles Envíos' : 'Cuenta Propia'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-5 font-mono text-xs font-bold text-gray-800">
                            {s.package_number} / {s.total_packages}
                          </td>
                          <td className="py-4 px-5">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                              s.shipping_status === 'delivered' ? 'bg-green-50 border-green-200 text-green-700' :
                              ['in_transit', 'picked_up', 'out_for_delivery'].includes(s.shipping_status) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                              ['queued', 'processing'].includes(s.shipping_status) ? 'bg-blue-50 border-blue-200 text-blue-700' :
                              s.shipping_status === 'failed' ? 'bg-red-50 border-red-200 text-red-700' :
                              'bg-amber-50 border-amber-200 text-amber-700'
                            }`}>
                              {s.shipping_status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-4 px-5 font-mono text-xs font-bold text-gray-700">
                            {s.tracking_code || 'PENDIENTE'}
                          </td>
                          <td className="py-4 px-5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sla.color}`}>
                              {sla.label}
                            </span>
                          </td>
                          <td className="py-4 px-5 max-w-[150px]">
                            {qItem ? (
                              <div>
                                <span className="text-xs font-black text-gray-700">Cola: {qItem.attempts}</span>
                                {qItem.last_error && (
                                  <div className="text-[10px] text-red-500 truncate font-semibold mt-0.5" title={qItem.last_error}>
                                    {qItem.last_error}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Directo</span>
                            )}
                          </td>
                          <td className="py-4 px-5 text-right space-x-1.5 flex items-center justify-end">
                            <button
                              onClick={() => viewTimeline(s)}
                              className="p-1.5 text-gray-400 hover:text-slate-700 rounded transition-colors inline-flex"
                              title="Ver Timeline"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                            
                            {qItem && qItem.status !== 'completed' && (
                              <button
                                onClick={() => handleRetryQueue(qItem.id, s.id)}
                                className="p-1.5 text-blue-500 hover:text-blue-700 rounded transition-colors inline-flex animate-pulse"
                                title="Reintentar despacho"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}

                            {s.shipping_status === 'failed' && (
                              <button
                                onClick={() => handleMarkResolved(s.id)}
                                className="p-1.5 text-green-655 hover:text-green-750 rounded transition-colors inline-flex"
                                title="Marcar como resuelto"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              onClick={() => copyDiagnostic(s)}
                              className="p-1.5 text-orange-500 hover:text-orange-700 rounded transition-colors inline-flex"
                              title="Copiar Diagnóstico Técnico"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            
                            {s.provider_response && (
                              <button
                                onClick={() => setSelectedRawResponse(s.provider_response)}
                                className="p-1.5 text-gray-500 hover:text-gray-800 rounded transition-colors inline-flex"
                                title="Ver Raw Response"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Courier Performance & Monitors Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Courier API Monitor */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 lg:col-span-2 space-y-4">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-gray-400" /> Monitoreo de APIs Logísticas
              </h3>
              <div className="divide-y divide-gray-100">
                {dbStats.monitors.map(m => {
                  const statusLabels = {
                    active: 'Operativo',
                    degraded: 'Degradado',
                    offline: 'Caído'
                  };
                  return (
                    <div key={m.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${m.status === 'active' ? 'bg-green-500' : m.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                        <div>
                          <div className="font-bold text-sm text-gray-800 uppercase">{m.provider_code}</div>
                          <div className="text-xs text-gray-400">Última conexión: {new Date(m.last_ping_at).toLocaleTimeString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Latencia</div>
                          <div className="text-sm font-black text-gray-700">{m.latency_ms} ms</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Llamadas (Errores)</div>
                          <div className="text-sm font-black text-gray-700">{m.request_count} ({m.error_count})</div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          m.status === 'active' ? 'bg-green-55/10 border-green-200 text-green-700' :
                          m.status === 'degraded' ? 'bg-yellow-55/10 border-yellow-200 text-yellow-700' :
                          'bg-red-55/10 border-red-200 text-red-700'
                        }`}>
                          {statusLabels[m.status as keyof typeof statusLabels] || m.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Performance por Courier */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-gray-400" /> Performance por Courier
              </h3>
              <div className="space-y-4">
                {['dac', 'soydelivery'].map(code => {
                  const m = dbStats.monitors.find(mon => mon.provider_code === code);
                  const shipList = adminShipments.filter(s => s.provider_key === code);
                  const errCount = m?.error_count || 0;
                  const reqCount = m?.request_count || 1;
                  const successRate = reqCount > 0 ? Math.round(((reqCount - errCount) / reqCount) * 100) : 100;
                  
                  return (
                    <div key={code} className="p-3 bg-slate-50 rounded-lg border border-gray-250/30">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black uppercase text-sm text-slate-800">{code}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${m?.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {m?.status || 'offline'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-gray-400 font-semibold">Envíos Totales</div>
                          <div className="font-black text-gray-700">{shipList.length}</div>
                        </div>
                        <div>
                          <div className="text-gray-400 font-semibold">Tasa de Éxito</div>
                          <div className="font-black text-green-600">{successRate}%</div>
                        </div>
                        <div>
                          <div className="text-gray-400 font-semibold">Latencia Promedio</div>
                          <div className="font-black text-gray-750">{m?.latency_ms || 0} ms</div>
                        </div>
                        <div>
                          <div className="text-gray-400 font-semibold">Errores API</div>
                          <div className="font-black text-red-600">{errCount}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Detailed Timeline Modal */}
          {selectedTimelineShipment && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-gray-900 text-lg">Historial de Eventos Logísticos</h3>
                    <p className="text-xs text-gray-500">Ref: {selectedTimelineShipment.internal_reference} | Bulto {selectedTimelineShipment.package_number} de {selectedTimelineShipment.total_packages}</p>
                  </div>
                  <button onClick={() => setSelectedTimelineShipment(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                  {loadingTimeline ? (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
                    </div>
                  ) : timelineEvents.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-6">
                      No hay eventos registrados para este envío todavía.
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-slate-100 ml-3 pl-6 space-y-6">
                      {timelineEvents.map((ev) => (
                        <div key={ev.id} className="relative">
                          {/* Event point */}
                          <span className="absolute -left-9 top-1 w-5 h-5 rounded-full bg-white border-2 border-slate-350 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-800 capitalize">
                              {ev.event_type.replace('_', ' ')}
                            </span>
                            <span className="text-[10px] text-gray-450 font-mono">
                              {new Date(ev.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{ev.description}</p>
                          <div className="flex gap-2 items-center mt-1">
                            {ev.provider_status && (
                              <span className="text-[9px] font-bold bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded font-mono text-gray-450">
                                Status: {ev.provider_status}
                              </span>
                            )}
                            <span className="text-[9px] text-gray-400">Registrado por: {ev.created_by || 'sistema'}</span>
                          </div>
                          {ev.raw_response && (
                            <div className="mt-2">
                              <button 
                                onClick={() => setSelectedRawResponse(ev.raw_response)} 
                                className="text-[10px] text-blue-500 font-bold hover:underline"
                              >
                                Ver respuesta JSON del Courier
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-gray-100 flex justify-end">
                  <button onClick={() => setSelectedTimelineShipment(null)} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-colors">
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Prettified JSON Raw Response Modal */}
          {selectedRawResponse && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-55 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-black text-gray-900 text-base">Respuesta Raw del Transportista (JSON)</h3>
                  <button onClick={() => setSelectedRawResponse(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-slate-950 text-slate-200 font-mono text-xs p-4 rounded-inner select-all">
                  <pre>{JSON.stringify(selectedRawResponse, null, 2)}</pre>
                </div>
                <div className="p-4 bg-slate-50 border-t border-gray-100 flex justify-end">
                  <button onClick={() => setSelectedRawResponse(null)} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-colors">
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB CONTENT: SOYDELIVERY */}
      {activeTab === 'soydelivery' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-fade-in">
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-lg">Envíos Flex (SoyDelivery)</h3>
                <p className="text-xs text-gray-500 font-medium">Entregas en el día o al día siguiente en Montevideo y Área Metropolitana</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={flexActive} onChange={() => setFlexActive(!flexActive)} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {flexActive && (
            <div className="p-6 space-y-8">
              {/* API CREDENTIALS */}
              <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100">
                <h4 className="font-bold text-blue-900 mb-4">Credenciales de Integración (API)</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black text-blue-800 uppercase tracking-widest mb-1.5">API Id</label>
                    <input className="form-input w-full font-mono text-xs border-blue-200" value={settings['shipping_soydelivery_api_id'] || ''} onChange={e => updateSetting('shipping_soydelivery_api_id', e.target.value)} placeholder="2659..." />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-blue-800 uppercase tracking-widest mb-1.5">API Key</label>
                    <input type="password" style={{WebkitTextSecurity: 'disc'} as any} className="form-input w-full font-mono text-xs border-blue-200" value={settings['shipping_soydelivery_api_key'] || ''} onChange={e => updateSetting('shipping_soydelivery_api_key', e.target.value)} placeholder="8IZpb..." />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-blue-800 uppercase tracking-widest mb-1.5">Negocio ID</label>
                    <input className="form-input w-full font-mono text-xs border-blue-200" value={settings['shipping_soydelivery_negocio_id'] || ''} onChange={e => updateSetting('shipping_soydelivery_negocio_id', e.target.value)} placeholder="1950..." />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-blue-800 uppercase tracking-widest mb-1.5">Negocio Clave</label>
                    <input type="password" style={{WebkitTextSecurity: 'disc'} as any} className="form-input w-full font-mono text-xs border-blue-200" value={settings['shipping_soydelivery_negocio_clave'] || ''} onChange={e => updateSetting('shipping_soydelivery_negocio_clave', e.target.value)} placeholder="1234..." />
                  </div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-blue-100 flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${settings['shipping_soydelivery_sandbox'] === 'true' ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
                    <span className="text-xs font-bold text-gray-700">Entorno de Pruebas (Testing)</span>
                  </div>
                  <button onClick={() => {
                    const next = settings['shipping_soydelivery_sandbox'] !== 'true';
                    updateSetting('shipping_soydelivery_sandbox', String(next));
                  }}>
                    {settings['shipping_soydelivery_sandbox'] === 'true' ? <ToggleRight className="w-8 h-8 text-orange-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                  </button>
                </div>
              </div>

              {/* ZONAS DE COBERTURA */}
              <div>
                <h4 className="font-bold text-gray-900 mb-2">Zonas de cobertura</h4>
                <p className="text-sm text-gray-500 mb-4">Elige a qué zonas quieres hacer tus envíos con SoyDelivery. El precio que paga el comprador varía según la distancia.</p>
                
                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                    <div className="bg-blue-50 p-4 border-b border-gray-200 flex justify-between">
                      <label className="flex items-center gap-3 cursor-pointer font-bold text-sm text-blue-900">
                        <input 
                          type="checkbox" 
                          checked={selectedZones.length === Object.keys(zonesData).length} 
                          onChange={() => {
                            if (selectedZones.length === Object.keys(zonesData).length) setSelectedZones([]);
                            else setSelectedZones(Object.keys(zonesData));
                          }}
                          className="rounded text-blue-600 w-4 h-4 cursor-pointer"
                        /> 
                        Seleccionar todas
                      </label>
                      <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2 py-1 rounded-md">{selectedZones.length} zonas seleccionadas</span>
                    </div>
                    
                    <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[300px]">
                      {Object.values(zonesData).map(zone => (
                        <div key={zone.id} className="p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <label className="flex items-center gap-3 font-bold text-gray-800 cursor-pointer">
                                <input type="checkbox" checked={selectedZones.includes(zone.id)} onChange={() => toggleZone(zone.id)} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
                                <span className="text-sm">{zone.label}</span>
                              </label>
                              <button onClick={() => setViewingZone(zone.id)} className="ml-7 mt-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 group">
                                 Ver barrios asociados <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                              </button>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {editingPrice === zone.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="font-black text-gray-400">$</span>
                                  <input 
                                    type="number" 
                                    value={editPriceValue} 
                                    onChange={e => setEditPriceValue(e.target.value)} 
                                    className="w-16 px-2 py-1 text-sm border-b-2 border-blue-600 font-bold outline-none bg-blue-50" 
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleSavePrice(zone.id as any)}
                                  />
                                  <button onClick={() => handleSavePrice(zone.id as any)} className="p-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200">
                                    <Check className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => openPriceEditor(zone.id, zone.price)}>
                                  <span className="font-black text-lg text-gray-900 group-hover:text-blue-600 transition-colors">${zone.price}</span>
                                  <Edit2 className="w-3 h-3 text-gray-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="pl-7 flex flex-wrap gap-1.5">
                            {zone.subzones.map(sz => (
                              <span key={sz} className="text-[10px] font-bold text-gray-500 bg-gray-100/80 border border-gray-200 px-1.5 py-0.5 rounded">{sz}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-100 rounded-lg border border-gray-200 min-h-[300px] w-full relative overflow-hidden flex items-center justify-center">
                    <iframe 
                      src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d104711.19159938834!2d-56.24150529895175!3d-34.83604084770141!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x959f80ffc63bf7d3%3A0x6b321b2e355cecb5!2sMontevideo%2C%20Montevideo%20Department!5e0!3m2!1sen!2suy!4v1714400000000!5m2!1sen!2suy" 
                      width="100%" 
                      height="100%" 
                      style={{ border: 0 }} 
                      allowFullScreen 
                      loading="lazy" 
                      referrerPolicy="no-referrer-when-downgrade" 
                      className="absolute inset-0 grayscale-[50%] contrast-125 opacity-80 pointer-events-none"
                    ></iframe>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       <div className="w-[80%] h-[70%] bg-blue-600/30 border-2 border-blue-600/50 rounded-[40px] transform rotate-3 skew-x-12 blur-[1px]"></div>
                    </div>
                    <div className="absolute bottom-4 right-4 flex gap-2">
                       <div className="bg-white/90 backdrop-blur shadow-sm border border-gray-200 px-3 py-1.5 rounded-full text-[10px] font-bold text-gray-600 flex items-center gap-1.5">
                         <span className="w-2.5 h-2.5 bg-blue-600 rounded-full shadow-inner"></span> Cercana
                       </div>
                       <div className="bg-white/90 backdrop-blur shadow-sm border border-gray-200 px-3 py-1.5 rounded-full text-[10px] font-bold text-gray-600 flex items-center gap-1.5">
                         <span className="w-2.5 h-2.5 bg-blue-400 rounded-full shadow-inner"></span> Media
                       </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* TIEMPOS DE ENTREGA */}
              <div className="pt-8 border-t border-gray-100">
                <h4 className="font-bold text-gray-900 mb-2">Tiempos de entrega</h4>
                
                <div className="mb-6 flex flex-col md:flex-row gap-8">
                  <div>
                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">Hago envíos en el día</p>
                    <div className="flex rounded-lg overflow-hidden border border-gray-300 w-max shadow-sm">
                      <button onClick={() => setSameday(true)} className={`px-8 py-2.5 text-sm font-bold transition-colors ${sameday ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>SÍ</button>
                      <button onClick={() => setSameday(false)} className={`px-8 py-2.5 text-sm font-bold transition-colors border-l border-gray-300 ${!sameday ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>NO</button>
                    </div>
                  </div>
                  <div className="text-sm flex flex-col justify-center gap-2 pt-2 md:pt-4">
                    <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> <span className="text-gray-700">Tus publicaciones destacadas dirán <strong className="bg-green-600 text-white px-2 py-0.5 rounded ml-1 tracking-wide text-xs shadow-sm">Llega hoy</strong></span></p>
                    <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> <span className="text-gray-700">Filtro de búsqueda exclusivo activado</span></p>
                  </div>
                </div>

                <div className="space-y-0 max-w-3xl border border-gray-200 rounded-xl overflow-hidden text-sm shadow-sm bg-gray-50">
                  <div className="grid grid-cols-[1fr,2fr,1fr] p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 bg-gray-100">
                     <div>Días de entrega</div>
                     <div>Horarios de entrega</div>
                     <div>Máximo de envíos</div>
                  </div>

                  <div className="grid grid-cols-[1fr,2fr,1fr] items-center p-5 bg-white border-b border-gray-200">
                    <div className="font-bold text-gray-800">Lunes a viernes</div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium w-10">Desde</span>
                        <input type="time" value="09:00" disabled className="border border-gray-300 bg-gray-50 rounded-lg px-3 py-2 text-sm w-28 outline-none" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium w-10">Hasta</span>
                        <input type="time" value={weekdayCutoff} onChange={e => setWeekdayCutoff(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 outline-none focus:border-blue-500 font-bold" />
                      </div>
                    </div>
                    <div>
                      <input type="number" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full outline-none focus:border-blue-500 font-bold" />
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr,2fr,1fr] items-center p-5 bg-white border-b border-gray-200">
                    <label className="font-bold text-gray-800 flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={saturdayActive} onChange={() => setSaturdayActive(!saturdayActive)} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
                      Sábados
                    </label>
                    <div className={`flex items-center gap-4 transition-opacity ${!saturdayActive && 'opacity-40 pointer-events-none'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium w-10">Desde</span>
                        <input type="time" value="09:00" disabled className="border border-gray-300 bg-gray-50 rounded-lg px-3 py-2 text-sm w-28 outline-none" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium w-10">Hasta</span>
                        <input type="time" value={saturdayCutoff} onChange={e => setSaturdayCutoff(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 outline-none focus:border-blue-500 font-bold" />
                      </div>
                    </div>
                    <div className={`transition-opacity ${!saturdayActive && 'opacity-40 pointer-events-none'}`}>
                      <input type="number" value={maxOrders} onChange={e => setMaxOrders(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full outline-none focus:border-blue-500 font-bold" />
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr,2fr,1fr] items-center p-5 bg-gray-50">
                    <label className="font-bold text-gray-800 flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={sundayActive} onChange={() => setSundayActive(!sundayActive)} className="rounded text-blue-600 w-4 h-4 cursor-pointer" />
                      Domingos
                    </label>
                    <div className={`flex items-center gap-4 transition-opacity ${!sundayActive && 'opacity-30 pointer-events-none'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium w-10">Desde</span>
                        <input type="time" value="12:00" disabled className="border border-gray-300 border-dashed bg-transparent rounded-lg px-3 py-2 text-sm w-28 outline-none" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium w-10">Hasta</span>
                        <input type="time" value="21:00" disabled className="border border-gray-300 border-dashed bg-transparent rounded-lg px-3 py-2 text-sm w-28 outline-none font-bold text-gray-400" />
                      </div>
                    </div>
                    <div className={`transition-opacity ${!sundayActive && 'opacity-30 pointer-events-none'}`}>
                       <input type="number" disabled value={maxOrders} className="border border-gray-300 border-dashed bg-transparent rounded-lg px-3 py-2 text-sm w-full outline-none font-bold text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: DAC / GRUPO AGENCIA */}
      {activeTab === 'dac' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-fade-in space-y-6 p-6">
          <div className="border-b border-gray-100 pb-5 flex justify-between items-center bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-lg">Integración DAC / Grupo Agencia</h3>
                <p className="text-xs text-gray-500 font-medium">Gestión de envíos nacionales, guías de despacho, etiquetas y sincronización de tracking.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={dacEnabled} onChange={() => setDacEnabled(!dacEnabled)} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
            </label>
          </div>

          <div className="bg-orange-50/60 p-6 rounded-xl border border-orange-100 space-y-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div className="text-xs text-orange-800 leading-relaxed">
                <strong className="block font-bold mb-1">SOAP WebServices</strong>
                Esta integración interactúa directamente con los endpoints SOAP de DAC. Asegúrate de configurar el usuario y la contraseña del contrato provisto por DAC. La sesión se mantendrá activa automáticamente y se renovará antes de expirar.
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-black text-orange-900 uppercase tracking-widest mb-1.5">Usuario DAC</label>
                <input 
                  className="form-input w-full font-mono text-xs border-orange-200" 
                  value={dacUsername} 
                  onChange={e => setDacUsername(e.target.value)} 
                  placeholder="Ej. mi_usuario_dac" 
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-orange-900 uppercase tracking-widest mb-1.5">Contraseña DAC</label>
                <input 
                  type="password" 
                  style={{WebkitTextSecurity: 'disc'} as any} 
                  className="form-input w-full font-mono text-xs border-orange-200" 
                  value={dacPassword} 
                  onChange={e => setDacPassword(e.target.value)} 
                  placeholder="••••••••••••••" 
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] font-black text-orange-900 uppercase tracking-widest mb-1.5">URL de WebService SOAP</label>
                <input 
                  className="form-input w-full font-mono text-xs border-orange-200" 
                  value={dacApiUrl} 
                  onChange={e => setDacApiUrl(e.target.value)} 
                  placeholder="https://altis-ws.grupoagencia.com:444/GAgencia/GAgencia.asmx" 
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] font-black text-orange-900 uppercase tracking-widest mb-1.5">Horario de Corte (Cutoff)</label>
                <input 
                  type="time" 
                  className="form-input w-full font-mono text-xs border-orange-200 font-bold" 
                  value={dacCutoff} 
                  onChange={e => setDacCutoff(e.target.value)} 
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-white rounded-lg border border-orange-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${dacEnv === 'uat' ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
                  <span className="text-xs font-bold text-gray-700">Entorno de Operación</span>
                </div>
                <div className="flex bg-gray-100 rounded-md p-1 border border-gray-200">
                  <button 
                    onClick={() => { setDacEnv('uat'); setDacApiUrl('https://altis-ws.grupoagencia.com:444/GAgencia/GAgencia.asmx'); }}
                    className={`px-3 py-1 text-[10px] font-bold rounded ${dacEnv === 'uat' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    UAT
                  </button>
                  <button 
                    onClick={() => { setDacEnv('production'); setDacApiUrl('https://sge.dac.com.uy:443/JAgencia/JAgencia.asmx'); }}
                    className={`px-3 py-1 text-[10px] font-bold rounded ${dacEnv === 'production' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    PROD
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button 
                  onClick={handleTestDacConnection}
                  disabled={isTestingDac}
                  className="btn-secondary py-3 px-5 gap-2 border-orange-200 hover:bg-orange-50 text-orange-950 font-bold w-full md:w-auto shadow-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${isTestingDac ? 'animate-spin' : ''}`} />
                  {isTestingDac ? 'Probando...' : 'Probar Conexión SOAP'}
                </button>
              </div>
            </div>

            {/* Parámetros Avanzados DAC */}
            <div className="border-t border-orange-100 pt-6 mt-6">
              <h4 className="text-xs font-bold text-orange-950 uppercase tracking-wider mb-4">Parámetros Avanzados DAC</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1.5">K_Tipo_Guia</label>
                  <input 
                    type="number"
                    className="form-input w-full font-mono text-xs border-orange-200" 
                    value={dacKTipoGuia} 
                    onChange={e => setDacKTipoGuia(Number(e.target.value))} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1.5">K_Tipo_Envio</label>
                  <input 
                    type="number"
                    className="form-input w-full font-mono text-xs border-orange-200" 
                    value={dacKTipoEnvio} 
                    onChange={e => setDacKTipoEnvio(Number(e.target.value))} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1.5">K_Cliente_Destinatario</label>
                  <input 
                    type="number"
                    className="form-input w-full font-mono text-xs border-orange-200" 
                    value={dacKClienteDestinatario} 
                    onChange={e => setDacKClienteDestinatario(Number(e.target.value))} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1.5">Entrega Domicilio</label>
                  <input 
                    type="number"
                    className="form-input w-full font-mono text-xs border-orange-200" 
                    value={dacEntregaDomicilio} 
                    onChange={e => setDacEntregaDomicilio(Number(e.target.value))} 
                  />
                  <span className="text-[9px] text-gray-500 mt-0.5 block">Código DAC para envíos a domicilio</span>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1.5">Entrega Agencia</label>
                  <input 
                    type="number"
                    className="form-input w-full font-mono text-xs border-orange-200" 
                    value={dacEntregaAgencia} 
                    onChange={e => setDacEntregaAgencia(Number(e.target.value))} 
                  />
                  <span className="text-[9px] text-gray-500 mt-0.5 block">Código DAC para retiro en agencia</span>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1.5">Es Recolección</label>
                  <select 
                    className="form-input w-full font-mono text-xs border-orange-200"
                    value={dacEsRecoleccion}
                    onChange={e => setDacEsRecoleccion(Number(e.target.value))}
                  >
                    <option value={1}>Sí (1)</option>
                    <option value={0}>No (0)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1.5">Usa Bolsa</label>
                  <select 
                    className="form-input w-full font-mono text-xs border-orange-200"
                    value={dacUsaBolsa}
                    onChange={e => setDacUsaBolsa(Number(e.target.value))}
                  >
                    <option value={0}>No (0)</option>
                    <option value={1}>Sí (1)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1.5">Oficina de Origen</label>
                  <input 
                    className="form-input w-full font-mono text-xs border-orange-200" 
                    value={dacKOficinaOrigen} 
                    onChange={e => setDacKOficinaOrigen(e.target.value)} 
                    placeholder="Ej. 800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1.5">Oficina de Destino por defecto</label>
                  <input 
                    type="number"
                    className="form-input w-full font-mono text-xs border-orange-200" 
                    value={dacKOficinaDestinoDefault} 
                    onChange={e => setDacKOficinaDestinoDefault(Number(e.target.value))} 
                    placeholder="Ej. 601"
                  />
                </div>
              </div>
            </div>

            {/* Test Cost Section */}
            <div className="border-t border-orange-100 pt-6 mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-orange-950 uppercase tracking-wider">Prueba de Cálculo de Costo (wsObtieneCosto_Nuevo)</h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">Permite cotizar un envío de prueba a la oficina de destino predeterminada con los parámetros configurados.</p>
                </div>
                <button 
                  onClick={handleTestCostCalculation}
                  disabled={isTestingCost}
                  className="btn-secondary py-2 px-4 gap-2 border-orange-200 hover:bg-orange-50 text-orange-950 text-xs font-bold shadow-sm"
                >
                  <Calculator className={`w-3.5 h-3.5 ${isTestingCost ? 'animate-spin' : ''}`} />
                  {isTestingCost ? 'Cotizando...' : 'Probar costo DAC'}
                </button>
              </div>

              {(testRequestJson || testResponseJson || testError || testDetectedCost !== null) && (
                <div className="grid md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-orange-100 text-xs font-mono">
                  <div>
                    <span className="block font-bold text-gray-700 mb-1 text-[10px] uppercase">Request JSON</span>
                    <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-[10px] max-h-48">{testRequestJson}</pre>
                  </div>
                  <div>
                    <span className="block font-bold text-gray-700 mb-1 text-[10px] uppercase">Response JSON</span>
                    <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-[10px] max-h-48">{testResponseJson || testError}</pre>
                  </div>
                  {testDetectedCost !== null && (
                    <div className="col-span-2 bg-green-50 border border-green-200 text-green-900 px-4 py-3 rounded-lg flex items-center justify-between font-sans">
                      <span className="text-xs font-bold">Costo Detectado:</span>
                      <span className="text-sm font-extrabold text-green-700">${testDetectedCost} UYU</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* DAC Office Management Section */}
            <div className="border-t border-orange-100 pt-6 mt-6 space-y-6">
              <div>
                <h4 className="text-sm font-black text-orange-950 uppercase tracking-wider">Gestión de Oficinas DAC (dac_offices)</h4>
                <p className="text-xs text-gray-500 mt-1">Lista, crea y elimina oficinas locales de DAC para asociar localidades del interior.</p>
              </div>

              {/* Form to Add New Office */}
              <form onSubmit={handleAddOffice} className="bg-orange-50/30 p-5 rounded-xl border border-orange-100/50 space-y-4">
                <h5 className="text-xs font-bold text-orange-900 uppercase">Agregar Nueva Oficina</h5>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1">K_Oficina *</label>
                    <input
                      type="number"
                      required
                      placeholder="Ej. 601"
                      className="form-input w-full font-mono text-xs border-orange-200"
                      value={newOfficeK}
                      onChange={e => setNewOfficeK(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1">Nombre de Oficina *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. DAC Maldonado"
                      className="form-input w-full text-xs border-orange-200"
                      value={newOfficeName}
                      onChange={e => setNewOfficeName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1">Departamento *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Maldonado"
                      className="form-input w-full text-xs border-orange-200"
                      value={newOfficeDep}
                      onChange={e => setNewOfficeDep(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1">Ciudad (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. Maldonado"
                      className="form-input w-full text-xs border-orange-100"
                      value={newOfficeCity}
                      onChange={e => setNewOfficeCity(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1">Barrio / Localidad (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. Centro"
                      className="form-input w-full text-xs border-orange-100"
                      value={newOfficeLoc}
                      onChange={e => setNewOfficeLoc(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1">Dirección de la Oficina (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. Av. Italia 1234"
                      className="form-input w-full text-xs border-orange-100"
                      value={newOfficeAddress}
                      onChange={e => setNewOfficeAddress(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 md:col-span-2">
                    <label className="block text-[10px] font-black text-orange-900 uppercase tracking-widest mb-1">Teléfono (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. 099 123 456"
                      className="form-input w-full text-xs border-orange-100"
                      value={newOfficePhone}
                      onChange={e => setNewOfficePhone(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 md:col-span-2 flex items-end gap-6 pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded text-orange-600 w-4 h-4 cursor-pointer"
                        checked={newOfficeSupportsPickup}
                        onChange={e => setNewOfficeSupportsPickup(e.target.checked)}
                      />
                      <span className="text-xs font-bold text-gray-700">Retiro en agencia</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded text-orange-600 w-4 h-4 cursor-pointer"
                        checked={newOfficeSupportsDelivery}
                        onChange={e => setNewOfficeSupportsDelivery(e.target.checked)}
                      />
                      <span className="text-xs font-bold text-gray-700">Entrega a domicilio</span>
                    </label>
                  </div>
                  <div className="col-span-2 md:col-span-1 flex items-end">
                    <button
                      type="submit"
                      className="btn-primary w-full py-2 px-4 gap-1.5 text-xs font-bold bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-500/10 flex items-center justify-center text-white"
                    >
                      <Plus className="w-3.5 h-3.5" /> Agregar
                    </button>
                  </div>
                </div>
              </form>

              {/* Offices List Cards Grid */}
              {isLoadingOffices ? (
                <div className="flex items-center justify-center py-6 text-xs text-gray-500">
                  <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mr-2" />
                  Cargando oficinas de DAC...
                </div>
              ) : offices.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  No hay oficinas configuradas. Agrega al menos una para cotizaciones al interior.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {offices.map((office) => (
                    <div
                      key={office.id}
                      className="p-3.5 bg-white border border-gray-200 hover:border-orange-300 rounded-xl shadow-sm hover:shadow transition-all relative flex flex-col justify-between group"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black font-mono text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                            K_{office.k_oficina}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteOffice(office.id)}
                            className="text-gray-300 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h6 className="font-bold text-gray-900 text-sm">{office.office_name}</h6>
                        <div className="text-[11px] text-gray-500 font-medium">
                          <span className="font-semibold text-gray-700">Depto:</span> {office.department}
                          {office.city && (
                            <>
                              <br />
                              <span className="font-semibold text-gray-700">Ciudad:</span> {office.city}
                            </>
                          )}
                          {office.locality && (
                            <>
                              <br />
                              <span className="font-semibold text-gray-700">Localidad:</span> {office.locality}
                            </>
                          )}
                          {office.address && (
                            <>
                              <br />
                              <span className="font-semibold text-gray-700">Dirección:</span> {office.address}
                            </>
                          )}
                          {office.phone && (
                            <>
                              <br />
                              <span className="font-semibold text-gray-700">Tel:</span> {office.phone}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          {office.supports_pickup && (
                            <span className="text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">Retiro</span>
                          )}
                          {office.supports_delivery && (
                            <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Entrega</span>
                          )}
                          {!office.supports_pickup && !office.supports_delivery && (
                            <span className="text-[9px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">Sin servicios</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-start gap-4">
            <AlertCircle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div className="text-xs text-gray-600 leading-relaxed">
              <strong className="block text-gray-900 font-bold mb-1">Webhook de Estados</strong>
              Configura el siguiente endpoint en tu portal de administración de DAC para recibir las actualizaciones de estado en tiempo real de tus envíos:
              <code className="block mt-2 p-2 bg-gray-900 text-gray-100 rounded font-mono text-[10px] select-all">
                {window.location.origin.includes('localhost') 
                  ? 'https://collectibles-ecommerce.vercel.app/functions/v1/dac-webhook' 
                  : `${window.location.origin}/functions/v1/dac-webhook`
                }
              </code>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: UES */}
      {activeTab === 'ues' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-fade-in">
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-lg">UES Envíos</h3>
                <p className="text-xs text-gray-500 font-medium">Entregas a domicilio y pick centers a nivel nacional</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded uppercase">Desactivado / Pendiente de integración</span>
              <label className="relative inline-flex items-center cursor-not-allowed opacity-50">
                <input type="checkbox" className="sr-only peer" checked={false} disabled />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
          </div>

          <div className="p-6 bg-amber-50/20 border-b border-gray-100">
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex gap-3 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Este transportista se encuentra desactivado temporalmente en toda la plataforma hasta que se complete la integración de su API real. No aparecerá en el Checkout ni en la configuración de los vendedores.</span>
            </div>
          </div>

          {false && uesEnabled && (
            <div className="p-6 space-y-6">
              <div className="bg-teal-50/50 p-6 rounded-xl border border-teal-100 space-y-4">
                <h4 className="font-bold text-teal-900 text-sm">Credenciales de Integración UES</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black text-teal-800 uppercase tracking-widest mb-1.5 font-sans">Usuario / Client ID</label>
                    <input className="form-input w-full font-mono text-xs border-teal-200" value={uesUsername} onChange={e => setUesUsername(e.target.value)} placeholder="Ej: collectibles_ues" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-teal-800 uppercase tracking-widest mb-1.5 font-sans">Contraseña</label>
                    <input type="password" style={{WebkitTextSecurity: 'disc'} as any} className="form-input w-full font-mono text-xs border-teal-200" value={uesPassword} onChange={e => setUesPassword(e.target.value)} placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-teal-800 uppercase tracking-widest mb-1.5 font-sans">API Key</label>
                    <input className="form-input w-full font-mono text-xs border-teal-200" value={uesApiKey} onChange={e => setUesApiKey(e.target.value)} placeholder="Ej: key_abc123" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-teal-800 uppercase tracking-widest mb-1.5 font-sans">Access Token</label>
                    <input type="password" style={{WebkitTextSecurity: 'disc'} as any} className="form-input w-full font-mono text-xs border-teal-200" value={uesToken} onChange={e => setUesToken(e.target.value)} placeholder="Ej: tok_xyz" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-teal-800 uppercase tracking-widest mb-1.5 font-sans">URL de la API</label>
                    <input className="form-input w-full font-mono text-xs border-teal-200" value={uesApiUrl} onChange={e => setUesApiUrl(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-teal-800 uppercase tracking-widest mb-1.5 font-sans">Entorno</label>
                    <select className="form-input w-full border-teal-200 bg-white" value={uesEnv} onChange={e => setUesEnv(e.target.value as any)}>
                      <option value="uat">Testing (UAT)</option>
                      <option value="production">Producción</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: FORMATO DE ETIQUETAS */}
      {activeTab === 'general' && (
        <div className="space-y-8 animate-fade-in">
          
          {/* ETIQUETAS DE ENVÍO */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 overflow-hidden relative">
            <h3 className="font-black text-gray-900 text-lg mb-1">Configuración de Etiquetas</h3>
            <p className="text-sm text-gray-500 mb-6">Elige cómo se imprimen las etiquetas para pegarlas en tus paquetes. Compatibles con impresoras térmicas (Zebra) o estándar (A4).</p>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${labelFormat === 'zebra' ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-4">
                    <input type="radio" checked={labelFormat === 'zebra'} onChange={() => setLabelFormat('zebra')} className="w-5 h-5 text-blue-600 cursor-pointer" />
                    <div>
                      <p className="font-bold text-gray-900 leading-tight">Impresora Térmica (Zebra/Eltron)</p>
                      <p className="text-xs text-gray-500 mt-1">10x15 cm. Rollo continuo perfecto para logística veloz.</p>
                    </div>
                  </div>
                </label>
                <label className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${labelFormat === 'a4' ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-4">
                    <input type="radio" checked={labelFormat === 'a4'} onChange={() => setLabelFormat('a4')} className="w-5 h-5 text-blue-600 cursor-pointer" />
                    <div>
                      <p className="font-bold text-gray-900 leading-tight">Impresora Estándar (A4)</p>
                      <p className="text-xs text-gray-500 mt-1">Imprime 4 etiquetas por hoja. Requiere cortar y pegar.</p>
                    </div>
                  </div>
                </label>
                <button className="btn-secondary w-full py-4 gap-2 mt-4 shadow-sm font-bold border-gray-300 text-gray-800">
                  <FileText className="w-5 h-5" /> Imprimir etiqueta de prueba
                </button>
              </div>

              <div className="bg-gray-100 p-6 rounded-xl flex items-center justify-center border border-gray-200 shadow-inner">
                 <div className="bg-white p-4 w-[280px] border border-gray-300 shadow-xl transform transition-transform hover:scale-[1.02] cursor-crosshair">
                    <div className="flex justify-between items-start border-b border-gray-400 pb-2 mb-2">
                       <div className="flex items-center gap-2">
                         <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200 shrink-0">
                           <Truck className="w-4 h-4 text-blue-600" />
                         </div>
                         <div className="text-[8px] leading-tight text-gray-600">
                           <p className="font-bold text-black text-[9px]">Remitente #63700367</p>
                           <p>Ruta 101 - Capitan Artigas</p>
                           <p>Barros Blancos Canelones</p>
                           <p className="font-bold mt-0.5 text-black">Pack ID: <span className="text-[10px]">2000012349445877</span></p>
                         </div>
                       </div>
                    </div>

                    <div className="flex justify-between items-center bg-gray-100 border-y border-black font-black uppercase text-xs">
                       <p className="bg-black text-white px-4 py-1">XMV01</p>
                       <p className="text-[8px] pr-2 tracking-tighter">Despachar lun 6/abr 16:00 hs</p>
                    </div>

                    <div className="py-4 border-b border-black text-center">
                       <div className="h-12 flex justify-center overflow-hidden mb-1 opacity-90 mx-auto w-4/5" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #000, #000 2px, transparent 2px, transparent 4px, #000 4px, #000 5px, transparent 5px, transparent 8px, #000 8px, #000 12px, transparent 12px, transparent 14px)', backgroundSize: '100% 100%' }}></div>
                       <p className="text-sm font-black tracking-widest">467831<span className="text-xl px-1">24991</span></p>
                    </div>

                    <div className="py-2 border-b border-black flex justify-between items-center text-center">
                       <p className="text-4xl font-black tracking-tighter w-full">STB1</p>
                       <p className="text-2xl font-black bg-black text-white px-2">00:00</p>
                    </div>

                    <div className="py-1 text-center border-b border-black">
                       <p className="text-[10px] font-black uppercase tracking-widest">XMV01 {'>'} STB1 {'>'} <span className="text-lg">TAC</span></p>
                       <p className="text-[9px] font-bold mt-1 uppercase">JUE 09/04/2026</p>
                    </div>

                    <div className="pt-2 flex justify-between">
                       <div className="text-[8px] leading-tight text-gray-800 flex-1">
                         <p className="font-bold text-black text-[9px] mb-0.5">Victor Sueiro (SUVI5690187)</p>
                         <p><span className="font-bold">Dirección:</span> jose pedro varela 365</p>
                         <p><span className="font-bold">CP:</span> 45000</p>
                         <p><span className="font-bold">Localidad:</span> Tacuarembó</p>
                         <p className="truncate w-32"><span className="font-bold">Ref:</span> Comercio ceramicas castro</p>
                       </div>
                       <div className="shrink-0 flex flex-col items-center border-l justify-between border-black pl-2">
                         <QrCode className="w-10 h-10 mb-1" />
                         <p className="bg-black text-white w-full text-center font-bold text-xs py-0.5">C</p>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: TORRE DE CONTROL */}
      {activeTab === 'control-tower' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h3 className="font-black text-gray-900 text-lg mb-1 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" /> Torre de Control Logística
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Monitorea el estado en tiempo real, latencia de API, tasa de éxito y volumen de envíos para cada transportista conectado.
            </p>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Courier Card: DAC */}
              {(() => {
                const code = 'dac';
                const monitor = dbStats.monitors?.find(m => m.provider_code === code);
                const status = monitor?.status || 'active';
                const lastError = monitor?.last_error;
                
                const enviosHoy = adminShipments.filter(s => s.provider_key === code && new Date(s.created_at).toDateString() === new Date().toDateString()).length;
                const enviosPendientes = adminQueue.filter(q => q.provider_code === code && ['queued', 'retry_scheduled', 'processing'].includes(q.status)).length;
                const errores = adminQueue.filter(q => q.provider_code === code && q.status === 'failed').length;
                const guiasCreadas = adminShipments.filter(s => s.provider_key === code && s.tracking_code).length;
                const trackingPendiente = adminShipments.filter(s => s.provider_key === code && s.shipping_status === 'pending_real_tracking').length;
                
                const total = adminShipments.filter(s => s.provider_key === code).length;
                const success = adminShipments.filter(s => s.provider_key === code && s.shipping_status !== 'failed').length;
                const successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '100%';

                return (
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-gray-900 text-base">DAC (Grupo Agencia)</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Servicio global corporativo de Collectibles</p>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        status === 'active' ? 'bg-green-100 text-green-800' :
                        status === 'degraded' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {status === 'active' ? '● Activo' : status === 'degraded' ? '▲ Degradado' : '■ Caído'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-3 rounded-lg border border-gray-100 font-mono">
                      <div><span className="text-gray-500 font-sans font-medium">Creados Hoy:</span> <strong className="text-gray-900">{enviosHoy}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">Tasa Éxito:</span> <strong className="text-green-700 font-black">{successRate}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">En Cola:</span> <strong className="text-amber-600 font-bold">{enviosPendientes}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">Errores Cola:</span> <strong className="text-rose-600 font-bold">{errores}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">Guías Emitidas:</span> <strong className="text-blue-600 font-bold">{guiasCreadas}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">Pend. Tracking:</span> <strong className="text-slate-600 font-bold">{trackingPendiente}</strong></div>
                      <div className="col-span-2 border-t border-gray-200 pt-1.5 mt-0.5"><span className="text-gray-500 font-sans font-medium">Latencia API:</span> <strong className="text-gray-900">{monitor?.latency_ms || 0} ms</strong></div>
                    </div>

                    {lastError ? (
                      <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-[10px] leading-relaxed text-rose-700 font-semibold font-mono break-all max-h-20 overflow-y-auto">
                        <span className="font-sans font-bold block mb-0.5">Último Error:</span>
                        {lastError}
                      </div>
                    ) : (
                      <div className="text-[10px] text-green-700 font-bold bg-green-50 border border-green-100 p-2 rounded-lg flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> API operando con normalidad.
                      </div>
                    )}

                    <button onClick={() => setActiveTab('dac')} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 transition-colors">
                      Configuración DAC <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                );
              })()}

              {/* Courier Card: SoyDelivery */}
              {(() => {
                const code = 'soydelivery';
                const monitor = dbStats.monitors?.find(m => m.provider_code === code);
                const status = monitor?.status || 'active';
                const lastError = monitor?.last_error;
                
                const enviosHoy = adminShipments.filter(s => s.provider_key === code && new Date(s.created_at).toDateString() === new Date().toDateString()).length;
                const enviosPendientes = adminQueue.filter(q => q.provider_code === code && ['queued', 'retry_scheduled', 'processing'].includes(q.status)).length;
                const errores = adminQueue.filter(q => q.provider_code === code && q.status === 'failed').length;
                const guiasCreadas = adminShipments.filter(s => s.provider_key === code && s.tracking_code).length;
                const trackingPendiente = adminShipments.filter(s => s.provider_key === code && s.shipping_status === 'pending_real_tracking').length;
                
                const total = adminShipments.filter(s => s.provider_key === code).length;
                const success = adminShipments.filter(s => s.provider_key === code && s.shipping_status !== 'failed').length;
                const successRate = total > 0 ? ((success / total) * 100).toFixed(1) + '%' : '100%';

                return (
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-gray-900 text-base">SoyDelivery (Envíos Flex)</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Envíos express en Montevideo y Canelones</p>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        status === 'active' ? 'bg-green-100 text-green-800' :
                        status === 'degraded' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {status === 'active' ? '● Activo' : status === 'degraded' ? '▲ Degradado' : '■ Caído'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-3 rounded-lg border border-gray-100 font-mono">
                      <div><span className="text-gray-500 font-sans font-medium">Creados Hoy:</span> <strong className="text-gray-900">{enviosHoy}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">Tasa Éxito:</span> <strong className="text-green-700 font-black">{successRate}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">En Cola:</span> <strong className="text-amber-600 font-bold">{enviosPendientes}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">Errores Cola:</span> <strong className="text-rose-600 font-bold">{errores}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">Guías Emitidas:</span> <strong className="text-blue-600 font-bold">{guiasCreadas}</strong></div>
                      <div><span className="text-gray-500 font-sans font-medium">Pend. Tracking:</span> <strong className="text-slate-600 font-bold">{trackingPendiente}</strong></div>
                      <div className="col-span-2 border-t border-gray-200 pt-1.5 mt-0.5"><span className="text-gray-500 font-sans font-medium">Latencia API:</span> <strong className="text-gray-900">{monitor?.latency_ms || 0} ms</strong></div>
                    </div>

                    {lastError ? (
                      <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-[10px] leading-relaxed text-rose-700 font-semibold font-mono break-all max-h-20 overflow-y-auto">
                        <span className="font-sans font-bold block mb-0.5">Último Error:</span>
                        {lastError}
                      </div>
                    ) : (
                      <div className="text-[10px] text-green-700 font-bold bg-green-50 border border-green-100 p-2 rounded-lg flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> API operando con normalidad.
                      </div>
                    )}

                    <button onClick={() => setActiveTab('soydelivery')} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 transition-colors">
                      Configuración SoyDelivery <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                );
              })()}

              {/* Courier Card: UES (Pending Integration) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 opacity-75">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-700 text-base">UES Envíos</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Logística nacional y casilleros inteligentes</p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                    Pendiente Integración
                  </span>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 text-center font-medium">
                  UES se encuentra desactivado. No afectará las cotizaciones de checkout ni generará tareas de despacho.
                </div>

                <button onClick={() => setActiveTab('ues')} className="text-xs text-slate-600 hover:text-slate-800 font-bold flex items-center gap-1 transition-colors">
                  Ver Detalles <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {/* Courier Card: Correo Uruguayo (Pending Integration) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 opacity-75">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-700 text-base">Correo Uruguayo</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Envíos postales y casillas de correo nacionales</p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                    Pendiente Integración
                  </span>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 text-center font-medium">
                  Correo Uruguayo se encuentra desactivado. No afectará las cotizaciones de checkout ni generará tareas de despacho.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP DE BARRIOS */}
      {viewingZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-scale-up">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                   <h3 className="font-black text-lg text-gray-900">
                     Barrios asociados a {zonesData[viewingZone as keyof typeof INITIAL_ZONES].label}
                   </h3>
                   <p className="text-xs text-gray-500 font-medium mt-0.5">Estos son los lugares a los que se aplica la tarifa de ${zonesData[viewingZone as keyof typeof INITIAL_ZONES].price}</p>
                </div>
                <button onClick={() => setViewingZone(null)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh] bg-white text-sm text-gray-700 leading-relaxed column-count-2 sm:column-count-3 gap-8">
                 {zonesData[viewingZone as keyof typeof INITIAL_ZONES].barrios.sort().map((b, i) => (
                    <div key={i} className="mb-2 break-inside-avoid shadow-sm bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg flex items-center gap-2 font-medium">
                       <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                       <span className="truncate">{b}</span>
                    </div>
                 ))}
              </div>
              <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50">
                 <button onClick={() => setViewingZone(null)} className="btn-primary py-2 px-6">Entendido</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

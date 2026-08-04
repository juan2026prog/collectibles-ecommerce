import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../admin/Toast';
import { 
  Truck, Shield, CheckCircle, AlertTriangle, RefreshCw, Eye, EyeOff, 
  Lock, X, Check, Info, Server, Sliders
} from 'lucide-react';

interface VendorService {
  id: string;
  external_service_id: string;
  external_service_name: string;
  display_name: string;
  enabled: boolean;
  estimated_delivery_text: string;
  free_shipping_enabled: boolean;
  free_shipping_threshold: number;
  markup_type: 'none' | 'fixed' | 'percentage';
  markup_value: number;
  sort_order: number;
  metadata?: any;
}

interface VDistrilogicIntegrationProps {
  isOpen?: boolean;
  onClose?: () => void;
  onConnectionChange?: () => void;
  initialTab?: 'credentials' | 'services';
}

export default function VDistrilogicIntegration({
  isOpen = true,
  onClose,
  onConnectionChange,
  initialTab = 'credentials'
}: VDistrilogicIntegrationProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'credentials' | 'services'>(initialTab);
  const [connection, setConnection] = useState<any>(null);
  const [services, setServices] = useState<VendorService[]>([]);
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncingServices, setSyncingServices] = useState(false);
  const [savingServices, setSavingServices] = useState(false);
  const [isProductionEnabled, setIsProductionEnabled] = useState(false);

  // Form states
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    guid: '',
    usuario: '',
    password: '',
    cueId: '',
    prestCod: '',
    environment: 'testing' as 'testing' | 'production'
  });

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch site_settings for distrilogic_production_enabled
      const { data: prodSetting } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'distrilogic_production_enabled')
        .maybeSingle();

      setIsProductionEnabled(prodSetting?.value === 'true');

      // 2. Fetch vendor_shipping_connections for provider = 'distrilogic'
      const { data: conn } = await supabase
        .from('vendor_shipping_connections')
        .select('*')
        .eq('vendor_id', user.id)
        .eq('provider', 'distrilogic')
        .maybeSingle();

      if (conn) {
        setConnection(conn);
        const s = conn.settings || {};
        setForm(prev => ({
          ...prev,
          cueId: s.cue_id || '',
          prestCod: s.prest_cod || '',
          environment: s.environment || 'testing'
        }));
      } else {
        setConnection(null);
      }

      // 3. Fetch vendor_shipping_services
      const { data: svcs } = await supabase
        .from('vendor_shipping_services')
        .select('*')
        .eq('vendor_id', user.id)
        .eq('provider', 'distrilogic')
        .order('sort_order', { ascending: true });

      if (svcs) {
        setServices(svcs);
      }
    } catch (err) {
      console.error("Error loading Distrilogic integration data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (credentialsToTest?: typeof form) => {
    setTestingConnection(true);
    setTestResult(null);

    const creds = credentialsToTest || {
      guid: form.guid,
      usuario: form.usuario,
      password: form.password,
      cueId: form.cueId
    };

    try {
      const { data, error } = await supabase.functions.invoke('vendor-shipping-test-connection', {
        body: {
          provider: 'distrilogic',
          credentials: creds,
          environment: form.environment
        }
      });

      if (error || !data.success) {
        throw new Error(data?.error || error?.message || 'Fallo la prueba de conexión');
      }

      setTestResult({
        success: true,
        message: data.message || '✓ Credenciales válidas y cliente Distrilogic identificado.'
      });
      toast.success("Conexión con Distrilogic validada con éxito");

      // Update connection status in DB if existing connection
      if (connection) {
        await supabase
          .from('vendor_shipping_connections')
          .update({
            connection_status: 'connected',
            last_tested_at: new Date().toISOString(),
            last_error: null
          })
          .eq('id', connection.id);

        loadData();
        if (onConnectionChange) onConnectionChange();
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Error al validar credenciales de Distrilogic'
      });
      toast.error(`Prueba de conexión fallida: ${err.message}`);

      if (connection) {
        await supabase
          .from('vendor_shipping_connections')
          .update({
            connection_status: 'error',
            last_tested_at: new Date().toISOString(),
            last_error: err.message
          })
          .eq('id', connection.id);
        
        loadData();
        if (onConnectionChange) onConnectionChange();
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!form.guid || !form.usuario || !form.password || !form.cueId) {
      toast.error("Por favor completá todos los campos obligatorios (GUID, Usuario, Contraseña y CueId)");
      return;
    }

    if (form.environment === 'production' && !isProductionEnabled) {
      toast.error("El ambiente de Producción no está habilitado actualmente por Collectibles.");
      return;
    }

    try {
      setTestingConnection(true);
      const { data, error } = await supabase.functions.invoke('vendor-shipping-save-connection', {
        body: {
          provider: 'distrilogic',
          credentials: {
            guid: form.guid.trim(),
            usuario: form.usuario.trim(),
            password: form.password.trim(),
            cue_id: form.cueId.trim(),
            prest_cod: form.prestCod.trim(),
            environment: form.environment
          },
          settings: {
            cue_id: form.cueId.trim(),
            prest_cod: form.prestCod.trim(),
            environment: form.environment
          },
          account_name: `Distrilogic (${form.environment === 'production' ? 'Producción' : 'Testing'})`,
          connection_status: 'connected'
        }
      });

      if (error || !data.success) {
        throw new Error(data?.error || error?.message || 'Error al guardar credenciales');
      }

      toast.success("Credenciales guardadas y cifradas de forma segura");
      setForm(prev => ({ ...prev, password: '' })); // clear password from local state
      await loadData();
      if (onConnectionChange) onConnectionChange();
      if (onClose) onClose();
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSyncServices = async () => {
    setSyncingServices(true);
    try {
      const { data, error } = await supabase.functions.invoke('distrilogic-sync-services');
      if (error || !data.success) {
        throw new Error(data?.error || error?.message || 'Error al sincronizar servicios');
      }

      toast.success(data.message || "Servicios sincronizados desde Distrilogic");
      await loadData();
      if (onConnectionChange) onConnectionChange();
    } catch (err: any) {
      toast.error(`Error de sincronización: ${err.message}`);
    } finally {
      setSyncingServices(false);
    }
  };

  const handleUpdateServiceField = (serviceId: string, field: keyof VendorService, value: any) => {
    setServices(prev => prev.map(s => s.id === serviceId ? { ...s, [field]: value } : s));
  };

  const handleSaveServices = async () => {
    setSavingServices(true);
    try {
      for (const service of services) {
        const { error } = await supabase
          .from('vendor_shipping_services')
          .update({
            display_name: service.display_name,
            enabled: service.enabled,
            estimated_delivery_text: service.estimated_delivery_text,
            markup_type: service.markup_type,
            markup_value: Number(service.markup_value) || 0,
            free_shipping_enabled: service.free_shipping_enabled,
            free_shipping_threshold: Number(service.free_shipping_threshold) || 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', service.id);

        if (error) throw error;
      }
      toast.success("Servicios y reglas de precio guardados correctamente");
    } catch (err: any) {
      toast.error(`Error al guardar servicios: ${err.message}`);
    } finally {
      setSavingServices(false);
    }
  };

  if (!isOpen) return null;

  const isConnected = connection?.connection_status === 'connected';
  const isError = connection?.connection_status === 'error';
  const isDisabled = connection?.connection_status === 'disabled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative my-8 text-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 font-bold">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Integración Distrilogic</h3>
                <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded">
                  Cuenta propia
                </span>
              </div>
              <p className="text-xs text-slate-500">Configuración de credenciales de cliente y servicios logísticos.</p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 my-4">
          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'credentials'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Lock className="w-4 h-4" />
            Credenciales de Cuenta
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('services')}
            disabled={!connection}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'services'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            } ${!connection ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Sliders className="w-4 h-4" />
            Servicios y Tarifas ({services.length})
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Cargando integración de Distrilogic...</div>
        ) : (
          <>
            {/* TAB 1: CREDENTIALS */}
            {activeTab === 'credentials' && (
              <div className="space-y-4">
                
                {/* Current Status Box if existing */}
                {connection && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">Estado de Conexión:</span>
                      <div className="flex items-center gap-2">
                        {isConnected && (
                          <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle className="w-3.5 h-3.5" /> Conectado
                          </span>
                        )}
                        {isError && (
                          <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                            <AlertTriangle className="w-3.5 h-3.5" /> Error de Conexión
                          </span>
                        )}
                        {isDisabled && (
                          <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                            Desactivado
                          </span>
                        )}
                        <span className="font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                          {connection.settings?.environment || 'testing'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1 border-t border-slate-200/80">
                      <div>
                        <strong>Nro. Cliente (CueId):</strong> {connection.settings?.cue_id || 'N/A'}
                      </div>
                      <div>
                        <strong>Última Prueba:</strong> {connection.last_tested_at ? new Date(connection.last_tested_at).toLocaleString('es-UY') : 'Sin probar'}
                      </div>
                    </div>

                    {connection.last_error && (
                      <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-[11px]">
                        <strong>Último error:</strong> {connection.last_error}
                      </div>
                    )}
                  </div>
                )}

                {/* Environment Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ambiente de API</label>
                  <select
                    value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value as 'testing' | 'production' })}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500 font-medium"
                  >
                    <option value="testing">Testing (Ambiente de Pruebas)</option>
                    <option value="production" disabled={!isProductionEnabled}>
                      Producción {!isProductionEnabled ? '(Pendiente de habilitación por Collectibles)' : ''}
                    </option>
                  </select>
                  {!isProductionEnabled && (
                    <p className="text-[11px] text-amber-700 mt-1 font-medium flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      Producción pendiente de habilitación por Collectibles. Podés guardar y probar en ambiente Testing.
                    </p>
                  )}
                </div>

                {/* GUID */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">GUID (Token de Autorización)</label>
                  <input
                    type="text"
                    value={form.guid}
                    onChange={(e) => setForm({ ...form, guid: e.target.value })}
                    placeholder="Ej: C9BF8FC158E674E9C8D2FB4747EE5"
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500 font-mono"
                  />
                </div>

                {/* Usuario */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Usuario ERP / API</label>
                  <input
                    type="text"
                    value={form.usuario}
                    onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                    placeholder="Ej: INTERFASEAPIREST"
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Contraseña API</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••••••"
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* CueId & PrestCod */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">CueId (Nro. de Cliente)</label>
                    <input
                      type="text"
                      value={form.cueId}
                      onChange={(e) => setForm({ ...form, cueId: e.target.value })}
                      placeholder="Ej: 1681"
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">PrestCod (Opcional)</label>
                    <input
                      type="text"
                      value={form.prestCod}
                      onChange={(e) => setForm({ ...form, prestCod: e.target.value })}
                      placeholder="Código Prestación"
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Security Note */}
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-start gap-2.5 text-xs text-purple-900">
                  <Shield className="w-4 h-4 text-purple-700 flex-shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Estas credenciales son proporcionadas directamente por Distrilogic. Se almacenan cifradas y no volverán a mostrarse completas.
                  </p>
                </div>

                {testResult && (
                  <div className={`p-3 rounded-xl border text-xs font-medium ${
                    testResult.success 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}>
                    {testResult.message}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleTestConnection()}
                    disabled={testingConnection || !form.guid || !form.usuario || !form.password || !form.cueId}
                    className="px-4 py-2.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
                    Probar Conexión
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveCredentials}
                    disabled={testingConnection || !form.guid || !form.usuario || !form.password || !form.cueId}
                    className="px-5 py-2.5 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    Guardar y Activar
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: SERVICES */}
            {activeTab === 'services' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Servicios y Tarifas de Distrilogic</h4>
                    <p className="text-xs text-slate-500">
                      Sincronizá y configurá los servicios que querés ofrecer a tus clientes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSyncServices}
                    disabled={syncingServices}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingServices ? 'animate-spin' : ''}`} />
                    {syncingServices ? 'Sincronizando...' : 'Sincronizar Servicios'}
                  </button>
                </div>

                {services.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                    <Server className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-600 mb-3">No hay servicios sincronizados aún para tu cuenta de Distrilogic.</p>
                    <button
                      type="button"
                      onClick={handleSyncServices}
                      disabled={syncingServices}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow transition inline-flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Obtener servicios desde Distrilogic
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white overflow-hidden max-h-96 overflow-y-auto">
                      {services.map((svc) => (
                        <div key={svc.id} className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                          {/* Toggle & Display Name */}
                          <div className="flex items-start gap-2.5 md:w-1/3">
                            <input
                              type="checkbox"
                              checked={svc.enabled}
                              onChange={(e) => handleUpdateServiceField(svc.id, 'enabled', e.target.checked)}
                              className="mt-1 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                            />
                            <div>
                              <input
                                type="text"
                                value={svc.display_name || svc.external_service_name}
                                onChange={(e) => handleUpdateServiceField(svc.id, 'display_name', e.target.value)}
                                className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded px-2 py-1 w-full focus:ring-1 focus:ring-purple-500"
                                placeholder="Nombre visible"
                              />
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                Servicio Distrilogic: {svc.external_service_name} (ID: {svc.external_service_id})
                              </p>
                            </div>
                          </div>

                          {/* Estimated Delivery */}
                          <div className="md:w-1/4">
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Tiempo Estimado</label>
                            <input
                              type="text"
                              value={svc.estimated_delivery_text || ''}
                              onChange={(e) => handleUpdateServiceField(svc.id, 'estimated_delivery_text', e.target.value)}
                              className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded px-2 py-1 w-full focus:ring-1 focus:ring-purple-500"
                              placeholder="Ej: 24 a 48 hs hábiles"
                            />
                          </div>

                          {/* Markup */}
                          <div className="md:w-1/4">
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Recargo / Margen</label>
                            <div className="flex items-center gap-1">
                              <select
                                value={svc.markup_type || 'none'}
                                onChange={(e) => handleUpdateServiceField(svc.id, 'markup_type', e.target.value)}
                                className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded px-2 py-1 focus:ring-1 focus:ring-purple-500"
                              >
                                <option value="none">Sin recargo</option>
                                <option value="fixed">Fijo ($)</option>
                                <option value="percentage">Porcentaje (%)</option>
                              </select>
                              {svc.markup_type !== 'none' && (
                                <input
                                  type="number"
                                  value={svc.markup_value || 0}
                                  onChange={(e) => handleUpdateServiceField(svc.id, 'markup_value', parseFloat(e.target.value) || 0)}
                                  className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded px-2 py-1 w-16 focus:ring-1 focus:ring-purple-500"
                                />
                              )}
                            </div>
                          </div>

                          {/* Free Shipping */}
                          <div className="md:w-1/5 flex flex-col">
                            <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={svc.free_shipping_enabled || false}
                                onChange={(e) => handleUpdateServiceField(svc.id, 'free_shipping_enabled', e.target.checked)}
                                className="rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                              />
                              Envío gratis
                            </label>
                            {svc.free_shipping_enabled && (
                              <input
                                type="number"
                                value={svc.free_shipping_threshold || ''}
                                onChange={(e) => handleUpdateServiceField(svc.id, 'free_shipping_threshold', parseFloat(e.target.value) || 0)}
                                className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded px-2 py-0.5 mt-1 w-full focus:ring-1 focus:ring-purple-500"
                                placeholder="Monto mín."
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pt-3 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={handleSaveServices}
                        disabled={savingServices}
                        className="px-5 py-2.5 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow transition flex items-center gap-2 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        {savingServices ? 'Guardando...' : 'Guardar Servicios y Reglas'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

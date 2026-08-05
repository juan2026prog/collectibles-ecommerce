import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../admin/Toast';
import { 
  Truck, Shield, CheckCircle, AlertTriangle, RefreshCw, Eye, EyeOff, 
  Lock, X, Check, Info, Settings, Sparkles
} from 'lucide-react';

interface VSoyDeliveryIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function VSoyDeliveryIntegrationModal({
  isOpen,
  onClose,
  onSaved
}: VSoyDeliveryIntegrationModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'not_configured' | 'connected' | 'error' | 'disabled'>('not_configured');
  
  // SoyDelivery BYOC Form state
  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [environment, setEnvironment] = useState<'testing' | 'production'>('production');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isOpen) return;
    loadSoyDeliveryConfiguration();
  }, [user, isOpen]);

  const loadSoyDeliveryConfiguration = async () => {
    setLoading(true);
    try {
      const { data: vConn, error: connErr } = await supabase
        .from('vendor_shipping_connections')
        .select('*')
        .eq('vendor_id', user!.id)
        .eq('provider', 'soydelivery')
        .maybeSingle();

      if (connErr && connErr.code !== 'PGRST116') {
        console.error("Error loading SoyDelivery connection:", connErr);
      }

      if (vConn) {
        setConnectionStatus(vConn.connection_status || 'not_configured');
        setEnabled(vConn.enabled ?? true);
        setEnvironment(vConn.environment === 'testing' ? 'testing' : 'production');
        setLastTestedAt(vConn.last_tested_at);
        setLastError(vConn.last_error);

        if (vConn.credentials_encrypted) {
          try {
            const { data: decryptedData } = await supabase.functions.invoke('decrypt-vendor-credentials', {
              body: { encryptedData: vConn.credentials_encrypted }
            });
            if (decryptedData?.clientId || decryptedData?.negocioId) {
              setClientId(decryptedData.clientId || decryptedData.negocioId || '');
            }
            if (decryptedData?.apiKey) setApiKey(decryptedData.apiKey || '');
            if (decryptedData?.secret || decryptedData?.negocioClave) {
              setSecret(decryptedData.secret || decryptedData.negocioClave || '');
            }
          } catch (e) {
            // Credentials kept secure in backend
          }
        }
      } else {
        setConnectionStatus('not_configured');
        setEnabled(true);
      }
    } catch (err: any) {
      console.error("Error in loadSoyDeliveryConfiguration:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!clientId.trim() || !apiKey.trim()) {
      toast.error("Ingresá el Client ID y la API Key para probar la conexión.");
      return;
    }

    setTesting(true);
    setLastError(null);

    try {
      const { data: testResult, error: testErr } = await supabase.functions.invoke('vendor-shipping-test-connection', {
        body: {
          provider: 'soydelivery',
          credentials: {
            clientId: clientId.trim(),
            negocioId: clientId.trim(),
            apiKey: apiKey.trim(),
            secret: secret.trim(),
            negocioClave: secret.trim()
          },
          environment
        }
      });

      if (testErr || !testResult?.success) {
        const errorMsg = testResult?.error || testErr?.message || "Falló la prueba de conexión con SoyDelivery";
        setConnectionStatus('error');
        setLastError(errorMsg);
        toast.error(`Error de conexión: ${errorMsg}`);
      } else {
        setConnectionStatus('connected');
        setLastTestedAt(new Date().toISOString());
        setLastError(null);
        toast.success(testResult.message || "Conexión exitosa con SoyDelivery");
      }
    } catch (err: any) {
      const errorMsg = err.message || "Error al comunicarse con el servidor de autenticación";
      setConnectionStatus('error');
      setLastError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !apiKey.trim()) {
      toast.error("Por favor completá los campos obligatorios (Client ID y API Key).");
      return;
    }

    setSaving(true);
    try {
      // 1. Encrypt credentials server-side
      const credsObject = {
        clientId: clientId.trim(),
        negocioId: clientId.trim(),
        apiKey: apiKey.trim(),
        secret: secret.trim(),
        negocioClave: secret.trim()
      };

      const { data: encResult, error: encErr } = await supabase.functions.invoke('encrypt-vendor-credentials', {
        body: { credentials: credsObject }
      });

      if (encErr || !encResult?.encryptedData) {
        throw new Error("No se pudo cifrar las credenciales de SoyDelivery.");
      }

      // 2. Upsert connection row
      const now = new Date().toISOString();
      const statusToSave = connectionStatus === 'connected' ? 'connected' : (lastError ? 'error' : 'not_configured');

      const { error: upsertErr } = await supabase
        .from('vendor_shipping_connections')
        .upsert({
          vendor_id: user!.id,
          provider: 'soydelivery',
          account_mode: 'byoc',
          pricing_source: 'vendor_account',
          enabled: enabled,
          environment: environment,
          credentials_encrypted: encResult.encryptedData,
          connection_status: statusToSave,
          last_tested_at: lastTestedAt,
          last_error: lastError,
          updated_at: now
        }, {
          onConflict: 'vendor_id,provider'
        });

      if (upsertErr) throw upsertErr;

      // 3. Update vendor_shipping_preferences row
      await supabase
        .from('vendor_shipping_preferences')
        .upsert({
          vendor_id: user!.id,
          provider: 'soydelivery',
          enabled: enabled,
          account_mode: 'byoc',
          pricing_source: 'vendor_account',
          updated_at: now
        }, {
          onConflict: 'vendor_id,provider'
        });

      toast.success("Cuenta de SoyDelivery configurada y guardada correctamente.");
      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      console.error("Error saving SoyDelivery credentials:", err);
      toast.error(`Error al guardar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    try {
      await supabase
        .from('vendor_shipping_connections')
        .update({ enabled: newEnabled, updated_at: new Date().toISOString() })
        .eq('vendor_id', user!.id)
        .eq('provider', 'soydelivery');

      await supabase
        .from('vendor_shipping_preferences')
        .update({ enabled: newEnabled, updated_at: new Date().toISOString() })
        .eq('vendor_id', user!.id)
        .eq('provider', 'soydelivery');

      toast.success(newEnabled ? "Integración de SoyDelivery activada." : "Integración de SoyDelivery desactivada.");
      if (onSaved) onSaved();
    } catch (e: any) {
      console.error("Error toggling SoyDelivery:", e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-orange-950 via-slate-900 to-black text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/20 border border-orange-500/30 rounded-xl">
              <Truck className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">SoyDelivery / Flex</h3>
                <span className="bg-orange-500/20 text-orange-300 text-[10px] font-bold px-2 py-0.5 rounded border border-orange-500/30 uppercase">
                  Cuenta Propia (BYOC)
                </span>
              </div>
              <p className="text-xs text-orange-200/80 mt-0.5">
                Configuración de credenciales de envío express Flex
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
              <div className="w-7 h-7 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold">Cargando configuración de SoyDelivery...</p>
            </div>
          ) : (
            <>
              {/* Security Shield Banner */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3 text-xs text-slate-700">
                <Shield className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="block text-slate-900 font-bold mb-0.5">Almacenamiento Cifrado de Credenciales</strong>
                  Estas credenciales son proporcionadas directamente por SoyDelivery. Se almacenan cifradas con AES-256 server-side y no volverán a mostrarse en texto plano.
                </div>
              </div>

              {/* Status Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : connectionStatus === 'error'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <div className="flex items-center gap-2 font-semibold">
                  {connectionStatus === 'connected' && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                  {connectionStatus === 'error' && <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
                  {connectionStatus === 'not_configured' && <Info className="w-4 h-4 text-amber-600 shrink-0" />}
                  <span>
                    Estado: {connectionStatus === 'connected' ? 'Conectado y listo para cotizar' : connectionStatus === 'error' ? 'Error de autenticación' : 'No configurado'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleToggleActive}
                  className={`px-3 py-1 text-[11px] font-bold rounded-lg transition border ${
                    enabled
                      ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      : 'bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300'
                  }`}
                >
                  {enabled ? 'Integración Activa' : 'Integración Desactivada'}
                </button>
              </div>

              {/* Form */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-orange-600" />
                  Credenciales de API SoyDelivery
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      ID de Cliente / Negocio (ApiId) *
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: 12345"
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      value={clientId}
                      onChange={e => setClientId(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Identificador numérico asignado por SoyDelivery.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ambiente de Trabajo *
                    </label>
                    <select
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      value={environment}
                      onChange={e => setEnvironment(e.target.value as any)}
                    >
                      <option value="production">Producción (Live)</option>
                      <option value="testing">Testing (Sandbox)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">Elegí Testing para pruebas o Producción para envíos reales.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    API Key *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: sd_live_abc123xyz456..."
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none font-mono"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Clave de autenticación provista por SoyDelivery.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Negocio Clave / Secret (Opcional)
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      placeholder="••••••••••••••••"
                      className="w-full text-xs p-2.5 pr-9 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none font-mono"
                      value={secret}
                      onChange={e => setSecret(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Clave secreta adicional requerida por algunas cuentas corporativas.</p>
                </div>
              </div>

              {/* Error Message if any */}
              {lastError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs leading-relaxed">
                  <strong className="block font-bold">Último error registrado:</strong>
                  {lastError}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || loading}
            className="px-4 py-2.5 bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 rounded-xl font-bold text-xs transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-orange-600 ${testing ? 'animate-spin' : ''}`} />
            {testing ? 'Probando...' : 'Probar conexión'}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveCredentials}
              disabled={saving || loading}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar cuenta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

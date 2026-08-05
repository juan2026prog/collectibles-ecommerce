import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../admin/Toast';
import { 
  Truck, Shield, CheckCircle, AlertTriangle, RefreshCw, Eye, EyeOff, 
  Lock, X, Check, Info, ArrowLeft
} from 'lucide-react';

interface VDacIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function VDacIntegrationModal({
  isOpen,
  onClose,
  onSaved
}: VDacIntegrationModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [accountMode, setAccountMode] = useState<'standard' | 'byoc'>('standard');
  const [connectionStatus, setConnectionStatus] = useState<'not_configured' | 'connected' | 'error' | 'disabled'>('not_configured');
  
  // BYOC Form state
  const [customerNumber, setCustomerNumber] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agencyCode, setAgencyCode] = useState('');
  const [environment, setEnvironment] = useState<'testing' | 'production'>('production');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isOpen) return;
    loadDacConfiguration();
  }, [user, isOpen]);

  const loadDacConfiguration = async () => {
    setLoading(true);
    try {
      // 1. Fetch connection row
      const { data: vConn, error: connErr } = await supabase
        .from('vendor_shipping_connections')
        .select('*')
        .eq('vendor_id', user!.id)
        .eq('provider', 'dac')
        .maybeSingle();

      if (connErr && connErr.code !== 'PGRST116') {
        console.error("Error loading DAC connection:", connErr);
      }

      if (vConn) {
        setAccountMode(vConn.account_mode === 'byoc' ? 'byoc' : 'standard');
        setConnectionStatus(vConn.connection_status || 'not_configured');
        setCustomerNumber(vConn.customer_number || '');
        setAgencyCode(vConn.agency_code || '');
        setEnvironment(vConn.environment === 'testing' ? 'testing' : 'production');
        setLastTestedAt(vConn.last_tested_at);
        setLastError(vConn.last_error);

        if (vConn.credentials_encrypted) {
          try {
            const { data: decryptedData } = await supabase.functions.invoke('decrypt-vendor-credentials', {
              body: { encryptedData: vConn.credentials_encrypted }
            });
            if (decryptedData?.username) setUsername(decryptedData.username);
            if (decryptedData?.password) setPassword(decryptedData.password);
          } catch (e) {
            // Credentials kept secure in backend
          }
        }
      } else {
        setAccountMode('standard');
        setConnectionStatus('not_configured');
      }
    } catch (err: any) {
      console.error("Error in loadDacConfiguration:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStandardMode = async () => {
    setSaving(true);
    try {
      // Upsert vendor_shipping_connections for standard mode
      const { error: connErr } = await supabase
        .from('vendor_shipping_connections')
        .upsert({
          vendor_id: user!.id,
          provider: 'dac',
          account_mode: 'standard',
          pricing_source: 'platform_standard',
          connection_status: 'connected',
          enabled: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'vendor_id,provider' });

      if (connErr) throw connErr;

      // Upsert vendor_shipping_preferences
      await supabase
        .from('vendor_shipping_preferences')
        .upsert({
          vendor_id: user!.id,
          provider: 'dac',
          enabled: true,
          account_mode: 'standard',
          pricing_source: 'platform_standard',
          updated_at: new Date().toISOString()
        }, { onConflict: 'vendor_id,provider' });

      toast({
        title: "Modalidad actualizada",
        description: "Se configuró DAC con las Tarifas Estándar de Collectibles.",
        type: "success"
      });

      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      toast({
        title: "Error al guardar",
        description: err.message || "Ocurrió un error al actualizar la modalidad.",
        type: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveByocCredentials = async () => {
    if (!customerNumber.trim()) {
      toast({ title: "Campo requerido", description: "Ingresá tu número de cliente DAC.", type: "error" });
      return;
    }
    if (!username.trim()) {
      toast({ title: "Campo requerido", description: "Ingresá tu usuario de DAC.", type: "error" });
      return;
    }
    if (!password.trim()) {
      toast({ title: "Campo requerido", description: "Ingresá tu contraseña de DAC.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('vendor-shipping-save-connection', {
        body: {
          provider: 'dac',
          account_mode: 'byoc',
          pricing_source: 'vendor_account',
          customer_number: customerNumber.trim(),
          agency_code: agencyCode.trim(),
          environment,
          credentials: {
            customer_number: customerNumber.trim(),
            username: username.trim(),
            password: password.trim(),
            agency_code: agencyCode.trim()
          }
        }
      });

      if (fnErr || (data && !data.success)) {
        throw new Error(data?.error || fnErr?.message || "Error al guardar credenciales");
      }

      setAccountMode('byoc');
      setConnectionStatus('connected');
      toast({
        title: "Credenciales guardadas",
        description: "Tu cuenta propia de DAC ha sido guardada y activada exitosamente.",
        type: "success"
      });

      if (onSaved) onSaved();
    } catch (err: any) {
      toast({
        title: "Error al guardar",
        description: err.message || "No se pudieron guardar las credenciales.",
        type: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!username.trim() || !password.trim()) {
      toast({ title: "Datos incompletos", description: "Ingresá tu usuario y clave para probar la conexión.", type: "error" });
      return;
    }

    setTesting(true);
    setLastError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('vendor-shipping-test-connection', {
        body: {
          provider: 'dac',
          customer_number: customerNumber.trim(),
          username: username.trim(),
          password: password.trim(),
          environment
        }
      });

      if (fnErr || (data && !data.success)) {
        const msg = data?.error || fnErr?.message || "Falló la prueba de conexión con DAC.";
        setLastError(msg);
        setConnectionStatus('error');
        toast({ title: "Conexión fallida", description: msg, type: "error" });
      } else {
        setConnectionStatus('connected');
        setLastTestedAt(new Date().toISOString());
        toast({ title: "Conexión exitosa", description: "Conexión con la API de DAC verificada correctamente.", type: "success" });
      }
    } catch (err: any) {
      setLastError(err.message);
      toast({ title: "Error de prueba", description: err.message, type: "error" });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md">
              <Truck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Configurar Integración DAC</h2>
              <p className="text-xs text-blue-200">Seleccioná la modalidad de envío para tu tienda</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-sm font-medium text-gray-500">Cargando configuración de DAC...</p>
            </div>
          ) : (
            <>
              {/* Modalidad Selection Tabs/Cards */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Modalidad de Cuenta
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Option 1: Standard */}
                  <button
                    type="button"
                    onClick={() => setAccountMode('standard')}
                    className={`p-4 rounded-xl border-2 text-left transition-all relative flex flex-col justify-between ${
                      accountMode === 'standard'
                        ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-600/20'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-gray-900">Tarifas Estándar</span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Sin credenciales
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed mb-3">
                        Usá DAC con las tarifas y reglas predeterminadas de Collectibles. Vos preparás el paquete, lo llevás a DAC y abonás el envío al despacharlo.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-blue-700 mt-2">
                      {accountMode === 'standard' && <Check className="w-4 h-4 text-blue-600" />}
                      <span>{accountMode === 'standard' ? 'Seleccionado' : 'Elegir esta opción'}</span>
                    </div>
                  </button>

                  {/* Option 2: BYOC */}
                  <button
                    type="button"
                    onClick={() => setAccountMode('byoc')}
                    className={`p-4 rounded-xl border-2 text-left transition-all relative flex flex-col justify-between ${
                      accountMode === 'byoc'
                        ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-600/20'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-gray-900">Conectar Mi Cuenta</span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          Cuenta propia
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed mb-3">
                        Ingresá tus credenciales y convenio propio con DAC. Se usarán tus tarifas particulares y la facturación quedará a nombre de tu cuenta.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-blue-700 mt-2">
                      {accountMode === 'byoc' && <Check className="w-4 h-4 text-blue-600" />}
                      <span>{accountMode === 'byoc' ? 'Seleccionado' : 'Elegir esta opción'}</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Standard Mode View */}
              {accountMode === 'standard' && (
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-gray-700 space-y-1">
                      <p className="font-bold text-gray-900">Modalidad Estándar Activa</p>
                      <p>
                        No requerís ingresar claves ni usuario. Collectibles calcula y presenta el costo en el checkout. Tu tienda despacha directamente en cualquier sucursal DAC y paga el envío al despachar. El importe cobrado al comprador se te transfiere en tu liquidación.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleSaveStandardMode}
                      disabled={saving}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2"
                    >
                      {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      Guardar y Usar Tarifas Estándar
                    </button>
                  </div>
                </div>
              )}

              {/* BYOC Form View */}
              {accountMode === 'byoc' && (
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Credenciales de Cuenta DAC</h3>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        connectionStatus === 'connected' ? 'bg-emerald-100 text-emerald-800' :
                        connectionStatus === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {connectionStatus === 'connected' ? 'Conectado' :
                         connectionStatus === 'error' ? 'Error' : 'No configurado'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Número de Cliente DAC (K_Cliente) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={customerNumber}
                        onChange={(e) => setCustomerNumber(e.target.value)}
                        placeholder="Ej: 99090"
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Agencia Habitual / Origen (K_Oficina)
                      </label>
                      <input
                        type="text"
                        value={agencyCode}
                        onChange={(e) => setAgencyCode(e.target.value)}
                        placeholder="Ej: 1 (Montevideo Central)"
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Usuario DAC <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Tu usuario de la API de DAC"
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Contraseña / Token DAC <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Ambiente
                      </label>
                      <select
                        value={environment}
                        onChange={(e: any) => setEnvironment(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      >
                        <option value="production">Producción</option>
                        <option value="testing">Testing / Pruebas</option>
                      </select>
                    </div>
                  </div>

                  {lastError && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{lastError}</span>
                    </div>
                  )}

                  <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setAccountMode('standard')}
                      className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Volver a Tarifas Estándar
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg text-xs font-bold text-gray-700 transition-colors flex items-center gap-1.5"
                      >
                        {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
                        Probar Conexión
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveByocCredentials}
                        disabled={saving}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        Guardar Credenciales
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-gray-400" />
            <span>Las credenciales se almacenan cifradas en servidor seguro.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}

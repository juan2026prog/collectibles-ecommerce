import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  KeyRound, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Copy, 
  Check, 
  Lock, 
  Loader2, 
  Clock, 
  Webhook,
  Zap,
  CheckCircle
} from 'lucide-react';

interface ZincSetting {
  environment: 'sandbox' | 'production';
  is_configured: boolean;
  key_prefix: string | null;
  key_last4: string | null;
  is_enabled: boolean;
  last_tested_at: string | null;
  last_test_status: 'pass' | 'fail' | null;
  last_test_message: string | null;
  webhook_url: string | null;
  webhook_secret_prefix: string | null;
  webhook_secret_last4: string | null;
  updated_at: string | null;
}

interface TestResult {
  ok: boolean;
  status: 'pass' | 'fail';
  message: string;
  elapsed_ms?: number;
  test_products_count?: number;
}

const ZINC_WEBHOOK_URL = 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-webhook';

export default function AdminZincConfig() {
  const [loading, setLoading] = useState<boolean>(true);
  const [savingEnv, setSavingEnv] = useState<'sandbox' | 'production' | null>(null);
  const [testingEnv, setTestingEnv] = useState<'sandbox' | 'production' | null>(null);
  
  const [settings, setSettings] = useState<ZincSetting[]>([]);
  
  const [sandboxKeyInput, setSandboxKeyInput] = useState<string>('');
  const [productionKeyInput, setProductionKeyInput] = useState<string>('');
  
  const [sandboxValidationErr, setSandboxValidationErr] = useState<string>('');
  const [productionValidationErr, setProductionValidationErr] = useState<string>('');
  
  const [sandboxTestResult, setSandboxTestResult] = useState<TestResult | null>(null);
  const [productionTestResult, setProductionTestResult] = useState<TestResult | null>(null);
  
  const [sandboxWebhookSecretInput, setSandboxWebhookSecretInput] = useState<string>('');
  const [productionWebhookSecretInput, setProductionWebhookSecretInput] = useState<string>('');
  const [savingWebhookEnv, setSavingWebhookEnv] = useState<'sandbox' | 'production' | null>(null);
  const [webhookValidationErr, setWebhookValidationErr] = useState<string>('');

  const [copiedWebhook, setCopiedWebhook] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  const isBusy = loading || savingEnv !== null || testingEnv !== null || savingWebhookEnv !== null;

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    setGlobalError(null);
    try {
      const { data, error } = await supabase.functions.invoke('zinc-config', {
        body: { action: 'status' }
      });

      if (error) {
        setGlobalError('No se pudo cargar el estado de credenciales Zinc. Verifique que posee permisos administrativos.');
      } else if (data?.ok && Array.isArray(data.settings)) {
        setSettings(data.settings);
      } else {
        setGlobalError(data?.error || 'Respuesta inesperada al consultar configuración de Zinc.');
      }
    } catch {
      setGlobalError('Error de comunicación con el servicio de configuración.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveKey(environment: 'sandbox' | 'production') {
    setGlobalError(null);
    setGlobalSuccess(null);

    const keyVal = environment === 'sandbox' ? sandboxKeyInput.trim() : productionKeyInput.trim();

    // Client-side validation
    if (environment === 'sandbox') {
      if (!keyVal.startsWith('zn_test_')) {
        setSandboxValidationErr("La API Key de Sandbox debe comenzar exactamente con 'zn_test_'");
        return;
      }
      setSandboxValidationErr('');
    } else {
      if (!keyVal.startsWith('zn_live_')) {
        setProductionValidationErr("La API Key de Producción debe comenzar estrictamente con 'zn_live_'");
        return;
      }
      setProductionValidationErr('');
    }

    setSavingEnv(environment);
    try {
      const { data, error } = await supabase.functions.invoke('zinc-config', {
        body: {
          action: 'save_key',
          environment,
          api_key: keyVal
        }
      });

      if (error) {
        setGlobalError(`Error al almacenar la clave en Vault: ${error.message}`);
      } else if (!data?.ok) {
        setGlobalError(data?.error || 'No se pudo guardar la clave en Vault.');
      } else {
        if (environment === 'sandbox') {
          setSandboxKeyInput('');
        } else {
          setProductionKeyInput('');
        }
        setGlobalSuccess(`Credencial de ${environment === 'sandbox' ? 'Sandbox' : 'Producción'} almacenada con éxito en Supabase Vault.`);
        await fetchStatus();
      }
    } catch {
      setGlobalError('Ocurrió un error inesperado al guardar la credencial.');
    } finally {
      setSavingEnv(null);
    }
  }

  async function handleTestConnection(environment: 'sandbox' | 'production') {
    setGlobalError(null);
    setGlobalSuccess(null);
    setTestingEnv(environment);

    try {
      const { data, error } = await supabase.functions.invoke('zinc-config', {
        body: {
          action: 'test_connection',
          environment
        }
      });

      if (error) {
        const res: TestResult = {
          ok: false,
          status: 'fail',
          message: error.message || 'Error de red al ejecutar prueba de conexión.'
        };
        if (environment === 'sandbox') setSandboxTestResult(res);
        else setProductionTestResult(res);
      } else if (data) {
        const res: TestResult = {
          ok: !!data.ok,
          status: data.ok ? 'pass' : 'fail',
          message: data.message || (data.ok ? 'Conexión verificada exitosamente.' : 'La verificación de conexión falló.'),
          elapsed_ms: data.elapsed_ms,
          test_products_count: data.test_products_count
        };
        if (environment === 'sandbox') setSandboxTestResult(res);
        else setProductionTestResult(res);
      }
      await fetchStatus();
    } catch {
      const res: TestResult = {
        ok: false,
        status: 'fail',
        message: 'Error inesperado al contactar la función de prueba.'
      };
      if (environment === 'sandbox') setSandboxTestResult(res);
      else setProductionTestResult(res);
    } finally {
      setTestingEnv(null);
    }
  }

  async function handleSaveWebhookSecret(environment: 'sandbox' | 'production') {
    setGlobalError(null);
    setGlobalSuccess(null);
    setWebhookValidationErr('');

    const secretVal = environment === 'sandbox' ? sandboxWebhookSecretInput.trim() : productionWebhookSecretInput.trim();
    if (!secretVal.startsWith('zn_whsec_')) {
      setWebhookValidationErr("El Signing Secret del webhook debe comenzar estrictamente con 'zn_whsec_'");
      return;
    }

    setSavingWebhookEnv(environment);
    try {
      const { data, error } = await supabase.functions.invoke('zinc-config', {
        body: {
          action: 'save_webhook_secret',
          environment,
          webhook_secret: secretVal,
        },
      });

      if (error) {
        setGlobalError(`Error al almacenar el secreto en Vault: ${error.message}`);
      } else if (!data?.ok) {
        setGlobalError(data?.error || 'No se pudo guardar el secreto en Vault.');
      } else {
        if (environment === 'sandbox') setSandboxWebhookSecretInput('');
        else setProductionWebhookSecretInput('');
        setGlobalSuccess(`Signing Secret de ${environment === 'sandbox' ? 'Sandbox' : 'Producción'} almacenado en Vault.`);
        await fetchStatus();
      }
    } catch {
      setGlobalError('Ocurrió un error inesperado al guardar el secreto del webhook.');
    } finally {
      setSavingWebhookEnv(null);
    }
  }

  const sandboxSetting = settings.find(s => s.environment === 'sandbox');
  const productionSetting = settings.find(s => s.environment === 'production');

  function renderStatusBadge(item?: ZincSetting) {
    if (!item || !item.is_configured) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
          <XCircle className="w-3.5 h-3.5 text-slate-400" />
          NO CONFIGURADO
        </span>
      );
    }
    if (!item.last_test_status) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          PENDIENTE DE PRUEBA
        </span>
      );
    }
    if (item.last_test_status === 'pass') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          CONECTADO
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
        ERROR
      </span>
    );
  }

  function renderMaskedCredential(item?: ZincSetting, defaultPrefix: string = 'zn_') {
    if (!item || !item.is_configured) {
      return (
        <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 italic">
          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Ninguna credencial configurada en Vault</span>
        </div>
      );
    }
    const prefix = item.key_prefix || defaultPrefix;
    const last4 = item.key_last4 || '';
    const masked = `${prefix}••••••••${last4}`;
    return (
      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-800 dark:text-slate-200">
          <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="tracking-wider">{masked}</span>
        </div>
        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
          Supabase Vault
        </span>
      </div>
    );
  }

  function handleCopyWebhook() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ZINC_WEBHOOK_URL);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2500);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── CABECERA DEL PANEL ── */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20">
                <KeyRound className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                Zinc API 2.0
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 pl-1">
              Configuración segura de credenciales, pruebas de conexión y estado de integración.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchStatus}
              disabled={isBusy}
              title="Actualizar estado de configuración"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar estado</span>
            </button>
          </div>
        </div>

        {/* ── BANNER GLOBAL DE SEGURIDAD ── */}
        <div className="mt-5 p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border-2 border-amber-400/50 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase bg-amber-500 text-slate-950">
                  COMPRAS REALES ZINC: DESACTIVADAS
                </span>
              </div>
              <p className="text-xs text-amber-900 dark:text-amber-200/90 mt-1 font-medium">
                La habilitación de compras reales permanece bloqueada durante esta fase de certificación.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── NOTIFICACIONES GLOBALES ── */}
      {globalError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-sm font-medium flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500" />
          <span>{globalError}</span>
        </div>
      )}
      {globalSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm font-medium flex items-center gap-3">
          <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />
          <span>{globalSuccess}</span>
        </div>
      )}

      {/* ── GRID DE ENTORNOS: SANDBOX & PRODUCCIÓN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ── CARD 1: SANDBOX / TEST ── */}
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Sandbox / Test
                  </h2>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Entorno aislado para pruebas sin gasto real.
                </p>
              </div>
              <div>{renderStatusBadge(sandboxSetting)}</div>
            </div>

            {/* Credencial Almacenada */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Credencial almacenada en Vault
              </label>
              {renderMaskedCredential(sandboxSetting, 'zn_test_')}
            </div>

            {/* Input Guardar Nueva Credencial */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800">
              <label 
                htmlFor="sandbox-key-input"
                className="block text-xs font-semibold text-gray-700 dark:text-gray-300"
              >
                Actualizar API Key Sandbox
              </label>
              <div className="space-y-1.5">
                <input
                  id="sandbox-key-input"
                  type="password"
                  value={sandboxKeyInput}
                  onChange={(e) => {
                    setSandboxKeyInput(e.target.value);
                    if (sandboxValidationErr) setSandboxValidationErr('');
                  }}
                  placeholder="zn_test_..."
                  autoComplete="off"
                  disabled={isBusy}
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono disabled:opacity-50"
                />
                {sandboxValidationErr && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {sandboxValidationErr}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Botones de Acción Sandbox */}
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSaveKey('sandbox')}
                disabled={isBusy || !sandboxKeyInput.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEnv === 'sandbox' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Guardar en Vault</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleTestConnection('sandbox')}
                disabled={isBusy || !sandboxSetting?.is_configured}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testingEnv === 'sandbox' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Probando...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>Probar conexión</span>
                  </>
                )}
              </button>
            </div>

            {/* Telemetría y Resultado de Prueba Sandbox */}
            {(sandboxTestResult || sandboxSetting?.last_tested_at) && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
                  <span className="uppercase text-[10px] tracking-wider text-slate-400">
                    Telemetría Sandbox
                  </span>
                  {sandboxSetting?.last_tested_at && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Última prueba: {new Date(sandboxSetting.last_tested_at).toLocaleString('es-UY')}
                    </span>
                  )}
                </div>
                
                {sandboxTestResult && (
                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Resultado:</span>
                      <span className={`font-bold ${sandboxTestResult.status === 'pass' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {sandboxTestResult.status === 'pass' ? 'PASS' : 'FAIL'}
                      </span>
                      {sandboxTestResult.elapsed_ms !== undefined && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({sandboxTestResult.elapsed_ms}ms)
                        </span>
                      )}
                      {sandboxTestResult.test_products_count !== undefined && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          • {sandboxTestResult.test_products_count} productos sandbox verificados
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 font-medium">
                      {sandboxTestResult.message}
                    </p>
                  </div>
                )}

                {!sandboxTestResult && sandboxSetting?.last_test_message && (
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300">
                    <span className="text-slate-500">Mensaje previo:</span> {sandboxSetting.last_test_message}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── CARD 2: PRODUCCIÓN ── */}
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Producción
                  </h2>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Credencial real. Configurarla no habilita compras automáticamente.
                </p>
              </div>
              <div>{renderStatusBadge(productionSetting)}</div>
            </div>

            {/* Credencial Almacenada */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Credencial almacenada en Vault
              </label>
              {renderMaskedCredential(productionSetting, 'zn_')}
            </div>

            {/* Advertencia Estricta Producción */}
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-amber-800 dark:text-amber-300">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span>COMPRAS REALES ZINC: DESACTIVADAS</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/80">
                Guardar o probar esta credencial no habilita órdenes reales.
              </p>
            </div>

            {/* Input Guardar Nueva Credencial de Producción */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800">
              <label 
                htmlFor="production-key-input"
                className="block text-xs font-semibold text-gray-700 dark:text-gray-300"
              >
                Actualizar API Key Producción
              </label>
              <div className="space-y-1.5">
                <input
                  id="production-key-input"
                  type="password"
                  value={productionKeyInput}
                  onChange={(e) => {
                    setProductionKeyInput(e.target.value);
                    if (productionValidationErr) setProductionValidationErr('');
                  }}
                  placeholder="zn_..."
                  autoComplete="off"
                  disabled={isBusy}
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono disabled:opacity-50"
                />
                {productionValidationErr && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {productionValidationErr}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Botones de Acción Producción */}
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSaveKey('production')}
                disabled={isBusy || !productionKeyInput.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEnv === 'production' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Guardar en Vault</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleTestConnection('production')}
                disabled={isBusy || !productionSetting?.is_configured}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testingEnv === 'production' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Probando...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-emerald-500" />
                    <span>Probar conexión segura</span>
                  </>
                )}
              </button>
            </div>

            {/* Telemetría y Resultado de Prueba Producción */}
            {(productionTestResult || productionSetting?.last_tested_at) && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
                  <span className="uppercase text-[10px] tracking-wider text-slate-400">
                    Telemetría Producción
                  </span>
                  {productionSetting?.last_tested_at && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Última prueba: {new Date(productionSetting.last_tested_at).toLocaleString('es-UY')}
                    </span>
                  )}
                </div>
                
                {productionTestResult && (
                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Resultado:</span>
                      <span className={`font-bold ${productionTestResult.status === 'pass' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {productionTestResult.status === 'pass' ? 'PASS' : 'FAIL'}
                      </span>
                      {productionTestResult.elapsed_ms !== undefined && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({productionTestResult.elapsed_ms}ms)
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 font-medium">
                      {productionTestResult.message}
                    </p>
                  </div>
                )}

                {!productionTestResult && productionSetting?.last_test_message && (
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300">
                    <span className="text-slate-500">Mensaje previo:</span> {productionSetting.last_test_message}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── SECCIÓN 3: WEBHOOK ZINC ── */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Webhook className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Webhook Zinc API 2.0
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Punto de recepción para notificaciones asíncronas de órdenes y tracking firmadas con HMAC-SHA256.
              </p>
            </div>
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ENDPOINT ACTIVO
            </span>
          </div>
        </div>

        {/* Webhook URL Display */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                URL del Webhook (Configurar en Zinc Dashboard)
              </span>
              <div className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all font-semibold">
                {ZINC_WEBHOOK_URL}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyWebhook}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 min-h-[44px] text-xs font-semibold rounded-xl bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors shadow-sm shrink-0"
            >
              {copiedWebhook ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span>Copiar URL</span>
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-200 dark:border-slate-700/60 pt-2.5">
            Configura esta misma URL en Zinc Dashboard tanto para Test Mode como para Production. El endpoint verifica la firma digital de forma segura y aísla los entornos automáticamente.
          </p>
        </div>

        {/* Webhook Secrets Form Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sandbox Webhook Secret */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Signing Secret (Sandbox / Test Mode)
              </span>
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                zn_whsec_...
              </span>
            </div>

            <div className="text-xs">
              {sandboxSetting?.webhook_secret_prefix ? (
                <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-700 dark:text-slate-300">
                  <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{sandboxSetting.webhook_secret_prefix}••••••••{sandboxSetting.webhook_secret_last4}</span>
                </div>
              ) : (
                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 italic text-xs">
                  Ningún secreto de webhook configurado en Vault
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                placeholder="zn_whsec_..."
                value={sandboxWebhookSecretInput}
                onChange={(e) => setSandboxWebhookSecretInput(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                disabled={isBusy}
              />
              <button
                type="button"
                onClick={() => handleSaveWebhookSecret('sandbox')}
                disabled={isBusy || !sandboxWebhookSecretInput.trim()}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
              >
                {savingWebhookEnv === 'sandbox' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Production Webhook Secret */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Signing Secret (Production)
              </span>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                zn_whsec_...
              </span>
            </div>

            <div className="text-xs">
              {productionSetting?.webhook_secret_prefix ? (
                <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-700 dark:text-slate-300">
                  <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{productionSetting.webhook_secret_prefix}••••••••{productionSetting.webhook_secret_last4}</span>
                </div>
              ) : (
                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 italic text-xs">
                  Ningún secreto de webhook configurado en Vault
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                placeholder="zn_whsec_..."
                value={productionWebhookSecretInput}
                onChange={(e) => setProductionWebhookSecretInput(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                disabled={isBusy}
              />
              <button
                type="button"
                onClick={() => handleSaveWebhookSecret('production')}
                disabled={isBusy || !productionWebhookSecretInput.trim()}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
              >
                {savingWebhookEnv === 'production' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>

        {webhookValidationErr && (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {webhookValidationErr}
          </p>
        )}

        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            <strong>Aviso de Seguridad:</strong> Cada webhook enviado por Zinc está firmado mediante HMAC-SHA256. El secreto vive exclusivamente en Supabase Vault. Si un secreto estuvo visible en capturas o logs externos, debe rotarse en el panel de Zinc antes de ingresar el nuevo valor aquí.
          </p>
        </div>
      </div>
    </div>
  );
}

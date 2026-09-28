import { useState, useEffect } from 'react';
import { 
  Brain, ShieldAlert, Cpu, Globe, DollarSign, Activity, AlertTriangle, 
  Settings, Power, RefreshCw, CheckCircle2, XCircle, Info, Lock,
  History, Search, ShieldCheck, Play, Zap
} from 'lucide-react';
import { AIAdminService } from '../../services/ai/aiAdminService';
import type { 
  AISystemConfig, 
  AIEngineConfig, 
  AICountryConfig, 
  AIUsageEvent, 
  AIErrorEvent, 
  AIAuditLog, 
  AIDashboardSummary,
  AITestResult 
} from '../../services/ai/types';
import { useAuth } from '../../contexts/AuthContext';

type TabType = 'overview' | 'engines' | 'countries' | 'budgets' | 'usage' | 'errors' | 'system' | 'audit';

const NAV_TABS = [
  { id: 'overview', label: 'Resumen y pruebas', icon: Activity },
  { id: 'engines', label: 'Motores IA', icon: Cpu },
  { id: 'countries', label: 'Países', icon: Globe },
  { id: 'budgets', label: 'Costos y límites', icon: DollarSign },
  { id: 'usage', label: 'Uso', icon: CheckCircle2 },
  { id: 'errors', label: 'Errores', icon: AlertTriangle },
  { id: 'system', label: 'Sistema', icon: Settings },
  { id: 'audit', label: 'Auditoría', icon: History },
] as const;

export default function AdminAIControlCenter() {
  const { user, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State data
  const [summary, setSummary] = useState<AIDashboardSummary | null>(null);
  const [systemConfig, setSystemConfig] = useState<AISystemConfig | null>(null);
  const [engines, setEngines] = useState<AIEngineConfig[]>([]);
  const [countries, setCountries] = useState<AICountryConfig[]>([]);
  const [usageEvents, setUsageEvents] = useState<AIUsageEvent[]>([]);
  const [errorEvents, setErrorEvents] = useState<AIErrorEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AIAuditLog[]>([]);

  // Server diagnostic status
  const [diagnostic, setDiagnostic] = useState<{ ok: boolean; configured: boolean; liveTestEnabled: boolean; supportedModels: string[] }>({
    ok: false,
    configured: false,
    liveTestEnabled: false,
    supportedModels: []
  });

  // Live Test State
  const [testModel, setTestModel] = useState<string>('gpt-5.6-terra');
  const [testRunning, setTestRunning] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<AITestResult | null>(null);

  // Confirmation Modal State for Global Switch
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingGlobalState, setPendingGlobalState] = useState<boolean>(false);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    try {
      const [sum, sys, engs, cntrs, usg, errs, aud, diag] = await Promise.all([
        AIAdminService.getDashboardSummary(),
        AIAdminService.getSystemConfig(),
        AIAdminService.getEngineConfigs(),
        AIAdminService.getCountryConfigs(),
        AIAdminService.getUsageEvents(50),
        AIAdminService.getErrorEvents(50),
        AIAdminService.getAuditLogs(50),
        AIAdminService.getDiagnosticStatus()
      ]);

      setSummary(sum);
      setSystemConfig(sys);
      setEngines(engs);
      setCountries(cntrs);
      setUsageEvents(usg);
      setErrorEvents(errs);
      setAuditLogs(aud);
      setDiagnostic(diag);
    } catch (err: any) {
      console.error('Error loading AI Control Center data:', err);
      setStatusMessage({ type: 'error', text: 'Error al cargar datos de control IA.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleGlobalSwitch(enable: boolean) {
    setPendingGlobalState(enable);
    setConfirmModalOpen(true);
  }

  async function confirmGlobalSwitch() {
    setConfirmModalOpen(false);
    setActionLoading(true);
    try {
      await AIAdminService.updateSystemConfig({ global_enabled: pendingGlobalState }, user?.email);
      setStatusMessage({ 
        type: 'success', 
        text: `AI Master Switch ${pendingGlobalState ? 'ACTIVADO' : 'DESACTIVADO (OFF)'} exitosamente.` 
      });
      await loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'Error al actualizar AI Master Switch.' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleEngine(engine: AIEngineConfig) {
    setActionLoading(true);
    try {
      await AIAdminService.updateEngineConfig(engine.id, { enabled: !engine.enabled }, user?.email);
      setStatusMessage({ 
        type: 'success', 
        text: `Motor ${engine.name} ${!engine.enabled ? 'activado' : 'desactivado'}.` 
      });
      await loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'Error al actualizar configuración del motor.' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleCountry(country: AICountryConfig) {
    setActionLoading(true);
    try {
      await AIAdminService.updateCountryConfig(country.id, { ai_enabled: !country.ai_enabled }, user?.email);
      setStatusMessage({ 
        type: 'success', 
        text: `IA para ${country.country_name} ${!country.ai_enabled ? 'activada' : 'desactivada'}.` 
      });
      await loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'Error al actualizar configuración de país.' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleCountryEngine(country: AICountryConfig, field: keyof AICountryConfig) {
    setActionLoading(true);
    try {
      const currentVal = country[field] as boolean;
      await AIAdminService.updateCountryConfig(country.id, { [field]: !currentVal }, user?.email);
      setStatusMessage({ 
        type: 'success', 
        text: `Ajuste de motor en ${country.country_name} guardado.` 
      });
      await loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'Error al actualizar motor en país.' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRunLiveTest() {
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await AIAdminService.runLiveTest(testModel);
      setTestResult(res);
      if (res.ok && res.certified) {
        setStatusMessage({
          type: 'success',
          text: `Prueba E2E OpenAI certificada con éxito (${res.model}) — Latencia: ${res.latencyMs}ms.`
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'La prueba de OpenAI no devolvió el resultado esperado.'
        });
      }
      // Reload usage telemetry and stats
      const [sum, usg, errs] = await Promise.all([
        AIAdminService.getDashboardSummary(),
        AIAdminService.getUsageEvents(50),
        AIAdminService.getErrorEvents(50)
      ]);
      setSummary(sum);
      setUsageEvents(usg);
      setErrorEvents(errs);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'Fallo al ejecutar la prueba en vivo de OpenAI.' });
    } finally {
      setTestRunning(false);
    }
  }

  const isOpenAIConfigured = diagnostic.configured && systemConfig?.provider === 'OPENAI';

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 p-4 md:p-8 font-sans pb-24">
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-center gap-4 z-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#f00856] to-pink-700 flex items-center justify-center text-white shadow-lg shadow-[#f00856]/20">
              <Brain className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">AI Control Center</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-[#f00856]/20 text-[#f00856] border border-[#f00856]/40 text-xs font-black uppercase tracking-wider">
                  SuperAdmin Exclusive
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Infraestructura centralizada de Inteligencia Artificial para Collectibles 2026.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 z-10">
            <button
              onClick={loadAllData}
              disabled={loading || actionLoading || testRunning}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl text-sm font-medium border border-gray-700 transition flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            
            <div className="flex items-center gap-2 bg-[#0d1117] border border-gray-800 rounded-xl px-4 py-2">
              <div className={`w-2.5 h-2.5 rounded-full ${systemConfig?.global_enabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-xs font-semibold text-gray-300">
                AI GLOBAL: <span className={systemConfig?.global_enabled ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {systemConfig?.global_enabled ? 'ON' : 'OFF'}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className={`p-4 rounded-xl text-sm flex items-center justify-between border ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60' 
              : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
          }`}>
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="text-xs font-bold underline ml-4">
              Cerrar
            </button>
          </div>
        )}

        {/* Security Hardening Note */}
        <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-4 flex items-start gap-3 text-xs text-emerald-300">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-200">OpenAI Gateway Server-Side Activo:</span> Toda llamada de IA se procesa a través de <code className="bg-emerald-950 px-1 py-0.5 rounded text-emerald-300 font-mono">/api/ai-execute</code> y OpenAI Responses API (<code className="bg-emerald-950 px-1 py-0.5 rounded text-emerald-300 font-mono">store: false</code>). Credenciales server-side protegidas con telemetría de tokens, costos reales y control de fallbacks.
          </div>
        </div>

        {/* Navigation — responsive grid, no horizontal scrolling */}
        <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)}
                  className={`min-h-[48px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                    isActive ? 'bg-[#f00856] text-white shadow-md' : 'text-gray-300 bg-[#0d1117] hover:bg-gray-800 border border-gray-800'
                  }`}>
                  <Icon className="w-4 h-4 shrink-0" /><span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TAB 1: OVERVIEW & TEST */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Status Metric Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 space-y-2">
                <span className="text-xs text-gray-400 font-medium">OpenAI Provider</span>
                <div className={`text-lg font-bold flex items-center gap-2 ${isOpenAIConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${isOpenAIConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {isOpenAIConfigured ? 'CONNECTED' : (systemConfig?.provider || 'NONE')}
                </div>
                <p className="text-[11px] text-gray-500">
                  Key: {diagnostic.configured ? 'Configurada en servidor' : 'No detectada'}
                </p>
              </div>

              <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 space-y-2">
                <span className="text-xs text-gray-400 font-medium">AI Global Master</span>
                <div className={`text-lg font-bold flex items-center gap-2 ${systemConfig?.global_enabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${systemConfig?.global_enabled ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  {systemConfig?.global_enabled ? 'ENABLED (ON)' : 'DISABLED (OFF)'}
                </div>
                <p className="text-[11px] text-gray-500">Env: {systemConfig?.environment || 'PRODUCTION'}</p>
              </div>

              <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 space-y-2">
                <span className="text-xs text-gray-400 font-medium">Cost Today / Month</span>
                <div className="text-lg font-bold text-white font-mono">
                  USD {summary?.cost_today_usd ? summary.cost_today_usd.toFixed(4) : '0.0000'}
                </div>
                <p className="text-[11px] text-gray-500">
                  Month: USD {summary?.cost_month_usd ? summary.cost_month_usd.toFixed(4) : '0.0000'}
                </p>
              </div>

              <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 space-y-2">
                <span className="text-xs text-gray-400 font-medium">Requests / Errors Today</span>
                <div className="text-lg font-bold text-white font-mono">
                  {summary?.requests_today || 0} reqs / {summary?.errors_today || 0} errs
                </div>
                <p className="text-[11px] text-gray-500">
                  Avg Latency: {summary?.avg_latency_ms ? `${summary.avg_latency_ms}ms` : '—'}
                </p>
              </div>
            </div>

            {/* Master Kill Switch Box */}
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Power className="w-5 h-5 text-[#f00856]" /> Master Kill Switch
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Control maestro global de IA. Cuando está apagado (OFF), ningún módulo, país o motor puede realizar llamadas de IA. El Gateway responderá de forma controlada con <code className="text-amber-400">AI_DISABLED</code> sin generar errores en la UI.
                  </p>
                </div>

                <button
                  onClick={() => handleToggleGlobalSwitch(!systemConfig?.global_enabled)}
                  disabled={actionLoading}
                  className={`px-6 py-3 rounded-xl font-bold text-sm transition shadow-lg flex items-center justify-center gap-2 min-w-[180px] ${
                    systemConfig?.global_enabled
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  }`}
                >
                  <Power className="w-4 h-4" />
                  {systemConfig?.global_enabled ? 'DESACTIVAR AI GLOBAL' : 'ACTIVAR AI GLOBAL'}
                </button>
              </div>
            </div>

            {/* Administrative Live Certification Test Box */}
            <div className="bg-[#161b22] border border-purple-900/40 rounded-2xl p-6 space-y-4 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-purple-400" /> Prueba de Certificación E2E en Vivo
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Ejecuta 1 única llamada controlada a OpenAI Responses API (<code className="text-purple-300">OPENAI_COLLECTIBLES_OK</code>) para validar el circuito completo, tokens, cálculo de costo, latencia y telemetría en tiempo real.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={testModel}
                    onChange={(e) => setTestModel(e.target.value)}
                    disabled={testRunning}
                    className="bg-[#0d1117] border border-gray-700 text-white text-xs rounded-xl px-3 py-2.5 font-mono focus:outline-none focus:border-purple-500"
                  >
                    <option value="gpt-5.6-terra">gpt-5.6-terra</option>
                    <option value="gpt-5.6-sol">gpt-5.6-sol</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                  </select>

                  <button
                    onClick={handleRunLiveTest}
                    disabled={testRunning || !diagnostic.configured}
                    className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-purple-600/20 transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {testRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Ejecutar Test E2E
                      </>
                    )}
                  </button>
                </div>
              </div>

              {testResult && (
                <div className={`p-4 rounded-xl border space-y-3 ${
                  testResult.ok && testResult.certified
                    ? 'bg-emerald-950/30 border-emerald-800 text-emerald-200'
                    : 'bg-rose-950/30 border-rose-800 text-rose-200'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                      {testResult.ok && testResult.certified ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Certificación E2E Exitosa (OK)
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-rose-400" />
                          Fallo de Certificación
                        </>
                      )}
                    </span>
                    <span className="text-[11px] font-mono text-gray-400 break-all sm:text-right">
                      Request ID: {testResult.requestId}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs font-mono bg-[#0d1117]/80 p-3 rounded-lg border border-gray-800">
                    <div>
                      <span className="text-gray-500 text-[10px] block font-sans">Respuesta OpenAI:</span>
                      <span className="text-white font-bold break-words">{testResult.response || testResult.error}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] block font-sans">Modelo:</span>
                      <span className="text-purple-300 break-words">{testResult.model || testModel}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] block font-sans">Tokens (In / Out / Tot):</span>
                      <span className="text-white">
                        {testResult.usage?.inputTokens || 0} / {testResult.usage?.outputTokens || 0} / {testResult.usage?.totalTokens || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] block font-sans">Costo Estimado:</span>
                      <span className="text-emerald-400 font-bold">
                        {testResult.pricing?.estimated_cost_usd !== null && testResult.pricing?.estimated_cost_usd !== undefined
                          ? `$${testResult.pricing.estimated_cost_usd.toFixed(6)}`
                          : 'UNKNOWN_PRICING'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] block font-sans">Latencia:</span>
                      <span className="text-amber-300 font-bold">{testResult.latencyMs} ms</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Hierarchy Overview Card */}
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-400" /> Jerarquía de Autorización de IA
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-center">
                <div className="bg-[#0d1117] border border-gray-800 p-4 rounded-xl">
                  <span className="text-xs text-gray-500 block font-semibold mb-1">NIVEL 1</span>
                  <span className="text-sm font-bold text-white">AI GLOBAL</span>
                  <span className="text-[10px] text-gray-400 block mt-1">Master Kill Switch</span>
                </div>
                <div className="bg-[#0d1117] border border-gray-800 p-4 rounded-xl">
                  <span className="text-xs text-gray-500 block font-semibold mb-1">NIVEL 2</span>
                  <span className="text-sm font-bold text-white">COUNTRY</span>
                  <span className="text-[10px] text-gray-400 block mt-1">Habilitación por País</span>
                </div>
                <div className="bg-[#0d1117] border border-gray-800 p-4 rounded-xl">
                  <span className="text-xs text-gray-500 block font-semibold mb-1">NIVEL 3</span>
                  <span className="text-sm font-bold text-white">ENGINE</span>
                  <span className="text-[10px] text-gray-400 block mt-1">Habilitación por Motor</span>
                </div>
                <div className="bg-[#0d1117] border border-gray-800 p-4 rounded-xl">
                  <span className="text-xs text-gray-500 block font-semibold mb-1">NIVEL 4</span>
                  <span className="text-sm font-bold text-white">BUDGET</span>
                  <span className="text-[10px] text-gray-400 block mt-1">Presupuesto Diario / Mes</span>
                </div>
                <div className="bg-[#0d1117] border border-gray-800 p-4 rounded-xl">
                  <span className="text-xs text-gray-500 block font-semibold mb-1">NIVEL 5</span>
                  <span className="text-sm font-bold text-white">PROVIDER</span>
                  <span className="text-[10px] text-gray-400 block mt-1">Null Provider / OpenAI</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ENGINES */}
        {activeTab === 'engines' && (
          <div className="space-y-4">
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-2">Motores de Inteligencia Artificial (7)</h3>
              <p className="text-xs text-gray-400 mb-6">
                Configuración independiente para cada motor operativo. Todos los motores operan bajo el AI Gateway y pueden ser activados selectivamente.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {engines.map((engine) => (
                  <div key={engine.id} className="bg-[#0d1117] border border-gray-800 rounded-xl p-5 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h4 className="font-bold text-white text-sm truncate">{engine.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          engine.enabled 
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {engine.enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2 mb-3">{engine.description}</p>
                      
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400 bg-gray-900/60 p-2.5 rounded-lg border border-gray-800/80">
                        <div>
                          <span className="text-gray-500 block">Clave:</span>
                          <span className="font-mono text-gray-200">{engine.engine_key}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Proveedor / Modelo:</span>
                          <span className="font-mono text-gray-200">{engine.provider} ({engine.model})</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Max Tokens In/Out:</span>
                          <span className="text-gray-200">{engine.max_input_tokens} / {engine.max_output_tokens}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Timeout:</span>
                          <span className="text-gray-200">{engine.timeout_ms}ms</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">Fallback: {engine.fallback_enabled ? 'Activo' : 'Inactivo'}</span>
                      <button
                        onClick={() => handleToggleEngine(engine)}
                        disabled={actionLoading}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          engine.enabled
                            ? 'bg-rose-900/40 text-rose-300 border border-rose-800 hover:bg-rose-800/60'
                            : 'bg-emerald-900/40 text-emerald-300 border border-emerald-800 hover:bg-emerald-800/60'
                        }`}
                      >
                        {engine.enabled ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: COUNTRIES */}
        {activeTab === 'countries' && (
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Configuración Regional por País</h3>
              <p className="text-xs text-gray-400">
                Matriz granular de activación por país. Cada país cuenta con interruptores específicos para cada motor. Si AI Global = OFF, ningún país ejecutará IA aunque esté encendido individualmente.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-[#0d1117] text-gray-400 text-xs uppercase font-semibold border-b border-gray-800">
                  <tr>
                    <th className="p-3">País</th>
                    <th className="p-3 text-center">AI Master</th>
                    <th className="p-3 text-center">AI Search</th>
                    <th className="p-3 text-center">Discovery</th>
                    <th className="p-3 text-center">Trends</th>
                    <th className="p-3 text-center">Curation</th>
                    <th className="p-3 text-center">Radar</th>
                    <th className="p-3 text-center">Releases</th>
                    <th className="p-3 text-right">Presupuesto Día</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-sans">
                  {countries.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-800/30 transition">
                      <td className="p-3 font-semibold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-gray-800 text-xs font-mono font-bold flex items-center justify-center text-primary-400">
                          {c.country_code}
                        </span>
                        {c.country_name}
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleCountry(c)}
                          disabled={actionLoading}
                          className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                            c.ai_enabled 
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {c.ai_enabled ? 'ON' : 'OFF'}
                        </button>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleCountryEngine(c, 'ai_search_enabled')}
                          disabled={actionLoading}
                          className={`w-6 h-6 rounded text-xs font-bold ${
                            c.ai_search_enabled ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {c.ai_search_enabled ? '✓' : '—'}
                        </button>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleCountryEngine(c, 'product_discovery_enabled')}
                          disabled={actionLoading}
                          className={`w-6 h-6 rounded text-xs font-bold ${
                            c.product_discovery_enabled ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {c.product_discovery_enabled ? '✓' : '—'}
                        </button>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleCountryEngine(c, 'trend_analysis_enabled')}
                          disabled={actionLoading}
                          className={`w-6 h-6 rounded text-xs font-bold ${
                            c.trend_analysis_enabled ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {c.trend_analysis_enabled ? '✓' : '—'}
                        </button>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleCountryEngine(c, 'product_curation_enabled')}
                          disabled={actionLoading}
                          className={`w-6 h-6 rounded text-xs font-bold ${
                            c.product_curation_enabled ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {c.product_curation_enabled ? '✓' : '—'}
                        </button>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleCountryEngine(c, 'radar_intelligence_enabled')}
                          disabled={actionLoading}
                          className={`w-6 h-6 rounded text-xs font-bold ${
                            c.radar_intelligence_enabled ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {c.radar_intelligence_enabled ? '✓' : '—'}
                        </button>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleCountryEngine(c, 'release_intelligence_enabled')}
                          disabled={actionLoading}
                          className={`w-6 h-6 rounded text-xs font-bold ${
                            c.release_intelligence_enabled ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {c.release_intelligence_enabled ? '✓' : '—'}
                        </button>
                      </td>

                      <td className="p-3 text-right font-mono text-gray-400">
                        USD {c.daily_budget_usd ? Number(c.daily_budget_usd).toFixed(2) : '0.00'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: BUDGETS */}
        {activeTab === 'budgets' && (
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Presupuestos y Límites Financieros</h3>
              <p className="text-xs text-gray-400">
                Límites máximos de consumo diario y mensual para prevenir sobrecostos accidentales.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-5 space-y-3">
                <h4 className="font-bold text-white text-sm">Presupuesto Global</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Límite Diario:</span>
                    <span className="font-mono text-white">USD {Number(systemConfig?.daily_budget_usd || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Límite Mensual:</span>
                    <span className="font-mono text-white">USD {Number(systemConfig?.monthly_budget_usd || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Gasto Actual Hoy:</span>
                    <span className="font-mono text-emerald-400">
                      USD {summary?.cost_today_usd ? summary.cost_today_usd.toFixed(4) : '0.0000'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-5 space-y-3">
                <h4 className="font-bold text-white text-sm">Circuit Breaker</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Estado:</span>
                    <span className="font-mono text-emerald-400 font-bold">{systemConfig?.circuit_breaker_state || 'CLOSED'}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Protección Automática:</span>
                    <span className="text-white">{systemConfig?.circuit_breaker_enabled ? 'Activa' : 'Inactiva'}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Se abre automáticamente si se supera el presupuesto o exceden tasas de error.
                  </p>
                </div>
              </div>

              <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-5 space-y-3">
                <h4 className="font-bold text-white text-sm">Monitoreo de Costos OpenAI</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Costo Registrado Hoy:</span>
                    <span className="font-mono text-white">
                      USD {summary?.cost_today_usd ? summary.cost_today_usd.toFixed(4) : '0.0000'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Llamadas API Hoy:</span>
                    <span className="font-mono text-white">{summary?.requests_today || 0} llamadas</span>
                  </div>
                  <p className="text-[11px] text-emerald-400/80 mt-2">
                    Cálculo exacto mediante api/lib/openaiPricing.js.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: USAGE */}
        {activeTab === 'usage' && (
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Telemetría de Uso de IA</h3>
            {usageEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-[#0d1117] rounded-xl border border-gray-800/80">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                <p className="text-sm font-medium">No AI usage recorded yet.</p>
                <p className="text-xs text-gray-600 mt-1">Ejecuta un Test E2E desde Overview para verificar telemetría en vivo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-[#0d1117] text-gray-400">
                    <tr>
                      <th className="p-2">Fecha</th>
                      <th className="p-2">Motor</th>
                      <th className="p-2">País</th>
                      <th className="p-2">Modelo</th>
                      <th className="p-2">Tokens (In / Out / Tot)</th>
                      <th className="p-2">Costo (USD)</th>
                      <th className="p-2">Latencia</th>
                      <th className="p-2">Estado</th>
                      <th className="p-2">Request ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageEvents.map((evt) => (
                      <tr key={evt.id} className="border-b border-gray-800">
                        <td className="p-2">{new Date(evt.created_at).toLocaleString()}</td>
                        <td className="p-2 font-mono">{evt.engine}</td>
                        <td className="p-2">{evt.country_code}</td>
                        <td className="p-2 font-mono text-purple-300">{evt.model}</td>
                        <td className="p-2 font-mono">
                          {evt.input_tokens} / {evt.output_tokens} / {evt.total_tokens}
                        </td>
                        <td className="p-2 font-mono text-emerald-400">${evt.estimated_cost_usd.toFixed(4)}</td>
                        <td className="p-2">{evt.latency_ms}ms</td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold text-[10px]">
                            {evt.status}
                          </span>
                        </td>
                        <td className="p-2 font-mono text-[10px] text-gray-500 truncate max-w-[120px]">
                          {evt.request_id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: ERRORS */}
        {activeTab === 'errors' && (
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Registro Seguro de Errores</h3>
            {errorEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-[#0d1117] rounded-xl border border-gray-800/80">
                <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                <p className="text-sm font-medium">No AI errors recorded.</p>
                <p className="text-xs text-gray-600 mt-1">No se han registrado incidencias en el AI Gateway.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-[#0d1117] text-gray-400">
                    <tr>
                      <th className="p-2">Fecha</th>
                      <th className="p-2">Motor</th>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Código</th>
                      <th className="p-2">Mensaje Seguro</th>
                      <th className="p-2">Request ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorEvents.map((err) => (
                      <tr key={err.id} className="border-b border-gray-800">
                        <td className="p-2">{new Date(err.created_at).toLocaleString()}</td>
                        <td className="p-2 font-mono">{err.engine}</td>
                        <td className="p-2 text-amber-400 font-bold">{err.error_type}</td>
                        <td className="p-2 font-mono">{err.error_code || '—'}</td>
                        <td className="p-2 text-rose-300">{err.safe_message}</td>
                        <td className="p-2 font-mono text-[10px] text-gray-500">{err.request_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: SYSTEM */}
        {activeTab === 'system' && (
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Configuración del Sistema y Proveedores</h3>
              <p className="text-xs text-gray-400">
                Estado de infraestructura del backend y servidor.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Proveedor Configurado</span>
                  <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-mono text-xs">
                    {systemConfig?.provider || 'NONE'}
                  </span>
                </div>
                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  isOpenAIConfigured 
                    ? 'bg-emerald-950/20 border border-emerald-900/40 text-emerald-300'
                    : 'bg-amber-950/20 border border-amber-900/40 text-amber-300'
                }`}>
                  <Info className="w-4 h-4 shrink-0" />
                  <span>
                    {isOpenAIConfigured
                      ? 'OpenAI Provider activo y autenticado server-side con OpenAI Responses API.'
                      : 'OpenAI no está activo o sus credenciales están pendientes en el servidor.'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Por regla estricta de seguridad, ninguna API Key se almacena en el cliente ni en tablas públicas. Todo secreto vive exclusivamente en variables de entorno del servidor.
                </p>
              </div>

              <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Timeout por Defecto</span>
                  <span className="font-mono text-xs text-white">{systemConfig?.default_timeout_ms || 15000} ms</span>
                </div>
                <p className="text-xs text-gray-400">
                  Tiempo máximo de espera para llamadas de IA antes de disparar el fallback local.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: AUDIT */}
        {activeTab === 'audit' && (
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Registro de Auditoría de SuperAdmin</h3>
            {auditLogs.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-[#0d1117] rounded-xl border border-gray-800/80">
                <History className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                <p className="text-sm font-medium">No audit events recorded yet.</p>
                <p className="text-xs text-gray-600 mt-1">Los cambios en configuraciones de IA se registrarán aquí.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-[#0d1117] text-gray-400">
                    <tr>
                      <th className="p-2">Fecha</th>
                      <th className="p-2">SuperAdmin</th>
                      <th className="p-2">Acción</th>
                      <th className="p-2">Motor/País</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-800">
                        <td className="p-2">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="p-2 text-primary-400">{log.actor_email}</td>
                        <td className="p-2 font-mono font-bold text-white">{log.action}</td>
                        <td className="p-2">{log.engine || log.country_code || 'GLOBAL'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">
                ¿Confirmar cambio de AI Master Switch?
              </h3>
            </div>
            
            <p className="text-sm text-gray-300">
              Estás a punto de cambiar el estado global de IA a:{' '}
              <strong className={pendingGlobalState ? 'text-emerald-400' : 'text-rose-400'}>
                {pendingGlobalState ? 'ACTIVADO (ON)' : 'DESACTIVADO (OFF)'}
              </strong>.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmGlobalSwitch}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition text-white ${
                  pendingGlobalState ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

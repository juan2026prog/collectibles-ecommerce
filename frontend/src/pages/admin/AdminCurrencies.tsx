import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  DollarSign,
  RefreshCw,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Edit3,
  RotateCcw,
  History,
  ShieldCheck,
  Building2,
  ArrowRight,
  Zap,
  Info
} from 'lucide-react';
import {
  CurrencyService,
  COUNTRY_CURRENCY_CONFIG,
  FALLBACK_RATES,
  type DisplayCurrency,
  type ExchangeRateDetail,
  type FXStatus
} from '../../services/currencyService';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

interface RateHistoryItem {
  id: string;
  quote_currency: string;
  rate: number;
  provider: string;
  source_name: string;
  source_url: string;
  status: string;
  is_manual_override: boolean;
  reason?: string;
  admin_email?: string;
  effective_at: string;
  recorded_at: string;
}

export default function AdminCurrencies() {
  const [rates, setRates] = useState<Record<DisplayCurrency, ExchangeRateDetail>>(() =>
    CurrencyService.getAllStoredExchangeRates()
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<DisplayCurrency | null>('UYU');
  const [historyItems, setHistoryItems] = useState<RateHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Override modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideCurrency, setOverrideCurrency] = useState<DisplayCurrency>('UYU');
  const [overrideRate, setOverrideRate] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [savingOverride, setSavingOverride] = useState(false);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    loadExchangeRates();
  }, []);

  useEffect(() => {
    if (selectedCurrency) {
      loadCurrencyHistory(selectedCurrency);
    }
  }, [selectedCurrency]);

  async function loadExchangeRates() {
    setLoading(true);
    try {
      const updated = await CurrencyService.fetchLiveExchangeRates();
      setRates(updated);
    } catch (err: any) {
      toast.error('Error al cargar cotizaciones: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCurrencyHistory(currency: DisplayCurrency) {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('currency_exchange_rate_history')
        .select('*')
        .eq('quote_currency', currency)
        .order('recorded_at', { ascending: false })
        .limit(25);

      if (!error && data) {
        setHistoryItems(data);
      } else {
        setHistoryItems([]);
      }
    } catch (err) {
      console.warn('Error loading FX history from Supabase:', err);
      setHistoryItems([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleForceSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/currency-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SYNC_ALL' })
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Fallo en la sincronización server-side');
      }

      toast.success('Sincronización FX completada exitosamente desde Open Exchange Rates');
      await loadExchangeRates();
      if (selectedCurrency) {
        await loadCurrencyHistory(selectedCurrency);
      }
    } catch (err: any) {
      toast.error('Error al sincronizar cotizaciones: ' + err.message);
    } finally {
      setSyncing(false);
    }
  }

  function openOverrideModal(currency: DisplayCurrency) {
    const currentRate = rates[currency]?.rate || FALLBACK_RATES[currency] || 1;
    setOverrideCurrency(currency);
    setOverrideRate(currentRate.toString());
    setOverrideReason('');
    setShowOverrideModal(true);
  }

  async function handleSaveOverride() {
    const num = parseFloat(overrideRate);
    if (isNaN(num) || num <= 0) {
      toast.error('Debe ingresar un tipo de cambio numérico positivo.');
      return;
    }
    if (!overrideReason.trim()) {
      toast.error('Debe ingresar el motivo obligatorio del override manual.');
      return;
    }

    setSavingOverride(true);
    try {
      const res = await fetch('/api/currency-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'MANUAL_OVERRIDE',
          quote_currency: overrideCurrency,
          rate: num,
          reason: overrideReason.trim(),
          admin_email: 'superadmin@collectibles.uy'
        })
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Error al aplicar override');
      }

      toast.success(`Override manual aplicado a USD/${overrideCurrency}: ${num}`);
      setShowOverrideModal(false);
      await loadExchangeRates();
      await loadCurrencyHistory(overrideCurrency);
    } catch (err: any) {
      toast.error('Error al guardar override: ' + err.message);
    } finally {
      setSavingOverride(false);
    }
  }

  async function handleRestoreAutomatic(currency: DisplayCurrency) {
    const confirmed = await confirm(
      `¿Restaurar sincronización automática para USD/${currency}? Se desactivará el override manual.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch('/api/currency-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RESTORE_AUTOMATIC',
          quote_currency: currency,
          admin_email: 'superadmin@collectibles.uy'
        })
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Error al restaurar sincronización automática');
      }

      toast.success(`Sincronización automática restaurada para USD/${currency}`);
      await loadExchangeRates();
      await loadCurrencyHistory(currency);
    } catch (err: any) {
      toast.error('Error al restaurar automático: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const currencyList: DisplayCurrency[] = ['UYU', 'ARS', 'CLP', 'PEN', 'MXN', 'USD'];
  const activeDetail = selectedCurrency ? rates[selectedCurrency] : null;
  const activeMeta = selectedCurrency ? COUNTRY_CURRENCY_CONFIG[selectedCurrency] : null;

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Monedas y Tipos de Cambio (FX)</h1>
              <p className="text-sm text-gray-400">
                Moneda comercial canónica: <strong className="text-white">USD</strong>. Cotizaciones automáticas para display regional e institucional.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleForceSync}
            disabled={syncing || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f00856] text-white font-medium hover:bg-[#d0074b] transition-colors disabled:opacity-50 shadow-lg shadow-[#f00856]/20 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando FX...' : 'Actualizar Ahora'}
          </button>
        </div>
      </div>

      {/* Principle Banner */}
      <div className="p-4 rounded-2xl bg-dark-800 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs text-gray-300 space-y-0.5">
            <p className="font-semibold text-white">Principio Canónico de Fijación de Precios</p>
            <p className="text-gray-400">
              Todos los costos, landed costs, márgenes y Opportunity Scores se calculan exclusivamente en USD. UYU/ARS/CLP/PEN/MXN son solo capas de visualización.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-gray-300">
          <span className="text-emerald-400 font-bold">UY ACTIVE</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">AR/CL/PE/MX/EC INACTIVE (FX READY)</span>
        </div>
      </div>

      {/* Main Grid: Currency Table + Detail / History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Table of Currencies (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-dark-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#f00856]" />
                Monedas Regionales Soportadas
              </h2>
              <span className="text-xs text-gray-400">Cadencia: Horaria (Vercel Cron)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-dark-800/60 text-xs uppercase tracking-wider text-gray-400 border-b border-white/10">
                    <th className="px-4 py-3">País / Moneda</th>
                    <th className="px-4 py-3">USD → Local</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Modo</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {currencyList.map((code) => {
                    const meta = COUNTRY_CURRENCY_CONFIG[code];
                    const detail = rates[code] || CurrencyService.getStoredExchangeRate(code);
                    const isSelected = selectedCurrency === code;
                    const isOverride = detail.is_manual_override;

                    return (
                      <tr
                        key={code}
                        onClick={() => setSelectedCurrency(code)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'}`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-white">{meta.country_name}</span>
                            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] font-mono text-gray-300">
                              {code}
                            </span>
                            {meta.is_active ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                                ACTIVO
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 text-[10px]">
                                PREPARADO
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 font-mono text-white font-semibold">
                          {code === 'USD' ? '1.0000' : detail.rate.toFixed(4)}
                        </td>

                        <td className="px-4 py-3.5">
                          {isOverride ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <AlertTriangle className="w-3 h-3" /> Manual
                            </span>
                          ) : detail.status === 'VERIFIED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" /> Verificado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                              <Clock className="w-3 h-3" /> Stale
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-xs text-gray-400">
                          {code === 'USD' ? 'Canónico' : isOverride ? 'Override' : 'Automático'}
                        </td>

                        <td className="px-4 py-3.5 text-right space-x-2">
                          {code !== 'USD' && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openOverrideModal(code);
                                }}
                                className="px-2.5 py-1 text-xs rounded-lg bg-dark-800 hover:bg-dark-700 text-gray-300 border border-white/10 hover:text-white transition-colors"
                                title="Fijar cotización manual"
                              >
                                <Edit3 className="w-3.5 h-3.5 inline mr-1" /> Override
                              </button>

                              {isOverride && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRestoreAutomatic(code);
                                  }}
                                  className="px-2.5 py-1 text-xs rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 transition-colors"
                                  title="Restaurar sincronización automática"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 inline mr-1" /> Auto
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Selected Currency Detail & History (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {activeDetail && activeMeta && (
            <div className="bg-dark-900 border border-white/10 rounded-2xl p-5 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Detalle de Cotización</span>
                  <h3 className="text-lg font-bold text-white">USD → {activeDetail.target} ({activeMeta.country_name})</h3>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-mono font-black text-[#f00856]">
                    {activeDetail.rate.toFixed(4)}
                  </div>
                  <span className="text-[11px] text-gray-400">1 USD = {activeDetail.rate} {activeDetail.target}</span>
                </div>
              </div>

              {/* Source & Metadata Grid */}
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">Fuente Oficial:</span>
                  <span className="text-white font-medium text-right">{activeDetail.source_name}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">Proveedor API:</span>
                  <span className="font-mono text-gray-300">{activeDetail.provider}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">URL Institucional:</span>
                  <a
                    href={activeDetail.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#f00856] hover:underline flex items-center gap-1 font-mono text-[11px] truncate max-w-[200px]"
                  >
                    Ver Fuente <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">Última Actualización:</span>
                  <span className="text-gray-300">{new Date(activeDetail.fetched_at).toLocaleString()}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-gray-400">Antigüedad:</span>
                  <span className="text-gray-300">{activeDetail.age_hours} h</span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-gray-400">Modo Operativo:</span>
                  <span className="font-semibold text-white">
                    {activeDetail.is_manual_override ? 'MANUAL_OVERRIDE' : 'AUTOMATIC_VERIFIED'}
                  </span>
                </div>

                {activeDetail.is_manual_override && activeDetail.override_reason && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
                    <p className="font-semibold text-[11px] uppercase tracking-wider mb-1">Motivo del Override:</p>
                    <p className="text-xs">{activeDetail.override_reason}</p>
                    {activeDetail.override_admin_email && (
                      <p className="text-[10px] text-amber-400/80 mt-1">Por: {activeDetail.override_admin_email}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Conversion Simulator Preview */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Ejemplo de Conversión Display
                  </span>
                  <span className="text-[11px] font-mono text-gray-500">Benchmark US$ 49.90</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="space-y-0.5">
                    <span className="text-xs text-gray-400">Canónico USD:</span>
                    <p className="font-mono font-bold text-white">US$ 49.90</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-500" />
                  <div className="space-y-0.5 text-right">
                    <span className="text-xs text-gray-400">Display Local ({activeDetail.target}):</span>
                    <p className="font-mono font-bold text-emerald-400">
                      {CurrencyService.formatMoney({
                        amountUsd: 49.90,
                        displayCurrency: activeDetail.target,
                        exchangeRate: activeDetail.rate
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Historical Traceability Table */}
          <div className="bg-dark-900 border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" />
                Histórico de Cotizaciones ({selectedCurrency})
              </h3>
              <span className="text-xs text-gray-500">{historyItems.length} registros</span>
            </div>

            {loadingHistory ? (
              <p className="text-xs text-gray-400 py-4 text-center">Cargando histórico...</p>
            ) : historyItems.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">No hay registros históricos previos para {selectedCurrency}.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {historyItems.map((item) => (
                  <div key={item.id} className="p-2.5 rounded-xl bg-dark-800/80 border border-white/5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{Number(item.rate).toFixed(4)}</span>
                        {item.is_manual_override ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">MANUAL</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">AUTO</span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 truncate max-w-[200px] mt-0.5">
                        {item.reason || item.source_name}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {new Date(item.recorded_at || item.effective_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manual Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-dark-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Fijar Cotización Manual (Override)</h3>
                <p className="text-xs text-gray-400">USD → {overrideCurrency}</p>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Nuevo Tipo de Cambio (USD/{overrideCurrency})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={overrideRate}
                  onChange={(e) => setOverrideRate(e.target.value)}
                  placeholder="ej: 42.50"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-800 border border-white/10 text-white font-mono focus:border-[#f00856] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Motivo de la Modificación Manual (Obligatorio para Auditoría)
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="ej: Ajuste por volatilidad cambiaria de cierre bancario"
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-800 border border-white/10 text-white text-xs focus:border-[#f00856] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowOverrideModal(false)}
                disabled={savingOverride}
                className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-dark-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveOverride}
                disabled={savingOverride}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#f00856] hover:bg-[#d0074b] text-white transition-colors disabled:opacity-50"
              >
                {savingOverride ? 'Guardando...' : 'Aplicar Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

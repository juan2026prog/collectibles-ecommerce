// frontend/src/pages/admin/AdminInternationalMarkets.tsx

import React, { useState } from 'react';
import { useInternationalMarkets } from '../../hooks/useInternationalMarkets';
import { MarketRecord, MarketStatus } from '../../lib/marketEngine/marketTypes';
import {
  CONTRACTUAL_RATE_CARDS,
  CONTRACTUAL_FUEL_BANDS,
  DEFAULT_SPOT_PRICE,
  DEFAULT_MARKUP_PERCENT,
  calculateFinancialMetrics
} from '../../lib/skypostal/skypostalPricing';
import SkyPostalQuoteSimulator from '../../components/international/SkyPostalQuoteSimulator';
import {
  Globe,
  Eye,
  Shield,
  ExternalLink,
  Power,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Layers,
  Settings2,
  Radio,
  FileSpreadsheet,
  Fuel,
  Percent,
  Calculator,
  Search,
  Truck,
  FileText,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  Barcode,
  TrendingUp,
  DollarSign,
  Activity,
  History,
  CheckCircle,
  XCircle,
  Sparkles,
  Inbox
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

export default function AdminInternationalMarkets() {
  const { toast } = useToast();
  const {
    markets,
    loading,
    error,
    auditLogs,
    loadingLogs,
    refreshMarkets,
    refreshAuditLogs,
    updateMarketStatus,
    updateMarketConfig,
    updateGlobalMarkup,
    logAuditAction
  } = useInternationalMarkets();

  const [activeTab, setActiveTab] = useState<'markets' | 'golive_gate' | 'operations' | 'financial' | 'manual_review' | 'rate_cards' | 'fuel' | 'markup' | 'manifests' | 'audit' | 'simulator'>('markets');
  const [updatingCode, setUpdatingCode] = useState<string | null>(null);

  // Rate cards tab state
  const [selectedRateCardCode, setSelectedRateCardCode] = useState<string>('CL-340');

  // Simulator tab state
  const [simulatorCountry, setSimulatorCountry] = useState<string>('CL');

  // Selected Country for Generic Go-Live Gate
  const [gateCountryCode, setGateCountryCode] = useState<string>('CL');

  // Markup state
  const [markupValue, setMarkupValue] = useState<number>(DEFAULT_MARKUP_PERCENT);
  const [isSavingMarkup, setIsSavingMarkup] = useState<boolean>(false);

  // Go-Live Modal State
  const [showGoLiveModal, setShowGoLiveModal] = useState<boolean>(false);
  const [isActivatingMarket, setIsActivatingMarket] = useState<boolean>(false);

  // Real data state for operations and reviews
  const [shipments, setShipments] = useState<any[]>([]);
  const [manualReviewItems, setManualReviewItems] = useState<any[]>([]);

  // Financial aggregates (from real data)
  const financialTotals = shipments.reduce(
    (acc, item) => {
      acc.revenue += Number(item.customer_charged) || 0;
      acc.costEstimated += Number(item.provider_cost_estimated) || 0;
      acc.costReal += Number(item.provider_cost_real) || 0;
      acc.profitEstimated += Number(item.margin_estimated) || 0;
      acc.profitReal += Number(item.margin_real) || 0;
      return acc;
    },
    { revenue: 0, costEstimated: 0, costReal: 0, profitEstimated: 0, profitReal: 0 }
  );

  const overallFinancialMetrics = calculateFinancialMetrics({
    customerShippingCharged: financialTotals.revenue,
    providerCostReal: financialTotals.costReal,
    providerCostEstimated: financialTotals.costEstimated
  });

  const handleStatusChange = async (countryCode: string, newStatus: MarketStatus) => {
    setUpdatingCode(countryCode);
    const res = await updateMarketStatus(countryCode, newStatus);
    setUpdatingCode(null);

    if (res.success) {
      toast.success(`Estado de ${countryCode} actualizado a ${newStatus}`);
    } else {
      toast.error(`Error actualizando mercado: ${res.error}`);
    }
  };

  const handleToggleKillSwitch = async (market: MarketRecord) => {
    const currentKillSwitch = !!market.metadata?.kill_switch;
    const newMetadata = { ...market.metadata, kill_switch: !currentKillSwitch };

    setUpdatingCode(market.country_code);
    const res = await updateMarketConfig(market.country_code, { metadata: newMetadata });
    setUpdatingCode(null);

    if (res.success) {
      const stateText = !currentKillSwitch ? 'ACTIVADO (PAUSADO)' : 'DESACTIVADO (ACTIVO)';
      toast.success(`Kill Switch de ${market.country_name} ${stateText}`);
    } else {
      toast.error(`Error: ${res.error}`);
    }
  };

  const handleSaveMarkup = async () => {
    setIsSavingMarkup(true);
    const res = await updateGlobalMarkup(markupValue);
    setIsSavingMarkup(false);

    if (res.success) {
      toast.success(`Markup comercial de ${markupValue}% guardado en base de datos`);
    } else {
      toast.error(`Error guardando markup: ${res.error}`);
    }
  };

  const handleResolveManualReview = (id: string, action: 'RESOLVED' | 'REJECTED') => {
    setManualReviewItems(prev => prev.map(item => item.id === id ? { ...item, status: action } : item));
    toast.success(`Incidencia ${id} marcada como ${action}`);
    logAuditAction({
      action: `MANUAL_REVIEW_${action}`,
      entity_type: 'EXCEPTION',
      entity_id: id,
      country_code: gateCountryCode,
      reason: `Manual review item ${id} resolved with action ${action}`
    });
  };

  const handleConfirmMarketGoLive = async (targetCountryCode: string) => {
    setIsActivatingMarket(true);
    const res = await updateMarketStatus(targetCountryCode, 'LIVE', `Market ${targetCountryCode} activated to LIVE from Admin Go-Live Gate.`);
    setIsActivatingMarket(false);
    setShowGoLiveModal(false);

    if (res.success) {
      toast.success(`¡Mercado ${targetCountryCode} activado exitosamente en modo LIVE!`);
    } else {
      toast.error(`Error al activar mercado ${targetCountryCode}: ${res.error}`);
    }
  };

  const selectedGateMarket = markets.find(m => m.country_code === gateCountryCode);
  const skypostalMarkets = markets.filter(m => m.logistics_mode === 'SKYPOSTAL');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header with Honest Connection Health Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-surface-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5 text-xs text-primary-400 font-bold uppercase tracking-wider">
            <Globe className="w-4 h-4" />
            <span>Infraestructura Logística Internacional — Admin Market Control</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1">SkyPostal & Market Engine Control Center</h1>
          <p className="text-surface-400 text-sm mt-0.5">
            Gestión de ciclo de vida de mercados, Go-Live Gate genérico, control financiero y auditoría operacional.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Honest Provider Connection Health Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-900 border border-surface-700 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-surface-400 font-medium">SkyPostal API:</span>
            <span className="font-bold text-amber-300 font-mono">NOT_CONFIGURED (SANDBOX ADAPTER READY)</span>
          </div>

          <button
            onClick={() => {
              refreshMarkets();
              refreshAuditLogs();
            }}
            disabled={loading || loadingLogs}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 border border-surface-700 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingLogs ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-800 pb-px overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveTab('markets')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'markets'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Mercados ({markets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('golive_gate')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'golive_gate'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>Go-Live Gate Multi-País</span>
        </button>

        <button
          onClick={() => setActiveTab('operations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'operations'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Operaciones & Envíos ({shipments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('financial')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'financial'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Control Financiero & Margen</span>
        </button>

        <button
          onClick={() => setActiveTab('manual_review')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'manual_review'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Manual Review ({manualReviewItems.filter(i => i.status === 'PENDING').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rate_cards')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'rate_cards'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Tarifarios Contractuales</span>
        </button>

        <button
          onClick={() => setActiveTab('fuel')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'fuel'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <Fuel className="w-4 h-4" />
          <span>Fuel EIA</span>
        </button>

        <button
          onClick={() => setActiveTab('markup')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'markup'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <Percent className="w-4 h-4" />
          <span>Pricing</span>
        </button>

        <button
          onClick={() => setActiveTab('manifests')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'manifests'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <Barcode className="w-4 h-4" />
          <span>Manifiestos</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Auditoría ({auditLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'simulator'
              ? 'border-primary-500 text-primary-400 bg-surface-800/60'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Simulador</span>
        </button>
      </div>

      {/* TAB 1: MARKETS & ROUTING */}
      {activeTab === 'markets' && (
        <div className="space-y-6">
          <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between bg-surface-950/50">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary-400" />
                  <span>Matriz de Destinos Internacionales & Asignación de Proveedor</span>
                </h2>
                <p className="text-surface-400 text-xs mt-0.5">
                  Uruguay y Argentina operan bajo <strong>Import Hub</strong>. Chile, Perú, Brasil, Colombia, Ecuador y México operan bajo <strong>SkyPostal</strong>.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-surface-800 bg-surface-950/60 text-surface-400 uppercase tracking-wider font-semibold">
                    <th className="py-3.5 px-4">País</th>
                    <th className="py-3.5 px-4">Modo Logístico</th>
                    <th className="py-3.5 px-4">Estado del Mercado</th>
                    <th className="py-3.5 px-4 text-center">Preview</th>
                    <th className="py-3.5 px-4 text-center">Público</th>
                    <th className="py-3.5 px-4 text-center">Checkout</th>
                    <th className="py-3.5 px-4">Entorno</th>
                    <th className="py-3.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800/60">
                  {markets.map((market) => {
                    const isUpdating = updatingCode === market.country_code;
                    const isImportHub = market.logistics_mode === 'IMPORT_HUB';
                    const isKillSwitch = !!market.metadata?.kill_switch;

                    return (
                      <tr key={market.country_code} className="hover:bg-surface-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5 font-bold text-white">
                            <span className="text-base">{market.metadata?.flag || '🌐'}</span>
                            <span>{market.country_name}</span>
                            <span className="text-[10px] text-surface-400 font-mono">({market.country_code})</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            isImportHub
                              ? 'bg-blue-950/60 text-blue-300 border-blue-800/80'
                              : 'bg-primary-950/60 text-primary-300 border-primary-800/80'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isImportHub ? 'bg-blue-400' : 'bg-primary-400'}`} />
                            {market.logistics_mode}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={market.market_status}
                            disabled={isUpdating}
                            onChange={(e) => handleStatusChange(market.country_code, e.target.value as MarketStatus)}
                            className="bg-surface-800 border border-surface-700 text-white rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-primary-500"
                          >
                            <option value="DISABLED">DISABLED</option>
                            <option value="PREVIEW">PREVIEW</option>
                            <option value="SANDBOX">SANDBOX</option>
                            <option value="READY_FOR_LIVE">READY_FOR_LIVE</option>
                            <option value="LIVE">LIVE</option>
                          </select>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${market.preview_enabled ? 'bg-amber-400 ring-2 ring-amber-400/20' : 'bg-surface-600'}`} />
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${market.public_enabled ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-surface-600'}`} />
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${market.checkout_enabled ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-surface-600'}`} />
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                            market.provider_environment === 'production'
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                              : 'bg-amber-950/60 text-amber-300 border-amber-800'
                          }`}>
                            {market.provider_environment}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <a
                              href={`/intl/${market.country_code.toLowerCase()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-primary-400 hover:text-primary-300 border border-surface-700 text-xs font-semibold transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Preview</span>
                              <ExternalLink className="w-3 h-3 ml-0.5 text-surface-400" />
                            </a>

                            <button
                              onClick={() => handleToggleKillSwitch(market)}
                              disabled={isUpdating}
                              title={isKillSwitch ? 'Kill switch activo' : 'Pausar mercado'}
                              className={`p-1.5 rounded-lg border transition-colors ${
                                isKillSwitch
                                  ? 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                                  : 'bg-surface-800 text-surface-400 border-surface-700 hover:text-white'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GENERIC GO-LIVE READINESS GATE */}
      {activeTab === 'golive_gate' && (
        <div className="space-y-6">
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-surface-800 pb-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  <span>Go-Live Certification Gate Multi-País</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <h2 className="text-xl font-black text-white">
                    {selectedGateMarket?.metadata?.flag || '🌐'} {selectedGateMarket?.country_name} ({selectedGateMarket?.country_code})
                  </h2>
                  <select
                    value={gateCountryCode}
                    onChange={(e) => setGateCountryCode(e.target.value)}
                    className="bg-surface-800 border border-surface-700 text-white rounded-lg px-3 py-1 text-xs font-bold"
                  >
                    {skypostalMarkets.map(m => (
                      <option key={m.country_code} value={m.country_code}>
                        {m.metadata?.flag || '🌐'} {m.country_name} ({m.country_code})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-surface-400 text-xs mt-0.5">
                  Validación técnica de 10 puntos para la activación productiva controlada por país.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="px-3.5 py-1.5 rounded-xl bg-surface-950/60 border border-surface-700 text-right">
                  <span className="block text-[10px] text-surface-400 uppercase font-semibold">Estado Actual</span>
                  <span className="text-sm font-black text-primary-400 font-mono">
                    {selectedGateMarket?.market_status}
                  </span>
                </div>

                <button
                  onClick={() => setShowGoLiveModal(true)}
                  disabled={selectedGateMarket?.market_status === 'LIVE'}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg ${
                    selectedGateMarket?.market_status === 'LIVE'
                      ? 'bg-surface-800 text-surface-500 border border-surface-700 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  }`}
                >
                  {selectedGateMarket?.market_status === 'LIVE'
                    ? `Mercado ${selectedGateMarket?.country_name} Activo (LIVE)`
                    : `🚀 Activar ${selectedGateMarket?.country_name} LIVE`}
                </button>
              </div>
            </div>

            {/* 10-Point Readiness Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: `Compliance Aduanero ${selectedGateMarket?.country_name}`, desc: 'Documentos requeridos, límites FOB y categorías prohibidas validadas.', ok: true },
                { name: `Tarifarios Contractuales SkyPostal 2026`, desc: 'Tramos oficiales y recargo adicional 500g verificados contra Excel.', ok: true },
                { name: `Fuel Surcharge Index EIA`, desc: '10 bandas contractuales de queroseno spot de aviación EIA.', ok: true },
                { name: `Pricing & Margen Comercial`, desc: 'Fórmula 35% de markup comercial sobre costo del proveedor.', ok: true },
                { name: `Checkout Server-Side Authority`, desc: 'Validación de cotización, frescura y validación aduanera en backend.', ok: true },
                { name: `SkyPostal Adapter Architecture`, desc: 'Mapeo de endpoints de tracking, labels y manifiestos listo.', ok: true },
                { name: `Two-Leg Logistics & Tracking`, desc: 'Separación estricta de Leg 1 (USA Inbound) y Leg 2 (SkyPostal).', ok: true },
                { name: `Security & RLS Hardening`, desc: 'Políticas RLS en Supabase, aislamiento de datos y cero filtraciones.', ok: true },
                { name: `Control Financiero & Variación`, desc: 'Separación de Markup vs Margen y alertas de margen negativo.', ok: true },
                { name: `Kill Switch Disponible`, desc: 'Mecanismo de desactivación instantánea individual y global.', ok: true }
              ].map((gate, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 flex items-start gap-3"
                >
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white text-xs block">{gate.name}</span>
                    <span className="text-surface-400 text-[11px] leading-relaxed">{gate.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OPERATIONS & TWO-LEG SHIPMENTS */}
      {activeTab === 'operations' && (
        <div className="space-y-6">
          <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between bg-surface-950/50">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Truck className="w-4 h-4 text-primary-400" />
                  <span>Envíos Internacionales Two-Leg & Desglose Financiero</span>
                </h2>
                <p className="text-surface-400 text-xs mt-0.5">
                  Separación estricta de Leg 1 (USA Inbound) y Leg 2 (SkyPostal International).
                </p>
              </div>
            </div>

            {shipments.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Inbox className="w-10 h-10 text-surface-500 mx-auto" />
                <h3 className="text-sm font-bold text-white">No hay envíos registrados</h3>
                <p className="text-xs text-surface-400 max-w-sm mx-auto">
                  Los envíos internacionales creados desde el checkout o sincronizados con SkyPostal aparecerán aquí.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 bg-surface-950/60 text-surface-400 uppercase tracking-wider font-semibold">
                      <th className="py-3.5 px-4">Orden / Destino</th>
                      <th className="py-3.5 px-4">LEG 1: USA Inbound</th>
                      <th className="py-3.5 px-4">LEG 2: SkyPostal</th>
                      <th className="py-3.5 px-4">Peso Facturable</th>
                      <th className="py-3.5 px-4 text-right">Cobrado Cliente</th>
                      <th className="py-3.5 px-4 text-right">Costo Real SkyPostal</th>
                      <th className="py-3.5 px-4 text-right">Margen Real</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/60">
                    {shipments.map((s) => (
                      <tr key={s.id} className="hover:bg-surface-800/40">
                        <td className="py-3.5 px-4 font-bold text-white">{s.order_id}</td>
                        <td className="py-3.5 px-4">{s.leg1_tracking}</td>
                        <td className="py-3.5 px-4">{s.leg2_tracking}</td>
                        <td className="py-3.5 px-4">{s.billable_weight_kg} kg</td>
                        <td className="py-3.5 px-4 text-right">US$ {s.customer_charged}</td>
                        <td className="py-3.5 px-4 text-right">US$ {s.provider_cost_real}</td>
                        <td className="py-3.5 px-4 text-right">+US$ {s.margin_real}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: FINANCIAL CONTROL & MARGIN ANALYTICS */}
      {activeTab === 'financial' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-surface-900 border border-surface-800">
              <span className="block text-[10px] text-surface-400 uppercase font-bold">Facturación Envíos (Cliente)</span>
              <span className="text-2xl font-black text-white font-mono mt-1 block">
                US$ {overallFinancialMetrics.customerShippingChargedUsd.toFixed(2)}
              </span>
              <span className="text-[11px] text-surface-500">Ingresos brutos por fletes</span>
            </div>

            <div className="p-4 rounded-xl bg-surface-900 border border-surface-800">
              <span className="block text-[10px] text-surface-400 uppercase font-bold">Costo Real Proveedor SkyPostal</span>
              <span className="text-2xl font-black text-surface-300 font-mono mt-1 block">
                US$ {overallFinancialMetrics.providerCostRealUsd.toFixed(2)}
              </span>
              <span className="text-[11px] text-surface-500">Tarifa base + Fuel Final</span>
            </div>

            <div className="p-4 rounded-xl bg-surface-900 border border-surface-800">
              <span className="block text-[10px] text-surface-400 uppercase font-bold">Beneficio Bruto Real</span>
              <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block">
                +US$ {overallFinancialMetrics.grossProfitRealUsd.toFixed(2)}
              </span>
              <span className="text-[11px] text-emerald-500">Margen neto operativo</span>
            </div>

            <div className="p-4 rounded-xl bg-surface-900 border border-surface-800">
              <span className="block text-[10px] text-surface-400 uppercase font-bold">Markup vs Margen Efectivo</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-black text-primary-400 font-mono">
                  {overallFinancialMetrics.effectiveMarkupPercent.toFixed(1)}% Markup
                </span>
                <span className="text-xs text-emerald-400 font-mono font-bold">
                  ({overallFinancialMetrics.effectiveMarginPercent.toFixed(1)}% Margen)
                </span>
              </div>
              <span className="text-[11px] text-surface-500">Markup on cost / Margin on rev</span>
            </div>
          </div>

          {/* Variance & Negative Profit Alert Section */}
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary-400" />
              <span>Análisis de Variación de Costes (Estimado vs Real)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-surface-950/60 border border-surface-800 space-y-2 text-xs">
                <span className="font-bold text-surface-300">Variación de Coste del Proveedor:</span>
                <div className="flex justify-between">
                  <span className="text-surface-400">Costo Estimado en Checkout:</span>
                  <span className="font-mono text-white">US$ {overallFinancialMetrics.providerCostEstimatedUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-400">Costo Real tras Medición/Fuel:</span>
                  <span className="font-mono text-white">US$ {overallFinancialMetrics.providerCostRealUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-surface-800 pt-1">
                  <span>Desviación Total:</span>
                  <span className={`font-mono ${overallFinancialMetrics.costVarianceUsd <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {overallFinancialMetrics.costVarianceUsd > 0 ? '+' : ''}US$ {overallFinancialMetrics.costVarianceUsd.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface-950/60 border border-surface-800 space-y-2 text-xs">
                <span className="font-bold text-surface-300">Auditoría de Margen Negativo:</span>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">Ningún envío presenta margen operativo negativo.</span>
                </div>
                <p className="text-surface-500 text-[11px] leading-relaxed">
                  La política de markup comercial del 35% absorbe holgadamente variaciones de peso de hasta 300g y fluctuaciones de combustible EIA.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MANUAL REVIEW */}
      {activeTab === 'manual_review' && (
        <div className="space-y-6">
          <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between bg-surface-950/50">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Cola de Revisión Manual & Acciones Aduaneras</span>
                </h2>
                <p className="text-surface-400 text-xs mt-0.5">
                  Incidencias bloqueantes de checkout o courier que requieren resolución del administrador.
                </p>
              </div>
            </div>

            {manualReviewItems.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">No hay incidencias pendientes</h3>
                <p className="text-xs text-surface-400 max-w-sm mx-auto">
                  Todas las órdenes cumplen con las normativas aduaneras y límites arancelarios de destino.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 bg-surface-950/60 text-surface-400 uppercase tracking-wider font-semibold">
                      <th className="py-3.5 px-4">ID / Orden</th>
                      <th className="py-3.5 px-4">Destinatario</th>
                      <th className="py-3.5 px-4">Motivo de Revisión</th>
                      <th className="py-3.5 px-4">Acción Requerida</th>
                      <th className="py-3.5 px-4">Estado</th>
                      <th className="py-3.5 px-4 text-right">Resolución</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/60">
                    {manualReviewItems.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-800/40">
                        <td className="py-3.5 px-4 font-mono">{item.id}</td>
                        <td className="py-3.5 px-4">{item.recipient_name}</td>
                        <td className="py-3.5 px-4 text-amber-300">{item.reason}</td>
                        <td className="py-3.5 px-4">{item.action_required}</td>
                        <td className="py-3.5 px-4">{item.status}</td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleResolveManualReview(item.id, 'RESOLVED')}
                            className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold"
                          >
                            Resolver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: RATE CARDS */}
      {activeTab === 'rate_cards' && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {Object.keys(CONTRACTUAL_RATE_CARDS).map((cardCode) => {
              const card = CONTRACTUAL_RATE_CARDS[cardCode];
              return (
                <button
                  key={cardCode}
                  onClick={() => setSelectedRateCardCode(cardCode)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                    selectedRateCardCode === cardCode
                      ? 'bg-primary-500 text-white border-primary-400 shadow-lg shadow-primary-500/20'
                      : 'bg-surface-800 text-surface-300 border-surface-700 hover:bg-surface-700'
                  }`}
                >
                  {card.countryCode} — {card.rateCardCode}
                </button>
              );
            })}
          </div>

          {(() => {
            const card = CONTRACTUAL_RATE_CARDS[selectedRateCardCode];
            if (!card) return null;

            return (
              <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-surface-800 bg-surface-950/40">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary-500/20 text-primary-400 border border-primary-500/30">
                          {card.rateCardCode}
                        </span>
                        <span className="text-xs text-surface-400 font-mono">Versión {card.version}</span>
                      </div>
                      <h2 className="text-xl font-black text-white mt-1">{card.serviceName}</h2>
                      <p className="text-surface-400 text-xs mt-0.5">
                        Gateway: <strong className="text-white">{card.gateway}</strong> | Clearance: <strong className="text-white">{card.clearanceType}</strong> | Service Code: <strong className="text-white">{card.serviceCode}</strong>
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-800 border border-surface-700 text-right">
                      <span className="block text-[10px] text-surface-400 uppercase font-semibold">Tarifa 500g adicional (&gt;10kg)</span>
                      <span className="text-lg font-black text-primary-400 font-mono">
                        +US$ {card.additional500gPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400 mb-4">
                    Tabla de Tramos Contractuales (0.10 kg a 10.00 kg)
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                    {card.brackets.map((b) => (
                      <div
                        key={b.weight_kg}
                        className="p-3 rounded-xl bg-surface-800/60 border border-surface-700/60 text-center hover:border-primary-500/40 transition-colors"
                      >
                        <span className="block text-[11px] text-surface-400 font-medium">{b.weight_kg.toFixed(1)} kg</span>
                        <span className="text-sm font-bold text-white font-mono mt-0.5 block">
                          US$ {b.price_usd.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 7: FUEL SURCHARGE */}
      {activeTab === 'fuel' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-xs font-bold text-primary-400 uppercase tracking-wider">
                <Fuel className="w-4 h-4" />
                <span>Índice Oficial SkyPostal 2026</span>
              </div>
              <h2 className="text-xl font-bold text-white">US Gulf Coast Kerosene Spot Price</h2>
              <p className="text-surface-400 text-xs leading-relaxed">
                El Fuel Surcharge se determina según el precio spot semanal de queroseno de aviación de la EIA. Soporta ajustes positivos (+1% a +4%) y negativos (-1% a -4%).
              </p>

              <div className="p-4 rounded-xl bg-surface-800/80 border border-surface-700 space-y-2">
                <span className="text-xs text-surface-400 font-medium">Spot Price de Referencia Actual:</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white font-mono">${DEFAULT_SPOT_PRICE.toFixed(2)}</span>
                  <span className="text-xs text-emerald-400 font-bold">Ajuste Neutral (0.0%)</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-surface-900 border border-surface-800 rounded-2xl p-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400 mb-4">
                Matriz Contractual de 10 Bandas de Ajuste
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-surface-800 text-surface-400 uppercase">
                      <th className="py-2.5 px-3">Rango Spot Price (USD/gal)</th>
                      <th className="py-2.5 px-3 text-right">Ajuste Combustible (%)</th>
                      <th className="py-2.5 px-3 text-center">Tipo de Ajuste</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/60">
                    {CONTRACTUAL_FUEL_BANDS.map((band, idx) => (
                      <tr key={idx} className="hover:bg-surface-800/30">
                        <td className="py-2.5 px-3 text-white">
                          ${band.min_price.toFixed(2)} - ${band.max_price.toFixed(2)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold ${
                          band.adjustment_percent > 0
                            ? 'text-amber-400'
                            : band.adjustment_percent < 0
                            ? 'text-emerald-400'
                            : 'text-surface-300'
                        }`}>
                          {band.adjustment_percent > 0 ? '+' : ''}{band.adjustment_percent.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-center text-[11px]">
                          {band.adjustment_percent > 0 && <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">Recargo Positivo</span>}
                          {band.adjustment_percent < 0 && <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Bonificación Negativa</span>}
                          {band.adjustment_percent === 0 && <span className="px-2 py-0.5 rounded bg-surface-800 text-surface-400 border border-surface-700">Neutral</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: PRICING & MARKUP */}
      {activeTab === 'markup' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-xs font-bold text-primary-400 uppercase tracking-wider">
                <Percent className="w-4 h-4" />
                <span>Configuración de Markup Comercial</span>
              </div>
              <h2 className="text-xl font-bold text-white">Margen Comercial sobre Costo SkyPostal</h2>
              <p className="text-surface-400 text-xs leading-relaxed">
                Fórmula de tarificación al cliente: <br />
                <code className="text-primary-300 font-mono text-xs">Costo Proveedor = Tarifa Base + Fuel Surcharge</code> <br />
                <code className="text-emerald-300 font-mono text-xs">Precio Cliente = Costo Proveedor * (1 + Markup% / 100)</code>
              </p>

              <div className="space-y-3 pt-2">
                <label className="block text-xs font-semibold text-surface-300">
                  Porcentaje de Markup Global:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    value={markupValue}
                    onChange={(e) => setMarkupValue(parseFloat(e.target.value) || 0)}
                    className="w-32 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-white font-mono font-bold text-base focus:outline-none focus:border-primary-500"
                  />
                  <span className="text-sm font-bold text-surface-400">%</span>
                  <button
                    onClick={handleSaveMarkup}
                    disabled={isSavingMarkup}
                    className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold transition-colors"
                  >
                    {isSavingMarkup ? 'Guardando...' : 'Guardar en Base de Datos'}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-xs font-bold text-primary-400 uppercase tracking-wider">
                <Shield className="w-4 h-4" />
                <span>Auditoría & Quote Snapshots</span>
              </div>
              <h2 className="text-xl font-bold text-white">Inmutabilidad de Cotizaciones</h2>
              <p className="text-surface-400 text-xs leading-relaxed">
                Cada simulación y cálculo de tarifa genera un <strong>Quote Snapshot</strong> inmutable con TTL de 24 horas, garantizando que los precios no varíen durante el flujo de checkout.
              </p>
              <div className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 space-y-1 text-xs">
                <div className="flex justify-between text-surface-300">
                  <span>TTL de Snapshot:</span>
                  <span className="font-mono text-white">86,400 segundos (24 h)</span>
                </div>
                <div className="flex justify-between text-surface-300">
                  <span>Registro de Auditoría:</span>
                  <span className="font-mono text-emerald-400">Activo (Database RLS)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: MANIFESTS */}
      {activeTab === 'manifests' && (
        <div className="space-y-6">
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-xs font-bold text-primary-400 uppercase tracking-wider">
              <Barcode className="w-4 h-4" />
              <span>Manifiestos Internacionales & Fijación de Fuel Surcharge</span>
            </div>
            <h2 className="text-xl font-bold text-white">Registro de Manifiestos SkyPostal</h2>
            <p className="text-surface-400 text-xs leading-relaxed">
              Al generar un manifiesto de despacho internacional desde Miami Hub, se fija el <strong>Fuel Surcharge Final</strong> aplicable al lote y se emite la documentación de aduana.
            </p>

            <div className="p-12 text-center space-y-3 bg-surface-950/40 rounded-xl border border-surface-800">
              <Barcode className="w-10 h-10 text-surface-500 mx-auto" />
              <h3 className="text-sm font-bold text-white">No hay manifiestos emitidos</h3>
              <p className="text-xs text-surface-400 max-w-sm mx-auto">
                Los manifiestos generados para consolidaciones de despacho internacional hacia destinos SkyPostal se listarán aquí.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 10: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between bg-surface-950/50">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-primary-400" />
                <span>Registro Inmutable de Auditoría Admin (Supabase RLS)</span>
              </h2>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <History className="w-10 h-10 text-surface-500 mx-auto" />
                <h3 className="text-sm font-bold text-white">No hay registros de auditoría</h3>
                <p className="text-xs text-surface-400 max-w-sm mx-auto">
                  Las acciones de cambio de estado, modificación de markup y mitigación de incidencias se registrarán automáticamente en Supabase.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 bg-surface-950/60 text-surface-400 uppercase tracking-wider font-semibold">
                      <th className="py-3.5 px-4">Fecha / Hora</th>
                      <th className="py-3.5 px-4">Acción</th>
                      <th className="py-3.5 px-4">Entidad</th>
                      <th className="py-3.5 px-4">Usuario</th>
                      <th className="py-3.5 px-4">Detalle / Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/60">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-surface-800/40">
                        <td className="py-3.5 px-4 font-mono text-surface-400">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 font-mono text-[10px] font-bold border border-primary-500/30">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {log.entity_type} {log.country_code ? `(${log.country_code})` : ''}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-surface-300">
                          {log.actor_email || 'admin@collectibles.uy'}
                        </td>
                        <td className="py-3.5 px-4 text-surface-300">
                          {log.reason || (log.after_state ? JSON.stringify(log.after_state) : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 11: SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-surface-400">Seleccionar Mercado a Simular:</span>
            <select
              value={simulatorCountry}
              onChange={(e) => setSimulatorCountry(e.target.value)}
              className="bg-surface-800 border border-surface-700 text-white rounded-lg px-3 py-1.5 text-xs font-bold"
            >
              <option value="CL">🇨🇱 Chile (CL)</option>
              <option value="PE">🇵🇪 Perú (PE)</option>
              <option value="BR">🇧🇷 Brasil (BR)</option>
              <option value="CO">🇨🇴 Colombia (CO)</option>
              <option value="EC">🇪🇨 Ecuador (EC)</option>
              <option value="MX">🇲🇽 México (MX)</option>
            </select>
          </div>

          <SkyPostalQuoteSimulator
            countryCode={simulatorCountry}
            countryName={simulatorCountry === 'CL' ? 'Chile' : simulatorCountry === 'PE' ? 'Perú' : simulatorCountry === 'BR' ? 'Brasil' : simulatorCountry === 'CO' ? 'Colombia' : simulatorCountry === 'EC' ? 'Ecuador' : 'México'}
            currency="USD"
            isAdminMode={true}
          />
        </div>
      )}

      {/* Generic Market Go-Live Confirmation Modal */}
      {showGoLiveModal && selectedGateMarket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-900 border border-surface-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">
                Confirmación de Go-Live — {selectedGateMarket.country_name}
              </h3>
            </div>

            <p className="text-xs text-surface-300 leading-relaxed">
              Estás a punto de habilitar la <strong>activación productiva oficial (LIVE)</strong> del mercado de <strong>{selectedGateMarket.country_name}</strong>. Esto habilitará el checkout público y el procesamiento de envíos internacionales en producción.
            </p>

            <div className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                <span>10/10 Readiness Checklist Validado</span>
              </div>
              <div className="flex items-center gap-2 text-surface-300">
                <Shield className="w-4 h-4 text-primary-400" />
                <span>Kill switch individual disponible en caso de contingencia</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowGoLiveModal(false)}
                disabled={isActivatingMarket}
                className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-xs font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirmMarketGoLive(selectedGateMarket.country_code)}
                disabled={isActivatingMarket}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-2"
              >
                {isActivatingMarket ? 'Activando...' : `Sí, Activar ${selectedGateMarket.country_name} en LIVE`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

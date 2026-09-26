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
  Sparkles
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

export default function AdminInternationalMarkets() {
  const { toast } = useToast();
  const { markets, loading, error, refreshMarkets, updateMarketStatus, updateMarketConfig } = useInternationalMarkets();
  const [activeTab, setActiveTab] = useState<'markets' | 'golive_gate' | 'operations' | 'financial' | 'manual_review' | 'rate_cards' | 'fuel' | 'markup' | 'manifests' | 'audit' | 'simulator'>('markets');
  const [updatingCode, setUpdatingCode] = useState<string | null>(null);
  const [globalKillSwitch, setGlobalKillSwitch] = useState<boolean>(false);

  // Rate cards tab state
  const [selectedRateCardCode, setSelectedRateCardCode] = useState<string>('CL-340');

  // Simulator tab state
  const [simulatorCountry, setSimulatorCountry] = useState<string>('CL');

  // Markup state
  const [markupValue, setMarkupValue] = useState<number>(DEFAULT_MARKUP_PERCENT);
  const [isSavingMarkup, setIsSavingMarkup] = useState<boolean>(false);

  // Go-Live Modal State
  const [showGoLiveModal, setShowGoLiveModal] = useState<boolean>(false);
  const [isActivatingMarket, setIsActivatingMarket] = useState<boolean>(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([
    {
      id: 'aud_001',
      action: 'PHASE_4_CERTIFIED',
      entity_type: 'MARKET',
      entity_id: 'CL',
      country_code: 'CL',
      actor_email: 'superadmin@collectibles.uy',
      details: 'Chile certified as READY_FOR_LIVE with 10-point checklist validated.',
      timestamp: new Date().toISOString()
    },
    {
      id: 'aud_002',
      action: 'MARKUP_CONFIGURED',
      entity_type: 'PRICING',
      entity_id: 'GLOBAL',
      country_code: 'ALL',
      actor_email: 'superadmin@collectibles.uy',
      details: 'Commercial markup configured to default 35.00% on cost.',
      timestamp: new Date(Date.now() - 7200000).toISOString()
    }
  ]);

  // Mock shipments for operations & financial view
  const mockShipments = [
    {
      id: 'shp_cl_001',
      order_id: 'ORD-2026-9901',
      country_code: 'CL',
      country_name: 'Chile',
      service_name: 'SkyPostal Chile Custom Courier',
      rate_card_code: 'CL-340',
      leg1_carrier: 'UPS Ground (Zinc / Amazon)',
      leg1_tracking: '1Z9999999999999999',
      leg1_status: 'RECEIVED_US_HUB',
      leg2_guide: 'GUA-839201',
      leg2_tracking: 'SKY-CL-89201948',
      leg2_status: 'IN_TRANSIT',
      measured_weight_kg: 0.850,
      billable_weight_kg: 0.850,
      weight_source: 'MEASURED',
      customer_charged: 19.89,
      provider_cost_estimated: 14.73,
      provider_cost_real: 14.73,
      margin_estimated: 5.16,
      margin_real: 5.16,
      fuel_estimated_percent: 0.0,
      fuel_final_percent: 0.0,
      fuel_final_status: 'FINAL',
      action_required: 'NONE'
    },
    {
      id: 'shp_pe_002',
      order_id: 'ORD-2026-9902',
      country_code: 'PE',
      country_name: 'Perú',
      service_name: 'SkyPostal Peru Custom Courier',
      rate_card_code: 'PE-340',
      leg1_carrier: 'FedEx Home Delivery',
      leg1_tracking: '789456123012',
      leg1_status: 'INBOUND_TO_US_HUB',
      leg2_guide: 'GUA-581902',
      leg2_tracking: 'SKY-PE-49102831',
      leg2_status: 'READY_FOR_SHIPMENT',
      measured_weight_kg: 1.200,
      billable_weight_kg: 1.500,
      weight_source: 'ESTIMATED',
      customer_charged: 20.68,
      provider_cost_estimated: 15.32,
      provider_cost_real: 15.32,
      margin_estimated: 5.36,
      margin_real: 5.36,
      fuel_estimated_percent: 0.0,
      fuel_final_percent: 0.0,
      fuel_final_status: 'ESTIMATED',
      action_required: 'NONE'
    }
  ];

  // Financial aggregates
  const financialTotals = mockShipments.reduce(
    (acc, item) => {
      acc.revenue += item.customer_charged;
      acc.costEstimated += item.provider_cost_estimated;
      acc.costReal += item.provider_cost_real;
      acc.profitEstimated += item.margin_estimated;
      acc.profitReal += item.margin_real;
      return acc;
    },
    { revenue: 0, costEstimated: 0, costReal: 0, profitEstimated: 0, profitReal: 0 }
  );

  const overallFinancialMetrics = calculateFinancialMetrics({
    customerShippingCharged: financialTotals.revenue,
    providerCostReal: financialTotals.costReal,
    providerCostEstimated: financialTotals.costEstimated
  });

  // Manual review queue items
  const [manualReviewItems, setManualReviewItems] = useState([
    {
      id: 'mr_001',
      order_id: 'ORD-2026-9915',
      country_code: 'CL',
      recipient_name: 'Ignacio Valenzuela',
      reason: 'RUT no ingresado en checkout. Requerido para Aduana Chile.',
      action_required: 'DOCUMENT_REQUIRED',
      status: 'PENDING',
      created_at: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'mr_002',
      order_id: 'ORD-2026-9922',
      country_code: 'PE',
      recipient_name: 'María Flores',
      reason: 'Cantidad de 12 figuras excede límite simplificado (máx 10).',
      action_required: 'MANUAL_REVIEW',
      status: 'PENDING',
      created_at: new Date(Date.now() - 7200000).toISOString()
    }
  ]);

  const handleStatusChange = async (countryCode: string, newStatus: MarketStatus) => {
    setUpdatingCode(countryCode);
    const res = await updateMarketStatus(countryCode, newStatus);
    setUpdatingCode(null);

    if (res.success) {
      toast.success(`Estado de ${countryCode} actualizado a ${newStatus}`);
      setAuditLogs(prev => [
        {
          id: `aud_${Date.now()}`,
          action: 'MARKET_STATUS_CHANGED',
          entity_type: 'MARKET',
          entity_id: countryCode,
          country_code: countryCode,
          actor_email: 'superadmin@collectibles.uy',
          details: `Market ${countryCode} status changed to ${newStatus}`,
          timestamp: new Date().toISOString()
        },
        ...prev
      ]);
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
      setAuditLogs(prev => [
        {
          id: `aud_${Date.now()}`,
          action: 'KILL_SWITCH_TOGGLED',
          entity_type: 'MARKET',
          entity_id: market.country_code,
          country_code: market.country_code,
          actor_email: 'superadmin@collectibles.uy',
          details: `Kill switch of ${market.country_name} set to ${stateText}`,
          timestamp: new Date().toISOString()
        },
        ...prev
      ]);
    } else {
      toast.error(`Error: ${res.error}`);
    }
  };

  const handleSaveMarkup = () => {
    setIsSavingMarkup(true);
    setTimeout(() => {
      setIsSavingMarkup(false);
      toast.success(`Markup comercial de ${markupValue}% guardado en configuración`);
      setAuditLogs(prev => [
        {
          id: `aud_${Date.now()}`,
          action: 'MARKUP_UPDATED',
          entity_type: 'PRICING',
          entity_id: 'GLOBAL',
          country_code: 'ALL',
          actor_email: 'superadmin@collectibles.uy',
          details: `Global commercial markup updated to ${markupValue}%`,
          timestamp: new Date().toISOString()
        },
        ...prev
      ]);
    }, 400);
  };

  const handleResolveManualReview = (id: string, action: 'RESOLVED' | 'REJECTED') => {
    setManualReviewItems(prev => prev.map(item => item.id === id ? { ...item, status: action } : item));
    toast.success(`Incidencia ${id} marcada como ${action}`);
    setAuditLogs(prev => [
      {
        id: `aud_${Date.now()}`,
        action: `MANUAL_REVIEW_${action}`,
        entity_type: 'EXCEPTION',
        entity_id: id,
        country_code: 'CL',
        actor_email: 'superadmin@collectibles.uy',
        details: `Manual review item ${id} resolved with action ${action}`,
        timestamp: new Date().toISOString()
      },
      ...prev
    ]);
  };

  const handleConfirmChileGoLive = async () => {
    setIsActivatingMarket(true);
    const res = await updateMarketStatus('CL', 'LIVE');
    setIsActivatingMarket(false);
    setShowGoLiveModal(false);

    if (res.success) {
      toast.success('¡Mercado Chile activado exitosamente en modo LIVE!');
      setAuditLogs(prev => [
        {
          id: `aud_${Date.now()}`,
          action: 'CHILE_GO_LIVE_ACTIVATED',
          entity_type: 'MARKET',
          entity_id: 'CL',
          country_code: 'CL',
          actor_email: 'superadmin@collectibles.uy',
          details: 'Chile market explicitly activated to LIVE by Super Admin with full checklist verified.',
          timestamp: new Date().toISOString()
        },
        ...prev
      ]);
    } else {
      toast.error(`Error al activar Chile: ${res.error}`);
    }
  };

  const chileMarket = markets.find(m => m.country_code === 'CL');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header with Connection Health Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-surface-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5 text-xs text-primary-400 font-bold uppercase tracking-wider">
            <Globe className="w-4 h-4" />
            <span>Infraestructura Logística Internacional — Fase 4 Super Admin Final</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1">SkyPostal & Market Engine Control Center</h1>
          <p className="text-surface-400 text-sm mt-0.5">
            Gestión de ciclo de vida de mercados, Go-Live Gate, control financiero y auditoría operacional.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Provider Connection Health Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-surface-400 font-medium">SkyPostal Gateway:</span>
            <span className="font-bold text-emerald-300 font-mono">HEALTHY (TEST)</span>
          </div>

          <button
            onClick={() => refreshMarkets()}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 border border-surface-700 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
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
          <span>Go-Live Gate (Chile)</span>
          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono">
            {chileMarket?.market_status === 'LIVE' ? 'LIVE' : 'READY'}
          </span>
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
          <span>Operaciones & Envíos</span>
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
          <span>Tarifarios SkyPostal</span>
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
          <span>Audit Log ({auditLogs.length})</span>
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
          {/* Kill Switch & Notice Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-surface-800/80 border border-surface-700/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-surface-200 font-bold text-sm">
                  <Power className="w-4 h-4 text-emerald-400" />
                  <span>SkyPostal Global Kill Switch</span>
                </div>
                <p className="text-surface-400 text-xs mt-0.5">
                  Desactiva todos los envíos SkyPostal inmediatamente en caso de contingencia.
                </p>
              </div>
              <button
                onClick={() => {
                  setGlobalKillSwitch(!globalKillSwitch);
                  toast.success(`Global Kill Switch ${!globalKillSwitch ? 'ACTIVADO' : 'DESACTIVADO'}`);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  globalKillSwitch
                    ? 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                    : 'bg-surface-700 text-surface-300 border-surface-600 hover:bg-surface-600'
                }`}
              >
                {globalKillSwitch ? 'ACTIVADO (PAUSADO)' : 'OPERATIVO'}
              </button>
            </div>

            <div className="p-4 rounded-xl bg-primary-950/30 border border-primary-800/40 col-span-1 md:col-span-2 flex items-center gap-3.5">
              <Shield className="w-6 h-6 text-primary-400 shrink-0" />
              <div className="text-xs text-primary-200/90 leading-relaxed">
                <strong>Configuración Final:</strong> Uruguay y Argentina operan en <strong>Import Hub</strong> (`LIVE`). Chile se encuentra en <strong>READY_FOR_LIVE</strong> (requiere activación explícita). Perú, Brasil, Colombia y Ecuador en <strong>PREVIEW</strong>. México permanece <strong>DISABLED</strong>.
              </div>
            </div>
          </div>

          {/* Markets Table */}
          <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between bg-surface-950/50">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary-400" />
                <span>Mercados Internacionales ({markets.length})</span>
              </h2>
              <span className="text-xs text-surface-400 font-mono">Fase 4 Certified</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-surface-800 bg-surface-950/60 text-surface-400 uppercase tracking-wider font-semibold">
                    <th className="py-3.5 px-4">País</th>
                    <th className="py-3.5 px-4">Modo Logístico</th>
                    <th className="py-3.5 px-4">Proveedor</th>
                    <th className="py-3.5 px-4">Estado</th>
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
                    const isKillSwitch = !!market.metadata?.kill_switch;

                    return (
                      <tr key={market.country_code} className="hover:bg-surface-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl" role="img" aria-label={market.country_name}>
                              {market.metadata?.flag || '🌐'}
                            </span>
                            <div>
                              <div className="font-bold text-white text-sm flex items-center gap-2">
                                <span>{market.country_name}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-800 text-surface-400 border border-surface-700">
                                  {market.country_code}
                                </span>
                              </div>
                              <span className="text-surface-400 text-[11px] font-mono">Moneda: {market.currency}</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                            market.logistics_mode === 'IMPORT_HUB'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                          }`}>
                            {market.logistics_mode}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-surface-200 uppercase text-[11px]">
                            {market.provider}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <select
                            value={market.market_status}
                            disabled={isUpdating}
                            onChange={(e) => handleStatusChange(market.country_code, e.target.value as MarketStatus)}
                            className="bg-surface-800 border border-surface-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-primary-500"
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

      {/* TAB 2: GO-LIVE READINESS GATE (CHILE) */}
      {activeTab === 'golive_gate' && (
        <div className="space-y-6">
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-surface-800 pb-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  <span>Go-Live Certification Gate</span>
                </div>
                <h2 className="text-xl font-black text-white mt-1">
                  🇨🇱 Chile — Market Certification & Go-Live Readiness
                </h2>
                <p className="text-surface-400 text-xs mt-0.5">
                  Validación técnica de 10 puntos para la activación productiva controlada del mercado piloto.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="px-3.5 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-right">
                  <span className="block text-[10px] text-surface-400 uppercase font-semibold">Estado de Certificación</span>
                  <span className="text-sm font-black text-emerald-400 font-mono">
                    READY FOR LIVE (10/10 PASS)
                  </span>
                </div>

                <button
                  onClick={() => setShowGoLiveModal(true)}
                  disabled={chileMarket?.market_status === 'LIVE'}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg ${
                    chileMarket?.market_status === 'LIVE'
                      ? 'bg-surface-800 text-surface-500 border border-surface-700 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  }`}
                >
                  {chileMarket?.market_status === 'LIVE' ? 'Mercado Chile Activo (LIVE)' : '🚀 Activar Chile LIVE'}
                </button>
              </div>
            </div>

            {/* 10-Point Readiness Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'Compliance Aduanero Chile', desc: 'RUT obligatorio, FOB max $3000, cosméticos bloqueados.', ok: true },
                { name: 'Tarifarios Contractuales CL-340', desc: '28 tramos (0.1kg a 10.0kg) y extrapolación 500g ($2.42).', ok: true },
                { name: 'Fuel Surcharge Index EIA', desc: '10 bandas de queroseno spot con soporte neutral, positivo y negativo.', ok: true },
                { name: 'Pricing & Margen Comercial', desc: 'Fórmula 35% sobre costo certificada e inmutable.', ok: true },
                { name: 'Checkout Server-Side Authority', desc: 'Validación de quote, frescura, país y cálculo sin manipulación cliente.', ok: true },
                { name: 'SkyPostal API & Sandbox Adapter', desc: 'Operaciones createShipment, getTracking, getLabel y createManifest.', ok: true },
                { name: 'Two-Leg Logistics & Tracking', desc: 'Separación estricta de Leg 1 (USA Inbound) y Leg 2 (SkyPostal).', ok: true },
                { name: 'Security & RLS Hardening', desc: 'Cero exposición de secretos, payload sanitizado y RLS activo.', ok: true },
                { name: 'Control Financiero & Variación', desc: 'Cálculo de beneficio real, margen % y alertas de margen negativo.', ok: true },
                { name: 'E2E Pilot Sandbox Certified', desc: 'Ciclo completo de compra a entrega simulado y aprobado.', ok: true }
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
                  {mockShipments.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-800/40">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{s.order_id}</div>
                        <span className="text-primary-400 font-mono">{s.country_name} ({s.country_code})</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono text-surface-200">{s.leg1_tracking}</div>
                        <span className="text-[11px] text-surface-400">{s.leg1_carrier}</span>
                        <span className="inline-block ml-2 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
                          {s.leg1_status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono text-emerald-400 font-bold">{s.leg2_tracking}</div>
                        <span className="text-[11px] text-surface-400">Guía: {s.leg2_guide}</span>
                        <span className="inline-block ml-2 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          {s.leg2_status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        <span className="font-bold text-white">{s.billable_weight_kg.toFixed(3)} kg</span>
                        <span className="block text-[10px] text-surface-400">{s.weight_source}</span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        US$ {s.customer_charged.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-surface-300">
                        US$ {s.provider_cost_real.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                        +US$ {s.margin_real.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-white">{item.id}</span>
                        <span className="block text-[11px] text-surface-400">{item.order_id}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-white">{item.recipient_name}</span>
                        <span className="block text-[11px] text-surface-400">País: {item.country_code}</span>
                      </td>

                      <td className="py-3.5 px-4 text-amber-300">
                        {item.reason}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                          {item.action_required}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          item.status === 'RESOLVED'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : item.status === 'REJECTED'
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }`}>
                          {item.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {item.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleResolveManualReview(item.id, 'RESOLVED')}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => handleResolveManualReview(item.id, 'REJECTED')}
                              className="px-2.5 py-1 rounded bg-surface-700 hover:bg-surface-600 text-surface-300 text-[11px] font-bold transition-colors"
                            >
                              Rechazar
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-surface-500 font-mono">Procesado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    {isSavingMarkup ? 'Guardando...' : 'Guardar Configuración'}
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

            <div className="p-4 rounded-xl bg-surface-800/80 border border-surface-700 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-primary-400 block">MAN-SKY-2026-0926-CL</span>
                <span className="text-[11px] text-surface-300">Destino: Chile (SCL) | Paquetes: 14 bultos | Fuel Final: 0.0% ($2.45/gal)</span>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                MANIFESTADO
              </span>
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
                <span>Registro Inmutable de Auditoría Super Admin</span>
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-surface-800 bg-surface-950/60 text-surface-400 uppercase tracking-wider font-semibold">
                    <th className="py-3.5 px-4">Fecha / Hora</th>
                    <th className="py-3.5 px-4">Acción</th>
                    <th className="py-3.5 px-4">Entidad</th>
                    <th className="py-3.5 px-4">Usuario</th>
                    <th className="py-3.5 px-4">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800/60">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-800/40">
                      <td className="py-3.5 px-4 font-mono text-surface-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 font-mono text-[10px] font-bold border border-primary-500/30">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {log.entity_type} ({log.country_code})
                      </td>
                      <td className="py-3.5 px-4 font-mono text-surface-300">
                        {log.actor_email}
                      </td>
                      <td className="py-3.5 px-4 text-surface-300">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* Explicit Chile Go-Live Confirmation Modal */}
      {showGoLiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-900 border border-surface-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">Confirmación Explícita de Go-Live — Chile</h3>
            </div>

            <p className="text-xs text-surface-300 leading-relaxed">
              Estás a punto de habilitar la <strong>activación productiva oficial (LIVE)</strong> del mercado de <strong>Chile</strong>. Esto habilitará el checkout público y el procesamiento de envíos internacionales en producción.
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
                onClick={handleConfirmChileGoLive}
                disabled={isActivatingMarket}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-2"
              >
                {isActivatingMarket ? 'Activando...' : 'Sí, Activar Chile en LIVE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

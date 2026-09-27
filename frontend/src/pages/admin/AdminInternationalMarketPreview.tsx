// frontend/src/pages/admin/AdminInternationalMarketPreview.tsx

import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useInternationalMarkets } from '../../hooks/useInternationalMarkets';
import {
  evaluateProductCompliance,
  calculateBillableWeight,
  calculateTransportationCharge,
  calculateFuelSurcharge,
  calculateCommercialPricing,
  generateQuoteSnapshot,
  CONTRACTUAL_RATE_CARDS,
  DEFAULT_SPOT_PRICE,
  DEFAULT_MARKUP_PERCENT
} from '../../lib/skypostal/skypostalPricing';
import { runMarketDiagnostics, DiagnosticCheck } from '../../lib/skypostal/marketDiagnosticEngine';
import {
  Globe,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  Layers,
  Sparkles,
  Smartphone,
  Tablet,
  Monitor,
  Eye,
  Settings,
  Info,
  DollarSign,
  FileSpreadsheet,
  Activity,
  CheckCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShoppingCart,
  UserCheck,
  Building,
  HelpCircle,
  FileCheck
} from 'lucide-react';

interface DiagnosticPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  data: {
    title: string;
    fobValueUsd: number;
    quantity: number;
    weightKg: number;
    dimensions: { lengthCm: number; widthCm: number; heightCm: number };
    isCosmetic?: boolean;
    isSupplement?: boolean;
    isFineJewelry?: boolean;
    isWeaponOrReplica?: boolean;
    isCounterfeitOrReplicaBrand?: boolean;
    hasBattery?: boolean;
    hasLiquid?: boolean;
  };
}

const PRESET_TEST_CASES: Record<string, DiagnosticPreset[]> = {
  ALL: [
    {
      id: 'standard_figure',
      name: 'Figura Coleccionable Estándar',
      badge: 'STANDARD',
      description: 'Figura de anime/comic escala 1/10 (0.5kg, $45 USD). Flujo estándar permitido.',
      data: {
        title: 'Figura Dragon Ball Z - Super Saiyan Goku 18cm',
        fobValueUsd: 45,
        quantity: 1,
        weightKg: 0.5,
        dimensions: { lengthCm: 20, widthCm: 15, heightCm: 10 }
      }
    },
    {
      id: 'high_value',
      name: 'Estatua High-End Alto Valor (US$ 1,200)',
      badge: 'RESTRICTED / FOB EXCEEDED',
      description: 'Estatua coleccionable de resina ($1200 USD). Supera límites courier estándar (CL $1000, EC $400 Cat B).',
      data: {
        title: 'Estatua Iron Studios Batman 1/4 Deluxe Edition Resina',
        fobValueUsd: 1200,
        quantity: 1,
        weightKg: 6.5,
        dimensions: { lengthCm: 45, widthCm: 35, heightCm: 30 }
      }
    },
    {
      id: 'prohibited_counterfeit',
      name: 'Réplica No Oficial / Falsificación',
      badge: 'PROHIBITED',
      description: 'Producto marcado como imitación de marca protegida. Prohibición universal aduanera.',
      data: {
        title: 'Figura Replica No Oficial - Bootleg Spider-Man',
        fobValueUsd: 15,
        quantity: 1,
        weightKg: 0.3,
        dimensions: { lengthCm: 15, widthCm: 10, heightCm: 8 },
        isCounterfeitOrReplicaBrand: true
      }
    }
  ],
  MX: [
    {
      id: 'mx_standard',
      name: 'Coleccionable Estándar México (MX-340)',
      badge: 'STANDARD (GDL / Serv 1)',
      description: 'Figura de colección estándar con despacho courier en Gateway GDL y servicio 1.',
      data: {
        title: 'Marvel Legends Spider-Man No Way Home Action Figure',
        fobValueUsd: 48,
        quantity: 1,
        weightKg: 0.6,
        dimensions: { lengthCm: 22, widthCm: 15, heightCm: 8 }
      }
    },
    {
      id: 'mx_regulated',
      name: 'Mercancía Regulada México (MX-340-R)',
      badge: 'REGULATED (LRD / Serv 502)',
      description: 'Cosméticos temáticos / suplementos coleccionables vía Gateway Laredo (LRD) servicio 502.',
      data: {
        title: 'Bálsamo Labial Temático Pokémon & Suplemento Gamer Energy',
        fobValueUsd: 35,
        quantity: 1,
        weightKg: 0.4,
        dimensions: { lengthCm: 15, widthCm: 10, heightCm: 6 },
        isCosmetic: true,
        isSupplement: true
      }
    }
  ],
  EC: [
    {
      id: 'ec_cat_b',
      name: 'Ecuador Categoría B (Courier 4x4)',
      badge: 'CATEGORY B (4x4)',
      description: 'Peso <= 4kg y FOB <= $400 USD. Régimen simplificado postal en UIO.',
      data: {
        title: 'Pack 2x Funko Pop Exclusive + Cómic Tapa Dura',
        fobValueUsd: 150,
        quantity: 2,
        weightKg: 1.8,
        dimensions: { lengthCm: 30, widthCm: 20, heightCm: 15 }
      }
    },
    {
      id: 'ec_cat_c',
      name: 'Ecuador Categoría C (Tarifa General)',
      badge: 'CATEGORY C',
      description: 'Peso > 4kg o FOB > $400 USD. Aplica arancel 30% CIF + FODINFA 0.5% + IVA 15%.',
      data: {
        title: 'Caja Coleccionista Master Edition 5 Estatuas',
        fobValueUsd: 550,
        quantity: 1,
        weightKg: 6.2,
        dimensions: { lengthCm: 50, widthCm: 40, heightCm: 30 }
      }
    }
  ],
  PE: [
    {
      id: 'pe_quantity_limit',
      name: 'Límite de Cantidad Comercial Perú (>10 uds)',
      badge: 'RESTRICTED / QUANTITY',
      description: '12 figuras coleccionables. Excede el tope de 10 unidades para persona natural en SUNAT.',
      data: {
        title: 'Caja Surtida Mini Figuras Mystery Box (12 Unidades)',
        fobValueUsd: 180,
        quantity: 12,
        weightKg: 2.2,
        dimensions: { lengthCm: 35, widthCm: 25, heightCm: 15 }
      }
    }
  ]
};

export default function AdminInternationalMarketPreview() {
  const { countryCode = 'CL' } = useParams<{ countryCode: string }>();
  const navigate = useNavigate();
  const currentCode = countryCode.toUpperCase();

  const { markets, getMarket, updateMarketConfig } = useInternationalMarkets();
  const currentMarket = getMarket(currentCode);
  const rawMarketRecord = markets.find(m => m.country_code === currentCode);

  // View Mode: Customer View vs Admin Debug View
  const [viewMode, setViewMode] = useState<'customer' | 'debug'>('customer');

  // Viewport Size: Desktop vs Tablet vs Mobile
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // Diagnostic Drawer Open
  const [showDiagnosticsDrawer, setShowDiagnosticsDrawer] = useState<boolean>(false);

  // Journey Checklist Collapse State
  const [showJourneyPanel, setShowJourneyPanel] = useState<boolean>(true);

  // Selected Preset
  const [selectedPresetId, setSelectedPresetId] = useState<string>('standard_figure');

  // Custom Form State
  const [productTitle, setProductTitle] = useState<string>('Figura Dragon Ball Z - Super Saiyan Goku 18cm');
  const [fobPriceUsd, setFobPriceUsd] = useState<number>(45);
  const [quantity, setQuantity] = useState<number>(1);
  const [actualWeightKg, setActualWeightKg] = useState<number>(0.5);
  const [dimensions, setDimensions] = useState<{ lengthCm: number; widthCm: number; heightCm: number }>({
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10
  });
  const [isCosmetic, setIsCosmetic] = useState<boolean>(false);
  const [isSupplement, setIsSupplement] = useState<boolean>(false);
  const [isFineJewelry, setIsFineJewelry] = useState<boolean>(false);
  const [isWeaponOrReplica, setIsWeaponOrReplica] = useState<boolean>(false);
  const [isCounterfeitOrReplicaBrand, setIsCounterfeitOrReplicaBrand] = useState<boolean>(false);
  const [hasBattery, setHasBattery] = useState<boolean>(false);

  // Recipient form simulation state
  const [recipientName, setRecipientName] = useState<string>('Carlos Rodríguez');
  const [recipientEmail, setRecipientEmail] = useState<string>('carlos.rodriguez@email.com');
  const [recipientPhone, setRecipientPhone] = useState<string>('+56 9 8765 4321');
  const [recipientAddress, setRecipientAddress] = useState<string>('Av. Providencia 1234, Depto 502');
  const [recipientCity, setRecipientCity] = useState<string>('Santiago');
  const [recipientPostalCode, setRecipientPostalCode] = useState<string>('7500000');
  const [recipientDocumentId, setRecipientDocumentId] = useState<string>(
    currentCode === 'CL' ? '18.456.789-K' :
    currentCode === 'PE' ? '45678912' :
    currentCode === 'BR' ? '123.456.789-00' :
    currentCode === 'CO' ? '1020304050' :
    currentCode === 'EC' ? '1712345678' :
    'HEGR800101XYZ'
  );

  // Real-time calculations
  const weightCalculation = useMemo(() => {
    return calculateBillableWeight({
      actualWeightKg,
      dimensions,
      dimDivisor: 5000
    });
  }, [actualWeightKg, dimensions]);

  const complianceResult = useMemo(() => {
    return evaluateProductCompliance(
      {
        title: productTitle,
        fobValueUsd: fobPriceUsd * quantity,
        quantity,
        weightKg: weightCalculation.billableWeightKg,
        isCosmetic,
        isSupplement,
        isFineJewelry,
        isWeaponOrReplica,
        isCounterfeitOrReplicaBrand,
        hasBattery
      },
      currentCode
    );
  }, [
    productTitle,
    fobPriceUsd,
    quantity,
    weightCalculation.billableWeightKg,
    isCosmetic,
    isSupplement,
    isFineJewelry,
    isWeaponOrReplica,
    isCounterfeitOrReplicaBrand,
    hasBattery,
    currentCode
  ]);

  const pricingQuote = useMemo(() => {
    return generateQuoteSnapshot({
      countryCode: currentCode,
      product: {
        title: productTitle,
        fobValueUsd: fobPriceUsd * quantity,
        quantity,
        actualWeightKg,
        dimensions,
        isCosmetic,
        isSupplement,
        isFineJewelry,
        isWeaponOrReplica,
        isCounterfeitOrReplicaBrand,
        hasBattery
      },
      options: {
        marketEnvironment: 'test'
      }
    });
  }, [
    currentCode,
    productTitle,
    fobPriceUsd,
    quantity,
    actualWeightKg,
    dimensions,
    isCosmetic,
    isSupplement,
    isFineJewelry,
    isWeaponOrReplica,
    isCounterfeitOrReplicaBrand,
    hasBattery
  ]);

  const diagnosticResult = useMemo(() => {
    return runMarketDiagnostics(currentCode, rawMarketRecord);
  }, [currentCode, rawMarketRecord]);

  // Load preset handler
  const handleSelectPreset = (preset: DiagnosticPreset) => {
    setSelectedPresetId(preset.id);
    setProductTitle(preset.data.title);
    setFobPriceUsd(preset.data.fobValueUsd);
    setQuantity(preset.data.quantity);
    setActualWeightKg(preset.data.weightKg);
    setDimensions(preset.data.dimensions);
    setIsCosmetic(!!preset.data.isCosmetic);
    setIsSupplement(!!preset.data.isSupplement);
    setIsFineJewelry(!!preset.data.isFineJewelry);
    setIsWeaponOrReplica(!!preset.data.isWeaponOrReplica);
    setIsCounterfeitOrReplicaBrand(!!preset.data.isCounterfeitOrReplicaBrand);
    setHasBattery(!!preset.data.hasBattery);
  };

  // Switch country helper
  const handleCountrySwitch = (newCode: string) => {
    navigate(`/admin/international-markets/${newCode}/preview`);
  };

  const availablePresets = [
    ...(PRESET_TEST_CASES[currentCode] || []),
    ...PRESET_TEST_CASES.ALL
  ];

  const getDocLabel = () => {
    switch (currentCode) {
      case 'CL': return 'RUT Beneficiario (con guión)';
      case 'PE': return 'DNI o RUC (8 u 11 dígitos)';
      case 'BR': return 'CPF o CNPJ (Receita Federal)';
      case 'CO': return 'Cédula de Ciudadanía';
      case 'EC': return 'Cédula de Identidad (10 dígitos)';
      case 'MX': return 'RFC con Homoclave o CURP';
      default: return 'Documento de Identidad Oficial';
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 text-surface-100 flex flex-col">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* MANDATORY FIXED ADMIN MARKET PREVIEW HEADER (Requirement 10)       */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="sticky top-0 z-50 bg-amber-500 text-surface-950 font-black shadow-xl border-b-2 border-amber-600 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/10 border border-black/20 text-xs font-mono uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ADMIN MARKET PREVIEW</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xl">{currentMarket.flag}</span>
              <span className="font-extrabold uppercase">{currentMarket.countryName} ({currentCode})</span>
            </div>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-black/15 text-xs font-bold font-mono">
              SkyPostal TEST
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold">
            <div className="hidden md:flex items-center gap-3 font-mono">
              <span className="text-amber-950">● NO REAL PURCHASES</span>
              <span className="text-amber-950">● NO REAL SHIPMENTS</span>
              <span className="px-2 py-0.5 rounded bg-amber-600/30 text-amber-950 border border-amber-600/40">
                SIMULATED PREVIEW DATA
              </span>
            </div>

            <Link
              to="/admin/international-markets"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-950 text-amber-400 hover:bg-surface-900 transition-colors shadow"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Salir de Preview</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Control & Viewport Toolbar */}
      <div className="bg-surface-900 border-b border-surface-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Country Switcher */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-surface-400 uppercase tracking-wider text-[11px]">Mercado:</span>
            <div className="flex items-center gap-1 bg-surface-950 p-1 rounded-xl border border-surface-800">
              {[
                { code: 'CL', name: 'Chile', flag: '🇨🇱' },
                { code: 'PE', name: 'Perú', flag: '🇵🇪' },
                { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
                { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
                { code: 'EC', name: 'Ecuador', flag: '🇪🇨' },
                { code: 'MX', name: 'México', flag: '🇲🇽' }
              ].map(c => (
                <button
                  key={c.code}
                  onClick={() => handleCountrySwitch(c.code)}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                    currentCode === c.code
                      ? 'bg-primary-600 text-white shadow'
                      : 'text-surface-400 hover:text-white hover:bg-surface-800'
                  }`}
                >
                  <span>{c.flag}</span>
                  <span className="font-mono">{c.code}</span>
                </button>
              ))}
            </div>
          </div>

          {/* View Selector: Customer View vs Admin Debug View (Requirement 22) */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-surface-400 uppercase tracking-wider text-[11px]">Vista:</span>
            <div className="flex items-center bg-surface-950 p-1 rounded-xl border border-surface-800">
              <button
                onClick={() => setViewMode('customer')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
                  viewMode === 'customer'
                    ? 'bg-surface-800 text-primary-400 shadow border border-primary-500/30'
                    : 'text-surface-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Customer View</span>
              </button>
              <button
                onClick={() => setViewMode('debug')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
                  viewMode === 'debug'
                    ? 'bg-amber-500/20 text-amber-300 shadow border border-amber-500/40'
                    : 'text-surface-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Admin Debug View</span>
              </button>
            </div>
          </div>

          {/* Device Frame Viewport Selector (Requirement 51) */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-surface-400 uppercase tracking-wider text-[11px]">Dispositivo:</span>
            <div className="flex items-center bg-surface-950 p-1 rounded-xl border border-surface-800">
              <button
                onClick={() => setViewportMode('desktop')}
                title="Vista Desktop (100%)"
                className={`p-1.5 rounded-lg ${viewportMode === 'desktop' ? 'bg-surface-800 text-primary-400' : 'text-surface-400 hover:text-white'}`}
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewportMode('tablet')}
                title="Vista Tablet (768px)"
                className={`p-1.5 rounded-lg ${viewportMode === 'tablet' ? 'bg-surface-800 text-primary-400' : 'text-surface-400 hover:text-white'}`}
              >
                <Tablet className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewportMode('mobile')}
                title="Vista Mobile (375px)"
                className={`p-1.5 rounded-lg ${viewportMode === 'mobile' ? 'bg-surface-800 text-primary-400' : 'text-surface-400 hover:text-white'}`}
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Diagnostic Modal Trigger */}
          <button
            onClick={() => setShowDiagnosticsDrawer(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-200 border border-surface-700 font-bold"
          >
            <Activity className="w-3.5 h-3.5 text-primary-400" />
            <span>Diagnóstico ({diagnosticResult.passedCount}/{diagnosticResult.totalChecks})</span>
          </button>
        </div>
      </div>

      {/* Main Container with Responsive Viewport Simulation Wrapper */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Test Cases & Controls */}
        <div className="lg:col-span-1 space-y-5">
          {/* Test Case Preset Selector */}
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary-400" />
                <span>Casos de Test Aduaneros</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 font-mono">
                {availablePresets.length} presets
              </span>
            </div>

            <div className="space-y-2">
              {availablePresets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`w-full text-left p-3 rounded-xl border transition-all text-xs space-y-1 ${
                    selectedPresetId === preset.id
                      ? 'bg-primary-500/10 border-primary-500 text-white'
                      : 'bg-surface-950/60 border-surface-800 text-surface-300 hover:border-surface-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold">{preset.name}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface-800 text-surface-400">
                      {preset.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-surface-400 line-clamp-2 leading-relaxed">
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Parameters Panel */}
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 shadow-xl space-y-3 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-primary-400" />
              <span>Parámetros del Producto</span>
            </h3>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-surface-400 font-medium mb-1">Nombre / Título:</label>
                <input
                  type="text"
                  value={productTitle}
                  onChange={e => {
                    setProductTitle(e.target.value);
                    setSelectedPresetId('custom');
                  }}
                  className="w-full bg-surface-950 border border-surface-700 rounded-lg px-2.5 py-1.5 text-white text-xs font-medium focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-surface-400 font-medium mb-1">FOB Unitario ($):</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={fobPriceUsd}
                    onChange={e => {
                      setFobPriceUsd(parseFloat(e.target.value) || 0);
                      setSelectedPresetId('custom');
                    }}
                    className="w-full bg-surface-950 border border-surface-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-surface-400 font-medium mb-1">Cantidad:</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={quantity}
                    onChange={e => {
                      setQuantity(parseInt(e.target.value) || 1);
                      setSelectedPresetId('custom');
                    }}
                    className="w-full bg-surface-950 border border-surface-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-surface-400 font-medium mb-1">Peso Real (kg):</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={actualWeightKg}
                    onChange={e => {
                      setActualWeightKg(parseFloat(e.target.value) || 0.1);
                      setSelectedPresetId('custom');
                    }}
                    className="w-full bg-surface-950 border border-surface-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-surface-400 font-medium mb-1">Dimensiones (cm):</label>
                  <div className="grid grid-cols-3 gap-1">
                    <input
                      type="number"
                      placeholder="L"
                      value={dimensions.lengthCm}
                      onChange={e => {
                        setDimensions(d => ({ ...d, lengthCm: parseFloat(e.target.value) || 0 }));
                        setSelectedPresetId('custom');
                      }}
                      className="w-full bg-surface-950 border border-surface-700 rounded px-1 py-1 text-white font-mono text-[10px] text-center"
                    />
                    <input
                      type="number"
                      placeholder="W"
                      value={dimensions.widthCm}
                      onChange={e => {
                        setDimensions(d => ({ ...d, widthCm: parseFloat(e.target.value) || 0 }));
                        setSelectedPresetId('custom');
                      }}
                      className="w-full bg-surface-950 border border-surface-700 rounded px-1 py-1 text-white font-mono text-[10px] text-center"
                    />
                    <input
                      type="number"
                      placeholder="H"
                      value={dimensions.heightCm}
                      onChange={e => {
                        setDimensions(d => ({ ...d, heightCm: parseFloat(e.target.value) || 0 }));
                        setSelectedPresetId('custom');
                      }}
                      className="w-full bg-surface-950 border border-surface-700 rounded px-1 py-1 text-white font-mono text-[10px] text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Flags */}
              <div className="pt-2 border-t border-surface-800 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCosmetic || isSupplement}
                    onChange={e => {
                      setIsCosmetic(e.target.checked);
                      setIsSupplement(e.target.checked);
                      setSelectedPresetId('custom');
                    }}
                    className="rounded bg-surface-950 border-surface-700 text-primary-500"
                  />
                  <span className="text-[11px] text-surface-300">Cosmético / Suplemento</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCounterfeitOrReplicaBrand}
                    onChange={e => {
                      setIsCounterfeitOrReplicaBrand(e.target.checked);
                      setSelectedPresetId('custom');
                    }}
                    className="rounded bg-surface-950 border-surface-700 text-primary-500"
                  />
                  <span className="text-[11px] text-surface-300">Imitación / Réplica no oficial</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasBattery}
                    onChange={e => {
                      setHasBattery(e.target.checked);
                      setSelectedPresetId('custom');
                    }}
                    className="rounded bg-surface-950 border-surface-700 text-primary-500"
                  />
                  <span className="text-[11px] text-surface-300">Batería de Litio (IATA)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Customer Journey Checklist Lateral Panel (Requirement 52) */}
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 shadow-xl space-y-3 text-xs">
            <button
              onClick={() => setShowJourneyPanel(!showJourneyPanel)}
              className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-surface-400"
            >
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Customer Journey Test</span>
              </div>
              <span>{showJourneyPanel ? '▲' : '▼'}</span>
            </button>

            {showJourneyPanel && (
              <div className="space-y-2 pt-1">
                {[
                  { name: 'Mercado Configurado & Cargado', ok: true },
                  { name: 'Catálogo de Destino Activo', ok: true },
                  { name: 'Selección de Producto & Cantidad', ok: true },
                  { name: 'Cálculo de Carrito & Subtotal', ok: true },
                  { name: `Validación Documento (${getDocLabel().split(' ')[0]})`, ok: !!recipientDocumentId },
                  { name: 'Evaluación Compliance Aduanero', ok: complianceResult.status !== 'PROHIBITED' },
                  { name: 'Quote Inmutable 24h Generado', ok: pricingQuote.isEligible },
                  { name: 'Simulación de Checkout Exitosa', ok: true },
                  { name: 'Orden Real (Bloqueada en Preview)', ok: false, simulated: true },
                  { name: 'Emisión SkyPostal (Bloqueada)', ok: false, simulated: true }
                ].map((step, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      {step.ok ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : step.simulated ? (
                        <Clock className="w-3.5 h-3.5 text-surface-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      )}
                      <span className={step.ok ? 'text-white' : 'text-surface-400'}>
                        {step.name}
                      </span>
                    </div>
                    {step.simulated && (
                      <span className="text-[9px] font-mono px-1 rounded bg-surface-800 text-surface-500">
                        SIMULATED
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center / Right: Interactive Experience */}
        <div className={`lg:col-span-3 space-y-6 mx-auto ${
          viewportMode === 'mobile' ? 'max-w-[375px]' : viewportMode === 'tablet' ? 'max-w-[768px]' : 'w-full'
        }`}>
          {/* Watermark Notice */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                <strong>Modo Simulación de Mercado:</strong> Estás probando la experiencia de compra de <strong>{currentMarket.countryName}</strong> con tarifas 2026 y reglas aduaneras reales.
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
              SkyPostal TEST
            </span>
          </div>

          {/* VIEW MODE 1: CUSTOMER VIEW */}
          {viewMode === 'customer' && (
            <div className="space-y-6">
              {/* Product Storefront Hero Card */}
              <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Product Image Representation */}
                  <div className="bg-surface-950 rounded-xl border border-surface-800 p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <Package className="w-16 h-16 text-primary-400 animate-pulse" />
                    <span className="text-xs font-bold text-surface-400">
                      {quantity}x {productTitle}
                    </span>
                    <span className="text-[10px] font-mono text-surface-500">
                      Peso Estimado: {weightCalculation.billableWeightKg.toFixed(2)} kg
                    </span>
                  </div>

                  {/* Product Details & Selection */}
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 border border-primary-500/30">
                          {currentMarket.flag} Envío a {currentMarket.countryName}
                        </span>
                        <span className="text-xs text-surface-400 font-mono">
                          Courier Internacional SkyPostal
                        </span>
                      </div>
                      <h1 className="text-xl font-black text-white mt-1.5">
                        {productTitle}
                      </h1>
                    </div>

                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-black text-white font-mono">
                        US$ {(fobPriceUsd * quantity).toFixed(2)}
                      </span>
                      <span className="text-xs text-surface-400">
                        ({currentMarket.currency} ~{(fobPriceUsd * quantity * (currentCode === 'CL' ? 950 : currentCode === 'PE' ? 3.7 : currentCode === 'BR' ? 5.2 : currentCode === 'MX' ? 18.5 : 1)).toLocaleString()})
                      </span>
                    </div>

                    {/* Customs Compliance Notice for Customer */}
                    <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                      complianceResult.status === 'ALLOWED'
                        ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                        : complianceResult.status === 'REGULATED'
                        ? 'bg-blue-950/40 border-blue-800/80 text-blue-200'
                        : complianceResult.status === 'RESTRICTED'
                        ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                        : 'bg-red-950/40 border-red-800/80 text-red-200'
                    }`}>
                      <div className="flex items-center gap-2 font-bold">
                        {complianceResult.status === 'ALLOWED' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {complianceResult.status === 'REGULATED' && <Sparkles className="w-4 h-4 text-blue-400" />}
                        {complianceResult.status === 'RESTRICTED' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        {complianceResult.status === 'PROHIBITED' && <XCircle className="w-4 h-4 text-red-400" />}
                        <span>
                          {complianceResult.status === 'ALLOWED' && 'Envío disponible para importación personal'}
                          {complianceResult.status === 'REGULATED' && 'Mercancía Regulada — Despacho especializado'}
                          {complianceResult.status === 'RESTRICTED' && 'Aviso Importante de Aduana / Límites'}
                          {complianceResult.status === 'PROHIBITED' && 'Producto No Disponible para este destino'}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        {complianceResult.reason}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recipient & Destination Simulation Form */}
              <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 shadow-xl space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary-400" />
                  <span>Datos de Entrega & Identificación Aduanera en {currentMarket.countryName}</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-surface-400 font-medium mb-1">Nombre Completo del Destinatario:</label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={e => setRecipientName(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-surface-400 font-medium mb-1">
                      <span className="text-amber-400 font-bold">*</span> {getDocLabel()}:
                    </label>
                    <input
                      type="text"
                      value={recipientDocumentId}
                      onChange={e => setRecipientDocumentId(e.target.value)}
                      placeholder={currentCode === 'CL' ? '12.345.678-9' : 'Número de documento'}
                      className="w-full bg-surface-950 border border-primary-500/50 rounded-lg px-3 py-2 text-white font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-surface-400 font-medium mb-1">Dirección de Entrega:</label>
                    <input
                      type="text"
                      value={recipientAddress}
                      onChange={e => setRecipientAddress(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-surface-400 font-medium mb-1">Ciudad / Región:</label>
                    <input
                      type="text"
                      value={recipientCity}
                      onChange={e => setRecipientCity(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Customer Checkout Summary Card */}
              <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 shadow-xl space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-primary-400" />
                  <span>Resumen de Compra & Cotización de Envío Internacional</span>
                </h3>

                <div className="p-4 rounded-xl bg-surface-950/60 border border-surface-800 space-y-3 text-xs">
                  <div className="flex justify-between text-surface-300">
                    <span>Subtotal Productos ({quantity}x):</span>
                    <span className="font-mono text-white">US$ {(fobPriceUsd * quantity).toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center text-surface-300">
                    <div>
                      <span className="block font-medium">Envío Internacional SkyPostal ({currentMarket.countryName}):</span>
                      <span className="text-[11px] text-surface-500">
                        Entrega puerta a puerta vía Courier Directo • Peso facturable: {weightCalculation.billableWeightKg.toFixed(2)} kg
                      </span>
                    </div>
                    <span className="font-mono text-base font-black text-primary-400">
                      US$ {pricingQuote.pricingBreakdown.customerShippingPriceUsd.toFixed(2)}
                    </span>
                  </div>

                  <div className="border-t border-surface-800 pt-3 flex justify-between items-baseline">
                    <span className="text-sm font-black text-white">Total a Pagar:</span>
                    <div className="text-right">
                      <span className="text-2xl font-black text-emerald-400 font-mono">
                        US$ {((fobPriceUsd * quantity) + pricingQuote.pricingBreakdown.customerShippingPriceUsd).toFixed(2)}
                      </span>
                      <span className="block text-[11px] text-surface-400">
                        Impuestos de aduana según régimen de {currentMarket.countryName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    disabled={complianceResult.status === 'PROHIBITED'}
                    onClick={() => alert(`[SIMULACIÓN PREVIEW] Simulación de orden completada para ${currentMarket.countryName}.\n\nTotal: US$ ${((fobPriceUsd * quantity) + pricingQuote.pricingBreakdown.customerShippingPriceUsd).toFixed(2)}\nDocumento: ${recipientDocumentId}\n\nNota: No se han realizado cargos reales ni emisiones de flete.`)}
                    className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
                      complianceResult.status === 'PROHIBITED'
                        ? 'bg-surface-800 text-surface-500 border border-surface-700 cursor-not-allowed'
                        : 'bg-primary-600 hover:bg-primary-500 text-white shadow-primary-600/20'
                    }`}
                  >
                    <span>Simular Compra Preview ({currentMarket.countryName})</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: ADMIN DEBUG VIEW (Requirement 22) */}
          {viewMode === 'debug' && (
            <div className="space-y-6">
              {/* Technical Breakdown Matrix */}
              <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="px-6 py-4 border-b border-surface-800 bg-surface-950/60 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-amber-400" />
                      <span>Admin Technical & Financial Breakdown — {currentMarket.countryName} ({currentCode})</span>
                    </h2>
                    <p className="text-surface-400 text-xs mt-0.5">
                      Desglose interno de pesos, fletes base SkyPostal, recargos de combustible EIA y markup comercial.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-surface-800 text-amber-400 border border-surface-700">
                    SkyPostal Engine 2026.1
                  </span>
                </div>

                <div className="p-6 space-y-6">
                  {/* Grid 1: Routing & Customs Parameters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 space-y-1">
                      <span className="block text-[10px] text-surface-400 uppercase font-bold">Tarifario Activo</span>
                      <span className="text-sm font-black text-white font-mono block">
                        {pricingQuote.rateCardCode}
                      </span>
                      <span className="text-[11px] text-surface-500">Gateway: {CONTRACTUAL_RATE_CARDS[pricingQuote.rateCardCode]?.gateway || '—'}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 space-y-1">
                      <span className="block text-[10px] text-surface-400 uppercase font-bold">Código de Servicio</span>
                      <span className="text-sm font-black text-primary-400 font-mono block">
                        Service #{pricingQuote.serviceCode}
                      </span>
                      <span className="text-[11px] text-surface-500">{pricingQuote.serviceName}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 space-y-1">
                      <span className="block text-[10px] text-surface-400 uppercase font-bold">Compliance Status</span>
                      <span className={`text-sm font-black font-mono block ${
                        complianceResult.status === 'ALLOWED' ? 'text-emerald-400' :
                        complianceResult.status === 'REGULATED' ? 'text-blue-400' :
                        complianceResult.status === 'RESTRICTED' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {complianceResult.status}
                      </span>
                      <span className="text-[11px] text-surface-500">{complianceResult.matchedRule || 'DEFAULT'}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 space-y-1">
                      <span className="block text-[10px] text-surface-400 uppercase font-bold">Documentos Requeridos</span>
                      <span className="text-xs font-bold text-white font-mono block truncate">
                        {complianceResult.requiredDocuments.join(', ') || 'NINGUNO'}
                      </span>
                      <span className="text-[11px] text-surface-500">Aduana de destino</span>
                    </div>
                  </div>

                  {/* Grid 2: Weight Analysis */}
                  <div className="p-4 rounded-xl bg-surface-950/60 border border-surface-800 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-surface-400">
                      Análisis de Peso Volumétrico vs Real
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-surface-400 text-[11px] block">Peso Real (Báscula):</span>
                        <span className="text-base font-bold text-white">{weightCalculation.actualWeightKg.toFixed(3)} kg</span>
                      </div>
                      <div>
                        <span className="text-surface-400 text-[11px] block">Peso Dimensional (Div 5000):</span>
                        <span className="text-base font-bold text-white">{weightCalculation.dimensionalWeightKg.toFixed(3)} kg</span>
                      </div>
                      <div>
                        <span className="text-surface-400 text-[11px] block">Peso Facturable Final:</span>
                        <span className="text-base font-black text-primary-400">{weightCalculation.billableWeightKg.toFixed(3)} kg</span>
                      </div>
                      <div>
                        <span className="text-surface-400 text-[11px] block">Criterio Aplicado:</span>
                        <span className="text-xs font-bold text-emerald-400">
                          {weightCalculation.isDimensional ? 'Mayor por Volumen' : 'Mayor por Peso Real'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Grid 3: Financial Pricing Pipeline Breakdown (Requirement 22) */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-surface-800 bg-surface-950/80 text-surface-400 uppercase font-semibold">
                          <th className="py-3 px-4">Componente de Coste / Precio</th>
                          <th className="py-3 px-4">Referencia / Parámetro</th>
                          <th className="py-3 px-4 text-right">Importe USD</th>
                          <th className="py-3 px-4 text-right">Impacto Financiero</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-800/60 font-mono">
                        <tr>
                          <td className="py-3 px-4 font-bold text-white">1. Tarifa Base SkyPostal</td>
                          <td className="py-3 px-4 text-surface-400">{pricingQuote.rateCardCode} ({weightCalculation.billableWeightKg.toFixed(2)} kg)</td>
                          <td className="py-3 px-4 text-right text-white">US$ {pricingQuote.pricingBreakdown.transportationChargeUsd.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-surface-400">Costo Base</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 font-bold text-white">2. Fuel Surcharge EIA</td>
                          <td className="py-3 px-4 text-surface-400">Spot ${DEFAULT_SPOT_PRICE.toFixed(2)} ({pricingQuote.pricingBreakdown.fuelAdjustmentPercent > 0 ? '+' : ''}{pricingQuote.pricingBreakdown.fuelAdjustmentPercent}%)</td>
                          <td className="py-3 px-4 text-right text-amber-400">US$ {pricingQuote.pricingBreakdown.fuelAmountUsd.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-amber-400">Ajuste Variable</td>
                        </tr>
                        <tr className="bg-surface-950/40">
                          <td className="py-3 px-4 font-bold text-white">Costo Total Estimado SkyPostal</td>
                          <td className="py-3 px-4 text-surface-400">Base + Fuel Surcharge</td>
                          <td className="py-3 px-4 text-right font-black text-white">US$ {pricingQuote.pricingBreakdown.providerCostUsd.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-surface-400">Desembolso Flete</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 font-bold text-emerald-400">3. Markup Comercial Collectibles</td>
                          <td className="py-3 px-4 text-emerald-300">{pricingQuote.pricingBreakdown.markupPercent}% sobre costo proveedor</td>
                          <td className="py-3 px-4 text-right text-emerald-400">+US$ {pricingQuote.pricingBreakdown.markupAmountUsd.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-emerald-400 font-bold">Margen Bruto Flete</td>
                        </tr>
                        <tr className="bg-primary-500/10 border-t-2 border-primary-500">
                          <td className="py-3 px-4 font-black text-white text-sm">Precio Final Cobrado al Cliente</td>
                          <td className="py-3 px-4 text-primary-300">Quote Snapshot TTL 24h</td>
                          <td className="py-3 px-4 text-right font-black text-primary-400 text-base">US$ {pricingQuote.pricingBreakdown.customerShippingPriceUsd.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-primary-300 font-bold">Ingreso Flete</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Mexico Specific Diagnostics Callout (Requirement 20) */}
                  {currentCode === 'MX' && (
                    <div className="p-4 rounded-xl bg-surface-950 border border-surface-800 space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-primary-400 font-bold">
                        <Info className="w-4 h-4" />
                        <span>Diagnóstico de Enrutamiento México (STANDARD vs REGULATED):</span>
                      </div>
                      <p className="text-surface-300 leading-relaxed">
                        • <strong>STANDARD (MX-340):</strong> Coleccionables normales ingresan por <strong>Gateway GDL (Guadalajara)</strong> con Código de Servicio <strong>1</strong>.<br />
                        • <strong>REGULATED (MX-340-R):</strong> Cosméticos, suplementos y mercancías con requisitos especiales ingresan por <strong>Gateway LRD (Laredo)</strong> con Código de Servicio <strong>502</strong>.<br />
                        • Clasificación actual para este test: <strong className="text-amber-400">{complianceResult.specialTariffCategory || 'STANDARD'}</strong>.
                      </p>
                    </div>
                  )}

                  {/* Ecuador Specific Diagnostics Callout (Requirement 18) */}
                  {currentCode === 'EC' && (
                    <div className="p-4 rounded-xl bg-surface-950 border border-surface-800 space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-primary-400 font-bold">
                        <Info className="w-4 h-4" />
                        <span>Diagnóstico de Categoría Aduanera Ecuador (4x4 vs General):</span>
                      </div>
                      <p className="text-surface-300 leading-relaxed">
                        • <strong>Categoría B (4x4):</strong> Paquetes de hasta 4.0 kg y valor FOB hasta $400 USD entran por régimen simplificado sin aranceles generales.<br />
                        • <strong>Categoría C:</strong> Paquetes mayores a 4.0 kg o valor superior a $400 USD liquidan arancel 30% CIF + FODINFA 0.5% + IVA 15% y tasa aduanera $5.00.<br />
                        • Clasificación actual para este test: <strong className="text-emerald-400">{complianceResult.specialTariffCategory || 'CATEGORY_B'}</strong>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics Modal / Drawer */}
      {showDiagnosticsDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface-900 border border-surface-700 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between bg-surface-950/80">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{currentMarket.flag}</span>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Diagnóstico Completo de Mercado — {currentMarket.countryName} ({currentCode})
                  </h3>
                  <span className="text-xs text-surface-400 font-mono">
                    Score: {diagnosticResult.passedCount}/{diagnosticResult.totalChecks} verificados ({diagnosticResult.scorePercent}%) • {diagnosticResult.overallStatus}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowDiagnosticsDrawer(false)}
                className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3">
              {diagnosticResult.checks.map((check, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 flex items-start justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{check.name}</span>
                      <span className="text-[10px] font-mono text-surface-500 uppercase">[{check.category}]</span>
                    </div>
                    <p className="text-surface-400 text-[11px] leading-relaxed">{check.detail}</p>
                    <span className="text-[10px] font-mono text-surface-500 block">Evidencia: {check.evidence}</span>
                  </div>

                  <span className={`shrink-0 px-2.5 py-1 rounded text-[10px] font-mono font-bold border ${
                    check.status === 'PASS' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800' :
                    check.status === 'WARNING' ? 'bg-amber-950/60 text-amber-300 border-amber-800' :
                    check.status === 'FAIL' ? 'bg-red-950/60 text-red-300 border-red-800' :
                    check.status === 'NOT_CONFIGURED' ? 'bg-surface-800 text-surface-400 border-surface-700' :
                    'bg-surface-900 text-surface-500 border-surface-800'
                  }`}>
                    {check.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-surface-800 bg-surface-950/80 flex items-center justify-between text-xs">
              <span className="text-surface-400 font-mono">Diagnóstico en vivo sin alteración de base de datos</span>
              <button
                onClick={() => setShowDiagnosticsDrawer(false)}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold"
              >
                Cerrar Diagnóstico
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

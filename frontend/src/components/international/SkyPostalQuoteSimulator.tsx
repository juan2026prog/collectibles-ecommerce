// frontend/src/components/international/SkyPostalQuoteSimulator.tsx

import React, { useState, useMemo } from 'react';
import {
  calculateSkyPostalQuote,
  CONTRACTUAL_RATE_CARDS,
  CONTRACTUAL_FUEL_BANDS,
  DEFAULT_SPOT_PRICE,
  DEFAULT_MARKUP_PERCENT
} from '../../lib/skypostal/skypostalPricing';
import {
  Calculator,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Clock,
  DollarSign,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  Info,
  Sliders,
  FileCheck
} from 'lucide-react';

interface SkyPostalQuoteSimulatorProps {
  countryCode: string;
  countryName: string;
  currency: string;
  isAdminMode?: boolean;
}

export default function SkyPostalQuoteSimulator({
  countryCode,
  countryName,
  currency,
  isAdminMode = false
}: SkyPostalQuoteSimulatorProps) {
  // Input states
  const [actualWeightKg, setActualWeightKg] = useState<number>(0.8);
  const [lengthCm, setLengthCm] = useState<number>(20);
  const [widthCm, setWidthCm] = useState<number>(15);
  const [heightCm, setHeightCm] = useState<number>(10);
  const [useDimensions, setUseDimensions] = useState<boolean>(true);
  const [fobValueUsd, setFobValueUsd] = useState<number>(45.0);
  const [quantity, setQuantity] = useState<number>(1);
  const [hasBattery, setHasBattery] = useState<boolean>(false);
  const [isCosmetic, setIsCosmetic] = useState<boolean>(false);
  const [isSupplement, setIsSupplement] = useState<boolean>(false);
  const [isCounterfeit, setIsCounterfeit] = useState<boolean>(false);

  // Admin tuning states
  const [spotPriceUsd, setSpotPriceUsd] = useState<number>(DEFAULT_SPOT_PRICE);
  const [markupPercent, setMarkupPercent] = useState<number>(DEFAULT_MARKUP_PERCENT);
  const [showAdminBreakdown, setShowAdminBreakdown] = useState<boolean>(isAdminMode);

  // Calculate quote dynamically
  const quote = useMemo(() => {
    return calculateSkyPostalQuote({
      countryCode,
      product: {
        title: 'Figura Coleccionable de Ejemplo',
        category: 'Toys & Collectibles',
        fobValueUsd,
        quantity,
        actualWeightKg,
        dimensions: useDimensions ? { lengthCm, widthCm, heightCm } : undefined,
        weightSource: useDimensions ? 'ESTIMATED' : 'CATALOG',
        hasBattery,
        isCosmetic,
        isSupplement,
        isCounterfeitOrReplicaBrand: isCounterfeit
      },
      options: {
        spotPriceUsd,
        markupPercentOverride: markupPercent,
        marketEnvironment: 'test'
      }
    });
  }, [
    countryCode,
    actualWeightKg,
    lengthCm,
    widthCm,
    heightCm,
    useDimensions,
    fobValueUsd,
    quantity,
    hasBattery,
    isCosmetic,
    isSupplement,
    isCounterfeit,
    spotPriceUsd,
    markupPercent
  ]);

  const getComplianceStatusBadge = (status: string) => {
    switch (status) {
      case 'ALLOWED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <ShieldCheck className="w-3.5 h-3.5" /> PERMITIDO (ALLOWED)
          </span>
        );
      case 'REGULATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/40">
            <Info className="w-3.5 h-3.5" /> REGULADO (REGULATED)
          </span>
        );
      case 'RESTRICTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <AlertTriangle className="w-3.5 h-3.5" /> RESTRINGIDO (RESTRICTED)
          </span>
        );
      case 'PROHIBITED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40">
            <XCircle className="w-3.5 h-3.5" /> PROHIBIDO (PROHIBITED)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-surface-700 text-surface-300 border border-surface-600">
            <Clock className="w-3.5 h-3.5" /> REVISIÓN MANUAL
          </span>
        );
    }
  };

  return (
    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-surface-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-500/10 text-primary-400 border border-primary-500/20">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">
              Simulador de Cotización & Compliance — SkyPostal {countryName}
            </h3>
            <p className="text-surface-400 text-xs mt-0.5">
              Tarifas contractuales 2026, cálculo dimensional (div 5000), Fuel Surcharge EIA y markup configurable.
            </p>
          </div>
        </div>

        <div>
          {getComplianceStatusBadge(quote.compliance.status)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Inputs (Left) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-primary-400" />
            <span>Parámetros del Paquete & Producto</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">
                Peso Real (kg)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="50"
                value={actualWeightKg}
                onChange={(e) => setActualWeightKg(Math.max(0.01, parseFloat(e.target.value) || 0))}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-white text-xs font-semibold focus:outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1">
                Valor FOB (USD)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="10000"
                value={fobValueUsd}
                onChange={(e) => setFobValueUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-white text-xs font-semibold focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-surface-300">Dimensiones del Paquete (cm)</span>
              <button
                type="button"
                onClick={() => setUseDimensions(!useDimensions)}
                className="text-[11px] text-primary-400 hover:text-primary-300 font-medium"
              >
                {useDimensions ? 'Desactivar Volumétrico' : 'Activar Volumétrico'}
              </button>
            </div>

            {useDimensions && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-surface-400 mb-0.5">Largo (cm)</label>
                  <input
                    type="number"
                    min="1"
                    value={lengthCm}
                    onChange={(e) => setLengthCm(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-white text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-surface-400 mb-0.5">Ancho (cm)</label>
                  <input
                    type="number"
                    min="1"
                    value={widthCm}
                    onChange={(e) => setWidthCm(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-white text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-surface-400 mb-0.5">Alto (cm)</label>
                  <input
                    type="number"
                    min="1"
                    value={heightCm}
                    onChange={(e) => setHeightCm(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-white text-xs font-semibold"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Compliance flags */}
          <div className="p-3.5 rounded-xl bg-surface-950/60 border border-surface-800 space-y-2">
            <span className="text-xs font-semibold text-surface-300 block mb-1">
              Atributos de Cumplimiento / Compliance
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 text-surface-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBattery}
                  onChange={(e) => setHasBattery(e.target.checked)}
                  className="rounded border-surface-700 text-primary-500 focus:ring-primary-500"
                />
                <span>Contiene Batería</span>
              </label>

              <label className="flex items-center gap-2 text-surface-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCosmetic}
                  onChange={(e) => setIsCosmetic(e.target.checked)}
                  className="rounded border-surface-700 text-primary-500 focus:ring-primary-500"
                />
                <span>Cosmético / Perfume</span>
              </label>

              <label className="flex items-center gap-2 text-surface-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSupplement}
                  onChange={(e) => setIsSupplement(e.target.checked)}
                  className="rounded border-surface-700 text-primary-500 focus:ring-primary-500"
                />
                <span>Suplemento / Vitamina</span>
              </label>

              <label className="flex items-center gap-2 text-surface-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCounterfeit}
                  onChange={(e) => setIsCounterfeit(e.target.checked)}
                  className="rounded border-surface-700 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-red-400">Réplica no oficial</span>
              </label>
            </div>
          </div>

          {/* Admin Tuning controls (Spot price & markup) */}
          {isAdminMode && (
            <div className="p-3.5 rounded-xl bg-primary-950/20 border border-primary-800/40 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary-400">
                <Sliders className="w-3.5 h-3.5" />
                <span>Simulador de Variables Operativas (Admin)</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[11px] text-surface-300 mb-1">
                    <span>Spot Kerosene ($/gal)</span>
                    <span className="font-mono text-primary-400">${spotPriceUsd.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.40"
                    max="4.00"
                    step="0.05"
                    value={spotPriceUsd}
                    onChange={(e) => setSpotPriceUsd(parseFloat(e.target.value))}
                    className="w-full accent-primary-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-surface-300 mb-1">
                    <span>Markup sobre Costo</span>
                    <span className="font-mono text-primary-400">+{markupPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={markupPercent}
                    onChange={(e) => setMarkupPercent(parseFloat(e.target.value))}
                    className="w-full accent-primary-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results & Breakdowns (Right) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Main Customer Shipping Price Box */}
          <div className={`p-5 rounded-2xl border transition-all ${
            quote.isEligible
              ? 'bg-gradient-to-br from-surface-800/90 to-surface-900 border-primary-500/30'
              : 'bg-red-950/20 border-red-500/40'
          }`}>
            <div className="flex items-center justify-between text-xs text-surface-400 mb-1">
              <span className="font-medium">Precio Final de Envío al Cliente</span>
              <span className="font-mono">{quote.serviceName}</span>
            </div>

            <div className="flex items-baseline gap-2">
              {quote.isEligible ? (
                <>
                  <span className="text-3xl font-black text-white">
                    US$ {quote.pricingBreakdown.customerShippingPriceUsd.toFixed(2)}
                  </span>
                  <span className="text-xs text-surface-400">
                    ({quote.currency})
                  </span>
                </>
              ) : (
                <span className="text-xl font-bold text-red-400 flex items-center gap-2">
                  <XCircle className="w-5 h-5" /> Cotización No Disponible
                </span>
              )}
            </div>

            {quote.blockReason && (
              <p className="text-xs text-red-300 mt-2 bg-red-950/40 p-2.5 rounded-lg border border-red-800/50">
                <strong>Motivo de bloqueo:</strong> {quote.blockReason}
              </p>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-surface-700/60 text-center">
              <div className="bg-surface-950/50 p-2 rounded-lg border border-surface-800">
                <span className="block text-[10px] text-surface-400 uppercase font-semibold">Peso Facturable</span>
                <span className="text-xs font-bold text-white font-mono">
                  {quote.packageDetails.billableWeightKg.toFixed(3)} kg
                </span>
                <span className="block text-[9px] text-surface-500">
                  {quote.packageDetails.isDimensional ? 'Volumétrico' : 'Peso Real'}
                </span>
              </div>

              <div className="bg-surface-950/50 p-2 rounded-lg border border-surface-800">
                <span className="block text-[10px] text-surface-400 uppercase font-semibold">Fuel Surcharge</span>
                <span className={`text-xs font-bold font-mono ${quote.pricingBreakdown.fuelAdjustmentPercent >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {quote.pricingBreakdown.fuelAdjustmentPercent > 0 ? '+' : ''}{quote.pricingBreakdown.fuelAdjustmentPercent.toFixed(1)}%
                </span>
                <span className="block text-[9px] text-surface-500">
                  {quote.pricingBreakdown.fuelAmountUsd >= 0 ? `+US$ ${quote.pricingBreakdown.fuelAmountUsd.toFixed(2)}` : `-US$ ${Math.abs(quote.pricingBreakdown.fuelAmountUsd).toFixed(2)}`}
                </span>
              </div>

              <div className="bg-surface-950/50 p-2 rounded-lg border border-surface-800">
                <span className="block text-[10px] text-surface-400 uppercase font-semibold">Documento Req.</span>
                <span className="text-xs font-bold text-primary-400 font-mono">
                  {quote.compliance.requiredDocuments.join(', ') || 'Ninguno'}
                </span>
                <span className="block text-[9px] text-surface-500">Aduana</span>
              </div>
            </div>
          </div>

          {/* Compliance Information & Warnings */}
          <div className="p-4 rounded-xl bg-surface-950/60 border border-surface-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-surface-200">
              <FileCheck className="w-4 h-4 text-primary-400" />
              <span>Diagnóstico Aduanero & Documentación</span>
            </div>
            <p className="text-xs text-surface-300">
              {quote.compliance.reason}
            </p>
            {quote.compliance.warnings.length > 0 && (
              <div className="space-y-1 pt-1">
                {quote.compliance.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-400 bg-amber-950/20 p-1.5 rounded border border-amber-900/30">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin Financial & Contractual Breakdown Accordion */}
          <div className="border border-surface-800 rounded-xl overflow-hidden bg-surface-950/40">
            <button
              type="button"
              onClick={() => setShowAdminBreakdown(!showAdminBreakdown)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-surface-300 hover:text-white bg-surface-800/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-primary-400" />
                <span>Desglose Financiero & Snapshot Interno (Admin)</span>
              </div>
              {showAdminBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdminBreakdown && (
              <div className="p-4 space-y-3 text-xs divide-y divide-surface-800">
                <div className="grid grid-cols-2 gap-2 pb-2">
                  <div>
                    <span className="text-surface-400">Tarifario Activo:</span>
                    <span className="block font-mono font-bold text-white">{quote.rateCardCode} ({quote.rateVersion})</span>
                  </div>
                  <div>
                    <span className="text-surface-400">Snapshot ID:</span>
                    <span className="block font-mono text-[11px] text-primary-400">{quote.quoteId}</span>
                  </div>
                </div>

                <div className="pt-2 space-y-1.5">
                  <div className="flex justify-between text-surface-300">
                    <span>1. Tarifa Base SkyPostal (Transporte):</span>
                    <span className="font-mono text-white">US$ {quote.pricingBreakdown.transportationChargeUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-surface-300">
                    <span>2. Fuel Surcharge ({quote.pricingBreakdown.fuelAdjustmentPercent > 0 ? '+' : ''}{quote.pricingBreakdown.fuelAdjustmentPercent.toFixed(1)}%):</span>
                    <span className={`font-mono ${quote.pricingBreakdown.fuelAmountUsd >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {quote.pricingBreakdown.fuelAmountUsd >= 0 ? `+US$ ${quote.pricingBreakdown.fuelAmountUsd.toFixed(2)}` : `-US$ ${Math.abs(quote.pricingBreakdown.fuelAmountUsd).toFixed(2)}`}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-surface-200 pt-1 border-t border-surface-800">
                    <span>Costo Proveedor SkyPostal:</span>
                    <span className="font-mono text-white">US$ {quote.pricingBreakdown.providerCostUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-primary-400">
                    <span>3. Markup Comercial Collectibles (+{quote.pricingBreakdown.markupPercent}%):</span>
                    <span className="font-mono">+US$ {quote.pricingBreakdown.markupAmountUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-400 pt-1 border-t border-surface-800 text-sm">
                    <span>Precio Final al Cliente:</span>
                    <span className="font-mono">US$ {quote.pricingBreakdown.customerShippingPriceUsd.toFixed(2)}</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-[11px] text-surface-500">
                  <span>Validez: 24 horas (TTL Snapshot)</span>
                  <span className="font-mono">Expira: {new Date(quote.expiresAt).toLocaleTimeString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { X, Package, ShieldCheck, Info, ChevronRight, CheckCircle2, AlertTriangle, ArrowRight, Scale, Clock, Sparkles } from 'lucide-react';
import { ImportCostEngine } from '../../lib/customs/ImportCostEngine';
import { getEstimatedWeightKg } from '../../lib/urubox';
import { KNOWN_COURIERS } from '../../lib/customs/CourierPricingEngine';

interface ProductUruguayCostDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  productPriceUsd: number;
  categoryName?: string;
  knownWeightKg?: number;
  productTitle?: string;
}

export const ProductUruguayCostDrawer: React.FC<ProductUruguayCostDrawerProps> = ({
  isOpen,
  onClose,
  productPriceUsd,
  categoryName,
  knownWeightKg,
  productTitle
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'single' | 'compare'>('single');
  const [selectedCourier, setSelectedCourier] = useState<'puntomio' | 'urubox' | 'mbe'>('puntomio');
  const [useFranchise, setUseFranchise] = useState<boolean>(true);

  // Retrieve weight
  const physicalWeight = (knownWeightKg && knownWeightKg > 0) 
    ? knownWeightKg 
    : getEstimatedWeightKg(categoryName);

  // Calculate landed estimate for selected courier
  const estimate = ImportCostEngine.calculateLandedCost({
    productPriceUsd,
    weightKg: physicalWeight,
    courierCode: selectedCourier,
    forceSimplifiedRegime: !useFranchise,
    exchangeRateUsdToUyu: 42.50
  });

  // Calculate all couriers for comparison
  const comparisonList = (['puntomio', 'urubox', 'mbe'] as const).map(code => {
    const res = ImportCostEngine.calculateLandedCost({
      productPriceUsd,
      weightKg: physicalWeight,
      courierCode: code,
      forceSimplifiedRegime: !useFranchise,
      exchangeRateUsdToUyu: 42.50
    });
    return {
      code,
      meta: KNOWN_COURIERS[code] || { name: code, deliveryDays: '4 a 8 días' },
      estimate: res
    };
  });

  const lowestTotalUsd = Math.min(...comparisonList.map(c => c.estimate.totalCostUsd));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div 
        className="w-full max-w-xl bg-zinc-900 border border-white/10 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🇺🇾</span>
            <div>
              <h3 className="font-bold text-sm text-white">Costo Puesto en Uruguay (Casilla USA)</h3>
              <p className="text-[11px] text-zinc-400">Producto + Flete Courier + Aduanas (Franquicia USD 200)</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 border-b border-white/10 flex gap-4 text-xs font-bold bg-zinc-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('single')}
            className={`pb-2.5 border-b-2 transition cursor-pointer ${
              activeTab === 'single'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Desglose Detallado
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('compare')}
            className={`pb-2.5 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'compare'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Scale size={13} />
            <span>Comparar 3 Couriers</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {productTitle && (
            <div className="text-xs text-zinc-300 font-semibold truncate bg-white/[0.03] p-2.5 rounded-lg border border-white/5">
              {productTitle}
            </div>
          )}

          {/* Regime Switcher */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold text-white block">¿Utilizar Franquicia de Importación?</span>
                <span className="text-[11px] text-zinc-400 block">
                  {useFranchise ? '0% aranceles aduaneros (3 por año hasta USD 200)' : 'Aplica Régimen Simplificado (60%, mín. USD 20)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setUseFranchise(!useFranchise)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  useFranchise 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                {useFranchise ? '✓ Franquicia Activa' : 'Régimen Simplificado'}
              </button>
            </div>
          </div>

          {/* TAB 1: SINGLE COURIER DETAILED */}
          {activeTab === 'single' && (
            <div className="space-y-4">
              {/* Courier Selector */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                  Seleccionar Courier de Casilla
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCourier('puntomio')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      selectedCourier === 'puntomio'
                        ? 'border-sky-500 bg-sky-500/10 text-white shadow'
                        : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">PuntoMio</div>
                    <div className="text-[10px] text-sky-400 mt-0.5">Sin handling fijo</div>
                    <div className="text-[10px] text-zinc-500">4 a 6 días</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCourier('urubox')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      selectedCourier === 'urubox'
                        ? 'border-sky-500 bg-sky-500/10 text-white shadow'
                        : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">Urubox</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">+ USD 4.90 handling</div>
                    <div className="text-[10px] text-zinc-500">5 a 8 días</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCourier('mbe')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      selectedCourier === 'mbe'
                        ? 'border-sky-500 bg-sky-500/10 text-white shadow'
                        : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">MBE Express</div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">Seguro incluido</div>
                    <div className="text-[10px] text-zinc-500">3 a 5 días</div>
                  </button>
                </div>
              </div>

              {/* Weight Information */}
              <div className="text-xs flex items-center justify-between text-zinc-400 px-1">
                <span>Peso estimado:</span>
                <strong className="text-white">{physicalWeight.toFixed(2)} kg (Sin peso volumétrico)</strong>
              </div>

              {/* Cost Breakdown */}
              <div className="bg-zinc-950/80 border border-white/10 rounded-xl p-4 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">1. Valor del Producto (Origen USA)</span>
                  <span className="font-mono text-white">USD {productPriceUsd.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">2. Flete Courier ({estimate.courier.courierName})</span>
                  <span className="font-mono text-white">USD {estimate.courier.totalCourierUsd.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">3. Tributos Aduana (DNA Uruguay)</span>
                  <span className={`font-mono ${estimate.customsEvaluation.taxUsd === 0 ? 'text-emerald-400 font-bold' : 'text-amber-400'}`}>
                    {estimate.customsEvaluation.taxUsd === 0 ? 'USD 0.00 (Exento por Franquicia)' : `USD ${estimate.customsEvaluation.taxUsd?.toFixed(2)}`}
                  </span>
                </div>

                <div className="pt-3 mt-1 border-t border-white/10 flex justify-between items-baseline">
                  <div>
                    <span className="text-sm font-black text-white block">Total Puesto en Uruguay</span>
                    <span className="text-[11px] text-zinc-500">Aprox. $ {estimate.totalCostUyu.toLocaleString('es-UY')} UYU</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-sky-400 font-mono">
                      USD {estimate.totalCostUsd.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MULTI-COURIER COMPARISON */}
          {activeTab === 'compare' && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400 flex items-center justify-between">
                <span>Comparativa para <strong>{physicalWeight.toFixed(2)} kg</strong></span>
                <span>Tasa: 42.50 UYU/USD</span>
              </div>

              <div className="space-y-2.5">
                {comparisonList.map(({ code, meta, estimate: est }) => {
                  const isLowest = est.totalCostUsd === lowestTotalUsd;
                  return (
                    <div
                      key={code}
                      onClick={() => setSelectedCourier(code)}
                      className={`p-4 rounded-2xl border transition cursor-pointer ${
                        selectedCourier === code
                          ? 'bg-sky-500/10 border-sky-500/50'
                          : 'bg-zinc-950/60 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-sm">{meta.name}</span>
                          {isLowest && (
                            <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Sparkles size={10} /> Mejor Precio
                            </span>
                          )}
                          {code === 'mbe' && (
                            <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                              ⚡ Express
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-base font-black text-white font-mono">
                            USD {est.totalCostUsd.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-zinc-400 block font-mono">
                            $ {est.totalCostUyu.toLocaleString('es-UY')} UYU
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px] pt-2 border-t border-white/5 text-zinc-400">
                        <div>
                          <span className="block text-[10px] text-zinc-500">Flete + Handling</span>
                          <span className="text-zinc-200 font-mono font-bold">USD {est.courier.totalCourierUsd.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-zinc-500">Aduana</span>
                          <span className={est.customsEvaluation.taxUsd === 0 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-mono'}>
                            {est.customsEvaluation.taxUsd === 0 ? 'Exento' : `USD ${est.customsEvaluation.taxUsd?.toFixed(2)}`}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-zinc-500">Tiempo estimado</span>
                          <span className="text-zinc-300 font-bold flex items-center gap-1">
                            <Clock size={11} /> {meta.deliveryDays}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customs Notes */}
          <div className="text-[11px] text-zinc-500 space-y-1">
            <p>• Los valores son estimaciones basadas en las tarifas vigentes de los couriers y normativas aduaneras 2026 de Uruguay.</p>
            <p>• El pago del flete courier y tributos (en caso de corresponder) se realiza directamente a la empresa de logística seleccionada.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-zinc-900/60 flex items-center justify-between gap-3">
          <a
            href={`/import-hub?tab=simulator&price=${productPriceUsd}&weight=${physicalWeight}&category=${encodeURIComponent(categoryName || '')}&title=${encodeURIComponent(productTitle || '')}`}
            className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
          >
            <span>Ver simulación completa en Import Hub</span>
            <ChevronRight size={14} />
          </a>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};


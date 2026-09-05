import React, { useState, useEffect } from 'react';
import type { 
  ImportCourier, 
  CustomsRule, 
  LandedCostSimulation, 
  ScenarioComparison, 
  UserImportDeclaration,
  CustomsRegimeType 
} from '../../plugins/collector-import-hub/types';
import { simulateLandedCost } from '../../plugins/collector-import-hub/core/landedCostEngine';
import { compareScenarios } from '../../plugins/collector-import-hub/core/scenarioComparator';
import { CourierComparatorTable } from './CourierComparatorTable';
import { 
  Calculator, 
  Sparkles, 
  Check, 
  Info, 
  Bookmark, 
  Share2, 
  AlertTriangle, 
  DollarSign, 
  Scale, 
  Layers, 
  Zap, 
  ArrowRight 
} from 'lucide-react';

interface Props {
  couriers: ImportCourier[];
  customsRule: CustomsRule;
  declarations: UserImportDeclaration[];
  initialPriceUsd?: number;
  initialWeightKg?: number;
  initialTitle?: string;
  onSaveSimulation?: (sim: LandedCostSimulation, title: string) => void;
}

export const ImportSimulator: React.FC<Props> = ({
  couriers,
  customsRule,
  declarations,
  initialPriceUsd = 85.00,
  initialWeightKg = 1.2,
  initialTitle = 'Figura Coleccionable',
  onSaveSimulation
}) => {
  const [productTitle, setProductTitle] = useState(initialTitle);
  const [priceUsd, setPriceUsd] = useState(initialPriceUsd.toString());
  const [weightKg, setWeightKg] = useState(initialWeightKg.toString());
  const [isEstimatedWeight, setIsEstimatedWeight] = useState(false);
  const [selectedCourierCode, setSelectedCourierCode] = useState<string>(couriers[0]?.code || 'USX');
  const [forceRegime, setForceRegime] = useState<CustomsRegimeType | 'AUTO'>('AUTO');
  const [hasUrsec, setHasUrsec] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (initialPriceUsd) setPriceUsd(initialPriceUsd.toString());
    if (initialWeightKg) setWeightKg(initialWeightKg.toString());
    if (initialTitle) setProductTitle(initialTitle);
  }, [initialPriceUsd, initialWeightKg, initialTitle]);

  const numPrice = parseFloat(priceUsd) || 0;
  const numWeight = parseFloat(weightKg) || 0.1;

  const currentYearDeclarations = declarations.filter(d => d.year === customsRule.year);
  const userFranchisesUsed = currentYearDeclarations.length;
  const userQuotaUsedUsd = currentYearDeclarations.reduce((acc, curr) => acc + curr.product_price_usd, 0);

  const selectedCourier = couriers.find(c => c.code === selectedCourierCode) || couriers[0];

  const simulation: LandedCostSimulation | null = selectedCourier ? simulateLandedCost(
    numPrice,
    numWeight,
    selectedCourier,
    customsRule,
    {
      userFranchisesUsed,
      userQuotaUsedUsd,
      isWeightEstimated: isEstimatedWeight,
      hasUrsecPermit: hasUrsec,
      preferredRegime: forceRegime === 'AUTO' ? undefined : forceRegime
    }
  ) : null;

  const scenarios: ScenarioComparison[] = compareScenarios(
    numPrice,
    numWeight,
    couriers,
    customsRule,
    {
      userFranchisesUsed,
      userQuotaUsedUsd,
      isWeightEstimated: isEstimatedWeight,
      hasUrsecPermit: hasUrsec
    }
  );

  const handleSave = () => {
    if (simulation && onSaveSimulation) {
      onSaveSimulation(simulation, productTitle);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    }
  };

  return (
    <div className="space-y-8">
      {/* Configuration Header / Input Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Simulador Integral de Importación</h2>
            <p className="text-xs text-slate-400">
              Calcula costo landed exacto: Flete internacional Miami-Montevideo + Impuestos Aduaneros (DNA UY 2026)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nombre / Descripción del Artículo
            </label>
            <input
              type="text"
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
              placeholder="Ej: Estatua 1/6 Spider-Man"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Precio Factura Exterior (USD) *
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="number"
                step="0.5"
                min="0"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                placeholder="85.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono font-bold"
              />
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Tope legal Franquicia: USD 200 por envío
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Peso Físico Real (kg) *
            </label>
            <div className="relative">
              <Scale className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="number"
                step="0.1"
                min="0.05"
                max="20"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="1.2"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono font-bold"
              />
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="checkbox"
                id="estWeight"
                checked={isEstimatedWeight}
                onChange={(e) => setIsEstimatedWeight(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-0"
              />
              <label htmlFor="estWeight" className="text-[11px] text-slate-400 cursor-pointer">
                Peso estimado preliminar
              </label>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Régimen Aduanero:</span>
              <select
                value={forceRegime}
                onChange={(e) => setForceRegime(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-xs text-white rounded-lg px-2.5 py-1.5 focus:border-amber-500"
              >
                <option value="AUTO">Automático (Recomendado según cupo)</option>
                <option value="FRANQUICIA">Forzar Franquicia (0% Impuesto)</option>
                <option value="SIMPLIFICADO">Forzar Régimen Simplificado (60%)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hasUrsec}
                onChange={(e) => setHasUrsec(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 text-amber-500"
              />
              <span>Requiere Permiso URSEC (Radio / WiFi / Bluetooth)</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {onSaveSimulation && simulation && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaved}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                  isSaved
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                {isSaved ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                {isSaved ? '¡Cotización Guardada!' : 'Guardar Cotización'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Simulation Result Card */}
      {simulation && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                  {simulation.customs.regime === 'FRANQUICIA' ? 'FRANQUICIA ADUANERA (0% IMPUESTO)' : 'RÉGIMEN SIMPLIFICADO (60%)'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  via {simulation.courier.courierName}
                </span>
              </div>
              <h3 className="text-2xl font-black text-white">{productTitle}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                {simulation.customs.reason}
              </p>
            </div>

            <div className="bg-slate-950/90 border border-slate-800 p-5 rounded-2xl text-right shrink-0">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Costo Final Puesto en Uruguay</div>
              <div className="text-3xl font-black text-amber-400 font-mono my-1">
                ${simulation.totalLandedCostUsd.toFixed(2)}{' '}
                <span className="text-sm font-normal text-slate-400">USD</span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Aprox. <strong>${simulation.totalLandedCostUyu.toFixed(0)} UYU</strong> (TC: {simulation.exchangeRate})
              </div>
            </div>
          </div>

          {/* Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 text-xs">
            {/* 1. Item Price */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex justify-between font-bold text-slate-300">
                <span>1. Artículo Exterior:</span>
                <span className="font-mono text-white">${simulation.productPriceUsd.toFixed(2)} USD</span>
              </div>
              <div className="text-slate-400 text-[11px] leading-relaxed">
                Precio de factura comercial pagado en la tienda de origen (Amazon, eBay, etc.).
              </div>
            </div>

            {/* 2. Courier Freight */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex justify-between font-bold text-slate-300">
                <span>2. Courier ({simulation.courier.courierCode}):</span>
                <span className="font-mono text-white">${simulation.courier.totalCourierUsd.toFixed(2)} USD</span>
              </div>
              <div className="space-y-1 text-slate-400 text-[11px]">
                <div className="flex justify-between">
                  <span>Flete ({simulation.productWeightKg.toFixed(2)} kg):</span>
                  <span className="font-mono">${simulation.courier.baseFreightUsd.toFixed(2)}</span>
                </div>
                {simulation.courier.handlingFeeUsd > 0 && (
                  <div className="flex justify-between">
                    <span>Manejo/Recepción:</span>
                    <span className="font-mono">${simulation.courier.handlingFeeUsd.toFixed(2)}</span>
                  </div>
                )}
                {simulation.courier.ursecFeeUsd > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>URSEC:</span>
                    <span className="font-mono">${simulation.courier.ursecFeeUsd.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-800 text-amber-400 font-semibold">
                  <span>Costo Efectivo / kg:</span>
                  <span className="font-mono">${simulation.courier.effectiveCostPerKgUsd.toFixed(2)}/kg</span>
                </div>
              </div>
            </div>

            {/* 3. Customs Taxes */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex justify-between font-bold text-slate-300">
                <span>3. Impuestos Aduana (DNA):</span>
                <span className={`font-mono font-bold ${simulation.customs.taxUsd === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {simulation.customs.taxUsd === 0 ? '$0.00 (Exonerado)' : `$${simulation.customs.taxUsd.toFixed(2)} USD`}
                </span>
              </div>
              <div className="text-slate-400 text-[11px] leading-relaxed">
                {simulation.customs.taxUsd === 0 ? (
                  <span>
                    Amparado bajo Franquicia Nacional. Quedarán <strong>{simulation.customs.remainingShipmentsAfter}</strong> franquicias y un saldo de <strong>${simulation.customs.remainingQuotaAfterUsd.toFixed(2)} USD</strong>.
                  </span>
                ) : (
                  <span>
                    Aplicado régimen del 60% por compras que exceden franquicia o cupo agotado.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scenario Comparisons */}
      {scenarios.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white">Comparativa de Escenarios Recomendados</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenarios.map((sc) => (
              <div
                key={sc.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                  sc.isRecommended
                    ? 'bg-amber-500/10 border-amber-500/80 shadow-lg shadow-amber-500/10'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-white uppercase">{sc.label}</span>
                    {sc.badgeText && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500 text-slate-950 rounded-full">
                        {sc.badgeText}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mb-4">{sc.description}</p>
                </div>

                <div>
                  <div className="flex justify-between items-baseline pt-3 border-t border-slate-800">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Total Landed</div>
                      <div className="text-xl font-extrabold text-white font-mono">
                        ${sc.totalCostUsd.toFixed(2)} USD
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-amber-400 uppercase font-bold">Costo/kg</div>
                      <div className="text-xs text-slate-300 font-mono">
                        ${sc.effectiveCostPerKgUsd.toFixed(2)}/kg
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Courier Comparison Table Section */}
      <CourierComparatorTable
        couriers={couriers}
        productPriceUsd={numPrice}
        weightKg={numWeight}
        hasUrsecPermit={hasUrsec}
        selectedCourierCode={selectedCourierCode}
        onSelectCourier={(code) => setSelectedCourierCode(code)}
      />
    </div>
  );
};

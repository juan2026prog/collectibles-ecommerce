import React, { useState } from 'react';
import type { ImportCourier, CourierCostBreakdown } from '../../plugins/collector-import-hub/types';
import { calculateAllCouriersCost } from '../../plugins/collector-import-hub/core/courierEngine';
import { 
  Truck, 
  Info, 
  Sparkles
} from 'lucide-react';

interface Props {
  couriers: ImportCourier[];
  productPriceUsd: number;
  weightKg: number;
  category?: string;
  hasUrsecPermit?: boolean;
  selectedCourierCode?: string;
  onSelectCourier?: (code: string) => void;
}

export const CourierComparatorTable: React.FC<Props> = ({
  couriers,
  productPriceUsd,
  weightKg,
  category = 'REGULAR',
  hasUrsecPermit = false,
  selectedCourierCode,
  onSelectCourier
}) => {
  const [activeTab, setActiveTab] = useState<'cards' | 'table'>('cards');

  const results: CourierCostBreakdown[] = calculateAllCouriersCost(
    couriers,
    weightKg,
    productPriceUsd,
    category,
    hasUrsecPermit
  );

  const bestPerKg = [...results].sort((a, b) => a.effectiveCostPerKgUsd - b.effectiveCostPerKgUsd)[0];
  const lowestTotal = [...results].sort((a, b) => a.totalCourierUsd - b.totalCourierUsd)[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">
              Tarifas & Comparador de Couriers Miami-Montevideo
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Calculado para {weightKg.toFixed(2)} kg físico • Incluye flete, handling, seguro y trámites locales
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('cards')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'cards'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Tarjetas Comparativas
          </button>
          <button
            onClick={() => setActiveTab('table')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'table'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Tabla Detallada
          </button>
        </div>
      </div>

      {activeTab === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {results.map((res) => {
            const isSelected = selectedCourierCode === res.courierCode;
            const isLowest = lowestTotal && lowestTotal.courierCode === res.courierCode;

            return (
              <div
                key={res.courierCode}
                onClick={() => onSelectCourier && onSelectCourier(res.courierCode)}
                className={`relative rounded-xl p-5 cursor-pointer transition-all border flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/10'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                        {res.courierCode}
                      </span>
                      <h4 className="font-bold text-white text-base mt-1">{res.courierName}</h4>
                    </div>

                    {isLowest && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                        <Sparkles className="w-3 h-3" /> Más Económico
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 py-3 border-y border-slate-800/80 my-3 text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>Flete Internacional:</span>
                      <span className="font-mono font-medium">${res.baseFreightUsd.toFixed(2)}</span>
                    </div>
                    {res.handlingFeeUsd > 0 && (
                      <div className="flex justify-between text-slate-400">
                        <span>Manejo/Recepción:</span>
                        <span className="font-mono">${res.handlingFeeUsd.toFixed(2)}</span>
                      </div>
                    )}
                    {res.ursecFeeUsd > 0 && (
                      <div className="flex justify-between text-amber-400/90">
                        <span>Trámite URSEC:</span>
                        <span className="font-mono">${res.ursecFeeUsd.toFixed(2)}</span>
                      </div>
                    )}
                    {res.localDeliveryFeeUsd > 0 && (
                      <div className="flex justify-between text-slate-400">
                        <span>Envío local UY:</span>
                        <span className="font-mono">${res.localDeliveryFeeUsd.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Costo Total Courier</div>
                      <div className="text-xl font-extrabold text-white font-mono">
                        ${res.totalCourierUsd.toFixed(2)}{' '}
                        <span className="text-xs font-normal text-slate-400">USD</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-amber-400">Costo Efectivo / kg</div>
                      <div className="text-sm font-bold text-amber-300 font-mono">
                        ${res.effectiveCostPerKgUsd.toFixed(2)}{' '}
                        <span className="text-[10px] font-normal text-slate-400">/kg</span>
                      </div>
                    </div>
                  </div>

                  {onSelectCourier && (
                    <button
                      type="button"
                      className={`w-full py-2 text-xs font-bold rounded-lg transition-all ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {isSelected ? '✓ Seleccionado' : 'Elegir este Courier'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Courier</th>
                <th className="py-3 px-4">Flete Base</th>
                <th className="py-3 px-4">Handling</th>
                <th className="py-3 px-4">URSEC / Seguros</th>
                <th className="py-3 px-4">Entrega Local</th>
                <th className="py-3 px-4 text-right">Costo Efectivo / kg</th>
                <th className="py-3 px-4 text-right">Total Courier USD</th>
                <th className="py-3 px-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {results.map((res) => {
                const isSelected = selectedCourierCode === res.courierCode;
                return (
                  <tr
                    key={res.courierCode}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isSelected ? 'bg-amber-500/10 font-semibold' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-bold text-white">
                      <div className="flex items-center gap-2">
                        <span>{res.courierName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({res.courierCode})</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono">${res.baseFreightUsd.toFixed(2)}</td>
                    <td className="py-3 px-4 font-mono">${res.handlingFeeUsd.toFixed(2)}</td>
                    <td className="py-3 px-4 font-mono">${(res.ursecFeeUsd + res.insuranceFeeUsd).toFixed(2)}</td>
                    <td className="py-3 px-4 font-mono">${res.localDeliveryFeeUsd.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                      ${res.effectiveCostPerKgUsd.toFixed(2)}/kg
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-base font-extrabold text-white">
                      ${res.totalCourierUsd.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {onSelectCourier && (
                        <button
                          onClick={() => onSelectCourier(res.courierCode)}
                          className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          {isSelected ? 'Activo' : 'Seleccionar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-400 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 gap-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Regla Aduanera Uruguaya:</strong> El límite legal es 20 kg de peso físico por envío franquicia.
          </span>
        </div>
        <span className="text-slate-400 text-[11px]">
          Fórmula: <code>Costo Total Courier / {weightKg.toFixed(2)} kg = Costo Efectivo/kg</code>
        </span>
      </div>
    </div>
  );
};

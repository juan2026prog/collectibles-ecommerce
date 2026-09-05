import React from 'react';
import type { UserSavedSimulation } from '../../plugins/collector-import-hub/types';
import { Bookmark, Trash2, ArrowRight, RotateCcw, ExternalLink } from 'lucide-react';

interface Props {
  simulations: UserSavedSimulation[];
  onDeleteSimulation?: (id: string) => void;
  onLoadSimulation?: (sim: UserSavedSimulation) => void;
}

export const MySimulationsSection: React.FC<Props> = ({
  simulations,
  onDeleteSimulation,
  onLoadSimulation
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
          <Bookmark className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Simulaciones Guardadas</h2>
          <p className="text-xs text-slate-400">
            Revisa o recalcula cotizaciones de importación que hayas guardado previamente.
          </p>
        </div>
      </div>

      {simulations.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
          No tienes cotizaciones guardadas. Utiliza el Simulador de Importación para guardar tus cálculos.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {simulations.map((sim) => (
            <div
              key={sim.id}
              className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-bold text-white text-sm line-clamp-1">{sim.product_title}</h4>
                  {onDeleteSimulation && (
                    <button
                      onClick={() => onDeleteSimulation(sim.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 space-y-1 mb-3 font-mono">
                  <div className="flex justify-between">
                    <span>Precio Artículo:</span>
                    <span className="text-white font-bold">${sim.product_price_usd.toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Peso Físico:</span>
                    <span>{sim.product_weight_kg.toFixed(2)} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Courier:</span>
                    <span className="text-amber-400">{sim.courier_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Régimen:</span>
                    <span className="text-slate-300">{sim.applied_regime}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80">
                <div className="flex justify-between items-baseline mb-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Puesto en UY:</span>
                  <div className="text-right font-mono">
                    <div className="text-base font-extrabold text-white">${sim.total_landed_cost_usd.toFixed(2)} USD</div>
                    <div className="text-[10px] text-slate-400">≈ ${sim.total_landed_cost_uyu.toFixed(0)} UYU</div>
                  </div>
                </div>

                {onLoadSimulation && (
                  <button
                    onClick={() => onLoadSimulation(sim)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Recalcular en Simulador
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import type { NormalizedProduct } from '../../../types/sourcing';
import type { CountryCode } from '../../../types/sourcingLatam';

interface MarketOpportunityMatrixProps {
  products: NormalizedProduct[];
  onSelectProduct?: (product: NormalizedProduct) => void;
}

const COUNTRY_COLUMNS: { code: CountryCode; label: string }[] = [
  { code: 'UY', label: 'Uruguay 🇺🇾' },
  { code: 'AR', label: 'Argentina 🇦🇷' },
  { code: 'CL', label: 'Chile 🇨🇱' },
  { code: 'BR', label: 'Brasil 🇧🇷' },
  { code: 'PE', label: 'Perú 🇵🇪' },
  { code: 'CO', label: 'Colombia 🇨🇴' },
  { code: 'MX', label: 'México 🇲🇽' },
  { code: 'PY', label: 'Paraguay 🇵🇾' },
];

export const MarketOpportunityMatrix: React.FC<MarketOpportunityMatrixProps> = ({
  products,
  onSelectProduct
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🌐</span> Matriz de Oportunidades Commercial (Producto × País)
          </h3>
          <p className="text-xs text-slate-400">
            Puntuación de oportunidad (0–100) derivada del Opportunity Engine real por mercado.
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 bg-cyan-950 text-cyan-400 border border-cyan-800 rounded-full font-mono">
          {products.length} productos analizados
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold">
              <th className="p-3">Producto / SKU</th>
              <th className="p-3 text-center">Global Score</th>
              {COUNTRY_COLUMNS.map(c => (
                <th key={c.code} className="p-3 text-center">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {products.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500 italic">
                  No hay productos cargados en la matriz LATAM.
                </td>
              </tr>
            ) : (
              products.map(prod => {
                const availability = prod.latam_availability || {};
                const globalScore = prod.global_opportunity_score ?? prod.opportunity_score ?? 50;

                return (
                  <tr
                    key={prod.id || prod.canonical_sku}
                    onClick={() => onSelectProduct?.(prod)}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={prod.image_url}
                          alt={prod.title}
                          className="w-10 h-10 object-cover rounded bg-slate-950 border border-slate-800 shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%2364748b" viewBox="0 0 24 24"><rect width="24" height="24" fill="%230f172a"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-size="8">FIG</text></svg>';
                          }}
                        />
                        <div>
                          <div className="font-semibold text-white line-clamp-1">{prod.title}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {prod.canonical_sku} • {prod.brand}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-3 text-center">
                      <span className="px-2 py-1 rounded font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                        {globalScore}/100
                      </span>
                    </td>

                    {COUNTRY_COLUMNS.map(c => {
                      const cData = availability[c.code];
                      if (!cData) {
                        return (
                          <td key={c.code} className="p-3 text-center text-slate-600 font-mono text-[10px]">
                            N/C
                          </td>
                        );
                      }

                      const opp = cData.opportunity_score;
                      let badgeColor = 'bg-slate-900 text-slate-400 border-slate-800';
                      if (opp >= 80) badgeColor = 'bg-emerald-950 text-emerald-300 border-emerald-800 font-bold';
                      else if (opp >= 60) badgeColor = 'bg-amber-950 text-amber-300 border-amber-800';
                      else if (opp > 0) badgeColor = 'bg-rose-950 text-rose-300 border-rose-800';

                      const isBest = prod.best_market_code === c.code;

                      return (
                        <td key={c.code} className="p-3 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className={`px-2 py-0.5 rounded text-xs border ${badgeColor}`}>
                              {opp}
                            </span>
                            {isBest && (
                              <span className="text-[9px] text-emerald-400 font-bold tracking-tight">★ BEST</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

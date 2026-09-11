import React, { useState } from 'react';
import type { NormalizedProduct } from '../../../types/sourcing';
import type { CountryCode } from '../../../types/sourcingLatam';
import { MarketOpportunityMatrix } from './MarketOpportunityMatrix';
import { CountryConfigPanel } from './CountryConfigPanel';
import { CountryDashboard } from './CountryDashboard';

interface GlobalSourcingBoardProps {
  products?: NormalizedProduct[];
}

export const GlobalSourcingBoard: React.FC<GlobalSourcingBoardProps> = ({
  products = []
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'country_dashboard' | 'config'>('matrix');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>('UY');

  return (
    <div className="space-y-6">
      {/* Header & Global KPIs */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-slate-100 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-cyan-400 font-bold font-mono tracking-wider uppercase">
              <span>SOURCING INTELLIGENCE</span>
              <span>›</span>
              <span>LATAM / MULTI-COUNTRY ENGINE</span>
            </div>
            <h2 className="text-2xl font-black text-white mt-1">
              Global Sourcing & Expansion LATAM
            </h2>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'matrix'
                  ? 'bg-cyan-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              📊 Matriz Cross-Market
            </button>
            <button
              onClick={() => setActiveTab('country_dashboard')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'country_dashboard'
                  ? 'bg-cyan-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              🇺🇾 Uruguay & Dashboards
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'config'
                  ? 'bg-cyan-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              ⚙️ Configuración Super Admin
            </button>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 font-medium">Mercados Activos</div>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-1">1 / 8</div>
            <div className="text-[10px] text-slate-500 mt-0.5">UY (Base)</div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 font-medium">Productos Analizados</div>
            <div className="text-xl font-bold text-white font-mono mt-1">{products.length}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Multifuente</div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 font-medium">Oportunidades LATAM</div>
            <div className="text-xl font-bold text-cyan-400 font-mono mt-1">
              {products.filter(p => (p.global_opportunity_score || 0) >= 70).length}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Score &ge; 70</div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 font-medium">Productos Publicables</div>
            <div className="text-xl font-bold text-indigo-400 font-mono mt-1">
              {products.filter(p => p.financials?.profit_usd > 0 && p.authenticity?.status === 'VERIFIED_OFFICIAL').length}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Gate Aprobado</div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 font-medium">Margen Promedio</div>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-1">18.5%</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Proyectado</div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 font-medium">Alertas / Riesgo</div>
            <div className="text-xl font-bold text-amber-400 font-mono mt-1">0</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Sin bloqueos críticos</div>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'matrix' && (
        <MarketOpportunityMatrix products={products} />
      )}

      {activeTab === 'country_dashboard' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['UY', 'AR', 'CL', 'BR'] as CountryCode[]).map(code => (
              <button
                key={code}
                onClick={() => setSelectedCountry(code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                  selectedCountry === code
                    ? 'bg-slate-800 text-cyan-400 border border-cyan-700'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                {code === 'UY' ? '🇺🇾 UY' : code === 'AR' ? '🇦🇷 AR' : code === 'CL' ? '🇨🇱 CL' : '🇧🇷 BR'}
              </button>
            ))}
          </div>
          <CountryDashboard countryCode={selectedCountry} />
        </div>
      )}

      {activeTab === 'config' && (
        <CountryConfigPanel />
      )}
    </div>
  );
};

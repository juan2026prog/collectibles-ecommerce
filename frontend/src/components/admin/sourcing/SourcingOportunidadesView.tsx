import React, { useState } from 'react';
import type { NormalizedProduct } from '../../../types/sourcing';
import { SourcingOpportunityCard } from './SourcingOpportunityCard';
import { Sparkles, TrendingUp, Filter, CheckCircle2, ArrowUpDown } from 'lucide-react';

interface SourcingOportunidadesViewProps {
  products: NormalizedProduct[];
  selectedIds: string[];
  watchlistIds: string[];
  onToggleSelectOne: (id: string) => void;
  onOpenAnalysisModal: (product: NormalizedProduct) => void;
  onImportProduct: (product: NormalizedProduct) => void;
  onPublishPreorder: (product: NormalizedProduct) => void;
  onToggleWatchlist: (product: NormalizedProduct) => void;
}

export const SourcingOportunidadesView: React.FC<SourcingOportunidadesViewProps> = ({
  products,
  selectedIds,
  watchlistIds,
  onToggleSelectOne,
  onOpenAnalysisModal,
  onImportProduct,
  onPublishPreorder,
  onToggleWatchlist
}) => {
  const [minScore, setMinScore] = useState<number>(60);
  const [sortBy, setSortBy] = useState<'score' | 'profit' | 'margin'>('score');

  const filteredOpps = products
    .filter(p => p.opportunity_score >= minScore)
    .sort((a, b) => {
      if (sortBy === 'profit') return b.financials.profit_usd - a.financials.profit_usd;
      if (sortBy === 'margin') return b.financials.margin_percent - a.financials.margin_percent;
      return b.opportunity_score - a.opportunity_score;
    });

  const highPriorityCount = products.filter(p => p.opportunity_score >= 80).length;
  const profitableCount = products.filter(p => p.financials.profit_usd > 0).length;
  const avgMargin = products.length > 0
    ? (products.reduce((acc, p) => acc + p.financials.margin_percent, 0) / products.length).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Executive Highlights Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-4 rounded-2xl shadow-sm border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Top Oportunidades</span>
          <div className="flex items-baseline justify-between mt-1">
            <strong className="text-3xl font-extrabold font-mono text-emerald-400">{highPriorityCount}</strong>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded">
              Score ≥ 80
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Productos con mayor potencial comercial inmediato</p>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-2xl shadow-sm">
          <span className="text-xs font-semibold text-gray-500 block uppercase tracking-wider">Productos Rentables</span>
          <div className="flex items-baseline justify-between mt-1">
            <strong className="text-3xl font-extrabold font-mono text-gray-900">{profitableCount}</strong>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200">
              Margen Positiva
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Lucro neta USD &gt; $0 tras landed cost UY</p>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-2xl shadow-sm">
          <span className="text-xs font-semibold text-gray-500 block uppercase tracking-wider">Margen Promedio</span>
          <div className="flex items-baseline justify-between mt-1">
            <strong className="text-3xl font-extrabold font-mono text-[#f00856]">{avgMargin}%</strong>
            <span className="text-xs bg-pink-50 text-pink-700 font-bold px-2 py-0.5 rounded border border-pink-200">
              Promedio Catálogo
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Rentabilidad ponderada de detecciones</p>
        </div>
      </div>

      {/* Opportunity Feed Controls & Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#f00856]" />
              <span>Feed Prioritario de Oportunidades Comprables</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Filtro y ordenamiento por Opportunity Score, Margen Neta y Demanda en tiempo real.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-semibold text-gray-600">Min Score:</span>
              <select
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="font-bold border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-800"
              >
                <option value={0}>Todos (≥ 0)</option>
                <option value={50}>Moderado (≥ 50)</option>
                <option value={70}>Alto (≥ 70)</option>
                <option value={80}>Top Pick (≥ 80)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-semibold text-gray-600">Ordenar por:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="font-bold border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-800"
              >
                <option value="score">Opportunity Score</option>
                <option value="profit">Utilidad USD</option>
                <option value="margin">Margen %</option>
              </select>
            </div>
          </div>
        </div>

        {/* Opportunity Grid */}
        {filteredOpps.length === 0 ? (
          <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Sparkles className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-xs font-bold text-gray-700">No hay oportunidades que cumplan el filtro actual</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Pruebe reducir el umbral de Opportunity Score.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredOpps.map(product => (
              <SourcingOpportunityCard
                key={product.id}
                product={product}
                isSelected={selectedIds.includes(product.id)}
                onToggleSelect={() => onToggleSelectOne(product.id)}
                onOpenAnalysisModal={onOpenAnalysisModal}
                onImportProduct={onImportProduct}
                onPublishPreorder={onPublishPreorder}
                onToggleWatchlist={onToggleWatchlist}
                isInWatchlist={watchlistIds.includes(product.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

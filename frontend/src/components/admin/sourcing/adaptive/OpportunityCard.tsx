import React, { useState } from 'react';
import { 
  Sparkles, TrendingUp, CheckCircle2, AlertCircle, ShoppingBag, 
  ExternalLink, ArrowRight, ShieldCheck, DollarSign, X, ChevronDown, ChevronUp 
} from 'lucide-react';
import type { SourcingOpportunity } from '../../../../types/sourcingAdaptiveTypes';

interface OpportunityCardProps {
  opportunity: SourcingOpportunity;
  onPreparePublication: (opp: SourcingOpportunity) => void;
  onDismiss: (opp: SourcingOpportunity) => void;
}

export function OpportunityCard({ opportunity, onPreparePublication, onDismiss }: OpportunityCardProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);

  const bestOffer = opportunity.source_candidates.find(o => o.source === opportunity.best_source) || opportunity.source_candidates[0];

  return (
    <div className="bg-zinc-950 border border-white/10 hover:border-indigo-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5 transition-all duration-300">
      {/* Top Header: Title & Badges */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-start gap-3 min-w-0">
          {/* Thumbnail */}
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center p-1">
            <img 
              src={opportunity.image_url} 
              alt={opportunity.title} 
              className="w-full h-full object-contain"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex-wrap">
              <span className="text-indigo-400 font-extrabold">{opportunity.franchise}</span>
              {opportunity.line && <span>· {opportunity.line}</span>}
              {opportunity.scale && <span className="text-zinc-500">· {opportunity.scale}</span>}
            </div>
            <h3 className="text-base sm:text-lg font-black text-white leading-tight truncate mt-0.5">
              {opportunity.title}
            </h3>
            <p className="text-xs text-zinc-400 font-medium">{opportunity.brand}</p>
          </div>
        </div>

        {/* Scores & Trend */}
        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          {/* Demand Score */}
          <div className="bg-zinc-900 border border-white/10 px-3 py-1.5 rounded-2xl text-center">
            <span className="text-[9px] font-extrabold uppercase text-zinc-400 block tracking-wider">Demand Score</span>
            <span className="text-lg font-black text-[#f00856]">{opportunity.demand_score}</span>
          </div>

          {/* Opportunity Score */}
          <div className="bg-indigo-950/60 border border-indigo-500/40 px-3.5 py-1.5 rounded-2xl text-center shadow-lg">
            <span className="text-[9px] font-extrabold uppercase text-indigo-300 block tracking-wider">Opportunity Score</span>
            <span className="text-xl font-black text-indigo-400">{opportunity.opportunity_score}</span>
          </div>
        </div>
      </div>

      {/* Trend Velocity Banner */}
      {opportunity.trend_velocity > 0 && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
          <TrendingUp size={14} />
          <span>Demanda +{Math.round(opportunity.trend_velocity)}% en los últimos 7 días</span>
        </div>
      )}

      {/* "¿Por qué aparece?" Reasons List */}
      <div className="space-y-2">
        <span className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <Sparkles size={13} className="text-[#f00856]" />
          <span>¿Por qué aparece esta oportunidad?</span>
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {opportunity.reason_codes.map((rc, idx) => (
            <div 
              key={idx} 
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 ${
                rc.type === 'positive' 
                  ? 'bg-zinc-900/90 border-white/10 text-zinc-200' 
                  : 'bg-red-950/30 border-red-500/30 text-red-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rc.type === 'positive' ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="font-medium truncate">{rc.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Retailers Comparison & Best Source */}
      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
          <span className="font-bold text-zinc-400 uppercase tracking-wider">Fuentes externas comparadas</span>
          <span className="text-zinc-500">Mejor fuente seleccionada: <strong className="text-emerald-400 uppercase">{opportunity.best_source}</strong></span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          {opportunity.source_candidates.map((offer, idx) => {
            const isBest = offer.source === opportunity.best_source;
            return (
              <div 
                key={idx} 
                className={`p-3 rounded-xl border space-y-1 ${
                  isBest 
                    ? 'bg-emerald-950/30 border-emerald-500/40' 
                    : 'bg-zinc-950/60 border-white/5 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-black uppercase text-white tracking-wider flex items-center gap-1">
                    {offer.source}
                    {isBest && <span className="text-[9px] font-black bg-emerald-500 text-black px-1.5 py-0.2 rounded-md">BEST</span>}
                  </span>
                  <span className="font-mono font-bold text-white">USD ${offer.price.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <span>Stock: {offer.availability}</span>
                  <span>Seller: {offer.seller_rating || 95}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Landed Cost UY & Profitability Breakdown */}
      <div className="grid grid-cols-3 gap-3 bg-zinc-900/50 border border-white/5 p-3.5 rounded-2xl text-center text-xs">
        <div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase block">Costo puesto UY</span>
          <span className="font-mono font-bold text-white text-sm">USD ${opportunity.landed_cost_usd.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase block">Precio sugerido</span>
          <span className="font-mono font-bold text-sky-400 text-sm">USD ${opportunity.suggested_sell_price_usd.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase block">Margen estimado</span>
          <span className="font-mono font-black text-emerald-400 text-sm">{opportunity.expected_margin_percent.toFixed(1)}%</span>
        </div>
      </div>

      {/* Advanced Analysis Expandable */}
      {showAnalysis && (
        <div className="bg-zinc-900/90 border border-indigo-500/20 rounded-2xl p-4 text-xs space-y-2 animate-fade-in">
          <h4 className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-indigo-400" />
            Análisis Técnico Completo
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-zinc-300">
            <div><span className="text-zinc-500 block text-[10px]">SKU Canónico:</span> <code className="text-indigo-300">{opportunity.canonical_sku}</code></div>
            <div><span className="text-zinc-500 block text-[10px]">Match Confidence:</span> <strong className="text-white">{(opportunity.match_confidence * 100).toFixed(0)}%</strong></div>
            <div><span className="text-zinc-500 block text-[10px]">Estado Rentabilidad:</span> <strong className="text-emerald-400">{opportunity.profitability_status}</strong></div>
            <div><span className="text-zinc-500 block text-[10px]">Modalidad:</span> <strong className="text-sky-400">{opportunity.availability}</strong></div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-white/5">
        <button
          type="button"
          onClick={() => setShowAnalysis(!showAnalysis)}
          className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-1 transition cursor-pointer"
        >
          {showAnalysis ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>{showAnalysis ? 'Ocultar análisis' : 'Ver análisis completo'}</span>
        </button>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => onDismiss(opportunity)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 font-bold text-xs transition cursor-pointer"
          >
            Descartar
          </button>

          <button
            type="button"
            onClick={() => onPreparePublication(opportunity)}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-[#f00856] hover:from-indigo-500 hover:to-pink-500 text-white font-black text-xs uppercase tracking-wider transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShoppingBag size={14} />
            <span>Preparar publicación</span>
          </button>
        </div>
      </div>
    </div>
  );
}

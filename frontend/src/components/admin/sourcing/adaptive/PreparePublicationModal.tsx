import React, { useState } from 'react';
import { 
  X, CheckCircle2, ShieldCheck, ShoppingBag, DollarSign, 
  ExternalLink, ArrowRight, RefreshCw, AlertTriangle 
} from 'lucide-react';
import type { SourcingOpportunity } from '../../../../types/sourcingAdaptiveTypes';

interface PreparePublicationModalProps {
  opportunity: SourcingOpportunity | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmApprove: (opp: SourcingOpportunity) => Promise<void>;
}

export function PreparePublicationModal({ opportunity, isOpen, onClose, onConfirmApprove }: PreparePublicationModalProps) {
  const [publishing, setPublishing] = useState(false);

  if (!isOpen || !opportunity) return null;

  const bestOffer = opportunity.source_candidates.find(o => o.source === opportunity.best_source) || opportunity.source_candidates[0];

  const handleConfirm = async () => {
    setPublishing(true);
    try {
      await onConfirmApprove(opportunity);
      onClose();
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-zinc-950 border border-white/15 rounded-3xl max-w-2xl w-full p-6 sm:p-7 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh] text-white">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <ShoppingBag size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Vista Previa de Publicación</h2>
              <p className="text-xs text-zinc-400">Verificá la ficha canónica e importación antes de agregar al catálogo.</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Product Identity Summary */}
        <div className="flex items-start gap-4 bg-zinc-900/80 border border-white/5 p-4 rounded-2xl">
          <div className="w-20 h-20 bg-zinc-950 rounded-xl border border-white/10 p-1 shrink-0 overflow-hidden flex items-center justify-center">
            <img src={opportunity.image_url} alt={opportunity.title} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="space-y-1 min-w-0">
            <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">
              {opportunity.franchise} · {opportunity.line || 'Figura'} · {opportunity.scale || 'Standard'}
            </span>
            <h3 className="text-base font-black text-white leading-tight truncate">{opportunity.title}</h3>
            <p className="text-xs text-zinc-400 font-medium">Fabricante: <strong>{opportunity.brand}</strong></p>
            <code className="text-[11px] font-mono text-zinc-500 block">SKU: {opportunity.canonical_sku}</code>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 space-y-0.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase block">Modalidad</span>
            <strong className="text-sky-400 font-bold block">{opportunity.availability}</strong>
          </div>
          <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 space-y-0.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase block">Fuente Elegida</span>
            <strong className="text-emerald-400 font-bold uppercase block">{opportunity.best_source}</strong>
          </div>
          <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 space-y-0.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase block">Vendedor</span>
            <strong className="text-zinc-200 font-bold block truncate">{bestOffer?.seller || 'Oficial'}</strong>
          </div>
          <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 space-y-0.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase block">Precio Origen</span>
            <strong className="text-mono text-white font-bold block">USD ${opportunity.best_source_price_usd.toFixed(2)}</strong>
          </div>
          <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 space-y-0.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase block">Costo Puesto UY</span>
            <strong className="text-mono text-white font-bold block">USD ${opportunity.landed_cost_usd.toFixed(2)}</strong>
          </div>
          <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 space-y-0.5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase block">Margen Estimado</span>
            <strong className="text-mono text-emerald-400 font-black block">{opportunity.expected_margin_percent.toFixed(1)}%</strong>
          </div>
        </div>

        {/* Sourcing Intelligence & Confidence Breakdown */}
        <div className="bg-zinc-900/70 border border-white/10 p-4 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-indigo-400" />
              Sourcing Intelligence Score & Confianza
            </span>
            <span className="text-[11px] font-mono text-indigo-300 font-bold">
              Confianza: {opportunity.confidence_score ?? Math.round((opportunity.match_confidence || 0.8) * 100)}%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-zinc-500 block uppercase font-bold">Score Determinista</span>
              <span className="text-lg font-black text-white">{opportunity.deterministic_score ?? opportunity.opportunity_score}</span>
              <span className="text-[10px] text-zinc-500 block">/ 100</span>
            </div>

            <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-zinc-500 block uppercase font-bold">Ajuste Asesor IA</span>
              <span className={`text-lg font-black ${(opportunity.ai_adjustment ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {(opportunity.ai_adjustment ?? 0) > 0 ? `+${opportunity.ai_adjustment}` : (opportunity.ai_adjustment ?? 0)}
              </span>
              <span className="text-[10px] text-zinc-500 block">[-10, +10]</span>
            </div>

            <div className="bg-zinc-950 p-2.5 rounded-xl border border-indigo-500/30 bg-indigo-950/20">
              <span className="text-[10px] text-indigo-300 block uppercase font-bold">Score Final</span>
              <span className="text-lg font-black text-indigo-400">{opportunity.opportunity_score}</span>
              <span className="text-[10px] text-indigo-300/70 block">/ 100</span>
            </div>
          </div>

          {/* Reason Codes */}
          {opportunity.reason_codes && opportunity.reason_codes.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase block">Factores y Señales Detectadas:</span>
              <div className="flex flex-wrap gap-1.5">
                {opportunity.reason_codes.map((rc, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      rc.type === 'positive'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {rc.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Alternate Sources */}
        {opportunity.source_candidates.length > 1 && (
          <div className="space-y-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Fuentes Alternativas</span>
            <div className="space-y-1 text-xs">
              {opportunity.source_candidates.map((alt, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-zinc-900 border border-white/5 text-zinc-300">
                  <span className="font-bold uppercase">{alt.source} — {alt.seller}</span>
                  <span className="font-mono">USD ${alt.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirmation Footer */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={publishing}
            className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 font-bold text-xs transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={publishing}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {publishing ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            <span>{publishing ? 'Publicando...' : 'Confirmar e Incorporar al Catálogo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

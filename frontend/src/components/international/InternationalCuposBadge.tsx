import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle2, Clock, AlertCircle, Sparkles } from 'lucide-react';

interface CapacitySummary {
  operating_limit_usd: number;
  safety_reserve_usd: number;
  usable_limit_usd: number;
  active_reserved_usd: number;
  committed_usd: number;
  spent_usd: number;
  available_capacity_usd: number;
  percent_available: number;
  capacity_enabled: boolean;
  purchases_enabled: boolean;
  status_label: 'AVAILABLE' | 'LOW' | 'FULL' | 'PAUSED';
}

interface InternationalCuposBadgeProps {
  productCostUsd?: number;
  className?: string;
  showCta?: boolean;
  onOpenWaitlist?: () => void;
}

export default function InternationalCuposBadge({
  productCostUsd,
  className = '',
  showCta = true,
  onOpenWaitlist
}: InternationalCuposBadgeProps) {
  const [summary, setSummary] = useState<CapacitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function fetchCapacity() {
      try {
        const { data, error } = await supabase.rpc('get_international_capacity_summary');
        if (!error && data && isMounted) {
          setSummary(data as CapacitySummary);
        }
      } catch (err) {
        console.warn('Error fetching international capacity summary:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchCapacity();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-slate-800/60 text-slate-400 border border-slate-700/50 animate-pulse ${className}`}>
        <Sparkles className="w-3 h-3 text-slate-400" />
        <span>Consultando cupos...</span>
      </div>
    );
  }

  // Determine effective status for this product
  let effectiveStatus: 'AVAILABLE' | 'LOW' | 'FULL' | 'PAUSED' = summary?.status_label || 'AVAILABLE';
  if (summary && !summary.purchases_enabled) {
    effectiveStatus = 'PAUSED';
  } else if (summary && productCostUsd && summary.available_capacity_usd < productCostUsd) {
    effectiveStatus = 'FULL';
  }

  if (effectiveStatus === 'PAUSED') {
    return (
      <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2.5 rounded-xl bg-neutral-900/90 border border-neutral-700/80 text-xs text-neutral-300 ${className}`}>
        <div className="flex items-center gap-1.5 font-semibold text-amber-400">
          <Clock className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Compras internacionales temporalmente pausadas</span>
        </div>
        {showCta && onOpenWaitlist && (
          <button
            type="button"
            onClick={onOpenWaitlist}
            className="text-[11px] font-bold text-primary-400 hover:text-primary-300 underline cursor-pointer ml-auto"
          >
            Avisarme cuando vuelva
          </button>
        )}
      </div>
    );
  }

  if (effectiveStatus === 'FULL') {
    return (
      <div className={`p-3 rounded-xl bg-red-950/30 border border-red-500/30 text-xs space-y-1.5 ${className}`}>
        <div className="flex items-center gap-1.5 font-bold text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>Cupos internacionales temporalmente completos</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          La compra inmediata de este producto importado no está disponible en este momento. Podés pedir que te avisemos en cuanto se habiliten nuevos cupos.
        </p>
        {showCta && onOpenWaitlist && (
          <button
            type="button"
            onClick={onOpenWaitlist}
            className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Avisarme cuando haya cupo
          </button>
        )}
      </div>
    );
  }

  if (effectiveStatus === 'LOW') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-sm ${className}`}>
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
        <span>Alta demanda · Pocos cupos disponibles</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 ${className}`}>
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
      <span>Compra internacional disponible</span>
    </div>
  );
}

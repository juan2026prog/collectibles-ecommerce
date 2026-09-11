import React from 'react';
import { 
  Sparkles, TrendingUp, CheckCircle2, AlertCircle, Clock, 
  ShieldCheck, Power, Search, Filter, Layers, Zap 
} from 'lucide-react';
import type { AdaptiveSettings } from '../../../../types/sourcingAdaptiveTypes';

interface AdaptiveDashboardProps {
  stats: {
    activeCount: number;
    highDemandCount: number;
    readyForReviewCount: number;
    noSourceCount: number;
    new24hCount: number;
  };
  settings: AdaptiveSettings;
  onToggleKillSwitch: (enabled: boolean) => void;
  onRefresh: () => void;
}

export function AdaptiveSourcingDashboard({ stats, settings, onToggleKillSwitch, onRefresh }: AdaptiveDashboardProps) {
  return (
    <div className="space-y-4">
      {/* Top Banner / Explanation */}
      <div className="bg-gradient-to-r from-indigo-900/90 via-purple-950/80 to-[#f00856]/20 border border-indigo-500/30 rounded-2xl p-5 sm:p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f00856]/20 border border-[#f00856]/40 text-[#f00856] text-xs font-black uppercase tracking-wider">
              <Sparkles size={13} className="animate-pulse" />
              <span>ADAPTIVE SOURCING — DEMAND-DRIVEN CATALOG</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Detectamos productos que tus usuarios están buscando y todavía no tenés publicados.
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 font-medium leading-relaxed">
              Collectibles no espera únicamente que un administrador encuentre productos. Sourcing Intelligence descubre qué productos debería tener la tienda.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* Kill Switch Toggle */}
            <button
              type="button"
              onClick={() => onToggleKillSwitch(!settings.enabled)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer shadow-lg border ${
                settings.enabled
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                  : 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border-red-500/40 animate-pulse'
              }`}
            >
              <Power size={15} />
              <span>{settings.enabled ? 'SISTEMA ACTIVO' : 'KILL SWITCH ACTIVADO'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Oportunidades activas</span>
            <Layers size={16} className="text-indigo-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white">{stats.activeCount}</p>
          <span className="text-[10px] text-zinc-500 font-medium">Detectadas por el motor</span>
        </div>

        <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Demanda alta</span>
            <TrendingUp size={16} className="text-emerald-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-400">{stats.highDemandCount}</p>
          <span className="text-[10px] text-zinc-500 font-medium">Demand Score ≥ 75</span>
        </div>

        <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Listas para revisar</span>
            <CheckCircle2 size={16} className="text-sky-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-sky-400">{stats.readyForReviewCount}</p>
          <span className="text-[10px] text-zinc-500 font-medium">Listas para publicar</span>
        </div>

        <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Sin fuente válida</span>
            <AlertCircle size={16} className="text-amber-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-400">{stats.noSourceCount}</p>
          <span className="text-[10px] text-zinc-500 font-medium">Requiere reintento</span>
        </div>

        <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Nuevas últimas 24h</span>
            <Zap size={16} className="text-[#f00856]" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-[#f00856]">{stats.new24hCount}</p>
          <span className="text-[10px] text-zinc-500 font-medium">Captura reciente</span>
        </div>
      </div>
    </div>
  );
}

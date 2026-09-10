import React from 'react';
import { 
  CheckCircle2, AlertTriangle, RefreshCw, ShoppingCart, 
  Layers, PauseCircle, Clock, ShieldCheck, Activity
} from 'lucide-react';
import type { AutopilotSettings } from '../../../../types/sourcingAutopilot';

interface AutopilotDashboardProps {
  settings: AutopilotSettings;
  kpis: {
    discoveredToday: number;
    publishedCount: number;
    watchingCount: number;
    discardedCount: number;
    priceUpdatesCount: number;
    sourceSwitchesCount: number;
    pausedCount: number;
    autoPurchasesCount: number;
    pendingApprovalCount: number;
    errorsCount: number;
  };
}

export const AutopilotDashboard: React.FC<AutopilotDashboardProps> = ({ settings, kpis }) => {
  return (
    <div className="space-y-6 mb-8">
      {/* Real KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Oportunidades Hoy</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-extrabold text-white mt-2">{kpis.discoveredToday}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Detectadas por Sourcing</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Publicadas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-400 mt-2">{kpis.publishedCount}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Catálogo Internacional</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>En Vigilancia</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-amber-400 mt-2">{kpis.watchingCount}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Monitoreo dinámico</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Reajustes Precio</span>
            <RefreshCw className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-extrabold text-indigo-300 mt-2">{kpis.priceUpdatesCount}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Cambios en origen</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Cambios Fuente</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-extrabold text-cyan-300 mt-2">{kpis.sourceSwitchesCount}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Source Switching</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Publicaciones Pausadas</span>
            <PauseCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-extrabold text-rose-400 mt-2">{kpis.pausedCount}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Protección o stock 0</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Compras Automáticas</span>
            <ShoppingCart className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-extrabold text-purple-300 mt-2">{kpis.autoPurchasesCount}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Procesadas vía Provider</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Pendientes Aprobación</span>
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
          </div>
          <p className="text-2xl font-extrabold text-yellow-400 mt-2">{kpis.pendingApprovalCount}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">Modo semiautomático</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl col-span-2 md:col-span-2 lg:col-span-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Estado de Integraciones Retailer</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="bg-slate-800/60 p-2 rounded text-center">
              <span className="text-[10px] text-slate-400 block">Amazon</span>
              <span className="text-xs font-bold text-emerald-400">LIVE</span>
            </div>
            <div className="bg-slate-800/60 p-2 rounded text-center">
              <span className="text-[10px] text-slate-400 block">eBay</span>
              <span className="text-xs font-bold text-emerald-400">LIVE</span>
            </div>
            <div className="bg-slate-800/60 p-2 rounded text-center">
              <span className="text-[10px] text-slate-400 block">Best Buy</span>
              <span className="text-xs font-bold text-emerald-400">LIVE</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

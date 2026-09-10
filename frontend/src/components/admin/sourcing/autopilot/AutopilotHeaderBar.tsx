import React from 'react';
import { 
  Bot, ShieldAlert, Play, Pause, Zap, CheckCircle2, AlertOctagon, 
  Settings2, Eye
} from 'lucide-react';
import type { 
  AutopilotSettings, 
  AutopilotMode 
} from '../../../../types/sourcingAutopilot';

interface AutopilotHeaderBarProps {
  settings: AutopilotSettings;
  onUpdateSettings: (newSettings: Partial<AutopilotSettings>) => void;
  onEngageKillSwitch: () => void;
  onResetKillSwitch: () => void;
  onOpenDryRun: () => void;
}

export const AutopilotHeaderBar: React.FC<AutopilotHeaderBarProps> = ({
  settings,
  onUpdateSettings,
  onEngageKillSwitch,
  onResetKillSwitch,
  onOpenDryRun
}) => {
  const isOff = settings.mode === 'OFF';
  const isKillSwitchActive = settings.is_kill_switch_active;

  const handleModeChange = (mode: AutopilotMode) => {
    let visual_status: AutopilotSettings['visual_status'] = 'OFF';
    if (mode === 'AUTOPILOT') visual_status = 'ACTIVE';
    if (mode === 'SEMIAUTOMATIC' || mode === 'RECOMMENDATION') visual_status = 'ACTIVE';
    onUpdateSettings({ mode, visual_status });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 text-white shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Title & Visual Status Banner */}
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${
            isKillSwitchActive 
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse' 
              : isOff 
              ? 'bg-slate-800 text-slate-400 border border-slate-700' 
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}>
            <Bot className="w-7 h-7" />
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight">AUTOPILOT SOURCING</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                isKillSwitchActive
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : isOff
                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                {isKillSwitchActive ? 'SUSPENDIDO (KILL SWITCH)' : (isOff ? 'DESACTIVADO' : 'ACTIVO')}
              </span>
            </div>

            <p className="text-sm text-slate-400 mt-1">
              {isOff ? (
                'Sourcing analiza oportunidades sin ejecutar acciones automáticas.'
              ) : (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
                  <span>Modo: <strong className="text-amber-400">{settings.mode}</strong></span>
                  <span>·</span>
                  <span>Publicación automática: <strong className={settings.auto_publish ? 'text-emerald-400' : 'text-slate-400'}>{settings.auto_publish ? 'ON' : 'OFF'}</strong></span>
                  <span>·</span>
                  <span>Actualización: <strong className={settings.auto_update_prices ? 'text-emerald-400' : 'text-slate-400'}>{settings.auto_update_prices ? 'ON' : 'OFF'}</strong></span>
                  <span>·</span>
                  <span>Compra automática: <strong className={settings.auto_purchase ? 'text-rose-400' : 'text-slate-400'}>{settings.auto_purchase ? 'ON' : 'OFF'}</strong></span>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Global Mode Switch Buttons & Quick Actions */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Dry Run Button */}
          <button
            onClick={onOpenDryRun}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 text-xs font-semibold transition"
          >
            <Eye className="w-4 h-4" />
            SIMULACIÓN (DRY RUN)
          </button>

          {/* Mode Selector Buttons */}
          <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex items-center gap-1">
            <button
              onClick={() => handleModeChange('OFF')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                settings.mode === 'OFF'
                  ? 'bg-slate-700 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              OFF
            </button>
            <button
              onClick={() => handleModeChange('RECOMMENDATION')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                settings.mode === 'RECOMMENDATION'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Recomendaciones
            </button>
            <button
              onClick={() => handleModeChange('SEMIAUTOMATIC')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                settings.mode === 'SEMIAUTOMATIC'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Semiautomático
            </button>
            <button
              onClick={() => handleModeChange('AUTOPILOT')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                settings.mode === 'AUTOPILOT'
                  ? 'bg-emerald-600 text-white shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              AUTOPILOT
            </button>
          </div>

          {/* Emergency Kill Switch Button */}
          {isKillSwitchActive ? (
            <button
              onClick={onResetKillSwitch}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 shadow-lg transition"
            >
              <Play className="w-4 h-4" />
              REARMAR AUTOPILOT
            </button>
          ) : (
            <button
              onClick={onEngageKillSwitch}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg transition"
            >
              <AlertOctagon className="w-4 h-4" />
              STOP AUTOPILOT
            </button>
          )}

        </div>

      </div>
    </div>
  );
};

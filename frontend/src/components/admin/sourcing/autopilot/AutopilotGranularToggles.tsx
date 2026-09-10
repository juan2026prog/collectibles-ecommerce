import React from 'react';
import { Sliders, Shield, Lock, Power } from 'lucide-react';
import type { AutopilotSettings } from '../../../../types/sourcingAutopilot';

interface AutopilotGranularTogglesProps {
  settings: AutopilotSettings;
  onToggle: (key: keyof AutopilotSettings, value: boolean) => void;
}

export const AutopilotGranularToggles: React.FC<AutopilotGranularTogglesProps> = ({ settings, onToggle }) => {
  const toggleItems: { key: keyof AutopilotSettings; label: string; description: string; critical?: boolean }[] = [
    { key: 'discover_products', label: 'Descubrir productos', description: 'Permite buscar y capturar nuevas oportunidades en fuentes externas.' },
    { key: 'evaluate_opportunities', label: 'Evaluar oportunidades', description: 'Ejecuta el Policy Engine y asigna Opportunity Scores.' },
    { key: 'prepare_publications', label: 'Preparar publicaciones', description: 'Genera borradores y payloads de publicación normalizados.' },
    { key: 'auto_publish', label: 'Publicar automáticamente', description: 'Publica productos válidos directamente sin confirmación manual.' },
    { key: 'auto_update_prices', label: 'Actualizar precios', description: 'Ajusta precios de venta al fluctuar costos en origen.' },
    { key: 'auto_update_stock', label: 'Actualizar stock', description: 'Sincroniza stock disponible con retailers de origen.' },
    { key: 'auto_pause_publications', label: 'Pausar publicaciones', description: 'Pausa productos agotados o con margen insostenible.' },
    { key: 'auto_reactivate_publications', label: 'Reactivar publicaciones', description: 'Reactiva productos al recuperar stock o viabilidad.' },
    { key: 'auto_purchase', label: 'Comprar automáticamente', description: 'Nivel sensible: Ejecuta compras en retailer al vender.', critical: true },
    { key: 'send_to_import_hub', label: 'Enviar a Import Hub', description: 'Conecta compras con casillas y franquicias aduaneras UY.' }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4 text-white font-bold">
        <Sliders className="w-5 h-5 text-amber-400" />
        <h3>PERMISOS E INTERRUPTORES GRANULARES</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {toggleItems.map(item => {
          const isChecked = Boolean(settings[item.key]);
          return (
            <div 
              key={item.key}
              className={`flex items-start justify-between p-3.5 rounded-lg border transition ${
                item.critical 
                  ? (isChecked ? 'bg-rose-950/30 border-rose-800/50' : 'bg-slate-800/40 border-slate-800')
                  : (isChecked ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-950/40 border-slate-800/60')
              }`}
            >
              <div className="pr-3">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${item.critical ? 'text-rose-300' : 'text-slate-200'}`}>
                    {item.label}
                  </span>
                  {item.critical && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      SENSIBLE
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
              </div>

              <button
                type="button"
                onClick={() => onToggle(item.key, !isChecked)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isChecked ? (item.critical ? 'bg-rose-600' : 'bg-emerald-600') : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isChecked ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

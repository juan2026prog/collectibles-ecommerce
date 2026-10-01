import React, { useState } from 'react';
import { 
  Bot, ShieldCheck, Lock, Activity, Server, DollarSign, 
  Cpu, Database, AlertTriangle, CheckCircle2, Globe, Sparkles
} from 'lucide-react';
import { SourcingConnectionStatus } from './SourcingConnectionStatus';
import { CountryDashboard } from './CountryDashboard';

interface SourcingControlAutomationViewProps {
  country: string;
}

export const SourcingControlAutomationView: React.FC<SourcingControlAutomationViewProps> = ({
  country
}) => {
  const [controls, setControls] = useState({
    research: true,
    automaticDiscovery: true,
    trendDetection: true,
    productDiscovery: true,
    opportunityScoring: true,
    autoPublish: false, // Locked OFF
    autoPurchase: false // Locked OFF
  });

  const handleToggle = (key: keyof typeof controls) => {
    if (key === 'autoPublish' || key === 'autoPurchase') return; // Enforce locked policy
    setControls(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {/* SWITCHES DE CONTROL DE AUTOMATIZACIÓN */}
      <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-slate-900 text-white">
              <Bot className="w-5 h-5 text-emerald-400" />
            </span>
            <div>
              <h3 className="text-base font-black text-gray-900 tracking-tight">
                Gobernanza & Políticas de Automatización
              </h3>
              <p className="text-xs text-gray-500">
                Control de motores de investigación, descubrimiento y barreras de seguridad.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { key: 'research', label: 'Research Intelligence', desc: 'Búsquedas y análisis con IA', state: controls.research, locked: false },
            { key: 'automaticDiscovery', label: 'Automatic Discovery', desc: 'Escaneo autónomo de lanzamientos', state: controls.automaticDiscovery, locked: false },
            { key: 'trendDetection', label: 'Trend Detection', desc: 'Cálculo de tendencias y demanda', state: controls.trendDetection, locked: false },
            { key: 'productDiscovery', label: 'Product Discovery', desc: 'Matching y canonicalización', state: controls.productDiscovery, locked: false },
            { key: 'opportunityScoring', label: 'Opportunity Scoring', desc: 'Scoring determinístico 7 componentes', state: controls.opportunityScoring, locked: false },
            { key: 'autoPublish', label: 'Auto Publish', desc: 'Publicación sin intervención humana', state: controls.autoPublish, locked: true },
            { key: 'autoPurchase', label: 'Auto Purchase', desc: 'Compra autónoma en retailers', state: controls.autoPurchase, locked: true }
          ].map(ctrl => (
            <div
              key={ctrl.key}
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                ctrl.locked 
                  ? 'bg-slate-50/80 border-slate-200' 
                  : 'bg-white border-gray-200 shadow-2xs'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-gray-900">{ctrl.label}</span>
                  {ctrl.locked && (
                    <span className="text-[9px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" /> BLOQUEADO
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-500">{ctrl.desc}</p>
              </div>

              <button
                onClick={() => handleToggle(ctrl.key as any)}
                disabled={ctrl.locked}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  ctrl.state ? 'bg-emerald-500 justify-end' : 'bg-gray-300 justify-start'
                } ${ctrl.locked ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <span className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Seguridad Comercial:</strong> AUTO PUBLISH y AUTO PURCHASE se mantienen estrictamente en <strong>OFF</strong>. El sistema descubre, investiga, cruza y recomienda; el administrador revisa y decide.
          </span>
        </div>
      </div>

      {/* TELEMETRÍA Y COSTOS OPENAI (ÚNICO GATEWAY) */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-pink-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              OpenAI Gateway Único & Telemetría
            </h3>
          </div>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
            Gateway Centralizado Activo
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Ruta Oficial</span>
            <strong className="text-white text-xs mt-1 block truncate">/api/ai-execute</strong>
          </div>
          <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Circuit Breaker</span>
            <strong className="text-emerald-400 text-xs mt-1 block">CLOSED (Operativo)</strong>
          </div>
          <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Presupuesto Diario</span>
            <strong className="text-white text-xs mt-1 block">$10.00 USD / día</strong>
          </div>
          <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Fingerprint Cache</span>
            <strong className="text-pink-400 text-xs mt-1 block">TTL 2h (Zero Cost)</strong>
          </div>
        </div>
      </div>

      {/* ESTADO DE CONEXIONES Y SERVICIOS */}
      <SourcingConnectionStatus
        onRefresh={() => {}}
      />
    </div>
  );
};

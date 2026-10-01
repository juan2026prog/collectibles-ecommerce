import React from 'react';
import { 
  X, HelpCircle, CheckCircle2, ShieldAlert, Sparkles, 
  ExternalLink, Layers, TrendingUp, DollarSign, Database
} from 'lucide-react';
import type { SourcingProductCandidate } from '../../types/sourcingIntelligence';

interface WhyExplainabilityModalProps {
  candidate: SourcingProductCandidate | null;
  isOpen: boolean;
  onClose: () => void;
  onSendToImport: (candidate: SourcingProductCandidate) => void;
}

export const WhyExplainabilityModal: React.FC<WhyExplainabilityModalProps> = ({
  candidate,
  isOpen,
  onClose,
  onSendToImport
}) => {
  if (!isOpen || !candidate) return null;

  const why = candidate.why_explanation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
        
        {/* CABECERA */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#f00856] text-white shadow-xs">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">
                ¿Por qué Collectibles recomienda este producto?
              </h3>
              <p className="text-xs text-slate-400">
                Auditoría y desglose de evidencia explicable ({candidate.country_code})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENIDO SCROLLEABLE */}
        <div className="p-6 overflow-y-auto space-y-5 text-gray-800">
          
          {/* RESUMEN DE PRODUCTO */}
          <div className="flex gap-4 items-center bg-gray-50 border border-gray-200/80 p-4 rounded-2xl">
            <img
              src={candidate.image_url}
              alt={candidate.title}
              className="w-16 h-16 object-contain bg-white rounded-xl p-1 border border-gray-200 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-black uppercase text-[#f00856] tracking-wider">
                {candidate.brand} · {candidate.franchise}
              </span>
              <h4 className="text-sm font-bold text-gray-900 truncate mt-0.5">
                {candidate.title}
              </h4>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                <span>Estado: <strong className="text-gray-900">{candidate.status}</strong></span>
                <span>Origen: <strong className="text-gray-900">{candidate.retailer_source.toUpperCase()}</strong></span>
                <span>Descubierto: <strong className="text-purple-700">{candidate.discovered_from}</strong></span>
              </div>
            </div>
          </div>

          {/* DRIVERS Y EXPLICACIÓN DATA-DRIVEN */}
          <div className="space-y-2">
            <h5 className="text-xs font-black uppercase tracking-wider text-gray-400">
              Pilares de la recomendación:
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                <span className="text-[11px] font-extrabold text-emerald-800 uppercase flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Demanda & Mercado ({candidate.country_code})</span>
                </span>
                <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                  {why.local_demand_summary}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-1">
                <span className="text-[11px] font-extrabold text-blue-800 uppercase flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Diferencial de Precios</span>
                </span>
                <p className="text-xs text-blue-950 font-medium leading-relaxed">
                  {why.market_differential}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1">
                <span className="text-[11px] font-extrabold text-amber-800 uppercase flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Disponibilidad & Stock</span>
                </span>
                <p className="text-xs text-amber-950 font-medium leading-relaxed">
                  {why.stock_verdict}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-1">
                <span className="text-[11px] font-extrabold text-purple-800 uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Señales Internas Collectibles</span>
                </span>
                <p className="text-xs text-purple-950 font-medium leading-relaxed">
                  {why.internal_signals}
                </p>
              </div>
            </div>
          </div>

          {/* TABLA DE EVIDENCIAS Y FUENTES AUDITADAS */}
          <div className="space-y-2">
            <h5 className="text-xs font-black uppercase tracking-wider text-gray-400">
              Fuentes y Evidencias Observables:
            </h5>
            <div className="border border-gray-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold">
                  <tr>
                    <th className="p-2.5 pl-3">Fuente</th>
                    <th className="p-2.5">Tipo</th>
                    <th className="p-2.5">Confianza</th>
                    <th className="p-2.5 pr-3">Fecha de Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {why.evidence_sources.map((ev, i) => (
                    <tr key={i} className="hover:bg-gray-50/80">
                      <td className="p-2.5 pl-3 font-bold text-gray-900">{ev.name}</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[10px] font-bold">
                          {ev.type}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <span className="text-emerald-600 font-bold">{ev.confidence}%</span>
                      </td>
                      <td className="p-2.5 pr-3 text-gray-400 text-[11px]">
                        {new Date(ev.date).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-center gap-2.5 text-[11px] text-gray-500">
            <Database className="w-4 h-4 text-gray-400 shrink-0" />
            <span>
              <strong>Gobernanza de Datos:</strong> Todas las métricas numéricas y costos son calculados determinísticamente por el motor de Collectibles. OpenAI se utiliza únicamente para sintetizar explicaciones sobre evidencia real.
            </span>
          </div>
        </div>

        {/* PIE DEL MODAL */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-white transition cursor-pointer"
          >
            Cerrar
          </button>

          <button
            onClick={() => {
              onSendToImport(candidate);
              onClose();
            }}
            className="px-5 py-2 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-black rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <span>Enviar a Productos para Importar</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

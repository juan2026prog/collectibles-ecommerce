import React from 'react';
import { Eye, CheckCircle2, AlertTriangle, XCircle, ShoppingCart } from 'lucide-react';
import type { DryRunReport } from '../../../../types/sourcingAutopilot';

interface AutopilotDryRunModalProps {
  report: DryRunReport | null;
  onClose: () => void;
}

export const AutopilotDryRunModal: React.FC<AutopilotDryRunModalProps> = ({ report, onClose }) => {
  if (!report) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-3xl w-full text-white shadow-2xl max-h-[90vh] flex flex-col">
        
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Eye className="w-6 h-6 text-indigo-400" />
            <div>
              <h3 className="text-lg font-bold">INFORME DE SIMULACIÓN (DRY RUN)</h3>
              <p className="text-xs text-slate-400">Ejecución del motor sin aplicar cambios externos reales.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white font-bold text-lg">✕</button>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Evaluados</span>
            <span className="text-xl font-bold">{report.discoveredCount}</span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Se habrían publicado</span>
            <span className="text-xl font-bold text-emerald-400">{report.publishedCount}</span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Requerirían Aprobación</span>
            <span className="text-xl font-bold text-amber-400">{report.approvalRequiredCount}</span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Gasto Auto Est.</span>
            <span className="text-xl font-bold text-purple-300">${report.estimatedAutoPurchaseUsd} USD</span>
          </div>
        </div>

        {/* List of Simulated Candidates */}
        <div className="overflow-y-auto flex-1 pr-2 space-y-2">
          {report.candidates.map((cand, idx) => (
            <div key={idx} className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white">{cand.productTitle}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  cand.decision === 'PUBLICAR' ? 'bg-emerald-500/20 text-emerald-300' :
                  cand.decision === 'VIGILAR' ? 'bg-amber-500/20 text-amber-300' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {cand.decision}
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">{cand.reason}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
};

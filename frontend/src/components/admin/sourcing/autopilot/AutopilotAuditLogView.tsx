import React, { useState } from 'react';
import { History, Eye, Info, CheckCircle2, AlertOctagon, Filter } from 'lucide-react';
import type { AutopilotAuditEntry } from '../../../../types/sourcingAutopilot';

interface AutopilotAuditLogViewProps {
  entries: AutopilotAuditEntry[];
}

export const AutopilotAuditLogView: React.FC<AutopilotAuditLogViewProps> = ({ entries }) => {
  const [selectedEntry, setSelectedEntry] = useState<AutopilotAuditEntry | null>(null);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-white font-bold">
          <History className="w-5 h-5 text-cyan-400" />
          <h3>HISTORIAL DE AUDITORÍA (AUDIT LOG INMUTABLE)</h3>
        </div>
        <span className="text-xs text-slate-400">Total registros: {entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">
          No hay registros de auditoría almacenados.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[10px]">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Acción</th>
                <th className="p-3">Producto / SKU</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Modo</th>
                <th className="p-3">Resultado</th>
                <th className="p-3">Razón / Explicabilidad</th>
                <th className="p-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {entries.map(entry => (
                <tr key={entry.id} className="hover:bg-slate-800/40">
                  <td className="p-3 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3 font-semibold text-white uppercase">{entry.action}</td>
                  <td className="p-3 font-mono text-[11px] text-amber-400">{entry.product_id || 'N/A'}</td>
                  <td className="p-3 font-bold text-slate-300">{entry.actor}</td>
                  <td className="p-3 text-slate-400">{entry.mode}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      entry.result === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-300' :
                      entry.result === 'BLOCKED' ? 'bg-rose-500/20 text-rose-300' :
                      entry.result === 'SKIPPED' ? 'bg-slate-800 text-slate-400' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>
                      {entry.result}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300 max-w-[280px] truncate">{entry.reason}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setSelectedEntry(entry)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal for detailed explainability inspection */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full text-white shadow-2xl">
            <h4 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Info className="w-5 h-5 text-cyan-400" />
              Detalle de Auditoría & Explicabilidad
            </h4>
            <div className="space-y-2 text-xs text-slate-300 font-mono bg-slate-950 p-4 rounded-lg border border-slate-800">
              <p><strong>Acción:</strong> {selectedEntry.action}</p>
              <p><strong>SKU:</strong> {selectedEntry.product_id}</p>
              <p><strong>Actor:</strong> {selectedEntry.actor}</p>
              <p><strong>Fecha:</strong> {new Date(selectedEntry.timestamp).toLocaleString()}</p>
              <p><strong>Fuente:</strong> {selectedEntry.source_name || 'N/A'}</p>
              <p><strong>Precio Origen:</strong> ${selectedEntry.source_price ?? 'N/A'} USD</p>
              <p><strong>Costo Puesto:</strong> ${selectedEntry.landed_cost ?? 'N/A'} USD</p>
              <p><strong>Precio Venta:</strong> ${selectedEntry.selling_price ?? 'N/A'} USD</p>
              <p><strong>Margen:</strong> {selectedEntry.margin ?? 'N/A'}%</p>
              <hr className="border-slate-800 my-2" />
              <p className="font-bold text-amber-400">Razón Determinística:</p>
              <p className="text-slate-200 font-sans">{selectedEntry.reason}</p>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 font-semibold text-xs rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

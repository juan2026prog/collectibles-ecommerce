import React from 'react';
import { Layers, CheckCircle2, XCircle, RotateCcw, ShieldAlert, Clock } from 'lucide-react';
import type { AutopilotQueueItem, QueueStatus } from '../../../../types/sourcingAutopilot';

interface AutopilotQueueViewProps {
  queueItems: AutopilotQueueItem[];
  onApproveItem: (itemId: string) => void;
  onRejectItem: (itemId: string) => void;
  onRetryItem: (itemId: string) => void;
}

export const AutopilotQueueView: React.FC<AutopilotQueueViewProps> = ({
  queueItems,
  onApproveItem,
  onRejectItem,
  onRetryItem
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-white font-bold">
          <Layers className="w-5 h-5 text-indigo-400" />
          <h3>COLA PERSISTENTE DE ACCIONES (ACTION QUEUE)</h3>
        </div>
        <span className="text-xs text-slate-400">Total en cola: {queueItems.length}</span>
      </div>

      {queueItems.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">
          No hay acciones pendientes en la cola.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[10px]">
              <tr>
                <th className="p-3">Acción</th>
                <th className="p-3">Estado</th>
                <th className="p-3">SKU Canónico</th>
                <th className="p-3">Idempotency Key</th>
                <th className="p-3">Intentos</th>
                <th className="p-3">Fecha</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {queueItems.map(item => (
                <tr key={item.id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-semibold text-white uppercase">{item.action_type}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' :
                      item.status === 'REQUIRES_APPROVAL' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      item.status === 'FAILED' ? 'bg-rose-500/20 text-rose-300' :
                      item.status === 'BLOCKED' ? 'bg-purple-500/20 text-purple-300' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-slate-400">{item.canonical_sku}</td>
                  <td className="p-3 font-mono text-[10px] text-slate-500 max-w-[150px] truncate">{item.idempotency_key}</td>
                  <td className="p-3 text-slate-400">{item.attempts} / {item.max_attempts}</td>
                  <td className="p-3 text-slate-400">{new Date(item.created_at).toLocaleTimeString()}</td>
                  <td className="p-3 text-right space-x-2">
                    {item.status === 'REQUIRES_APPROVAL' && (
                      <>
                        <button
                          onClick={() => onApproveItem(item.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[11px]"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => onRejectItem(item.id)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold text-[11px]"
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                    {item.status === 'FAILED' && (
                      <button
                        onClick={() => onRetryItem(item.id)}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-[11px]"
                      >
                        Reintentar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

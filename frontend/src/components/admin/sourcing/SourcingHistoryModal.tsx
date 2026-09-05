import React from 'react';
import { X, History, Calendar, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import type { SourcingHistoryEntry } from '../../../services/sourcing/sourcingService';

interface SourcingHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyEntries: SourcingHistoryEntry[];
}

export const SourcingHistoryModal: React.FC<SourcingHistoryModalProps> = ({
  isOpen,
  onClose,
  historyEntries
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in duration-150">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50/80">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-[#f00856]" />
              Historial de Investigaciones (Research Packs)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Auditoría y registro de todos los lotes de sourcing procesados en Collectibles.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 max-h-96 overflow-y-auto space-y-3">
          {historyEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-xs">
              Aún no se han procesado Research Packs en esta sesión.
            </div>
          ) : (
            historyEntries.map((entry, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 hover:border-gray-300 transition-all text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-900">
                      {entry.title}
                    </span>
                    {entry.provider === 'openai' || entry.source === 'openai-research' ? (
                      <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                        OPENAI API
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 text-[10px] font-semibold">
                        {entry.source || 'CHATGPT'}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-gray-500 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {new Date(entry.processed_at).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-gray-700 font-mono text-[11px]">
                  <span>Total: <strong className="text-gray-900">{entry.total_products}</strong></span>
                  <span className="text-emerald-700">Rentables: <strong>{entry.profitable_count}</strong></span>
                  {entry.review_count > 0 && (
                    <span className="text-amber-700">A Revisar: <strong>{entry.review_count}</strong></span>
                  )}
                  {entry.preorder_count > 0 && (
                    <span className="text-blue-700">Preventas: <strong>{entry.preorder_count}</strong></span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-xs font-semibold transition-colors shadow-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

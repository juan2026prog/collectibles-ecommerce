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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-white/15 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in duration-150">
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-dark-950/50">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-primary-500" />
              Historial de Investigaciones (Research Packs)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Auditoría y registro de todos los lotes de sourcing procesados en Collectibles.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 max-h-96 overflow-y-auto space-y-3 custom-scrollbar">
          {historyEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-xs">
              Aún no se han procesado Research Packs en esta sesión.
            </div>
          ) : (
            historyEntries.map((entry, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-dark-800/80 border border-white/10 rounded-xl space-y-2 hover:border-white/20 transition-all text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">
                    {entry.title}
                  </span>
                  <span className="font-mono text-[11px] text-gray-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(entry.processed_at).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-gray-300 font-mono text-[11px]">
                  <span>Total: <strong>{entry.total_products}</strong></span>
                  <span className="text-emerald-400">Rentables: <strong>{entry.profitable_count}</strong></span>
                  {entry.review_count > 0 && (
                    <span className="text-amber-400">A Revisar: <strong>{entry.review_count}</strong></span>
                  )}
                  {entry.preorder_count > 0 && (
                    <span className="text-blue-400">Preventas: <strong>{entry.preorder_count}</strong></span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-white/10 bg-dark-950/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-dark-800 hover:bg-dark-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

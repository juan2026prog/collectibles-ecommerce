import React, { useState } from 'react';
import { 
  X, CheckCircle, AlertTriangle, ShieldCheck, ArrowRight, RefreshCw, Layers, Sparkles 
} from 'lucide-react';
import type { 
  SourceListing, 
  CanonicalProduct, 
  MatchReview 
} from '../../../types/sourcing';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  review: MatchReview | null;
  listing?: SourceListing | null;
  suggestedProduct?: CanonicalProduct | null;
  onConfirmMatch: (reviewId: string, canonicalId: string) => void;
  onRejectMatch: (reviewId: string) => void;
  onCreateSeparateProduct: (reviewId: string, listing: SourceListing) => void;
}

export function SourcingCanonicalMatchReviewModal({
  isOpen,
  onClose,
  review,
  listing,
  suggestedProduct,
  onConfirmMatch,
  onRejectMatch,
  onCreateSeparateProduct
}: Props) {
  const [processing, setProcessing] = useState(false);

  if (!isOpen || !review || !listing) return null;

  const handleConfirm = async () => {
    if (!suggestedProduct) return;
    setProcessing(true);
    try {
      await onConfirmMatch(review.id, suggestedProduct.id);
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateSeparate = async () => {
    setProcessing(true);
    try {
      await onCreateSeparateProduct(review.id, listing);
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    try {
      await onRejectMatch(review.id);
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full text-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-lg text-white">Revisión de Coincidencia Canónica</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Match Score Badge */}
          <div className="flex items-center justify-between bg-slate-800/60 p-3 rounded-lg border border-slate-700">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Nivel de Confianza</span>
              <div className="text-lg font-bold text-amber-400">
                {(review.confidence_score * 100).toFixed(0)}% — REVISIÓN REQUERIDA
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 font-medium">Razones</span>
              <div className="flex flex-wrap gap-1 mt-1 justify-end">
                {review.reasons.map((r, i) => (
                  <span key={i} className="text-[10px] bg-slate-700 text-slate-200 px-2 py-0.5 rounded font-mono">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Comparison View */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Source Listing */}
            <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center justify-between">
                <span>Publicación Original</span>
                <span className="bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded text-[10px]">
                  {listing.source.toUpperCase()}
                </span>
              </div>

              <div className="text-sm font-semibold text-slate-200 line-clamp-3">
                {listing.raw_title}
              </div>

              <div className="text-xs space-y-1 text-slate-400 font-mono">
                <div>ID Externo: {listing.external_id}</div>
                <div>Precio: USD ${listing.raw_price}</div>
                <div>Condición: {listing.raw_condition || 'N/A'}</div>
              </div>
            </div>

            {/* Right: Suggested Canonical Product */}
            <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                <span>Producto Canónico Sugerido</span>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[10px]">
                  {suggestedProduct ? suggestedProduct.sku_reference : 'Sugerencia'}
                </span>
              </div>

              {suggestedProduct ? (
                <>
                  <div className="text-sm font-semibold text-slate-200 line-clamp-3">
                    {suggestedProduct.canonical_title}
                  </div>

                  <div className="text-xs space-y-1 text-slate-400 font-mono">
                    <div>Marca: {suggestedProduct.brand}</div>
                    <div>Franquicia: {suggestedProduct.franchise}</div>
                    <div>Personaje: {suggestedProduct.character}</div>
                    <div>Escala: {suggestedProduct.scale || 'N/A'}</div>
                    <div>Edición: {suggestedProduct.edition || 'Standard'}</div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 italic py-4">
                  No existe un producto canónico sugerido con suficiencia. Se recomienda crear un producto separado.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleReject}
            disabled={processing}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
          >
            Rechazar Coincidencia
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateSeparate}
              disabled={processing}
              className="px-4 py-2 text-xs font-medium text-amber-300 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 rounded-lg transition"
            >
              Crear Producto Separado
            </button>

            {suggestedProduct && (
              <button
                onClick={handleConfirm}
                disabled={processing}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition flex items-center gap-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                Confirmar Match
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

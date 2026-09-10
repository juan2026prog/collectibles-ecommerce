import React from 'react';
import type { NormalizedProduct } from '../../../types/sourcing';
import { 
  Sparkles, Check, AlertTriangle, Eye, Clock, Download, Bookmark, 
  ExternalLink, Building2, TrendingUp, ShieldCheck, DollarSign
} from 'lucide-react';

interface SourcingOpportunityCardProps {
  product: NormalizedProduct;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpenAnalysisModal: (product: NormalizedProduct) => void;
  onImportProduct: (product: NormalizedProduct) => void;
  onPublishPreorder: (product: NormalizedProduct) => void;
  onToggleWatchlist?: (product: NormalizedProduct) => void;
  isInWatchlist?: boolean;
}

export const SourcingOpportunityCard: React.FC<SourcingOpportunityCardProps> = ({
  product,
  isSelected,
  onToggleSelect,
  onOpenAnalysisModal,
  onImportProduct,
  onPublishPreorder,
  onToggleWatchlist,
  isInWatchlist = false
}) => {
  const selectedOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];
  const isPreorder = product.product_type === 'PREORDER';
  const isVerifiedOfficial = product.authenticity.status === 'VERIFIED_OFFICIAL';

  const riskLevel = product.financials.profit_usd <= 0 ? 'ALTO' : (product.authenticity.red_flags.length > 0 ? 'MEDIO' : 'BAJO');

  return (
    <div className={`bg-white border rounded-2xl p-4 transition-all space-y-3.5 shadow-sm hover:shadow-md flex flex-col justify-between ${
      isSelected ? 'border-2 border-[#f00856] bg-pink-50/20' : 'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Header Card: Checkbox + Badges + Watchlist */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="rounded border-gray-300 text-[#f00856] focus:ring-[#f00856] w-4 h-4 cursor-pointer"
            />
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-700 tracking-wider">
              {selectedOffer.source}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {onToggleWatchlist && (
              <button
                onClick={() => onToggleWatchlist(product)}
                title={isInWatchlist ? "Quitar de Watchlist" : "Vigilar Oportunidad"}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isInWatchlist
                    ? 'bg-amber-50 text-amber-600 border-amber-200'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:text-gray-700'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5 fill-current" />
              </button>
            )}

            <button
              onClick={() => onOpenAnalysisModal(product)}
              className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 transition-colors"
              title="Abrir Ficha de Análisis Completa"
            >
              <Eye className="w-3.5 h-3.5 text-gray-700" />
            </button>
          </div>
        </div>

        {/* Media & Title */}
        <div className="flex gap-3">
          <img
            src={product.image_url}
            alt={product.title}
            className="w-16 h-16 object-cover rounded-xl bg-gray-100 border border-gray-200 shrink-0 shadow-xs"
          />
          <div className="min-w-0 flex-1">
            <h4 
              onClick={() => onOpenAnalysisModal(product)}
              className="font-bold text-xs text-gray-900 line-clamp-2 cursor-pointer hover:text-[#f00856] transition-colors leading-snug"
              title={product.title}
            >
              {product.title}
            </h4>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              {product.brand} · {product.license} {product.scale ? `· ${product.scale}` : ''}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {isVerifiedOfficial ? (
                <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-semibold flex items-center gap-0.5">
                  <Check className="w-2.5 h-2.5" /> Oficial
                </span>
              ) : (
                <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-semibold flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" /> Verificar
                </span>
              )}

              <span className="text-[9px] text-[#f00856] bg-pink-50 border border-pink-200 px-1.5 py-0.2 rounded font-bold">
                {product.product_type}
              </span>
            </div>
          </div>
        </div>

        {/* Scores Bar */}
        <div className="grid grid-cols-2 gap-2 bg-gray-50/80 p-2 rounded-xl border border-gray-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 font-medium">Opportunity Score</span>
            <span className="font-mono text-xs font-extrabold text-emerald-700">
              {product.opportunity_score}/100
            </span>
          </div>

          <div className="flex items-center justify-between border-l border-gray-200 pl-2">
            <span className="text-[10px] text-gray-500 font-medium">Risk Score</span>
            <span className={`font-mono text-xs font-bold ${
              riskLevel === 'BAJO' ? 'text-emerald-600' : riskLevel === 'MEDIO' ? 'text-amber-600' : 'text-rose-600'
            }`}>
              {riskLevel}
            </span>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="space-y-1.5 pt-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-[11px]">Costo Puesto UY:</span>
            <span className="font-mono font-bold text-gray-900">
              ${product.financials.real_cost_puesto_usd.toFixed(2)} USD
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-[11px]">Precio Venta Sugerido:</span>
            <span className="font-mono font-bold text-[#f00856]">
              ${product.financials.current_sale_price_usd.toFixed(2)} USD
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <span className="text-gray-600 font-medium">Margen Proyectado:</span>
            <span className={`font-mono font-extrabold ${
              product.financials.margin_percent >= 20 ? 'text-emerald-600' :
              product.financials.margin_percent > 0 ? 'text-amber-600' : 'text-rose-600'
            }`}>
              +${product.financials.profit_usd.toFixed(2)} USD ({product.financials.margin_percent.toFixed(0)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Primary Action Buttons */}
      <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
        <button
          onClick={() => onOpenAnalysisModal(product)}
          className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg transition-colors text-center border border-gray-200"
        >
          Analizar Ficha
        </button>

        {isPreorder ? (
          <button
            onClick={() => onPublishPreorder(product)}
            disabled={!isVerifiedOfficial || product.financials.profit_usd <= 0}
            className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow-xs"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pre-order</span>
          </button>
        ) : (
          <button
            onClick={() => onImportProduct(product)}
            disabled={!isVerifiedOfficial || product.financials.profit_usd <= 0}
            className="flex-1 py-1.5 bg-[#f00856] hover:bg-[#d0074a] disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Publicar</span>
          </button>
        )}
      </div>
    </div>
  );
};

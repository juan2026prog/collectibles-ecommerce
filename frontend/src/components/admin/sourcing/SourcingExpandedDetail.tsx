import React, { useState } from 'react';
import type { NormalizedProduct, RetailerSource } from '../../../types/sourcing';
import { 
  Building2, Globe, DollarSign, Brain, ShieldCheck, 
  ExternalLink, Check, AlertTriangle, XCircle, Info, RefreshCw
} from 'lucide-react';

interface SourcingExpandedDetailProps {
  product: NormalizedProduct;
  onSelectSource: (offerId: string) => void;
  onUpdateSalePrice: (newPrice: number) => void;
  onRefreshLiveCheck?: () => void;
}

export const SourcingExpandedDetail: React.FC<SourcingExpandedDetailProps> = ({
  product,
  onSelectSource,
  onUpdateSalePrice,
  onRefreshLiveCheck
}) => {
  const [activeTab, setActiveTab] = useState<'sources' | 'uruguay' | 'profit' | 'intelligence' | 'authenticity'>('sources');

  const selectedOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];

  return (
    <div className="bg-dark-950/80 border-t border-b border-primary-500/20 p-4 space-y-4 animate-in fade-in duration-150">
      {/* Sub-tabs del detalle */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('sources')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'sources'
                ? 'bg-primary-600/30 text-primary-400 border border-primary-500/50'
                : 'text-gray-400 hover:text-white hover:bg-dark-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>A. Fuentes ({product.offers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('uruguay')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'uruguay'
                ? 'bg-primary-600/30 text-primary-400 border border-primary-500/50'
                : 'text-gray-400 hover:text-white hover:bg-dark-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>B. Mercado Uruguay</span>
          </button>

          <button
            onClick={() => setActiveTab('profit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'profit'
                ? 'bg-primary-600/30 text-primary-400 border border-primary-500/50'
                : 'text-gray-400 hover:text-white hover:bg-dark-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>C. Rentabilidad & Costos</span>
          </button>

          <button
            onClick={() => setActiveTab('intelligence')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'intelligence'
                ? 'bg-primary-600/30 text-primary-400 border border-primary-500/50'
                : 'text-gray-400 hover:text-white hover:bg-dark-800'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>D. Inteligencia & Scores</span>
          </button>

          <button
            onClick={() => setActiveTab('authenticity')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'authenticity'
                ? 'bg-primary-600/30 text-primary-400 border border-primary-500/50'
                : 'text-gray-400 hover:text-white hover:bg-dark-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>E. Autenticidad ({product.authenticity.status})</span>
          </button>
        </div>

        {onRefreshLiveCheck && (
          <button
            onClick={onRefreshLiveCheck}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-400 hover:text-white bg-dark-800 hover:bg-dark-700 rounded-lg border border-white/5 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Live Check</span>
          </button>
        )}
      </div>

      {/* TAB A: FUENTES DISPONIBLES */}
      {activeTab === 'sources' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {product.offers.map((offer) => {
              const isSelected = offer.id === product.selected_source_id;
              const isBest = offer.id === product.best_source_id;

              return (
                <div
                  key={offer.id}
                  className={`p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-primary-950/40 border-primary-500 shadow-md'
                      : 'bg-dark-900 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs uppercase px-2 py-0.5 rounded bg-dark-800 text-white tracking-wider">
                      {offer.source}
                    </span>
                    <div className="flex items-center gap-1">
                      {isBest && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Mejor Fuente
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-500 text-white">
                          Activa
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs mb-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Precio Producto:</span>
                      <span className="font-mono text-white font-semibold">${offer.price.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Domestic Shipping:</span>
                      <span className="font-mono text-white">
                        {offer.domestic_shipping > 0 ? `$${offer.domestic_shipping.toFixed(2)} USD` : 'FREE'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Vendedor:</span>
                      <span className="text-gray-300 truncate max-w-[140px]" title={offer.seller}>{offer.seller}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Disponibilidad:</span>
                      <span className="text-emerald-400 capitalize">{offer.availability.replace('_', ' ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Zinc Compatible:</span>
                      <span className={offer.is_zinc_compatible ? 'text-emerald-400' : 'text-gray-400'}>
                        {offer.is_zinc_compatible ? '✓ 100% Automático' : 'Manual / Ext'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-gray-400 hover:text-primary-400 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ver en tienda
                    </a>

                    {!isSelected && (
                      <button
                        onClick={() => onSelectSource(offer.id)}
                        className="px-2.5 py-1 bg-dark-800 hover:bg-primary-600 text-white text-[11px] font-semibold rounded-lg transition-colors"
                      >
                        Usar esta fuente
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB B: MERCADO URUGUAY */}
      {activeTab === 'uruguay' && (
        <div className="bg-dark-900 border border-white/10 rounded-xl p-4 space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-dark-800/80 p-3 rounded-lg">
              <span className="text-gray-400 block text-[11px]">Tipo de Coincidencia</span>
              <span className="font-bold text-sm text-white">
                {product.uruguay_market.status === 'EXACT_MATCH' ? '🎯 Exact Match (100%)' : product.uruguay_market.status === 'SIMILAR_PRODUCT' ? '🔍 Producto Similar' : '❌ Sin competencia directa'}
              </span>
            </div>

            <div className="bg-dark-800/80 p-3 rounded-lg">
              <span className="text-gray-400 block text-[11px]">Mercado Libre UY Mínimo</span>
              <span className="font-bold text-sm font-mono text-white">
                {product.uruguay_market.min_price_usd ? `$${product.uruguay_market.min_price_usd.toFixed(2)} USD` : '—'}
              </span>
            </div>

            <div className="bg-dark-800/80 p-3 rounded-lg">
              <span className="text-gray-400 block text-[11px]">Diferencial vs Collectibles</span>
              <span className={`font-bold text-sm font-mono ${
                (product.uruguay_market.comparison_diff_percent || 0) < 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {product.uruguay_market.comparison_diff_usd != null
                  ? `${product.uruguay_market.comparison_diff_usd > 0 ? '+' : ''}$${product.uruguay_market.comparison_diff_usd.toFixed(2)} USD (${product.uruguay_market.comparison_diff_percent}%)`
                  : 'Sin Comparativa Exacta'}
              </span>
            </div>

            <div className="bg-dark-800/80 p-3 rounded-lg">
              <span className="text-gray-400 block text-[11px]">Publicaciones Detectadas</span>
              <span className="font-bold text-sm text-white">
                {product.uruguay_market.total_listings} publicaciones ({product.uruguay_market.sellers_count} vendedores)
              </span>
            </div>
          </div>

          {product.uruguay_market.store_references && product.uruguay_market.store_references.length > 0 && (
            <div className="pt-2">
              <span className="font-semibold text-gray-300 block mb-2">Tiendas Uruguayas de Referencia:</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {product.uruguay_market.store_references.map((store, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-dark-800 rounded-lg text-[11px]">
                    <span className="text-white font-medium">{store.store_name} ({store.domain})</span>
                    <span className="font-mono text-gray-300">${store.price_usd.toFixed(2)} USD</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB C: RENTABILIDAD Y COSTOS */}
      {activeTab === 'profit' && (
        <div className="bg-dark-900 border border-white/10 rounded-xl p-4 text-xs space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-dark-800 p-2.5 rounded-lg">
              <span className="text-gray-400 text-[11px] block">Precio Retailer Origen</span>
              <span className="font-mono text-white font-bold text-sm">${product.financials.origin_price_usd.toFixed(2)}</span>
            </div>
            <div className="bg-dark-800 p-2.5 rounded-lg">
              <span className="text-gray-400 text-[11px] block">Shipping USA</span>
              <span className="font-mono text-white font-bold text-sm">${product.financials.usa_shipping_usd.toFixed(2)}</span>
            </div>
            <div className="bg-dark-800 p-2.5 rounded-lg">
              <span className="text-gray-400 text-[11px] block">Fees & Zinc + Impuestos</span>
              <span className="font-mono text-white font-bold text-sm">${(product.financials.zinc_fee_usd + product.financials.financial_fee_usd).toFixed(2)}</span>
            </div>
            <div className="bg-dark-800 p-2.5 rounded-lg border border-primary-500/30">
              <span className="text-primary-400 text-[11px] block font-semibold">Costo Puesto UY Total</span>
              <span className="font-mono text-primary-300 font-extrabold text-sm">${product.financials.real_cost_puesto_usd.toFixed(2)}</span>
            </div>
            <div className="bg-dark-800 p-2.5 rounded-lg border border-emerald-500/30">
              <span className="text-emerald-400 text-[11px] block font-semibold">Utilidad Neta Proyectada</span>
              <span className="font-mono text-emerald-300 font-extrabold text-sm">
                +${product.financials.profit_usd.toFixed(2)} USD ({product.financials.margin_percent}%)
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-gray-400">
              Profit Protection Rule: <strong className="text-white uppercase">{product.financials.profit_protection_status}</strong>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Ajustar Precio Venta USD:</span>
              <input
                type="number"
                step="1"
                value={product.financials.current_sale_price_usd}
                onChange={(e) => onUpdateSalePrice(Number(e.target.value))}
                className="w-24 bg-dark-800 border border-white/20 rounded px-2 py-1 font-mono text-white text-xs font-bold text-right"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB D: INTELIGENCIA Y SCORES */}
      {activeTab === 'intelligence' && (
        <div className="bg-dark-900 border border-white/10 rounded-xl p-4 text-xs space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-dark-800 p-3 rounded-lg">
              <span className="text-gray-400 block text-[11px]">Estrategia de Catálogo</span>
              <span className="font-bold text-sm text-primary-400">{product.product_type}</span>
              <p className="text-[11px] text-gray-400 mt-1">{product.curation_reason}</p>
            </div>

            <div className="bg-dark-800 p-3 rounded-lg">
              <span className="text-gray-400 block text-[11px]">Opportunity Score</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-lg font-bold text-white">{product.opportunity_score} / 100</span>
                <div className="w-24 bg-dark-950 rounded-full h-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full" style={{ width: `${product.opportunity_score}%` }}></div>
                </div>
              </div>
            </div>

            <div className="bg-dark-800 p-3 rounded-lg">
              <span className="text-gray-400 block text-[11px]">Catalog Value Score (Editorial)</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-lg font-bold text-white">{product.catalog_value_score} / 100</span>
                <div className="w-24 bg-dark-950 rounded-full h-2 overflow-hidden">
                  <div className="bg-primary-500 h-full" style={{ width: `${product.catalog_value_score}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB E: AUTENTICIDAD & LICENCIA */}
      {activeTab === 'authenticity' && (
        <div className="bg-dark-900 border border-white/10 rounded-xl p-4 text-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-md font-bold text-xs ${
                product.authenticity.status === 'VERIFIED_OFFICIAL'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {product.authenticity.status}
              </span>
              <span className="text-gray-300">Confianza: {product.authenticity.score}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <span className="text-emerald-400 font-semibold block mb-1">Señales Positivas de Autenticidad:</span>
              <ul className="space-y-1">
                {product.authenticity.green_flags.map((g, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-gray-300">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <span className="text-amber-400 font-semibold block mb-1">Alertas / Red Flags:</span>
              {product.authenticity.red_flags.length > 0 ? (
                <ul className="space-y-1">
                  {product.authenticity.red_flags.map((r, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-gray-400 italic">No se detectaron términos sospechosos ni réplicas.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

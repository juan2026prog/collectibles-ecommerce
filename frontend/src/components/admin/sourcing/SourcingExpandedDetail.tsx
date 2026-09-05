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
    <div className="bg-slate-50/80 border-t border-b border-gray-200 p-4 space-y-4 animate-in fade-in duration-150">
      {/* Sub-tabs del detalle */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('sources')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
              activeTab === 'sources'
                ? 'bg-white text-[#f00856] border border-gray-200 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>A. Fuentes ({product.offers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('uruguay')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
              activeTab === 'uruguay'
                ? 'bg-white text-[#f00856] border border-gray-200 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>B. Mercado Uruguay</span>
          </button>

          <button
            onClick={() => setActiveTab('profit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
              activeTab === 'profit'
                ? 'bg-white text-[#f00856] border border-gray-200 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>C. Rentabilidad & Costos</span>
          </button>

          <button
            onClick={() => setActiveTab('intelligence')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
              activeTab === 'intelligence'
                ? 'bg-white text-[#f00856] border border-gray-200 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>D. Inteligencia & Scores</span>
          </button>

          <button
            onClick={() => setActiveTab('authenticity')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
              activeTab === 'authenticity'
                ? 'bg-white text-[#f00856] border border-gray-200 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>E. Autenticidad ({product.authenticity.status})</span>
          </button>
        </div>

        {onRefreshLiveCheck && (
          <button
            onClick={onRefreshLiveCheck}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 shadow-xs transition-colors"
          >
            <RefreshCw className="w-3 h-3 text-[#f00856]" />
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
                  className={`p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-white border-2 border-[#f00856] shadow-sm'
                      : 'bg-white border-gray-200 hover:border-gray-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-800 tracking-wider">
                      {offer.source}
                    </span>
                    <div className="flex items-center gap-1">
                      {isBest && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Mejor Fuente
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f00856] text-white">
                          Activa
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs mb-3 text-gray-600">
                    <div className="flex justify-between">
                      <span>Precio Producto:</span>
                      <span className="font-mono text-gray-900 font-bold">${offer.price.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Domestic Shipping:</span>
                      <span className="font-mono text-gray-900">
                        {offer.domestic_shipping > 0 ? `$${offer.domestic_shipping.toFixed(2)} USD` : 'FREE'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Vendedor:</span>
                      <span className="text-gray-800 font-medium truncate max-w-[140px]" title={offer.seller}>{offer.seller}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Disponibilidad:</span>
                      <span className="text-emerald-700 font-medium capitalize">{offer.availability.replace('_', ' ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Zinc Compatible:</span>
                      <span className={offer.is_zinc_compatible ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
                        {offer.is_zinc_compatible ? '✓ 100% Automático' : 'Manual / Ext'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-gray-500 hover:text-[#f00856] flex items-center gap-1 font-medium"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ver en tienda
                    </a>

                    {!isSelected && (
                      <button
                        onClick={() => onSelectSource(offer.id)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-[#f00856] hover:text-white text-gray-700 text-[11px] font-semibold rounded-lg transition-colors border border-gray-200 hover:border-[#f00856]"
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
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 text-xs shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500 block text-[11px]">Tipo de Coincidencia</span>
              <span className="font-bold text-sm text-gray-900">
                {product.uruguay_market.status === 'EXACT_MATCH' ? '🎯 Exact Match (100%)' : product.uruguay_market.status === 'SIMILAR_PRODUCT' ? '🔍 Producto Similar' : '❌ Sin competencia directa'}
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500 block text-[11px]">Mercado Libre UY Mínimo</span>
              <span className="font-bold text-sm font-mono text-gray-900">
                {product.uruguay_market.min_price_usd ? `$${product.uruguay_market.min_price_usd.toFixed(2)} USD` : '—'}
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500 block text-[11px]">Diferencial vs Collectibles</span>
              <span className={`font-bold text-sm font-mono ${
                (product.uruguay_market.comparison_diff_percent || 0) < 0 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                {product.uruguay_market.comparison_diff_usd != null
                  ? `${product.uruguay_market.comparison_diff_usd > 0 ? '+' : ''}$${product.uruguay_market.comparison_diff_usd.toFixed(2)} USD (${product.uruguay_market.comparison_diff_percent}%)`
                  : 'Sin Comparativa Exacta'}
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500 block text-[11px]">Publicaciones Detectadas</span>
              <span className="font-bold text-sm text-gray-900">
                {product.uruguay_market.total_listings} publicaciones ({product.uruguay_market.sellers_count} vendedores)
              </span>
            </div>
          </div>

          {product.uruguay_market.store_references && product.uruguay_market.store_references.length > 0 && (
            <div className="pt-2">
              <span className="font-semibold text-gray-800 block mb-2">Tiendas Uruguayas de Referencia:</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {product.uruguay_market.store_references.map((store, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-[11px] border border-gray-200">
                    <span className="text-gray-900 font-medium">{store.store_name} ({store.domain})</span>
                    <span className="font-mono text-gray-700 font-semibold">${store.price_usd.toFixed(2)} USD</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB C: RENTABILIDAD Y COSTOS */}
      {activeTab === 'profit' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs space-y-3 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
              <span className="text-gray-500 text-[11px] block">Precio Retailer Origen</span>
              <span className="font-mono text-gray-900 font-bold text-sm">${product.financials.origin_price_usd.toFixed(2)}</span>
            </div>
            <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
              <span className="text-gray-500 text-[11px] block">Shipping USA</span>
              <span className="font-mono text-gray-900 font-bold text-sm">${product.financials.usa_shipping_usd.toFixed(2)}</span>
            </div>
            <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
              <span className="text-gray-500 text-[11px] block">Fees & Zinc + Impuestos</span>
              <span className="font-mono text-gray-900 font-bold text-sm">${(product.financials.zinc_fee_usd + product.financials.financial_fee_usd).toFixed(2)}</span>
            </div>
            <div className="bg-pink-50/60 p-2.5 rounded-lg border border-pink-200">
              <span className="text-[#f00856] text-[11px] block font-semibold">Costo Puesto UY Total</span>
              <span className="font-mono text-[#f00856] font-extrabold text-sm">${product.financials.real_cost_puesto_usd.toFixed(2)}</span>
            </div>
            <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
              <span className="text-emerald-700 text-[11px] block font-semibold">Utilidad Neta Proyectada</span>
              <span className="font-mono text-emerald-700 font-extrabold text-sm">
                +${product.financials.profit_usd.toFixed(2)} USD ({product.financials.margin_percent}%)
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-gray-100">
            <span className="text-gray-600">
              Profit Protection Rule: <strong className="text-gray-900 uppercase font-bold">{product.financials.profit_protection_status}</strong>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-medium">Ajustar Precio Venta USD:</span>
              <input
                type="number"
                step="1"
                value={product.financials.current_sale_price_usd}
                onChange={(e) => onUpdateSalePrice(Number(e.target.value))}
                className="w-24 bg-white border border-gray-300 rounded-lg px-2 py-1 font-mono text-gray-900 text-xs font-bold text-right shadow-xs focus:border-[#f00856] focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB D: INTELIGENCIA Y SCORES */}
      {activeTab === 'intelligence' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs space-y-3 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500 block text-[11px]">Estrategia de Catálogo</span>
              <span className="font-bold text-sm text-[#f00856]">{product.product_type}</span>
              <p className="text-[11px] text-gray-600 mt-1">{product.curation_reason}</p>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500 block text-[11px]">Opportunity Score</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-lg font-bold text-gray-900">{product.opportunity_score} / 100</span>
                <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full" style={{ width: `${product.opportunity_score}%` }}></div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="text-gray-500 block text-[11px]">Catalog Value Score (Editorial)</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-lg font-bold text-gray-900">{product.catalog_value_score} / 100</span>
                <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-[#f00856] h-full" style={{ width: `${product.catalog_value_score}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB E: AUTENTICIDAD & LICENCIA */}
      {activeTab === 'authenticity' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs space-y-3 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-md font-bold text-xs ${
                product.authenticity.status === 'VERIFIED_OFFICIAL'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {product.authenticity.status}
              </span>
              <span className="text-gray-600 font-medium">Confianza: {product.authenticity.score}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <span className="text-emerald-700 font-semibold block mb-1">Señales Positivas de Autenticidad:</span>
              <ul className="space-y-1">
                {product.authenticity.green_flags.map((g, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-gray-700">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <span className="text-amber-700 font-semibold block mb-1">Alertas / Red Flags:</span>
              {product.authenticity.red_flags.length > 0 ? (
                <ul className="space-y-1">
                  {product.authenticity.red_flags.map((r, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-gray-500 italic">No se detectaron términos sospechosos ni réplicas.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

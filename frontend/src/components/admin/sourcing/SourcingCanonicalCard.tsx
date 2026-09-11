import React, { useState } from 'react';
import { 
  Sparkles, Check, ChevronDown, ChevronUp, Download, Bookmark, 
  ExternalLink, Building2, ShieldCheck, AlertTriangle, Layers, Clock
} from 'lucide-react';
import type { MultiSourceCanonicalProduct, MultiSourceOfferDetail } from '../../../services/sourcing/multiSourceSearchService';

interface SourcingCanonicalCardProps {
  product: MultiSourceCanonicalProduct;
  isSelected: boolean;
  onToggleSelect: () => void;
  onImportProduct: (product: MultiSourceCanonicalProduct, selectedOffer?: MultiSourceOfferDetail) => void;
  onToggleWatchlist?: (product: MultiSourceCanonicalProduct) => void;
  isInWatchlist?: boolean;
  viewMode?: 'compact' | 'detailed';
}

export const SourcingCanonicalCard: React.FC<SourcingCanonicalCardProps> = ({
  product,
  isSelected,
  onToggleSelect,
  onImportProduct,
  onToggleWatchlist,
  isInWatchlist = false,
  viewMode = 'detailed'
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const bestOffer = product.offers[0];

  return (
    <div className={`bg-white border rounded-2xl transition-all shadow-xs hover:shadow-md overflow-hidden ${
      isSelected 
        ? 'border-2 border-[#f00856] bg-pink-50/10' 
        : 'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Vista Principal de la Tarjeta */}
      <div className="p-4 space-y-3">
        {/* Cabecera Superior: Selección + Badges de Retailer + Watchlist */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="rounded border-gray-300 text-[#f00856] focus:ring-[#f00856] w-4 h-4 cursor-pointer"
            />
            
            {/* Badges de Retailers Encontrados */}
            <div className="flex items-center gap-1">
              {product.matched_sources.map(src => (
                <span
                  key={src}
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider ${
                    src === 'amazon'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : src === 'ebay'
                      ? 'bg-blue-100 text-blue-900 border border-blue-300'
                      : 'bg-yellow-100 text-yellow-900 border border-yellow-300'
                  }`}
                >
                  {src}
                </span>
              ))}
            </div>

            {/* Badge Retro en Caja */}
            {product.is_retro_in_box && (
              <span className="text-[10px] font-black bg-gradient-to-r from-purple-900 to-indigo-900 text-amber-300 px-2 py-0.5 rounded-md border border-purple-700 flex items-center gap-1 shadow-2xs">
                <Sparkles className="w-3 h-3 text-amber-300 fill-current" />
                <span>RETRO EN CAJA</span>
              </span>
            )}

            {/* Badge Lote / Colección */}
            {product.is_lot && (
              <span className="text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Layers className="w-3 h-3 text-purple-700" />
                <span>LOTE / PACK</span>
              </span>
            )}

            {/* Badge Ya en Catálogo */}
            {product.already_in_catalog && (
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>EN CATÁLOGO</span>
              </span>
            )}
          </div>

          {/* Acciones Secundarias: Watchlist */}
          <div className="flex items-center gap-1.5">
            {onToggleWatchlist && (
              <button
                onClick={() => onToggleWatchlist(product)}
                title={isInWatchlist ? 'Quitar de Watchlist' : 'Vigilar Producto'}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  isInWatchlist
                    ? 'bg-amber-50 text-amber-600 border-amber-300'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:text-gray-700'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5 fill-current" />
              </button>
            )}
          </div>
        </div>

        {/* Imagen, Título y Taxonomía */}
        <div className="flex gap-3.5 items-start">
          <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-200 p-1.5 shrink-0 flex items-center justify-center overflow-hidden">
            <img
              src={product.image_url || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=200'}
              alt={product.title}
              className="max-h-full max-w-full object-contain"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="font-bold text-sm text-gray-900 leading-snug line-clamp-2">
              {product.title}
            </h3>
            
            <p className="text-xs text-gray-500 font-medium truncate">
              <strong>{product.brand}</strong> · {product.license} {product.line ? `· ${product.line}` : ''}
            </p>

            <div className="flex items-center gap-2 flex-wrap text-[11px] pt-0.5">
              {/* Condición Canónica Badge */}
              <span className={`px-2 py-0.5 rounded font-bold border ${product.condition_meta.badgeClass}`}>
                {product.condition_meta.badgeText}
              </span>

              {/* Disponibilidad */}
              <span className={`font-bold ${
                product.stock_verdict === 'IN_STOCK' ? 'text-emerald-700' : 'text-gray-400'
              }`}>
                {product.stock_verdict === 'IN_STOCK' ? '● En stock' : '○ Sin stock'}
              </span>

              {/* Ofertas Disponibles Count */}
              <span className="text-gray-400 font-medium">
                ({product.offers.length} {product.offers.length === 1 ? 'oferta' : 'ofertas'})
              </span>
            </div>
          </div>
        </div>

        {/* Bloque de Precios "Nuevo desde" / "Usado desde" */}
        <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
              Nuevo desde
            </span>
            {product.lowest_new_price !== null ? (
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-mono font-black text-sm text-gray-900">
                  ${product.lowest_new_price.toFixed(2)}
                </span>
                <span className="text-[10px] text-gray-500 uppercase font-bold">
                  ({product.lowest_new_retailer})
                </span>
              </div>
            ) : (
              <span className="text-gray-400 font-medium italic mt-0.5 block">—</span>
            )}
          </div>

          <div className="border-l border-gray-200 pl-2.5">
            <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
              Usado desde
            </span>
            {product.lowest_used_price !== null ? (
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-mono font-black text-sm text-purple-900">
                  ${product.lowest_used_price.toFixed(2)}
                </span>
                <span className="text-[10px] text-purple-700 uppercase font-bold">
                  ({product.lowest_used_retailer})
                </span>
              </div>
            ) : (
              <span className="text-gray-400 font-medium italic mt-0.5 block">—</span>
            )}
          </div>
        </div>

        {/* Vista Detallada: Scores Bar */}
        {viewMode === 'detailed' && (
          <div className="flex items-center justify-between text-xs px-1 text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-400 text-[11px]">Opportunity:</span>
              <span className="font-mono font-extrabold text-emerald-700">
                {product.opportunity_score}/100
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-400 text-[11px]">Riesgo:</span>
              <span className={`font-mono font-bold ${
                product.risk_score <= 20 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                {product.risk_score}/100
              </span>
            </div>
          </div>
        )}

        {/* Acciones Principales de la Tarjeta */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Ver ofertas ({product.offers.length})</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <button
            onClick={() => onImportProduct(product, bestOffer)}
            className="flex-1 py-2 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-black rounded-xl transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{product.already_in_catalog ? 'Agregar Oferta' : 'Importar'}</span>
          </button>
        </div>
      </div>

      {/* PANEL EXPANDIDO: Comparador Detallado de Ofertas por Retailer */}
      {isExpanded && (
        <div className="bg-slate-50/90 border-t border-gray-200 p-4 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <span>Comparación de Ofertas Multifuente</span>
            </h4>
            <span className="text-[11px] text-gray-500 font-medium">
              Envío Miami Casillero incluido
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                  <th className="py-2 px-2.5">Retailer</th>
                  <th className="py-2 px-2.5">Precio</th>
                  <th className="py-2 px-2.5">Shipping USA</th>
                  <th className="py-2 px-2.5">Costo Puesto UY</th>
                  <th className="py-2 px-2.5">Condición</th>
                  <th className="py-2 px-2.5">Vendedor / Reputación</th>
                  <th className="py-2 px-2.5">Entrega (Miami)</th>
                  <th className="py-2 px-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/70">
                {product.offers.map((offer) => {
                  const isAuction = offer.is_auction;
                  const isLot = offer.is_lot;

                  return (
                    <tr key={offer.id} className="hover:bg-white/80 transition-colors">
                      {/* Retailer */}
                      <td className="py-2.5 px-2.5 font-bold">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                          offer.source === 'amazon'
                            ? 'bg-amber-100 text-amber-900'
                            : offer.source === 'ebay'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-yellow-100 text-yellow-900'
                        }`}>
                          {offer.source}
                        </span>
                        {isAuction && (
                          <span className="block text-[9px] text-blue-700 font-extrabold mt-0.5">
                            SUBASTA
                          </span>
                        )}
                        {isLot && (
                          <span className="block text-[9px] text-purple-700 font-extrabold mt-0.5">
                            LOTE
                          </span>
                        )}
                      </td>

                      {/* Precio Producto */}
                      <td className="py-2.5 px-2.5 font-mono font-bold text-gray-900">
                        {offer.price > 0 ? `$${offer.price.toFixed(2)}` : '—'}
                      </td>

                      {/* Shipping USA */}
                      <td className="py-2.5 px-2.5 font-mono text-gray-600">
                        {offer.domestic_shipping > 0 
                          ? `+$${offer.domestic_shipping.toFixed(2)}` 
                          : <span className="text-emerald-600 font-bold">FREE</span>
                        }
                      </td>

                      {/* Costo Puesto Estimado UY */}
                      <td className="py-2.5 px-2.5 font-mono font-black text-gray-900">
                        ${offer.landed_cost_estimated_usd.toFixed(2)} USD
                      </td>

                      {/* Condición Canónica */}
                      <td className="py-2.5 px-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${offer.condition_meta.badgeClass}`}>
                          {offer.condition_meta.badgeText}
                        </span>
                      </td>

                      {/* Vendedor y Reputación */}
                      <td className="py-2.5 px-2.5">
                        <span className="font-semibold text-gray-800 block truncate max-w-[140px]">
                          {offer.seller}
                        </span>
                        {offer.seller_rating !== undefined && (
                          <span className="text-[10px] text-emerald-700 font-bold block">
                            {offer.seller_rating}% positivo {offer.seller_reviews ? `(${offer.seller_reviews.toLocaleString()})` : ''}
                          </span>
                        )}
                      </td>

                      {/* Tiempo de Entrega */}
                      <td className="py-2.5 px-2.5 text-gray-500 font-medium">
                        {offer.estimated_delivery || '3-5 días'}
                      </td>

                      {/* CTA Oferta Individual */}
                      <td className="py-2.5 px-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                          title="Ver en tienda origen"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        <button
                          onClick={() => onImportProduct(product, offer)}
                          disabled={isLot}
                          className="px-2.5 py-1.5 bg-[#f00856] hover:bg-[#d0074a] disabled:opacity-40 text-white font-bold rounded-lg text-xs transition-all cursor-pointer"
                          title={isLot ? "Lotes no compatibles con importación automática individual" : "Importar esta oferta específica"}
                        >
                          {isLot ? 'Lote' : 'Elegir'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

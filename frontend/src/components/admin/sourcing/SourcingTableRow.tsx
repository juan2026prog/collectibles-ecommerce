import React, { useState } from 'react';
import type { NormalizedProduct, ColumnDefinition, RetailerSource } from '../../../types/sourcing';
import { SourcingExpandedDetail } from './SourcingExpandedDetail';
import { ChevronDown, ChevronRight, Check, AlertTriangle, ExternalLink, Download, Clock } from 'lucide-react';

interface SourcingTableRowProps {
  product: NormalizedProduct;
  columns: ColumnDefinition[];
  isSelected: boolean;
  onToggleSelect: () => void;
  onImportProduct: (product: NormalizedProduct) => void;
  onPublishPreorder: (product: NormalizedProduct) => void;
  onUpdateSalePrice: (productId: string, newPrice: number) => void;
  onSelectSource: (productId: string, offerId: string) => void;
  onRefreshLiveCheck?: (product: NormalizedProduct) => void;
}

export const SourcingTableRow: React.FC<SourcingTableRowProps> = ({
  product,
  columns,
  isSelected,
  onToggleSelect,
  onImportProduct,
  onPublishPreorder,
  onUpdateSalePrice,
  onSelectSource,
  onRefreshLiveCheck
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [editPriceValue, setEditPriceValue] = useState(product.financials.current_sale_price_usd.toString());

  const selectedOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];
  const isPreorder = product.product_type === 'PREORDER';
  const isVerifiedOfficial = product.authenticity.status === 'VERIFIED_OFFICIAL';

  const handlePriceBlurOrSubmit = () => {
    setIsEditingPrice(false);
    const num = Number(editPriceValue);
    if (!isNaN(num) && num > 0) {
      onUpdateSalePrice(product.id, num);
    } else {
      setEditPriceValue(product.financials.current_sale_price_usd.toString());
    }
  };

  const isColVisible = (id: string) => {
    const found = columns.find(c => c.id === id);
    return found ? found.visible : true;
  };

  return (
    <>
      <tr className={`border-b border-white/5 transition-colors text-xs ${
        isSelected ? 'bg-primary-950/20' : 'hover:bg-white/[0.02]'
      }`}>
        {/* CHECKBOX */}
        {isColVisible('select') && (
          <td className="py-2.5 px-3 w-10 text-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="rounded border-gray-600 bg-dark-800 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5 cursor-pointer"
            />
          </td>
        )}

        {/* PRODUCTO (Miniatura, Título, Marca, Licencia, Escala, Oficial badge) */}
        {isColVisible('product') && (
          <td className="py-2.5 px-3 min-w-[260px]">
            <div className="flex items-center gap-2.5">
              <img
                src={product.image_url}
                alt={product.title}
                className="w-10 h-10 object-cover rounded-lg bg-dark-900 border border-white/10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="font-semibold text-white truncate max-w-[280px]" title={product.title}>
                    {product.title}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                  {product.brand} · {product.license} {product.scale ? `· ${product.scale}` : ''}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isVerifiedOfficial ? (
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-0.5">
                      <Check className="w-2.5 h-2.5" /> Oficial
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-400 font-medium flex items-center gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" /> Revisar
                    </span>
                  )}
                  {product.catalog_status === 'ALREADY_IN_CATALOG' && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-semibold">
                      En Catálogo
                    </span>
                  )}
                </div>
              </div>
            </div>
          </td>
        )}

        {/* FUENTE */}
        {isColVisible('source') && (
          <td className="py-2.5 px-3 whitespace-nowrap">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <select
                  value={selectedOffer.id}
                  onChange={(e) => onSelectSource(product.id, e.target.value)}
                  className="bg-dark-900 border border-white/10 text-white text-[11px] font-semibold uppercase rounded px-1.5 py-0.5 focus:outline-none focus:border-primary-500 cursor-pointer"
                >
                  {product.offers.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.source} (${o.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[9px] px-1 py-0.5 rounded font-mono font-bold ${
                  selectedOffer.status === 'LIVE' ? 'bg-emerald-500/20 text-emerald-300' :
                  selectedOffer.status === 'CACHE' ? 'bg-blue-500/20 text-blue-300' :
                  selectedOffer.status === 'PENDING_CREDENTIAL' ? 'bg-purple-500/20 text-purple-300' :
                  selectedOffer.status === 'RESEARCH_ONLY' ? 'bg-amber-500/20 text-amber-300' :
                  'bg-red-500/20 text-red-300'
                }`}>
                  {selectedOffer.status || 'RESEARCH_ONLY'}
                </span>
              </div>
            </div>
          </td>
        )}

        {/* COSTO PUESTO UY */}
        {isColVisible('cost_puesto') && (
          <td className="py-2.5 px-3 font-mono font-medium text-gray-200 whitespace-nowrap">
            ${product.financials.real_cost_puesto_usd.toFixed(2)}
          </td>
        )}

        {/* PRECIO VENTA (Editable in-line) */}
        {isColVisible('sale_price') && (
          <td className="py-2.5 px-3 whitespace-nowrap">
            {isEditingPrice ? (
              <input
                type="number"
                step="0.1"
                value={editPriceValue}
                onChange={(e) => setEditPriceValue(e.target.value)}
                onBlur={handlePriceBlurOrSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handlePriceBlurOrSubmit()}
                autoFocus
                className="w-20 bg-dark-900 border border-primary-500 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-white text-right focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingPrice(true)}
                title="Haga click para editar precio de venta"
                className="font-mono font-bold text-white hover:text-primary-400 hover:underline px-1 py-0.5 rounded transition-colors"
              >
                ${product.financials.current_sale_price_usd.toFixed(2)}
              </button>
            )}
          </td>
        )}

        {/* MARGEN % */}
        {isColVisible('margin') && (
          <td className="py-2.5 px-3 whitespace-nowrap font-mono font-semibold">
            <span className={
              product.financials.margin_percent >= 20 ? 'text-emerald-400' :
              product.financials.margin_percent > 0 ? 'text-amber-400' : 'text-red-400'
            }>
              {product.financials.margin_percent.toFixed(0)}%
            </span>
          </td>
        )}

        {/* MERCADO LIBRE UY */}
        {isColVisible('ml_uruguay') && (
          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-gray-300">
            <div className="flex flex-col gap-0.5">
              {product.uruguay_market.min_price_usd ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white">${product.uruguay_market.min_price_usd.toFixed(0)}</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded font-sans uppercase ${
                    product.uruguay_market.data_origin === 'LIVE' ? 'bg-emerald-500/20 text-emerald-300' :
                    product.uruguay_market.data_origin === 'CACHE' ? 'bg-blue-500/20 text-blue-300' :
                    'bg-dark-800 text-gray-400'
                  }`}>
                    {product.uruguay_market.data_origin || 'LIVE'}
                  </span>
                </div>
              ) : (
                <span className="text-gray-500 text-xs">
                  {product.uruguay_market.status === 'ERROR' ? 'ERROR' : 'NO DETECTADO'}
                </span>
              )}
            </div>
          </td>
        )}

        {/* DIFERENCIA */}
        {isColVisible('difference') && (
          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs">
            {product.uruguay_market.difference_percent != null || product.uruguay_market.comparison_diff_percent != null ? (
              <div className="flex flex-col">
                <span className={
                  (product.uruguay_market.difference_percent ?? product.uruguay_market.comparison_diff_percent ?? 0) < 0
                    ? 'text-emerald-400 font-bold'
                    : 'text-amber-400 font-bold'
                }>
                  {(product.uruguay_market.difference_percent ?? product.uruguay_market.comparison_diff_percent ?? 0) > 0 ? '+' : ''}
                  {(product.uruguay_market.difference_percent ?? product.uruguay_market.comparison_diff_percent ?? 0).toFixed(0)}%
                </span>
                <span className="text-[9px] font-sans text-gray-400">
                  {product.uruguay_market.market_position === 'CHEAPER' ? 'Más barato' :
                   product.uruguay_market.market_position === 'MORE_EXPENSIVE' ? 'PRECIO SOBRE MERCADO' :
                   product.uruguay_market.market_position === 'SIMILAR' ? 'Similar' : 'Sin comp.'}
                </span>
              </div>
            ) : (
              <span className="text-gray-500 text-[10px] font-sans">Sin comp.</span>
            )}
          </td>
        )}

        {/* COLUMNAS OPCIONALES CONFIGURABLES */}
        {isColVisible('origin_price') && (
          <td className="py-2.5 px-3 font-mono text-gray-400 whitespace-nowrap">
            ${selectedOffer.price.toFixed(2)}
          </td>
        )}
        {isColVisible('domestic_shipping') && (
          <td className="py-2.5 px-3 font-mono text-gray-400 whitespace-nowrap">
            ${selectedOffer.domestic_shipping.toFixed(2)}
          </td>
        )}
        {isColVisible('profit_usd') && (
          <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold whitespace-nowrap">
            +${product.financials.profit_usd.toFixed(2)}
          </td>
        )}
        {isColVisible('opportunity_score') && (
          <td className="py-2.5 px-3 font-mono text-white whitespace-nowrap">
            {product.opportunity_score}
          </td>
        )}
        {isColVisible('catalog_value') && (
          <td className="py-2.5 px-3 font-mono text-white whitespace-nowrap">
            {product.catalog_value_score}
          </td>
        )}
        {isColVisible('sku') && (
          <td className="py-2.5 px-3 font-mono text-[10px] text-gray-400 whitespace-nowrap">
            {product.canonical_sku}
          </td>
        )}

        {/* ACCIONES */}
        {isColVisible('actions') && (
          <td className="py-2.5 px-3 text-right whitespace-nowrap">
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="px-2 py-1 bg-dark-800 hover:bg-dark-700 text-gray-300 text-[11px] font-semibold rounded-lg transition-colors flex items-center gap-0.5"
              >
                <span>Detalle</span>
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>

              {isPreorder ? (
                <button
                  type="button"
                  onClick={() => onPublishPreorder(product)}
                  disabled={!isVerifiedOfficial || product.financials.profit_usd <= 0}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-[11px] font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1"
                >
                  <Clock className="w-3 h-3" />
                  <span>Pre-order</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onImportProduct(product)}
                  disabled={!isVerifiedOfficial || product.financials.profit_usd <= 0}
                  className="px-2.5 py-1 bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white text-[11px] font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  <span>Importar</span>
                </button>
              )}
            </div>
          </td>
        )}
      </tr>

      {/* DETALLE EXPANDIDO IN-LINE */}
      {isExpanded && (
        <tr>
          <td colSpan={columns.filter(c => c.visible).length} className="p-0">
            <SourcingExpandedDetail
              product={product}
              onSelectSource={(offerId) => onSelectSource(product.id, offerId)}
              onUpdateSalePrice={(newPrice) => onUpdateSalePrice(product.id, newPrice)}
              onRefreshLiveCheck={() => onRefreshLiveCheck?.(product)}
            />
          </td>
        </tr>
      )}
    </>
  );
};

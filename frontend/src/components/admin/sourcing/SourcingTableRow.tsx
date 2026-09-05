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
      <tr className={`border-b border-gray-100 transition-colors text-xs ${
        isSelected ? 'bg-pink-50/50' : 'hover:bg-gray-50/80'
      }`}>
        {/* CHECKBOX */}
        {isColVisible('select') && (
          <td className="py-2.5 px-3 w-10 text-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="rounded border-gray-300 text-[#f00856] focus:ring-[#f00856] w-3.5 h-3.5 cursor-pointer"
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
                className="w-10 h-10 object-cover rounded-lg bg-gray-100 border border-gray-200 shrink-0 shadow-xs"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="font-semibold text-gray-900 truncate max-w-[280px]" title={product.title}>
                    {product.title}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                  {product.brand} · {product.license} {product.scale ? `· ${product.scale}` : ''}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isVerifiedOfficial ? (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded font-medium flex items-center gap-0.5">
                      <Check className="w-2.5 h-2.5" /> Oficial
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded font-medium flex items-center gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" /> Revisar
                    </span>
                  )}
                  {product.catalog_status === 'ALREADY_IN_CATALOG' && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
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
                  className="bg-white border border-gray-300 text-gray-800 text-[11px] font-semibold uppercase rounded-md px-1.5 py-0.5 focus:outline-none focus:border-[#f00856] cursor-pointer shadow-xs"
                >
                  {product.offers.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.source} (${o.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                  selectedOffer.status === 'LIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  selectedOffer.status === 'CACHE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  selectedOffer.status === 'PENDING_CREDENTIAL' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                  selectedOffer.status === 'RESEARCH_ONLY' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {selectedOffer.status || 'RESEARCH_ONLY'}
                </span>
              </div>
            </div>
          </td>
        )}

        {/* COSTO PUESTO UY */}
        {isColVisible('cost_puesto') && (
          <td className="py-2.5 px-3 font-mono font-medium text-gray-800 whitespace-nowrap">
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
                className="w-20 bg-white border-2 border-[#f00856] rounded px-1.5 py-0.5 text-xs font-mono font-bold text-gray-900 text-right focus:outline-none shadow-xs"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingPrice(true)}
                title="Haga doble click para editar precio de venta"
                className="font-mono font-bold text-gray-900 hover:text-[#f00856] hover:bg-pink-50 px-1.5 py-0.5 rounded transition-colors"
              >
                ${product.financials.current_sale_price_usd.toFixed(2)}
              </button>
            )}
          </td>
        )}

        {/* MARGEN % */}
        {isColVisible('margin') && (
          <td className="py-2.5 px-3 whitespace-nowrap font-mono font-bold">
            <span className={
              product.financials.margin_percent >= 20 ? 'text-emerald-600' :
              product.financials.margin_percent > 0 ? 'text-amber-600' : 'text-red-600'
            }>
              {product.financials.margin_percent.toFixed(0)}%
            </span>
          </td>
        )}

        {/* MERCADO LIBRE UY */}
        {isColVisible('ml_uruguay') && (
          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-gray-800">
            <div className="flex flex-col gap-0.5">
              {product.uruguay_market.min_price_usd ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-900">${product.uruguay_market.min_price_usd.toFixed(0)}</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded font-sans uppercase border font-semibold ${
                    product.uruguay_market.data_origin === 'LIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    product.uruguay_market.data_origin === 'CACHE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-gray-100 text-gray-600 border-gray-200'
                  }`}>
                    {product.uruguay_market.data_origin || 'LIVE'}
                  </span>
                </div>
              ) : (
                <span className="text-gray-400 text-xs">
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
                    ? 'text-emerald-600 font-bold'
                    : 'text-amber-600 font-bold'
                }>
                  {(product.uruguay_market.difference_percent ?? product.uruguay_market.comparison_diff_percent ?? 0) > 0 ? '+' : ''}
                  {(product.uruguay_market.difference_percent ?? product.uruguay_market.comparison_diff_percent ?? 0).toFixed(0)}%
                </span>
                <span className="text-[9px] font-sans text-gray-500">
                  {product.uruguay_market.market_position === 'CHEAPER' ? 'Más barato' :
                   product.uruguay_market.market_position === 'MORE_EXPENSIVE' ? 'Sobre mercado' :
                   product.uruguay_market.market_position === 'SIMILAR' ? 'Similar' : 'Sin comp.'}
                </span>
              </div>
            ) : (
              <span className="text-gray-400 text-[10px] font-sans">Sin comp.</span>
            )}
          </td>
        )}

        {/* COLUMNAS OPCIONALES CONFIGURABLES */}
        {isColVisible('origin_price') && (
          <td className="py-2.5 px-3 font-mono text-gray-600 whitespace-nowrap">
            ${selectedOffer.price.toFixed(2)}
          </td>
        )}
        {isColVisible('domestic_shipping') && (
          <td className="py-2.5 px-3 font-mono text-gray-600 whitespace-nowrap">
            ${selectedOffer.domestic_shipping.toFixed(2)}
          </td>
        )}
        {isColVisible('profit_usd') && (
          <td className="py-2.5 px-3 font-mono text-emerald-600 font-bold whitespace-nowrap">
            +${product.financials.profit_usd.toFixed(2)}
          </td>
        )}
        {isColVisible('opportunity_score') && (
          <td className="py-2.5 px-3 font-mono text-gray-900 font-bold whitespace-nowrap">
            {product.opportunity_score}
          </td>
        )}
        {isColVisible('catalog_value') && (
          <td className="py-2.5 px-3 font-mono text-gray-900 font-bold whitespace-nowrap">
            {product.catalog_value_score}
          </td>
        )}
        {isColVisible('sku') && (
          <td className="py-2.5 px-3 font-mono text-[10px] text-gray-500 whitespace-nowrap">
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
                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold rounded-md transition-colors flex items-center gap-0.5 border border-gray-200"
              >
                <span>Detalle</span>
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>

              {isPreorder ? (
                <button
                  type="button"
                  onClick={() => onPublishPreorder(product)}
                  disabled={!isVerifiedOfficial || product.financials.profit_usd <= 0}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-[11px] font-bold rounded-md shadow-xs transition-colors flex items-center gap-1"
                >
                  <Clock className="w-3 h-3" />
                  <span>Pre-order</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onImportProduct(product)}
                  disabled={!isVerifiedOfficial || product.financials.profit_usd <= 0}
                  className="px-3 py-1 bg-[#f00856] hover:bg-[#d0074a] disabled:opacity-40 text-white text-[11px] font-bold rounded-md shadow-xs transition-colors flex items-center gap-1"
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
          <td colSpan={columns.filter(c => c.visible).length} className="p-0 bg-slate-50/60">
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

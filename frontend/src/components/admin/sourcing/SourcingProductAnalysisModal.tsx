import React, { useState } from 'react';
import type { NormalizedProduct, SourceOffer } from '../../../types/sourcing';
import { 
  X, Sparkles, Building2, Globe, DollarSign, Brain, ShieldCheck, 
  ExternalLink, Check, AlertTriangle, CheckCircle2, Bookmark, Download, Clock,
  TrendingUp, ArrowUpRight, Scale, ShieldAlert, Tag, Package, Calculator, Truck, HelpCircle
} from 'lucide-react';
import { useToast } from '../Toast';

interface SourcingProductAnalysisModalProps {
  product: NormalizedProduct | null;
  isOpen: boolean;
  onClose: () => void;
  onImportProduct: (product: NormalizedProduct) => void;
  onPublishPreorder: (product: NormalizedProduct) => void;
  onUpdateSalePrice: (productId: string, newPrice: number) => void;
  onSelectSource: (productId: string, offerId: string) => void;
  onToggleWatchlist?: (product: NormalizedProduct) => void;
  isInWatchlist?: boolean;
}

export const SourcingProductAnalysisModal: React.FC<SourcingProductAnalysisModalProps> = ({
  product,
  isOpen,
  onClose,
  onImportProduct,
  onPublishPreorder,
  onUpdateSalePrice,
  onSelectSource,
  onToggleWatchlist,
  isInWatchlist = false
}) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'comparison' | 'financials' | 'scores' | 'demand' | 'authenticity'>('comparison');
  const [customPrice, setCustomPrice] = useState<string>('');

  if (!isOpen || !product) return null;

  const selectedOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];
  const isPreorder = product.product_type === 'PREORDER';
  const isOfficial = product.authenticity.status === 'VERIFIED_OFFICIAL';

  // Tax regime detection
  const isFranchiseEligible = selectedOffer.price <= 200;
  const landedCost = product.financials.real_cost_puesto_usd;
  const currentSalePrice = product.financials.current_sale_price_usd;
  const profitUsd = product.financials.profit_usd;
  const marginPercent = product.financials.margin_percent;

  // Opportunity & Risk Score calculations
  const opportunityScore = product.opportunity_score;
  const riskScore = Math.max(10, 100 - opportunityScore + (product.authenticity.red_flags.length * 15));
  const riskLevel = riskScore > 60 ? 'ALTO' : (riskScore > 30 ? 'MEDIO' : 'BAJO');

  const handlePriceSubmit = () => {
    const num = Number(customPrice);
    if (!isNaN(num) && num > 0) {
      onUpdateSalePrice(product.id, num);
      addToast({
        title: 'Precio Actualizado',
        message: `Nuevo precio de venta $${num.toFixed(2)} USD aplicado al análisis.`,
        type: 'success'
      });
      setCustomPrice('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
        
        {/* CABECERA DE LA FICHA */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-start justify-between gap-4">
          <div className="flex gap-4 items-start min-w-0">
            <img
              src={product.image_url}
              alt={product.title}
              className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl bg-slate-800 border border-slate-700 shrink-0 shadow-md"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                  {product.product_type}
                </span>
                <span className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                  SKU: {product.canonical_sku}
                </span>
                {product.upc && (
                  <span className="text-[10px] font-mono text-slate-400">
                    UPC: {product.upc}
                  </span>
                )}
                {product.asin && (
                  <span className="text-[10px] font-mono text-slate-400">
                    ASIN: {product.asin}
                  </span>
                )}
              </div>

              <h2 className="text-base sm:text-lg font-bold text-white leading-tight truncate max-w-xl" title={product.title}>
                {product.title}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {product.brand} · {product.license} {product.scale ? `· Escala ${product.scale}` : ''} {product.year ? `· (${product.year})` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BARRA DE HIGHLIGHTS SCORES & CTA RÁPIDO */}
        <div className="bg-slate-800 text-white px-5 py-3 border-t border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-wrap text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Opportunity Score</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-base font-extrabold text-emerald-400">{opportunityScore}/100</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.2 rounded">
                  {opportunityScore >= 75 ? 'Muy Alta Oportunidad' : 'Oportunidad Moderada'}
                </span>
              </div>
            </div>

            <div className="border-l border-slate-700 pl-6">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Risk Score</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`font-mono text-base font-extrabold ${
                  riskLevel === 'BAJO' ? 'text-emerald-400' : riskLevel === 'MEDIO' ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {riskScore}/100 ({riskLevel})
                </span>
              </div>
            </div>

            <div className="border-l border-slate-700 pl-6 hidden md:block">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Mercado Libre UY</span>
              <span className="font-mono text-sm font-bold text-white mt-0.5 block">
                {product.uruguay_market.min_price_usd ? `$${product.uruguay_market.min_price_usd.toFixed(2)} USD` : 'Sin Competencia Directa'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onToggleWatchlist && (
              <button
                onClick={() => onToggleWatchlist(product)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                  isInWatchlist
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5 fill-current" />
                <span>{isInWatchlist ? 'En Watchlist' : 'Vigilar'}</span>
              </button>
            )}

            {isPreorder ? (
              <button
                onClick={() => { onPublishPreorder(product); onClose(); }}
                disabled={!isOfficial || profitUsd <= 0}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-40 flex items-center gap-1.5"
              >
                <Clock className="w-4 h-4" />
                <span>Publicar Pre-order</span>
              </button>
            ) : (
              <button
                onClick={() => { onImportProduct(product); onClose(); }}
                disabled={!isOfficial || profitUsd <= 0}
                className="px-4 py-1.5 bg-[#f00856] hover:bg-[#d0074a] text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-40 flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Aprobar & Publicar</span>
              </button>
            )}
          </div>
        </div>

        {/* NAVEGACIÓN INTERNA DE SECCIONES DE ANÁLISIS */}
        <div className="bg-gray-100 px-5 py-2 border-b border-gray-200 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('comparison')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'comparison' ? 'bg-white text-[#f00856] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>1. Comparador Retailers ({product.offers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('financials')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'financials' ? 'bg-white text-[#f00856] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>2. Importación UY & Pricing</span>
          </button>

          <button
            onClick={() => setActiveTab('scores')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'scores' ? 'bg-white text-[#f00856] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Brain className="w-4 h-4" />
            <span>3. Opportunity & Risk Breakdown</span>
          </button>

          <button
            onClick={() => setActiveTab('demand')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'demand' ? 'bg-white text-[#f00856] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>4. Demanda & Tendencia</span>
          </button>

          <button
            onClick={() => setActiveTab('authenticity')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'authenticity' ? 'bg-white text-[#f00856] shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>5. Autenticidad & Licencia</span>
          </button>
        </div>

        {/* CONTENIDO PRINCIPAL SEGÚN PESTAÑA */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* TAB 1: COMPARADOR DE RETAILERS (Amazon / eBay / Best Buy) */}
          {activeTab === 'comparison' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">
                  Ofertas Detectadas Multi-proveedor (Amazon, eBay, Best Buy)
                </h3>
                <span className="text-xs text-gray-500">
                  Seleccione el proveedor activo para recalcular costos al instante.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {product.offers.map((offer) => {
                  const isSelected = offer.id === product.selected_source_id;
                  const isBest = offer.id === product.best_source_id;

                  return (
                    <div
                      key={offer.id}
                      className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                        isSelected
                          ? 'bg-white border-2 border-[#f00856] shadow-md'
                          : 'bg-white border-gray-200 hover:border-gray-300 shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-extrabold text-xs uppercase px-2.5 py-1 rounded-md bg-gray-100 text-gray-800 tracking-wider">
                            {offer.source}
                          </span>
                          <div className="flex items-center gap-1">
                            {isBest && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ★ Mejor Opción
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f00856] text-white">
                                Activa
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 text-xs text-gray-600 mb-4">
                          <div className="flex justify-between items-center py-1 border-b border-gray-100">
                            <span>Precio Producto Origen:</span>
                            <span className="font-mono font-bold text-gray-900 text-sm">${offer.price.toFixed(2)} USD</span>
                          </div>

                          <div className="flex justify-between items-center py-1 border-b border-gray-100">
                            <span>Shipping USA (Miami):</span>
                            <span className="font-mono font-semibold text-gray-800">
                              {offer.domestic_shipping > 0 ? `$${offer.domestic_shipping.toFixed(2)} USD` : 'GRATIS'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center py-1 border-b border-gray-100">
                            <span>Condición:</span>
                            <span className="font-semibold text-gray-800 uppercase text-[11px]">{offer.condition}</span>
                          </div>

                          <div className="flex justify-between items-center py-1 border-b border-gray-100">
                            <span>Vendedor & Reputación:</span>
                            <span className="font-medium text-gray-900 truncate max-w-[140px]" title={offer.seller}>
                              {offer.seller} ({offer.seller_rating ? `${offer.seller_rating}%` : 'N/D'})
                            </span>
                          </div>

                          <div className="flex justify-between items-center py-1 border-b border-gray-100">
                            <span>Disponibilidad:</span>
                            <span className="text-emerald-700 font-semibold capitalize">{offer.availability.replace('_', ' ')}</span>
                          </div>

                          <div className="flex justify-between items-center py-1 border-b border-gray-100">
                            <span>Entrega Estimada USA:</span>
                            <span className="font-mono text-gray-700">{offer.estimated_delivery || '3-5 días hábiles'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-500 hover:text-[#f00856] flex items-center gap-1 font-semibold"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Ver en tienda</span>
                        </a>

                        {!isSelected && (
                          <button
                            onClick={() => onSelectSource(product.id, offer.id)}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-[#f00856] hover:text-white text-gray-800 text-xs font-bold rounded-lg transition-all border border-gray-200"
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

          {/* TAB 2: IMPORTACIÓN UY & PRICING */}
          {activeTab === 'financials' && (
            <div className="space-y-4">
              {/* Resumen de Desglose de Costo Puesto */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#f00856]" /> Desglose Comercial de Costo Puesto en Uruguay
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-gray-200">
                    <span className="text-gray-500 text-[11px] block">Precio USA</span>
                    <span className="font-mono text-gray-900 font-bold text-sm">${selectedOffer.price.toFixed(2)} USD</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-gray-200">
                    <span className="text-gray-500 text-[11px] block">Courier & Flete UY</span>
                    <span className="font-mono text-gray-900 font-bold text-sm">${(product.financials.real_cost_puesto_usd - selectedOffer.price - selectedOffer.domestic_shipping).toFixed(2)} USD</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-gray-200">
                    <span className="text-gray-500 text-[11px] block">Régimen Fiscal</span>
                    <span className="font-bold text-xs text-indigo-700">
                      {isFranchiseEligible ? 'Franquicia (Libre de Impuestos)' : 'Régimen 60% DUA'}
                    </span>
                  </div>

                  <div className="bg-pink-50 p-3 rounded-xl border border-pink-200">
                    <span className="text-[#f00856] text-[11px] block font-bold">Costo Puesto UY Total</span>
                    <span className="font-mono text-[#f00856] font-extrabold text-base">${landedCost.toFixed(2)} USD</span>
                  </div>
                </div>
              </div>

              {/* Ajuste e Ingreso de Precio Venta */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Simulador & Ajuste de Precio Venta</h4>
                    <p className="text-xs text-gray-500">
                      Recalcule el margen y la ganancia neta en USD ingresando un nuevo precio objetivo.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder={`$${currentSalePrice}`}
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      className="w-28 bg-gray-50 border border-gray-300 rounded-xl px-3 py-1.5 font-mono text-xs font-bold text-gray-900 text-right focus:outline-none focus:border-[#f00856]"
                    />
                    <button
                      onClick={handlePriceSubmit}
                      className="px-3 py-1.5 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <span className="text-gray-500 text-[11px] block">Precio de Venta Sugerido</span>
                    <span className="font-mono text-gray-900 font-extrabold text-base">${currentSalePrice.toFixed(2)} USD</span>
                  </div>

                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <span className="text-emerald-700 text-[11px] block font-bold">Utilidad Neta USD</span>
                    <span className="font-mono text-emerald-700 font-extrabold text-base">+${profitUsd.toFixed(2)} USD</span>
                  </div>

                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <span className="text-emerald-700 text-[11px] block font-bold">Margen Comercial %</span>
                    <span className="font-mono text-emerald-700 font-extrabold text-base">{marginPercent.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OPPORTUNITY & RISK BREAKDOWN */}
          {activeTab === 'scores' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Opportunity Factors */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600" /> Factores de Oportunidad ({opportunityScore}/100)
                  </h4>
                </div>

                <ul className="space-y-2 text-xs">
                  <li className="flex items-center gap-2 p-2 bg-emerald-50/60 rounded-lg text-emerald-900 font-medium">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Demanda alta en la categoría de colectables.</span>
                  </li>
                  <li className="flex items-center gap-2 p-2 bg-emerald-50/60 rounded-lg text-emerald-900 font-medium">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Poca competencia directa detectada en Mercado Libre Uruguay.</span>
                  </li>
                  <li className="flex items-center gap-2 p-2 bg-emerald-50/60 rounded-lg text-emerald-900 font-medium">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Margen proyectado superior al 20% sobre costo puesto.</span>
                  </li>
                  <li className="flex items-center gap-2 p-2 bg-emerald-50/60 rounded-lg text-emerald-900 font-medium">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Vendedor oficial verificado con alto scoring de confianza.</span>
                  </li>
                </ul>
              </div>

              {/* Risk Factors */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" /> Evaluación de Riesgos ({riskScore}/100 - {riskLevel})
                  </h4>
                </div>

                {product.authenticity.red_flags.length > 0 ? (
                  <ul className="space-y-2 text-xs">
                    {product.authenticity.red_flags.map((flag, idx) => (
                      <li key={idx} className="flex items-center gap-2 p-2 bg-rose-50 rounded-lg text-rose-900 font-medium border border-rose-200">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 bg-emerald-50 rounded-xl text-center text-xs text-emerald-800 font-semibold border border-emerald-200">
                    ✓ Sin riesgos críticos. Vendedor y producto aptos para comercialización.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: DEMANDA Y TENDENCIA */}
          {activeTab === 'demand' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900">Análisis de Mercado & Tendencia Comercial</h4>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  Tendencia Positiva ↑
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <span className="text-gray-500 text-[11px] block">Nivel de Demanda</span>
                  <span className="font-bold text-sm text-gray-900">ALTA (Búsqueda frecuente)</span>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <span className="text-gray-500 text-[11px] block">Estabilidad de Demanda</span>
                  <span className="font-bold text-sm text-gray-900">CONSISTENTE (Coleccionismo)</span>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <span className="text-gray-500 text-[11px] block">Interés por Lanzamiento</span>
                  <span className="font-bold text-sm text-[#f00856]">Reciente / Nuevo Release</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUTENTICIDAD & LICENCIA */}
          {activeTab === 'authenticity' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900">Auditoría de Licencia & Autenticidad</h4>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
                  isOfficial
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {product.authenticity.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <span className="font-bold text-emerald-700 block">Señales Positivas de Verificación:</span>
                  <ul className="space-y-1">
                    {product.authenticity.green_flags.map((flag, idx) => (
                      <li key={idx} className="flex items-center gap-1.5 text-gray-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-amber-700 block">Puntos de Atención / Advertencias:</span>
                  {product.authenticity.red_flags.length > 0 ? (
                    <ul className="space-y-1">
                      {product.authenticity.red_flags.map((flag, idx) => (
                        <li key={idx} className="flex items-center gap-1.5 text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500 italic">No se detectaron réplicas o distribuidores no autorizados.</p>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* PIE DE PÁGINA ACCIONES */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500 hidden sm:block">
            Collectibles Sourcing Intelligence V2 · Selección respaldada por algoritmo
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-xl border border-gray-300 transition-colors shadow-2xs"
            >
              Cerrar
            </button>

            {isPreorder ? (
              <button
                onClick={() => { onPublishPreorder(product); onClose(); }}
                disabled={!isOfficial || profitUsd <= 0}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Clock className="w-4 h-4" />
                <span>Publicar Pre-order</span>
              </button>
            ) : (
              <button
                onClick={() => { onImportProduct(product); onClose(); }}
                disabled={!isOfficial || profitUsd <= 0}
                className="px-5 py-2 bg-[#f00856] hover:bg-[#d0074a] disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Aprobar & Publicar</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

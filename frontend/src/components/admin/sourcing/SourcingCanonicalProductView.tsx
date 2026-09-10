import React, { useState } from 'react';
import type { CanonicalProductView, SourceOffer } from '../../../types/sourcing';
import { getCapabilityStatusBadge } from '../../../services/sourcing/retailerCapabilities';

interface Props {
  product: CanonicalProductView;
  onRefreshLiveCheck?: (source: string, productId: string) => Promise<void>;
  onSelectOffer?: (offer: SourceOffer) => void;
}

export const SourcingCanonicalProductView: React.FC<Props> = ({
  product,
  onRefreshLiveCheck,
  onSelectOffer
}) => {
  const [activeTab, setActiveTab] = useState<'new' | 'used' | 'history' | 'capabilities'>('new');
  const [loadingSource, setLoadingSource] = useState<string | null>(null);

  const handleLiveCheck = async (source: string, productId: string) => {
    if (!onRefreshLiveCheck) return;
    setLoadingSource(source);
    try {
      await onRefreshLiveCheck(source, productId);
    } finally {
      setLoadingSource(null);
    }
  };

  const renderOfferCard = (offer: SourceOffer, isBest: boolean) => {
    const isLive = offer.status === 'LIVE';
    const isResearchOnly = offer.status === 'RESEARCH_ONLY';
    const isNotConfigured = offer.status === 'PENDING_CREDENTIAL' || offer.status === 'PENDING_API';

    return (
      <div
        key={offer.id}
        className={`p-4 rounded-lg border transition-all ${
          isBest
            ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {offer.source}
            </span>
            {isBest && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500 text-white">
                BEST SOURCE V1
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${
                isLive
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : isResearchOnly
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {offer.status}
            </span>
          </div>

          {onRefreshLiveCheck && (
            <button
              onClick={() => handleLiveCheck(offer.source, offer.source_product_id)}
              disabled={loadingSource === offer.source}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 underline font-medium disabled:opacity-50"
            >
              {loadingSource === offer.source ? 'Comprobando...' : 'Live Check'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">Precio Origen</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              ${offer.price.toFixed(2)} {offer.currency}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">Shipping USA</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              ${(offer.usa_shipping_usd ?? offer.domestic_shipping).toFixed(2)} USD
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">Costo Puesto (Est.)</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {offer.landed_cost_usd ? `$${offer.landed_cost_usd.toFixed(2)} USD` : 'N/D'}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">Confiabilidad</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {offer.reliability_score}/100
            </span>
          </div>
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex justify-between">
            <span>Vendedor:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{offer.seller}</span>
          </div>
          {offer.delivery_min && offer.delivery_max && (
            <div className="flex justify-between">
              <span>Entrega estimada (Miami):</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {offer.delivery_min} a {offer.delivery_max}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Identificador:</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">{offer.source_product_id}</span>
          </div>
        </div>

        {onSelectOffer && (
          <button
            onClick={() => onSelectOffer(offer)}
            className="mt-3 w-full py-1.5 px-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium text-xs rounded hover:opacity-90 transition-opacity"
          >
            Seleccionar Oferta Activa
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm font-sans">
      {/* Header Canónico */}
      <div className="flex flex-col md:flex-row gap-6 mb-6">
        <div className="w-full md:w-48 h-48 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-2 overflow-hidden shrink-0">
          <img
            src={product.image_url || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400'}
            alt={product.title}
            className="max-h-full max-w-full object-contain"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded">
              {product.canonical_sku}
            </span>
            {product.match_reason && (
              <span className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded font-medium">
                {product.match_reason}
              </span>
            )}
            <span className="text-xs bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 px-2 py-0.5 rounded font-medium">
              Freshness: {product.freshness_status}
            </span>
          </div>

          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2 truncate">
            {product.title}
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-4 text-slate-600 dark:text-slate-400">
            <div><strong className="text-slate-900 dark:text-slate-200">Marca:</strong> {product.brand}</div>
            <div><strong className="text-slate-900 dark:text-slate-200">Licencia:</strong> {product.license}</div>
            {product.character && <div><strong className="text-slate-900 dark:text-slate-200">Personaje:</strong> {product.character}</div>}
            {product.upc && <div><strong className="text-slate-900 dark:text-slate-200">UPC:</strong> {product.upc}</div>}
            {product.mpn && <div><strong className="text-slate-900 dark:text-slate-200">MPN:</strong> {product.mpn}</div>}
            {product.asin && <div><strong className="text-slate-900 dark:text-slate-200">ASIN:</strong> {product.asin}</div>}
          </div>

          {/* Banner de Razón de Best Source */}
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-900 dark:text-emerald-200">
            <span className="font-bold">Mejor Fuente Determinística:</span> {product.best_source_reason}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4 mb-4">
        <button
          onClick={() => setActiveTab('new')}
          className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'new'
              ? 'border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Ofertas NUEVAS ({product.new_offers.length})
        </button>
        <button
          onClick={() => setActiveTab('used')}
          className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'used'
              ? 'border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Ofertas USADAS ({product.used_offers.length})
        </button>
        <button
          onClick={() => setActiveTab('capabilities')}
          className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'capabilities'
              ? 'border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Capabilities & Data Status
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'new' && (
        <div className="space-y-4">
          {product.new_offers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic py-4">
              No hay ofertas de condición NUEVA disponibles para este producto.
            </p>
          ) : (
            product.new_offers.map(offer =>
              renderOfferCard(offer, offer.id === product.best_source_offer?.id)
            )
          )}
        </div>
      )}

      {activeTab === 'used' && (
        <div className="space-y-4">
          {product.used_offers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic py-4">
              No se detectaron ofertas de condición USADA.
            </p>
          ) : (
            product.used_offers.map(offer =>
              renderOfferCard(offer, offer.id === product.best_source_offer?.id)
            )
          )}
        </div>
      )}

      {activeTab === 'capabilities' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['amazon', 'ebay', 'bestbuy'] as const).map(source => {
            const status = product.data_status[source];
            const caps = product.capabilities?.[source];
            const badge = caps ? getCapabilityStatusBadge(caps.search_status) : null;

            return (
              <div key={source} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm uppercase text-slate-800 dark:text-slate-200">{source}</h4>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800">
                    {status}
                  </span>
                </div>
                {caps && (
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <div>Status integrativo: <span className="font-semibold text-slate-900 dark:text-slate-100">{badge?.label}</span></div>
                    <div>Live Check: <span className="font-semibold">{caps.live_check_available ? 'Habilitado' : 'No configurado'}</span></div>
                    {caps.notes && <div className="mt-2 text-[11px] italic text-slate-500">{caps.notes}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

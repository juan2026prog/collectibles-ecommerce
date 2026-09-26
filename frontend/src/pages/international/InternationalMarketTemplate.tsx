// frontend/src/pages/international/InternationalMarketTemplate.tsx

import React from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useInternationalMarkets } from '../../hooks/useInternationalMarkets';
import MarketPreviewBanner from '../../components/international/MarketPreviewBanner';
import SEO from '../../components/SEO';
import Shop from '../Shop';
import { Globe, Plane, ShieldCheck, ArrowRight, Package } from 'lucide-react';

export default function InternationalMarketTemplate() {
  const { countryCode } = useParams<{ countryCode: string }>();
  const { getMarket, loading } = useInternationalMarkets();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const market = getMarket(countryCode || 'CL');

  // If market is DISABLED and not previewable, redirect
  if (market.isDisabled) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="inline-flex p-4 rounded-full bg-surface-800 text-surface-400 mb-4">
          <Globe className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Mercado {market.countryName} no disponible</h1>
        <p className="text-surface-400 mb-6">Este destino se encuentra temporalmente inactivo mientras preparamos la integración logística.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors">
          Volver a la tienda principal
        </Link>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={`Collectibles ${market.countryName} | Catálogo Internacional`}
        description={`Descubrí figuras, cómics y coleccionables internacionales con envíos directos a ${market.countryName}.`}
        noindex={market.isPreview} // Enforces noindex, nofollow on preview markets
      />

      {market.isPreview && <MarketPreviewBanner market={market} />}

      {/* Hero Header for Market */}
      <div className="bg-gradient-to-b from-surface-900 to-surface-950 border-b border-surface-800/80 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="text-5xl" role="img" aria-label={market.countryName}>{market.flag}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30">
                  {market.logisticsMode === 'SKYPOSTAL' ? 'SkyPostal Network' : 'Import Hub'}
                </span>
                <span className="text-xs text-surface-400 font-mono">
                  Moneda: {market.currency}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
                Collectibles {market.countryName}
              </h1>
              <p className="text-surface-400 text-sm max-w-xl mt-1">
                Accedé a miles de productos exclusivos de USA y Japón con gestión logística internacional integrada.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full md:w-auto text-xs">
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-800/60 border border-surface-700/50 text-surface-300">
              <Plane className="w-4 h-4 text-primary-400 shrink-0" />
              <span>Courier Directo</span>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-800/60 border border-surface-700/50 text-surface-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Aduana Garantizada</span>
            </div>
          </div>
        </div>
      </div>

      {/* Catalog listing */}
      <div className="py-6">
        <Shop isInternational={true} />
      </div>
    </>
  );
}

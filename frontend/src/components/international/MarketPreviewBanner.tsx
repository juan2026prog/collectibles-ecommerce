// frontend/src/components/international/MarketPreviewBanner.tsx

import React from 'react';
import { AlertTriangle, Eye, ShieldAlert } from 'lucide-react';
import { MarketResolution } from '../../lib/marketEngine/marketTypes';

interface MarketPreviewBannerProps {
  market: MarketResolution;
}

export default function MarketPreviewBanner({ market }: MarketPreviewBannerProps) {
  if (!market.isPreview) return null;

  return (
    <aside aria-label="Aviso de Modo Preview" className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 py-2.5 px-4 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs md:text-sm">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded bg-amber-500/20 text-amber-400">
            <Eye className="w-4 h-4" />
          </span>
          <span className="font-bold tracking-wide uppercase">
            PREVIEW MODE — {market.flag} {market.countryName.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-2 text-amber-200/90 font-medium">
          <ShieldAlert className="w-4 h-4 text-amber-400 hidden sm:inline" />
          <span>Modo de visualización interno. No se procesarán compras ni envíos reales.</span>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-[11px] bg-amber-950/60 px-2.5 py-0.5 rounded border border-amber-500/40 text-amber-300">
          <span>Logistics: <strong>{market.logisticsMode}</strong></span>
          <span>•</span>
          <span>Provider: <strong>{market.provider.toUpperCase()}</strong></span>
        </div>
      </div>
    </aside>
  );
}

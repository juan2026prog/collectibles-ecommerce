import React from 'react';
import { Store, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SoldByCardProps {
  vendorId?: string;
  vendorName?: string;
  vendorLogo?: string;
  vendorSlug?: string;
  badges?: any[];
}

export default function SoldByCard({ vendorId, vendorName, vendorLogo, vendorSlug, badges }: SoldByCardProps) {
  if (!vendorId && !vendorName) return null;

  const isPlatform = !vendorId || vendorId === 'platform';
  const name = isPlatform ? 'Collectibles.uy' : (vendorName || 'Vendedor Oficial');
  const isOfficial = badges?.some((b: any) => b.badge_key === 'official_store' || b.label?.toLowerCase().includes('oficial'));

  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-t border-white/10">
      <div className="flex items-center gap-3.5 min-w-0">
        {vendorLogo ? (
          <img src={vendorLogo} alt={name} className="w-9 h-9 rounded-xl object-contain bg-white p-1 border border-white/10 shrink-0 shadow-sm" />
        ) : (
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <Store className="w-4 h-4 text-[#f00856]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block leading-none mb-1">
            Vendido y despachado por
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {isPlatform ? (
              <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                Collectibles.uy
                <CheckCircle2 className="w-3.5 h-3.5 text-[#f00856] inline" />
              </span>
            ) : vendorSlug ? (
              <Link to={`/store/${vendorSlug}`} className="text-xs font-black text-white uppercase tracking-wider hover:text-[#f00856] transition-colors truncate">
                {name}
              </Link>
            ) : (
              <span className="text-xs font-black text-white uppercase tracking-wider truncate">{name}</span>
            )}

            {isOfficial && (
              <span className="text-[9px] px-2 py-0.5 font-black uppercase rounded bg-[#f00856] text-white tracking-wider">
                Tienda Oficial
              </span>
            )}
          </div>
        </div>
      </div>

      {!isPlatform && vendorSlug && (
        <Link 
          to={`/store/${vendorSlug}`} 
          className="text-xs font-bold text-slate-400 hover:text-[#f00856] transition-colors flex items-center gap-1 shrink-0 py-1"
        >
          <span>Ver tienda</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

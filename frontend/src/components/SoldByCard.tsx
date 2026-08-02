import React from 'react';
import { Store } from 'lucide-react';
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

  return (
    <div className="flex items-center justify-between gap-3 p-3 mt-4 bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-colors">
      <div className="flex items-center gap-3">
        {vendorLogo ? (
          <img src={vendorLogo} alt={vendorName} className="w-8 h-8 rounded-lg object-cover border border-white/10" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <Store className="w-4 h-4 text-slate-400" />
          </div>
        )}
        <div>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block leading-none">Vendido y despachado por</span>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {isPlatform ? (
              <span className="text-xs font-black text-white uppercase tracking-wider">Collectibles.uy</span>
            ) : (
              vendorSlug ? (
                <Link to={`/store/${vendorSlug}`} className="text-xs font-black text-[#f00856] uppercase tracking-wider hover:underline">
                  {vendorName}
                </Link>
              ) : (
                <span className="text-xs font-black text-[#f00856] uppercase tracking-wider">{vendorName}</span>
              )
            )}
            {badges && badges.length > 0 && (
              <div className="flex items-center gap-1">
                {badges.map((b: any) => (
                  <span key={b.id || b.badge_key} className={`text-[8px] px-1.5 py-0.5 font-semibold leading-none uppercase rounded ${b.color_class || 'bg-blue-600 text-white'}`} title={b.description}>
                    {b.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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

  const isPlatform = !vendorId || vendorId === 'platform' || vendorName === 'Collectibles';

  return (
    <div className="flex items-center gap-4 p-4 mt-4 bg-white/5 border border-white/10 rounded-2xl">
      {vendorLogo ? (
        <img src={vendorLogo} alt={vendorName} className="w-10 h-10 rounded-xl object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
          <Store className="w-5 h-5 text-slate-400" />
        </div>
      )}
      <div>
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Vendido y despachado por</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {isPlatform ? (
            <p className="text-sm font-black text-white uppercase tracking-wider">Collectibles.uy</p>
          ) : (
            vendorSlug ? (
              <Link to={`/store/${vendorSlug}`} className="text-sm font-black text-[#f00856] uppercase tracking-wider hover:underline">
                {vendorName}
              </Link>
            ) : (
               <p className="text-sm font-black text-white uppercase tracking-wider">{vendorName}</p>
            )
          )}
          {badges && badges.length > 0 && (
            <div className="flex items-center gap-1">
              {badges.map((b: any) => (
                <span key={b.id || b.badge_key} className={`text-[8px] px-1 font-semibold leading-none uppercase rounded ${b.color_class || 'bg-blue-600 text-white'}`} title={b.description}>
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

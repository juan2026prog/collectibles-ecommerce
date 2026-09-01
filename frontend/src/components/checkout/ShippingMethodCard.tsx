import React from 'react';
import { Store, Truck, Clock, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';

export interface ShippingMethodCardProps {
  id: string;
  name: string;
  description?: string;
  estimatedTime?: string;
  cost: number;
  isFree?: boolean;
  isSelected: boolean;
  isDisabled?: boolean;
  disabledReason?: string;
  badge?: 'GRATIS' | 'RECOMENDADO' | 'MÁS RÁPIDO' | 'PROMO' | 'NO DISPONIBLE';
  iconType?: 'pickup' | 'truck' | 'express' | 'dac' | 'manual';
  onSelect: () => void;
}

export const ShippingMethodCard: React.FC<ShippingMethodCardProps> = ({
  id,
  name,
  description,
  estimatedTime,
  cost,
  isFree = false,
  isSelected,
  isDisabled = false,
  disabledReason,
  badge,
  iconType = 'truck',
  onSelect,
}) => {
  const getIcon = () => {
    switch (iconType) {
      case 'pickup':
        return <Store className="w-5 h-5" />;
      case 'express':
        return <Sparkles className="w-5 h-5" />;
      case 'dac':
        return <Truck className="w-5 h-5" />;
      default:
        return <Truck className="w-5 h-5" />;
    }
  };

  const isActuallyFree = cost === 0 || isFree;

  return (
    <div
      onClick={() => !isDisabled && onSelect()}
      className={`
        relative p-4 rounded-xl border transition-all duration-200 cursor-pointer select-none
        ${isDisabled 
          ? 'bg-neutral-900/40 border-neutral-800/60 opacity-60 cursor-not-allowed' 
          : isSelected
          ? 'bg-neutral-900 border-[#f00856] shadow-lg shadow-[#f00856]/10 ring-1 ring-[#f00856]'
          : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
        }
      `}
    >
      <div className="flex items-start gap-3.5">
        {/* Radio indicator */}
        <div className="mt-0.5 flex-shrink-0">
          <div className={`
            w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-200
            ${isSelected 
              ? 'border-[#f00856] bg-[#f00856]' 
              : isDisabled
              ? 'border-neutral-700 bg-neutral-800'
              : 'border-neutral-600 bg-neutral-950'
            }
          `}>
            {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
        </div>

        {/* Icon */}
        <div className={`
          p-2.5 rounded-lg flex-shrink-0
          ${isSelected 
            ? 'bg-[#f00856]/20 text-[#f00856]' 
            : isDisabled
            ? 'bg-neutral-800 text-neutral-500'
            : 'bg-neutral-800/80 text-neutral-300'
          }
        `}>
          {getIcon()}
        </div>

        {/* Info Content */}
        <div className="flex-grow min-w-0 pr-2">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm md:text-base text-white tracking-tight">{name}</h4>
            
            {/* Badges */}
            {id === 'international_courier_direct' ? (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                SIN CARGO ADICIONAL
              </span>
            ) : isActuallyFree && !isDisabled ? (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                GRATIS
              </span>
            ) : null}
            {!isActuallyFree && badge && !isDisabled && id !== 'international_courier_direct' && (
              <span className={`
                text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider border
                ${badge === 'RECOMENDADO' ? 'bg-[#f00856]/20 text-[#f00856] border-[#f00856]/30' : ''}
                ${badge === 'MÁS RÁPIDO' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : ''}
                ${badge === 'PROMO' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : ''}
              `}>
                {badge}
              </span>
            )}
          </div>

          {description && (
            <p className="text-xs text-neutral-400 mb-1.5 leading-relaxed">{description}</p>
          )}

          {estimatedTime && !isDisabled && (
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-medium">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              <span>{estimatedTime}</span>
            </div>
          )}

          {isDisabled && disabledReason && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400/90 font-medium mt-1">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{disabledReason}</span>
            </div>
          )}
        </div>

        {/* Cost Display */}
        <div className="flex-shrink-0 text-right">
          {isDisabled ? (
            <span className="text-xs text-neutral-500 font-semibold">—</span>
          ) : id === 'international_courier_direct' ? (
            <div className="flex flex-col items-end">
              <span className="text-xs md:text-sm font-extrabold text-emerald-400">SIN CARGO</span>
              <span className="text-[9px] text-slate-400 font-medium">En Collectibles</span>
            </div>
          ) : isActuallyFree ? (
            <div className="flex flex-col items-end">
              <span className="text-sm md:text-base font-extrabold text-emerald-400">GRATIS</span>
              <span className="text-[10px] text-emerald-500/80 uppercase font-semibold">$0</span>
            </div>
          ) : (
            <span className="text-sm md:text-base font-extrabold text-white">
              ${cost.toLocaleString('es-UY')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShippingMethodCard;

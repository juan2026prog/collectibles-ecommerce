import React from 'react';
import { CreditCard, ShieldCheck, CheckCircle2, Lock } from 'lucide-react';

export interface PaymentMethodCardProps {
  id: string;
  title: string;
  description: string;
  badge?: string;
  isSelected: boolean;
  isDisabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
}

export const PaymentMethodCard: React.FC<PaymentMethodCardProps> = ({
  id,
  title,
  description,
  badge,
  isSelected,
  isDisabled = false,
  disabledReason,
  onSelect,
}) => {
  return (
    <div
      onClick={() => !isDisabled && onSelect()}
      className={`
        relative p-5 rounded-xl border transition-all duration-200 cursor-pointer select-none mb-3
        ${isDisabled 
          ? 'bg-neutral-900/40 border-neutral-800/60 opacity-60 cursor-not-allowed' 
          : isSelected
          ? 'bg-neutral-900 border-[#f00856] shadow-lg shadow-[#f00856]/10 ring-1 ring-[#f00856]'
          : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
        }
      `}
    >
      <div className="flex items-start gap-4">
        {/* Radio Indicator */}
        <div className="mt-1 flex-shrink-0">
          <div className={`
            w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-200
            ${isSelected 
              ? 'border-[#f00856] bg-[#f00856]' 
              : 'border-neutral-600 bg-neutral-950'
            }
          `}>
            {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base md:text-lg text-white tracking-tight">{title}</h4>
              {badge && (
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#f00856]/20 text-[#f00856] border border-[#f00856]/30 uppercase tracking-wider">
                  {badge}
                </span>
              )}
            </div>
            <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          </div>

          <p className="text-xs md:text-sm text-neutral-400 leading-relaxed">{description}</p>

          {/* Special gateway branding badges */}
          {id === 'mercadopago' && (
            <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-neutral-300">
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">Visa</span>
              <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">Mastercard</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">OCA</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">Abitab / Redpagos</span>
            </div>
          )}

          {id === 'paypal' && (
            <div className="flex items-center gap-2 mt-3 text-[11px] text-blue-400 font-semibold">
              <span>Acepta tarjetas internacionales USD</span>
            </div>
          )}

          {isDisabled && disabledReason && (
            <p className="text-xs text-amber-400 font-medium mt-2">{disabledReason}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodCard;

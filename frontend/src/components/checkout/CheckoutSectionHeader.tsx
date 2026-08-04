import React from 'react';

interface CheckoutSectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badgeText?: string;
}

export const CheckoutSectionHeader: React.FC<CheckoutSectionHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  badgeText,
}) => {
  return (
    <div className="mb-6 border-b border-neutral-800 pb-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="p-2.5 rounded-xl bg-[#f00856]/10 text-[#f00856] border border-[#f00856]/20">
            <Icon className="w-5 h-5 md:w-6 md:h-6" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">{title}</h2>
            {badgeText && (
              <span className="text-[10px] md:text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#f00856]/20 text-[#f00856] border border-[#f00856]/30 uppercase tracking-wider">
                {badgeText}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs md:text-sm text-neutral-400 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckoutSectionHeader;

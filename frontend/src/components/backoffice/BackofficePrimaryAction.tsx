import React, { ButtonHTMLAttributes, ComponentType } from 'react';

export interface BackofficePrimaryActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ComponentType<{ className?: string }>;
  variant?: 'admin' | 'operational' | 'affiliate' | 'artist' | 'portal';
  fullWidthOnMobile?: boolean;
}

export const BackofficePrimaryAction: React.FC<BackofficePrimaryActionProps> = ({
  children,
  icon: Icon,
  variant = 'admin',
  fullWidthOnMobile = true,
  className = '',
  disabled,
  ...props
}) => {
  const isOperational = variant === 'operational';

  const baseClasses = `font-bold text-xs sm:text-sm rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${
    fullWidthOnMobile ? 'w-full sm:w-auto' : ''
  }`;

  const variantClasses = isOperational
    ? 'bg-[#f00856] hover:bg-[#ff2c68] text-white min-h-[48px] px-5 py-2.5 shadow-md shadow-pink-500/20 text-sm'
    : 'bg-gray-900 hover:bg-black text-white min-h-[44px] px-4 py-2 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100';

  return (
    <button
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {Icon && <Icon className={`shrink-0 ${isOperational ? 'w-4 h-4' : 'w-4 h-4'}`} />}
      <span className="truncate">{children}</span>
    </button>
  );
};

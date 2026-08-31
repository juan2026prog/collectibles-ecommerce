import React, { ReactNode } from 'react';

export interface BackofficeSectionProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const BackofficeSection: React.FC<BackofficeSectionProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
}) => {
  return (
    <section className={`space-y-3 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div>
            {title && <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
};

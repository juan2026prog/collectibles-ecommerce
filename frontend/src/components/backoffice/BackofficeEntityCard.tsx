import React, { ReactNode } from 'react';

export interface BackofficeEntityCardProps {
  header?: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  variant?: 'admin' | 'operational' | 'affiliate' | 'artist' | 'portal';
  className?: string;
}

export const BackofficeEntityCard: React.FC<BackofficeEntityCardProps> = ({
  header,
  body,
  footer,
  onClick,
  variant = 'admin',
  className = '',
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2 shadow-2xs min-w-0 transition-colors ${
        onClick ? 'cursor-pointer hover:border-gray-300 dark:hover:border-gray-600' : ''
      } ${className}`}
    >
      {header && <div className="flex items-center justify-between gap-2 min-w-0">{header}</div>}
      {body && <div className="min-w-0">{body}</div>}
      {footer && (
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 dark:border-gray-700/60 min-w-0">
          {footer}
        </div>
      )}
    </div>
  );
};
